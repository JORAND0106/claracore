"""Envío opcional de correos por SMTP (stdlib). Si no hay variables de entorno, no se envía nada."""

import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

_log = logging.getLogger("uvicorn.error")


def notify_smtp_configured() -> bool:
    return bool((os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip())


def send_text_email(to_addr: str, subject: str, body: str) -> bool:
    """
    Envía un correo en texto plano. Retorna True si se envió, False si SMTP no está configurado.
    Los errores de envío se registran y se re-lanzan para que el llamador decida (p. ej. no fallar el POST).
    """
    host = (os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip()
    if not host:
        return False
    to_addr = (to_addr or "").strip()
    if not to_addr:
        _log.warning("send_text_email: destinatario vacío")
        return False

    port = int(os.getenv("CCD_NOTIFY_SMTP_PORT") or "587")
    user = (os.getenv("CCD_NOTIFY_SMTP_USER") or "").strip()
    password = (os.getenv("CCD_NOTIFY_SMTP_PASSWORD") or "").strip()
    from_email = (os.getenv("CCD_NOTIFY_FROM_EMAIL") or user or "").strip()
    if not from_email:
        _log.warning("send_text_email: CCD_NOTIFY_FROM_EMAIL o CCD_NOTIFY_SMTP_USER requerido")
        return False
    from_name = (os.getenv("CCD_NOTIFY_FROM_NAME") or "ClaraCore").strip()

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_addr
    msg.set_content(body)

    use_tls = (os.getenv("CCD_NOTIFY_SMTP_TLS", "1").strip().lower() not in ("0", "false", "no"))

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)

    _log.info("Correo enviado a %s asunto=%s", to_addr, subject[:60])
    return True


def try_send_text_email(to_addr: str, subject: str, body: str) -> Optional[bool]:
    """
    Igual que send_text_email pero atrapa errores: retorna True/False o None si no configurado.
    """
    if not notify_smtp_configured():
        return None
    try:
        return send_text_email(to_addr, subject, body)
    except Exception:
        _log.exception("try_send_text_email falló para %s", to_addr)
        return False
