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
    contenido_hash_acta,
    generar_pdf_acta,
    generar_pdf_llamado_atencion,
)

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
) -> None:
    if not destinatario_id or destinatario_id == remitente_id:
        return
    row = {
        "remitente_id": remitente_id,
        "remitente_nombre": "ClaraCore",
        "destinatario_id": int(destinatario_id),
        "asunto": asunto,
        "mensaje": mensaje,
        "tipo": "SISTEMA",
        "modulo": "SEGUIMIENTO",
        "contrato_id": contrato_id,
        "entidad_tipo": entidad_tipo,
        "entidad_id": str(entidad_id),
        "leido": False,
        "oculto_destinatario": False,
        "oculto_remitente": False,
    }
    if padre_id:
        row["padre_id"] = int(padre_id)
    try:
        sb.table("notificaciones").insert(row).execute()
    except Exception as exc:
        _log.warning("notif seguimiento: %s", exc)


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


def _require_elaborador(data: dict, user_id: int) -> tuple:
    elaborador_id = data.get("elaborador_id")
    if elaborador_id in (None, "", 0, "0"):
        raise ValueError("El elaborador es obligatorio")
    return int(elaborador_id)


def list_actas(
    sb,
    contrato_id: int,
    *,
    estado: Optional[str] = None,
    tipo_acta: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    q: Optional[str] = None,
) -> List[dict]:
    query = (
        sb.table("seguimiento_acta")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .order("consecutivo", desc=True)
    )
    if estado:
        try:
            query = query.eq("estado", _norm_estado_acta(estado))
        except ValueError:
            pass
    if tipo_acta:
        try:
            query = query.eq("tipo_acta", _norm_tipo_acta(tipo_acta))
        except ValueError:
            pass
    if fecha_desde:
        query = query.gte("fecha_reunion", str(fecha_desde)[:10])
    if fecha_hasta:
        query = query.lte("fecha_reunion", str(fecha_hasta)[:10])
    rows = query.limit(500).execute().data or []
    if not (q or "").strip():
        return rows
    return _filtrar_actas_por_keywords(sb, rows, q)


def _filtrar_actas_por_keywords(sb, rows: List[dict], q: str) -> List[dict]:
    tokens = [t for t in re.split(r"[\s,.;:]+", (q or "").lower()) if len(t) >= 2]
    if not tokens:
        return rows
    ids = [int(r["id"]) for r in rows]
    if not ids:
        return []
    ideas = sb.table("seguimiento_acta_idea").select("acta_id,texto").in_("acta_id", ids).execute().data or []
    apartados = (
        sb.table("seguimiento_acta_apartado")
        .select("acta_id,titulo,contenido")
        .in_("acta_id", ids)
        .execute()
        .data
        or []
    )
    asistentes = (
        sb.table("seguimiento_acta_asistente")
        .select("acta_id,nombre,cargo,entidad,email")
        .in_("acta_id", ids)
        .execute()
        .data
        or []
    )
    by_id: Dict[int, List[str]] = {i: [] for i in ids}
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
        corpus = " ".join([
            str(r.get("ubicacion") or ""),
            str(r.get("elaborador_nombre") or ""),
            str(r.get("orden_del_dia") or ""),
            str(r.get("tipo_acta") or ""),
            str(r.get("consecutivo") or ""),
            *by_id.get(int(r["id"]), []),
        ]).lower()
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
    acta = rows[0]
    aid = int(acta["id"])
    acta["asistentes"] = (
        sb.table("seguimiento_acta_asistente").select("*").eq("acta_id", aid).order("orden").execute().data or []
    )
    acta["ideas"] = (
        sb.table("seguimiento_acta_idea").select("*").eq("acta_id", aid).order("orden").execute().data or []
    )
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


def compromisos_abiertos_contrato(sb, contrato_id: int, excluir_acta_id: Optional[int] = None) -> List[dict]:
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
        arows = (
            sb.table("seguimiento_acta")
            .select("id, consecutivo, fecha_reunion")
            .in_("id", acta_ids)
            .execute()
            .data
            or []
        )
        actas_map = {int(a["id"]): a for a in arows}
    for r in rows:
        a = actas_map.get(int(r["acta_id"])) if r.get("acta_id") else None
        r["acta_consecutivo"] = a.get("consecutivo") if a else None
        r["acta_fecha"] = a.get("fecha_reunion") if a else None
        r["acta_numero"] = f"Acta Nº {a['consecutivo']}" if a and a.get("consecutivo") is not None else None
    return rows


def create_acta(sb, contrato_id: int, data: dict, user_id: int) -> dict:
    consec = proximo_consecutivo(sb, contrato_id)
    fecha = _parse_date(data.get("fecha_reunion")) or _now_bogota().date()
    elaborador_id = _require_elaborador(data, user_id)
    elab = _usuario_row(sb, int(elaborador_id))
    if not elab:
        raise ValueError("El elaborador debe ser un usuario registrado del contrato")
    tipo = _norm_tipo_acta(data.get("tipo_acta"))
    estado = _norm_estado_acta(data.get("estado"), default="borrador")
    if estado != "borrador" and not elaborador_id:
        raise ValueError("El elaborador es obligatorio para avanzar de Borrador")
    orden = data.get("orden_del_dia")
    if isinstance(orden, (list, dict)):
        import json
        orden_txt = json.dumps(orden, ensure_ascii=False)
    else:
        orden_txt = (orden or "").strip() or None
    row = {
        "contrato_id": int(contrato_id),
        "consecutivo": consec,
        "fecha_reunion": fecha.isoformat(),
        "ubicacion": (data.get("ubicacion") or "").strip() or None,
        "orden_del_dia": orden_txt,
        "elaborador_id": int(elaborador_id),
        "elaborador_nombre": data.get("elaborador_nombre") or _nombre_usuario(elab),
        "tipo_acta": tipo,
        "estado": estado,
        "created_by": int(user_id),
        "updated_at": _now_utc().isoformat(),
    }
    ins = sb.table("seguimiento_acta").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear el acta")
    acta = ins[0]
    aid = int(acta["id"])
    _sync_asistentes(sb, aid, data.get("asistentes") or [])
    _sync_ideas(sb, aid, data.get("ideas") or [])
    _sync_apartados(sb, aid, data.get("apartados") or [])
    return get_acta(sb, aid, contrato_id)


def update_acta(sb, contrato_id: int, acta_id: int, data: dict, user_id: int) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    if acta.get("estado") == "firmada":
        raise ValueError("El acta firmada no se puede editar")
    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    if "fecha_reunion" in data and data["fecha_reunion"]:
        patch["fecha_reunion"] = (_parse_date(data["fecha_reunion"]) or date.today()).isoformat()
    for k in ("ubicacion", "elaborador_nombre"):
        if k in data:
            patch[k] = (data.get(k) or "").strip() or None
    if "tipo_acta" in data and data.get("tipo_acta"):
        patch["tipo_acta"] = _norm_tipo_acta(data.get("tipo_acta"))
    if "orden_del_dia" in data:
        orden = data.get("orden_del_dia")
        if isinstance(orden, (list, dict)):
            import json
            patch["orden_del_dia"] = json.dumps(orden, ensure_ascii=False)
        else:
            patch["orden_del_dia"] = (orden or "").strip() or None
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
    # Validar elaborador presente al guardar / cambiar estado
    elab_final = elaborador_id or acta.get("elaborador_id")
    if not elab_final:
        raise ValueError("El elaborador es obligatorio")
    if "estado" in data and data["estado"]:
        nuevo = _norm_estado_acta(data["estado"])
        actual = _norm_estado_acta(acta.get("estado") or "borrador")
        if nuevo != actual:
            if nuevo == "firmada" and actual != "firmada":
                # Solo el flujo de firmas marca firmada; permitir si ya hay firmas completas
                pass
            patch["estado"] = nuevo
    sb.table("seguimiento_acta").update(patch).eq("id", int(acta_id)).eq("contrato_id", int(contrato_id)).execute()
    if "asistentes" in data:
        _sync_asistentes(sb, acta_id, data.get("asistentes") or [])
    if "ideas" in data:
        _sync_ideas(sb, acta_id, data.get("ideas") or [])
    if "apartados" in data:
        _sync_apartados(sb, acta_id, data.get("apartados") or [])
    return get_acta(sb, acta_id, contrato_id)


def _sync_asistentes(sb, acta_id: int, asistentes: list) -> None:
    sb.table("seguimiento_acta_asistente").delete().eq("acta_id", int(acta_id)).execute()
    rows = []
    for i, a in enumerate(asistentes or []):
        nombre = (a.get("nombre") or "").strip()
        if not nombre:
            continue
        rows.append({
            "acta_id": int(acta_id),
            "nombre": nombre,
            "cargo": (a.get("cargo") or "").strip() or None,
            "entidad": (a.get("entidad") or "").strip() or None,
            "email": (a.get("email") or "").strip() or None,
            "usuario_id": int(a["usuario_id"]) if a.get("usuario_id") else None,
            "orden": int(a.get("orden") if a.get("orden") is not None else i),
        })
    if rows:
        sb.table("seguimiento_acta_asistente").insert(rows).execute()


def _sync_ideas(sb, acta_id: int, ideas: list) -> None:
    """Actualiza ideas por id cuando existe; inserta nuevas; elimina ausentes."""
    existing = sb.table("seguimiento_acta_idea").select("id").eq("acta_id", int(acta_id)).execute().data or []
    keep_ids: Set[int] = set()
    for i, idea in enumerate(ideas or []):
        texto = (idea.get("texto") or "").strip()
        iid = idea.get("id")
        if iid:
            keep_ids.add(int(iid))
            sb.table("seguimiento_acta_idea").update({
                "texto": texto,
                "orden": int(idea.get("orden") if idea.get("orden") is not None else i),
                "updated_at": _now_utc().isoformat(),
            }).eq("id", int(iid)).eq("acta_id", int(acta_id)).execute()
        else:
            ins = sb.table("seguimiento_acta_idea").insert({
                "acta_id": int(acta_id),
                "texto": texto,
                "orden": int(idea.get("orden") if idea.get("orden") is not None else i),
            }).execute().data
            if ins:
                keep_ids.add(int(ins[0]["id"]))
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


def add_idea(sb, contrato_id: int, acta_id: int, texto: str = "") -> dict:
    get_acta(sb, acta_id, contrato_id)
    existing = sb.table("seguimiento_acta_idea").select("orden").eq("acta_id", int(acta_id)).order("orden", desc=True).limit(1).execute().data or []
    orden = (int(existing[0]["orden"]) + 1) if existing else 0
    ins = sb.table("seguimiento_acta_idea").insert({
        "acta_id": int(acta_id),
        "texto": (texto or "").strip(),
        "orden": orden,
    }).execute().data
    if not ins:
        raise ValueError("No se pudo agregar la idea")
    return ins[0]


def update_idea(sb, contrato_id: int, idea_id: int, texto: str) -> dict:
    idea = sb.table("seguimiento_acta_idea").select("*, seguimiento_acta!inner(contrato_id)").eq("id", int(idea_id)).limit(1).execute().data
    # Fallback sin join si PostgREST no resuelve el alias
    if not idea:
        rows = sb.table("seguimiento_acta_idea").select("*").eq("id", int(idea_id)).limit(1).execute().data or []
        if not rows:
            raise ValueError("Idea no encontrada")
        acta = get_acta(sb, int(rows[0]["acta_id"]), contrato_id)
        _ = acta
        idea_row = rows[0]
    else:
        idea_row = idea[0]
        acta_cid = None
        rel = idea_row.get("seguimiento_acta")
        if isinstance(rel, dict):
            acta_cid = rel.get("contrato_id")
        if acta_cid is not None and int(acta_cid) != int(contrato_id):
            raise ValueError("Idea no pertenece al contrato")
    upd = sb.table("seguimiento_acta_idea").update({
        "texto": (texto or "").strip(),
        "updated_at": _now_utc().isoformat(),
    }).eq("id", int(idea_id)).execute().data
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


def crear_compromiso_desde_idea(sb, contrato_id: int, acta_id: int, idea_id: int, data: dict, user_id: int) -> dict:
    """Crea uno o varios compromisos (uno por asignado)."""
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


def _crear_un_compromiso(sb, contrato_id: int, acta_id: int, idea_id: int, data: dict, user_id: int) -> dict:
    acta = get_acta(sb, acta_id, contrato_id)
    ideas = {int(i["id"]): i for i in acta.get("ideas") or []}
    if int(idea_id) not in ideas:
        raise ValueError("La idea no pertenece al acta")
    asignado_id = int(data["asignado_a_id"])
    solicitante_id = int(data.get("solicitante_id") or user_id)
    asignado = _usuario_row(sb, asignado_id)
    solicitante = _usuario_row(sb, solicitante_id)
    if not asignado:
        raise ValueError("Usuario asignado no encontrado")
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
    consec = _proximo_consecutivo_item(sb, origen="compromiso", contrato_id=contrato_id)
    row = {
        "origen": "compromiso",
        "titulo": titulo[:500],
        "descripcion": descripcion,
        "estado_gestion": "abierto",
        "asignado_a_id": asignado_id,
        "asignado_a_nombre": data.get("asignado_a_nombre") or _nombre_usuario(asignado),
        "created_by": int(user_id),
        "fecha_vencimiento": fv.isoformat(),
        "fecha_vencimiento_original": fv.isoformat(),
        "hora_vencimiento": hora,
        "fecha_limite_gracia": limite.astimezone(timezone.utc).isoformat(),
        "contrato_id": int(contrato_id),
        "acta_id": int(acta_id),
        "idea_id": int(idea_id),
        "solicitante_id": solicitante_id,
        "solicitante_nombre": data.get("solicitante_nombre") or _nombre_usuario(solicitante),
        "consecutivo": consec,
        "relacion_destinatario": "asignacion",
        "updated_at": _now_utc().isoformat(),
    }
    ins = sb.table("seguimiento_item").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear el compromiso")
    item = ins[0]
    _registrar_evento(sb, int(item["id"]), "compromiso_creado", user_id, {"acta_id": acta_id, "idea_id": idea_id})
    _notificar(
        sb,
        destinatario_id=asignado_id,
        remitente_id=user_id,
        asunto=f"Nuevo compromiso del acta Nº {acta.get('consecutivo')}",
        mensaje=f"Se le asignó el compromiso:\n\n{titulo}\n\nVence: {fv.isoformat()}",
        contrato_id=contrato_id,
        entidad_tipo="seguimiento_compromiso",
        entidad_id=str(item["id"]),
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
            "fecha_base_nivel": hoy.isoformat(),
            "hora_vencimiento": _norm_hora(hora_vencimiento) if hora_vencimiento is not None else item.get("hora_vencimiento"),
            "updated_at": _now_utc().isoformat(),
        }
        sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
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
    return get_item(sb, item_id)


# ── Tareas personales ────────────────────────────────────────────────────────

def _normalizar_campos_libres_tarea(raw) -> dict:
    """Campos libres de tarea (notas, etc.). La prioridad por estrellas quedó deprecada."""
    base = dict(raw) if isinstance(raw, dict) else {}
    base.pop("prioridad", None)
    base.pop("destinatario_tentativo_id", None)
    base.pop("destinatario_tentativo_nombre", None)
    return base


def crear_tarea(sb, data: dict, user_id: int) -> dict:
    u = _usuario_row(sb, user_id)
    titulo = (data.get("titulo") or "").strip()
    if not titulo:
        raise ValueError("El título de la tarea es obligatorio")
    fv = _parse_date(data.get("fecha_vencimiento"))
    hora = _norm_hora(data.get("hora_vencimiento"))
    imagenes = data.get("imagenes") or []
    if not isinstance(imagenes, list):
        imagenes = []
    consec = _proximo_consecutivo_item(sb, origen="tarea", user_id=user_id)
    relacion = data.get("relacion_destinatario")
    referido_id = data.get("referido_a_id") or data.get("destinatario_id")
    asignado_id = int(data.get("asignado_a_id") or user_id)
    asignado_nombre = data.get("asignado_a_nombre") or _nombre_usuario(u)
    referido_nombre = None
    if relacion == "asignacion" and referido_id:
        dest = _usuario_row(sb, int(referido_id))
        if not dest:
            raise ValueError("Destinatario no encontrado")
        asignado_id = int(referido_id)
        asignado_nombre = data.get("referido_a_nombre") or _nombre_usuario(dest)
        referido_id = None
    elif relacion == "referencia" and referido_id:
        dest = _usuario_row(sb, int(referido_id))
        if not dest:
            raise ValueError("Destinatario no encontrado")
        referido_nombre = data.get("referido_a_nombre") or _nombre_usuario(dest)
        referido_id = int(referido_id)
    else:
        relacion = None
        referido_id = None

    row = {
        "origen": "tarea",
        "titulo": titulo[:500],
        "descripcion": (data.get("descripcion") or "").strip() or None,
        "estado_gestion": data.get("estado_gestion") or "abierto",
        "asignado_a_id": asignado_id,
        "asignado_a_nombre": asignado_nombre,
        "created_by": int(user_id),
        "fecha_vencimiento": fv.isoformat() if fv else None,
        "hora_vencimiento": hora,
        "consecutivo": consec,
        "relacion_destinatario": relacion,
        "referido_a_id": referido_id,
        "referido_a_nombre": referido_nombre,
        "campos_libres": _normalizar_campos_libres_tarea(data.get("campos_libres")),
        "imagenes": imagenes,
        "updated_at": _now_utc().isoformat(),
    }
    ins = sb.table("seguimiento_item").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear la tarea")
    item = ins[0]
    _registrar_evento(sb, int(item["id"]), "tarea_creada", user_id, {"relacion": relacion})
    notify_id = asignado_id if relacion == "asignacion" else referido_id
    if notify_id and int(notify_id) != int(user_id):
        tipo_msg = "asignó formalmente" if relacion == "asignacion" else "compartió como referencia"
        _notificar(
            sb,
            destinatario_id=int(notify_id),
            remitente_id=user_id,
            asunto=f"Tarea: {titulo[:80]}",
            mensaje=f"Se le {tipo_msg} la tarea «{titulo}».",
            contrato_id=None,
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
    ):
        raise ValueError("No puede editar esta tarea")
    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    if "titulo" in data:
        t = (data.get("titulo") or "").strip()
        if not t:
            raise ValueError("Título obligatorio")
        patch["titulo"] = t[:500]
    if "descripcion" in data:
        patch["descripcion"] = (data.get("descripcion") or "").strip() or None
    if "estado_gestion" in data:
        patch["estado_gestion"] = data["estado_gestion"]
    if "fecha_vencimiento" in data:
        fv = _parse_date(data.get("fecha_vencimiento"))
        patch["fecha_vencimiento"] = fv.isoformat() if fv else None
    if "hora_vencimiento" in data:
        patch["hora_vencimiento"] = _norm_hora(data.get("hora_vencimiento"))
    if "campos_libres" in data:
        patch["campos_libres"] = _normalizar_campos_libres_tarea(data.get("campos_libres"))
    if "imagenes" in data:
        patch["imagenes"] = data.get("imagenes") or []
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    return get_item(sb, item_id)


def adjuntar_imagen_tarea_base64(sb, item_id: int, user_id: int, nombre: str, data_b64: str, mime: str = "image/png") -> dict:
    item = get_item(sb, item_id)
    if item.get("origen") != "tarea":
        raise ValueError("Solo aplica a tareas personales")
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
    from azure_blob_storage import upload_blob_private

    safe = re.sub(r"[^\w.\-]", "_", (nombre or "imagen.png").strip())[:120]
    ts = _now_utc().strftime("%Y%m%dT%H%M%SZ")
    blob_path = f"seguimiento-tareas/{int(item_id)}/{ts}_{safe}"
    try:
        upload_blob_private(blob_path, content, content_type=mime or "image/png", overwrite=True)
    except Exception:
        # Fallback: guardar data-uri en jsonb si blob no disponible (dev)
        blob_path = f"data:{(mime or 'image/png')};base64,{base64.b64encode(content).decode('ascii')}"
    imgs = list(item.get("imagenes") or [])
    imgs.append({"nombre": safe, "blob_path": blob_path if not str(blob_path).startswith("data:") else None, "data_uri": blob_path if str(blob_path).startswith("data:") else None, "mime_type": mime, "created_at": _now_utc().isoformat()})
    sb.table("seguimiento_item").update({"imagenes": imgs, "updated_at": _now_utc().isoformat()}).eq("id", int(item_id)).execute()
    return get_item(sb, item_id)


# ── Bandeja / detalle ────────────────────────────────────────────────────────

def get_item(sb, item_id: int) -> dict:
    rows = sb.table("seguimiento_item").select("*").eq("id", int(item_id)).limit(1).execute().data or []
    if not rows:
        raise ValueError("Ítem no encontrado")
    return rows[0]


def get_item_detalle(sb, item_id: int) -> dict:
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
            item["acta"] = get_acta(sb, int(item["acta_id"]), item.get("contrato_id"))
        except ValueError:
            item["acta"] = None
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

    out = []
    for r in rows:
        if not incluir_cerrados and not estado:
            if r.get("estado_gestion") in ("cumplido", "cancelado"):
                continue
        if contrato_id is not None:
            if r.get("origen") == "compromiso" and int(r.get("contrato_id") or 0) != int(contrato_id):
                continue
            if r.get("origen") == "tarea" and r.get("contrato_id") not in (None, ""):
                if int(r.get("contrato_id") or 0) != int(contrato_id):
                    continue
        aid = r.get("asignado_a_id")
        cid_creator = r.get("created_by")
        referido = r.get("referido_a_id")
        if responsable_id is not None and int(aid or 0) != int(responsable_id):
            continue
        if es_dev:
            out.append(r)
            continue
        if (
            int(aid or 0) in visible_ids
            or int(cid_creator or 0) in visible_ids
            or int(referido or 0) in visible_ids
            or int(r.get("solicitante_id") or 0) == int(user_id)
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
    return get_item_detalle(sb, item_id)


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
    """Usuarios del contrato con cargo y empresa (contratista del contrato)."""
    ct = sb.table("contratos").select("id, contratista, numero").eq("id", int(contrato_id)).limit(1).execute().data or []
    empresa = (ct[0].get("contratista") if ct else None) or None
    uc = sb.table("usuario_contratos").select("usuario_id").eq("contrato_id", int(contrato_id)).execute().data or []
    ids_uc = [r["usuario_id"] for r in uc]
    principales = sb.table("usuarios").select("id").eq("contrato_id", int(contrato_id)).execute().data or []
    todos_ids = list({*(ids_uc or []), *[p["id"] for p in principales]})
    if not todos_ids:
        return []
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
    out = []
    for u in users:
        out.append({
            **u,
            "cargo_nombre": cargos.get(u.get("cargo_id")) or "",
            "empresa": empresa or "",
        })
    out.sort(key=lambda x: f"{x.get('nombre') or ''} {x.get('apellidos') or ''}".lower())
    return out


def agregar_comentario(sb, item_id: int, mensaje: str, user_id: int) -> dict:
    msg = (mensaje or "").strip()
    if not msg:
        raise ValueError("Mensaje vacío")
    item = get_item(sb, item_id)
    u = _usuario_row(sb, user_id)
    ins = sb.table("seguimiento_item_comentario").insert({
        "item_id": int(item_id),
        "autor_id": int(user_id),
        "autor_nombre": _nombre_usuario(u),
        "mensaje": msg,
    }).execute().data
    if not ins:
        raise ValueError("No se pudo guardar el comentario")
    # Notificar contraparte
    dest = None
    if int(item.get("asignado_a_id") or 0) == int(user_id):
        dest = item.get("solicitante_id") or item.get("created_by")
    else:
        dest = item.get("asignado_a_id")
    if dest:
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
    return get_item_detalle(sb, int(item["id"]))


# ── PDF / firmas / jobs ──────────────────────────────────────────────────────

def _contrato(sb, contrato_id: int) -> dict:
    rows = sb.table("contratos").select("*").eq("id", int(contrato_id)).limit(1).execute().data or []
    return rows[0] if rows else {"id": contrato_id}


def generar_preview_pdf_acta(sb, contrato_id: int, acta_id: int) -> bytes:
    acta = get_acta(sb, acta_id, contrato_id)
    try:
        contrato = _contrato(sb, contrato_id)
    except Exception:
        contrato = {"id": contrato_id}
    try:
        h = contenido_hash_acta(acta, acta.get("asistentes"), acta.get("ideas"), acta.get("apartados"))
        sb.table("seguimiento_acta").update({"contenido_hash": h, "updated_at": _now_utc().isoformat()}).eq("id", int(acta_id)).execute()
    except Exception as exc:
        _log.warning("contenido_hash acta=%s: %s", acta_id, exc)
    try:
        return generar_pdf_acta(
            contrato,
            acta,
            acta.get("asistentes") or [],
            acta.get("ideas") or [],
            acta.get("apartados") or [],
            firmas=acta.get("firmas") or [],
            compromisos=acta.get("compromisos") or [],
        )
    except Exception as exc:
        _log.exception("PDF acta %s: %s", acta_id, exc)
        # Reintento sin firmas/imágenes remotas
        acta_safe = {**acta, "ubicacion": acta.get("ubicacion"), "elaborador_nombre": acta.get("elaborador_nombre")}
        return generar_pdf_acta(
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
        )


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
) -> dict:
    """Usa el stack AVI/Clara con prompt de redacción para ideas de acta."""
    from avi_service import llamar_avi, verificar_y_registrar_uso

    restantes = await verificar_y_registrar_uso(str(usuario_id), sb)
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
