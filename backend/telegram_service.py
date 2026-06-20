"""Envío de reportes de soporte a Telegram.

Credenciales (variables de entorno):
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID
"""

import logging
import os
import re
from datetime import datetime
from typing import Any, Callable, Dict, Optional

import httpx
import pytz

_log = logging.getLogger("uvicorn.error")

_BOGOTA = pytz.timezone("America/Bogota")
_GESTIONADO_PREFIX = "gestionado:"
_GESTIONADO_MARKER = "✅ Gestionado —"
_ANOTADO_PREFIX = "anotado:"
_ANOTADO_MARKER = "💡 Anotado —"


def telegram_configured() -> bool:
    return bool(
        (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
        and (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    )


def _bot_token() -> str:
    return (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()


def _default_chat_id() -> str:
    return (os.getenv("TELEGRAM_CHAT_ID") or "").strip()


def _format_fecha_hora() -> str:
    return datetime.now(_BOGOTA).strftime("%d/%m/%Y %H:%M (Colombia)")


def _modulo_display(modulo: Optional[str]) -> str:
    if not modulo or not str(modulo).strip():
        return "—"
    m = str(modulo).strip()
    if m.upper() == "OTRO":
        return "Otro"
    return m.replace("_", " ").title()


def _inline_callback_data(prefix: str, notificacion_id: int) -> str:
    return f"{prefix}{int(notificacion_id)}"


def _inline_keyboard(notificacion_id: int, button: str) -> Dict[str, Any]:
    if button == "anotado":
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "💡 Anotado",
                        "callback_data": _inline_callback_data(_ANOTADO_PREFIX, notificacion_id),
                    }
                ]
            ]
        }
    return {
        "inline_keyboard": [
            [
                {
                    "text": "✅ Gestionado",
                    "callback_data": _inline_callback_data(_GESTIONADO_PREFIX, notificacion_id),
                }
            ]
        ]
    }


def _telegram_api(method: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    token = _bot_token()
    if not token:
        _log.warning("Telegram no configurado (TELEGRAM_BOT_TOKEN)")
        return None
    url = f"https://api.telegram.org/bot{token}/{method}"
    try:
        res = httpx.post(url, json=payload, timeout=15.0)
        data = res.json() if res.content else {}
        if res.status_code >= 400 or not data.get("ok", True):
            _log.warning(
                "Telegram API %s error %s: %s",
                method,
                res.status_code,
                res.text[:300],
            )
            return None
        return data
    except Exception:
        _log.exception("Telegram API %s falló", method)
        return None


def send_telegram_message(
    text: str,
    *,
    notificacion_id: Optional[int] = None,
    button: str = "gestionado",
    chat_id: Optional[str] = None,
) -> bool:
    """Envía un mensaje de texto al chat configurado (opcionalmente con botón inline)."""
    cid = (chat_id or _default_chat_id()).strip()
    if not cid:
        _log.warning("Telegram no configurado (TELEGRAM_CHAT_ID)")
        return False

    payload: Dict[str, Any] = {
        "chat_id": cid,
        "text": text,
        "disable_web_page_preview": True,
    }
    if notificacion_id is not None:
        payload["reply_markup"] = _inline_keyboard(notificacion_id, button)

    return _telegram_api("sendMessage", payload) is not None


def format_error_report_message(
    *,
    usuario_nombre: str,
    contrato: str,
    modulo: str,
    ubicacion: str,
    sector: str,
    descripcion: str,
    criticidad: str,
    imagen_adjunta: bool,
    fecha_hora: Optional[str] = None,
) -> str:
    imagen_txt = "Sí" if imagen_adjunta else "No"
    fecha = fecha_hora or _format_fecha_hora()
    return (
        "🛟 Nuevo reporte de error — ClaraCore\n\n"
        f"👤 Usuario: {usuario_nombre}\n"
        f"🏢 Contrato: {contrato}\n"
        f"📍 Módulo: {modulo}\n"
        f"📂 Ubicación: {ubicacion}\n"
        f"🔍 Sector: {sector}\n\n"
        f"📝 Descripción:\n{descripcion.strip()}\n\n"
        f"🔴 Urgencia: {criticidad}\n\n"
        f"🖼️ Imagen adjunta: {imagen_txt}\n\n"
        f"🕐 {fecha}"
    )


def parse_error_report_mensaje(mensaje: str) -> Optional[Dict[str, Any]]:
    """Extrae campos del mensaje estructurado generado por el formulario de error."""
    if not mensaje or "── Reporte de error ──" not in mensaje:
        return None

    fields: Dict[str, Any] = {}
    for line in mensaje.splitlines():
        stripped = line.strip()
        if stripped.startswith("Módulo:"):
            fields["modulo"] = stripped[7:].strip()
        elif stripped.startswith("Ubicación:"):
            fields["ubicacion"] = stripped[12:].strip()
        elif stripped.startswith("Sector:"):
            fields["sector"] = stripped[7:].strip()
        elif stripped.startswith("Criticidad:"):
            fields["criticidad"] = stripped[11:].strip()
        elif stripped.startswith("Imagen adjunta:"):
            val = stripped[15:].strip().lower()
            fields["imagen_adjunta"] = val.startswith("sí") or val.startswith("si")

    desc_match = re.search(r"Descripción:\s*\n([\s\S]+)\Z", mensaje)
    if desc_match:
        fields["descripcion"] = desc_match.group(1).strip()

    if not fields.get("descripcion"):
        return None
    return fields


def parse_mejora_mensaje(mensaje: str) -> Optional[str]:
    """Extrae el texto de una sugerencia de mejora del mensaje estructurado del formulario."""
    if not mensaje or "── Sugerencia de mejora ──" not in mensaje:
        return None
    _, _, body = mensaje.partition("── Sugerencia de mejora ──")
    text = body.strip()
    return text or None


def format_mejora_message(
    *,
    usuario_nombre: str,
    contrato: str,
    modulo: str,
    sugerencia: str,
    fecha_hora: Optional[str] = None,
) -> str:
    fecha = fecha_hora or _format_fecha_hora()
    return (
        "💡 Nueva sugerencia de mejora — ClaraCore\n\n"
        f"👤 Usuario: {usuario_nombre}\n"
        f"🏢 Contrato: {contrato}\n"
        f"📍 Módulo: {modulo}\n\n"
        f"💬 Sugerencia:\n{sugerencia.strip()}\n\n"
        f"🕐 {fecha}"
    )


def send_error_report_to_telegram(
    *,
    usuario_nombre: str,
    contrato: str,
    modulo: str,
    ubicacion: str,
    sector: str,
    descripcion: str,
    criticidad: str,
    imagen_adjunta: bool,
    notificacion_id: Optional[int] = None,
) -> bool:
    text = format_error_report_message(
        usuario_nombre=usuario_nombre,
        contrato=contrato,
        modulo=modulo,
        ubicacion=ubicacion,
        sector=sector,
        descripcion=descripcion,
        criticidad=criticidad,
        imagen_adjunta=imagen_adjunta,
    )
    return send_telegram_message(text, notificacion_id=notificacion_id, button="gestionado")


def send_mejora_to_telegram(
    *,
    usuario_nombre: str,
    contrato: str,
    modulo: str,
    sugerencia: str,
    notificacion_id: Optional[int] = None,
) -> bool:
    text = format_mejora_message(
        usuario_nombre=usuario_nombre,
        contrato=contrato,
        modulo=_modulo_display(modulo),
        sugerencia=sugerencia,
    )
    return send_telegram_message(text, notificacion_id=notificacion_id, button="anotado")


def try_send_soporte_telegram(
    *,
    usuario_nombre: str,
    contrato: str,
    mensaje: str,
    modulo: Optional[str] = None,
    notificacion_id: Optional[int] = None,
) -> Optional[bool]:
    """
    Envía a Telegram un reporte SOPORTE.
    Retorna None si Telegram no está configurado, True/False según el envío.
    """
    if not telegram_configured():
        return None
    try:
        parsed = parse_error_report_mensaje(mensaje)
        if parsed:
            ok = send_error_report_to_telegram(
                usuario_nombre=usuario_nombre or "Usuario",
                contrato=contrato or "—",
                modulo=parsed.get("modulo") or modulo or "—",
                ubicacion=parsed.get("ubicacion") or "—",
                sector=parsed.get("sector") or "—",
                descripcion=parsed.get("descripcion") or "—",
                criticidad=parsed.get("criticidad") or "—",
                imagen_adjunta=bool(parsed.get("imagen_adjunta")),
                notificacion_id=notificacion_id,
            )
        elif (sugerencia := parse_mejora_mensaje(mensaje)):
            ok = send_mejora_to_telegram(
                usuario_nombre=usuario_nombre or "Usuario",
                contrato=contrato or "—",
                modulo=modulo or "—",
                sugerencia=sugerencia,
                notificacion_id=notificacion_id,
            )
        else:
            mod_txt = _modulo_display(modulo)
            text = (
                "📩 Nuevo mensaje de soporte — ClaraCore\n\n"
                f"👤 Usuario: {usuario_nombre or 'Usuario'}\n"
                f"🏢 Contrato: {contrato or '—'}\n"
                f"📍 Módulo: {mod_txt}\n\n"
                f"{mensaje.strip()}\n\n"
                f"🕐 {_format_fecha_hora()}"
            )
            ok = send_telegram_message(text, notificacion_id=notificacion_id, button="gestionado")
        return ok
    except Exception:
        _log.exception("try_send_soporte_telegram falló")
        return False


def _answer_callback_query(callback_query_id: str, text: str) -> None:
    _telegram_api(
        "answerCallbackQuery",
        {"callback_query_id": callback_query_id, "text": text, "show_alert": False},
    )


def _mensaje_ya_marcado(text: str, marker: str) -> bool:
    return marker in (text or "")


def _actualizar_mensaje_telegram(
    *,
    chat_id: int,
    message_id: int,
    original_text: str,
    marker: str,
) -> bool:
    fecha = _format_fecha_hora()
    new_text = f"{original_text.rstrip()}\n\n{marker} {fecha}"
    result = _telegram_api(
        "editMessageText",
        {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": new_text,
            "disable_web_page_preview": True,
            "reply_markup": {"inline_keyboard": []},
        },
    )
    return result is not None


def _handle_inline_action_callback(
    callback_query: Dict[str, Any],
    *,
    prefix: str,
    marker: str,
    ya_marcado_msg: str,
    ok_msg: str,
    invalid_id_msg: str,
    on_action: Optional[Callable[[int], None]] = None,
) -> bool:
    data = (callback_query.get("data") or "").strip()
    if not data.startswith(prefix):
        return False

    try:
        notificacion_id = int(data[len(prefix):])
    except ValueError:
        cq_id = callback_query.get("id")
        if cq_id:
            _answer_callback_query(cq_id, invalid_id_msg)
        return True

    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    message_id = message.get("message_id")
    original_text = message.get("text") or ""
    cq_id = callback_query.get("id")

    if chat_id is None or message_id is None:
        if cq_id:
            _answer_callback_query(cq_id, "No se pudo actualizar el mensaje.")
        return True

    if _mensaje_ya_marcado(original_text, marker):
        if cq_id:
            _answer_callback_query(cq_id, ya_marcado_msg)
        return True

    ok = _actualizar_mensaje_telegram(
        chat_id=int(chat_id),
        message_id=int(message_id),
        original_text=original_text,
        marker=marker,
    )
    if cq_id:
        if ok:
            _answer_callback_query(cq_id, ok_msg)
        else:
            _answer_callback_query(cq_id, "No se pudo actualizar el mensaje en Telegram.")
            return True

    if on_action:
        try:
            on_action(notificacion_id, callback_query)
        except Exception:
            _log.exception(
                "callback %s falló para notificacion_id=%s (Telegram ya actualizado)",
                prefix,
                notificacion_id,
            )

    return True


def _handle_gestionado_callback(
    callback_query: Dict[str, Any],
    on_reporte_gestionado: Optional[Callable[[int], None]] = None,
) -> bool:
    return _handle_inline_action_callback(
        callback_query,
        prefix=_GESTIONADO_PREFIX,
        marker=_GESTIONADO_MARKER,
        ya_marcado_msg="Este reporte ya fue marcado como gestionado.",
        ok_msg="Reporte marcado como gestionado.",
        invalid_id_msg="Identificador de reporte inválido.",
        on_action=on_reporte_gestionado,
    )


def _handle_anotado_callback(
    callback_query: Dict[str, Any],
    on_sugerencia_anotada: Optional[Callable[[int], None]] = None,
) -> bool:
    return _handle_inline_action_callback(
        callback_query,
        prefix=_ANOTADO_PREFIX,
        marker=_ANOTADO_MARKER,
        ya_marcado_msg="Esta sugerencia ya fue marcada como anotada.",
        ok_msg="Sugerencia marcada como anotada.",
        invalid_id_msg="Identificador de sugerencia inválido.",
        on_action=on_sugerencia_anotada,
    )


def handle_telegram_webhook_update(
    update: Dict[str, Any],
    *,
    on_reporte_gestionado: Optional[Callable[[int], None]] = None,
    on_sugerencia_anotada: Optional[Callable[[int], None]] = None,
) -> Dict[str, Any]:
    """Procesa una actualización de Telegram (webhook)."""
    if not isinstance(update, dict):
        return {"ok": True}

    callback_query = update.get("callback_query")
    if callback_query:
        if not _handle_gestionado_callback(callback_query, on_reporte_gestionado):
            _handle_anotado_callback(callback_query, on_sugerencia_anotada)

    return {"ok": True}
