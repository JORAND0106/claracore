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

# Clara en actas (redacción de temas/compromisos): respuestas largas sin truncar.
# AVI chat sigue en AVI_MAX_TOKENS; síntesis de grabación tiene su propio tope.
def clara_acta_max_tokens() -> int:
    try:
        return max(1024, int(os.getenv("CLARA_ACTA_MAX_TOKENS", "8192")))
    except ValueError:
        return 8192


def clara_acta_max_input_chars() -> int:
    """Tope de entrada con holgura para devolver el texto completo (≈ 3 chars/token)."""
    try:
        env = int(os.getenv("CLARA_ACTA_MAX_INPUT_CHARS", "0") or "0")
    except ValueError:
        env = 0
    if env > 0:
        return max(2000, env)
    # ~2.5 chars/token de salida + margen: entrada no debe superar lo que cabe en una respuesta.
    return max(8000, int(clara_acta_max_tokens() * 2.5))


CLARA_ACTA_SYSTEM = (
    "Eres Clara, asistente de redacción de actas de obra pública en ClaraCore. "
    "Cumple la instrucción del usuario al pie de la letra. "
    "Si pide organizar, numerar o formatear sin cambiar ni sintetizar, conserva "
    "TODAS las frases, datos, cifras y nombres; solo cambia la estructura "
    "(por ejemplo numerales o viñetas). "
    "Devuelve únicamente el texto pedido, sin preámbulos, sin comillas y sin explicaciones."
)


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

def mensaje_error_anthropic_usuario(
    exc: BaseException,
    *,
    producto: str = "Clara",
    model: str | None = None,
) -> str:
    """
    Aviso breve para la UI (sin jerga ni nombres de variables/claves).
    El detalle técnico solo va al log.
    """
    low = str(exc or "").lower()
    nombre = (producto or "Clara").strip() or "Clara"
    if (
        "credit balance" in low
        or "too low to access" in low
        or "purchase credits" in low
        or ("billing" in low and "upgrade" in low)
    ):
        return (
            f"No se pudo usar {nombre}: la cuenta de IA no tiene saldo. "
            "Avise a soporte."
        )
    if "authentication" in low or "invalid api key" in low or "unauthorized" in low or "permission" in low:
        return (
            f"No se pudo usar {nombre}: la clave de IA fue rechazada. "
            "Avise a soporte."
        )
    if "not_found_error" in low and "model" in low:
        return (
            f"No se pudo usar {nombre}: el modelo de IA no está disponible. "
            "Avise a soporte."
        )
    if "rate" in low and "limit" in low:
        return (
            f"No se pudo usar {nombre}: el servicio de IA está ocupado. "
            "Espere unos segundos e intente de nuevo."
        )
    if "timeout" in low or "timed out" in low:
        return (
            f"No se pudo usar {nombre}: el servicio de IA no respondió a tiempo. "
            "Intente de nuevo."
        )
    if "unexpected keyword argument" in low:
        return (
            f"No se pudo usar {nombre} por un ajuste interno de la IA. "
            "Intente de nuevo. Si continúa, avise a soporte."
        )
    return f"{nombre} no pudo responder en este momento. Intente de nuevo en un momento."


def _fmt_miles(n: int) -> str:
    return f"{max(0, int(n)):,}".replace(",", ".")


def mensaje_texto_demasiado_largo(*, producto: str = "Clara", limite_chars: int) -> str:
    nombre = (producto or "Clara").strip() or "Clara"
    return (
        f"No se pudo usar {nombre}: el texto supera el límite de {_fmt_miles(limite_chars)} "
        f"caracteres por llamada. Divida el tema en partes más cortas."
    )


def mensaje_respuesta_truncada(*, producto: str = "Clara", max_tokens: int) -> str:
    """Aviso amable; el tope técnico (tokens) solo va al log."""
    nombre = (producto or "Clara").strip() or "Clara"
    approx_chars = max(1000, int(max_tokens or 0) * 2)
    return (
        f"No se pudo usar {nombre}: la respuesta se cortó porque el texto es demasiado "
        f"largo para una sola llamada (capacidad aprox. {_fmt_miles(approx_chars)} caracteres). "
        f"Divida el tema o acórtelo un poco."
    )


def _traducir_error_anthropic(
    exc: BaseException,
    *,
    producto: str = "AVI",
    model: str | None = None,
) -> None:
    """
    Registra el error técnico en el log y lanza siempre HTTP 502 con mensaje amable.
    El usuario nunca ve detalles internos de Anthropic.
    """
    _log.error(
        "%s Anthropic error (model=%s): %s",
        (producto or "AVI"),
        model or AVI_MODEL,
        str(exc).replace("\n", " ")[:500],
    )
    raise HTTPException(
        status_code=502,
        detail=mensaje_error_anthropic_usuario(exc, producto=producto, model=model),
    )


def texto_desde_respuesta_anthropic(resp: Any) -> str:
    """
    Une los bloques de texto de la respuesta.

    Modelos recientes (p. ej. claude-haiku-5-5) pueden devolver ThinkingBlock u
    otros bloques sin atributo ``text`` antes del TextBlock. Tomar content[0].text
    directo provoca AttributeError y el aviso genérico de «no disponible».
    """
    parts: list[str] = []
    for block in getattr(resp, "content", None) or []:
        txt = getattr(block, "text", None)
        if txt:
            parts.append(str(txt))
    return "\n".join(parts).strip()


# ── Llamada a la API de Anthropic ────────────────────────────────────────────

async def llamar_avi(
    mensaje: str,
    modulo_actual: str,
    historial: list[dict],
    imagen_base64: str | None,
    *,
    api_key: str | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
    system: Any | None = None,
    producto: str | None = None,
) -> tuple[str, bool, int, int]:
    """
    Llama a Claude Haiku con prompt caching en el system prompt.

    Retorna (respuesta_texto, tiene_imagen, tokens_input, tokens_output).
    Lanza HTTPException 400 si la imagen es inválida, 502 si Anthropic falla.

    ``api_key`` / ``model`` opcionales: usados p. ej. por Clara dentro de actas
    (ACTA_ANTHROPIC_API_KEY + claude-haiku-5-5). Sin ellos, AVI general.

    ``max_tokens`` / ``system`` opcionales: Clara en actas usa tope alto y un
    system corto (no el FAQ de AVI) para textos largos de tema.
    """
    override_key = (api_key or "").strip() or None
    override_model = (model or "").strip() or None
    if override_key:
        client = anthropic.AsyncAnthropic(api_key=override_key)
    else:
        client = _get_avi_client()
    use_model = override_model or AVI_MODEL
    try:
        use_max_tokens = int(max_tokens) if max_tokens is not None else AVI_MAX_TOKENS
    except (TypeError, ValueError):
        use_max_tokens = AVI_MAX_TOKENS
    use_max_tokens = max(256, use_max_tokens)
    messages, tiene_imagen = construir_messages(mensaje, historial, imagen_base64)
    if system is None:
        system_blocks = build_avi_system_blocks(modulo_actual)
    else:
        system_blocks = system

    # Clara/actas usa clave y modelo propios; el resto de la plataforma, AVI general.
    if producto and str(producto).strip():
        producto_ui = str(producto).strip()
    else:
        producto_ui = "Clara" if override_key or override_model else "AVI"
    try:
        resp = await client.messages.create(
            model=use_model,
            max_tokens=use_max_tokens,
            system=system_blocks,      # type: ignore[arg-type]
            messages=messages,         # type: ignore[arg-type]
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        _traducir_error_anthropic(exc, producto=producto_ui, model=use_model)
        raise  # unreachable; mantiene el tipado claro

    texto = texto_desde_respuesta_anthropic(resp)
    stop_reason = getattr(resp, "stop_reason", None)
    tokens_in = getattr(getattr(resp, "usage", None), "input_tokens", 0) or 0
    tokens_out = getattr(getattr(resp, "usage", None), "output_tokens", 0) or 0
    tipos = [
        getattr(b, "type", None) or type(b).__name__
        for b in (getattr(resp, "content", None) or [])
    ]

    if not texto:
        _log.error(
            "%s Anthropic sin texto usable (model=%s stop=%s max_tokens=%s "
            "tokens_out=%s blocks=%s)",
            producto_ui,
            use_model,
            stop_reason,
            use_max_tokens,
            tokens_out,
            tipos,
        )
        if stop_reason == "max_tokens":
            raise HTTPException(
                status_code=502,
                detail=mensaje_respuesta_truncada(
                    producto=producto_ui, max_tokens=use_max_tokens
                ),
            )
        raise HTTPException(
            status_code=502,
            detail=(
                f"{producto_ui} no pudo responder en este momento. "
                "Intente de nuevo en un momento."
            ),
        )

    if stop_reason == "max_tokens":
        # Respuesta incompleta: no devolver texto a medias como si estuviera listo.
        _log.error(
            "%s Anthropic respuesta truncada (model=%s max_tokens=%s "
            "tokens_out=%s out_chars=%s blocks=%s)",
            producto_ui,
            use_model,
            use_max_tokens,
            tokens_out,
            len(texto),
            tipos,
        )
        raise HTTPException(
            status_code=502,
            detail=mensaje_respuesta_truncada(
                producto=producto_ui, max_tokens=use_max_tokens
            ),
        )

    return texto, tiene_imagen, int(tokens_in), int(tokens_out)


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
