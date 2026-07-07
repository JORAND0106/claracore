"""
Correo SMTP — órdenes de pago (Zoho Mail / facturacion@claracore.co).

Variables de entorno (prefijo CLARACORE_FACTURACION_*):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL, FROM_NAME, SMTP_TLS
"""

from __future__ import annotations

import base64
import html
import logging
import os
import smtplib
from datetime import date
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Sequence

from contrato_documentos_service import logo_claracore_path
from contrato_numero_letras import formato_pesos_cop

_log = logging.getLogger("claracore.contrato_orden_pago.email")

_COLOR_AZUL = "rgb(0,119,182)"
_COLOR_VERDE = "rgb(0,168,150)"


class OrdenPagoEmailError(Exception):
    """Fallo al enviar correo de orden de pago."""


def facturacion_smtp_configured() -> bool:
    host = (os.getenv("CLARACORE_FACTURACION_SMTP_HOST") or "").strip()
    user = (os.getenv("CLARACORE_FACTURACION_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_FACTURACION_SMTP_PASSWORD") or "").strip()
    return bool(host and user and password)


def _smtp_settings() -> dict:
    host = (os.getenv("CLARACORE_FACTURACION_SMTP_HOST") or "").strip()
    if not host:
        raise OrdenPagoEmailError(
            "SMTP de facturación no configurado (CLARACORE_FACTURACION_SMTP_HOST)."
        )
    port = int(os.getenv("CLARACORE_FACTURACION_SMTP_PORT") or "587")
    user = (os.getenv("CLARACORE_FACTURACION_SMTP_USER") or "").strip()
    password = (os.getenv("CLARACORE_FACTURACION_SMTP_PASSWORD") or "").strip()
    if not user or not password:
        raise OrdenPagoEmailError(
            "Credenciales SMTP incompletas (CLARACORE_FACTURACION_SMTP_USER / PASSWORD)."
        )
    from_email = (
        os.getenv("CLARACORE_FACTURACION_FROM_EMAIL") or user or "facturacion@claracore.co"
    ).strip()
    from_name = (
        os.getenv("CLARACORE_FACTURACION_FROM_NAME") or "Facturación ClaraCore"
    ).strip()
    use_tls = (
        os.getenv("CLARACORE_FACTURACION_SMTP_TLS", "1").strip().lower()
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


def _fmt_fecha(d: Optional[date | str]) -> str:
    if not d:
        return "—"
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    s = str(d).strip()[:10]
    try:
        y, m, day = s.split("-")
        return f"{day}/{m}/{y}"
    except ValueError:
        return s


def asunto_orden_pago(*, numero_contrato: str, numero_corte: int, periodo_inicio, periodo_fin) -> str:
    nc = (numero_contrato or "").strip() or "—"
    corte = f"{int(numero_corte):03d}"
    periodo = _periodo_etiqueta(periodo_inicio, periodo_fin)
    return f"Orden de Pago N.° {corte} — Contrato {nc} — Período {periodo}"


def _periodo_etiqueta(periodo_inicio, periodo_fin) -> str:
    return f"{_fmt_fecha(periodo_inicio)} — {_fmt_fecha(periodo_fin)}"


def _total_a_pagar_etiqueta(monto_fmt: str) -> str:
    m = (monto_fmt or "—").strip()
    return f"$ {m} COP" if m != "—" else m


def _bloque_mensaje_adicional(mensaje_adicional: Optional[str], *, as_html: bool) -> str:
    texto = (mensaje_adicional or "").strip()
    if not texto:
        return ""
    if as_html:
        return (
            f'<p style="margin:16px 0;line-height:1.65;color:#334155;">'
            f"{html.escape(texto)}</p>"
        )
    return f"{texto}\n\n"


def _parrafos_cuerpo_orden_pago(ctx: Dict[str, Any], *, mensaje_adicional: Optional[str] = None) -> dict:
    numero_contrato = (ctx.get("numero_contrato") or "—").strip() or "—"
    numero_corte = ctx.get("numero_corte_fmt") or "—"
    periodo = ctx.get("periodo_etiqueta") or "—"
    total = _total_a_pagar_etiqueta(str(ctx.get("monto_fmt") or "—"))
    return {
        "numero_contrato": numero_contrato,
        "numero_corte": numero_corte,
        "periodo": periodo,
        "total_a_pagar": total,
        "mensaje_adicional": _bloque_mensaje_adicional(mensaje_adicional, as_html=False),
        "mensaje_adicional_html": _bloque_mensaje_adicional(mensaje_adicional, as_html=True),
    }


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
        f'<img src="{logo}" alt="ClaraCore" width="140" style="display:block;border:0;max-width:140px;height:auto;" />'
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
      <div style="font-weight:700;color:{_COLOR_AZUL};font-size:14px;margin-bottom:4px;">Área de Facturación</div>
      <div style="font-weight:700;color:#0f172a;margin-bottom:8px;">CLARACORE SOLUTIONS S.A.S.</div>
      <div style="line-height:1.55;color:#475569;">
        <a href="mailto:facturacion@claracore.co" style="color:{_COLOR_AZUL};text-decoration:none;">facturacion@claracore.co</a><br/>
        <a href="https://claracore.co" style="color:{_COLOR_AZUL};text-decoration:none;">claracore.co</a><br/>
        Bogotá, Colombia
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.5;color:#64748b;">
        <strong>Aviso de confidencialidad:</strong> Este mensaje y sus anexos pueden contener información
        confidencial o privilegiada de CLARACORE SOLUTIONS S.A.S. Si usted no es el destinatario,
        elimínelo y notifíquelo al remitente. Queda prohibida su divulgación, copia o uso no autorizado.
      </div>
    </td>
  </tr>
</table>"""


def cuerpo_html_orden_pago(
    ctx: Dict[str, Any],
    *,
    mensaje_adicional: Optional[str] = None,
) -> str:
    """Plantilla HTML institucional automatizada (sin saludos ni despedidas personales)."""
    p = _parrafos_cuerpo_orden_pago(ctx, mensaje_adicional=mensaje_adicional)
    numero_contrato = html.escape(p["numero_contrato"])
    numero_corte = html.escape(p["numero_corte"])
    periodo = html.escape(p["periodo"])
    total = html.escape(p["total_a_pagar"])

    return f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Este es un mensaje automático generado por la plataforma ClaraCore.
    </p>
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      <strong>CLARACORE SOLUTIONS S.A.S.</strong> le ha enviado la Orden de Pago N.° <strong>{numero_corte}</strong>
      correspondiente al contrato <strong>{numero_contrato}</strong>, período <strong>{periodo}</strong>,
      por valor de <strong>{total}</strong>.
    </p>
    <p style="margin:0 0 16px 0;line-height:1.65;color:#334155;">
      Encontrará el documento adjunto en formato PDF para su revisión y aprobación. Una vez revisado,
      le solicitamos enviarnos el soporte de aprobación a este mismo correo para proceder con la emisión
      de la factura electrónica correspondiente.
    </p>
    {p["mensaje_adicional_html"]}<p style="margin:0;line-height:1.65;color:#64748b;font-size:13px;">
      Este documento no reemplaza la factura electrónica.
    </p>
  </div>
  {_firma_html_institucional()}
</div>
</body>
</html>"""


def cuerpo_texto_orden_pago(ctx: Dict[str, Any], *, mensaje_adicional: Optional[str] = None) -> str:
    p = _parrafos_cuerpo_orden_pago(ctx, mensaje_adicional=mensaje_adicional)
    return (
        "Este es un mensaje automático generado por la plataforma ClaraCore.\n\n"
        f"CLARACORE SOLUTIONS S.A.S. le ha enviado la Orden de Pago N.° {p['numero_corte']} "
        f"correspondiente al contrato {p['numero_contrato']}, período {p['periodo']}, "
        f"por valor de {p['total_a_pagar']}.\n\n"
        "Encontrará el documento adjunto en formato PDF para su revisión y aprobación. Una vez revisado, "
        "le solicitamos enviarnos el soporte de aprobación a este mismo correo para proceder con la emisión "
        "de la factura electrónica correspondiente.\n\n"
        f"{p['mensaje_adicional']}"
        "Este documento no reemplaza la factura electrónica."
    )


def build_email_context(
    *,
    numero_contrato: str,
    numero_corte: int,
    periodo_inicio,
    periodo_fin,
    fecha_vencimiento,
    monto_total: int,
    razon_social: str = "",
    destinatario_email: str = "",
) -> dict:
    return {
        "numero_contrato": numero_contrato,
        "numero_corte_fmt": f"{int(numero_corte):03d}",
        "periodo_etiqueta": _periodo_etiqueta(periodo_inicio, periodo_fin),
        "fecha_vencimiento_fmt": _fmt_fecha(fecha_vencimiento),
        "monto_fmt": formato_pesos_cop(monto_total),
        "razon_social": razon_social,
        "destinatario_etiqueta": destinatario_email or "estimado cliente",
    }


def send_orden_pago_email(
    *,
    destinatarios: Sequence[str],
    subject: str,
    html_body: str,
    text_body: str,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> None:
    """Envía un correo con PDF adjunto a todos los destinatarios (To). Lanza OrdenPagoEmailError si falla."""
    recipients = [str(e).strip().lower() for e in destinatarios if str(e).strip()]
    if not recipients:
        raise OrdenPagoEmailError("No hay destinatarios de correo.")

    cfg = _smtp_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = ", ".join(recipients)
    msg["Reply-To"] = cfg["from_email"]
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=pdf_filename or "orden_pago.pdf",
    )

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
            smtp.ehlo()
            if cfg["use_tls"]:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(cfg["user"], cfg["password"])
            smtp.send_message(msg)
    except Exception as exc:
        _log.exception("Envío orden pago SMTP falló dest=%s", recipients)
        raise OrdenPagoEmailError(f"No se pudo enviar el correo: {exc}") from exc

    _log.info("Orden pago enviada por SMTP a %s asunto=%s", recipients, subject[:80])
