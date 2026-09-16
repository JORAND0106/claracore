"""
Correo inmediato al asignar una tarea o un compromiso (solo al responsable).

Cubre también tareas personales autoasignadas (sin delegante distinto).
No se envía a la persona «notificada» ni a referencias informativas.

Se dispara en el momento de creación/asignación (o reasignación), con plantilla
institucional alineada al recordatorio del día hábil anterior.

Usa SMTP de contacto (mismo canal que bienvenida/reset/recordatorio hábil),
independiente del kill-switch NOTIFICACIONES_EMAIL_ENVIO_ACTIVO.

No reemplaza el recordatorio programado: tipos distintos en
notificaciones_email_envio (JOB_TIPO distinto).
"""
from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Optional, Tuple

_log = logging.getLogger("claracore.seguimiento.asignacion_email")

JOB_TIPO = "seguimiento_asignacion_inmediata"

_COLOR_AZUL = "rgb(0,119,182)"
_COLOR_VERDE = "rgb(0,168,150)"


def _plataforma_url() -> str:
    import os
    return (os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co").strip().rstrip("/")


def _contacto_smtp_configured() -> bool:
    try:
        from usuario_bienvenida_email import contacto_smtp_configured
        return bool(contacto_smtp_configured())
    except Exception:
        return False


def _smtp_settings_contacto() -> dict:
    from usuario_bienvenida_email import _smtp_settings
    return _smtp_settings()


def _firma_html() -> str:
    try:
        from usuario_bienvenida_email import _firma_html_institucional
        return _firma_html_institucional()
    except Exception:
        return (
            '<p style="margin-top:24px;font-size:12px;color:#64748b;">'
            "ClaraCore · contactenos@claracore.co</p>"
        )


def _fmt_fecha_es(iso: Optional[str]) -> str:
    s = str(iso or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        y, m, d = s.split("-")
        return f"{d}/{m}/{y}"
    return s or "—"


def _fmt_hora(h: Optional[str]) -> Optional[str]:
    if not h:
        return None
    t = str(h).strip()[:5]
    return t if len(t) >= 4 else None


def _nombre_usuario_row(row: Optional[dict]) -> str:
    if not row:
        return ""
    nom = f"{row.get('nombre') or ''} {row.get('apellidos') or ''}".strip()
    return nom or (row.get("email") or "") or f"Usuario #{row.get('id')}"


def _load_usuario(sb: Any, usuario_id: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("usuarios")
            .select("id,email,nombre,apellidos,estado,activo")
            .eq("id", int(usuario_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception as exc:
        _log.warning("load usuario %s para email asignación: %s", usuario_id, exc)
        return None


def _usuario_elegible(u: Optional[dict]) -> bool:
    if not u:
        return False
    try:
        from usuarios_notif_elegibilidad import usuario_puede_recibir_notificaciones_automaticas
        if not usuario_puede_recibir_notificaciones_automaticas(u):
            return False
    except Exception:
        # Si el helper no está disponible, exigir estado aprobado si viene en la fila
        est = (str(u.get("estado") or "")).strip().lower()
        if est and est != "aprobado":
            return False
    if u.get("activo") is False:
        return False
    return bool((u.get("email") or "").strip())


def build_asignacion_email_bodies(
    *,
    nombre_destinatario: str,
    tipo: str,
    titulo: str,
    detalle: Optional[str] = None,
    delegado_por: Optional[str] = None,
    fecha_vencimiento: Optional[str] = None,
    hora_vencimiento: Optional[str] = None,
    reasignacion: bool = False,
    contexto: Optional[str] = None,
    es_personal: bool = False,
) -> Tuple[str, str, str]:
    """Retorna (asunto, text, html). tipo: tarea | compromiso.

    ``es_personal``: tarea propia autoasignada (sin delegante distinto).
    """
    tipo_n = (tipo or "tarea").strip().lower()
    if tipo_n not in ("tarea", "compromiso"):
        tipo_n = "tarea"
    label = "Tarea" if tipo_n == "tarea" else "Compromiso"
    color = _COLOR_AZUL if tipo_n == "tarea" else _COLOR_VERDE
    titulo_clean = (titulo or label).strip() or label
    fv = _fmt_fecha_es(fecha_vencimiento)
    hora = _fmt_hora(hora_vencimiento)
    personal = bool(es_personal) and tipo_n == "tarea"

    if personal:
        verbo_txt = "registró"
        accion = "personal registrada"
        intro_txt = (
            f"Se registró la siguiente {label.lower()} personal en Seguimiento"
        )
        intro_html = (
            f"Se registró la siguiente <strong>{html.escape(label.lower())} personal</strong> "
            f"en el módulo de <strong>Seguimiento</strong> de ClaraCore."
        )
        # Sin delegante en tareas personales
        delegado_por = None
    else:
        verbo_txt = "reasignó" if reasignacion else "asignó"
        accion = "reasignada" if reasignacion else "asignada"
        intro_txt = (
            f"Se le {verbo_txt} la siguiente {label.lower()} en Seguimiento"
        )
        intro_html = (
            f"Se le <strong>{html.escape(verbo_txt)}</strong> una "
            f"{html.escape(label.lower())} en el módulo de <strong>Seguimiento</strong> "
            f"de ClaraCore. Revise el detalle a continuación."
        )

    asunto = f"ClaraCore — {label} {accion}: {titulo_clean[:80]}"

    hora_txt = f" a las {hora}" if hora else ""
    delg_txt = f"\nDelegado por: {delegado_por}" if delegado_por else ""
    ctx_txt = f"\n{contexto}" if contexto else ""
    det_txt = f"\n\nDetalle:\n{detalle.strip()}" if (detalle or "").strip() else ""

    text = (
        f"Hola {nombre_destinatario or ''},\n\n"
        f"{intro_txt}:\n\n"
        f"«{titulo_clean}»{det_txt}{ctx_txt}\n"
        f"Vencimiento: {fv}{hora_txt}{delg_txt}\n\n"
        f"Consulte el detalle en ClaraCore: {_plataforma_url()}\n"
    )

    hora_html = (
        f'<div style="color:#64748b;font-size:13px;margin-top:4px;">Hora: '
        f"<strong>{html.escape(hora)}</strong></div>"
        if hora
        else ""
    )
    delg_html = (
        f'<div style="color:#64748b;font-size:13px;margin-top:4px;">Delegado por: '
        f"<strong>{html.escape(delegado_por)}</strong></div>"
        if delegado_por
        else ""
    )
    ctx_html = (
        f'<div style="color:#64748b;font-size:13px;margin-top:4px;">'
        f"{html.escape(contexto)}</div>"
        if contexto
        else ""
    )
    det_html = ""
    if (detalle or "").strip():
        det_esc = html.escape(detalle.strip()).replace("\n", "<br>")
        det_html = (
            f'<div style="color:#475569;font-size:13px;margin-top:10px;line-height:1.5;">'
            f"{det_esc}</div>"
        )

    header_card = "Tarea personal" if personal else f"{label} {accion}"
    url = _plataforma_url()
    card = f"""
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:18px 0 8px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  <tr>
    <td style="background:{color};color:#fff;padding:10px 14px;font-weight:700;font-size:13px;letter-spacing:0.02em;">
      {html.escape(header_card)}
    </td>
  </tr>
  <tr>
    <td style="padding:12px 14px;">
      <div style="font-weight:700;color:#0f172a;font-size:15px;line-height:1.4;">
        {html.escape(titulo_clean)}
      </div>
      {det_html}
      {ctx_html}
      <div style="color:#64748b;font-size:13px;margin-top:10px;">
        Vencimiento: <strong style="color:#0f172a;">{html.escape(fv)}</strong>
      </div>
      {hora_html}
      {delg_html}
    </td>
  </tr>
</table>
"""
    body = f"""
<p style="margin:0 0 14px;line-height:1.6;color:#334155;">
  Hola <strong>{html.escape(nombre_destinatario or 'usuario')}</strong>,
</p>
<p style="margin:0 0 8px;line-height:1.6;color:#334155;">
  {intro_html}
</p>
{card}
<p style="margin:20px 0 0;text-align:center;">
  <a href="{html.escape(url)}"
     style="display:inline-block;background:{_COLOR_AZUL};color:#fff;text-decoration:none;
            font-weight:700;padding:12px 22px;border-radius:8px;">
    Abrir Seguimiento en ClaraCore
  </a>
</p>
{_firma_html()}
"""
    h1 = "Tarea personal" if personal else f"{label} {accion}"
    html_doc = f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:{_COLOR_AZUL};text-transform:uppercase;margin-bottom:8px;">
      Seguimiento · Asignación
    </div>
    <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#0f172a;">
      {html.escape(h1)}
    </h1>
    {body}
  </div>
</div>
</body>
</html>"""
    return asunto, text, html_doc


def _slot_key(*, tipo: str, item_id: int, destinatario_id: int, reasignacion: bool) -> str:
    kind = "reasign" if reasignacion else "nuevo"
    return f"{tipo}-{kind}-{int(item_id)}-{int(destinatario_id)}"


def _ya_enviado(sb: Any, *, usuario_id: int, slot_key: str) -> bool:
    try:
        rows = (
            sb.table("notificaciones_email_envio")
            .select("id")
            .eq("tipo", JOB_TIPO)
            .eq("slot_key", slot_key)
            .eq("usuario_id", int(usuario_id))
            .is_("contrato_id", "null")
            .limit(1)
            .execute()
            .data
            or []
        )
        return bool(rows)
    except Exception as exc:
        _log.warning("check envio asignación: %s", exc)
        return False


def _registrar_envio(
    sb: Any,
    *,
    usuario_id: int,
    slot_key: str,
    destinatario: str,
    exito: bool,
    error: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    row = {
        "tipo": JOB_TIPO,
        "slot_key": slot_key,
        "usuario_id": int(usuario_id),
        "contrato_id": None,
        "destinatario": (destinatario or "")[:320],
        "exito": bool(exito),
        "error_detalle": (error or "")[:500] or None,
        "meta": meta or {},
    }
    try:
        sb.table("notificaciones_email_envio").upsert(
            row, on_conflict="tipo,slot_key,usuario_id,contrato_id"
        ).execute()
    except Exception:
        try:
            sb.table("notificaciones_email_envio").insert(row).execute()
        except Exception as exc:
            _log.warning("registrar envio asignación: %s", exc)


def _send_smtp(to_addr: str, subject: str, text: str, html_body: str) -> bool:
    to_addr = (to_addr or "").strip()
    if not to_addr:
        return False
    if not _contacto_smtp_configured():
        _log.warning("SMTP contacto no configurado; omitiendo email asignación → %s", to_addr)
        return False
    cfg = _smtp_settings_contacto()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_addr
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=45) as smtp:
        smtp.ehlo()
        if cfg["use_tls"]:
            smtp.starttls()
            smtp.ehlo()
        if cfg["user"] and cfg["password"]:
            smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(msg)
    _log.info("Email asignación Seguimiento enviado a %s — %s", to_addr, subject[:80])
    return True


def enviar_email_asignacion_inmediata(
    sb: Any,
    *,
    destinatario_id: int,
    remitente_id: int,
    tipo: str,
    titulo: str,
    item_id: int,
    fecha_vencimiento: Optional[str] = None,
    hora_vencimiento: Optional[str] = None,
    detalle: Optional[str] = None,
    contexto: Optional[str] = None,
    reasignacion: bool = False,
    es_personal: bool = False,
) -> bool:
    """
    Envía el correo de asignación al responsable (nunca a «notificado»).

    Incluye tareas personales autoasignadas (``es_personal=True`` o dest==remitente
    en tarea). Nunca lanza: fallos SMTP/BD se registran y se retorna False.
    """
    try:
        dest_id = int(destinatario_id or 0)
        rem_id = int(remitente_id or 0)
    except (TypeError, ValueError):
        return False
    if dest_id <= 0:
        return False

    tipo_n = (tipo or "tarea").strip().lower()
    if tipo_n not in ("tarea", "compromiso"):
        tipo_n = "tarea"

    # Tarea personal: autoasignada (sin delegante distinto).
    personal = bool(es_personal) or (tipo_n == "tarea" and rem_id and dest_id == rem_id)
    # Compromiso autoasignado: también se notifica al responsable.
    # (No hay «persona notificada» en este canal.)

    slot = _slot_key(
        tipo=tipo_n,
        item_id=int(item_id),
        destinatario_id=dest_id,
        reasignacion=bool(reasignacion),
    )
    if _ya_enviado(sb, usuario_id=dest_id, slot_key=slot):
        return False

    dest = _load_usuario(sb, dest_id)
    if not _usuario_elegible(dest):
        _log.info(
            "omitiendo email asignación dest=%s (sin email o no elegible)",
            dest_id,
        )
        return False

    rem = _load_usuario(sb, rem_id) if (rem_id and rem_id != dest_id and not personal) else None
    delegado = _nombre_usuario_row(rem) if rem else None

    nombre = _nombre_usuario_row(dest)
    email = (dest.get("email") or "").strip()

    asunto, text, html_body = build_asignacion_email_bodies(
        nombre_destinatario=nombre,
        tipo=tipo_n,
        titulo=titulo or "",
        detalle=detalle,
        delegado_por=delegado,
        fecha_vencimiento=fecha_vencimiento,
        hora_vencimiento=hora_vencimiento,
        reasignacion=bool(reasignacion),
        contexto=contexto,
        es_personal=bool(personal),
    )
    meta = {
        "tipo": tipo_n,
        "item_id": int(item_id),
        "remitente_id": rem_id or None,
        "reasignacion": bool(reasignacion),
        "es_personal": bool(personal),
        "fecha_vencimiento": (str(fecha_vencimiento)[:10] if fecha_vencimiento else None),
    }
    try:
        ok = _send_smtp(email, asunto, text, html_body)
        _registrar_envio(
            sb,
            usuario_id=dest_id,
            slot_key=slot,
            destinatario=email,
            exito=ok,
            error=None if ok else "smtp_fallo_o_no_configurado",
            meta=meta,
        )
        return bool(ok)
    except Exception as exc:
        _log.exception("Error enviando email asignación a %s", email)
        try:
            _registrar_envio(
                sb,
                usuario_id=dest_id,
                slot_key=slot,
                destinatario=email,
                exito=False,
                error=str(exc)[:500],
                meta=meta,
            )
        except Exception:
            pass
        return False
