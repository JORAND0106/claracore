"""
Correo al quedar vencido un compromiso / actividad del Plan.

Remitente: contactenos@claracore.co (SMTP contacto).
Destinatarios: solicitante + todos los asignados.
"""
from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Optional, Set

_log = logging.getLogger("claracore.seguimiento.vencimiento_email")

JOB_TIPO = "seguimiento_vencimiento"


def _plataforma_url() -> str:
    import os
    return (os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co").strip().rstrip("/")


def enviar_email_vencida(
    sb: Any,
    *,
    item: dict,
    destinatario_ids: Optional[Set[int]] = None,
) -> dict:
    """Envía correo «vencida» a solicitante y asignados. Registra éxito/fallo."""
    try:
        from seguimiento_asignacion_email import (
            _contacto_smtp_configured,
            _firma_html,
            _fmt_fecha_es,
            _load_usuario,
            _nombre_usuario_row,
            _registrar_envio,
            _smtp_settings_contacto,
            _usuario_elegible,
        )
    except Exception as exc:
        _log.warning("import vencimiento email: %s", exc)
        return {"ok": False, "reason": "import"}

    if not _contacto_smtp_configured():
        return {"ok": False, "reason": "smtp"}

    ids: Set[int] = set(destinatario_ids or set())
    try:
        if item.get("solicitante_id"):
            ids.add(int(item["solicitante_id"]))
    except (TypeError, ValueError):
        pass
    try:
        if item.get("asignado_a_id"):
            ids.add(int(item["asignado_a_id"]))
    except (TypeError, ValueError):
        pass
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    for a in (libres.get("asignaciones") or []):
        if not isinstance(a, dict):
            continue
        try:
            uid = int(a.get("usuario_id") or a.get("id") or 0)
        except (TypeError, ValueError):
            uid = 0
        if uid:
            ids.add(uid)

    titulo = (item.get("titulo") or "Compromiso").strip()
    fv = _fmt_fecha_es(item.get("fecha_vencimiento") or item.get("fecha_fin"))
    origen = str(item.get("origen") or "compromiso")
    label = "Actividad del Plan" if origen == "plan_actividad" else "Compromiso"
    item_id = int(item.get("id") or 0)
    url = f"{_plataforma_url()}/?seguimiento_item={item_id}" if item_id else _plataforma_url()
    enviados = 0
    fallidos = 0

    for uid in ids:
        dest = _load_usuario(sb, uid)
        if not _usuario_elegible(dest):
            continue
        nombre = _nombre_usuario_row(dest)
        email = (dest.get("email") or "").strip()
        asunto = f"ClaraCore — {label} vencida: {titulo[:80]}"
        text = (
            f"Hola {nombre},\n\n"
            f"El siguiente {label.lower()} figura como vencido en Seguimiento:\n\n"
            f"«{titulo}»\n"
            f"Vencimiento: {fv}\n\n"
            f"Revise el detalle y actualice el estado o justifique en ClaraCore:\n{url}\n"
        )
        html_body = f"""
<div style="font-family:Helvetica,Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;">
  <p>Hola <strong>{html.escape(nombre)}</strong>,</p>
  <p>El siguiente <strong>{html.escape(label.lower())}</strong> figura como
  <strong style="color:#dc2626;">vencido</strong>:</p>
  <div style="margin:16px 0;padding:12px 14px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <div style="font-weight:700;">{html.escape(titulo)}</div>
    <div style="color:#64748b;font-size:13px;margin-top:4px;">Vencimiento: {html.escape(fv)}</div>
  </div>
  <p><a href="{html.escape(url)}" style="display:inline-block;padding:10px 16px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
    Abrir en ClaraCore
  </a></p>
  {_firma_html()}
</div>
"""
        slot = f"vencida-{item_id}-{uid}"
        try:
            cfg = _smtp_settings_contacto()
            msg = EmailMessage()
            msg["Subject"] = asunto
            msg["From"] = cfg.get("from") or "contactenos@claracore.co"
            msg["To"] = email
            msg.set_content(text)
            msg.add_alternative(html_body, subtype="html")
            with smtplib.SMTP(cfg["host"], int(cfg["port"])) as smtp:
                if cfg.get("use_tls"):
                    smtp.starttls()
                if cfg.get("user"):
                    smtp.login(cfg["user"], cfg.get("password") or "")
                smtp.send_message(msg)
            _registrar_envio(
                sb,
                usuario_id=int(uid),
                slot_key=slot[:200],
                destinatario=email,
                exito=True,
                meta={"job": JOB_TIPO, "item_id": item_id, "titulo": titulo},
            )
            enviados += 1
        except Exception as exc:
            fallidos += 1
            _log.exception("email vencida item=%s dest=%s: %s", item_id, uid, exc)
            try:
                _registrar_envio(
                    sb,
                    usuario_id=int(uid),
                    slot_key=slot[:200],
                    destinatario=email,
                    exito=False,
                    error=str(exc)[:500],
                    meta={"job": JOB_TIPO, "item_id": item_id},
                )
            except Exception:
                pass

    return {"ok": True, "enviados": enviados, "fallidos": fallidos}
