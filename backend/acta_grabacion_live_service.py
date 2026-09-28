"""
Grabación en vivo → STT (Azure Speech sobre audio real) + síntesis de Temas (Claude).

- Fuente de verdad: audio de MediaRecorder → Azure Speech (no Web Speech del navegador).
- Checkpoints de Temas: automáticos (~5 min en cliente), manuales (Actualizar) y al detener.
- Cada tramo se registra con estado (listo/error) para reintento sin perder orden.
- Continuidad: cola del tramo anterior + temas previos para unificar ideas partidas.
- NO genera compromisos (permanecen 100% manuales).
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

import httpx
from fastapi import HTTPException

_log = logging.getLogger("claracore.acta_grabacion_live")

MAX_TRANSCRIPT_CHARS = 80_000
MAX_DELTA_CHARS = 8_000
MAX_AUDIO_BYTES = 4_500_000  # ~4.5 MB por chunk
# Umbral mínimo de caracteres nuevos en el tramo para invocar IA.
TRAMO_MIN_CHARS = 40
# Solape con el tramo anterior para conectar ideas partidas en el corte.
COLA_OVERLAP_CHARS = 600
MAX_TEMAS = 12
MAX_TRAMO_INTENTOS = 5

_LIVE_COLS = (
    "transcripcion",
    "temas_propuestos",
    "ultima_sintesis_en",
    "checkpoint_chars",
    "temas_escucha_activa",
)
_live_schema_ok: Optional[bool] = None

MSG_SCHEMA_LIVE = (
    "Faltan columnas de grabación en vivo en acta_grabacion_sesion "
    "(p. ej. transcripcion). Ejecute en Supabase el script "
    "backend/sql/ops_fix_pgrst_diagnostico_tres_errores.sql "
    "(o ops_acta_grabacion_live_columns.sql) y reintente."
)


def _is_missing_live_column_error(exc: BaseException) -> bool:
    msg = str(exc) or ""
    low = msg.lower()
    if "pgrst204" in low:
        return True
    if "could not find" in low and "acta_grabacion_sesion" in low:
        return True
    for col in _LIVE_COLS:
        if col in low and ("column" in low or "schema cache" in low):
            return True
    # APIError de postgrest a veces expone .code / .message
    code = getattr(exc, "code", None) or getattr(exc, "args", [None])[0]
    if code == "PGRST204":
        return True
    if isinstance(code, dict) and code.get("code") == "PGRST204":
        return True
    return False


def _try_reload_postgrest_schema(sb: Any) -> bool:
    try:
        sb.rpc("sicoe_reload_postgrest_schema").execute()
        return True
    except Exception:
        pass
    try:
        sb.rpc("pg_notify", {"channel": "pgrst", "payload": "reload schema"}).execute()
        return True
    except Exception:
        return False


def _probe_live_columns(sb: Any) -> bool:
    """True si PostgREST acepta un update vacío de las columnas live (probe barato vía select)."""
    try:
        sb.table("acta_grabacion_sesion").select(
            "id,transcripcion,temas_propuestos,ultima_sintesis_en,checkpoint_chars,temas_escucha_activa"
        ).limit(1).execute()
        return True
    except Exception as exc:
        if _is_missing_live_column_error(exc):
            return False
        # Error ambiguo (RLS, red): no bloquear grabación.
        _log.warning("probe live columns ambiguo: %s", exc)
        return True


def ensure_live_columns(sb: Any, *, force: bool = False) -> bool:
    """Confirma columnas live; intenta reload de schema cache si faltan."""
    global _live_schema_ok
    if not force and _live_schema_ok is True:
        return True
    if _probe_live_columns(sb):
        _live_schema_ok = True
        return True
    if _try_reload_postgrest_schema(sb):
        try:
            import time as _time
            _time.sleep(0.2)
        except Exception:
            pass
        if _probe_live_columns(sb):
            _live_schema_ok = True
            return True
    _live_schema_ok = False
    return False


def _require_live_columns(sb: Any) -> None:
    if ensure_live_columns(sb):
        return
    raise HTTPException(status_code=503, detail=MSG_SCHEMA_LIVE)


def speech_configured() -> bool:
    return bool((os.getenv("AZURE_SPEECH_KEY") or "").strip())


def speech_status() -> dict:
    region = (os.getenv("AZURE_SPEECH_REGION") or "eastus").strip() or "eastus"
    azure = speech_configured()
    return {
        "stt_disponible": azure,
        "stt_proveedor": "azure" if azure else "none",
        "region": region if azure else None,
        # Temas largos requieren Azure sobre el audio real; Web Speech queda deprecado.
        "acepta_transcripcion_cliente": False,
        "sintesis_con_ia": bool((os.getenv("ANTHROPIC_API_KEY") or "").strip()),
        "checkpoint_auto_segundos": 300,
        "detalle": None if azure else (
            "Configure AZURE_SPEECH_KEY para transcribir el audio real de la reunión. "
            "El reconocimiento del navegador ya no se usa para Temas."
        ),
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
    *,
    raise_on_error: bool = False,
) -> str:
    """
    Transcribe un fragmento de audio real (MediaRecorder) con Azure AI Speech.
    Modo conversation / español; adecuado para reuniones con varios interlocutores.
    """
    key = (os.getenv("AZURE_SPEECH_KEY") or "").strip()
    if not key:
        if raise_on_error:
            raise HTTPException(
                status_code=503,
                detail="AZURE_SPEECH_KEY no configurada. No se puede transcribir el audio real.",
            )
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
    params = {
        "language": language,
        "format": "detailed",
        "profanity": "raw",
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(url, params=params, headers=headers, content=audio_bytes)
        if res.status_code >= 400:
            msg = f"Azure STT HTTP {res.status_code}: {(res.text or '')[:240]}"
            _log.warning(msg)
            if raise_on_error:
                raise HTTPException(status_code=502, detail="No se pudo transcribir el audio con Azure Speech.")
            return ""
        data = res.json() if res.content else {}
        # detailed → NBest[0].Display; simple → DisplayText
        text = str(data.get("DisplayText") or data.get("Text") or "").strip()
        if not text:
            nbest = data.get("NBest") if isinstance(data, dict) else None
            if isinstance(nbest, list) and nbest:
                text = str(nbest[0].get("Display") or nbest[0].get("Lexical") or "").strip()
        status = str(data.get("RecognitionStatus") or "")
        if status and status not in ("Success", "InitialSilenceTimeout", "EndOfDictation") and not text:
            _log.warning("Azure STT RecognitionStatus=%s", status)
            if raise_on_error and status not in ("NoMatch", "InitialSilenceTimeout"):
                raise HTTPException(
                    status_code=502,
                    detail=f"Azure Speech no reconoció el audio ({status}).",
                )
        return text
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("Azure STT falló: %s", exc)
        if raise_on_error:
            raise HTTPException(status_code=502, detail="No se pudo transcribir el audio con Azure Speech.") from exc
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
    cola_previa: str = "",
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
    cola = (cola_previa or "").strip()
    if len(cola) > COLA_OVERLAP_CHARS:
        cola = cola[-COLA_OVERLAP_CHARS:]

    system = (
        "Eres Clara, redactora de actas de obra pública en ClaraCore. "
        "Tu salida es SOLO JSON válido, sin markdown ni explicaciones. "
        "Priorizas un informe ejecutivo coherente: ideas, decisiones y puntos relevantes. "
        "Nunca inventas compromisos ni tareas."
    )
    if solo_tramo:
        user = (
            "Analiza el TRAMO NUEVO de transcripción de una reunión (audio real). "
            "Sintetiza IDEAS CENTRALES como Temas del acta (informe ejecutivo, no dictado literal).\n\n"
            "CONTINUIDAD ENTRE TRAMOS (obligatorio):\n"
            "- Si la COLA DEL TRAMO ANTERIOR deja una idea inconclusa y el tramo nuevo la continúa, "
            "REUTILIZA la misma 'clave' del tema previo y completa/refina el texto (un solo tema unificado).\n"
            "- No crees un tema nuevo que duplique lo ya dicho en la cola o en temas previos.\n"
            "- No omitas contenido sustancial del tramo nuevo.\n"
            "- Frases partidas en el corte: únelas en el tema correspondiente.\n"
            "- Solo agrega claves nuevas para ideas genuinamente nuevas de este tramo.\n"
            "- Temas previos no mencionados en el tramo: no los reescribas.\n\n"
            f"Formato exacto:\n"
            f'{{"temas":[{{"clave":"t1","titulo":"…","texto":"…","interviniente":null}}]}}\n'
            f"Máximo {MAX_TEMAS} temas. Español formal. "
            f"'interviniente' solo si se identifica con claridad; si no, null.\n\n"
            f"Temas previos (contexto a reutilizar por clave):\n{prev_json}\n\n"
            f"Cola del tramo anterior (solo continuidad; no la dupliques como tema nuevo):\n"
            f"{cola or '(inicio de reunión / sin cola)'}\n\n"
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
        raise HTTPException(
            status_code=502,
            detail=(
                "No se pudo sintetizar los temas con IA. "
                "El tramo queda pendiente para reintento (el audio/transcripción no se pierde)."
            ),
        ) from exc


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


def _tramo_public(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "orden": int(row.get("orden") or 0),
        "origen": row.get("origen") or "auto",
        "estado": row.get("estado") or "pendiente",
        "chars_tramo": int(row.get("chars_tramo") or 0),
        "intentos": int(row.get("intentos") or 0),
        "error_detalle": row.get("error_detalle"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _listar_tramos(sb: Any, sesion_id: int) -> list[dict]:
    try:
        rows = (
            sb.table("acta_grabacion_tramo")
            .select("*")
            .eq("sesion_id", int(sesion_id))
            .order("orden")
            .execute()
            .data
            or []
        )
        return list(rows)
    except Exception as exc:
        _log.warning("listar tramos omitido: %s", exc)
        return []


def _siguiente_orden_tramo(sb: Any, sesion_id: int) -> int:
    rows = _listar_tramos(sb, sesion_id)
    if not rows:
        return 1
    return max(int(r.get("orden") or 0) for r in rows) + 1


def _cola_desde_tramos(tramos: list[dict], transcripcion: str, checkpoint_chars: int) -> str:
    """Cola del tramo anterior (solape) para continuidad de ideas partidas."""
    prev_ok = None
    for t in tramos or []:
        if (t.get("estado") or "") in ("listo", "error", "procesando") and (t.get("transcripcion") or "").strip():
            prev_ok = t
    if prev_ok and (prev_ok.get("transcripcion") or "").strip():
        txt = (prev_ok.get("transcripcion") or "").strip()
        return txt[-COLA_OVERLAP_CHARS:] if len(txt) > COLA_OVERLAP_CHARS else txt
    # Fallback: cola desde la transcripción acumulada justo antes del checkpoint.
    text = transcripcion or ""
    try:
        cp = max(0, int(checkpoint_chars or 0))
    except (TypeError, ValueError):
        cp = 0
    if cp <= 0:
        return ""
    start = max(0, cp - COLA_OVERLAP_CHARS)
    return text[start:cp].strip()


def _crear_tramo(sb: Any, sesion_id: int, payload: dict) -> Optional[dict]:
    try:
        rows = (
            sb.table("acta_grabacion_tramo")
            .insert(payload)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else {**payload, "id": None}
    except Exception as exc:
        _log.warning("crear tramo omitido: %s", exc)
        return None


def _patch_tramo(sb: Any, tramo_id: int, patch: dict) -> None:
    if tramo_id is None:
        return
    try:
        sb.table("acta_grabacion_tramo").update(
            {**patch, "updated_at": _now_iso()}
        ).eq("id", int(tramo_id)).execute()
    except Exception as exc:
        _log.warning("patch tramo %s omitido: %s", tramo_id, exc)


def _resumen_tramos(tramos: list[dict]) -> dict:
    counts = {"listo": 0, "procesando": 0, "pendiente": 0, "error": 0}
    for t in tramos or []:
        st = str(t.get("estado") or "pendiente")
        if st in counts:
            counts[st] += 1
        else:
            counts["pendiente"] += 1
    return counts


def _live_payload(
    sesion: dict,
    *,
    sintetizado: bool = False,
    delta: str = "",
    detalle: Optional[str] = None,
    tramos: Optional[list[dict]] = None,
    tramo_actual: Optional[dict] = None,
) -> dict:
    tramos_rows = tramos
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
        "ultimo_tramo_estado": sesion.get("ultimo_tramo_estado"),
        "tramos_error_count": int(sesion.get("tramos_error_count") or 0),
        "stt": speech_status(),
    }
    if tramos_rows is not None:
        out["tramos"] = [_tramo_public(t) for t in tramos_rows]
        out["tramos_resumen"] = _resumen_tramos(tramos_rows)
    if tramo_actual:
        out["tramo_actual"] = _tramo_public(tramo_actual)
    if detalle:
        out["detalle"] = detalle
    return out


def _patch_sesion(sb: Any, sesion_id: int, patch: dict) -> None:
    """Actualiza sesión; reintenta una vez tras reload si falta columna en schema cache."""
    global _live_schema_ok
    payload = {**patch, "updated_at": _now_iso()}
    try:
        sb.table("acta_grabacion_sesion").update(payload).eq("id", int(sesion_id)).execute()
        _live_schema_ok = True
        return
    except Exception as exc:
        if not _is_missing_live_column_error(exc):
            raise
        _live_schema_ok = False
        _log.warning("patch sesión live: columna ausente en schema cache (%s)", exc)
        if _try_reload_postgrest_schema(sb):
            try:
                import time as _time
                _time.sleep(0.2)
            except Exception:
                pass
            try:
                sb.table("acta_grabacion_sesion").update(payload).eq("id", int(sesion_id)).execute()
                _live_schema_ok = True
                return
            except Exception as exc2:
                _log.error("patch sesión live tras reload: %s", exc2)
                raise HTTPException(status_code=503, detail=MSG_SCHEMA_LIVE) from exc2
        raise HTTPException(status_code=503, detail=MSG_SCHEMA_LIVE) from exc


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

    # No tumbar la grabación (cupo + descarga) si falta la migración live.
    if not ensure_live_columns(sb):
        _log.error("ingest transcript omitido: %s", MSG_SCHEMA_LIVE)
        return {
            **_live_payload(sesion, sintetizado=False, delta=delta, detalle=MSG_SCHEMA_LIVE),
            "schema_live_ok": False,
        }

    prev = sesion.get("transcripcion") or ""
    cp = int(sesion.get("checkpoint_chars") or 0)
    merged, new_cp = append_transcript_tracking_checkpoint(prev, delta, cp)
    patch = {"transcripcion": merged, "checkpoint_chars": new_cp}
    try:
        _patch_sesion(sb, sesion_id, patch)
    except HTTPException as exc:
        if exc.status_code == 503:
            return {
                **_live_payload(sesion, sintetizado=False, delta=delta, detalle=MSG_SCHEMA_LIVE),
                "schema_live_ok": False,
            }
        raise
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
            "detalle": (
                "AZURE_SPEECH_KEY no configurada. "
                "Sin Azure Speech no se puede transcribir el audio real para Temas."
            ),
        }

    if not ensure_live_columns(sb):
        return {
            **_live_payload(sesion, sintetizado=False, detalle=MSG_SCHEMA_LIVE),
            "schema_live_ok": False,
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
    _require_live_columns(sb)
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
    tramos = _listar_tramos(sb, sesion_id)
    return _live_payload(
        sesion,
        tramos=tramos,
        detalle=(
            "Escucha de Temas activa. La plataforma generará checkpoints automáticos "
            "cada ~5 minutos; también puede pulsar Actualizar."
        ),
    )


async def _sintetizar_tramo_guardado(
    sb: Any,
    sesion: dict,
    tramo_row: dict,
    *,
    origen_reintento: bool = False,
) -> Tuple[dict, bool, Optional[str]]:
    """
    Sintetiza un tramo ya registrado. Avance de checkpoint ya ocurrió al crearlo.
    Devuelve (sesion_actualizada, sintetizado, detalle_error).
    """
    tramo_id = tramo_row.get("id")
    texto = (tramo_row.get("transcripcion") or "").strip()
    cola = (tramo_row.get("cola_previa") or "").strip()
    intentos = int(tramo_row.get("intentos") or 0) + 1

    if len(texto) < TRAMO_MIN_CHARS:
        _patch_tramo(sb, tramo_id, {
            "estado": "listo",
            "intentos": intentos,
            "error_detalle": None,
            "chars_tramo": len(texto),
        })
        return sesion, False, "Tramo demasiado corto; se marcó como listo sin cambios."

    if intentos > MAX_TRAMO_INTENTOS:
        _patch_tramo(sb, tramo_id, {
            "estado": "error",
            "intentos": intentos,
            "error_detalle": f"Se alcanzó el máximo de {MAX_TRAMO_INTENTOS} intentos.",
        })
        return sesion, False, f"Tramo #{tramo_row.get('orden')} agotó reintentos."

    _patch_tramo(sb, tramo_id, {
        "estado": "procesando",
        "intentos": intentos,
        "error_detalle": None,
        **({"origen": "reintento"} if origen_reintento else {}),
    })

    prev_temas = _normalize_temas(sesion.get("temas_propuestos"))
    try:
        nuevos = await sintetizar_temas(
            texto,
            prev_temas,
            solo_tramo=True,
            cola_previa=cola,
        )
    except HTTPException as exc:
        detail = str(exc.detail or "Error de síntesis")
        _patch_tramo(sb, tramo_id, {
            "estado": "error",
            "intentos": intentos,
            "error_detalle": detail[:500],
        })
        err_count = int(sesion.get("tramos_error_count") or 0) + 1
        _patch_sesion(sb, int(sesion["id"]), {
            "ultimo_tramo_estado": "error",
            "tramos_error_count": err_count,
            "temas_escucha_activa": True,
        })
        sesion["ultimo_tramo_estado"] = "error"
        sesion["tramos_error_count"] = err_count
        return sesion, False, detail
    except Exception as exc:
        detail = f"Error inesperado al sintetizar: {exc}"
        _patch_tramo(sb, tramo_id, {
            "estado": "error",
            "intentos": intentos,
            "error_detalle": detail[:500],
        })
        err_count = int(sesion.get("tramos_error_count") or 0) + 1
        _patch_sesion(sb, int(sesion["id"]), {
            "ultimo_tramo_estado": "error",
            "tramos_error_count": err_count,
            "temas_escucha_activa": True,
        })
        sesion["ultimo_tramo_estado"] = "error"
        sesion["tramos_error_count"] = err_count
        return sesion, False, detail

    merged = _merge_temas_por_clave(prev_temas, nuevos)
    now = _now_iso()
    _patch_tramo(sb, tramo_id, {
        "estado": "listo",
        "intentos": intentos,
        "error_detalle": None,
        "chars_tramo": len(texto),
    })
    _patch_sesion(sb, int(sesion["id"]), {
        "temas_propuestos": merged,
        "ultima_sintesis_en": now,
        "temas_escucha_activa": True,
        "ultimo_tramo_estado": "listo",
        "tramos_error_count": 0,
    })
    sesion["temas_propuestos"] = merged
    sesion["ultima_sintesis_en"] = now
    sesion["temas_escucha_activa"] = True
    sesion["ultimo_tramo_estado"] = "listo"
    sesion["tramos_error_count"] = 0
    tramo_row["estado"] = "listo"
    tramo_row["intentos"] = intentos
    return sesion, True, None


async def _procesar_tramos_pendientes(
    sb: Any,
    sesion: dict,
    *,
    max_tramos: int = 3,
) -> Tuple[dict, bool, Optional[str]]:
    """Reintenta en orden cronológico tramos en error/pendiente (no procesando)."""
    tramos = _listar_tramos(sb, int(sesion["id"]))
    pendientes = [
        t for t in tramos
        if (t.get("estado") or "") in ("error", "pendiente")
        and int(t.get("intentos") or 0) < MAX_TRAMO_INTENTOS
        and (t.get("transcripcion") or "").strip()
    ]
    sintetizado_any = False
    last_err = None
    for t in pendientes[:max_tramos]:
        sesion, ok, err = await _sintetizar_tramo_guardado(
            sb, sesion, t, origen_reintento=True,
        )
        if ok:
            sintetizado_any = True
        elif err:
            last_err = err
            # Preservar orden: no saltar al siguiente si este falló de nuevo.
            break
    return sesion, sintetizado_any, last_err


async def actualizar_temas_desde_checkpoint(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    *,
    origen: str = "manual",
) -> dict:
    """
    Procesa el tramo pendiente desde el último checkpoint (auto/manual/final).
    Primero drena fallos previos en orden; luego crea y sintetiza el tramo nuevo.
    """
    _require_live_columns(sb)
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    origen_norm = (origen or "manual").strip().lower()
    if origen_norm not in ("auto", "manual", "final", "reintento"):
        origen_norm = "manual"

    if not sesion.get("temas_escucha_activa"):
        trans0 = sesion.get("transcripcion") or ""
        if not trans0.strip():
            return _live_payload(
                sesion,
                tramos=_listar_tramos(sb, sesion_id),
                detalle="Aún no hay transcripción de Azure Speech. Continúe la reunión.",
            )
        _patch_sesion(sb, sesion_id, {
            "checkpoint_chars": 0,
            "temas_escucha_activa": True,
        })
        sesion["checkpoint_chars"] = 0
        sesion["temas_escucha_activa"] = True

    # 1) Reintentar fallos previos en orden (conexión de ideas no se rompe).
    sesion, synth_retry, err_retry = await _procesar_tramos_pendientes(sb, sesion)
    if err_retry and not synth_retry:
        tramos = _listar_tramos(sb, sesion_id)
        return _live_payload(
            sesion,
            sintetizado=False,
            tramos=tramos,
            detalle=(
                f"Hay un tramo pendiente por reintento: {err_retry}. "
                "Pulse Actualizar o Reintentar; el contenido no se perdió."
            ),
        )

    # 2) Tramo nuevo desde checkpoint.
    trans = sesion.get("transcripcion") or ""
    cp = int(sesion.get("checkpoint_chars") or 0)
    texto_tramo = tramo_desde_checkpoint(trans, cp)
    tramos = _listar_tramos(sb, sesion_id)

    if len(texto_tramo) < TRAMO_MIN_CHARS:
        detalle = (
            "Temas actualizados tras reintento."
            if synth_retry
            else "No hay audio nuevo suficiente desde el último checkpoint."
        )
        return _live_payload(
            sesion,
            sintetizado=synth_retry,
            tramos=tramos,
            detalle=detalle,
        )

    cola = _cola_desde_tramos(tramos, trans, cp)
    new_cp = len(trans)
    orden = _siguiente_orden_tramo(sb, sesion_id)
    tramo_payload = {
        "sesion_id": int(sesion_id),
        "orden": orden,
        "origen": origen_norm,
        "estado": "procesando",
        "checkpoint_inicio": cp,
        "checkpoint_fin": new_cp,
        "chars_tramo": len(texto_tramo),
        "cola_previa": cola or None,
        "transcripcion": texto_tramo,
        "error_detalle": None,
        "intentos": 0,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    tramo_row = _crear_tramo(sb, sesion_id, tramo_payload)
    if tramo_row is None:
        tramo_row = {**tramo_payload, "id": None}

    # Reclamar el tramo en el checkpoint aunque la síntesis falle (queda en el registro).
    _patch_sesion(sb, sesion_id, {
        "checkpoint_chars": new_cp,
        "temas_escucha_activa": True,
        "ultimo_tramo_estado": "procesando",
    })
    sesion["checkpoint_chars"] = new_cp
    sesion["temas_escucha_activa"] = True
    sesion["ultimo_tramo_estado"] = "procesando"

    sesion, ok, err = await _sintetizar_tramo_guardado(sb, sesion, tramo_row)
    tramos = _listar_tramos(sb, sesion_id)
    if not ok:
        return _live_payload(
            sesion,
            sintetizado=synth_retry,
            delta=texto_tramo,
            tramos=tramos,
            tramo_actual=tramo_row,
            detalle=(
                f"No se pudo sintetizar el tramo #{orden}. "
                f"Queda pendiente para reintento. {err or ''}"
            ).strip(),
        )

    return _live_payload(
        sesion,
        sintetizado=True,
        delta=texto_tramo,
        tramos=tramos,
        tramo_actual={**tramo_row, "estado": "listo"},
        detalle=f"Tramo #{orden} sintetizado ({origen_norm}).",
    )


async def reintentar_tramo(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    tramo_id: Optional[int] = None,
) -> dict:
    """Reintenta el tramo fallido más antiguo (o uno concreto) respetando el orden."""
    _require_live_columns(sb)
    sesion = _sesion_row(sb, sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_activa(sesion, contrato_id, usuario_id)

    tramos = _listar_tramos(sb, sesion_id)
    target = None
    if tramo_id is not None:
        for t in tramos:
            if int(t.get("id") or 0) == int(tramo_id):
                target = t
                break
        if not target:
            raise HTTPException(status_code=404, detail="Tramo no encontrado.")
        # No saltar fallos anteriores en el orden.
        for t in tramos:
            if int(t.get("orden") or 0) >= int(target.get("orden") or 0):
                break
            if (t.get("estado") or "") in ("error", "pendiente"):
                target = t
                break
    else:
        for t in tramos:
            if (t.get("estado") or "") in ("error", "pendiente"):
                target = t
                break

    if not target:
        return _live_payload(
            sesion,
            tramos=tramos,
            detalle="No hay tramos pendientes por reintento.",
        )

    sesion, ok, err = await _sintetizar_tramo_guardado(
        sb, sesion, target, origen_reintento=True,
    )
    tramos = _listar_tramos(sb, sesion_id)
    if not ok:
        return _live_payload(
            sesion,
            sintetizado=False,
            tramos=tramos,
            tramo_actual=target,
            detalle=err or "El reintento falló; el tramo sigue pendiente.",
        )
    return _live_payload(
        sesion,
        sintetizado=True,
        tramos=tramos,
        tramo_actual={**target, "estado": "listo"},
        detalle=f"Tramo #{target.get('orden')} reintentado con éxito.",
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
    tramos = _listar_tramos(sb, sesion_id)
    out = _live_payload(sesion, tramos=tramos)
    out["schema_live_ok"] = ensure_live_columns(sb)
    if not out["schema_live_ok"]:
        out["detalle"] = MSG_SCHEMA_LIVE
    return out
