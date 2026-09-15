"""
Recordatorio por correo: tareas, compromisos y reuniones (actas).

Envío el día hábil colombiano anterior al vencimiento, a las 15:30 America/Bogotá.
Un único correo por destinatario, con secciones por tipo.

Usa SMTP de contacto (mismo canal que bienvenida/reset), independiente del
kill-switch de notificaciones_email_mail.NOTIFICACIONES_EMAIL_ENVIO_ACTIVO.
"""
from __future__ import annotations

import html
import logging
import smtplib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from prog_obra_calendar import es_dia_habil_colombia, siguiente_dia_habil_colombia

_log = logging.getLogger("claracore.seguimiento.recordatorio_email")

TZ_BOGOTA = ZoneInfo("America/Bogota")
JOB_TIPO = "seguimiento_recordatorio_habil"
HORA_ENVIO = 15
MINUTO_ENVIO = 30
# Ventana compatible con cron cada 5 min
VENTANA_MINUTOS = 6

ESTADOS_CERRADOS = frozenset({"cumplido", "cancelado", "archivado", "anulado"})
ESTADOS_ACTA_SKIP = frozenset({"cancelada", "anulada", "eliminada"})

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


@dataclass
class RecordatorioItem:
    tipo: str  # tarea | compromiso | reunion
    id: int
    titulo: str
    fecha: str
    hora: Optional[str] = None
    delegado_por: Optional[str] = None
    contrato_id: Optional[int] = None
    meta: dict = field(default_factory=dict)
    rol: str = "responsable"  # responsable | notificado | asistente


def _now_bogota(now: Optional[datetime] = None) -> datetime:
    if now is None:
        return datetime.now(TZ_BOGOTA)
    if now.tzinfo is None:
        return now.replace(tzinfo=TZ_BOGOTA)
    return now.astimezone(TZ_BOGOTA)


def en_ventana_envio(now: Optional[datetime] = None, *, forzar: bool = False) -> bool:
    if forzar:
        return True
    n = _now_bogota(now)
    if not es_dia_habil_colombia(n.date()):
        return False
    mins = n.hour * 60 + n.minute
    target = HORA_ENVIO * 60 + MINUTO_ENVIO
    return target <= mins < target + VENTANA_MINUTOS


def fecha_vencimiento_objetivo(hoy: date) -> date:
    """Siguiente día hábil estricto después de ``hoy`` (el día que se recordará)."""
    return siguiente_dia_habil_colombia(hoy + timedelta(days=1))


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


def _parse_fecha(val) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()[:10]
    s = str(val).strip()[:10]
    return s if len(s) == 10 else None


def _ids_asignados(item: dict) -> Set[int]:
    ids: Set[int] = set()
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    asigns = libres.get("asignaciones") if isinstance((libres or {}).get("asignaciones"), list) else []
    for a in asigns or []:
        if not isinstance(a, dict):
            continue
        try:
            uid = int(a.get("usuario_id") or a.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if uid > 0:
            ids.add(uid)
    if not ids:
        try:
            aid = int(item.get("asignado_a_id") or 0)
        except (TypeError, ValueError):
            aid = 0
        if aid > 0:
            ids.add(aid)
    return ids


def _ids_notificados(item: dict) -> Set[int]:
    """Notificados de subtareas (solo tareas)."""
    if (item.get("origen") or "") != "tarea":
        return set()
    ids: Set[int] = set()
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    checklist = libres.get("checklist") if isinstance((libres or {}).get("checklist"), list) else []
    for it in checklist or []:
        if not isinstance(it, dict):
            continue
        raw = it.get("notificar_a") if isinstance(it.get("notificar_a"), dict) else None
        uid = it.get("notificar_a_id")
        if raw and raw.get("id") is not None:
            uid = raw.get("id")
        try:
            n = int(uid or 0)
        except (TypeError, ValueError):
            continue
        if n > 0:
            ids.add(n)
    return ids


def _delegado_por_item(item: dict, usuarios: Dict[int, dict]) -> Optional[str]:
    for key in ("solicitante_id", "created_by"):
        try:
            uid = int(item.get(key) or 0)
        except (TypeError, ValueError):
            uid = 0
        if uid > 0:
            return _nombre_usuario_row(usuarios.get(uid)) or f"Usuario #{uid}"
    return (item.get("created_by_nombre") or item.get("solicitante_nombre") or "").strip() or None


def collect_items_para_fecha(
    sb: Any,
    fecha_obj: date,
) -> Tuple[Dict[int, List[RecordatorioItem]], Dict[int, dict]]:
    """Agrupa recordatorios por destinatario_id para la fecha de vencimiento/reunión."""
    fecha_s = fecha_obj.isoformat()
    by_user: Dict[int, List[RecordatorioItem]] = defaultdict(list)
    user_ids: Set[int] = set()

    # ── Tareas y compromisos ──
    try:
        rows = (
            sb.table("seguimiento_item")
            .select(
                "id, origen, titulo, tema, estado_gestion, fecha_vencimiento, hora_vencimiento, "
                "asignado_a_id, asignado_a_nombre, created_by, solicitante_id, contrato_id, "
                "campos_libres, consecutivo"
            )
            .eq("fecha_vencimiento", fecha_s)
            .limit(2000)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("recordatorio email query items: %s", exc)
        rows = []

    for item in rows:
        est = str(item.get("estado_gestion") or "").strip().lower()
        if est in ESTADOS_CERRADOS:
            continue
        try:
            iid = int(item["id"])
        except (TypeError, ValueError, KeyError):
            continue
        origen = "compromiso" if item.get("origen") == "compromiso" else "tarea"
        titulo = (item.get("titulo") or item.get("tema") or f"#{item.get('consecutivo') or iid}").strip()
        hora = _fmt_hora(item.get("hora_vencimiento"))
        asignados = _ids_asignados(item)
        notificados = _ids_notificados(item) if origen == "tarea" else set()
        user_ids |= asignados | notificados
        # Placeholder; nombre del delegante se resuelve después
        base = dict(
            tipo=origen,
            id=iid,
            titulo=titulo,
            fecha=fecha_s,
            hora=hora,
            contrato_id=item.get("contrato_id"),
            meta={"item": item},
        )
        for uid in asignados:
            by_user[uid].append(RecordatorioItem(**base, rol="responsable"))
        for uid in notificados - asignados:
            by_user[uid].append(RecordatorioItem(**base, rol="notificado"))

    # ── Reuniones / actas ──
    try:
        actas = (
            sb.table("seguimiento_acta")
            .select(
                "id, contrato_id, consecutivo, fecha_reunion, hora_inicio, ubicacion, "
                "elaborador_id, elaborador_nombre, estado, tipo_acta"
            )
            .eq("fecha_reunion", fecha_s)
            .limit(1000)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("recordatorio email query actas: %s", exc)
        actas = []

    for acta in actas:
        est = str(acta.get("estado") or "").strip().lower()
        if est in ESTADOS_ACTA_SKIP:
            continue
        try:
            aid = int(acta["id"])
        except (TypeError, ValueError, KeyError):
            continue
        try:
            asis = (
                sb.table("seguimiento_acta_asistente")
                .select("usuario_id, nombre")
                .eq("acta_id", aid)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            _log.warning("recordatorio email asistentes acta=%s: %s", aid, exc)
            continue
        consec = acta.get("consecutivo")
        num = f"Nº {consec}" if consec is not None else f"#{aid}"
        ubi = (acta.get("ubicacion") or "").strip()
        titulo = f"Reunión / Acta {num}"
        if ubi:
            titulo = f"{titulo} — {ubi}"
        hora = _fmt_hora(acta.get("hora_inicio"))
        elaborador = (acta.get("elaborador_nombre") or "").strip() or None
        vistos: Set[int] = set()
        for a in asis:
            try:
                uid = int(a.get("usuario_id") or 0)
            except (TypeError, ValueError):
                continue
            if uid <= 0 or uid in vistos:
                continue
            vistos.add(uid)
            user_ids.add(uid)
            by_user[uid].append(
                RecordatorioItem(
                    tipo="reunion",
                    id=aid,
                    titulo=titulo,
                    fecha=fecha_s,
                    hora=hora,
                    delegado_por=elaborador,
                    contrato_id=acta.get("contrato_id"),
                    meta={"acta": acta},
                    rol="asistente",
                )
            )

    # Resolver nombres de usuarios y delegante
    usuarios: Dict[int, dict] = {}
    if user_ids:
        try:
            urows = (
                sb.table("usuarios")
                .select("id, nombre, apellidos, email, activo")
                .in_("id", list(user_ids))
                .execute()
                .data
                or []
            )
            for u in urows:
                try:
                    usuarios[int(u["id"])] = u
                except (TypeError, ValueError, KeyError):
                    continue
        except Exception as exc:
            _log.warning("recordatorio email usuarios: %s", exc)

    # También cargar creadores/solicitantes
    extra_ids: Set[int] = set()
    for items in by_user.values():
        for it in items:
            raw = (it.meta or {}).get("item") or {}
            for key in ("created_by", "solicitante_id"):
                try:
                    extra_ids.add(int(raw.get(key) or 0))
                except (TypeError, ValueError):
                    pass
            try:
                elab = int(((it.meta or {}).get("acta") or {}).get("elaborador_id") or 0)
                if elab:
                    extra_ids.add(elab)
            except (TypeError, ValueError):
                pass
    missing = [i for i in extra_ids if i > 0 and i not in usuarios]
    if missing:
        try:
            urows = (
                sb.table("usuarios")
                .select("id, nombre, apellidos, email, activo")
                .in_("id", missing)
                .execute()
                .data
                or []
            )
            for u in urows:
                try:
                    usuarios[int(u["id"])] = u
                except (TypeError, ValueError, KeyError):
                    continue
        except Exception:
            pass

    for uid, items in list(by_user.items()):
        for it in items:
            if it.tipo in ("tarea", "compromiso") and not it.delegado_por:
                it.delegado_por = _delegado_por_item((it.meta or {}).get("item") or {}, usuarios)
            if it.tipo == "reunion" and not it.delegado_por:
                acta = (it.meta or {}).get("acta") or {}
                try:
                    eid = int(acta.get("elaborador_id") or 0)
                except (TypeError, ValueError):
                    eid = 0
                if eid and eid in usuarios:
                    it.delegado_por = _nombre_usuario_row(usuarios[eid])

    return by_user, usuarios


def _dedupe_items(items: List[RecordatorioItem]) -> List[RecordatorioItem]:
    seen: Set[Tuple[str, int]] = set()
    out: List[RecordatorioItem] = []
    for it in items:
        key = (it.tipo, it.id)
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def build_email_bodies(
    *,
    nombre: str,
    fecha_vencimiento: date,
    items: List[RecordatorioItem],
) -> Tuple[str, str, str]:
    """Retorna (asunto, text, html)."""
    fv = _fmt_fecha_es(fecha_vencimiento.isoformat())
    items = _dedupe_items(items)
    tareas = [i for i in items if i.tipo == "tarea"]
    comps = [i for i in items if i.tipo == "compromiso"]
    reun = [i for i in items if i.tipo == "reunion"]
    n = len(items)
    asunto = f"ClaraCore — Recordatorio: {n} pendiente{'s' if n != 1 else ''} para el {fv}"

    def block_text(titulo_sec: str, lista: List[RecordatorioItem]) -> str:
        if not lista:
            return ""
        lines = [f"\n{titulo_sec}\n" + ("-" * len(titulo_sec))]
        for it in lista:
            hora = f" a las {it.hora}" if it.hora else ""
            delg = f"\n  Delegado por: {it.delegado_por}" if it.delegado_por else ""
            rol = f" ({it.rol})" if it.rol and it.rol != "responsable" else ""
            lines.append(f"• {it.titulo}{rol}\n  Vence: {fv}{hora}{delg}")
        return "\n".join(lines) + "\n"

    text = (
        f"Hola {nombre or ''},\n\n"
        f"Le recordamos que el próximo día hábil ({fv}) tiene pendientes en Seguimiento:\n"
        f"{block_text('TAREAS', tareas)}"
        f"{block_text('COMPROMISOS', comps)}"
        f"{block_text('REUNIONES', reun)}\n"
        f"Consulte el detalle en ClaraCore: {_plataforma_url()}\n"
    )

    def cards_html(titulo_sec: str, color: str, lista: List[RecordatorioItem]) -> str:
        if not lista:
            return ""
        rows = []
        for it in lista:
            hora_html = (
                f'<div style="color:#64748b;font-size:13px;margin-top:4px;">Hora: '
                f"<strong>{html.escape(it.hora)}</strong></div>"
                if it.hora
                else ""
            )
            delg_html = (
                f'<div style="color:#64748b;font-size:13px;margin-top:4px;">Delegado por: '
                f"<strong>{html.escape(it.delegado_por)}</strong></div>"
                if it.delegado_por
                else ""
            )
            rol_html = ""
            if it.rol == "notificado":
                rol_html = (
                    '<span style="display:inline-block;margin-left:6px;padding:1px 7px;'
                    "border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:11px;"
                    'font-weight:700;">Notificado</span>'
                )
            elif it.rol == "asistente":
                rol_html = (
                    '<span style="display:inline-block;margin-left:6px;padding:1px 7px;'
                    "border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;"
                    'font-weight:700;">Asistente</span>'
                )
            rows.append(
                f"""
<tr>
  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;">
    <div style="font-weight:700;color:#0f172a;font-size:14px;line-height:1.4;">
      {html.escape(it.titulo)}{rol_html}
    </div>
    <div style="color:#64748b;font-size:13px;margin-top:6px;">
      Vencimiento: <strong style="color:#0f172a;">{html.escape(fv)}</strong>
    </div>
    {hora_html}
    {delg_html}
  </td>
</tr>"""
            )
        return f"""
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 8px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  <tr>
    <td style="background:{color};color:#fff;padding:10px 14px;font-weight:700;font-size:13px;letter-spacing:0.02em;">
      {html.escape(titulo_sec)} ({len(lista)})
    </td>
  </tr>
  {''.join(rows)}
</table>"""

    url = _plataforma_url()
    body = f"""
<p style="margin:0 0 14px;line-height:1.6;color:#334155;">
  Hola <strong>{html.escape(nombre or 'usuario')}</strong>,
</p>
<p style="margin:0 0 8px;line-height:1.6;color:#334155;">
  Este es un recordatorio institucional de <strong>ClaraCore</strong>: el
  <strong>próximo día hábil laboral</strong> ({html.escape(fv)}) tiene pendientes
  en el módulo de Seguimiento.
</p>
{cards_html('Tareas', _COLOR_AZUL, tareas)}
{cards_html('Compromisos', _COLOR_VERDE, comps)}
{cards_html('Reuniones', '#d97706', reun)}
<p style="margin:20px 0 0;text-align:center;">
  <a href="{html.escape(url)}"
     style="display:inline-block;background:{_COLOR_AZUL};color:#fff;text-decoration:none;
            font-weight:700;padding:12px 22px;border-radius:8px;">
    Abrir Seguimiento en ClaraCore
  </a>
</p>
{_firma_html()}
"""
    html_doc = f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:{_COLOR_AZUL};text-transform:uppercase;margin-bottom:8px;">
      Seguimiento · Recordatorio
    </div>
    <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#0f172a;">
      Pendientes para el {html.escape(fv)}
    </h1>
    {body}
  </div>
</div>
</body>
</html>"""
    return asunto, text, html_doc


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
        _log.warning("check envio recordatorio: %s", exc)
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
            _log.warning("registrar envio recordatorio: %s", exc)


def _send_smtp(to_addr: str, subject: str, text: str, html_body: str) -> bool:
    to_addr = (to_addr or "").strip()
    if not to_addr:
        return False
    if not _contacto_smtp_configured():
        _log.warning("SMTP contacto no configurado; omitiendo recordatorio → %s", to_addr)
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
    _log.info("Recordatorio Seguimiento enviado a %s — %s", to_addr, subject[:80])
    return True


def procesar_recordatorios_email_habil(
    sb: Any,
    *,
    now_bogota: Optional[datetime] = None,
    forzar_hora: bool = False,
    dry_run: bool = False,
) -> dict:
    """
    Cron: si hoy es hábil y está en ventana 15:30, envía un correo consolidado
    por destinatario con lo que vence el siguiente día hábil.
    """
    now = _now_bogota(now_bogota)
    hoy = now.date()

    if not forzar_hora and not en_ventana_envio(now, forzar=False):
        return {
            "omitido": True,
            "motivo": "fuera_ventana_o_no_habil",
            "hora_bogota": f"{now.hour:02d}:{now.minute:02d}",
            "fecha": hoy.isoformat(),
            "enviados": 0,
        }

    if not es_dia_habil_colombia(hoy) and not forzar_hora:
        return {
            "omitido": True,
            "motivo": "no_dia_habil",
            "fecha": hoy.isoformat(),
            "enviados": 0,
        }

    venc = fecha_vencimiento_objetivo(hoy)
    slot_key = f"{hoy.isoformat()}_{venc.isoformat()}"
    by_user, usuarios = collect_items_para_fecha(sb, venc)

    enviados = 0
    omitidos = 0
    errores = 0
    sin_email = 0
    destinatarios = 0

    for uid, items in by_user.items():
        items = _dedupe_items(items)
        if not items:
            continue
        destinatarios += 1
        if _ya_enviado(sb, usuario_id=uid, slot_key=slot_key):
            omitidos += 1
            continue
        u = usuarios.get(uid) or {}
        email = (u.get("email") or "").strip()
        if not email:
            sin_email += 1
            continue
        nombre = _nombre_usuario_row(u)
        asunto, text, html_body = build_email_bodies(
            nombre=nombre,
            fecha_vencimiento=venc,
            items=items,
        )
        meta = {
            "fecha_envio": hoy.isoformat(),
            "fecha_vencimiento": venc.isoformat(),
            "n_tareas": sum(1 for i in items if i.tipo == "tarea"),
            "n_compromisos": sum(1 for i in items if i.tipo == "compromiso"),
            "n_reuniones": sum(1 for i in items if i.tipo == "reunion"),
            "item_ids": [i.id for i in items],
        }
        if dry_run:
            enviados += 1
            continue
        try:
            ok = _send_smtp(email, asunto, text, html_body)
            _registrar_envio(
                sb,
                usuario_id=uid,
                slot_key=slot_key,
                destinatario=email,
                exito=ok,
                error=None if ok else "smtp_fallo_o_no_configurado",
                meta=meta,
            )
            if ok:
                enviados += 1
            else:
                errores += 1
        except Exception as exc:
            errores += 1
            _log.exception("Error enviando recordatorio a %s", email)
            _registrar_envio(
                sb,
                usuario_id=uid,
                slot_key=slot_key,
                destinatario=email,
                exito=False,
                error=str(exc)[:500],
                meta=meta,
            )

    return {
        "omitido": False,
        "fecha_envio": hoy.isoformat(),
        "fecha_vencimiento": venc.isoformat(),
        "destinatarios": destinatarios,
        "enviados": enviados,
        "omitidos_duplicado": omitidos,
        "sin_email": sin_email,
        "errores": errores,
        "dry_run": bool(dry_run),
        "smtp_configurado": _contacto_smtp_configured(),
    }
