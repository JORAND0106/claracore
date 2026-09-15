"""
Grabación en vivo → STT (Azure Speech) + síntesis de Temas (Claude).

- No almacena audio; solo texto de transcripción y JSON de temas propuestos.
- NO genera compromisos (permanecen 100% manuales).
- Síntesis periódica: ideas centrales, no dictado literal.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException

_log = logging.getLogger("claracore.acta_grabacion_live")

MAX_TRANSCRIPT_CHARS = 80_000
MAX_DELTA_CHARS = 8_000
MAX_AUDIO_BYTES = 4_500_000  # ~4.5 MB por chunk
SYNTHESIS_MIN_INTERVAL_SEC = 40
SYNTHESIS_MIN_NEW_CHARS = 350
MAX_TEMAS = 12


def speech_configured() -> bool:
    return bool((os.getenv("AZURE_SPEECH_KEY") or "").strip())


def speech_status() -> dict:
    region = (os.getenv("AZURE_SPEECH_REGION") or "eastus").strip() or "eastus"
    return {
        "stt_disponible": speech_configured(),
        "stt_proveedor": "azure" if speech_configured() else "none",
        "region": region if speech_configured() else None,
        "acepta_transcripcion_cliente": True,
        "sintesis_con_ia": bool((os.getenv("ANTHROPIC_API_KEY") or "").strip()),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sesion_row(sb: Any, sesion_id: int) -> Optional[dict]:
    rows = (
        sb.table("acta_grabacion_sesion")
        .select("*")
        .eq("id", int(sesion_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _assert_sesion_activa(sesion: dict, contrato_id: int, usuario_id: int) -> None:
    if int(sesion.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if int(sesion.get("usuario_id") or 0) != int(usuario_id):
        raise HTTPException(status_code=403, detail="Sesión de otro usuario.")
    if sesion.get("estado") != "activa":
        raise HTTPException(status_code=409, detail="La sesión de grabación ya no está activa.")


def _normalize_temas(raw: Any) -> list[dict]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    if not isinstance(raw, list):
        return []
    out = []
    for i, item in enumerate(raw[:MAX_TEMAS]):
        if not isinstance(item, dict):
            continue
        clave = str(item.get("clave") or f"t{i + 1}").strip()[:40] or f"t{i + 1}"
        titulo = str(item.get("titulo") or "").strip()[:120]
        texto = str(item.get("texto") or "").strip()[:4000]
        inter = item.get("interviniente")
        interviniente = str(inter).strip()[:120] if inter else None
        if not titulo and not texto:
            continue
        if not titulo and texto:
            titulo = texto.split(".")[0].strip()[:72] or f"Tema {i + 1}"
        out.append({
            "clave": clave,
            "titulo": titulo,
            "texto": texto or titulo,
            "interviniente": interviniente or None,
        })
    return out


def append_transcript(existing: str, delta: str) -> str:
    base = (existing or "").rstrip()
    add = (delta or "").strip()
    if not add:
        return base[:MAX_TRANSCRIPT_CHARS]
    if not base:
        merged = add
    else:
        merged = f"{base} {add}"
    if len(merged) > MAX_TRANSCRIPT_CHARS:
        merged = merged[-MAX_TRANSCRIPT_CHARS:]
    return merged


async def transcribe_audio_azure(
    audio_bytes: bytes,
    content_type: str = "audio/webm",
) -> str:
    key = (os.getenv("AZURE_SPEECH_KEY") or "").strip()
    if not key:
        return ""
    if not audio_bytes:
        return ""
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Chunk de audio demasiado grande.")

    region = (os.getenv("AZURE_SPEECH_REGION") or "eastus").strip() or "eastus"
    language = (os.getenv("AZURE_SPEECH_LANGUAGE") or "es-CO").strip() or "es-CO"
    url = (
        f"https://{region}.stt.speech.microsoft.com/"
        "speech/recognition/conversation/cognitiveservices/v1"
    )
    ct = (content_type or "audio/webm").split(";")[0].strip() or "audio/webm"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": ct,
        "Accept": "application/json",
    }
    params = {"language": language, "format": "simple"}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, params=params, headers=headers, content=audio_bytes)
        if res.status_code >= 400:
            _log.warning("Azure STT HTTP %s: %s", res.status_code, (res.text or "")[:300])
            return ""
        data = res.json() if res.content else {}
        text = str(data.get("DisplayText") or data.get("Text") or "").strip()
        return text
    except Exception as exc:
        _log.warning("Azure STT falló: %s", exc)
        return ""


def _parse_temas_json(raw: str) -> list[dict]:
    s = (raw or "").strip()
    if not s:
        return []
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, flags=re.IGNORECASE)
    if fence:
        s = fence.group(1).strip()
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", s)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    if isinstance(data, list):
        return _normalize_temas(data)
    if isinstance(data, dict):
        return _normalize_temas(data.get("temas") or data.get("ideas") or [])
    return []


async def sintetizar_temas(
    transcripcion: str,
    temas_previos: list[dict],
) -> list[dict]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no está configurada.")
    texto = (transcripcion or "").strip()
    if len(texto) < 40:
        return _normalize_temas(temas_previos)

    import anthropic

    model = (
        os.getenv("ACTA_GRABACION_IA_MODEL")
        or os.getenv("ANTHROPIC_MODEL")
        or "claude-haiku-4-5"
    ).strip()
    prev_json = json.dumps(temas_previos or [], ensure_ascii=False)
    # Usar cola de transcripción si es muy larga
    if len(texto) > 14_000:
        texto = texto[-14_000:]

    system = (
        "Eres Clara, redactora de actas de obra pública en ClaraCore. "
        "Tu salida es SOLO JSON válido, sin markdown ni explicaciones."
    )
    user = (
        "Analiza la transcripción parcial de una reunión y sintetiza las IDEAS CENTRALES "
        "como Temas del acta. NO hagas dictado literal. NO inventes compromisos ni tareas. "
        "Si hay temas previos, reutiliza su 'clave' y refínalos cuando la conversación los desarrolle; "
        "agrega claves nuevas solo para ideas nuevas.\n\n"
        f"Formato exacto:\n"
        f'{{"temas":[{{"clave":"t1","titulo":"…","texto":"…","interviniente":null}}]}}\n'
        f"Máximo {MAX_TEMAS} temas. Español formal. "
        f"'interviniente' solo si se identifica con claridad (nombre/entidad); si no, null.\n\n"
        f"Temas previos:\n{prev_json}\n\n"
        f"Transcripción acumulada:\n{texto}"
    )
    client = anthropic.AsyncAnthropic(api_key=api_key)
    try:
        msg = await client.messages.create(
            model=model,
            max_tokens=2500,
            temperature=0.2,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        parts = []
        for block in msg.content or []:
            txt = getattr(block, "text", None)
            if txt:
                parts.append(txt)
        return _normalize_temas(_parse_temas_json("\n".join(parts)))
    except HTTPException:
        raise
    except Exception as exc:
        _log.error("Síntesis de temas falló: %s", exc)
        raise HTTPException(status_code=502, detail="No se pudo sintetizar los temas con IA.") from exc


def _should_synthesize(sesion: dict, new_chars: int, force: bool) -> bool:
    if force:
        return True
    if new_chars <= 0 and not (sesion.get("transcripcion") or "").strip():
        return False
    trans = sesion.get("transcripcion") or ""
    if len(trans) < 80:
        return False
    last = sesion.get("ultima_sintesis_en")
    if not last:
        return len(trans) >= 120 or new_chars >= SYNTHESIS_MIN_NEW_CHARS
    try:
        if isinstance(last, str):
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
        else:
            last_dt = last
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - last_dt).total_seconds()
    except Exception:
        age = SYNTHESIS_MIN_INTERVAL_SEC + 1
    if age >= SYNTHESIS_MIN_INTERVAL_SEC and new_chars >= 80:
        return True
    if new_chars >= SYNTHESIS_MIN_NEW_CHARS:
        return True
    return False


def _patch_sesion(sb: Any, sesion_id: int, patch: dict) -> None:
    payload = {**patch, "updated_at": _now_iso()}
    sb.table("acta_grabacion_sesion").update(payload).eq("id", int(sesion_id)).execute()


def _live_payload(sesion: dict, *, sintetizado: bool = False, delta: str = "") -> dict:
    return {
        "sesion_id": sesion.get("id"),
        "estado": sesion.get("estado"),
        "transcripcion_chars": len(sesion.get("transcripcion") or ""),
        "delta_chars": len(delta or ""),
        "temas": _normalize_temas(sesion.get("temas_propuestos")),
        "sintetizado": bool(sintetizado),
        "ultima_sintesis_en": sesion.get("ultima_sintesis_en"),
        "stt": speech_status(),
    }


async def ingest_transcript_delta(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    texto_delta: str,
    *,
    forzar_sintesis: bool = False,
) -> dict:
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    delta = (texto_delta or "").strip()[:MAX_DELTA_CHARS]
    if not delta and not forzar_sintesis:
        return _live_payload(sesion)

    prev = sesion.get("transcripcion") or ""
    merged = append_transcript(prev, delta)
    new_chars = max(0, len(merged) - len(prev))
    sesion["transcripcion"] = merged
    _patch_sesion(sb, sesion_id, {"transcripcion": merged})

    sintetizado = False
    if _should_synthesize(sesion, new_chars, forzar_sintesis):
        temas = await sintetizar_temas(merged, _normalize_temas(sesion.get("temas_propuestos")))
        now = _now_iso()
        _patch_sesion(sb, sesion_id, {
            "temas_propuestos": temas,
            "ultima_sintesis_en": now,
        })
        sesion["temas_propuestos"] = temas
        sesion["ultima_sintesis_en"] = now
        sintetizado = True

    return _live_payload(sesion, sintetizado=sintetizado, delta=delta)


async def ingest_audio_chunk(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    audio_bytes: bytes,
    content_type: str = "audio/webm",
    *,
    forzar_sintesis: bool = False,
) -> dict:
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    if not speech_configured():
        # Sin Azure: el cliente puede enviar texto vía /transcripcion.
        return {
            **_live_payload(sesion),
            "stt_omitido": True,
            "detalle": "AZURE_SPEECH_KEY no configurada; use transcripción del navegador.",
        }

    text = await transcribe_audio_azure(audio_bytes, content_type=content_type)
    if not text:
        return _live_payload(sesion, sintetizado=False, delta="")
    return await ingest_transcript_delta(
        sb,
        contrato_id,
        sesion_id,
        usuario_id,
        text,
        forzar_sintesis=forzar_sintesis,
    )


def leer_estado_vivo(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
) -> dict:
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if int(sesion.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if int(sesion.get("usuario_id") or 0) != int(usuario_id):
        raise HTTPException(status_code=403, detail="Sesión de otro usuario.")
    return _live_payload(sesion)
