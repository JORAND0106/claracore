"""Plantillas y envío SMTP para notificaciones automáticas ClaraCore."""

from __future__ import annotations

import html
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

_log = logging.getLogger("claracore.notificaciones_email")


def smtp_configured() -> bool:
    host = (
        os.getenv("CLARACORE_CONTACTO_SMTP_HOST")
        or os.getenv("CLARACORE_FACTURACION_SMTP_HOST")
        or os.getenv("CCD_NOTIFY_SMTP_HOST")
        or ""
    ).strip()
    user = (
        os.getenv("CLARACORE_CONTACTO_SMTP_USER")
        or os.getenv("CCD_NOTIFY_SMTP_USER")
        or ""
    ).strip()
    password = (
        os.getenv("CLARACORE_CONTACTO_SMTP_PASSWORD")
        or os.getenv("CCD_NOTIFY_SMTP_PASSWORD")
        or ""
    ).strip()
    return bool(host and user and password)


def plataforma_url() -> str:
    return (os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co").strip().rstrip("/")


def _smtp_settings() -> dict:
    host = (
        os.getenv("CLARACORE_CONTACTO_SMTP_HOST")
        or os.getenv("CLARACORE_FACTURACION_SMTP_HOST")
        or os.getenv("CCD_NOTIFY_SMTP_HOST")
        or ""
    ).strip()
    if not host:
        raise RuntimeError("SMTP no configurado para notificaciones")
    port = int(
        os.getenv("CLARACORE_CONTACTO_SMTP_PORT")
        or os.getenv("CLARACORE_FACTURACION_SMTP_PORT")
        or os.getenv("CCD_NOTIFY_SMTP_PORT")
        or "587"
    )
    user = (
        os.getenv("CLARACORE_CONTACTO_SMTP_USER")
        or os.getenv("CCD_NOTIFY_SMTP_USER")
        or ""
    ).strip()
    password = (
        os.getenv("CLARACORE_CONTACTO_SMTP_PASSWORD")
        or os.getenv("CCD_NOTIFY_SMTP_PASSWORD")
        or ""
    ).strip()
    from_email = (
        os.getenv("CLARACORE_CONTACTO_FROM_EMAIL")
        or os.getenv("CCD_NOTIFY_FROM_EMAIL")
        or user
        or ""
    ).strip()
    from_name = (
        os.getenv("CLARACORE_CONTACTO_FROM_NAME")
        or os.getenv("CCD_NOTIFY_FROM_NAME")
        or "ClaraCore"
    ).strip()
    use_tls = (
        (
            os.getenv("CLARACORE_CONTACTO_SMTP_TLS")
            or os.getenv("CLARACORE_FACTURACION_SMTP_TLS")
            or os.getenv("CCD_NOTIFY_SMTP_TLS")
            or "1"
        )
        .strip()
        .lower()
        not in ("0", "false", "no")
    )
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
        "use_tls": use_tls,
    }


def _wrap_html(title: str, body_html: str) -> str:
    url = plataforma_url()
    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <h1 style="font-size:20px;color:#0077b6;margin:0 0 16px;">{html.escape(title)}</h1>
    {body_html}
    <p style="margin-top:24px;font-size:13px;color:#64748b;">
      <a href="{html.escape(url)}" style="color:#0077b6;">Abrir ClaraCore</a>
    </p>
  </div>
</body></html>"""


def send_notification_email(to_addr: str, subject: str, text_body: str, html_body: str) -> bool:
    to_addr = (to_addr or "").strip()
    if not to_addr:
        return False
    cfg = _smtp_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_addr
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
        smtp.ehlo()
        if cfg["use_tls"]:
            smtp.starttls()
            smtp.ehlo()
        if cfg["user"] and cfg["password"]:
            smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(msg)
    _log.info("Notificación enviada a %s — %s", to_addr, subject[:80])
    return True


def try_send_notification_email(
    to_addr: str, subject: str, text_body: str, html_body: str
) -> Optional[bool]:
    if not smtp_configured():
        return None
    try:
        return send_notification_email(to_addr, subject, text_body, html_body)
    except Exception:
        _log.exception("Fallo envío a %s", to_addr)
        return False


def email_informe_no_copiado(nombre: str, contrato_num: str, slot_label: str) -> tuple[str, str, str]:
    subject = f"ClaraCore — {contrato_num}: informe de validación pendiente ({slot_label})"
    text = (
        f"Hola {nombre},\n\n"
        f"En el contrato {contrato_num} aún no has copiado el informe de validación del día "
        f"(ventana {slot_label}). Ingresa a ClaraCore y usa el recordatorio para copiar el cuadro "
        f"de Validación por rol.\n\n"
        f"{plataforma_url()}\n"
    )
    html_body = _wrap_html(
        f"Informe pendiente · {contrato_num}",
        f"<p>Hola <strong>{html.escape(nombre)}</strong>,</p>"
        f"<p>En el contrato <strong>{html.escape(contrato_num)}</strong> aún no has copiado "
        f"el informe de validación del día (ventana <strong>{html.escape(slot_label)}</strong>).</p>"
        f"<p>Ingresa a la plataforma; el modal te permitirá copiar el cuadro "
        f"«Validación por rol · SICOE Obra».</p>",
    )
    return subject, text, html_body


def email_sin_item_asignado(nombre: str, contrato_num: str, n_regs: int) -> tuple[str, str, str]:
    subject = f"ClaraCore — {contrato_num}: {n_regs} registro(s) sin ítem asignado"
    text = (
        f"Hola {nombre},\n\n"
        f"En el contrato {contrato_num} hay {n_regs} registro(s) SICOE Obra sin ítem asignado. "
        f"Revisa y asigna los ítems pendientes.\n\n{plataforma_url()}\n"
    )
    html_body = _wrap_html(
        "Registros sin ítem asignado",
        f"<p>Hola <strong>{html.escape(nombre)}</strong>,</p>"
        f"<p>En el contrato <strong>{html.escape(contrato_num)}</strong> hay "
        f"<strong>{n_regs}</strong> registro(s) SICOE Obra sin ítem asignado.</p>"
        f"<p>Revisa la grilla con filtro «Sin Asignar Ítem».</p>",
    )
    return subject, text, html_body


def email_validacion_pendiente(
    nombre: str, contrato_num: str, nivel: int, n_regs: int
) -> tuple[str, str, str]:
    subject = f"ClaraCore — {contrato_num}: {n_regs} pendiente(s) por validar (N{nivel})"
    text = (
        f"Hola {nombre},\n\n"
        f"Tienes {n_regs} registro(s) pendientes por validar en nivel N{nivel} "
        f"(contrato {contrato_num}).\n\n{plataforma_url()}\n"
    )
    html_body = _wrap_html(
        "Validaciones pendientes",
        f"<p>Hola <strong>{html.escape(nombre)}</strong>,</p>"
        f"<p>Tienes <strong>{n_regs}</strong> registro(s) pendientes por validar "
        f"en <strong>N{nivel}</strong> (contrato {html.escape(contrato_num)}).</p>",
    )
    return subject, text, html_body


def email_admin_resumen(
    nombre: str,
    contrato_num: str,
    periodo: str,
    matriz: dict,
    capitulos: dict,
) -> tuple[str, str, str]:
    from notificaciones_email_resumen import (
        build_capitulos_html,
        build_intro_cierre,
        build_matriz_html,
        build_narrativa_riesgo,
        build_saludo,
    )

    periodo_label = "inicio de jornada" if periodo == "manana" else "fin de jornada"
    subject = f"ClaraCore — Resumen {periodo_label} · {contrato_num}"
    acta_rpo = matriz.get("acta_rpo")
    acta_txt = str(acta_rpo) if acta_rpo is not None else "—"
    intro, cierre = build_intro_cierre(periodo)
    matriz_html = build_matriz_html(matriz)
    riesgo_html = build_narrativa_riesgo(matriz)
    cap_html, cap_text = build_capitulos_html(capitulos)

    text = (
        f"Estimado Ingeniero {nombre}, a continuación ClaraCore te informa "
        f"el estado de las validaciones del Acta #{acta_txt}.\n\n"
        f"{intro}\n\nContrato {contrato_num}.\n\n"
        f"Validación por rol (Acta #{acta_txt}).\n\n"
        f"{cap_text}\n\n{cierre}\n\n{plataforma_url()}\n"
    )
    html_body = _wrap_html(
        f"Resumen {periodo_label} · {contrato_num}",
        f"<p>{build_saludo(nombre, acta_rpo)}</p>"
        f"<p>{html.escape(intro)}</p>"
        f"<p>Contrato <strong>{html.escape(contrato_num)}</strong></p>"
        f"<h2 style=\"font-size:16px;margin:24px 0 8px;\">Validación por rol · SICOE Obra</h2>"
        f"{matriz_html}"
        f"<h2 style=\"font-size:16px;margin:24px 0 8px;\">Narrativa de riesgo</h2>"
        f"{riesgo_html}"
        f"<h2 style=\"font-size:16px;margin:24px 0 8px;\">Ppto vs Cobro por capítulo</h2>"
        f"{cap_html}"
        f"<p style=\"margin-top:20px;\">{html.escape(cierre)}</p>",
    )
    return subject, text, html_body
