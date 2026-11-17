"""Correo del 80 % de la caja menor a usuarios con rol Administrador del contrato."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable, List

_log = logging.getLogger("claracore.caja_menor.email")


def _app_url() -> str:
    try:
        from usuario_bienvenida_email import plataforma_url

        return plataforma_url()
    except Exception:
        import os

        return (os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co").strip().rstrip("/")


def enlace_caja(contrato_id: int, caja_id: int) -> str:
    return f"{_app_url()}/?modulo=caja_menor&contrato={int(contrato_id)}&caja={int(caja_id)}"


def asunto_80(responsable: str) -> str:
    nombre = (responsable or "Un responsable").strip()
    return f"Caja menor al 80 % — {nombre}"


def cuerpo_texto_80(*, responsable: str, disponible: str, enlace: str, numero: int) -> str:
    return (
        f"El usuario {responsable} consumió el 80% de su caja menor No. {int(numero)}.\n"
        f"Disponible actual: {disponible}.\n\n"
        f"Abrir la caja: {enlace}\n"
    )


def cuerpo_html_80(*, responsable: str, disponible: str, enlace: str, numero: int) -> str:
    return (
        "<p>El usuario <strong>"
        + _esc(responsable)
        + "</strong> consumió el 80% de su caja menor No. "
        + str(int(numero))
        + ".</p>"
        + "<p>Disponible actual: <strong>"
        + _esc(disponible)
        + "</strong>.</p>"
        + '<p><a href="'
        + _esc(enlace)
        + '">Abrir la caja</a></p>'
    )


def _esc(texto: str) -> str:
    return (
        str(texto or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def enviar_alerta_80(
    destinatarios: Iterable[str],
    *,
    responsable: str,
    disponible: str,
    enlace: str,
    numero: int,
) -> dict:
    """
    Envía el aviso. No lanza: el gasto ya quedó guardado.
    Devuelve enviados y el motivo si no salió.
    """
    destinos: List[str] = []
    vistos = set()
    for raw in destinatarios or []:
        email = str(raw or "").strip().lower()
        if not email or "@" not in email or email in vistos:
            continue
        vistos.add(email)
        destinos.append(email)
    if not destinos:
        return {"enviados": 0, "motivo": "sin_destinatarios"}

    try:
        from usuario_bienvenida_email import _smtp_settings, contacto_smtp_configured
    except Exception:
        return {"enviados": 0, "motivo": "smtp_no_disponible"}
    if not contacto_smtp_configured():
        return {"enviados": 0, "motivo": "smtp_no_configurado"}
    try:
        cfg = _smtp_settings()
    except Exception as exc:
        _log.warning("smtp caja menor: %s", exc)
        return {"enviados": 0, "motivo": "smtp_no_configurado"}

    asunto = asunto_80(responsable)
    texto = cuerpo_texto_80(responsable=responsable, disponible=disponible, enlace=enlace, numero=numero)
    html = cuerpo_html_80(responsable=responsable, disponible=disponible, enlace=enlace, numero=numero)
    enviados = 0
    for destino in destinos:
        msg = EmailMessage()
        msg["Subject"] = asunto
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = destino
        msg.set_content(texto)
        msg.add_alternative(html, subtype="html")
        try:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
                smtp.ehlo()
                if cfg["use_tls"]:
                    smtp.starttls()
                    smtp.ehlo()
                if cfg["user"]:
                    smtp.login(cfg["user"], cfg["password"])
                smtp.send_message(msg)
            enviados += 1
        except Exception as exc:
            _log.warning("alerta 80 %s: %s", destino, exc)
    if enviados:
        return {"enviados": enviados, "motivo": None}
    return {"enviados": 0, "motivo": "smtp_fallo"}
