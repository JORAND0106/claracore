"""Envío de reportes de soporte a Telegram.

Credenciales (variables de entorno):
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID
"""

import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional

import httpx
import pytz

_log = logging.getLogger("uvicorn.error")

_BOGOTA = pytz.timezone("America/Bogota")


def telegram_configured() -> bool:
    return bool(
        (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
        and (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    )


def _format_fecha_hora() -> str:
    return datetime.now(_BOGOTA).strftime("%d/%m/%Y %H:%M (Colombia)")


def send_telegram_message(text: str) -> bool:
    """Envía un mensaje de texto al chat configurado."""
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        _log.warning("Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        res = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
            timeout=15.0,
        )
        if res.status_code >= 400:
            _log.warning("Telegram API error %s: %s", res.status_code, res.text[:300])
            return False
        return True
    except Exception:
        _log.exception("send_telegram_message falló")
        return False


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
        f"🔴 Criticidad: {criticidad}\n\n"
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
    return send_telegram_message(text)


def try_send_soporte_telegram(
    *,
    usuario_nombre: str,
    contrato: str,
    mensaje: str,
    modulo: Optional[str] = None,
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
            )
        else:
            mod_txt = modulo or "—"
            text = (
                "📩 Nuevo mensaje de soporte — ClaraCore\n\n"
                f"👤 Usuario: {usuario_nombre or 'Usuario'}\n"
                f"🏢 Contrato: {contrato or '—'}\n"
                f"📍 Módulo: {mod_txt}\n\n"
                f"{mensaje.strip()}\n\n"
                f"🕐 {_format_fecha_hora()}"
            )
            ok = send_telegram_message(text)
        return ok
    except Exception:
        _log.exception("try_send_soporte_telegram falló")
        return False
