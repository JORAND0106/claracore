"""Envío por correo de desprendibles y liquidaciones RRHH."""
from __future__ import annotations

import html
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

_log = logging.getLogger("claracore.rrhh.nomina.email")


class NominaEmailError(Exception):
    """Fallo al enviar correo de nómina/liquidación."""


def nomina_smtp_configured() -> bool:
    """Preferir SMTP de notificaciones; si no, el de facturación."""
    if (os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip():
        return True
    host = (os.getenv("CLARACORE_FACTURACION_SMTP_HOST") or "").strip()
    user = (os.getenv("CLARACORE_FACTURACION_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_FACTURACION_SMTP_PASSWORD") or "").strip()
    return bool(host and user and password)


def _smtp_settings() -> dict:
    if (os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip():
        host = (os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip()
        port = int(os.getenv("CCD_NOTIFY_SMTP_PORT") or "587")
        user = (os.getenv("CCD_NOTIFY_SMTP_USER") or "").strip()
        password = (os.getenv("CCD_NOTIFY_SMTP_PASSWORD") or "").strip()
        from_email = (os.getenv("CCD_NOTIFY_FROM_EMAIL") or user or "").strip()
        from_name = (os.getenv("CCD_NOTIFY_FROM_NAME") or "ClaraCore RRHH").strip()
        use_tls = (
            os.getenv("CCD_NOTIFY_SMTP_TLS", "1").strip().lower()
            not in ("0", "false", "no")
        )
        if not host or not from_email:
            raise NominaEmailError("SMTP de notificaciones incompleto.")
        return {
            "host": host,
            "port": port,
            "user": user,
            "password": password,
            "from_email": from_email,
            "from_name": from_name,
            "use_tls": use_tls,
        }

    host = (os.getenv("CLARACORE_FACTURACION_SMTP_HOST") or "").strip()
    if not host:
        raise NominaEmailError("SMTP no configurado para envío de desprendibles.")
    port = int(os.getenv("CLARACORE_FACTURACION_SMTP_PORT") or "587")
    user = (os.getenv("CLARACORE_FACTURACION_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_FACTURACION_SMTP_PASSWORD") or "").strip()
    from_email = (
        os.getenv("CLARACORE_FACTURACION_FROM_EMAIL") or user or "facturacion@claracore.co"
    ).strip()
    from_name = (os.getenv("CLARACORE_FACTURACION_FROM_NAME") or "ClaraCore RRHH").strip()
    use_tls = (
        os.getenv("CLARACORE_FACTURACION_SMTP_TLS", "1").strip().lower()
        not in ("0", "false", "no")
    )
    if not user or not password:
        raise NominaEmailError("Credenciales SMTP incompletas.")
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
        "use_tls": use_tls,
    }


def send_pdf_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> None:
    dest = (to_email or "").strip().lower()
    if not dest:
        raise NominaEmailError("El colaborador no tiene correo registrado.")
    if not pdf_bytes:
        raise NominaEmailError("PDF vacío; no se puede enviar.")

    cfg = _smtp_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = dest
    msg["Reply-To"] = cfg["from_email"]
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=pdf_filename or "documento.pdf",
    )

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
            smtp.ehlo()
            if cfg["use_tls"]:
                smtp.starttls()
                smtp.ehlo()
            if cfg["user"] and cfg["password"]:
                smtp.login(cfg["user"], cfg["password"])
            smtp.send_message(msg)
    except Exception as exc:
        _log.exception("Envío RRHH SMTP falló dest=%s", dest)
        raise NominaEmailError(f"No se pudo enviar el correo: {exc}") from exc

    _log.info("Correo RRHH enviado a %s asunto=%s", dest, subject[:80])


def send_desprendible_email(
    *,
    to_email: str,
    colaborador_nombre: str,
    periodo_label: str,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> None:
    nombre = (colaborador_nombre or "colaborador").strip()
    periodo = (periodo_label or "periodo").strip()
    subject = f"Desprendible de pago — {periodo}"
    text = (
        f"Hola {nombre},\n\n"
        f"Adjuntamos tu desprendible de pago correspondiente a {periodo}.\n\n"
        f"ClaraCore — Recursos Humanos\n"
    )
    html_body = (
        f'<p style="font-family:Arial,sans-serif;color:#334155;">'
        f"Hola {html.escape(nombre)},</p>"
        f'<p style="font-family:Arial,sans-serif;color:#334155;">'
        f"Adjuntamos tu desprendible de pago correspondiente a "
        f"<b>{html.escape(periodo)}</b>.</p>"
        f'<p style="font-family:Arial,sans-serif;color:#64748b;font-size:12px;">'
        f"ClaraCore — Recursos Humanos</p>"
    )
    send_pdf_email(
        to_email=to_email,
        subject=subject,
        text_body=text,
        html_body=html_body,
        pdf_bytes=pdf_bytes,
        pdf_filename=pdf_filename,
    )


def send_liquidacion_email(
    *,
    to_email: str,
    colaborador_nombre: str,
    fecha_retiro: str,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> None:
    nombre = (colaborador_nombre or "colaborador").strip()
    subject = f"Liquidación laboral — retiro {fecha_retiro}"
    text = (
        f"Hola {nombre},\n\n"
        f"Adjuntamos el documento de liquidación correspondiente a la finalización "
        f"de tu relación laboral (fecha de retiro: {fecha_retiro}).\n\n"
        f"ClaraCore — Recursos Humanos\n"
    )
    html_body = (
        f'<p style="font-family:Arial,sans-serif;color:#334155;">'
        f"Hola {html.escape(nombre)},</p>"
        f'<p style="font-family:Arial,sans-serif;color:#334155;">'
        f"Adjuntamos el documento de liquidación por finalización de la relación laboral "
        f"(retiro: <b>{html.escape(fecha_retiro)}</b>).</p>"
        f'<p style="font-family:Arial,sans-serif;color:#64748b;font-size:12px;">'
        f"ClaraCore — Recursos Humanos</p>"
    )
    send_pdf_email(
        to_email=to_email,
        subject=subject,
        text_body=text,
        html_body=html_body,
        pdf_bytes=pdf_bytes,
        pdf_filename=pdf_filename,
    )
