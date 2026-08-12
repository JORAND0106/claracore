"""
Correo SMTP — reset de contraseña temporal (mismo canal que bienvenida).

Envía la contraseña temporal y un enlace que abre el popup de cambio en la app.
"""
from __future__ import annotations

import html
import logging
import secrets
import string
from typing import Optional
from urllib.parse import quote

from usuario_bienvenida_email import (
    BienvenidaEmailError,
    _CONTACTO_EMAIL,
    _COLOR_AZUL,
    _COLOR_VERDE,
    _firma_html_institucional,
    _smtp_settings,
    contacto_smtp_configured,
    plataforma_url,
)

_log = logging.getLogger("claracore.password_reset.email")

# Caracteres sin ambigüedad visual (sin 0/O, 1/l/I).
_SAFE_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_SAFE_LOWER = "abcdefghijkmnopqrstuvwxyz"
_SAFE_DIGITS = "23456789"
_SAFE_SYMBOLS = "!@#$%&*+=-"


def generar_password_temporal(longitud: int = 14) -> str:
    """
    Genera una contraseña temporal «PRO»: longitud ≥12, mezclando
    mayúsculas, minúsculas, dígitos y símbolo, sin caracteres ambiguos.
    """
    n = max(12, int(longitud or 14))
    # Garantizar al menos un carácter de cada clase
    required = [
        secrets.choice(_SAFE_UPPER),
        secrets.choice(_SAFE_LOWER),
        secrets.choice(_SAFE_DIGITS),
        secrets.choice(_SAFE_SYMBOLS),
    ]
    alphabet = _SAFE_UPPER + _SAFE_LOWER + _SAFE_DIGITS + _SAFE_SYMBOLS
    rest = [secrets.choice(alphabet) for _ in range(n - len(required))]
    chars = required + rest
    # Mezcla criptográfica
    for i in range(len(chars) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


def enlace_reset_app(email: str) -> str:
    base = plataforma_url()
    return f"{base}/?reset=1&email={quote(email or '', safe='')}"


def _cuerpo_html(*, nombre: str, email: str, temp_password: str, link: str) -> str:
    nombre_e = html.escape((nombre or "").strip() or "usuario")
    email_e = html.escape(email or "")
    temp_e = html.escape(temp_password or "")
    link_e = html.escape(link or "")
    return f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Hola <strong>{nombre_e}</strong>,
    </p>
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Un administrador autorizó el restablecimiento de tu contraseña en
      <strong>ClaraCore</strong> para la cuenta <strong>{email_e}</strong>.
    </p>
    <p style="margin:0 0 8px 0;line-height:1.65;color:#0f172a;font-weight:700;">
      Contraseña temporal
    </p>
    <p style="margin:0 0 20px 0;padding:14px 16px;background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;font-family:Consolas,Monaco,monospace;font-size:18px;letter-spacing:1px;color:#0f172a;word-break:break-all;">
      {temp_e}
    </p>
    <p style="margin:0 0 20px 0;line-height:1.65;color:#334155;">
      Abre el siguiente enlace para ingresar la contraseña temporal y definir tu nueva clave
      (no compartas este correo).
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="{link_e}" style="display:inline-block;background:linear-gradient(90deg,{_COLOR_AZUL},{_COLOR_VERDE});color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">
        Continuar restablecimiento
      </a>
    </p>
    <p style="margin:0;line-height:1.65;color:#64748b;font-size:13px;">
      Si el botón no funciona, copia y pega esta URL en el navegador:<br/>
      <span style="word-break:break-all;color:{_COLOR_AZUL};">{link_e}</span>
    </p>
    <p style="margin:16px 0 0;line-height:1.65;color:#64748b;font-size:13px;">
      Este es un correo automático. Si no solicitaste el cambio, escribe a
      <a href="mailto:{_CONTACTO_EMAIL}" style="color:{_COLOR_AZUL};">{_CONTACTO_EMAIL}</a>.
    </p>
  </div>
  {_firma_html_institucional()}
</div>
</body>
</html>"""


def _cuerpo_texto(*, nombre: str, email: str, temp_password: str, link: str) -> str:
    nom = (nombre or "").strip() or "usuario"
    return (
        f"Hola {nom},\n\n"
        f"Un administrador autorizó el restablecimiento de tu contraseña en ClaraCore ({email}).\n\n"
        f"Contraseña temporal:\n{temp_password}\n\n"
        f"Abre este enlace para continuar y definir tu nueva contraseña:\n{link}\n\n"
        f"Si no solicitaste este cambio, escribe a {_CONTACTO_EMAIL}.\n"
    )


def send_password_reset_email(
    *,
    destinatario: str,
    nombre_completo: str,
    temp_password: str,
) -> str:
    """
    Envía correo con contraseña temporal + link al popup.
    Retorna el asunto. Lanza BienvenidaEmailError si SMTP no está listo.
    """
    to_addr = (destinatario or "").strip().lower()
    if not to_addr:
        raise BienvenidaEmailError("Destinatario vacío.")
    if not (temp_password or "").strip():
        raise BienvenidaEmailError("Contraseña temporal vacía.")
    if not contacto_smtp_configured():
        raise BienvenidaEmailError(
            "SMTP de contacto no configurado (CLARACORE_CONTACTO_SMTP_USER / PASSWORD)."
        )

    import smtplib
    from email.message import EmailMessage

    cfg = _smtp_settings()
    link = enlace_reset_app(to_addr)
    subject = "ClaraCore — Contraseña temporal para restablecer tu acceso"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_addr
    msg.set_content(
        _cuerpo_texto(
            nombre=nombre_completo,
            email=to_addr,
            temp_password=temp_password,
            link=link,
        )
    )
    msg.add_alternative(
        _cuerpo_html(
            nombre=nombre_completo,
            email=to_addr,
            temp_password=temp_password,
            link=link,
        ),
        subtype="html",
    )

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
        if cfg["use_tls"]:
            smtp.starttls()
        smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(msg)
    _log.info("Correo reset enviado a %s", to_addr)
    return subject
