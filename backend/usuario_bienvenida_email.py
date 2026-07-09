"""
Correo SMTP — bienvenida al aprobar usuario (Zoho Mail / contactenos@claracore.co).

Variables de entorno (prefijo CLARACORE_CONTACTO_*):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL, FROM_NAME, SMTP_TLS
  (HOST/PORT/TLS pueden reutilizar los de facturación si no están definidos)
  CLARACORE_APP_URL — enlace a la plataforma (default https://app.claracore.co)
"""

from __future__ import annotations

import base64
import html
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional, Tuple

from contrato_documentos_service import logo_claracore_path

_log = logging.getLogger("claracore.usuario_bienvenida.email")

_COLOR_AZUL = "rgb(0,119,182)"
_COLOR_VERDE = "rgb(0,168,150)"
_CONTACTO_EMAIL = "contactenos@claracore.co"


class BienvenidaEmailError(Exception):
    """Fallo al enviar correo de bienvenida."""


def contacto_smtp_configured() -> bool:
    host = (
        os.getenv("CLARACORE_CONTACTO_SMTP_HOST")
        or os.getenv("CLARACORE_FACTURACION_SMTP_HOST")
        or ""
    ).strip()
    user = (os.getenv("CLARACORE_CONTACTO_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_CONTACTO_SMTP_PASSWORD") or "").strip()
    return bool(host and user and password)


def _smtp_settings() -> dict:
    host = (
        os.getenv("CLARACORE_CONTACTO_SMTP_HOST")
        or os.getenv("CLARACORE_FACTURACION_SMTP_HOST")
        or ""
    ).strip()
    if not host:
        raise BienvenidaEmailError(
            "SMTP de contacto no configurado (CLARACORE_CONTACTO_SMTP_HOST o FACTURACION)."
        )
    port = int(
        os.getenv("CLARACORE_CONTACTO_SMTP_PORT")
        or os.getenv("CLARACORE_FACTURACION_SMTP_PORT")
        or "587"
    )
    user = (os.getenv("CLARACORE_CONTACTO_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_CONTACTO_SMTP_PASSWORD") or "").strip()
    if not user or not password:
        raise BienvenidaEmailError(
            "Credenciales SMTP incompletas (CLARACORE_CONTACTO_SMTP_USER / PASSWORD)."
        )
    from_email = (
        os.getenv("CLARACORE_CONTACTO_FROM_EMAIL") or user or _CONTACTO_EMAIL
    ).strip()
    from_name = (os.getenv("CLARACORE_CONTACTO_FROM_NAME") or "ClaraCore").strip()
    use_tls = (
        (
            os.getenv("CLARACORE_CONTACTO_SMTP_TLS")
            or os.getenv("CLARACORE_FACTURACION_SMTP_TLS")
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


def plataforma_url() -> str:
    return (
        os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co"
    ).strip().rstrip("/")


def _norm_cargo(cargo_nombre: Optional[str]) -> str:
    s = (cargo_nombre or "").strip().lower()
    s = "".join(c for c in s if c.isalnum() or c.isspace())
    return " ".join(s.split())


def instrucciones_por_cargo(cargo_nombre: Optional[str]) -> Tuple[str, str]:
    """
    Retorna (titulo_seccion, cuerpo_texto) adaptado al cargo.
    """
    n = _norm_cargo(cargo_nombre)
    if "inspector" in n:
        return (
            "Primeros pasos — Inspector",
            "Ingresa a la plataforma y abre el módulo SICOE Obra. Desde allí podrás "
            "crear reportes y registrar cantidades de obra según el contrato asignado. "
            "Si tienes dudas sobre el flujo de registro, consulta las guías en Inicio "
            "o escribe a contactenos@claracore.co.",
        )
    if "residente" in n and "intervent" not in n:
        return (
            "Primeros pasos — Residente",
            "Ingresa a la plataforma y revisa los registros de cantidades en SICOE Obra. "
            "Tu rol incluye revisar y validar los registros del equipo de campo antes "
            "de que avancen en la cadena de validación. Usa el buzón de notificaciones "
            "para seguir comentarios y menciones.",
        )
    if "intervent" in n:
        return (
            "Primeros pasos — Interventoría",
            "Ingresa a la plataforma y accede al módulo de validación (SICOE Obra / "
            "Presupuesto según tus permisos). Allí podrás revisar, comentar y validar "
            "los registros que te correspondan en el flujo contractual.",
        )
    return (
        "Primeros pasos",
        "Ingresa a la plataforma con el correo con el que te registraste. En el menú "
        "principal encontrarás los módulos habilitados para tu cargo. Si necesitas "
        "acceso adicional, contacta al administrador de tu contrato o escribe a "
        "contactenos@claracore.co.",
    )


def _logo_data_uri() -> str:
    path = logo_claracore_path()
    if not os.path.isfile(path):
        return ""
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
        b64 = base64.b64encode(raw).decode("ascii")
        ext = os.path.splitext(path)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        return f"data:{mime};base64,{b64}"
    except OSError:
        return ""


def _firma_html_institucional() -> str:
    logo = _logo_data_uri()
    logo_img = (
        f'<img src="{logo}" alt="ClaraCore" width="140" '
        f'style="display:block;border:0;max-width:140px;height:auto;" />'
        if logo
        else '<span style="font-size:18px;font-weight:700;color:#fff;">ClaraCore</span>'
    )
    return f"""
<table cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;margin-top:28px;">
  <tr>
    <td style="background:linear-gradient(90deg,{_COLOR_AZUL},{_COLOR_VERDE});padding:14px 18px;border-radius:8px 8px 0 0;">
      {logo_img}
    </td>
  </tr>
  <tr>
    <td style="padding:16px 18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#f8fafc;">
      <div style="font-weight:700;color:{_COLOR_AZUL};font-size:14px;margin-bottom:4px;">Equipo ClaraCore</div>
      <div style="font-weight:700;color:#0f172a;margin-bottom:8px;">CLARACORE SOLUTIONS S.A.S.</div>
      <div style="line-height:1.55;color:#475569;">
        <a href="mailto:{_CONTACTO_EMAIL}" style="color:{_COLOR_AZUL};text-decoration:none;">{_CONTACTO_EMAIL}</a><br/>
        <a href="https://claracore.co" style="color:{_COLOR_AZUL};text-decoration:none;">claracore.co</a><br/>
        Bogotá, Colombia
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.5;color:#64748b;">
        <strong>Aviso:</strong> Este es un correo automático. Puede responder a
        {_CONTACTO_EMAIL} si necesita soporte. Este mensaje y sus anexos pueden contener
        información confidencial de CLARACORE SOLUTIONS S.A.S.
      </div>
    </td>
  </tr>
</table>"""


def asunto_bienvenida(nombre_completo: str) -> str:
    nom = (nombre_completo or "").strip() or "usuario"
    return f"Bienvenido(a) a ClaraCore, {nom}"


def cuerpo_html_bienvenida(
    *,
    nombre_completo: str,
    cargo_nombre: Optional[str] = None,
) -> str:
    nombre = html.escape((nombre_completo or "").strip() or "usuario")
    titulo_inst, cuerpo_inst = instrucciones_por_cargo(cargo_nombre)
    titulo_e = html.escape(titulo_inst)
    cuerpo_e = html.escape(cuerpo_inst)
    url = html.escape(plataforma_url())
    return f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Hola <strong>{nombre}</strong>,
    </p>
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Te damos la bienvenida a <strong>ClaraCore</strong>, la plataforma de gestión de obra
      de CLARACORE SOLUTIONS S.A.S.
    </p>
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Tu cuenta ya está <strong>activa</strong>. Puedes iniciar sesión con el correo con el
      que te registraste.
    </p>
    <p style="margin:0 0 8px 0;line-height:1.65;color:#0f172a;font-weight:700;">
      {titulo_e}
    </p>
    <p style="margin:0 0 20px 0;line-height:1.65;color:#334155;">
      {cuerpo_e}
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="{url}" style="display:inline-block;background:linear-gradient(90deg,{_COLOR_AZUL},{_COLOR_VERDE});color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">
        Ir a ClaraCore
      </a>
    </p>
    <p style="margin:0;line-height:1.65;color:#64748b;font-size:13px;">
      Este es un correo automático. Si necesitas ayuda, responde a
      <a href="mailto:{_CONTACTO_EMAIL}" style="color:{_COLOR_AZUL};">{_CONTACTO_EMAIL}</a>.
    </p>
  </div>
  {_firma_html_institucional()}
</div>
</body>
</html>"""


def cuerpo_texto_bienvenida(
    *,
    nombre_completo: str,
    cargo_nombre: Optional[str] = None,
) -> str:
    nombre = (nombre_completo or "").strip() or "usuario"
    titulo_inst, cuerpo_inst = instrucciones_por_cargo(cargo_nombre)
    url = plataforma_url()
    return (
        f"Hola {nombre},\n\n"
        "Te damos la bienvenida a ClaraCore, la plataforma de gestión de obra de "
        "CLARACORE SOLUTIONS S.A.S.\n\n"
        "Tu cuenta ya está activa. Puedes iniciar sesión con el correo con el que te registraste.\n\n"
        f"{titulo_inst}\n{cuerpo_inst}\n\n"
        f"Accede aquí: {url}\n\n"
        f"Este es un correo automático. Para soporte responde a {_CONTACTO_EMAIL}.\n"
    )


def send_bienvenida_email(
    *,
    destinatario: str,
    nombre_completo: str,
    cargo_nombre: Optional[str] = None,
) -> str:
    """
    Envía el correo de bienvenida. Retorna el asunto usado.
    Lanza BienvenidaEmailError si falla o no está configurado.
    """
    to_addr = (destinatario or "").strip().lower()
    if not to_addr:
        raise BienvenidaEmailError("Destinatario vacío.")
    if not contacto_smtp_configured():
        raise BienvenidaEmailError(
            "SMTP de contacto no configurado (CLARACORE_CONTACTO_SMTP_USER / PASSWORD)."
        )

    cfg = _smtp_settings()
    subject = asunto_bienvenida(nombre_completo)
    text_body = cuerpo_texto_bienvenida(
        nombre_completo=nombre_completo, cargo_nombre=cargo_nombre
    )
    html_body = cuerpo_html_bienvenida(
        nombre_completo=nombre_completo, cargo_nombre=cargo_nombre
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_addr
    msg["Reply-To"] = cfg["from_email"]
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
            smtp.ehlo()
            if cfg["use_tls"]:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(cfg["user"], cfg["password"])
            smtp.send_message(msg)
    except Exception as exc:
        _log.exception("Envío bienvenida SMTP falló dest=%s", to_addr)
        raise BienvenidaEmailError(f"No se pudo enviar el correo: {exc}") from exc

    _log.info("Bienvenida enviada por SMTP a %s asunto=%s", to_addr, subject[:80])
    return subject
