"""
Grabación en vivo → STT (Azure Speech) + síntesis de Temas (Claude).

- No almacena audio; solo texto de transcripción y JSON de temas propuestos.
- NO genera compromisos (permanecen 100% manuales).
- Síntesis de Temas solo por checkpoints manuales (botón Actualizar), nunca periódica.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

import httpx
from fastapi import HTTPException

_log = logging.getLogger("claracore.acta_grabacion_live")

MAX_TRANSCRIPT_CHARS = 80_000
MAX_DELTA_CHARS = 8_000
MAX_AUDIO_BYTES = 4_500_000  # ~4.5 MB por chunk
# Umbral mínimo de caracteres nuevos en el tramo para invocar IA.
TRAMO_MIN_CHARS = 40
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
    merged, _ = append_transcript_tracking_checkpoint(existing, delta, 0)
    return merged


def append_transcript_tracking_checkpoint(
    existing: str,
    delta: str,
    checkpoint_chars: int,
) -> Tuple[str, int]:
    """Une delta al transcript y ajusta el checkpoint si hay truncado por la izquierda."""
    base = (existing or "").rstrip()
    add = (delta or "").strip()
    try:
        cp = max(0, int(checkpoint_chars or 0))
    except (TypeError, ValueError):
        cp = 0
    if not add:
        merged = base[:MAX_TRANSCRIPT_CHARS]
        return merged, min(cp, len(merged))
    merged_full = add if not base else f"{base} {add}"
    if len(merged_full) <= MAX_TRANSCRIPT_CHARS:
        return merged_full, min(cp, len(merged_full))
    merged = merged_full[-MAX_TRANSCRIPT_CHARS:]
    dropped = len(merged_full) - len(merged)
    return merged, max(0, cp - dropped)


def tramo_desde_checkpoint(transcripcion: str, checkpoint_chars: int) -> str:
    text = transcripcion or ""
    try:
        cp = max(0, int(checkpoint_chars or 0))
    except (TypeError, ValueError):
        cp = 0
    if cp > len(text):
        cp = len(text)
    return text[cp:].strip()


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
    *,
    solo_tramo: bool = False,
) -> list[dict]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no está configurada.")
    texto = (transcripcion or "").strip()
    if len(texto) < TRAMO_MIN_CHARS:
        return _normalize_temas(temas_previos)

    import anthropic

    model = (
        os.getenv("ACTA_GRABACION_IA_MODEL")
        or os.getenv("ANTHROPIC_MODEL")
        or "claude-haiku-4-5"
    ).strip()
    prev_json = json.dumps(temas_previos or [], ensure_ascii=False)
    if len(texto) > 14_000:
        texto = texto[-14_000:]

    system = (
        "Eres Clara, redactora de actas de obra pública en ClaraCore. "
        "Tu salida es SOLO JSON válido, sin markdown ni explicaciones."
    )
    if solo_tramo:
        user = (
            "Analiza ÚNICAMENTE el siguiente TRAMO NUEVO de transcripción de una reunión "
            "(audio desde el último checkpoint hasta ahora). Sintetiza las IDEAS CENTRALES "
            "como Temas del acta. NO hagas dictado literal. NO inventes compromisos ni tareas. "
            "Si hay temas previos, reutiliza su 'clave' y refínalos solo cuando este tramo "
            "los desarrolle; agrega claves nuevas solo para ideas nuevas de este tramo. "
            "No reescribas temas previos que no se mencionen en el tramo.\n\n"
            f"Formato exacto:\n"
            f'{{"temas":[{{"clave":"t1","titulo":"…","texto":"…","interviniente":null}}]}}\n'
            f"Máximo {MAX_TEMAS} temas. Español formal. "
            f"'interviniente' solo si se identifica con claridad (nombre/entidad); si no, null.\n\n"
            f"Temas previos (contexto, no reprocesar):\n{prev_json}\n\n"
            f"Tramo nuevo a analizar:\n{texto}"
        )
    else:
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


def _merge_temas_por_clave(previos: list[dict], nuevos: list[dict]) -> list[dict]:
    """Fusiona por clave: actualiza existentes y agrega nuevos; conserva previos no tocados."""
    by_clave: dict[str, dict] = {}
    order: list[str] = []
    for t in previos or []:
        k = str(t.get("clave") or "").strip()
        if not k:
            continue
        by_clave[k] = dict(t)
        order.append(k)
    for t in nuevos or []:
        k = str(t.get("clave") or "").strip()
        if not k:
            continue
        if k in by_clave:
            merged = {**by_clave[k], **t}
            by_clave[k] = merged
        else:
            by_clave[k] = dict(t)
            order.append(k)
    return _normalize_temas([by_clave[k] for k in order if k in by_clave])


def _live_payload(
    sesion: dict,
    *,
    sintetizado: bool = False,
    delta: str = "",
    detalle: Optional[str] = None,
) -> dict:
    out = {
        "sesion_id": sesion.get("id"),
        "estado": sesion.get("estado"),
        "transcripcion_chars": len(sesion.get("transcripcion") or ""),
        "delta_chars": len(delta or ""),
        "temas": _normalize_temas(sesion.get("temas_propuestos")),
        "sintetizado": bool(sintetizado),
        "ultima_sintesis_en": sesion.get("ultima_sintesis_en"),
        "checkpoint_chars": int(sesion.get("checkpoint_chars") or 0),
        "temas_escucha_activa": bool(sesion.get("temas_escucha_activa")),
        "stt": speech_status(),
    }
    if detalle:
        out["detalle"] = detalle
    return out


def _patch_sesion(sb: Any, sesion_id: int, patch: dict) -> None:
    payload = {**patch, "updated_at": _now_iso()}
    sb.table("acta_grabacion_sesion").update(payload).eq("id", int(sesion_id)).execute()


async def ingest_transcript_delta(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    texto_delta: str,
    *,
    forzar_sintesis: bool = False,
) -> dict:
    """Acumula transcripción. No sintetiza Temas (eso es solo vía Actualizar)."""
    del forzar_sintesis  # legado: la síntesis automática quedó deshabilitada
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    delta = (texto_delta or "").strip()[:MAX_DELTA_CHARS]
    if not delta:
        return _live_payload(sesion)

    prev = sesion.get("transcripcion") or ""
    cp = int(sesion.get("checkpoint_chars") or 0)
    merged, new_cp = append_transcript_tracking_checkpoint(prev, delta, cp)
    patch = {"transcripcion": merged, "checkpoint_chars": new_cp}
    _patch_sesion(sb, sesion_id, patch)
    sesion["transcripcion"] = merged
    sesion["checkpoint_chars"] = new_cp
    return _live_payload(sesion, sintetizado=False, delta=delta)


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
    del forzar_sintesis
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    if not speech_configured():
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
    )


def armar_checkpoint_temas(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
) -> dict:
    """Checkpoint inicial: a partir de ahora se escucha el audio para Temas (sin sintetizar)."""
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    trans = sesion.get("transcripcion") or ""
    cp = len(trans)
    patch = {
        "checkpoint_chars": cp,
        "temas_escucha_activa": True,
    }
    _patch_sesion(sb, sesion_id, patch)
    sesion["checkpoint_chars"] = cp
    sesion["temas_escucha_activa"] = True
    return _live_payload(
        sesion,
        detalle="Checkpoint de Temas armado. Pulse Actualizar para analizar el audio nuevo.",
    )


async def actualizar_temas_desde_checkpoint(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
) -> dict:
    """Analiza el tramo desde el checkpoint vigente hasta ahora y avanza el checkpoint."""
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    if not sesion.get("temas_escucha_activa"):
        # Primer Actualizar sin armado explícito: arma al inicio del tramo actual (0..ahora no).
        # Mejor: armar checkpoint en el punto actual y no sintetizar aún (sin tramo nuevo).
        # Si el usuario pulsa Actualizar sin haber pasado por Compromisos, arma y analiza desde 0.
        trans0 = sesion.get("transcripcion") or ""
        if not trans0.strip():
            return _live_payload(
                sesion,
                detalle="Aún no hay transcripción. Continúe la reunión y pulse Actualizar de nuevo.",
            )
        _patch_sesion(sb, sesion_id, {
            "checkpoint_chars": 0,
            "temas_escucha_activa": True,
        })
        sesion["checkpoint_chars"] = 0
        sesion["temas_escucha_activa"] = True

    trans = sesion.get("transcripcion") or ""
    cp = int(sesion.get("checkpoint_chars") or 0)
    tramo = tramo_desde_checkpoint(trans, cp)
    if len(tramo) < TRAMO_MIN_CHARS:
        return _live_payload(
            sesion,
            sintetizado=False,
            detalle="No hay audio nuevo suficiente desde el último checkpoint.",
        )

    prev_temas = _normalize_temas(sesion.get("temas_propuestos"))
    nuevos = await sintetizar_temas(tramo, prev_temas, solo_tramo=True)
    merged = _merge_temas_por_clave(prev_temas, nuevos)
    now = _now_iso()
    new_cp = len(trans)
    _patch_sesion(sb, sesion_id, {
        "temas_propuestos": merged,
        "ultima_sintesis_en": now,
        "checkpoint_chars": new_cp,
        "temas_escucha_activa": True,
    })
    sesion["temas_propuestos"] = merged
    sesion["ultima_sintesis_en"] = now
    sesion["checkpoint_chars"] = new_cp
    sesion["temas_escucha_activa"] = True
    return _live_payload(sesion, sintetizado=True, delta=tramo)


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
