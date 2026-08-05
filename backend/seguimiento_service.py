"""
Lógica de negocio — módulo Seguimiento (actas, compromisos, tareas, bandeja).
"""
from __future__ import annotations

import base64
import logging
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo

from prog_obra_calendar import (
    CalendarioNoHabilesCache,
    add_dias_habiles,
    es_dia_habil,
    siguiente_dia_habil,
)
from seguimiento_pdf import (
    PDF_ACTA_TEMPLATE_VERSION,
    contenido_hash_acta,
    generar_pdf_acta,
    generar_pdf_llamado_atencion,
    pdf_acta_cache_key,
)
from seguimiento_richtext import html_to_plain_text, sanitize_tema_html

_log = logging.getLogger("claracore.seguimiento")
BOGOTA = ZoneInfo("America/Bogota")

# Roles contratista (main.ROL_ID_NIVEL_MAP): 5=Operativo, 3=Contratista, 7=Gerencial
_ROL_CONTRATISTA_GERENCIAL = 7
_ROLES_BAJO_GERENCIAL = {3, 5}


def _sb():
    from main import supabase

    return supabase


def _execute(fn):
    from main import supabase_execute

    return supabase_execute(fn)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _now_bogota() -> datetime:
    return datetime.now(BOGOTA)


def _parse_date(raw) -> Optional[date]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def make_calendar_loader(sb):
    def load(contrato_id: int, desde: date, hasta: date) -> List[dict]:
        d0, d1 = desde.isoformat(), hasta.isoformat()
        cid = int(contrato_id)
        q = (
            sb.table("prog_calendario_no_habiles")
            .select("fecha,tipo,contrato_id")
            .gte("fecha", d0)
            .lte("fecha", d1)
            .or_(f"contrato_id.eq.{cid},contrato_id.is.null")
        )
        return q.execute().data or []

    return load


def calcular_fecha_limite_gracia(contrato_id: int, fecha_vencimiento: date, cache: CalendarioNoHabilesCache) -> datetime:
    """
    Margen de gracia: 24 h contadas en días hábiles tras la fecha de vencimiento (hora Bogotá).
    Se toma el día siguiente al vencimiento (o el primer hábil en/después) como inicio
    del margen de un día hábil; el límite queda a las 23:59:59 Bogotá de ese día hábil.
    """
    inicio = fecha_vencimiento + timedelta(days=1)
    dia_gracia = add_dias_habiles(int(contrato_id), inicio, 1, cache)
    if dia_gracia is None:
        dia_gracia = siguiente_dia_habil(inicio, int(contrato_id), cache)
    return datetime.combine(dia_gracia, time(23, 59, 59), tzinfo=BOGOTA)


def _usuario_row(sb, uid: int) -> Optional[dict]:
    rows = sb.table("usuarios").select(
        "id, nombre, apellidos, cargo_id, rol_id, contrato_id, firma_imagen_url"
    ).eq("id", int(uid)).limit(1).execute().data or []
    return rows[0] if rows else None


def _nombre_usuario(u: Optional[dict]) -> str:
    if not u:
        return ""
    return f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()


def es_contratista_gerencial(user_row: Optional[dict], current_user: Optional[dict] = None) -> bool:
    if user_row and int(user_row.get("rol_id") or 0) == _ROL_CONTRATISTA_GERENCIAL:
        return True
    if current_user:
        rol = (current_user.get("rol_nombre") or "").strip().lower()
        if "contratista gerencial" in rol:
            return True
        try:
            if int(current_user.get("rol_id") or 0) == _ROL_CONTRATISTA_GERENCIAL:
                return True
        except (TypeError, ValueError):
            pass
    return False


def es_desarrollador_seguimiento(current_user: Optional[dict] = None) -> bool:
    """Mismo criterio que main._es_desarrollador: acceso pleno sin ownership."""
    if not current_user:
        return False
    try:
        from main import _es_desarrollador

        return bool(_es_desarrollador(current_user))
    except Exception:
        rol = (current_user.get("rol_nombre") or "").strip().lower()
        cargo = (current_user.get("cargo_nombre") or "").strip().lower()
        return rol == "desarrollador" or cargo == "desarrollador"


MSG_ACTA_ACCESO_RESTRINGIDO = (
    "No tiene acceso a esta acta. Solo el elaborador, los asistentes registrados "
    "y los roles Administrador o Desarrollador pueden consultarla."
)


class ActaAccesoDenegado(Exception):
    """El usuario no puede ver el contenido interno del acta (HTTP 403)."""

    def __init__(self, detail: str = MSG_ACTA_ACCESO_RESTRINGIDO):
        self.detail = detail
        super().__init__(detail)


def es_administrador_seguimiento(current_user: Optional[dict] = None) -> bool:
    """Cargo/rol Administrador: puede consultar cualquier acta (sin bypass de edición)."""
    if not current_user:
        return False
    try:
        from main import _es_cargo_administrador_sicoe

        if bool(_es_cargo_administrador_sicoe(current_user)):
            return True
    except Exception:
        pass
    rol = (current_user.get("rol_nombre") or "").strip().lower()
    cargo = (current_user.get("cargo_nombre") or "").strip().lower()
    return rol == "administrador" or cargo == "administrador"


def es_admin_o_desarrollador_seguimiento(current_user: Optional[dict] = None) -> bool:
    return es_desarrollador_seguimiento(current_user) or es_administrador_seguimiento(current_user)


def _usuario_es_asistente_registrado(sb, acta_id: int, user_id: int) -> bool:
    try:
        rows = (
            sb.table("seguimiento_acta_asistente")
            .select("id")
            .eq("acta_id", int(acta_id))
            .eq("usuario_id", int(user_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        return bool(rows)
    except Exception:
        return False


def _ids_actas_donde_es_asistente(sb, user_id: int, acta_ids: List[int]) -> Set[int]:
    if not acta_ids:
        return set()
    try:
        rows = (
            sb.table("seguimiento_acta_asistente")
            .select("acta_id")
            .eq("usuario_id", int(user_id))
            .in_("acta_id", [int(x) for x in acta_ids])
            .execute()
            .data
            or []
        )
    except Exception:
        return set()
    return {int(r["acta_id"]) for r in rows if r.get("acta_id") is not None}


def usuario_puede_ver_acta(
    sb,
    acta: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> bool:
    """
    Contenido completo del acta: elaborador, asistente registrado (usuario_id),
    o rol Administrador / Desarrollador.
    """
    if not acta:
        return False
    if es_admin_o_desarrollador_seguimiento(current_user):
        return True
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return False
    elab = acta.get("elaborador_id")
    if elab is not None:
        try:
            if int(elab) == uid:
                return True
        except (TypeError, ValueError):
            pass
    asistentes = acta.get("asistentes")
    if isinstance(asistentes, list):
        for a in asistentes:
            try:
                if a.get("usuario_id") is not None and int(a["usuario_id"]) == uid:
                    return True
            except (TypeError, ValueError):
                continue
        # Lista cargada y vacía / sin match → no consultar de nuevo
        return False
    aid = acta.get("id")
    if aid is None:
        return False
    return _usuario_es_asistente_registrado(sb, int(aid), uid)


def assert_puede_ver_acta(
    sb,
    acta: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> None:
    if not usuario_puede_ver_acta(sb, acta, user_id, current_user):
        raise ActaAccesoDenegado()


def resumen_acta_restringida(acta: dict) -> dict:
    """Metadatos seguros para bandeja / listados sin revelar contenido interno."""
    return {
        "id": acta.get("id"),
        "consecutivo": acta.get("consecutivo"),
        "fecha_reunion": acta.get("fecha_reunion"),
        "tipo_acta": acta.get("tipo_acta"),
        "estado": acta.get("estado"),
        "elaborador_id": acta.get("elaborador_id"),
        "elaborador_nombre": acta.get("elaborador_nombre"),
        "ubicacion": acta.get("ubicacion"),
        "puede_abrir": False,
        "acceso_restringido": True,
    }


def anexar_flags_acceso_actas(
    sb,
    rows: List[dict],
    user_id: int,
    current_user: Optional[dict] = None,
) -> List[dict]:
    """Marca puede_abrir en cada fila del repositorio y redacta campos sensibles."""
    if not rows:
        return rows
    privilegiado = es_admin_o_desarrollador_seguimiento(current_user)
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        uid = -1
    asis_ids: Set[int] = set()
    if not privilegiado and uid > 0:
        asis_ids = _ids_actas_donde_es_asistente(
            sb, uid, [int(r["id"]) for r in rows if r.get("id") is not None]
        )
    for r in rows:
        puede = privilegiado
        if not puede:
            elab = r.get("elaborador_id")
            try:
                if elab is not None and int(elab) == uid:
                    puede = True
            except (TypeError, ValueError):
                pass
        if not puede and r.get("id") is not None:
            puede = int(r["id"]) in asis_ids
        r["puede_abrir"] = bool(puede)
        r["acceso_restringido"] = not bool(puede)
        if not puede:
            # No filtrar del listado: solo ocultar contenido interno expuesto en la fila.
            r["orden_del_dia"] = None
    return rows


def ids_usuarios_bajo_gestion(sb, gerencial_id: int, contrato_id: Optional[int] = None) -> Set[int]:
    """Usuarios del mismo contrato con rol Operativo/Contratista (bajo gerencial)."""
    g = _usuario_row(sb, gerencial_id)
    if not g:
        return set()
    cid = contrato_id or g.get("contrato_id")
    if not cid:
        return set()
    rows = (
        sb.table("usuarios")
        .select("id, rol_id, contrato_id")
        .eq("contrato_id", int(cid))
        .execute()
        .data
        or []
    )
    # También vinculados por usuario_contratos
    vinc = (
        sb.table("usuario_contratos")
        .select("usuario_id")
        .eq("contrato_id", int(cid))
        .execute()
        .data
        or []
    )
    extra_ids = [int(v["usuario_id"]) for v in vinc if v.get("usuario_id")]
    if extra_ids:
        extra = (
            sb.table("usuarios")
            .select("id, rol_id, contrato_id")
            .in_("id", extra_ids)
            .execute()
            .data
            or []
        )
        seen = {int(r["id"]) for r in rows}
        for r in extra:
            if int(r["id"]) not in seen:
                rows.append(r)
    out: Set[int] = set()
    for r in rows:
        rid = int(r.get("rol_id") or 0)
        if rid in _ROLES_BAJO_GERENCIAL and int(r["id"]) != int(gerencial_id):
            out.add(int(r["id"]))
    return out


def _registrar_evento(sb, item_id: int, tipo: str, usuario_id: Optional[int] = None, payload: Optional[dict] = None):
    try:
        sb.table("seguimiento_evento_gestion").insert({
            "item_id": int(item_id),
            "tipo_evento": tipo,
            "usuario_id": usuario_id,
            "payload": payload or {},
        }).execute()
    except Exception as exc:
        _log.warning("evento_gestion item=%s tipo=%s: %s", item_id, tipo, exc)


def _notificar(
    sb,
    *,
    destinatario_id: int,
    remitente_id: int,
    asunto: str,
    mensaje: str,
    contrato_id: Optional[int],
    entidad_tipo: str,
    entidad_id: str,
    padre_id: Optional[int] = None,
    enviar_push: bool = False,
    push_tipo: Optional[str] = None,
    push_slot_key: Optional[str] = None,
) -> bool:
    """Inserta en buzón de plataforma. Opcionalmente intenta Web Push. No usa Telegram (solo soporte)."""
    if not destinatario_id or int(destinatario_id) == int(remitente_id):
        return False
    row = {
        "remitente_id": int(remitente_id),
        "remitente_nombre": "ClaraCore",
        "destinatario_id": int(destinatario_id),
        "asunto": (asunto or "")[:500],
        "mensaje": mensaje or "",
        "tipo": "SISTEMA",
        "modulo": "SEGUIMIENTO",
        "contrato_id": int(contrato_id) if contrato_id is not None else None,
        "entidad_tipo": entidad_tipo,
        "entidad_id": str(entidad_id),
        "leido": False,
        "oculto_destinatario": False,
        "oculto_remitente": False,
    }
    if padre_id:
        row["padre_id"] = int(padre_id)
    ok = False
    try:
        try:
            from main import supabase_execute
            supabase_execute(lambda: sb.table("notificaciones").insert(row).execute())
        except Exception:
            sb.table("notificaciones").insert(row).execute()
        ok = True
    except Exception as exc:
        _log.warning(
            "notif seguimiento falló dest=%s entidad=%s/%s: %s",
            destinatario_id, entidad_tipo, entidad_id, exc,
        )
        return False
    if ok and enviar_push:
        _try_push_seguimiento(
            destinatario_id=int(destinatario_id),
            contrato_id=contrato_id,
            asunto=asunto,
            mensaje=mensaje,
            tipo=push_tipo or entidad_tipo or "seguimiento",
            slot_key=push_slot_key or f"{entidad_tipo}-{entidad_id}-{destinatario_id}",
        )
    return ok


def _try_push_seguimiento(
    *,
    destinatario_id: int,
    contrato_id: Optional[int],
    asunto: str,
    mensaje: str,
    tipo: str,
    slot_key: str,
) -> None:
    try:
        from notificaciones_push_service import NotificacionesPushSender
        from main import supabase as _sb_main
        sender = NotificacionesPushSender(_sb_main)
        if not sender.configured():
            return
        sender.enviar_a_usuario(
            usuario_id=int(destinatario_id),
            contrato_id=int(contrato_id) if contrato_id is not None else None,
            tipo=str(tipo)[:80],
            slot_key=str(slot_key)[:200],
            title=(asunto or "Seguimiento")[:120],
            email_text=mensaje or "",
        )
    except Exception as exc:
        _log.warning("push seguimiento dest=%s: %s", destinatario_id, exc)


def _fmt_fecha_notif(raw) -> str:
    if not raw:
        return "—"
    s = str(raw)[:10]
    parts = s.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return s


def _notificar_compromiso_asignado(
    sb,
    *,
    destinatario_id: int,
    remitente_id: int,
    titulo: str,
    fecha_vencimiento,
    contrato_id: Optional[int],
    item_id,
    acta: Optional[dict] = None,
    reasignacion: bool = False,
) -> bool:
    """
    Aviso inmediato al asignado al crear (o reasignar) un compromiso.
    Independiente del estado del acta (borrador / realizada / firmada).
    """
    consec = (acta or {}).get("consecutivo")
    acta_txt = f"Acta Nº {consec}" if consec is not None else "un acta de Seguimiento"
    fv = _fmt_fecha_notif(fecha_vencimiento)
    titulo_clean = (titulo or "compromiso").strip() or "compromiso"
    if reasignacion:
        asunto = f"Compromiso reasignado — {acta_txt}"
        verbo = "reasignó"
    else:
        asunto = f"Nuevo compromiso — {acta_txt}"
        verbo = "asignó"
    mensaje = (
        f"Se le {verbo} un compromiso proveniente de {acta_txt}.\n\n"
        f"«{titulo_clean}»\n\n"
        f"Fecha de vencimiento: {fv}\n\n"
        f"Revíselo en la bandeja de Seguimiento o en el widget de inicio."
    )
    slot = f"compromiso-{'reasign' if reasignacion else 'nuevo'}-{item_id}-{destinatario_id}"
    return _notificar(
        sb,
        destinatario_id=int(destinatario_id),
        remitente_id=int(remitente_id),
        asunto=asunto,
        mensaje=mensaje,
        contrato_id=contrato_id,
        entidad_tipo="seguimiento_compromiso",
        entidad_id=str(item_id),
        enviar_push=True,
        push_tipo="seguimiento_compromiso",
        push_slot_key=slot,
    )


def _norm_estado_gestion_val(raw: Optional[str], *, hecho: bool = False) -> str:
    e = (raw or "").strip().lower()
    if e in (
        "abierto", "en_progreso", "cumplido", "parcial", "vencido", "cancelado", "reprogramado",
    ):
        return e
    if hecho:
        return "cumplido"
    return "abierto"


def _agregar_estados_asignados(estados) -> str:
    """Agrega estados individuales → estado colectivo (todos cumplidos ⇒ cumplido)."""
    norms = [_norm_estado_gestion_val(e) for e in (estados or [])]
    if not norms:
        return "abierto"
    if all(e == "cancelado" for e in norms):
        return "cancelado"
    activos = [e for e in norms if e != "cancelado"]
    if not activos:
        return "cancelado"
    if all(e == "cumplido" for e in activos):
        return "cumplido"
    if any(e == "cumplido" for e in activos):
        return "parcial"
    if any(e in ("en_progreso", "parcial", "reprogramado", "vencido") for e in activos):
        return "en_progreso"
    return "abierto"


def _normalizar_entrada_asignacion(raw) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    try:
        uid = int(raw.get("usuario_id") or raw.get("id") or raw.get("asignado_a_id") or 0)
    except (TypeError, ValueError):
        return None
    if not uid:
        return None
    updated = raw.get("updated_at")
    return {
        "usuario_id": uid,
        "nombre": (raw.get("nombre") or raw.get("asignado_a_nombre") or "").strip()[:200],
        "estado_gestion": _norm_estado_gestion_val(raw.get("estado_gestion"), hecho=bool(raw.get("hecho"))),
        "updated_at": str(updated)[:40] if updated else None,
    }


def _normalizar_lista_asignaciones(raw) -> List[dict]:
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    seen: Set[int] = set()
    for r in raw:
        entry = _normalizar_entrada_asignacion(r)
        if not entry or entry["usuario_id"] in seen:
            continue
        seen.add(entry["usuario_id"])
        out.append(entry)
        if len(out) >= 40:
            break
    return out


def _clonar_asignaciones_estado(asignaciones: List[dict], estado: str = "abierto") -> List[dict]:
    est = _norm_estado_gestion_val(estado)
    return [
        {
            "usuario_id": int(a["usuario_id"]),
            "nombre": a.get("nombre") or "",
            "estado_gestion": est,
            "updated_at": None,
        }
        for a in (asignaciones or [])
    ]


def _nombres_asignaciones(asignaciones: List[dict]) -> str:
    names = [(a.get("nombre") or "").strip() or f"Usuario #{a.get('usuario_id')}" for a in (asignaciones or [])]
    return ", ".join(names)


def _asignaciones_efectivas(item: Optional[dict]) -> List[dict]:
    """Lista de asignados formales; compat con legado de un solo asignado_a_id."""
    if not item:
        return []
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    arr = _normalizar_lista_asignaciones((libres or {}).get("asignaciones"))
    if arr:
        return arr
    if (item.get("relacion_destinatario") or "").strip().lower() != "asignacion":
        return []
    try:
        aid = int(item.get("asignado_a_id") or 0)
        creator = int(item.get("created_by") or 0)
    except (TypeError, ValueError):
        return []
    if not aid or aid == creator:
        return []
    return [{
        "usuario_id": aid,
        "nombre": (item.get("asignado_a_nombre") or "").strip(),
        "estado_gestion": _norm_estado_gestion_val(item.get("estado_gestion")),
        "updated_at": None,
    }]


def _ids_asignados_tarea(item: Optional[dict]) -> Set[int]:
    ids: Set[int] = set()
    for a in _asignaciones_efectivas(item):
        try:
            ids.add(int(a["usuario_id"]))
        except (TypeError, ValueError, KeyError):
            pass
    try:
        if item and item.get("asignado_a_id"):
            ids.add(int(item["asignado_a_id"]))
    except (TypeError, ValueError):
        pass
    return ids


def _usuario_es_asignado_formal(item: Optional[dict], user_id: int) -> bool:
    return int(user_id) in _ids_asignados_tarea(item)


def _es_tarea_delegada_asignacion(item: Optional[dict]) -> bool:
    """Delegación con responsabilidad (asignación formal), no referencia ni personal."""
    if not item or item.get("origen") != "tarea":
        return False
    if (item.get("relacion_destinatario") or "").strip().lower() != "asignacion":
        return False
    try:
        creator = int(item.get("created_by") or 0)
    except (TypeError, ValueError):
        return False
    if not creator:
        return False
    asigns = _asignaciones_efectivas(item)
    if asigns:
        return any(int(a["usuario_id"]) != creator for a in asigns)
    try:
        assignee = int(item.get("asignado_a_id") or 0)
    except (TypeError, ValueError):
        return False
    return bool(assignee and creator != assignee)


def _parse_destinatarios_payload(data: dict, sb, user_id: int) -> List[dict]:
    """
    Acepta destinatarios múltiples:
      - destinatarios: [{id|usuario_id, nombre?}, ...]
      - destinatario_ids: [1,2]
      - destinatario_id / referido_a_id (legado, uno)
    """
    out: List[dict] = []
    seen: Set[int] = set()

    def add(uid, nombre=None):
        try:
            n = int(uid)
        except (TypeError, ValueError):
            return
        if not n or n in seen or n == int(user_id):
            return
        seen.add(n)
        nm = (nombre or "").strip()
        if not nm:
            row = _usuario_row(sb, n)
            nm = _nombre_usuario(row) if row else f"Usuario #{n}"
        out.append({"usuario_id": n, "nombre": nm[:200], "estado_gestion": "abierto", "updated_at": None})

    raw_list = data.get("destinatarios")
    if isinstance(raw_list, list):
        for r in raw_list:
            if isinstance(r, dict):
                add(r.get("usuario_id") or r.get("id") or r.get("asignado_a_id"),
                    r.get("nombre") or r.get("asignado_a_nombre"))
            else:
                add(r)
    raw_ids = data.get("destinatario_ids")
    if isinstance(raw_ids, list):
        for x in raw_ids:
            add(x)
    # Legado single
    single = data.get("destinatario_id") or data.get("referido_a_id")
    if single and not out:
        add(single, data.get("referido_a_nombre") or data.get("destinatario_nombre") or data.get("asignado_a_nombre"))
    return out


def _notificar_delegante_cumplido_individual(
    sb,
    item: dict,
    *,
    actor_id: int,
    actor_nombre: str,
    ambito: str,
) -> None:
    """Notifica a quien delegó cada vez que un destinatario marca su cumplido individual."""
    if not _es_tarea_delegada_asignacion(item):
        return
    creator = int(item["created_by"])
    if creator == int(actor_id):
        return
    titulo = (item.get("titulo") or "tarea").strip() or "tarea"
    quien = (actor_nombre or "").strip() or f"Usuario #{actor_id}"
    detalle = ambito.strip() if ambito else "la tarea"
    _notificar(
        sb,
        destinatario_id=creator,
        remitente_id=int(actor_id),
        asunto=f"Cumplido parcial: {titulo[:60]}",
        mensaje=(
            f"{quien} marcó como Cumplida su parte en {detalle} de la tarea delegada «{titulo}». "
            f"La tarea permanece pendiente hasta que todos los destinatarios confirmen."
        ),
        contrato_id=item.get("contrato_id"),
        entidad_tipo="seguimiento_tarea",
        entidad_id=str(item.get("id") or ""),
    )


def _notificar_delegante_cumplido_total(
    sb,
    item: dict,
    *,
    actor_id: int,
    prev_estado: Optional[str],
    new_estado: Optional[str],
) -> None:
    """Notifica cuando la tarea queda cumplida en su totalidad por todos los destinatarios."""
    if (new_estado or "").strip().lower() != "cumplido":
        return
    if (prev_estado or "").strip().lower() == "cumplido":
        return
    if not _es_tarea_delegada_asignacion(item):
        return
    creator = int(item["created_by"])
    titulo = (item.get("titulo") or "tarea").strip() or "tarea"
    asigns = _asignaciones_efectivas(item)
    nombres = _nombres_asignaciones(asigns) if asigns else (item.get("asignado_a_nombre") or "").strip()
    por = f" por {nombres}" if nombres else ""
    _notificar(
        sb,
        destinatario_id=creator,
        remitente_id=int(actor_id),
        asunto=f"Tarea delegada cumplida en su totalidad: {titulo[:55]}",
        mensaje=(
            f"La tarea «{titulo}» que usted delegó quedó Cumplida en su totalidad{por}. "
            f"Todos los destinatarios confirmaron su parte. Revísela en Seguimiento o en el widget de inicio."
        ),
        contrato_id=item.get("contrato_id"),
        entidad_tipo="seguimiento_tarea",
        entidad_id=str(item.get("id") or ""),
    )


def _notificar_delegante_tarea_cumplida(
    sb,
    item: dict,
    *,
    prev_estado: Optional[str],
    new_estado: Optional[str],
    actor_id: int,
) -> None:
    """Compat: transición global a cumplido (p. ej. checklist al 100% o un solo asignado)."""
    _notificar_delegante_cumplido_total(
        sb, item, actor_id=actor_id, prev_estado=prev_estado, new_estado=new_estado,
    )


# ── Actas ────────────────────────────────────────────────────────────────────

def proximo_consecutivo(sb, contrato_id: int) -> int:
    rows = (
        sb.table("seguimiento_acta")
        .select("consecutivo")
        .eq("contrato_id", int(contrato_id))
        .order("consecutivo", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return 1
    return int(rows[0].get("consecutivo") or 0) + 1


ACTA_ESTADOS = frozenset({"borrador", "realizada", "firmada"})
ACTA_TIPOS = frozenset({"interna", "externa"})
ITEM_ESTADOS = frozenset({
    "abierto", "en_progreso", "cumplido", "parcial", "vencido", "cancelado", "reprogramado",
})

# Caché de capacidades de esquema (migración puede no estar aplicada aún en prod).
_SCHEMA_CAPS: Dict[str, Optional[bool]] = {
    "tipo_acta": None,
    "estado_realizada": None,
    "fecha_base_nivel": None,
    "asistente_email": None,
    "contacto_externo": None,
    "idea_quien_dijo": None,
    "asignado_externo_id": None,
    "acta_proxima_reunion": None,
    "acta_horas_reunion": None,
    "idea_titulo": None,
    "idea_imagenes": None,
}


def _exc_msg(exc: BaseException) -> str:
    return str(exc or "").lower()


def _is_missing_column_error(exc: BaseException, column: str) -> bool:
    msg = _exc_msg(exc)
    col = (column or "").lower()
    if col not in msg:
        return False
    return any(x in msg for x in ("schema cache", "could not find", "column", "pgrst204"))


def _schema_has(sb, cap: str, *, force: bool = False) -> bool:
    """Detecta columnas/valores nuevos; evita fallar si la migración no se aplicó.

    Solo cachea True de forma permanente en el proceso. Un resultado False se
    re-prueba en la siguiente consulta (migración aplicada en caliente o
    recarga del schema cache de PostgREST), salvo que force=True fuerce
    el sondeo inmediato.
    """
    if not force and _SCHEMA_CAPS.get(cap) is True:
        return True
    try:
        if cap == "tipo_acta":
            sb.table("seguimiento_acta").select("id,tipo_acta").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "fecha_base_nivel":
            sb.table("seguimiento_item").select("id,fecha_base_nivel").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "asistente_email":
            sb.table("seguimiento_acta_asistente").select("id,email").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "contacto_externo":
            sb.table("seguimiento_contacto_externo").select("id").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "idea_quien_dijo":
            sb.table("seguimiento_acta_idea").select("id,quien_dijo").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "idea_titulo":
            sb.table("seguimiento_acta_idea").select("id,titulo").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "idea_imagenes":
            sb.table("seguimiento_acta_idea").select("id,imagenes").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "asignado_externo_id":
            sb.table("seguimiento_item").select("id,asignado_externo_id").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "acta_proxima_reunion":
            sb.table("seguimiento_acta").select("id,proxima_fecha,proxima_hora,proxima_lugar").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "acta_horas_reunion":
            sb.table("seguimiento_acta").select("id,hora_inicio,hora_fin").limit(1).execute()
            _SCHEMA_CAPS[cap] = True
        elif cap == "estado_realizada":
            # Si tipo_acta existe, la migración de ciclo de vida suele estar completa.
            _SCHEMA_CAPS[cap] = _schema_has(sb, "tipo_acta")
        else:
            _SCHEMA_CAPS[cap] = False
    except Exception as exc:
        msg = _exc_msg(exc)
        if cap in ("tipo_acta", "fecha_base_nivel", "asistente_email") and _is_missing_column_error(exc, cap.replace("asistente_", "")):
            _SCHEMA_CAPS[cap] = False
        elif cap == "asistente_email" and _is_missing_column_error(exc, "email"):
            _SCHEMA_CAPS[cap] = False
        elif cap == "idea_quien_dijo" and _is_missing_column_error(exc, "quien_dijo"):
            _SCHEMA_CAPS[cap] = False
        elif cap == "idea_titulo" and _is_missing_column_error(exc, "titulo"):
            _SCHEMA_CAPS[cap] = False
        elif cap == "idea_imagenes" and _is_missing_column_error(exc, "imagenes"):
            _SCHEMA_CAPS[cap] = False
        elif cap == "asignado_externo_id" and _is_missing_column_error(exc, "asignado_externo_id"):
            _SCHEMA_CAPS[cap] = False
        elif cap == "acta_proxima_reunion" and (
            _is_missing_column_error(exc, "proxima_fecha")
            or _is_missing_column_error(exc, "proxima_hora")
            or _is_missing_column_error(exc, "proxima_lugar")
        ):
            _SCHEMA_CAPS[cap] = False
        elif cap == "acta_horas_reunion" and (
            _is_missing_column_error(exc, "hora_inicio")
            or _is_missing_column_error(exc, "hora_fin")
        ):
            _SCHEMA_CAPS[cap] = False
        elif cap == "contacto_externo" and (
            "seguimiento_contacto_externo" in msg
            or "does not exist" in msg
            or "schema cache" in msg
            or "could not find" in msg
            or "pgrst205" in msg
        ):
            _SCHEMA_CAPS[cap] = False
        else:
            # Error ambiguo: asumir disponible para no degradar en falso.
            _SCHEMA_CAPS[cap] = True
            _log.warning("schema probe %s ambiguo: %s", cap, exc)
    return bool(_SCHEMA_CAPS.get(cap))


def _try_reload_postgrest_schema(sb) -> bool:
    """Best-effort: pide a PostgREST recargar el schema cache vía RPC o NOTIFY."""
    try:
        sb.rpc("sicoe_reload_postgrest_schema").execute()
        return True
    except Exception as exc:
        _log.debug("reload postgrest schema (rpc) no disponible: %s", exc)
    try:
        # Fallback si existe una RPC genérica de notify en el proyecto.
        sb.rpc("pg_notify", {"channel": "pgrst", "payload": "reload schema"}).execute()
        return True
    except Exception as exc:
        _log.debug("reload postgrest schema (pg_notify rpc) no disponible: %s", exc)
    return False


def _ensure_idea_quien_dijo_column(sb) -> bool:
    """Confirma que PostgREST ve quien_dijo en ideas; reintenta tras reload."""
    if _schema_has(sb, "idea_quien_dijo"):
        return True
    _SCHEMA_CAPS["idea_quien_dijo"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "idea_quien_dijo", force=True)


def _ensure_acta_proxima_reunion_columns(sb) -> bool:
    """Confirma columnas de reserva de próxima reunión; reintenta tras reload."""
    if _schema_has(sb, "acta_proxima_reunion"):
        return True
    _SCHEMA_CAPS["acta_proxima_reunion"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "acta_proxima_reunion", force=True)


def _ensure_acta_horas_reunion_columns(sb) -> bool:
    """Confirma columnas hora_inicio / hora_fin del acta; reintenta tras reload."""
    if _schema_has(sb, "acta_horas_reunion"):
        return True
    _SCHEMA_CAPS["acta_horas_reunion"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "acta_horas_reunion", force=True)


def _hora_ahora_bogota() -> str:
    return _now_bogota().strftime("%H:%M")


def _maybe_set_acta_hora_inicio(sb, acta_id: Optional[int]) -> None:
    """Registra hora_inicio una sola vez: primera gestión sobre un compromiso del acta."""
    if not acta_id:
        return
    if not _ensure_acta_horas_reunion_columns(sb):
        return
    try:
        rows = (
            sb.table("seguimiento_acta")
            .select("id,hora_inicio")
            .eq("id", int(acta_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return
        if (rows[0].get("hora_inicio") or "").strip():
            return
        sb.table("seguimiento_acta").update({
            "hora_inicio": _hora_ahora_bogota(),
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(acta_id)).execute()
    except Exception as exc:
        _log.warning("hora_inicio acta=%s: %s", acta_id, exc)


def _touch_acta_hora_fin(sb, acta_id: Optional[int]) -> None:
    """Actualiza hora_fin al evento más reciente de idea/apartado (siempre la última)."""
    if not acta_id:
        return
    if not _ensure_acta_horas_reunion_columns(sb):
        return
    try:
        sb.table("seguimiento_acta").update({
            "hora_fin": _hora_ahora_bogota(),
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(acta_id)).execute()
    except Exception as exc:
        _log.warning("hora_fin acta=%s: %s", acta_id, exc)


def _ensure_idea_titulo_column(sb) -> bool:
    if _schema_has(sb, "idea_titulo"):
        return True
    _SCHEMA_CAPS["idea_titulo"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "idea_titulo", force=True)


def _ensure_idea_imagenes_column(sb) -> bool:
    if _schema_has(sb, "idea_imagenes"):
        return True
    _SCHEMA_CAPS["idea_imagenes"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "idea_imagenes", force=True)


def _normalizar_imagenes_idea(raw) -> List[dict]:
    """Lista persistible de esquemas/gráficos (máx. 8; sin data_uri si hay blob)."""
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    for im in raw:
        ref = _normalizar_imagen_ref(im)
        if not ref:
            continue
        # En sync solo se conservan refs ya subidas (blob/url); pending va por endpoint.
        if not ref.get("blob_path") and not ref.get("url"):
            continue
        row = {
            "nombre": ref.get("nombre") or "esquema.png",
            "blob_path": ref.get("blob_path"),
            "mime_type": ref.get("mime_type") or "image/png",
            "created_at": ref.get("created_at") or _now_utc().isoformat(),
        }
        if ref.get("kind"):
            row["kind"] = ref["kind"]
        if ref.get("url") and not row.get("blob_path"):
            row["url"] = ref["url"]
        out.append(row)
        if len(out) >= 8:
            break
    return out


def _enrich_idea_row(idea: dict) -> dict:
    if not idea:
        return idea
    out = dict(idea)
    imgs = out.get("imagenes")
    if isinstance(imgs, list):
        out["imagenes"] = [_enrich_imagen_preview(x) or x for x in imgs if isinstance(x, dict)]
    else:
        out["imagenes"] = []
    return out


def _require_idea_quien_dijo(sb) -> None:
    """Falla de forma explícita si Interviniente no puede persistirse (sin silent-drop)."""
    if _ensure_idea_quien_dijo_column(sb):
        return
    raise ValueError(
        "No se pudo guardar el Interviniente: la columna quien_dijo no está disponible "
        "en el schema cache de PostgREST. Aplique la migración "
        "20260727210000_seguimiento_idea_quien_dijo.sql y ejecute "
        "NOTIFY pgrst, 'reload schema';"
    )


def _ensure_asignado_externo_column(sb) -> bool:
    """Confirma que PostgREST ve asignado_externo_id; reintenta tras reload."""
    if _schema_has(sb, "asignado_externo_id"):
        return True
    _SCHEMA_CAPS["asignado_externo_id"] = None
    reloaded = _try_reload_postgrest_schema(sb)
    if reloaded:
        # Dar un instante a PostgREST tras NOTIFY (best-effort en el mismo request).
        try:
            import time as _time

            _time.sleep(0.15)
        except Exception:
            pass
    return _schema_has(sb, "asignado_externo_id", force=True)


def _norm_tipo_acta(raw) -> str:
    t = (raw or "interna").strip().lower()
    if t not in ACTA_TIPOS:
        raise ValueError("El tipo de acta debe ser Interna o Externa")
    return t


def _norm_estado_acta(raw, *, default: str = "borrador") -> str:
    e = (raw or default).strip().lower()
    # Compatibilidad con estados legacy
    if e in ("en_firma", "cerrada"):
        e = "realizada"
    if e not in ACTA_ESTADOS:
        raise ValueError("Estado de acta no válido (borrador, realizada, firmada)")
    return e


def _estado_para_db(sb, estado_canonico: str) -> str:
    e = _norm_estado_acta(estado_canonico)
    if e == "realizada" and not _schema_has(sb, "estado_realizada"):
        return "en_firma"  # CHECK legacy
    return e


def _serialize_orden_del_dia(orden, *, tipo_acta: Optional[str] = None, embed_tipo: bool = False) -> Optional[str]:
    import json

    payload: Any
    if isinstance(orden, (list, dict)):
        payload = orden
    else:
        txt = (orden or "").strip()
        if not txt:
            payload = []
        elif txt.startswith("[") or txt.startswith("{"):
            try:
                payload = json.loads(txt)
            except Exception:
                payload = txt
        else:
            payload = txt
    if embed_tipo and tipo_acta:
        if isinstance(payload, list):
            payload = {"v": 2, "tipo_acta": tipo_acta, "orden": payload}
        elif isinstance(payload, dict):
            if "orden" in payload or "items" in payload or payload.get("v") == 2:
                payload = {**payload, "tipo_acta": tipo_acta, "v": payload.get("v") or 2}
            else:
                payload = {"v": 2, "tipo_acta": tipo_acta, "orden": payload}
        else:
            payload = {"v": 2, "tipo_acta": tipo_acta, "orden": str(payload)}
    if isinstance(payload, (list, dict)):
        return json.dumps(payload, ensure_ascii=False)
    return (str(payload).strip() or None)


def _parse_orden_y_tipo(raw) -> tuple:
    """Devuelve (orden_para_ui, tipo_acta_opcional) soportando envoltorio v2."""
    import json

    if raw is None:
        return None, None
    if isinstance(raw, list):
        return raw, None
    if isinstance(raw, dict):
        if "orden" in raw or raw.get("v") == 2:
            return raw.get("orden", raw.get("items", [])), raw.get("tipo_acta")
        return raw, raw.get("tipo_acta")
    s = str(raw).strip()
    if not s:
        return None, None
    if s.startswith("{") or s.startswith("["):
        try:
            parsed = json.loads(s)
            return _parse_orden_y_tipo(parsed)
        except Exception:
            return s, None
    return s, None


def _enrich_acta_row(acta: dict) -> dict:
    """Normaliza estado/tipo/orden aunque la migración no esté aplicada."""
    if not acta:
        return acta
    orden_ui, tipo_embedded = _parse_orden_y_tipo(acta.get("orden_del_dia"))
    if orden_ui is not None and not isinstance(orden_ui, str):
        import json
        acta["orden_del_dia"] = json.dumps(orden_ui, ensure_ascii=False) if not isinstance(orden_ui, str) else orden_ui
        # Mantener checklist como JSON string o dejar lista? Frontend parseOrdenDia acepta ambos.
        if isinstance(orden_ui, (list, dict)):
            acta["orden_del_dia"] = json.dumps(orden_ui, ensure_ascii=False)
    tipo = acta.get("tipo_acta") or tipo_embedded or "interna"
    try:
        acta["tipo_acta"] = _norm_tipo_acta(tipo)
    except ValueError:
        acta["tipo_acta"] = "interna"
    try:
        acta["estado"] = _norm_estado_acta(acta.get("estado") or "borrador")
    except ValueError:
        acta["estado"] = "borrador"
    return acta


def _require_elaborador(data: dict, user_id: int) -> int:
    elaborador_id = data.get("elaborador_id")
    if elaborador_id in (None, "", 0, "0"):
        raise ValueError("El elaborador es obligatorio")
    return int(elaborador_id)


def _acta_esta_sellada(acta: Optional[dict]) -> bool:
    """Realizada o firmada: contenido inmodificable (salvo revertir por Desarrollador)."""
    if not acta:
        return False
    est = (acta.get("estado") or "").strip().lower()
    if est in ("en_firma", "cerrada"):
        est = "realizada"
    return est in ("realizada", "firmada")


def _assert_puede_editar_acta(
    acta: dict,
    user_id: int,
    current_user: Optional[dict] = None,
    *,
    permitir_revertir_dev: bool = False,
    nuevo_estado: Optional[str] = None,
) -> None:
    """
    Solo el elaborador edita el contenido mientras el acta esté en borrador.
    Sellada (realizada/firmada): nadie edita; el Desarrollador puede revertir a borrador.
    """
    es_dev = es_desarrollador_seguimiento(current_user)
    sellada = _acta_esta_sellada(acta)
    if sellada:
        if (
            permitir_revertir_dev
            and es_dev
            and nuevo_estado
            and _norm_estado_acta(nuevo_estado) == "borrador"
        ):
            return
        raise ValueError(
            "El acta está sellada (Realizada/Firmada) y no se puede editar. "
            "Solo el rol Desarrollador puede revertirla a borrador."
        )
    if es_dev:
        return
    elab = acta.get("elaborador_id")
    if elab is None or int(elab) != int(user_id):
        raise ValueError("Solo el elaborador del acta puede editar su contenido")


def revertir_acta_a_borrador(
    sb, contrato_id: int, acta_id: int, current_user: Optional[dict]
) -> dict:
    """Desarrollador: desella el acta pasando de realizada/firmada a borrador."""
    if not es_desarrollador_seguimiento(current_user):
        raise ValueError("Solo el rol Desarrollador puede revertir un acta sellada")
    acta = get_acta(sb, acta_id, contrato_id)
    if not _acta_esta_sellada(acta):
        raise ValueError("El acta no está sellada; no hay nada que revertir")
    patch = {
        "estado": _estado_para_db(sb, "borrador"),
        "updated_at": _now_utc().isoformat(),
    }
    _persist_acta_row(sb, patch, acta_id=acta_id, contrato_id=contrato_id)
    return get_acta(sb, acta_id, contrato_id)


def _persist_acta_row(sb, row: dict, *, acta_id: Optional[int] = None, contrato_id: Optional[int] = None) -> list:
    """Insert/update con reintento si faltan columnas o el CHECK de estado es legacy."""
    attempt = dict(row)
    last_exc: Optional[BaseException] = None
    for _ in range(5):
        try:
            if acta_id is not None:
                q = sb.table("seguimiento_acta").update(attempt).eq("id", int(acta_id))
                if contrato_id is not None:
                    q = q.eq("contrato_id", int(contrato_id))
                return q.execute().data or []
            return sb.table("seguimiento_acta").insert(attempt).execute().data or []
        except Exception as exc:
            last_exc = exc
            changed = False
            if "tipo_acta" in attempt and _is_missing_column_error(exc, "tipo_acta"):
                _SCHEMA_CAPS["tipo_acta"] = False
                tipo = attempt.pop("tipo_acta", None)
                attempt["orden_del_dia"] = _serialize_orden_del_dia(
                    attempt.get("orden_del_dia"),
                    tipo_acta=tipo,
                    embed_tipo=True,
                )
                changed = True
            if attempt.get("estado") == "realizada" and (
                "realizada" in _exc_msg(exc) or "check" in _exc_msg(exc) or "violates" in _exc_msg(exc)
            ):
                _SCHEMA_CAPS["estado_realizada"] = False
                attempt["estado"] = "en_firma"
                changed = True
            for col in ("proxima_fecha", "proxima_hora", "proxima_lugar"):
                if col in attempt and _is_missing_column_error(exc, col):
                    _SCHEMA_CAPS["acta_proxima_reunion"] = False
                    attempt.pop("proxima_fecha", None)
                    attempt.pop("proxima_hora", None)
                    attempt.pop("proxima_lugar", None)
                    changed = True
                    break
            for col in ("hora_inicio", "hora_fin"):
                if col in attempt and _is_missing_column_error(exc, col):
                    _SCHEMA_CAPS["acta_horas_reunion"] = False
                    attempt.pop("hora_inicio", None)
                    attempt.pop("hora_fin", None)
                    changed = True
                    break
            if not changed:
                raise
    if last_exc:
        raise last_exc
    raise ValueError("No se pudo persistir el acta")


def list_actas(
    sb,
    contrato_id: int,
    *,
    estado: Optional[str] = None,
    tipo_acta: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    q: Optional[str] = None,
    user_id: Optional[int] = None,
    current_user: Optional[dict] = None,
) -> List[dict]:
    query = (
        sb.table("seguimiento_acta")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .order("consecutivo", desc=True)
    )
    estado_db = None
    if estado:
        try:
            estado_db = _estado_para_db(sb, estado)
            # Filtrar ambos valores canónicos en memoria si hay mapeo legacy
        except ValueError:
            estado_db = None
    # Solo filtrar tipo en SQL si la columna existe
    if tipo_acta and _schema_has(sb, "tipo_acta"):
        try:
            query = query.eq("tipo_acta", _norm_tipo_acta(tipo_acta))
        except ValueError:
            pass
    if fecha_desde:
        query = query.gte("fecha_reunion", str(fecha_desde)[:10])
    if fecha_hasta:
        query = query.lte("fecha_reunion", str(fecha_hasta)[:10])
    rows = query.limit(500).execute().data or []
    out = [_enrich_acta_row(dict(r)) for r in rows]
    if estado:
        want = _norm_estado_acta(estado)
        out = [r for r in out if _norm_estado_acta(r.get("estado") or "borrador") == want]
    if tipo_acta:
        want_t = _norm_tipo_acta(tipo_acta)
        out = [r for r in out if _norm_tipo_acta(r.get("tipo_acta") or "interna") == want_t]
    if user_id is not None:
        anexar_flags_acceso_actas(sb, out, int(user_id), current_user)
    if not (q or "").strip():
        return out
    return _filtrar_actas_por_keywords(sb, out, q)


def _filtrar_actas_por_keywords(sb, rows: List[dict], q: str) -> List[dict]:
    tokens = [t for t in re.split(r"[\s,.;:]+", (q or "").lower()) if len(t) >= 2]
    if not tokens:
        return rows
    ids = [int(r["id"]) for r in rows]
    if not ids:
        return []
    # Contenido interno solo para actas que el usuario puede abrir (evita filtrar por secretos).
    open_ids = [int(r["id"]) for r in rows if r.get("puede_abrir", True)]
    by_id: Dict[int, List[str]] = {i: [] for i in ids}
    if open_ids:
        ideas = (
            sb.table("seguimiento_acta_idea")
            .select("acta_id,texto")
            .in_("acta_id", open_ids)
            .execute()
            .data
            or []
        )
        apartados = (
            sb.table("seguimiento_acta_apartado")
            .select("acta_id,titulo,contenido")
            .in_("acta_id", open_ids)
            .execute()
            .data
            or []
        )
        asis_cols = "acta_id,nombre,cargo,entidad"
        if _schema_has(sb, "asistente_email"):
            asis_cols += ",email"
        try:
            asistentes = (
                sb.table("seguimiento_acta_asistente")
                .select(asis_cols)
                .in_("acta_id", open_ids)
                .execute()
                .data
                or []
            )
        except Exception:
            asistentes = (
                sb.table("seguimiento_acta_asistente")
                .select("acta_id,nombre,cargo,entidad")
                .in_("acta_id", open_ids)
                .execute()
                .data
                or []
            )
        for idea in ideas:
            by_id.setdefault(int(idea["acta_id"]), []).append(str(idea.get("texto") or ""))
        for ap in apartados:
            by_id.setdefault(int(ap["acta_id"]), []).extend([
                str(ap.get("titulo") or ""),
                str(ap.get("contenido") or ""),
            ])
        for a in asistentes:
            by_id.setdefault(int(a["acta_id"]), []).extend([
                str(a.get("nombre") or ""),
                str(a.get("cargo") or ""),
                str(a.get("entidad") or ""),
                str(a.get("email") or ""),
            ])
    out = []
    for r in rows:
        public = [
            str(r.get("ubicacion") or ""),
            str(r.get("elaborador_nombre") or ""),
            str(r.get("tipo_acta") or ""),
            str(r.get("consecutivo") or ""),
            str(r.get("estado") or ""),
        ]
        if r.get("puede_abrir", True):
            corpus = " ".join([
                *public,
                str(r.get("orden_del_dia") or ""),
                *by_id.get(int(r["id"]), []),
            ]).lower()
        else:
            corpus = " ".join(public).lower()
        if all(t in corpus for t in tokens):
            out.append(r)
    return out


def get_acta(sb, acta_id: int, contrato_id: Optional[int] = None) -> dict:
    q = sb.table("seguimiento_acta").select("*").eq("id", int(acta_id))
    if contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    rows = q.limit(1).execute().data or []
    if not rows:
        raise ValueError("Acta no encontrada")
    acta = _enrich_acta_row(dict(rows[0]))
    aid = int(acta["id"])
    acta["asistentes"] = (
        sb.table("seguimiento_acta_asistente").select("*").eq("acta_id", aid).order("orden").execute().data or []
    )
    ideas_raw = (
        sb.table("seguimiento_acta_idea")
        .select("*")
        .eq("acta_id", aid)
        .order("orden")
        .order("id")
        .execute()
        .data
        or []
    )
    acta["ideas"] = [_enrich_idea_row(x) for x in ideas_raw]
    acta["apartados"] = (
        sb.table("seguimiento_acta_apartado").select("*").eq("acta_id", aid).order("orden").execute().data or []
    )
    acta["compromisos"] = (
        sb.table("seguimiento_item")
        .select("*")
        .eq("acta_id", aid)
        .eq("origen", "compromiso")
        .order("id")
        .execute()
        .data
        or []
    )
    acta["firmas"] = (
        sb.table("seguimiento_firma_registro").select("*").eq("acta_id", aid).execute().data or []
    )
    return acta


def compromisos_abiertos_contrato(
    sb,
    contrato_id: int,
    excluir_acta_id: Optional[int] = None,
    tipo_acta: Optional[str] = None,
) -> List[dict]:
    """Compromisos abiertos del contrato, opcionalmente filtrados por tipo de acta origen.

    Interna y externa no se mezclan: si se pide tipo_acta, solo se incluyen
    compromisos cuya acta de origen sea del mismo tipo (legacy sin tipo → interna).
    """
    q = (
        sb.table("seguimiento_item")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("origen", "compromiso")
        .in_("estado_gestion", ["abierto", "en_progreso", "parcial", "vencido", "reprogramado"])
        .order("fecha_vencimiento")
    )
    rows = q.execute().data or []
    if excluir_acta_id is not None:
        rows = [r for r in rows if int(r.get("acta_id") or 0) != int(excluir_acta_id)]
    acta_ids = list({int(r["acta_id"]) for r in rows if r.get("acta_id")})
    actas_map: Dict[int, dict] = {}
    if acta_ids:
        select_cols = "id, consecutivo, fecha_reunion, tipo_acta, orden_del_dia"
        try:
            arows = (
                sb.table("seguimiento_acta")
                .select(select_cols)
                .in_("id", acta_ids)
                .execute()
                .data
                or []
            )
        except Exception:
            arows = (
                sb.table("seguimiento_acta")
                .select("id, consecutivo, fecha_reunion, orden_del_dia")
                .in_("id", acta_ids)
                .execute()
                .data
                or []
            )
        actas_map = {int(a["id"]): _enrich_acta_row(dict(a)) for a in arows}
    want_tipo = None
    if tipo_acta:
        try:
            want_tipo = _norm_tipo_acta(tipo_acta)
        except ValueError:
            want_tipo = None
    out: List[dict] = []
    for r in rows:
        a = actas_map.get(int(r["acta_id"])) if r.get("acta_id") else None
        origen_tipo = _norm_tipo_acta((a or {}).get("tipo_acta") or "interna")
        if want_tipo and origen_tipo != want_tipo:
            continue
        r["acta_consecutivo"] = a.get("consecutivo") if a else None
        r["acta_fecha"] = a.get("fecha_reunion") if a else None
        r["acta_numero"] = f"Acta Nº {a['consecutivo']}" if a and a.get("consecutivo") is not None else None
        r["acta_tipo"] = origen_tipo if a else None
        out.append(r)
    return out


def create_acta(sb, contrato_id: int, data: dict, user_id: int) -> dict:
    consec = proximo_consecutivo(sb, contrato_id)
    fecha = _parse_date(data.get("fecha_reunion")) or _now_bogota().date()
    elaborador_id = _require_elaborador(data, user_id)
    elab = _usuario_row(sb, int(elaborador_id))
    if not elab:
        raise ValueError("El elaborador debe ser un usuario registrado del contrato")
    tipo = _norm_tipo_acta(data.get("tipo_acta"))
    estado = _estado_para_db(sb, data.get("estado") or "borrador")
    has_tipo = _schema_has(sb, "tipo_acta")
    orden_txt = _serialize_orden_del_dia(
        data.get("orden_del_dia"),
        tipo_acta=tipo,
        embed_tipo=not has_tipo,
    )
    row = {
        "contrato_id": int(contrato_id),
        "consecutivo": consec,
        "fecha_reunion": fecha.isoformat(),
        "ubicacion": (data.get("ubicacion") or "").strip() or None,
        "orden_del_dia": orden_txt,
        "elaborador_id": int(elaborador_id),
        "elaborador_nombre": data.get("elaborador_nombre") or _nombre_usuario(elab),
        "estado": estado,
        "created_by": int(user_id),
        "updated_at": _now_utc().isoformat(),
    }
    if has_tipo:
        row["tipo_acta"] = tipo
    if _ensure_acta_proxima_reunion_columns(sb):
        if "proxima_fecha" in data:
            pf = _parse_date(data.get("proxima_fecha")) if data.get("proxima_fecha") else None
            row["proxima_fecha"] = pf.isoformat() if pf else None
        if "proxima_hora" in data:
            row["proxima_hora"] = (data.get("proxima_hora") or "").strip() or None
        if "proxima_lugar" in data:
            row["proxima_lugar"] = (data.get("proxima_lugar") or "").strip() or None
    ins = _persist_acta_row(sb, row)
    if not ins:
        raise ValueError("No se pudo crear el acta")
    acta = ins[0]
    aid = int(acta["id"])
    _sync_asistentes(sb, aid, data.get("asistentes") or [], contrato_id=int(contrato_id))
    _sync_ideas(sb, aid, data.get("ideas") or [])
    _sync_apartados(sb, aid, data.get("apartados") or [])
    return get_acta(sb, aid, contrato_id)


def update_acta(
    sb,
    contrato_id: int,
    acta_id: int,
    data: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    nuevo_estado_raw = data.get("estado") if "estado" in data else None
    _assert_puede_editar_acta(
        acta,
        user_id,
        current_user,
        permitir_revertir_dev=True,
        nuevo_estado=nuevo_estado_raw,
    )
    # Si es solo revertir (dev): permitir únicamente el cambio de estado a borrador.
    if _acta_esta_sellada(acta):
        patch = {
            "estado": _estado_para_db(sb, "borrador"),
            "updated_at": _now_utc().isoformat(),
        }
        _persist_acta_row(sb, patch, acta_id=acta_id, contrato_id=contrato_id)
        return get_acta(sb, acta_id, contrato_id)

    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    if "fecha_reunion" in data and data["fecha_reunion"]:
        patch["fecha_reunion"] = (_parse_date(data["fecha_reunion"]) or date.today()).isoformat()
    for k in ("ubicacion", "elaborador_nombre"):
        if k in data:
            patch[k] = (data.get(k) or "").strip() or None
    tipo = None
    if "tipo_acta" in data and data.get("tipo_acta"):
        tipo = _norm_tipo_acta(data.get("tipo_acta"))
    elif acta.get("tipo_acta"):
        tipo = _norm_tipo_acta(acta.get("tipo_acta"))
    has_tipo = _schema_has(sb, "tipo_acta")
    if tipo and has_tipo:
        patch["tipo_acta"] = tipo
    if "orden_del_dia" in data or (tipo and not has_tipo):
        orden = data.get("orden_del_dia") if "orden_del_dia" in data else acta.get("orden_del_dia")
        # Si viene del acta enriquecida, puede ser JSON string de checklist
        patch["orden_del_dia"] = _serialize_orden_del_dia(
            orden,
            tipo_acta=tipo,
            embed_tipo=not has_tipo,
        )
    elaborador_id = None
    if "elaborador_id" in data:
        if data.get("elaborador_id") in (None, "", 0, "0"):
            raise ValueError("El elaborador es obligatorio")
        elaborador_id = int(data["elaborador_id"])
        patch["elaborador_id"] = elaborador_id
        elab = _usuario_row(sb, elaborador_id)
        if not elab:
            raise ValueError("El elaborador debe ser un usuario registrado del contrato")
        if not data.get("elaborador_nombre"):
            patch["elaborador_nombre"] = _nombre_usuario(elab)
    elab_final = elaborador_id or acta.get("elaborador_id")
    if not elab_final:
        raise ValueError("El elaborador es obligatorio")
    if "estado" in data and data["estado"]:
        nuevo = _norm_estado_acta(data["estado"])
        patch["estado"] = _estado_para_db(sb, nuevo)
    if _ensure_acta_proxima_reunion_columns(sb):
        if "proxima_fecha" in data:
            pf = _parse_date(data.get("proxima_fecha")) if data.get("proxima_fecha") else None
            patch["proxima_fecha"] = pf.isoformat() if pf else None
        if "proxima_hora" in data:
            patch["proxima_hora"] = (data.get("proxima_hora") or "").strip() or None
        if "proxima_lugar" in data:
            patch["proxima_lugar"] = (data.get("proxima_lugar") or "").strip() or None
    _persist_acta_row(sb, patch, acta_id=acta_id, contrato_id=contrato_id)
    if "asistentes" in data:
        _sync_asistentes(sb, acta_id, data.get("asistentes") or [], contrato_id=int(contrato_id))
    if "ideas" in data:
        _sync_ideas(sb, acta_id, data.get("ideas") or [])
    if "apartados" in data:
        _sync_apartados(sb, acta_id, data.get("apartados") or [])
    return get_acta(sb, acta_id, contrato_id)


def _norm_email(raw: Optional[str]) -> Optional[str]:
    s = (raw or "").strip().lower()
    return s or None


def upsert_contacto_externo(
    sb,
    contrato_id: int,
    *,
    nombre: str,
    cargo: Optional[str] = None,
    entidad: Optional[str] = None,
    email: Optional[str] = None,
) -> Optional[dict]:
    """
    Guarda o actualiza un contacto externo del catálogo (sin acceso/login).
    Clave: (contrato_id, email_norm) si hay correo.
    No reactiva contactos ya vinculados a un usuario real (activo=false + usuario_id).
    """
    if not _schema_has(sb, "contacto_externo"):
        return None
    nombre_clean = (nombre or "").strip()
    if not nombre_clean:
        return None
    email_clean = (email or "").strip() or None
    email_norm = _norm_email(email_clean)
    cargo_clean = (cargo or "").strip() or None
    entidad_clean = (entidad or "").strip() or None
    now = _now_utc().isoformat()
    payload = {
        "contrato_id": int(contrato_id),
        "nombre": nombre_clean[:300],
        "cargo": cargo_clean[:200] if cargo_clean else None,
        "entidad": entidad_clean[:200] if entidad_clean else None,
        "email": email_clean[:320] if email_clean else None,
        "email_norm": email_norm,
        "updated_at": now,
    }
    try:
        existing = None
        if email_norm:
            rows = (
                sb.table("seguimiento_contacto_externo")
                .select("*")
                .eq("contrato_id", int(contrato_id))
                .eq("email_norm", email_norm)
                .limit(1)
                .execute()
                .data
                or []
            )
            existing = rows[0] if rows else None
        if existing:
            # Ya migró a usuario real → no reactivar ni sobrescribir
            if existing.get("activo") is False and existing.get("usuario_id"):
                return existing
            upd = {**payload, "activo": True}
            sb.table("seguimiento_contacto_externo").update(upd).eq("id", int(existing["id"])).execute()
            return {**existing, **upd, "id": existing["id"]}
        # Sin email: insertar siempre (catálogo por nombre en ese acta)
        ins = sb.table("seguimiento_contacto_externo").insert({
            **payload,
            "activo": True,
            "created_at": now,
        }).execute().data
        return (ins or [None])[0]
    except Exception as exc:
        _log.warning("upsert contacto externo contrato=%s: %s", contrato_id, exc)
        return None


def list_contactos_externos_activos(sb, contrato_id: int) -> List[dict]:
    """Contactos externos activos del contrato (para el buscador de asistentes)."""
    if not _schema_has(sb, "contacto_externo"):
        return []
    try:
        rows = (
            sb.table("seguimiento_contacto_externo")
            .select("id, nombre, cargo, entidad, email, email_norm, activo, usuario_id")
            .eq("contrato_id", int(contrato_id))
            .eq("activo", True)
            .order("nombre")
            .limit(500)
            .execute()
            .data
            or []
        )
        return [r for r in rows if r.get("activo") is not False]
    except Exception as exc:
        _log.warning("list contactos externos contrato=%s: %s", contrato_id, exc)
        _SCHEMA_CAPS["contacto_externo"] = False
        return []


def inhabilitar_contactos_externos_por_email(
    sb,
    email: str,
    *,
    usuario_id: Optional[int] = None,
) -> int:
    """
    Al crear un usuario real, inhabilita contactos externos con el mismo correo
    (cualquier contrato). Criterio: email_norm == lower(trim(email)).
    """
    if not _schema_has(sb, "contacto_externo"):
        return 0
    email_norm = _norm_email(email)
    if not email_norm:
        return 0
    try:
        rows = (
            sb.table("seguimiento_contacto_externo")
            .select("id")
            .eq("email_norm", email_norm)
            .eq("activo", True)
            .execute()
            .data
            or []
        )
        n = 0
        patch = {
            "activo": False,
            "updated_at": _now_utc().isoformat(),
        }
        if usuario_id is not None:
            patch["usuario_id"] = int(usuario_id)
        for r in rows:
            sb.table("seguimiento_contacto_externo").update(patch).eq("id", int(r["id"])).execute()
            n += 1
        return n
    except Exception as exc:
        _log.warning("inhabilitar contactos externos email=%s: %s", email_norm, exc)
        return 0


def _sync_asistentes(sb, acta_id: int, asistentes: list, *, contrato_id: Optional[int] = None) -> None:
    sb.table("seguimiento_acta_asistente").delete().eq("acta_id", int(acta_id)).execute()
    rows = []
    include_email = _schema_has(sb, "asistente_email")
    for i, a in enumerate(asistentes or []):
        nombre = (a.get("nombre") or "").strip()
        if not nombre:
            continue
        row = {
            "acta_id": int(acta_id),
            "nombre": nombre,
            "cargo": (a.get("cargo") or "").strip() or None,
            "entidad": (a.get("entidad") or "").strip() or None,
            "usuario_id": int(a["usuario_id"]) if a.get("usuario_id") else None,
            "orden": int(a.get("orden") if a.get("orden") is not None else i),
        }
        if include_email:
            row["email"] = (a.get("email") or "").strip() or None
        rows.append(row)
        # Catálogo: solo asistentes sin usuario de plataforma
        if contrato_id and not row.get("usuario_id"):
            upsert_contacto_externo(
                sb,
                int(contrato_id),
                nombre=nombre,
                cargo=row.get("cargo"),
                entidad=row.get("entidad"),
                email=row.get("email"),
            )
    if rows:
        try:
            sb.table("seguimiento_acta_asistente").insert(rows).execute()
        except Exception as exc:
            if include_email and _is_missing_column_error(exc, "email"):
                _SCHEMA_CAPS["asistente_email"] = False
                for r in rows:
                    r.pop("email", None)
                sb.table("seguimiento_acta_asistente").insert(rows).execute()
            else:
                raise


def _sync_ideas(sb, acta_id: int, ideas: list) -> None:
    """Actualiza ideas por id cuando existe; inserta nuevas; elimina ausentes.

    Persiste siempre quien_dijo (Interviniente). Si PostgREST no ve la columna,
    falla con error explícito — nunca hace silent-drop del valor.
    """
    existing = sb.table("seguimiento_acta_idea").select("id").eq("acta_id", int(acta_id)).execute().data or []
    keep_ids: Set[int] = set()
    _require_idea_quien_dijo(sb)

    def _write_update(payload: dict, iid: int) -> None:
        try:
            sb.table("seguimiento_acta_idea").update(payload).eq("id", int(iid)).eq("acta_id", int(acta_id)).execute()
            if "quien_dijo" in payload:
                _SCHEMA_CAPS["idea_quien_dijo"] = True
        except Exception as exc:
            if "quien_dijo" in payload and _is_missing_column_error(exc, "quien_dijo"):
                _SCHEMA_CAPS["idea_quien_dijo"] = None
                if _ensure_idea_quien_dijo_column(sb):
                    sb.table("seguimiento_acta_idea").update(payload).eq("id", int(iid)).eq("acta_id", int(acta_id)).execute()
                    _SCHEMA_CAPS["idea_quien_dijo"] = True
                    return
                _SCHEMA_CAPS["idea_quien_dijo"] = False
                raise ValueError(
                    "No se pudo guardar el Interviniente (idea %s): PostgREST no ve la columna "
                    "quien_dijo. Ejecute NOTIFY pgrst, 'reload schema'."
                    % iid
                ) from exc
            raise

    def _write_insert(row: dict) -> Optional[dict]:
        try:
            ins = sb.table("seguimiento_acta_idea").insert(row).execute().data
            if "quien_dijo" in row:
                _SCHEMA_CAPS["idea_quien_dijo"] = True
            inserted = (ins or [None])[0]
        except Exception as exc:
            if "quien_dijo" in row and _is_missing_column_error(exc, "quien_dijo"):
                _SCHEMA_CAPS["idea_quien_dijo"] = None
                if _ensure_idea_quien_dijo_column(sb):
                    ins = sb.table("seguimiento_acta_idea").insert(row).execute().data
                    _SCHEMA_CAPS["idea_quien_dijo"] = True
                    inserted = (ins or [None])[0]
                else:
                    _SCHEMA_CAPS["idea_quien_dijo"] = False
                    raise ValueError(
                        "No se pudo guardar el Interviniente en idea nueva: PostgREST no ve "
                        "la columna quien_dijo. Ejecute NOTIFY pgrst, 'reload schema'."
                    ) from exc
            else:
                raise
        # Supabase a veces no devuelve la fila insertada: recuperar por acta+orden(+texto).
        if not inserted or inserted.get("id") is None:
            try:
                q = (
                    sb.table("seguimiento_acta_idea")
                    .select("*")
                    .eq("acta_id", int(row["acta_id"]))
                    .eq("orden", int(row.get("orden") or 0))
                    .order("id", desc=True)
                    .limit(5)
                )
                found = q.execute().data or []
                texto = (row.get("texto") or "").strip()
                if texto:
                    match = next(
                        (r for r in found if (r.get("texto") or "").strip() == texto),
                        None,
                    )
                else:
                    match = found[0] if found else None
                if match:
                    inserted = match
            except Exception as exc:
                _log.debug("recover idea insert id: %s", exc)
        return inserted
    for i, idea in enumerate(ideas or []):
        texto = sanitize_tema_html(idea.get("texto") or "")
        quien = (idea.get("interviniente") or idea.get("quien_dijo") or "").strip() or None
        titulo_raw = (idea.get("titulo") or "").strip()
        if not titulo_raw and texto:
            titulo_raw = titulo_tema_desde_texto(html_to_plain_text(texto))
        titulo = titulo_raw or None
        iid = idea.get("id")
        # orden siempre alineado al índice del payload (consecutivo visible = orden+1).
        orden = int(idea.get("orden") if idea.get("orden") is not None else i)
        include_titulo = _ensure_idea_titulo_column(sb)
        include_imagenes = _ensure_idea_imagenes_column(sb)
        payload = {
            "texto": texto,
            "orden": orden,
            "quien_dijo": quien,
            "updated_at": _now_utc().isoformat(),
        }
        if include_titulo:
            payload["titulo"] = titulo
        # Solo actualiza imagenes si el cliente envía la clave (permite borrar/reordenar).
        if include_imagenes and "imagenes" in idea:
            payload["imagenes"] = _normalizar_imagenes_idea(idea.get("imagenes"))
        if iid:
            keep_ids.add(int(iid))
            try:
                _write_update(payload, int(iid))
            except Exception as exc:
                if include_titulo and "titulo" in payload and _is_missing_column_error(exc, "titulo"):
                    _SCHEMA_CAPS["idea_titulo"] = False
                    payload.pop("titulo", None)
                    _write_update(payload, int(iid))
                elif include_imagenes and "imagenes" in payload and _is_missing_column_error(exc, "imagenes"):
                    _SCHEMA_CAPS["idea_imagenes"] = False
                    payload.pop("imagenes", None)
                    _write_update(payload, int(iid))
                else:
                    raise
        else:
            row = {
                "acta_id": int(acta_id),
                "texto": texto,
                "orden": orden,
                "quien_dijo": quien,
            }
            if include_titulo:
                row["titulo"] = titulo
            if include_imagenes and "imagenes" in idea:
                row["imagenes"] = _normalizar_imagenes_idea(idea.get("imagenes"))
            try:
                inserted = _write_insert(row)
            except Exception as exc:
                if include_titulo and "titulo" in row and _is_missing_column_error(exc, "titulo"):
                    _SCHEMA_CAPS["idea_titulo"] = False
                    row.pop("titulo", None)
                    inserted = _write_insert(row)
                elif include_imagenes and "imagenes" in row and _is_missing_column_error(exc, "imagenes"):
                    _SCHEMA_CAPS["idea_imagenes"] = False
                    row.pop("imagenes", None)
                    inserted = _write_insert(row)
                else:
                    raise
            if inserted and inserted.get("id") is not None:
                keep_ids.add(int(inserted["id"]))
    for e in existing:
        if int(e["id"]) not in keep_ids:
            # No borrar ideas con compromisos ligados
            comps = (
                sb.table("seguimiento_item")
                .select("id")
                .eq("idea_id", int(e["id"]))
                .limit(1)
                .execute()
                .data
                or []
            )
            if not comps:
                sb.table("seguimiento_acta_idea").delete().eq("id", int(e["id"])).execute()
    if ideas:
        _touch_acta_hora_fin(sb, acta_id)


def _sync_apartados(sb, acta_id: int, apartados: list) -> None:
    sb.table("seguimiento_acta_apartado").delete().eq("acta_id", int(acta_id)).execute()
    rows = []
    for i, ap in enumerate(apartados or []):
        rows.append({
            "acta_id": int(acta_id),
            "titulo": (ap.get("titulo") or "").strip() or None,
            "contenido": (ap.get("contenido") or "").strip() or None,
            "orden": int(ap.get("orden") if ap.get("orden") is not None else i),
        })
    if rows:
        sb.table("seguimiento_acta_apartado").insert(rows).execute()
        _touch_acta_hora_fin(sb, acta_id)


def add_idea(
    sb,
    contrato_id: int,
    acta_id: int,
    texto: str = "",
    *,
    user_id: Optional[int] = None,
    current_user: Optional[dict] = None,
) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    if user_id is not None:
        _assert_puede_editar_acta(acta, int(user_id), current_user)
    existing = sb.table("seguimiento_acta_idea").select("orden").eq("acta_id", int(acta_id)).order("orden", desc=True).limit(1).execute().data or []
    orden = (int(existing[0]["orden"]) + 1) if existing else 0
    ins = sb.table("seguimiento_acta_idea").insert({
        "acta_id": int(acta_id),
        "texto": sanitize_tema_html(texto),
        "orden": orden,
    }).execute().data
    if not ins:
        raise ValueError("No se pudo agregar la idea")
    _touch_acta_hora_fin(sb, acta_id)
    return ins[0]


def update_idea(
    sb,
    contrato_id: int,
    idea_id: int,
    texto: str,
    *,
    user_id: Optional[int] = None,
    current_user: Optional[dict] = None,
) -> dict:
    idea = sb.table("seguimiento_acta_idea").select("*, seguimiento_acta!inner(contrato_id)").eq("id", int(idea_id)).limit(1).execute().data
    # Fallback sin join si PostgREST no resuelve el alias
    if not idea:
        rows = sb.table("seguimiento_acta_idea").select("*").eq("id", int(idea_id)).limit(1).execute().data or []
        if not rows:
            raise ValueError("Idea no encontrada")
        acta = get_acta(sb, int(rows[0]["acta_id"]), contrato_id)
        idea_row = rows[0]
    else:
        idea_row = idea[0]
        acta_cid = None
        rel = idea_row.get("seguimiento_acta")
        if isinstance(rel, dict):
            acta_cid = rel.get("contrato_id")
        if acta_cid is not None and int(acta_cid) != int(contrato_id):
            raise ValueError("Idea no pertenece al contrato")
        acta = get_acta(sb, int(idea_row["acta_id"]), contrato_id)
    if user_id is not None:
        _assert_puede_editar_acta(acta, int(user_id), current_user)
    upd = sb.table("seguimiento_acta_idea").update({
        "texto": sanitize_tema_html(texto),
        "updated_at": _now_utc().isoformat(),
    }).eq("id", int(idea_id)).execute().data
    _touch_acta_hora_fin(sb, int(idea_row["acta_id"]))
    return (upd or [idea_row])[0]


# ── Compromisos ──────────────────────────────────────────────────────────────

def _proximo_consecutivo_item(sb, *, origen: str, user_id: Optional[int] = None, contrato_id: Optional[int] = None) -> int:
    q = sb.table("seguimiento_item").select("consecutivo").eq("origen", origen).not_.is_("consecutivo", "null")
    if origen == "tarea" and user_id is not None:
        q = q.eq("created_by", int(user_id))
    if origen == "compromiso" and contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    rows = q.order("consecutivo", desc=True).limit(1).execute().data or []
    if not rows:
        return 1
    return int(rows[0].get("consecutivo") or 0) + 1


def _norm_hora(raw) -> Optional[str]:
    if raw is None or raw == "":
        return None
    s = str(raw).strip()
    if len(s) >= 5 and s[2] == ":":
        return s[:5]
    return None


def crear_compromiso_desde_idea(
    sb,
    contrato_id: int,
    acta_id: int,
    idea_id: int,
    data: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> dict:
    """Crea uno o varios compromisos (uno por asignado). Solo elaborador (o Dev) en acta no sellada."""
    acta = get_acta(sb, acta_id, contrato_id)
    _assert_puede_editar_acta(acta, user_id, current_user)
    asignados = data.get("asignados") or []
    if not asignados and data.get("asignado_a_id"):
        asignados = [{
            "asignado_a_id": data["asignado_a_id"],
            "asignado_a_nombre": data.get("asignado_a_nombre"),
        }]
    if not asignados:
        raise ValueError("Debe indicar al menos un asignado")
    created = []
    for a in asignados:
        payload = {**data, **a}
        created.append(_crear_un_compromiso(sb, contrato_id, acta_id, idea_id, payload, user_id))
    return created[0] if len(created) == 1 else {"items": created, "count": len(created)}


def crear_compromiso_libre(
    sb,
    contrato_id: int,
    acta_id: int,
    data: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> dict:
    """Crea compromiso(s) del acta sin amarrarlos a una idea/tema concreto (idea_id=NULL)."""
    acta = get_acta(sb, acta_id, contrato_id)
    _assert_puede_editar_acta(acta, user_id, current_user)
    asignados = data.get("asignados") or []
    if not asignados and data.get("asignado_a_id"):
        asignados = [{
            "asignado_a_id": data["asignado_a_id"],
            "asignado_a_nombre": data.get("asignado_a_nombre"),
        }]
    if not asignados:
        raise ValueError("Debe indicar al menos un asignado")
    created = []
    for a in asignados:
        payload = {**data, **a}
        created.append(_crear_un_compromiso(sb, contrato_id, acta_id, None, payload, user_id))
    return created[0] if len(created) == 1 else {"items": created, "count": len(created)}


def _crear_un_compromiso(
    sb,
    contrato_id: int,
    acta_id: int,
    idea_id: Optional[int],
    data: dict,
    user_id: int,
) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    if idea_id is not None:
        ideas = {int(i["id"]): i for i in acta.get("ideas") or []}
        if int(idea_id) not in ideas:
            raise ValueError("La idea no pertenece al acta")

    # Atribución de origen: el compromiso proviene del acta/comité, no del operador.
    consec = acta.get("consecutivo")
    acta_label = f"Acta Nº {consec}" if consec is not None else "Compromiso de Comité"
    solicitante_nombre = f"Compromiso de Comité · {acta_label}" if consec is not None else "Compromiso de Comité"
    solicitante_id = int(data.get("solicitante_id") or user_id)

    raw_aid = data.get("asignado_a_id")
    externo_id = data.get("asignado_externo_id")
    es_externo = bool(data.get("es_externo")) or (externo_id is not None)
    nombre_asig = (data.get("asignado_a_nombre") or "").strip() or None

    # IDs negativos del front = contacto externo sintético (-externo_id)
    if raw_aid is not None and str(raw_aid) != "" and int(raw_aid) < 0:
        externo_id = abs(int(raw_aid))
        es_externo = True
        raw_aid = None

    asignado_id = None
    asignado = None
    if not es_externo and raw_aid is not None and str(raw_aid) != "":
        asignado_id = int(raw_aid)
        asignado = _usuario_row(sb, asignado_id)
        if not asignado:
            raise ValueError("Usuario asignado no encontrado")
        nombre_asig = nombre_asig or _nombre_usuario(asignado)
    else:
        es_externo = True
        if not nombre_asig and externo_id:
            # Resolver nombre desde catálogo
            try:
                rows = (
                    sb.table("seguimiento_contacto_externo")
                    .select("id,nombre,cargo,entidad,email")
                    .eq("id", int(externo_id))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if rows:
                    nombre_asig = (rows[0].get("nombre") or "").strip() or None
            except Exception:
                pass
        if not nombre_asig:
            raise ValueError("Indique el nombre del asignado externo")
        # Asegurar fila en catálogo si aún no hay id
        if not externo_id:
            ext = upsert_contacto_externo(
                sb,
                int(contrato_id),
                nombre=nombre_asig,
                cargo=data.get("asignado_cargo"),
                entidad=data.get("asignado_entidad"),
                email=data.get("asignado_email"),
            )
            if ext and ext.get("id"):
                externo_id = int(ext["id"])
        if not externo_id:
            raise ValueError(
                "No se pudo registrar el contacto externo como asignado. "
                "Verifique que la migración de contactos externos esté aplicada."
            )
        if not _ensure_asignado_externo_column(sb):
            raise ValueError(
                "La asignación a contactos externos no está disponible: "
                "la API no ve la columna asignado_externo_id. "
                "Si ya aplicó la migración en Supabase, ejecute en el SQL Editor: "
                "NOTIFY pgrst, 'reload schema'; "
                "(o Configuración → API → Reload schema) y reintente."
            )

    fv = _parse_date(data.get("fecha_vencimiento"))
    if not fv:
        raise ValueError("Fecha de vencimiento requerida")
    cache = CalendarioNoHabilesCache(loader=make_calendar_loader(sb))
    limite = calcular_fecha_limite_gracia(contrato_id, fv, cache)
    titulo = (data.get("titulo") or data.get("redaccion") or "").strip()
    if not titulo:
        raise ValueError("Debe indicar la redacción del compromiso")
    descripcion = (data.get("descripcion") or data.get("redaccion") or titulo).strip()
    hora = _norm_hora(data.get("hora_vencimiento"))
    consec_item = _proximo_consecutivo_item(sb, origen="compromiso", contrato_id=contrato_id)
    row = {
        "origen": "compromiso",
        "titulo": titulo[:500],
        "descripcion": descripcion,
        "estado_gestion": "abierto",
        "asignado_a_id": asignado_id,
        "asignado_a_nombre": nombre_asig,
        "created_by": int(user_id),
        "fecha_vencimiento": fv.isoformat(),
        "fecha_vencimiento_original": fv.isoformat(),
        "hora_vencimiento": hora,
        "fecha_limite_gracia": limite.astimezone(timezone.utc).isoformat(),
        "contrato_id": int(contrato_id),
        "acta_id": int(acta_id),
        "idea_id": int(idea_id) if idea_id is not None else None,
        "solicitante_id": solicitante_id,
        "solicitante_nombre": solicitante_nombre,
        "consecutivo": consec_item,
        "relacion_destinatario": "asignacion",
        "updated_at": _now_utc().isoformat(),
    }
    if es_externo and externo_id is not None and _schema_has(sb, "asignado_externo_id"):
        row["asignado_externo_id"] = int(externo_id)
        # Metadato auxiliar para bandeja/UI
        row["campos_libres"] = {
            "asignado_externo": True,
            "externo_id": int(externo_id),
        }

    try:
        ins = sb.table("seguimiento_item").insert(row).execute().data
    except Exception as exc:
        if es_externo and _is_missing_column_error(exc, "asignado_externo_id"):
            _SCHEMA_CAPS["asignado_externo_id"] = None
            raise ValueError(
                "No se pueden asignar contactos externos: la API no ve "
                "asignado_externo_id. Si la migración ya está aplicada, ejecute "
                "NOTIFY pgrst, 'reload schema'; en Supabase y reintente."
            ) from exc
        raise
    if not ins:
        raise ValueError("No se pudo crear el compromiso")
    item = ins[0]
    _registrar_evento(sb, int(item["id"]), "compromiso_creado", user_id, {"acta_id": acta_id, "idea_id": idea_id})
    # Notificación inmediata solo a usuarios reales de plataforma
    if asignado_id:
        _notificar_compromiso_asignado(
            sb,
            destinatario_id=asignado_id,
            remitente_id=user_id,
            titulo=titulo,
            fecha_vencimiento=fv.isoformat(),
            contrato_id=contrato_id,
            item_id=item["id"],
            acta=acta,
            reasignacion=False,
        )
    return item


def actualizar_estado_gestion(
    sb,
    item_id: int,
    estado: str,
    user_id: int,
    *,
    contrato_id: Optional[int] = None,
    nueva_fecha_vencimiento: Optional[str] = None,
    hora_vencimiento: Optional[str] = None,
) -> dict:
    if estado not in ITEM_ESTADOS:
        raise ValueError("Estado de gestión no válido")
    item = get_item(sb, item_id)
    if contrato_id is not None and item.get("contrato_id") and int(item["contrato_id"]) != int(contrato_id):
        raise ValueError("El ítem no pertenece al contrato")
    # Tareas con checklist: el estado global se deriva del avance de sub-ítems
    if item.get("origen") == "tarea" and estado != "reprogramado":
        ck = (item.get("campos_libres") or {}).get("checklist") if isinstance(item.get("campos_libres"), dict) else None
        if isinstance(ck, list) and len(ck) > 0:
            raise ValueError(
                "El estado de la tarea se calcula según el avance de sus sub-ítems. "
                "Actualice el estado de cada sub-ítem en la checklist."
            )
        # Multi-destinatario sin checklist: cada asignado marca su propio estado
        if _asignaciones_efectivas(item) and estado != "reprogramado":
            return actualizar_estado_asignado(
                sb, item_id, user_id, estado, checklist_id=None, current_user=None,
            )
    if estado == "reprogramado":
        if item.get("origen") != "tarea":
            raise ValueError("Reprogramar solo aplica a tareas personales")
        fv = _parse_date(nueva_fecha_vencimiento)
        if not fv:
            raise ValueError("Indique la nueva fecha de vencimiento para reprogramar")
        hoy = _now_bogota().date()
        patch = {
            "estado_gestion": "reprogramado",
            "fecha_vencimiento": fv.isoformat(),
            "hora_vencimiento": _norm_hora(hora_vencimiento) if hora_vencimiento is not None else item.get("hora_vencimiento"),
            "updated_at": _now_utc().isoformat(),
        }
        if _schema_has(sb, "fecha_base_nivel"):
            patch["fecha_base_nivel"] = hoy.isoformat()
        try:
            sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
        except Exception as exc:
            if "fecha_base_nivel" in patch and _is_missing_column_error(exc, "fecha_base_nivel"):
                _SCHEMA_CAPS["fecha_base_nivel"] = False
                patch.pop("fecha_base_nivel", None)
                # Fallback: reinicio de nivel vía campos_libres
                libres = dict(item.get("campos_libres") or {})
                libres["nivel_desde"] = hoy.isoformat()
                patch["campos_libres"] = libres
                sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
            else:
                raise
        _registrar_evento(sb, item_id, "reprogramado", user_id, {
            "estado": "reprogramado",
            "fecha_vencimiento": fv.isoformat(),
            "fecha_anterior": item.get("fecha_vencimiento"),
        })
        return get_item(sb, item_id)

    patch = {"estado_gestion": estado, "updated_at": _now_utc().isoformat()}
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    tipo = {
        "cumplido": "cumplimiento_a_tiempo" if not item.get("vencido_at") else "cumplimiento_con_demora",
        "parcial": "cumplimiento_parcial",
        "vencido": "marcado_vencido",
        "cancelado": "cancelado",
        "en_progreso": "en_progreso",
        "abierto": "reabierto",
    }.get(estado, "cambio_estado")
    _registrar_evento(sb, item_id, tipo, user_id, {"estado": estado})
    _notificar_delegante_tarea_cumplida(
        sb,
        item,
        prev_estado=item.get("estado_gestion"),
        new_estado=estado,
        actor_id=user_id,
    )
    # Primera acción de gestión sobre un compromiso del acta → hora de inicio.
    if (item.get("origen") or "").strip().lower() == "compromiso" and item.get("acta_id"):
        _maybe_set_acta_hora_inicio(sb, int(item["acta_id"]))
    return get_item(sb, item_id)


# ── Tareas personales ────────────────────────────────────────────────────────

def _new_checklist_id() -> str:
    import uuid

    return uuid.uuid4().hex[:12]


def _normalizar_imagen_ref(raw) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    nombre = (raw.get("nombre") or "imagen.png").strip()[:120] or "imagen.png"
    blob_path = raw.get("blob_path") or None
    data_uri = raw.get("data_uri") or None
    # Si hay blob en Azure, no persistir data_uri (solo se enriquece al leer)
    if blob_path and data_uri:
        data_uri = None
    out = {
        "nombre": nombre,
        "blob_path": blob_path,
        "data_uri": data_uri,
        "mime_type": raw.get("mime_type") or "image/png",
        "created_at": raw.get("created_at") or _now_utc().isoformat(),
    }
    if raw.get("kind"):
        out["kind"] = raw["kind"]
    if not out["blob_path"] and not out["data_uri"] and not raw.get("url"):
        return None
    if raw.get("url") and not out["data_uri"] and not out["blob_path"]:
        out["url"] = raw["url"]
    return out


def _norm_estado_subitem(raw, *, hecho: bool = False) -> str:
    return _norm_estado_gestion_val(raw, hecho=hecho)


def _estado_efectivo_subitem(it: dict) -> str:
    """Estado colectivo del sub-ítem: agrega asignaciones[] si existen."""
    if not isinstance(it, dict):
        return "abierto"
    asigns = _normalizar_lista_asignaciones(it.get("asignaciones"))
    if asigns:
        return _agregar_estados_asignados([a.get("estado_gestion") for a in asigns])
    return _norm_estado_subitem(it.get("estado_gestion"), hecho=bool(it.get("hecho")))


def _avance_desde_checklist(checklist: List[dict]) -> tuple:
    """
    Retorna (pct|None, estado_tarea).
    Cancelados fuera de numerador y denominador. 100% ⇒ cumplido.
    Sub-ítem con múltiples destinatarios solo cuenta cumplido si todos confirmaron.
    """
    items = checklist or []
    if not items:
        return None, "abierto"
    estados = [_estado_efectivo_subitem(it) for it in items]
    validos_idx = [i for i, e in enumerate(estados) if e != "cancelado"]
    if not validos_idx:
        return None, "cancelado"
    cumplidos = sum(1 for i in validos_idx if estados[i] == "cumplido")
    pct = int(round(100.0 * cumplidos / len(validos_idx)))
    if pct >= 100:
        estado = "cumplido"
    elif cumplidos > 0 or any(estados[i] == "parcial" for i in validos_idx):
        estado = "parcial"
    elif any(estados[i] in ("en_progreso", "reprogramado", "vencido") for i in validos_idx):
        estado = "en_progreso"
    else:
        estado = "abierto"
    return pct, estado


def _normalizar_tabla_subitem(raw) -> Optional[dict]:
    """Tabla editable embebida en un sub-ítem: {rows, cols, cells[][]}."""
    if not isinstance(raw, dict):
        return None
    cells_in = raw.get("cells")
    if not isinstance(cells_in, list) or not cells_in:
        return None
    rows = max(1, min(30, int(raw.get("rows") or len(cells_in) or 1)))
    first_row = cells_in[0] if isinstance(cells_in[0], list) else []
    cols = max(1, min(20, int(raw.get("cols") or (len(first_row) if first_row else 1))))
    cells: List[List[str]] = []
    for i in range(rows):
        src = cells_in[i] if i < len(cells_in) and isinstance(cells_in[i], list) else []
        row: List[str] = []
        for j in range(cols):
            val = src[j] if j < len(src) else ""
            row.append(str(val)[:2000] if val is not None else "")
        cells.append(row)
    return {"rows": rows, "cols": cols, "cells": cells}


def _normalizar_comentarios_subitem(raw) -> List[dict]:
    """Comentarios independientes por sub-ítem (no son los comentarios del ítem bandeja)."""
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        mensaje = (c.get("mensaje") or c.get("texto") or "").strip()
        if not mensaje:
            continue
        cid = str(c.get("id") or _new_checklist_id())[:40]
        autor_nombre = (c.get("autor_nombre") or c.get("autor") or "").strip()[:200]
        autor_id = c.get("autor_id")
        try:
            autor_id = int(autor_id) if autor_id is not None else None
        except Exception:
            autor_id = None
        created = c.get("created_at")
        if created is not None:
            created = str(created)[:40]
        else:
            created = datetime.now(timezone.utc).isoformat()
        out.append({
            "id": cid,
            "mensaje": mensaje[:4000],
            "autor_nombre": autor_nombre,
            "autor_id": autor_id,
            "created_at": created,
        })
        if len(out) >= 200:
            break
    return out


def _normalizar_checklist_tarea(raw) -> List[dict]:
    """Sub-ítems: texto, estado, fecha/hora, imagen, esquema, tabla, notas, enlace y comentarios."""
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    for i, it in enumerate(raw):
        if not isinstance(it, dict):
            continue
        texto = (it.get("texto") or it.get("text") or "").strip()
        cid = (it.get("id") or it.get("key") or _new_checklist_id())
        fecha = _parse_date(it.get("fecha") or it.get("fecha_vencimiento"))
        hora = _norm_hora(it.get("hora") or it.get("hora_vencimiento"))
        imagen = _normalizar_imagen_ref(it.get("imagen") or it.get("image"))
        if imagen is None and isinstance(it.get("imagenes"), list) and it["imagenes"]:
            imagen = _normalizar_imagen_ref(it["imagenes"][0])
        esquema = _normalizar_imagen_ref(it.get("esquema") or it.get("dibujo_item"))
        if esquema:
            esquema["kind"] = "esquema"
        notas_item = it.get("notas") if it.get("notas") is not None else it.get("comentario")
        enlace = (it.get("enlace") or it.get("link") or "").strip()
        hecho = bool(it.get("hecho") or it.get("done") or it.get("checked"))
        estado = _norm_estado_subitem(it.get("estado_gestion"), hecho=hecho)
        # Mantener hecho alineado con cumplido
        if estado == "cumplido":
            hecho = True
        elif estado != "cumplido":
            hecho = False
        tabla = _normalizar_tabla_subitem(it.get("tabla"))
        comentarios = _normalizar_comentarios_subitem(it.get("comentarios"))
        asignaciones_item = _normalizar_lista_asignaciones(it.get("asignaciones"))
        if asignaciones_item:
            estado = _agregar_estados_asignados([a.get("estado_gestion") for a in asignaciones_item])
            hecho = estado == "cumplido"
        out_row = {
            "id": str(cid)[:40],
            "texto": texto[:2000],
            "hecho": hecho,
            "estado_gestion": estado,
            "fecha": fecha.isoformat() if fecha else None,
            "hora": hora,
            "imagen": imagen,
            "esquema": esquema,
            "tabla": tabla,
            "notas": (str(notas_item)[:4000] if notas_item is not None else "") or "",
            "enlace": enlace[:2000] if enlace else "",
            "comentarios": comentarios,
            "orden": int(it.get("orden") if it.get("orden") is not None else i),
        }
        if asignaciones_item:
            out_row["asignaciones"] = asignaciones_item
        out.append(out_row)
    out.sort(key=lambda x: x.get("orden") or 0)
    for i, it in enumerate(out):
        it["orden"] = i
    return out


def _fecha_proxima_checklist(checklist: List[dict]) -> tuple:
    """Devuelve (fecha_iso, hora) del sub-ítem con vencimiento más próximo."""
    best_ts = None
    best = (None, None)
    for it in checklist or []:
        f = _parse_date(it.get("fecha"))
        if not f:
            continue
        h = _norm_hora(it.get("hora")) or "23:59"
        try:
            hh, mm = [int(x) for x in h.split(":")[:2]]
        except Exception:
            hh, mm = 23, 59
        ts = datetime(f.year, f.month, f.day, hh, mm)
        if best_ts is None or ts < best_ts:
            best_ts = ts
            best = (f.isoformat(), _norm_hora(it.get("hora")))
    return best


def _descripcion_desde_checklist(checklist: List[dict]) -> Optional[str]:
    parts = [str(it.get("texto") or "").strip() for it in (checklist or []) if str(it.get("texto") or "").strip()]
    if not parts:
        return None
    return "\n".join(f"{'☑' if it.get('hecho') else '☐'} {it.get('texto')}" for it in checklist if str(it.get("texto") or "").strip())


def _normalizar_campos_libres_tarea(raw) -> dict:
    """Campos libres de tarea: checklist es el contenedor de contenido (imagen/esquema/notas/enlace por sub-ítem)."""
    base = dict(raw) if isinstance(raw, dict) else {}
    base.pop("prioridad", None)
    base.pop("destinatario_tentativo_id", None)
    base.pop("destinatario_tentativo_nombre", None)
    # Contenido general deprecado: vive en cada sub-ítem
    base.pop("dibujos", None)
    base.pop("notas", None)
    if "asignaciones" in base:
        base["asignaciones"] = _normalizar_lista_asignaciones(base.get("asignaciones"))
        if not base["asignaciones"]:
            base.pop("asignaciones", None)
    if "checklist" in base:
        checklist = _normalizar_checklist_tarea(base.get("checklist"))
        # Propagar asignaciones de tarea a sub-ítems que aún no las tienen
        task_asig = _normalizar_lista_asignaciones(base.get("asignaciones"))
        if task_asig:
            for it in checklist:
                if not it.get("asignaciones"):
                    it["asignaciones"] = _clonar_asignaciones_estado(task_asig, "abierto")
                    it["estado_gestion"] = _agregar_estados_asignados(
                        [a.get("estado_gestion") for a in it["asignaciones"]]
                    )
                    it["hecho"] = it["estado_gestion"] == "cumplido"
        base["checklist"] = checklist
        pct, _estado = _avance_desde_checklist(base["checklist"])
        base["avance_pct"] = pct
    return base


def _enrich_imagen_preview(im: Optional[dict]) -> Optional[dict]:
    """Asegura data_uri/url para previsualizar adjuntos guardados solo con blob_path."""
    if not im or not isinstance(im, dict):
        return im
    out = dict(im)
    if out.get("data_uri") or out.get("url"):
        return out
    path = (out.get("blob_path") or "").strip()
    if not path or path.startswith("data:"):
        if path.startswith("data:") and not out.get("data_uri"):
            out["data_uri"] = path
        return out
    try:
        from azure_blob_storage import download_blob_bytes_private

        content = download_blob_bytes_private(path)
        if len(content) > 2_500_000:
            # Demasiado grande para embeber; el cliente verá solo el nombre.
            return out
        mime = out.get("mime_type") or "image/png"
        out["data_uri"] = f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"
    except Exception as exc:
        _log.warning("preview imagen tarea %s: %s", path, exc)
    return out


def _enrich_tarea_media(item: dict) -> dict:
    if not item or item.get("origen") != "tarea":
        return item
    imgs = item.get("imagenes") or []
    if isinstance(imgs, list):
        item["imagenes"] = [_enrich_imagen_preview(x) or x for x in imgs if isinstance(x, dict)]
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
    # dibujos/notas a nivel tarea quedan deprecados; no se enriquecen
    libres.pop("dibujos", None)
    if isinstance(libres.get("checklist"), list):
        ck = []
        for it in libres["checklist"]:
            if not isinstance(it, dict):
                continue
            row = dict(it)
            if row.get("imagen"):
                row["imagen"] = _enrich_imagen_preview(row["imagen"])
            if row.get("esquema"):
                row["esquema"] = _enrich_imagen_preview(row["esquema"])
            ck.append(row)
        libres["checklist"] = ck
    item["campos_libres"] = libres
    return item


def _store_imagen_bytes(
    item_id: int,
    nombre: str,
    content: bytes,
    mime: str,
    *,
    prefix: str = "seguimiento-tareas",
) -> dict:
    from azure_blob_storage import upload_blob_private

    safe = re.sub(r"[^\w.\-]", "_", (nombre or "imagen.png").strip())[:120]
    ts = _now_utc().strftime("%Y%m%dT%H%M%SZ")
    blob_path = f"{prefix}/{int(item_id)}/{ts}_{safe}"
    data_uri = None
    stored_path = None
    try:
        upload_blob_private(blob_path, content, content_type=mime or "image/png", overwrite=True)
        stored_path = blob_path
        # Embebido corto para preview inmediata (evita depender de Azure en el GET)
        if len(content) <= 1_200_000:
            data_uri = f"data:{(mime or 'image/png')};base64,{base64.b64encode(content).decode('ascii')}"
    except Exception:
        data_uri = f"data:{(mime or 'image/png')};base64,{base64.b64encode(content).decode('ascii')}"
    return {
        "nombre": safe,
        "blob_path": stored_path,
        "data_uri": data_uri,
        "mime_type": mime or "image/png",
        "created_at": _now_utc().isoformat(),
    }


def adjuntar_imagen_idea_base64(
    sb,
    contrato_id: int,
    idea_id: int,
    user_id: int,
    nombre: str,
    data_b64: str,
    mime: str = "image/png",
    *,
    current_user: Optional[dict] = None,
) -> dict:
    """Adjunta un esquema/gráfico a una idea central (máx. 8 por idea)."""
    if not _ensure_idea_imagenes_column(sb):
        raise ValueError(
            "La columna imagenes de ideas no está disponible. "
            "Aplique la migración 20260731210000_seguimiento_idea_imagenes.sql "
            "y ejecute NOTIFY pgrst, 'reload schema'."
        )
    rows = (
        sb.table("seguimiento_acta_idea")
        .select("*")
        .eq("id", int(idea_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Idea no encontrada")
    idea = rows[0]
    acta = get_acta(sb, int(idea["acta_id"]), contrato_id)
    _assert_puede_editar_acta(acta, int(user_id), current_user)

    raw = data_b64 or ""
    if "," in raw and raw.strip().startswith("data:"):
        header, raw = raw.split(",", 1)
        m = re.search(r"data:([^;]+)", header)
        if m:
            mime = m.group(1)
    try:
        content = base64.b64decode(raw)
    except Exception as exc:
        raise ValueError("Imagen inválida") from exc
    if len(content) > 8_000_000:
        raise ValueError("La imagen supera 8 MB")
    if not (mime or "").startswith("image/"):
        raise ValueError("Solo se permiten archivos de imagen")

    actuales = idea.get("imagenes") if isinstance(idea.get("imagenes"), list) else []
    if len(actuales) >= 8:
        raise ValueError("Máximo 8 esquemas/gráficos por idea")

    ref = _store_imagen_bytes(
        int(idea_id),
        nombre or "esquema.png",
        content,
        mime or "image/png",
        prefix="seguimiento-acta-ideas",
    )
    ref["kind"] = "esquema"
    persist = _normalizar_imagen_ref(ref) or ref
    # Persistir sin data_uri si hay blob
    store_row = {
        "nombre": persist.get("nombre") or "esquema.png",
        "blob_path": persist.get("blob_path"),
        "mime_type": persist.get("mime_type") or "image/png",
        "created_at": persist.get("created_at") or _now_utc().isoformat(),
        "kind": "esquema",
    }
    if not store_row.get("blob_path") and ref.get("data_uri"):
        store_row["data_uri"] = ref["data_uri"]

    nuevos = list(actuales) + [store_row]
    sb.table("seguimiento_acta_idea").update({
        "imagenes": nuevos,
        "updated_at": _now_utc().isoformat(),
    }).eq("id", int(idea_id)).execute()
    _touch_acta_hora_fin(sb, int(idea["acta_id"]))

    # Devolver idea enriquecida
    refreshed = (
        sb.table("seguimiento_acta_idea")
        .select("*")
        .eq("id", int(idea_id))
        .limit(1)
        .execute()
        .data
        or [idea]
    )
    out = _enrich_idea_row(refreshed[0])
    # Asegurar preview inmediata de la recién subida
    if ref.get("data_uri") and out.get("imagenes"):
        last = out["imagenes"][-1]
        if isinstance(last, dict) and not last.get("data_uri"):
            last["data_uri"] = ref["data_uri"]
    return out


def crear_tarea(sb, data: dict, user_id: int) -> dict:
    u = _usuario_row(sb, user_id)
    titulo = (data.get("titulo") or "").strip()
    if not titulo:
        raise ValueError("El título de la tarea es obligatorio")
    # Tareas personales quedan aisladas al contrato activo de la plataforma
    raw_cid = data.get("contrato_id")
    if raw_cid is None or raw_cid == "":
        raw_cid = (u or {}).get("contrato_id")
    try:
        contrato_id = int(raw_cid) if raw_cid is not None and raw_cid != "" else None
    except (TypeError, ValueError):
        contrato_id = None
    if contrato_id is None:
        raise ValueError("contrato_id es obligatorio para crear la tarea en el contrato activo")
    imagenes = data.get("imagenes") or []
    if not isinstance(imagenes, list):
        imagenes = []
    campos = _normalizar_campos_libres_tarea(data.get("campos_libres"))
    # Semilla de checklist desde descripción legacy si no viene checklist
    if not campos.get("checklist") and (data.get("descripcion") or "").strip():
        campos["checklist"] = _normalizar_checklist_tarea([{
            "texto": (data.get("descripcion") or "").strip(),
            "fecha": data.get("fecha_vencimiento"),
            "hora": data.get("hora_vencimiento"),
        }])
    fv_ck, hora_ck = _fecha_proxima_checklist(campos.get("checklist") or [])
    fv = _parse_date(data.get("fecha_vencimiento")) or (_parse_date(fv_ck) if fv_ck else None)
    if fv_ck:
        fv = _parse_date(fv_ck)
    hora = hora_ck if fv_ck else _norm_hora(data.get("hora_vencimiento"))
    descripcion = (data.get("descripcion") or "").strip() or _descripcion_desde_checklist(campos.get("checklist") or [])
    consec = _proximo_consecutivo_item(sb, origen="tarea", user_id=user_id)
    relacion = (data.get("relacion_destinatario") or "").strip().lower() or None
    destinatarios = _parse_destinatarios_payload(data, sb, user_id)
    asignado_id = int(data.get("asignado_a_id") or user_id)
    asignado_nombre = data.get("asignado_a_nombre") or _nombre_usuario(u)
    referido_id = None
    referido_nombre = None

    if relacion == "asignacion":
        if not destinatarios:
            raise ValueError("Seleccione al menos un destinatario para delegar")
        for d in destinatarios:
            if not _usuario_row(sb, int(d["usuario_id"])):
                raise ValueError(f"Destinatario no encontrado: {d.get('nombre') or d['usuario_id']}")
        campos["asignaciones"] = _clonar_asignaciones_estado(destinatarios, "abierto")
        # Sembrar estado individual en cada sub-ítem
        if campos.get("checklist"):
            for it in campos["checklist"]:
                it["asignaciones"] = _clonar_asignaciones_estado(destinatarios, "abierto")
                it["estado_gestion"] = "abierto"
                it["hecho"] = False
        asignado_id = int(destinatarios[0]["usuario_id"])
        asignado_nombre = _nombres_asignaciones(destinatarios)
        referido_id = None
        referido_nombre = None
    elif relacion == "referencia":
        # Fuera de alcance multi: un solo referido informativo
        if not destinatarios:
            raise ValueError("Seleccione el destinatario de la referencia")
        if len(destinatarios) > 1:
            raise ValueError("La referencia solo admite un destinatario")
        dest = _usuario_row(sb, int(destinatarios[0]["usuario_id"]))
        if not dest:
            raise ValueError("Destinatario no encontrado")
        referido_id = int(destinatarios[0]["usuario_id"])
        referido_nombre = destinatarios[0].get("nombre") or _nombre_usuario(dest)
        # Creador permanece como responsable
        asignado_id = int(user_id)
        asignado_nombre = _nombre_usuario(u)
    else:
        relacion = None
        referido_id = None

    _pct_init, estado_agg = _avance_desde_checklist(campos.get("checklist") or [])
    if relacion == "asignacion" and not (campos.get("checklist") or []):
        estado_agg = _agregar_estados_asignados(
            [a.get("estado_gestion") for a in campos.get("asignaciones") or []]
        )
    row = {
        "origen": "tarea",
        "titulo": titulo[:500],
        "descripcion": descripcion,
        "estado_gestion": data.get("estado_gestion") or estado_agg or "abierto",
        "asignado_a_id": asignado_id,
        "asignado_a_nombre": asignado_nombre,
        "created_by": int(user_id),
        "contrato_id": int(contrato_id),
        "fecha_vencimiento": fv.isoformat() if fv else None,
        "hora_vencimiento": hora,
        "consecutivo": consec,
        "relacion_destinatario": relacion,
        "referido_a_id": referido_id,
        "referido_a_nombre": referido_nombre,
        "campos_libres": campos,
        "imagenes": imagenes,
        "updated_at": _now_utc().isoformat(),
    }
    ins = sb.table("seguimiento_item").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear la tarea")
    item = ins[0]
    _registrar_evento(
        sb,
        int(item["id"]),
        "tarea_creada",
        user_id,
        {
            "relacion": relacion,
            "contrato_id": contrato_id,
            "destinatarios": [a["usuario_id"] for a in (campos.get("asignaciones") or [])],
        },
    )
    if relacion == "asignacion":
        for a in campos.get("asignaciones") or []:
            _notificar(
                sb,
                destinatario_id=int(a["usuario_id"]),
                remitente_id=user_id,
                asunto=f"Tarea: {titulo[:80]}",
                mensaje=f"Se le asignó formalmente la tarea «{titulo}».",
                contrato_id=int(contrato_id),
                entidad_tipo="seguimiento_tarea",
                entidad_id=str(item["id"]),
            )
    elif relacion == "referencia" and referido_id:
        _notificar(
            sb,
            destinatario_id=int(referido_id),
            remitente_id=user_id,
            asunto=f"Tarea: {titulo[:80]}",
            mensaje=f"Se le compartió como referencia la tarea «{titulo}».",
            contrato_id=int(contrato_id),
            entidad_tipo="seguimiento_tarea",
            entidad_id=str(item["id"]),
        )
    return item


def update_tarea(sb, item_id: int, data: dict, user_id: int, current_user: Optional[dict] = None) -> dict:
    item = get_item(sb, item_id)
    if item.get("origen") != "tarea":
        raise ValueError("El ítem no es una tarea personal")
    es_dev = es_desarrollador_seguimiento(current_user)
    if (
        not es_dev
        and int(item.get("created_by") or 0) != int(user_id)
        and int(item.get("asignado_a_id") or 0) != int(user_id)
        and not _usuario_es_asignado_formal(item, user_id)
    ):
        raise ValueError("No puede editar esta tarea")
    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    if "titulo" in data:
        t = (data.get("titulo") or "").strip()
        if not t:
            raise ValueError("Título obligatorio")
        patch["titulo"] = t[:500]
    if "estado_gestion" in data:
        patch["estado_gestion"] = data["estado_gestion"]
    if "campos_libres" in data:
        prev = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
        incoming = dict(data.get("campos_libres") or {}) if isinstance(data.get("campos_libres"), dict) else {}
        merged = {**prev, **incoming}
        # No permitir que el cliente borre asignaciones formales por omisión
        if "asignaciones" not in incoming and prev.get("asignaciones"):
            merged["asignaciones"] = prev["asignaciones"]
        if "checklist" not in incoming and "checklist" in prev:
            merged["checklist"] = prev["checklist"]
        # Al actualizar checklist, fusionar imagen/esquema/asignaciones ya persistidos si el cliente los omite
        if "checklist" in incoming and isinstance(prev.get("checklist"), list):
            prev_by_id = {
                str(x.get("id")): x
                for x in prev.get("checklist") or []
                if isinstance(x, dict) and x.get("id")
            }
            merged_ck = []
            for it in incoming.get("checklist") or []:
                if not isinstance(it, dict):
                    continue
                row = dict(it)
                old = prev_by_id.get(str(row.get("id") or ""))
                if old:
                    # Solo restaurar si el cliente omitió la clave (null = borrado explícito)
                    if "imagen" not in it and old.get("imagen"):
                        row["imagen"] = old["imagen"]
                    if "esquema" not in it and old.get("esquema"):
                        row["esquema"] = old["esquema"]
                    if "asignaciones" not in it and old.get("asignaciones"):
                        row["asignaciones"] = old["asignaciones"]
                merged_ck.append(row)
            merged["checklist"] = merged_ck
        campos = _normalizar_campos_libres_tarea(merged)
        patch["campos_libres"] = campos
        fv_ck, hora_ck = _fecha_proxima_checklist(campos.get("checklist") or [])
        if fv_ck:
            patch["fecha_vencimiento"] = fv_ck
            patch["hora_vencimiento"] = hora_ck
        elif "checklist" in incoming:
            # Sin fechas en checklist: limpiar vencimiento derivado
            patch["fecha_vencimiento"] = None
            patch["hora_vencimiento"] = None
        patch["descripcion"] = _descripcion_desde_checklist(campos.get("checklist") or [])
        # Estado de la tarea = agregación del avance de sub-ítems
        if "checklist" in incoming or campos.get("checklist") is not None:
            _pct, estado_agg = _avance_desde_checklist(campos.get("checklist") or [])
            patch["estado_gestion"] = estado_agg
    if "descripcion" in data and "campos_libres" not in data:
        patch["descripcion"] = (data.get("descripcion") or "").strip() or None
    if "fecha_vencimiento" in data and "campos_libres" not in data:
        fv = _parse_date(data.get("fecha_vencimiento"))
        patch["fecha_vencimiento"] = fv.isoformat() if fv else None
    if "hora_vencimiento" in data and "campos_libres" not in data:
        patch["hora_vencimiento"] = _norm_hora(data.get("hora_vencimiento"))
    if "imagenes" in data:
        patch["imagenes"] = data.get("imagenes") or []
    prev_estado = (item.get("estado_gestion") or "").strip().lower()
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    new_estado = (patch.get("estado_gestion") or prev_estado or "").strip().lower()
    # Tras checklist: si pasó a cumplido colectivo, avisar al delegante
    item_notif = dict(item)
    if "campos_libres" in patch:
        item_notif["campos_libres"] = patch["campos_libres"]
    if "estado_gestion" in patch:
        item_notif["estado_gestion"] = patch["estado_gestion"]
    _notificar_delegante_tarea_cumplida(
        sb,
        item_notif,
        prev_estado=prev_estado,
        new_estado=new_estado,
        actor_id=user_id,
    )
    return get_item_detalle(sb, item_id, user_id=user_id, current_user=current_user)


def actualizar_estado_asignado(
    sb,
    item_id: int,
    user_id: int,
    estado: str,
    *,
    checklist_id: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> dict:
    """
    Registra el cumplido/estado individual de un destinatario.
    - Sin checklist_id: actualiza asignaciones[] a nivel tarea (tareas sin sub-ítems).
    - Con checklist_id: actualiza asignaciones[] del sub-ítem; el global se agrega.
    Notifica al delegante en cada cumplido individual y al cierre colectivo.
    """
    estado = _norm_estado_gestion_val(estado)
    if estado not in ITEM_ESTADOS:
        raise ValueError("Estado de gestión no válido")
    item = get_item(sb, item_id)
    if item.get("origen") != "tarea":
        raise ValueError("Solo aplica a tareas personales")
    if not _usuario_es_asignado_formal(item, user_id) and not es_desarrollador_seguimiento(current_user):
        raise ValueError("No es destinatario asignado de esta tarea")

    asigns_task = _asignaciones_efectivas(item)
    if not asigns_task:
        raise ValueError("Esta tarea no tiene destinatarios de asignación formal")

    actor_row = _usuario_row(sb, user_id)
    actor_nombre = _nombre_usuario(actor_row) or f"Usuario #{user_id}"
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
    prev_global = (item.get("estado_gestion") or "").strip().lower()
    checklist = list(libres.get("checklist") or []) if isinstance(libres.get("checklist"), list) else []

    individual_cumplido = False
    ambito = "la tarea"

    if checklist_id:
        found = False
        for it in checklist:
            if str(it.get("id")) != str(checklist_id):
                continue
            found = True
            asig = _normalizar_lista_asignaciones(it.get("asignaciones"))
            if not asig:
                asig = _clonar_asignaciones_estado(asigns_task, "abierto")
            prev_mine = next(
                (a.get("estado_gestion") for a in asig if int(a["usuario_id"]) == int(user_id)),
                None,
            )
            updated = False
            for a in asig:
                if int(a["usuario_id"]) == int(user_id):
                    a["estado_gestion"] = estado
                    a["updated_at"] = _now_utc().isoformat()
                    if not a.get("nombre"):
                        a["nombre"] = actor_nombre
                    updated = True
                    break
            if not updated:
                raise ValueError("Usted no está asignado a este sub-ítem")
            it["asignaciones"] = asig
            it["estado_gestion"] = _agregar_estados_asignados([a.get("estado_gestion") for a in asig])
            it["hecho"] = it["estado_gestion"] == "cumplido"
            texto = (it.get("texto") or "").strip() or "sub-ítem"
            ambito = f"el sub-ítem «{texto[:80]}»"
            if estado == "cumplido" and (prev_mine or "").strip().lower() != "cumplido":
                individual_cumplido = True
            break
        if not found:
            raise ValueError("Sub-ítem no encontrado")
        libres["checklist"] = _normalizar_checklist_tarea(checklist)
        # Sincronizar estado individual a nivel tarea (agregado de sus sub-ítems)
        task_asig = _normalizar_lista_asignaciones(libres.get("asignaciones")) or _clonar_asignaciones_estado(asigns_task)
        for a in task_asig:
            uid = int(a["usuario_id"])
            estados_user = []
            for it in libres["checklist"]:
                for xa in _normalizar_lista_asignaciones(it.get("asignaciones")):
                    if int(xa["usuario_id"]) == uid:
                        estados_user.append(xa.get("estado_gestion"))
            if estados_user:
                a["estado_gestion"] = _agregar_estados_asignados(estados_user)
                a["updated_at"] = _now_utc().isoformat()
        libres["asignaciones"] = task_asig
        pct, estado_agg = _avance_desde_checklist(libres["checklist"])
        libres["avance_pct"] = pct
        new_global = estado_agg
    else:
        if checklist:
            raise ValueError(
                "Esta tarea tiene checklist: marque su cumplido en cada sub-ítem."
            )
        task_asig = _normalizar_lista_asignaciones(libres.get("asignaciones")) or _clonar_asignaciones_estado(asigns_task)
        prev_mine = next(
            (a.get("estado_gestion") for a in task_asig if int(a["usuario_id"]) == int(user_id)),
            None,
        )
        updated = False
        for a in task_asig:
            if int(a["usuario_id"]) == int(user_id):
                a["estado_gestion"] = estado
                a["updated_at"] = _now_utc().isoformat()
                if not a.get("nombre"):
                    a["nombre"] = actor_nombre
                updated = True
                break
        if not updated:
            raise ValueError("Usted no está asignado a esta tarea")
        libres["asignaciones"] = task_asig
        new_global = _agregar_estados_asignados([a.get("estado_gestion") for a in task_asig])
        if estado == "cumplido" and (prev_mine or "").strip().lower() != "cumplido":
            individual_cumplido = True

    patch = {
        "campos_libres": libres,
        "estado_gestion": new_global,
        "asignado_a_nombre": _nombres_asignaciones(libres.get("asignaciones") or asigns_task),
        "updated_at": _now_utc().isoformat(),
    }
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    _registrar_evento(
        sb,
        item_id,
        "cumplido_asignado" if estado == "cumplido" else "estado_asignado",
        user_id,
        {"estado": estado, "checklist_id": checklist_id, "estado_global": new_global},
    )

    item_after = dict(item)
    item_after["campos_libres"] = libres
    item_after["estado_gestion"] = new_global

    if individual_cumplido and len(asigns_task) > 1:
        _notificar_delegante_cumplido_individual(
            sb, item_after, actor_id=user_id, actor_nombre=actor_nombre, ambito=ambito,
        )
    _notificar_delegante_cumplido_total(
        sb, item_after, actor_id=user_id, prev_estado=prev_global, new_estado=new_global,
    )
    return get_item_detalle(sb, item_id, user_id=user_id, current_user=current_user)


def adjuntar_imagen_tarea_base64(
    sb,
    item_id: int,
    user_id: int,
    nombre: str,
    data_b64: str,
    mime: str = "image/png",
    *,
    destino: str = "adjunto",
    checklist_id: Optional[str] = None,
) -> dict:
    """
    destino:
      - checklist: imagen/pantallazo de soporte del sub-ítem
      - checklist_esquema: esquema dibujado a mano del sub-ítem (no sustituye imagen)
    """
    item = get_item(sb, item_id)
    if item.get("origen") != "tarea":
        raise ValueError("Solo aplica a tareas personales")
    dest = (destino or "checklist").strip().lower()
    # Compat: adjunto/dibujo generales → se redirigen a checklist si hay checklist_id
    if dest in ("adjunto", "dibujo"):
        dest = "checklist_esquema" if dest == "dibujo" else "checklist"
    if dest not in ("checklist", "checklist_esquema"):
        raise ValueError("destino debe ser checklist o checklist_esquema")
    cid = (checklist_id or "").strip()
    if not cid:
        raise ValueError("checklist_id es obligatorio: el contenido se asocia a un sub-ítem")
    raw = data_b64
    if "," in raw and raw.strip().startswith("data:"):
        header, raw = raw.split(",", 1)
        m = re.search(r"data:([^;]+)", header)
        if m:
            mime = m.group(1)
    try:
        content = base64.b64decode(raw)
    except Exception as exc:
        raise ValueError("Imagen inválida") from exc
    if len(content) > 8_000_000:
        raise ValueError("La imagen supera 8 MB")

    ref = _store_imagen_bytes(item_id, nombre, content, mime or "image/png")
    if dest == "checklist_esquema":
        ref["kind"] = "esquema"
    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
    checklist = _normalizar_checklist_tarea(libres.get("checklist") or [])
    found = False
    for it in checklist:
        if str(it.get("id")) == cid:
            if dest == "checklist_esquema":
                it["esquema"] = ref
            else:
                it["imagen"] = ref
            found = True
            break
    if not found:
        raise ValueError("Sub-ítem de checklist no encontrado")
    libres["checklist"] = checklist
    fv_ck, hora_ck = _fecha_proxima_checklist(checklist)
    if fv_ck:
        patch["fecha_vencimiento"] = fv_ck
        patch["hora_vencimiento"] = hora_ck
    patch["campos_libres"] = _normalizar_campos_libres_tarea(libres)

    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    return get_item_detalle(sb, item_id, user_id=user_id)


# ── Bandeja / detalle ────────────────────────────────────────────────────────

def get_item(sb, item_id: int) -> dict:
    rows = sb.table("seguimiento_item").select("*").eq("id", int(item_id)).limit(1).execute().data or []
    if not rows:
        raise ValueError("Ítem no encontrado")
    return rows[0]


def get_item_detalle(
    sb,
    item_id: int,
    *,
    user_id: Optional[int] = None,
    current_user: Optional[dict] = None,
) -> dict:
    item = get_item(sb, item_id)
    iid = int(item["id"])
    item["comentarios"] = (
        sb.table("seguimiento_item_comentario")
        .select("*")
        .eq("item_id", iid)
        .order("created_at")
        .execute()
        .data
        or []
    )
    item["evidencias"] = (
        sb.table("seguimiento_item_evidencia")
        .select("*")
        .eq("item_id", iid)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    item["justificaciones"] = (
        sb.table("seguimiento_justificacion")
        .select("*")
        .eq("item_id", iid)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    item["llamados"] = (
        sb.table("seguimiento_llamado_atencion")
        .select("*")
        .eq("item_id", iid)
        .order("generado_at", desc=True)
        .execute()
        .data
        or []
    )
    if item.get("origen") == "compromiso" and item.get("acta_id"):
        try:
            acta = get_acta(sb, int(item["acta_id"]), item.get("contrato_id"))
            if user_id is not None and not usuario_puede_ver_acta(
                sb, acta, int(user_id), current_user
            ):
                item["acta"] = resumen_acta_restringida(acta)
                item["puede_ver_acta"] = False
            else:
                if isinstance(acta, dict):
                    acta["puede_abrir"] = True
                    acta["acceso_restringido"] = False
                item["acta"] = acta
                item["puede_ver_acta"] = True
        except ValueError:
            item["acta"] = None
            item["puede_ver_acta"] = False
    if item.get("origen") == "tarea":
        # Migración suave: descripción legacy → checklist de un ítem
        libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
        if not libres.get("checklist") and (item.get("descripcion") or "").strip():
            libres["checklist"] = _normalizar_checklist_tarea([{
                "texto": item.get("descripcion"),
                "fecha": item.get("fecha_vencimiento"),
                "hora": item.get("hora_vencimiento"),
                "estado_gestion": item.get("estado_gestion") or "abierto",
            }])
        pct, _est = _avance_desde_checklist(libres.get("checklist") or [])
        libres["avance_pct"] = pct
        item["campos_libres"] = libres
        item["avance_pct"] = pct
        item = _enrich_tarea_media(item)
    return item


def list_bandeja(
    sb,
    user_id: int,
    current_user: dict,
    *,
    estado: Optional[str] = None,
    responsable_id: Optional[int] = None,
    contrato_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    origen: Optional[str] = None,
    incluir_equipo: bool = True,
    incluir_cerrados: bool = False,
    q: Optional[str] = None,
) -> List[dict]:
    u = _usuario_row(sb, user_id)
    es_dev = es_desarrollador_seguimiento(current_user)
    visible_ids: Set[int] = {int(user_id)}
    if not es_dev and incluir_equipo and es_contratista_gerencial(u, current_user):
        visible_ids |= ids_usuarios_bajo_gestion(sb, user_id, contrato_id or (u or {}).get("contrato_id"))

    query = sb.table("seguimiento_item").select("*").order("fecha_vencimiento", nullsfirst=False).order("created_at", desc=True)
    if origen in ("compromiso", "tarea"):
        query = query.eq("origen", origen)
    if estado:
        query = query.eq("estado_gestion", estado)
    if fecha_desde:
        query = query.gte("fecha_vencimiento", str(fecha_desde)[:10])
    if fecha_hasta:
        query = query.lte("fecha_vencimiento", str(fecha_hasta)[:10])
    rows = query.limit(800).execute().data or []

    # Derivar estado/avance de tareas desde checklist (cancelados excluidos del %)
    for r in rows:
        if r.get("origen") != "tarea":
            continue
        libres = dict(r.get("campos_libres") or {}) if isinstance(r.get("campos_libres"), dict) else {}
        ck = libres.get("checklist") if isinstance(libres.get("checklist"), list) else []
        if ck:
            pct, est = _avance_desde_checklist(ck)
            libres["avance_pct"] = pct
            r["campos_libres"] = libres
            r["avance_pct"] = pct
            r["estado_gestion"] = est
            continue
        asigns = _asignaciones_efectivas(r)
        if asigns:
            r["estado_gestion"] = _agregar_estados_asignados([a.get("estado_gestion") for a in asigns])
            if not libres.get("asignaciones"):
                libres["asignaciones"] = asigns
                r["campos_libres"] = libres
            # Exponer nombres unidos para la columna Destinatario
            if not r.get("asignado_a_nombre") or "," not in str(r.get("asignado_a_nombre") or ""):
                r["asignado_a_nombre"] = _nombres_asignaciones(asigns) or r.get("asignado_a_nombre")

    out = []
    for r in rows:
        if not incluir_cerrados and not estado:
            if r.get("estado_gestion") in ("cumplido", "cancelado"):
                continue
        # Aislamiento por contrato activo (también Desarrollador):
        # compromisos y tareas deben pertenecer al contrato seleccionado.
        if contrato_id is not None:
            item_cid = r.get("contrato_id")
            if item_cid is None or item_cid == "":
                continue
            try:
                if int(item_cid) != int(contrato_id):
                    continue
            except (TypeError, ValueError):
                continue
        aid = r.get("asignado_a_id")
        cid_creator = r.get("created_by")
        referido = r.get("referido_a_id")
        if responsable_id is not None and int(aid or 0) != int(responsable_id):
            # También coincidir si el responsable está en asignaciones[] multi
            ids_asig = _ids_asignados_tarea(r)
            if int(responsable_id) not in ids_asig:
                continue
        # Desarrollador ve todos los ítems del contrato activo (no cross-contrato).
        if es_dev:
            out.append(r)
            continue
        ids_asig = _ids_asignados_tarea(r)
        if (
            int(aid or 0) in visible_ids
            or int(cid_creator or 0) in visible_ids
            or int(referido or 0) in visible_ids
            or int(r.get("solicitante_id") or 0) == int(user_id)
            or bool(ids_asig & visible_ids)
        ):
            out.append(r)
            continue

    # Enriquecer compromisos con datos del acta de origen
    acta_ids = list({int(r["acta_id"]) for r in out if r.get("acta_id") and r.get("origen") == "compromiso"})
    actas_map: Dict[int, dict] = {}
    if acta_ids:
        arows = (
            sb.table("seguimiento_acta")
            .select("id, consecutivo, fecha_reunion")
            .in_("id", acta_ids)
            .execute()
            .data
            or []
        )
        actas_map = {int(a["id"]): a for a in arows}
    creator_ids = list({int(r["created_by"]) for r in out if r.get("created_by")})
    creators: Dict[int, dict] = {}
    if creator_ids:
        crows = sb.table("usuarios").select("id, nombre, apellidos").in_("id", creator_ids).execute().data or []
        creators = {int(c["id"]): c for c in crows}
    for r in out:
        if r.get("acta_id") and r.get("origen") == "compromiso":
            a = actas_map.get(int(r["acta_id"]))
            if a:
                r["acta_consecutivo"] = a.get("consecutivo")
                r["acta_fecha"] = a.get("fecha_reunion")
                r["acta_numero"] = f"Acta Nº {a.get('consecutivo')}"
        if r.get("created_by") and not r.get("created_by_nombre"):
            c = creators.get(int(r["created_by"]))
            if c:
                r["created_by_nombre"] = _nombre_usuario(c)

    if (q or "").strip():
        tokens = [t for t in re.split(r"[\s,.;:]+", q.lower()) if len(t) >= 2]
        if tokens:
            filtered = []
            for r in out:
                corpus = " ".join([
                    str(r.get("titulo") or ""),
                    str(r.get("descripcion") or ""),
                    str((r.get("campos_libres") or {}).get("notas") or ""),
                    str(r.get("asignado_a_nombre") or ""),
                    str(r.get("acta_numero") or ""),
                ]).lower()
                if all(t in corpus for t in tokens):
                    filtered.append(r)
            out = filtered

    def _sort_key(item):
        fv = item.get("fecha_vencimiento") or "9999-12-31"
        hv = item.get("hora_vencimiento") or "23:59"
        return (str(fv)[:10], str(hv)[:5], int(item.get("id") or 0))

    out.sort(key=_sort_key)
    return out


def destinar_item(sb, item_id: int, user_id: int, current_user: dict, data: dict) -> dict:
    """Asignación formal o envío por referencia a un destinatario."""
    item = get_item(sb, item_id)
    es_dev = es_desarrollador_seguimiento(current_user)
    if (
        not es_dev
        and int(item.get("created_by") or 0) != int(user_id)
        and int(item.get("asignado_a_id") or 0) != int(user_id)
    ):
        raise ValueError("No puede destinar este ítem")
    modo = (data.get("relacion_destinatario") or data.get("modo") or "").strip().lower()
    if modo not in ("asignacion", "referencia"):
        raise ValueError("Indique si es asignación formal o referencia")
    dest_id = int(data["destinatario_id"])
    dest = _usuario_row(sb, dest_id)
    if not dest:
        raise ValueError("Destinatario no encontrado")
    nombre = data.get("destinatario_nombre") or _nombre_usuario(dest)
    prev_asignado = int(item.get("asignado_a_id") or 0)
    patch: Dict[str, Any] = {
        "relacion_destinatario": modo,
        "updated_at": _now_utc().isoformat(),
    }
    if modo == "asignacion":
        patch["asignado_a_id"] = dest_id
        patch["asignado_a_nombre"] = nombre
        patch["referido_a_id"] = None
        patch["referido_a_nombre"] = None
    else:
        patch["referido_a_id"] = dest_id
        patch["referido_a_nombre"] = nombre
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    _registrar_evento(sb, item_id, f"destinar_{modo}", user_id, {"destinatario_id": dest_id})
    # Compromiso reasignado: aviso rico e inmediato (también en acta borrador)
    if (
        modo == "asignacion"
        and item.get("origen") == "compromiso"
        and dest_id != prev_asignado
    ):
        acta = None
        if item.get("acta_id") and item.get("contrato_id"):
            try:
                acta = get_acta(sb, int(item["acta_id"]), int(item["contrato_id"]))
            except Exception:
                acta = None
        _notificar_compromiso_asignado(
            sb,
            destinatario_id=dest_id,
            remitente_id=user_id,
            titulo=item.get("titulo") or "",
            fecha_vencimiento=item.get("fecha_vencimiento"),
            contrato_id=item.get("contrato_id"),
            item_id=item_id,
            acta=acta,
            reasignacion=True,
        )
    else:
        _notificar(
            sb,
            destinatario_id=dest_id,
            remitente_id=user_id,
            asunto=f"{'Asignación' if modo == 'asignacion' else 'Referencia'}: {item.get('titulo')}",
            mensaje=(
                f"Se le {'asignó formalmente' if modo == 'asignacion' else 'compartió como referencia'} "
                f"el ítem «{item.get('titulo')}»."
            ),
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_item",
            entidad_id=str(item_id),
        )
    return get_item_detalle(sb, item_id, user_id=user_id, current_user=current_user)


def eliminar_item(sb, item_id: int, current_user: dict) -> dict:
    if not es_desarrollador_seguimiento(current_user):
        raise ValueError("Solo el rol Desarrollador puede eliminar definitivamente")
    item = get_item(sb, item_id)
    sb.table("seguimiento_item").delete().eq("id", int(item_id)).execute()
    return {"ok": True, "id": item_id, "origen": item.get("origen")}


def eliminar_acta(sb, contrato_id: int, acta_id: int, current_user: dict) -> dict:
    if not es_desarrollador_seguimiento(current_user):
        raise ValueError("Solo el rol Desarrollador puede eliminar definitivamente")
    get_acta(sb, acta_id, contrato_id)
    # Desvincular compromisos (no borrar ítems de bandeja automáticamente)
    sb.table("seguimiento_item").update({
        "acta_id": None,
        "updated_at": _now_utc().isoformat(),
    }).eq("acta_id", int(acta_id)).execute()
    sb.table("seguimiento_acta").delete().eq("id", int(acta_id)).eq("contrato_id", int(contrato_id)).execute()
    return {"ok": True, "id": acta_id}


def list_usuarios_contrato_enriquecidos(sb, contrato_id: int) -> List[dict]:
    """Usuarios del contrato + contactos externos activos (asistentes recurrentes)."""
    ct = sb.table("contratos").select("id, contratista, numero").eq("id", int(contrato_id)).limit(1).execute().data or []
    empresa = (ct[0].get("contratista") if ct else None) or None
    uc = sb.table("usuario_contratos").select("usuario_id").eq("contrato_id", int(contrato_id)).execute().data or []
    ids_uc = [r["usuario_id"] for r in uc]
    principales = sb.table("usuarios").select("id").eq("contrato_id", int(contrato_id)).execute().data or []
    todos_ids = list({*(ids_uc or []), *[p["id"] for p in principales]})
    out: List[dict] = []
    emails_usuarios: Set[str] = set()
    if todos_ids:
        users = (
            sb.table("usuarios")
            .select("id, nombre, apellidos, email, cargo_id, activo")
            .in_("id", todos_ids)
            .eq("activo", True)
            .execute()
            .data
            or []
        )
        cargo_ids = list({u["cargo_id"] for u in users if u.get("cargo_id")})
        cargos = {}
        if cargo_ids:
            crows = sb.table("cargos").select("id, nombre").in_("id", cargo_ids).execute().data or []
            cargos = {c["id"]: c.get("nombre") for c in crows}
        for u in users:
            em = _norm_email(u.get("email"))
            if em:
                emails_usuarios.add(em)
            out.append({
                **u,
                "cargo_nombre": cargos.get(u.get("cargo_id")) or "",
                "empresa": empresa or "",
                "es_externo": False,
            })
    # Contactos externos activos; excluir si ya hay usuario real con el mismo email
    for ext in list_contactos_externos_activos(sb, int(contrato_id)):
        em = _norm_email(ext.get("email_norm") or ext.get("email"))
        if em and em in emails_usuarios:
            continue
        eid = int(ext["id"])
        out.append({
            # id negativo evita colisión con usuarios reales en el combobox
            "id": -eid,
            "externo_id": eid,
            "es_externo": True,
            "nombre": ext.get("nombre") or "",
            "apellidos": "",
            "email": ext.get("email") or "",
            "cargo_id": None,
            "cargo_nombre": ext.get("cargo") or "",
            "empresa": ext.get("entidad") or "",
            "activo": True,
        })
    out.sort(key=lambda x: f"{x.get('nombre') or ''} {x.get('apellidos') or ''}".lower())
    return out


def agregar_comentario(sb, item_id: int, mensaje: str, user_id: int) -> dict:
    msg = (mensaje or "").strip()
    if not msg:
        raise ValueError("Mensaje vacío")
    item = get_item(sb, item_id)
    u = _usuario_row(sb, user_id)
    dest = None
    if item.get("origen") == "compromiso":
        # Solo el asignado de plataforma puede comentar (dirigido al elaborador del acta).
        if int(item.get("asignado_a_id") or 0) != int(user_id):
            raise ValueError(
                "Solo puede comentar en compromisos que le fueron asignados a usted"
            )
        acta_elab = None
        if item.get("acta_id"):
            try:
                acta = get_acta(sb, int(item["acta_id"]), item.get("contrato_id"))
                acta_elab = acta.get("elaborador_id")
            except Exception:
                acta_elab = None
        dest = acta_elab or item.get("solicitante_id") or item.get("created_by")
    else:
        # Tareas: notificar contraparte (asignado ↔ solicitante/creador)
        if int(item.get("asignado_a_id") or 0) == int(user_id):
            dest = item.get("solicitante_id") or item.get("created_by")
        else:
            dest = item.get("asignado_a_id")

    ins = sb.table("seguimiento_item_comentario").insert({
        "item_id": int(item_id),
        "autor_id": int(user_id),
        "autor_nombre": _nombre_usuario(u),
        "mensaje": msg,
    }).execute().data
    if not ins:
        raise ValueError("No se pudo guardar el comentario")
    if dest and int(dest) != int(user_id):
        _notificar(
            sb,
            destinatario_id=int(dest),
            remitente_id=user_id,
            asunto=f"Nuevo comentario en: {item.get('titulo')}",
            mensaje=msg,
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_item",
            entidad_id=str(item_id),
        )
    return ins[0]


def actualizar_fecha_compromiso(
    sb,
    item_id: int,
    user_id: int,
    *,
    fecha_vencimiento: str,
    hora_vencimiento: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> dict:
    """Corrige la fecha de un compromiso de acta. Solo elaborador del acta (o Dev), acta no sellada."""
    item = get_item(sb, item_id)
    if item.get("origen") != "compromiso":
        raise ValueError("Solo aplica a compromisos de acta")
    if not item.get("acta_id"):
        raise ValueError("El compromiso no está vinculado a un acta")
    acta = get_acta(sb, int(item["acta_id"]), item.get("contrato_id"))
    _assert_puede_editar_acta(acta, user_id, current_user)
    fv = _parse_date(fecha_vencimiento)
    if not fv:
        raise ValueError("Fecha de vencimiento requerida")
    cache = CalendarioNoHabilesCache(loader=make_calendar_loader(sb))
    limite = calcular_fecha_limite_gracia(item.get("contrato_id"), fv, cache)
    hora = _norm_hora(hora_vencimiento) if hora_vencimiento is not None else item.get("hora_vencimiento")
    if hora_vencimiento is not None and str(hora_vencimiento).strip() == "":
        hora = None
    patch = {
        "fecha_vencimiento": fv.isoformat(),
        "fecha_limite_gracia": limite.astimezone(timezone.utc).isoformat(),
        "hora_vencimiento": hora,
        "updated_at": _now_utc().isoformat(),
    }
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    _registrar_evento(
        sb,
        int(item_id),
        "fecha_compromiso_corregida",
        user_id,
        {"fecha_vencimiento": fv.isoformat(), "hora_vencimiento": hora},
    )
    return get_item_detalle(sb, item_id, user_id=user_id, current_user=current_user)


def cargar_evidencia(
    sb,
    item_id: int,
    user_id: int,
    *,
    nombre_archivo: str,
    content: bytes,
    mime_type: str = "application/octet-stream",
    notas: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> dict:
    item = get_item(sb, item_id)
    if (
        int(item.get("asignado_a_id") or 0) != int(user_id)
        and not es_desarrollador_seguimiento(current_user)
    ):
        raise ValueError("Solo el responsable puede cargar evidencia")
    safe = re.sub(r"[^\w.\-]", "_", (nombre_archivo or "evidencia").strip())[:120]
    ts = _now_utc().strftime("%Y%m%dT%H%M%SZ")
    blob_path = f"seguimiento-evidencias/{int(item_id)}/{ts}_{safe}"
    try:
        from azure_blob_storage import upload_blob_private

        upload_blob_private(blob_path, content, content_type=mime_type, overwrite=True)
    except Exception as exc:
        _log.warning("upload evidencia: %s", exc)
        raise ValueError("No se pudo almacenar la evidencia") from exc
    ins = sb.table("seguimiento_item_evidencia").insert({
        "item_id": int(item_id),
        "uploaded_by": int(user_id),
        "nombre_archivo": safe,
        "blob_path": blob_path,
        "mime_type": mime_type,
        "notas": (notas or "").strip() or None,
    }).execute().data
    _registrar_evento(sb, item_id, "evidencia_cargada", user_id, {"nombre": safe})
    if item.get("solicitante_id"):
        _notificar(
            sb,
            destinatario_id=int(item["solicitante_id"]),
            remitente_id=user_id,
            asunto=f"Evidencia cargada: {item.get('titulo')}",
            mensaje=f"Se cargó evidencia «{safe}» para el compromiso.",
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_compromiso",
            entidad_id=str(item_id),
        )
    return (ins or [{}])[0]


# ── Justificaciones ──────────────────────────────────────────────────────────

def solicitar_justificacion(
    sb,
    item_id: int,
    user_id: int,
    motivo: str,
    nueva_fecha: str,
    current_user: Optional[dict] = None,
) -> dict:
    item = get_item(sb, item_id)
    if item.get("origen") != "compromiso":
        raise ValueError("Solo aplica a compromisos de acta")
    if (
        int(item.get("asignado_a_id") or 0) != int(user_id)
        and not es_desarrollador_seguimiento(current_user)
    ):
        raise ValueError("Solo el responsable puede solicitar justificación")
    fv = _parse_date(nueva_fecha)
    if not fv:
        raise ValueError("Nueva fecha de vencimiento inválida")
    motivo_t = (motivo or "").strip()
    if len(motivo_t) < 5:
        raise ValueError("Indique el motivo de la justificación")
    ins = sb.table("seguimiento_justificacion").insert({
        "item_id": int(item_id),
        "solicitado_por_id": int(user_id),
        "motivo": motivo_t,
        "nueva_fecha_vencimiento": fv.isoformat(),
        "estado": "pendiente",
    }).execute().data
    if not ins:
        raise ValueError("No se pudo registrar la justificación")
    _registrar_evento(sb, item_id, "justificacion_solicitada", user_id, {"nueva_fecha": fv.isoformat()})
    if item.get("solicitante_id"):
        _notificar(
            sb,
            destinatario_id=int(item["solicitante_id"]),
            remitente_id=user_id,
            asunto=f"Justificación solicitada: {item.get('titulo')}",
            mensaje=motivo_t,
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_compromiso",
            entidad_id=str(item_id),
        )
    return ins[0]


def revisar_justificacion(
    sb,
    justificacion_id: int,
    user_id: int,
    aprobar: bool,
    comentario: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> dict:
    rows = sb.table("seguimiento_justificacion").select("*").eq("id", int(justificacion_id)).limit(1).execute().data or []
    if not rows:
        raise ValueError("Justificación no encontrada")
    just = rows[0]
    if just.get("estado") != "pendiente":
        raise ValueError("La justificación ya fue revisada")
    item = get_item(sb, int(just["item_id"]))
    if (
        int(item.get("solicitante_id") or 0) != int(user_id)
        and not es_desarrollador_seguimiento(current_user)
    ):
        raise ValueError("Solo quien delegó el compromiso puede aprobar o rechazar")
    estado = "aprobada" if aprobar else "rechazada"
    sb.table("seguimiento_justificacion").update({
        "estado": estado,
        "revisado_por_id": int(user_id),
        "revisado_at": _now_utc().isoformat(),
        "comentario_revision": (comentario or "").strip() or None,
    }).eq("id", int(justificacion_id)).execute()

    if aprobar:
        fv = _parse_date(just.get("nueva_fecha_vencimiento"))
        cache = CalendarioNoHabilesCache(loader=make_calendar_loader(sb))
        limite = calcular_fecha_limite_gracia(int(item["contrato_id"]), fv, cache)
        # Renueva vencimiento; NO revierte vencido_at ni el efecto de un vencimiento previo
        sb.table("seguimiento_item").update({
            "fecha_vencimiento": fv.isoformat(),
            "fecha_limite_gracia": limite.astimezone(timezone.utc).isoformat(),
            "llamado_atencion_generado": False,
            "estado_gestion": "en_progreso" if item.get("estado_gestion") == "vencido" else item.get("estado_gestion"),
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(item["id"])).execute()
        _registrar_evento(sb, int(item["id"]), "justificacion_aprobada", user_id, {
            "nueva_fecha": fv.isoformat(),
            "vencido_previo": bool(item.get("vencido_at")),
        })
    else:
        _registrar_evento(sb, int(item["id"]), "justificacion_rechazada", user_id)

    if item.get("asignado_a_id"):
        _notificar(
            sb,
            destinatario_id=int(item["asignado_a_id"]),
            remitente_id=user_id,
            asunto=f"Justificación {estado}: {item.get('titulo')}",
            mensaje=(comentario or f"La justificación fue {estado}."),
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_compromiso",
            entidad_id=str(item["id"]),
        )
    return get_item_detalle(
        sb, int(item["id"]), user_id=user_id, current_user=current_user,
    )


# ── PDF / firmas / jobs ──────────────────────────────────────────────────────

def _contrato(sb, contrato_id: int) -> dict:
    rows = sb.table("contratos").select("*").eq("id", int(contrato_id)).limit(1).execute().data or []
    return rows[0] if rows else {"id": contrato_id}


def _try_load_pdf_acta_cache(sb, acta: dict, cache_key: str) -> Optional[bytes]:
    """Sirve PDF desde Blob solo si la clave (plantilla+contenido) coincide."""
    blob_path = (acta.get("pdf_blob_path") or "").strip()
    stored = (acta.get("contenido_hash") or "").strip()
    if not blob_path or not stored or stored != cache_key:
        return None
    try:
        from azure_blob_storage import download_blob_bytes_private

        data = download_blob_bytes_private(blob_path)
        if data and len(data) > 20:
            return data
    except Exception as exc:
        _log.warning("pdf cache miss acta=%s path=%s: %s", acta.get("id"), blob_path, exc)
    return None


def _persist_pdf_acta_cache(sb, contrato_id: int, acta_id: int, pdf: bytes, cache_key: str) -> None:
    """Guarda PDF en Blob y actualiza pdf_blob_path + contenido_hash versionado."""
    if not pdf:
        return
    blob_path = f"seguimiento-actas/{int(contrato_id)}/{int(acta_id)}/acta_{PDF_ACTA_TEMPLATE_VERSION}.pdf"
    try:
        from azure_blob_storage import upload_blob_private

        upload_blob_private(blob_path, pdf, content_type="application/pdf", overwrite=True)
        sb.table("seguimiento_acta").update({
            "pdf_blob_path": blob_path,
            "contenido_hash": cache_key,
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(acta_id)).execute()
    except Exception as exc:
        _log.warning("pdf cache store acta=%s: %s", acta_id, exc)
        try:
            sb.table("seguimiento_acta").update({
                "contenido_hash": cache_key,
                "updated_at": _now_utc().isoformat(),
            }).eq("id", int(acta_id)).execute()
        except Exception:
            pass


def invalidar_pdf_acta_cache(sb, acta_id: int) -> None:
    """Borra pdf_blob_path para forzar regeneración en el próximo request."""
    try:
        sb.table("seguimiento_acta").update({
            "pdf_blob_path": None,
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(acta_id)).execute()
    except Exception as exc:
        _log.warning("invalidar pdf cache acta=%s: %s", acta_id, exc)


def generar_preview_pdf_acta(
    sb,
    contrato_id: int,
    acta_id: int,
    *,
    force: bool = False,
    user_id: Optional[int] = None,
    current_user: Optional[dict] = None,
) -> bytes:
    """Genera (o sirve desde caché) el PDF del acta.

    La clave de caché incluye PDF_ACTA_TEMPLATE_VERSION: un cambio de plantilla/estilo
    invalida PDFs previos aunque el contenido del acta no haya cambiado.
    force=True ignora Blob y regenera siempre (p. ej. botón «Vista previa»).
    """
    acta = get_acta(sb, acta_id, contrato_id)
    if user_id is not None:
        assert_puede_ver_acta(sb, acta, int(user_id), current_user)
    try:
        contrato = _contrato(sb, contrato_id)
    except Exception:
        contrato = {"id": contrato_id}

    content_h = ""
    try:
        content_h = contenido_hash_acta(
            acta, acta.get("asistentes"), acta.get("ideas"), acta.get("apartados")
        )
    except Exception as exc:
        _log.warning("contenido_hash acta=%s: %s", acta_id, exc)
    cache_key = pdf_acta_cache_key(content_h) if content_h else ""

    if not force and cache_key:
        cached = _try_load_pdf_acta_cache(sb, acta, cache_key)
        if cached:
            return cached

    # Caché obsoleta (p. ej. plantilla vieja): limpiar path para no reutilizarlo.
    if (acta.get("pdf_blob_path") or "").strip() and (acta.get("contenido_hash") or "") != cache_key:
        invalidar_pdf_acta_cache(sb, acta_id)

    previos = []
    try:
        previos = compromisos_abiertos_contrato(
            sb,
            int(contrato_id),
            excluir_acta_id=int(acta_id),
            tipo_acta=acta.get("tipo_acta") or "interna",
        )
    except Exception as exc:
        _log.warning("compromisos abiertos pdf acta=%s: %s", acta_id, exc)

    try:
        pdf = generar_pdf_acta(
            contrato,
            acta,
            acta.get("asistentes") or [],
            acta.get("ideas") or [],
            acta.get("apartados") or [],
            firmas=acta.get("firmas") or [],
            compromisos=acta.get("compromisos") or [],
            compromisos_previos=previos,
        )
    except Exception as exc:
        _log.exception("PDF acta %s: %s", acta_id, exc)
        # Reintento sin firmas/imágenes remotas
        acta_safe = {**acta, "ubicacion": acta.get("ubicacion"), "elaborador_nombre": acta.get("elaborador_nombre")}
        pdf = generar_pdf_acta(
            {"id": contrato_id, "numero": (contrato or {}).get("numero")},
            acta_safe,
            [
                {**a, "id": a.get("id")}
                for a in (acta.get("asistentes") or [])
            ],
            acta.get("ideas") or [],
            acta.get("apartados") or [],
            firmas=[],
            compromisos=acta.get("compromisos") or [],
            compromisos_previos=previos,
        )

    if cache_key and pdf:
        _persist_pdf_acta_cache(sb, contrato_id, acta_id, pdf, cache_key)
    return pdf


def registrar_firma_asistente(sb, contrato_id: int, acta_id: int, asistente_id: int, user_id: int) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    if _norm_estado_acta(acta.get("estado") or "borrador") == "borrador":
        raise ValueError("Marque el acta como Realizada antes de registrar firmas")
    asis = next((a for a in (acta.get("asistentes") or []) if int(a["id"]) == int(asistente_id)), None)
    if not asis:
        raise ValueError("Asistente no encontrado en el acta")
    u = _usuario_row(sb, user_id)
    firma_url = (u or {}).get("firma_imagen_url")
    if not firma_url:
        raise ValueError("El usuario no tiene imagen de firma en su perfil")
    existing = (
        sb.table("seguimiento_firma_registro")
        .select("id")
        .eq("acta_id", int(acta_id))
        .eq("asistente_id", int(asistente_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "acta_id": int(acta_id),
        "asistente_id": int(asistente_id),
        "usuario_id": int(user_id),
        "slot_label": asis.get("nombre"),
        "firma_imagen_url": firma_url,
        "firmado_at": _now_utc().isoformat(),
    }
    if existing:
        sb.table("seguimiento_firma_registro").update(payload).eq("id", int(existing[0]["id"])).execute()
    else:
        sb.table("seguimiento_firma_registro").insert(payload).execute()
    # Si todos firmaron → firmada
    firmas = sb.table("seguimiento_firma_registro").select("asistente_id").eq("acta_id", int(acta_id)).execute().data or []
    firmados = {int(f["asistente_id"]) for f in firmas if f.get("asistente_id")}
    asis_ids = {int(a["id"]) for a in (acta.get("asistentes") or []) if a.get("id")}
    if asis_ids and asis_ids <= firmados:
        sb.table("seguimiento_acta").update({"estado": "firmada", "updated_at": _now_utc().isoformat()}).eq("id", int(acta_id)).execute()
    return get_acta(sb, acta_id, contrato_id)


def procesar_vencimientos_y_llamados(sb, *, limit: int = 100) -> dict:
    """Job: marca vencidos y genera PDF de llamado de atención tras gracia sin respuesta/justificación aprobada."""
    now = _now_utc()
    today_bo = _now_bogota().date()
    rows = (
        sb.table("seguimiento_item")
        .select("*")
        .eq("origen", "compromiso")
        .in_("estado_gestion", ["abierto", "en_progreso", "parcial", "vencido"])
        .eq("llamado_atencion_generado", False)
        .not_.is_("fecha_limite_gracia", "null")
        .lte("fecha_limite_gracia", now.isoformat())
        .limit(limit)
        .execute()
        .data
        or []
    )
    generados = 0
    marcados = 0
    for item in rows:
        # ¿Hay justificación aprobada vigente que cubra?
        justs = (
            sb.table("seguimiento_justificacion")
            .select("id, estado, nueva_fecha_vencimiento")
            .eq("item_id", int(item["id"]))
            .eq("estado", "aprobada")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        # Evidencia cuenta como respuesta
        evid = (
            sb.table("seguimiento_item_evidencia")
            .select("id")
            .eq("item_id", int(item["id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if evid:
            continue
        if justs:
            # Si hay justificación aprobada y la nueva fecha aún no venció con gracia, saltar
            fv = _parse_date(justs[0].get("nueva_fecha_vencimiento"))
            if fv and fv >= today_bo:
                continue

        patch: Dict[str, Any] = {"updated_at": now.isoformat()}
        if not item.get("vencido_at"):
            patch["vencido_at"] = now.isoformat()
            patch["estado_gestion"] = "vencido"
            marcados += 1
            _registrar_evento(sb, int(item["id"]), "vencimiento_sin_justificar", None, {})

        contrato = _contrato(sb, int(item["contrato_id"]))
        pdf = generar_pdf_llamado_atencion(contrato, {**item, **patch}, generado_at=now)
        blob_path = f"seguimiento-llamados/{int(item['contrato_id'])}/{int(item['id'])}_{now.strftime('%Y%m%dT%H%M%SZ')}.pdf"
        try:
            from azure_blob_storage import upload_blob_private

            upload_blob_private(blob_path, pdf, content_type="application/pdf", overwrite=True)
        except Exception as exc:
            _log.warning("llamado PDF upload item=%s: %s", item.get("id"), exc)
            continue
        sb.table("seguimiento_llamado_atencion").insert({
            "item_id": int(item["id"]),
            "contrato_id": int(item["contrato_id"]),
            "pdf_blob_path": blob_path,
            "meta": {"titulo": item.get("titulo")},
        }).execute()
        patch["llamado_atencion_generado"] = True
        sb.table("seguimiento_item").update(patch).eq("id", int(item["id"])).execute()
        generados += 1
        if item.get("asignado_a_id"):
            _notificar(
                sb,
                destinatario_id=int(item["asignado_a_id"]),
                remitente_id=int(item.get("solicitante_id") or item.get("created_by") or item["asignado_a_id"]),
                asunto=f"Llamado de atención: {item.get('titulo')}",
                mensaje="Se generó un llamado de atención por vencimiento del compromiso sin respuesta ni justificación aprobada.",
                contrato_id=item.get("contrato_id"),
                entidad_tipo="seguimiento_compromiso",
                entidad_id=str(item["id"]),
            )
        if item.get("solicitante_id") and int(item["solicitante_id"]) != int(item.get("asignado_a_id") or 0):
            _notificar(
                sb,
                destinatario_id=int(item["solicitante_id"]),
                remitente_id=int(item.get("asignado_a_id") or item["solicitante_id"]),
                asunto=f"Llamado de atención emitido: {item.get('titulo')}",
                mensaje="El sistema emitió un llamado de atención por incumplimiento del compromiso.",
                contrato_id=item.get("contrato_id"),
                entidad_tipo="seguimiento_compromiso",
                entidad_id=str(item["id"]),
            )
    return {"procesados": len(rows), "marcados_vencidos": marcados, "llamados_generados": generados}


async def redaccion_asistida_clara(
    sb,
    usuario_id: str,
    texto: str,
    instruccion: str,
    historial: Optional[list] = None,
    *,
    modo: str = "redaccion",
) -> dict:
    """Usa el stack AVI/Clara con prompt de redacción o de título institucional."""
    from avi_service import llamar_avi, verificar_y_registrar_uso

    restantes = await verificar_y_registrar_uso(str(usuario_id), sb)
    modo_n = (modo or "redaccion").strip().lower()
    if modo_n == "titulo_tema":
        prompt = (
            "Eres asistente de actas de obra pública (ClaraCore). "
            "A partir del texto de una idea central, genera ÚNICAMENTE un título corto "
            "institucional en español (entre 4 y 12 palabras), formal y descriptivo, "
            "sin numeración, sin comillas, sin dos puntos al final y sin explicaciones.\n\n"
            f"Texto de la idea:\n{(texto or '').strip() or '(vacío)'}"
        )
        hist: list = []
        respuesta, _, _, _ = await llamar_avi(
            mensaje=prompt,
            modulo_actual="seguimiento",
            historial=hist,
            imagen_base64=None,
        )
        titulo = _limpiar_titulo_tema(respuesta or "") or titulo_tema_desde_texto(texto)
        return {"titulo": titulo, "texto": titulo, "mensajes_restantes_hoy": restantes}

    if modo_n == "compromiso":
        prompt = (
            "Estoy redactando un compromiso de un acta de reunión de obra pública en ClaraCore. "
            "Devuélveme ÚNICAMENTE el texto mejorado del compromiso (español formal, concreto, "
            "accionable y listo para asignar), sin preámbulos, sin comillas y sin explicaciones.\n\n"
            f"Texto actual:\n{texto or '(vacío)'}\n\n"
            f"Instrucción:\n{instruccion or 'Mejora claridad, precisión y formalidad.'}"
        )
    else:
        prompt = (
            "Estoy redactando una idea central de un acta de reunión de obra pública en ClaraCore. "
            "Devuélveme ÚNICAMENTE el texto mejorado (español formal, claro y listo para el acta), "
            "sin preámbulos, sin comillas y sin explicaciones.\n\n"
            f"Texto actual:\n{texto or '(vacío)'}\n\n"
            f"Instrucción:\n{instruccion or 'Mejora claridad, precisión y formalidad.'}"
        )
    hist = list(historial or [])
    respuesta, _, _, _ = await llamar_avi(
        mensaje=prompt,
        modulo_actual="seguimiento",
        historial=hist,
        imagen_base64=None,
    )
    return {"texto": (respuesta or "").strip(), "mensajes_restantes_hoy": restantes}


def _limpiar_titulo_tema(raw: str) -> str:
    t = (raw or "").strip().strip('"').strip("'").strip()
    t = re.sub(r"^(tema\s*\d+\s*[:.\-–—]\s*)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip(" .;:")
    if len(t) > 120:
        t = t[:120].rsplit(" ", 1)[0].strip()
    return t


def titulo_tema_desde_texto(texto: str) -> str:
    """Fallback local si Clara no responde: primera frase / fragmento corto."""
    t = " ".join(html_to_plain_text(texto).replace("\n", " ").split()).strip()
    if not t:
        return ""
    for sep in (".", ";", ":", "\n"):
        if sep in t[:110]:
            cand = t.split(sep, 1)[0].strip()
            if len(cand) >= 8:
                t = cand
                break
    if len(t) > 72:
        t = t[:72].rsplit(" ", 1)[0].strip() + "…"
    if t:
        t = t[0].upper() + t[1:]
    return _limpiar_titulo_tema(t)
