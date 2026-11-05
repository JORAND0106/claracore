"""
Dictado del Plan de actividades por el moderador (elaborador) del acta.

El moderador registra a nombre del expositor del tema mientras el acta está
abierta (borrador). Avisos al expositor se agrupan por sesión de dictado.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

_log = logging.getLogger("claracore.plan_actividades.dictado")

ENTIDAD_DIGEST = "plan_dictado_digest"
JOB_EMAIL = "plan_dictado_expositor"


def _nombre_usuario(row: Optional[dict]) -> str:
    if not row:
        return ""
    nom = f"{row.get('nombre') or ''} {row.get('apellidos') or ''}".strip()
    return nom or (row.get("email") or "") or f"Usuario #{row.get('id')}"


def _usuario_row(sb, uid: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("usuarios")
            .select("id,nombre,apellidos,email,activo,estado")
            .eq("id", int(uid))
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception:
        return None


def resolver_contexto_dictado(
    sb,
    *,
    acta_id: int,
    idea_id: Optional[int],
    user_id: int,
) -> dict:
    """Valida elaborador + acta abierta + expositor del tema. Raises ValueError/PermissionError."""
    from seguimiento_service import _acta_esta_sellada

    try:
        aid = int(acta_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Acta inválida para dictado del Plan") from exc
    rows = (
        sb.table("seguimiento_acta")
        .select("id, elaborador_id, estado, consecutivo, contrato_id, fecha_reunion")
        .eq("id", aid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Acta no encontrada")
    acta = rows[0]
    if _acta_esta_sellada(acta):
        raise PermissionError(
            "El acta está cerrada: el moderador ya no puede registrar ni editar "
            "actividades del Plan en nombre del expositor."
        )
    try:
        elab = int(acta.get("elaborador_id") or 0)
    except (TypeError, ValueError):
        elab = 0
    if elab != int(user_id):
        raise PermissionError("Solo el moderador (elaborador) del acta puede dictar el Plan.")

    expositor_id = None
    expositor_nombre = ""
    idea = None
    if idea_id is not None:
        try:
            iid = int(idea_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("Tema inválido para dictado del Plan") from exc
        ideas = (
            sb.table("seguimiento_acta_idea")
            .select("id, acta_id, expositor_usuario_id, expositor_id, expositor_nombre, titulo, orden")
            .eq("id", iid)
            .eq("acta_id", aid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not ideas:
            raise ValueError("El tema no pertenece a esta acta")
        idea = ideas[0]
        try:
            expositor_id = int(
                idea.get("expositor_usuario_id")
                or idea.get("expositor_id")
                or 0
            )
        except (TypeError, ValueError):
            expositor_id = 0
        expositor_nombre = str(idea.get("expositor_nombre") or "").strip()
        if not expositor_id:
            raise ValueError(
                "Asigne un expositor al tema antes de registrar actividades en su Plan."
            )
        if not expositor_nombre:
            expositor_nombre = _nombre_usuario(_usuario_row(sb, expositor_id))

    mod_u = _usuario_row(sb, user_id)
    return {
        "acta": acta,
        "idea": idea,
        "expositor_id": expositor_id,
        "expositor_nombre": expositor_nombre,
        "moderador_id": int(user_id),
        "moderador_nombre": _nombre_usuario(mod_u) or f"Usuario #{user_id}",
        "acta_abierta": True,
    }


def item_vinculado_a_tema(item: dict, acta_id: int, idea_id: Optional[int]) -> bool:
    try:
        ia = int(item.get("acta_id") or 0)
    except (TypeError, ValueError):
        ia = 0
    if ia != int(acta_id):
        return False
    if idea_id is None:
        return True
    try:
        ii = int(item.get("idea_id") or 0)
    except (TypeError, ValueError):
        ii = 0
    if ii == int(idea_id):
        return True
    plan = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    blob = plan.get("plan") if isinstance(plan.get("plan"), dict) else {}
    try:
        return int(blob.get("idea_id") or 0) == int(idea_id)
    except (TypeError, ValueError):
        return False


def puede_mutar_dictado(
    sb,
    item: dict,
    user_id: int,
    *,
    acta_id: Optional[int] = None,
    idea_id: Optional[int] = None,
) -> bool:
    """Moderador puede mutar solo ítems de esta acta+tema con acta abierta."""
    from seguimiento_service import _acta_esta_sellada

    try:
        aid = int(acta_id or item.get("acta_id") or 0)
    except (TypeError, ValueError):
        aid = 0
    if aid <= 0:
        return False
    if not item_vinculado_a_tema(item, aid, idea_id if idea_id is not None else item.get("idea_id")):
        return False
    rows = (
        sb.table("seguimiento_acta")
        .select("id, elaborador_id, estado")
        .eq("id", aid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or _acta_esta_sellada(rows[0]):
        return False
    try:
        return int(rows[0].get("elaborador_id") or 0) == int(user_id)
    except (TypeError, ValueError):
        return False


def _upsert_digest(
    sb,
    *,
    session_id: str,
    expositor_id: int,
    moderador_id: int,
    contrato_id: int,
    linea: str,
    item_id: int,
    titulo: str,
) -> None:
    """Acumula líneas de la sesión en una notificación pendiente (sin saturar)."""
    sid = str(session_id or "").strip()[:80]
    if not sid:
        return
    entidad_id = f"dictado-{sid}"
    try:
        existing = (
            sb.table("notificaciones")
            .select("id, mensaje, meta")
            .eq("destinatario_id", int(expositor_id))
            .eq("entidad_tipo", ENTIDAD_DIGEST)
            .eq("entidad_id", entidad_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        # Si no hay columna meta, usar solo mensaje
        try:
            existing = (
                sb.table("notificaciones")
                .select("id, mensaje")
                .eq("destinatario_id", int(expositor_id))
                .eq("entidad_tipo", ENTIDAD_DIGEST)
                .eq("entidad_id", entidad_id)
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            _log.warning("digest dictado select: %s", exc)
            return

    prev_msg = (existing[0].get("mensaje") if existing else "") or ""
    lines = [ln for ln in prev_msg.split("\n") if ln.strip()]
    # Quitar líneas previas del mismo item_id (agrupa ediciones)
    prefix = f"#{int(item_id)}:"
    lines = [ln for ln in lines if not ln.strip().startswith(prefix)]
    lines.append(f"{prefix} {linea}".strip())
    mensaje = "\n".join(lines[-12:])
    asunto = "Plan de actividades — registro en su tema del acta"
    payload = {
        "destinatario_id": int(expositor_id),
        "remitente_id": int(moderador_id),
        "remitente_nombre": "ClaraCore",
        "asunto": asunto,
        "mensaje": (
            "El moderador del acta registró o actualizó compromisos a su nombre:\n\n"
            f"{mensaje}\n\n"
            "Revise el detalle en Seguimiento. El compromiso rige desde el registro."
        ),
        "tipo": "SISTEMA",
        "modulo": "SEGUIMIENTO",
        "contrato_id": int(contrato_id) if contrato_id else None,
        "entidad_tipo": ENTIDAD_DIGEST,
        "entidad_id": entidad_id,
        "leido": False,
    }
    try:
        if existing:
            sb.table("notificaciones").update({
                "asunto": payload["asunto"],
                "mensaje": payload["mensaje"],
                "leido": False,
            }).eq("id", int(existing[0]["id"])).execute()
        else:
            from seguimiento_service import _notificar

            _notificar(
                sb,
                destinatario_id=int(expositor_id),
                remitente_id=int(moderador_id),
                asunto=payload["asunto"],
                mensaje=payload["mensaje"],
                contrato_id=contrato_id,
                entidad_tipo=ENTIDAD_DIGEST,
                entidad_id=entidad_id,
                enviar_push=True,
                push_tipo="plan_dictado",
                push_slot_key=entidad_id,
            )
    except Exception as exc:
        _log.warning("digest dictado upsert: %s", exc)


def acumular_aviso_dictado(
    sb,
    *,
    session_id: Optional[str],
    expositor_id: int,
    moderador_id: int,
    contrato_id: int,
    item_id: int,
    titulo: str,
    accion: str,
) -> None:
    if not expositor_id or int(expositor_id) == int(moderador_id):
        return
    verbo = "Creó" if accion == "crear" else ("Eliminó" if accion == "eliminar" else "Actualizó")
    linea = f"{verbo} «{(titulo or 'actividad').strip()[:120]}»"
    if session_id:
        _upsert_digest(
            sb,
            session_id=session_id,
            expositor_id=int(expositor_id),
            moderador_id=int(moderador_id),
            contrato_id=int(contrato_id),
            linea=linea,
            item_id=int(item_id),
            titulo=titulo or "",
        )
        return
    # Sin sesión: aviso inmediato individual
    try:
        from seguimiento_service import _notificar

        _notificar(
            sb,
            destinatario_id=int(expositor_id),
            remitente_id=int(moderador_id),
            asunto="Plan de actividades — registro en su tema del acta",
            mensaje=(
                f"El moderador del acta {verbo.lower()} un compromiso a su nombre:\n\n"
                f"«{(titulo or 'actividad').strip()}»\n\n"
                "El compromiso rige desde el registro. Revíselo en Seguimiento."
            ),
            contrato_id=contrato_id,
            entidad_tipo="plan_actividad",
            entidad_id=str(item_id),
            enviar_push=True,
            push_tipo="plan_dictado",
            push_slot_key=f"plan-dictado-{item_id}-{accion}",
        )
    except Exception as exc:
        _log.warning("aviso dictado inmediato: %s", exc)
    _enviar_email_dictado(
        sb,
        expositor_id=int(expositor_id),
        moderador_id=int(moderador_id),
        titulo=titulo or "actividad",
        resumen=linea,
        item_id=int(item_id),
        contrato_id=int(contrato_id) if contrato_id else None,
        dedupe_key=f"plan-dictado-mail-{item_id}-{accion}",
    )


def flush_dictado_session(
    sb,
    *,
    session_id: str,
    expositor_id: int,
    moderador_id: int,
    contrato_id: Optional[int] = None,
) -> dict:
    """Envía el correo consolidado de la sesión y deja el aviso de bandeja definitivo."""
    sid = str(session_id or "").strip()[:80]
    if not sid or not expositor_id:
        return {"ok": False, "reason": "sin_sesion"}
    entidad_id = f"dictado-{sid}"
    try:
        rows = (
            sb.table("notificaciones")
            .select("id, mensaje, asunto")
            .eq("destinatario_id", int(expositor_id))
            .eq("entidad_tipo", ENTIDAD_DIGEST)
            .eq("entidad_id", entidad_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("flush dictado select: %s", exc)
        return {"ok": False, "reason": "error_select"}
    if not rows:
        return {"ok": True, "enviado": False, "reason": "sin_cambios"}
    mensaje = rows[0].get("mensaje") or ""
    ok_mail = _enviar_email_dictado(
        sb,
        expositor_id=int(expositor_id),
        moderador_id=int(moderador_id),
        titulo="Compromisos de su tema",
        resumen=mensaje,
        item_id=0,
        contrato_id=int(contrato_id) if contrato_id else None,
        dedupe_key=f"plan-dictado-mail-{entidad_id}",
    )
    return {"ok": True, "enviado": True, "email_ok": bool(ok_mail)}


def _enviar_email_dictado(
    sb,
    *,
    expositor_id: int,
    moderador_id: int,
    titulo: str,
    resumen: str,
    item_id: int,
    contrato_id: Optional[int],
    dedupe_key: str,
) -> bool:
    try:
        from seguimiento_asignacion_email import (
            _contacto_smtp_configured,
            _firma_html,
            _load_usuario,
            _nombre_usuario_row,
            _plataforma_url,
            _registrar_envio,
            _smtp_settings_contacto,
            _usuario_elegible,
        )
        from email.message import EmailMessage
        import html as html_mod
        import smtplib
    except Exception as exc:
        _log.warning("import email dictado: %s", exc)
        return False

    if not _contacto_smtp_configured():
        _log.warning("SMTP contacto no configurado; no se envía correo de dictado")
        return False

    dest = _load_usuario(sb, expositor_id)
    if not _usuario_elegible(dest):
        return False
    mod = _load_usuario(sb, moderador_id)
    mod_nombre = _nombre_usuario_row(mod) or "Moderador del acta"
    dest_nombre = _nombre_usuario_row(dest)
    url = _plataforma_url()
    if item_id:
        url = f"{url}/?seguimiento_item={int(item_id)}"
    asunto = f"ClaraCore — Compromiso registrado en su Plan: {(titulo or '')[:80]}"
    text = (
        f"Hola {dest_nombre},\n\n"
        f"{mod_nombre} registró o actualizó compromisos a su nombre en el acta:\n\n"
        f"{resumen}\n\n"
        f"El compromiso rige desde el registro. Consulte el detalle en ClaraCore:\n{url}\n"
    )
    resumen_html = html_mod.escape(resumen or "").replace("\n", "<br>")
    html_body = f"""
<div style="font-family:Helvetica,Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;">
  <p>Hola <strong>{html_mod.escape(dest_nombre)}</strong>,</p>
  <p><strong>{html_mod.escape(mod_nombre)}</strong> registró o actualizó compromisos
  a su nombre durante el acta.</p>
  <div style="margin:16px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    {resumen_html}
  </div>
  <p style="color:#475569;font-size:13px;">El compromiso rige desde el registro; no requiere aceptación.</p>
  <p><a href="{html_mod.escape(url)}" style="display:inline-block;padding:10px 16px;background:rgb(0,168,150);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
    Abrir en ClaraCore
  </a></p>
  {_firma_html()}
</div>
"""
    try:
        settings = _smtp_settings_contacto()
        msg = EmailMessage()
        msg["Subject"] = asunto
        msg["From"] = settings.get("from") or "contactenos@claracore.co"
        msg["To"] = (dest.get("email") or "").strip()
        msg.set_content(text)
        msg.add_alternative(html_body, subtype="html")
        with smtplib.SMTP(settings["host"], int(settings["port"])) as smtp:
            if settings.get("use_tls"):
                smtp.starttls()
            if settings.get("user"):
                smtp.login(settings["user"], settings.get("password") or "")
            smtp.send_message(msg)
        try:
            _registrar_envio(
                sb,
                usuario_id=int(expositor_id),
                slot_key=str(dedupe_key)[:200],
                destinatario=(dest.get("email") or "").strip(),
                exito=True,
                meta={"titulo": titulo, "item_id": item_id, "job": JOB_EMAIL},
            )
        except Exception:
            pass
        return True
    except Exception as exc:
        _log.exception("email dictado expositor=%s: %s", expositor_id, exc)
        try:
            _registrar_envio(
                sb,
                usuario_id=int(expositor_id),
                slot_key=str(dedupe_key)[:200],
                destinatario=(dest.get("email") or "").strip() if dest else "",
                exito=False,
                error=str(exc)[:500],
                meta={"titulo": titulo, "item_id": item_id, "job": JOB_EMAIL},
            )
        except Exception:
            pass
        return False
