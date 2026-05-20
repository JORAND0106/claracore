"""
Servicio AVI — lógica de negocio desacoplada del router HTTP.

Responsabilidades:
  - Cliente AsyncAnthropic (singleton por proceso)
  - Límite diario de mensajes (tabla avi_uso_diario en Supabase)
  - Validación y construcción de mensajes (texto + imagen)
  - Llamada a la API de Anthropic con prompt caching
  - Registro asíncrono best-effort de conversaciones
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from datetime import date
from typing import Any

import anthropic
from fastapi import HTTPException

from avi_prompt import build_avi_system_blocks

_log = logging.getLogger("uvicorn.error")

# ── Constantes AVI ────────────────────────────────────────────────────────────

AVI_MODEL = "claude-haiku-4-5-20251001"
AVI_MAX_TOKENS = 1024

# Default 50; configurable con AVI_DAILY_LIMIT en .env
def _avi_daily_limit() -> int:
    try:
        return max(1, int(os.getenv("AVI_DAILY_LIMIT", "50")))
    except ValueError:
        return 50


# ── Cliente Anthropic (singleton async) ──────────────────────────────────────

_avi_client: anthropic.AsyncAnthropic | None = None


def _get_avi_client() -> anthropic.AsyncAnthropic:
    global _avi_client
    if _avi_client is None:
        api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="ANTHROPIC_API_KEY no está configurada en el servidor.",
            )
        _avi_client = anthropic.AsyncAnthropic(api_key=api_key)
    return _avi_client


# ── Límite diario (Supabase — opción B) ──────────────────────────────────────

async def verificar_y_registrar_uso(usuario_id: str, supabase_client: Any) -> int:
    """
    Comprueba y registra un mensaje AVI del usuario para hoy.

    - Si el usuario ya alcanzó AVI_DAILY_LIMIT hoy → HTTPException 429.
    - Si no, incrementa (o crea) el contador en avi_uso_diario.
    - Retorna los mensajes_restantes_hoy tras el incremento.

    La lectura y escritura son dos operaciones independientes (no transaccional).
    Para este caso de uso (un solo usuario, tasa baja) la ventana de carrera es
    aceptable: si ocurre, el usuario podría enviar un mensaje extra hoy.
    """
    limit = _avi_daily_limit()
    today = str(date.today())

    try:
        resultado = (
            supabase_client
            .table("avi_uso_diario")
            .select("conteo")
            .eq("usuario_id", usuario_id)
            .eq("fecha", today)
            .execute()
        )
    except Exception as exc:
        _log.error("AVI uso_diario SELECT: %s", exc)
        # Fallo de BD: dejar pasar antes que bloquear al usuario por error de infraestructura
        return _avi_daily_limit()

    if resultado.data:
        conteo_actual = resultado.data[0]["conteo"]
        if conteo_actual >= limit:
            raise HTTPException(
                status_code=429,
                detail="Hoy ya usaste todas tus consultas. Mañana tienes más cupo.",
            )
        nuevo_conteo = conteo_actual + 1
        try:
            supabase_client.table("avi_uso_diario").update(
                {"conteo": nuevo_conteo}
            ).eq("usuario_id", usuario_id).eq("fecha", today).execute()
        except Exception as exc:
            _log.error("AVI uso_diario UPDATE: %s", exc)
    else:
        nuevo_conteo = 1
        try:
            supabase_client.table("avi_uso_diario").insert(
                {"usuario_id": usuario_id, "fecha": today, "conteo": 1}
            ).execute()
        except Exception as exc:
            _log.error("AVI uso_diario INSERT: %s", exc)

    return max(0, limit - nuevo_conteo)


# ── Validación de imagen ──────────────────────────────────────────────────────

# (bytes_inicio, longitud, media_type)  — WEBP se detecta de forma especial.
_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
]


def _validar_imagen(imagen_base64: str) -> tuple[str, str]:
    """
    Decodifica base64 (strip de data-URL si aplica), valida magic bytes.
    Retorna (base64_limpio, media_type).
    Lanza HTTPException 400 si el formato es inválido o desconocido.
    """
    b64_clean = imagen_base64.split(",", 1)[1] if "," in imagen_base64 else imagen_base64
    # Padding defensivo
    padding = 4 - len(b64_clean) % 4
    if padding != 4:
        b64_clean += "=" * padding

    try:
        raw = base64.b64decode(b64_clean, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen no válida: base64 malformado.")

    for magic, media_type in _MAGIC:
        if raw[: len(magic)] == magic:
            return b64_clean, media_type

    # WEBP: RIFF????WEBP
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return b64_clean, "image/webp"

    raise HTTPException(
        status_code=400,
        detail="Imagen no válida: formato no reconocido. Use JPEG, PNG, GIF o WebP.",
    )


# ── Construcción de mensajes ──────────────────────────────────────────────────

def construir_messages(
    mensaje: str,
    historial: list[dict],
    imagen_base64: str | None,
) -> tuple[list[dict], bool]:
    """
    Construye la lista de mensajes para la API de Anthropic.

    - Historial: máximo los últimos 10 intercambios (roles 'user'/'assistant').
    - Si hay imagen: el mensaje actual es un content block multimodal.
    - Retorna (messages, tiene_imagen) para que el router sepa si hubo imagen.
    """
    messages: list[dict] = []

    for turno in historial[-10:]:
        role = turno.get("role", "")
        content = turno.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    if imagen_base64:
        b64_clean, media_type = _validar_imagen(imagen_base64)
        content_actual: Any = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": b64_clean,
                },
            },
            {"type": "text", "text": mensaje},
        ]
        tiene_imagen = True
    else:
        content_actual = mensaje
        tiene_imagen = False

    messages.append({"role": "user", "content": content_actual})
    return messages, tiene_imagen


# ── Error Anthropic → HTTPException ──────────────────────────────────────────

def _traducir_error_anthropic(exc: BaseException) -> None:
    """
    Registra el error técnico en el log y lanza siempre HTTP 502 con mensaje amable.
    El usuario nunca ve detalles internos de Anthropic.
    """
    _log.error("AVI Anthropic error: %s", exc)
    low = str(exc).lower()

    if (
        "credit balance" in low
        or "too low to access" in low
        or "purchase credits" in low
        or ("billing" in low and "upgrade" in low)
    ):
        _log.error("AVI: saldo insuficiente en cuenta Anthropic.")

    if "not_found_error" in low and "model" in low:
        _log.error("AVI: modelo '%s' no encontrado en Anthropic.", AVI_MODEL)

    raise HTTPException(
        status_code=502,
        detail="AVI no está disponible en este momento. Intenta en un momentico.",
    )


# ── Llamada a la API de Anthropic ────────────────────────────────────────────

async def llamar_avi(
    mensaje: str,
    modulo_actual: str,
    historial: list[dict],
    imagen_base64: str | None,
) -> tuple[str, bool, int, int]:
    """
    Llama a Claude Haiku con prompt caching en el system prompt.

    Retorna (respuesta_texto, tiene_imagen, tokens_input, tokens_output).
    Lanza HTTPException 400 si la imagen es inválida, 502 si Anthropic falla.
    """
    client = _get_avi_client()
    messages, tiene_imagen = construir_messages(mensaje, historial, imagen_base64)
    system_blocks = build_avi_system_blocks(modulo_actual)

    try:
        resp = await client.messages.create(
            model=AVI_MODEL,
            max_tokens=AVI_MAX_TOKENS,
            system=system_blocks,      # type: ignore[arg-type]
            messages=messages,         # type: ignore[arg-type]
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        _traducir_error_anthropic(exc)

    texto = resp.content[0].text if resp.content else ""
    tokens_in = resp.usage.input_tokens
    tokens_out = resp.usage.output_tokens

    return texto, tiene_imagen, tokens_in, tokens_out


# ── Registro asíncrono best-effort ───────────────────────────────────────────

async def registrar_conversacion(
    usuario_id: str,
    modulo: str,
    pregunta: str,
    respuesta: str,
    tiene_imagen: bool,
    tokens_input: int,
    tokens_output: int,
    supabase_client: Any,
) -> None:
    """
    Inserta una fila en avi_conversaciones.

    Diseñado para llamarse con asyncio.create_task() desde el router:
    nunca propaga excepciones hacia el llamador.
    """
    try:
        supabase_client.table("avi_conversaciones").insert({
            "usuario_id": usuario_id,
            "modulo": modulo,
            "pregunta": pregunta[:4000],        # tope defensivo
            "respuesta": respuesta[:8000],
            "tiene_imagen": tiene_imagen,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
        }).execute()
    except Exception as exc:
        _log.warning("AVI: no se pudo registrar conversación (best-effort) — %s", exc)
