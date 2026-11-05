"""
Plan de actividades — lógica de negocio.

Cada actividad es un `seguimiento_item` con origen='plan_actividad' (compromiso
de Seguimiento). Campos propios viven en campos_libres.plan; asignados múltiples
reutilizan campos_libres.asignaciones (mismo patrón que tareas).

Ocurrencias periódicas se calculan de forma virtual (no se materializan filas).
Fechas/horas de negocio: America/Bogota.
"""
from __future__ import annotations

import calendar
import logging
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from plan_actividades_permissions import (
    tiene_permiso_plan_actividades,
)

_log = logging.getLogger("claracore.plan_actividades")

BOGOTA = ZoneInfo("America/Bogota")
ORIGEN = "plan_actividad"
PERIODICIDADES = frozenset({"ninguna", "semanal", "quincenal", "mensual"})
PRIORIDADES = frozenset({1, 2, 3, 4, 5})
ESTADOS_ABIERTOS = frozenset({"abierto", "en_progreso", "parcial", "vencido", "reprogramado"})


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
        return date.fromisoformat(s)
    except ValueError:
        return None


def _norm_txt(s: str) -> str:
    t = unicodedata.normalize("NFD", str(s or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.lower().strip()


def _nombre_usuario(u: Optional[dict]) -> str:
    if not u:
        return ""
    nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
    return nom or str(u.get("email") or u.get("id") or "")


def _usuario_row(sb, user_id: int) -> Optional[dict]:
    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, email, cargo_id, rol_id, contrato_id")
        .eq("id", int(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _es_desarrollador(current_user) -> bool:
    try:
        from seguimiento_service import es_desarrollador_seguimiento

        return bool(es_desarrollador_seguimiento(current_user))
    except Exception:
        return _norm_txt(
            (current_user or {}).get("cargo_nombre")
            or (current_user or {}).get("cargo")
            or (current_user or {}).get("rol_nombre")
            or ""
        ) == "desarrollador"


def _es_gerencial_o_admin(sb, user_id: int, current_user: Optional[dict]) -> bool:
    if _es_desarrollador(current_user):
        return True
    try:
        from seguimiento_service import es_contratista_gerencial

        u = _usuario_row(sb, user_id)
        if es_contratista_gerencial(u, current_user):
            return True
    except Exception:
        pass
    rol = _norm_txt(
        (current_user or {}).get("rol_nombre")
        or (current_user or {}).get("rol")
        or ""
    )
    if rol == "administrativo":
        return True
    # Fallback: cargo/rol del usuario en BD
    u = _usuario_row(sb, user_id)
    if not u:
        return False
    try:
        from main import supabase as _sb

        if u.get("rol_id"):
            r = (
                _sb.table("roles")
                .select("nombre")
                .eq("id", int(u["rol_id"]))
                .limit(1)
                .execute()
                .data
                or []
            )
            if r and _norm_txt(r[0].get("nombre")) in (
                "contratista gerencial",
                "administrativo",
            ):
                return True
            if r and "contratista gerencial" in _norm_txt(r[0].get("nombre")):
                return True
    except Exception:
        pass
    return False




def list_grupos(sb, contrato_id: int) -> List[dict]:
    try:
        return (
            sb.table("seguimiento_plan_grupo")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .order("nombre")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.exception("list_grupos: %s", exc)
        raise ValueError(
            "No se pudieron cargar los grupos del Plan de actividades. "
            "Verifique que exista la tabla seguimiento_plan_grupo o contacte a soporte."
        ) from exc


def ensure_grupo(
    sb,
    contrato_id: int,
    nombre: str,
    user_id: int,
    *,
    grupo_id: Optional[int] = None,
) -> dict:
    if grupo_id:
        rows = (
            sb.table("seguimiento_plan_grupo")
            .select("*")
            .eq("id", int(grupo_id))
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0]
        raise ValueError("Grupo no encontrado en este contrato")

    nom = re.sub(r"\s+", " ", str(nombre or "").strip())[:120]
    if not nom:
        raise ValueError("Indique el nombre del grupo")

    existentes = list_grupos(sb, contrato_id)
    for g in existentes:
        if _norm_txt(g.get("nombre")) == _norm_txt(nom):
            return g

    ins = (
        sb.table("seguimiento_plan_grupo")
        .insert({
            "contrato_id": int(contrato_id),
            "nombre": nom,
            "created_by": int(user_id),
        })
        .execute()
        .data
    )
    if not ins:
        raise ValueError("No se pudo crear el grupo")
    return ins[0]


def _plan_blob(item: dict) -> dict:
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    plan = libres.get("plan") if isinstance(libres.get("plan"), dict) else {}
    return dict(plan)


def _asignaciones_de(item: dict) -> List[dict]:
    libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
    raw = libres.get("asignaciones")
    if isinstance(raw, list) and raw:
        out = []
        for a in raw:
            if not isinstance(a, dict):
                continue
            try:
                uid = int(a.get("usuario_id") or a.get("id") or 0)
            except (TypeError, ValueError):
                uid = 0
            if uid <= 0:
                continue
            out.append({
                "usuario_id": uid,
                "nombre": str(a.get("nombre") or "").strip(),
                "estado_gestion": a.get("estado_gestion") or item.get("estado_gestion") or "abierto",
                "updated_at": a.get("updated_at"),
            })
        return out
    # Legacy singular
    try:
        aid = int(item.get("asignado_a_id") or 0)
    except (TypeError, ValueError):
        aid = 0
    if aid > 0:
        return [{
            "usuario_id": aid,
            "nombre": str(item.get("asignado_a_nombre") or "").strip(),
            "estado_gestion": item.get("estado_gestion") or "abierto",
        }]
    return []


def _ids_asignados(item: dict) -> Set[int]:
    return {int(a["usuario_id"]) for a in _asignaciones_de(item)}


def expandir_ocurrencias(
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
    periodicidad: str,
    hasta: Optional[date],
    *,
    rango_desde: Optional[date] = None,
    rango_hasta: Optional[date] = None,
) -> List[Tuple[date, date]]:
    """
    Devuelve lista de (inicio, fin) por ocurrencia.
    Si no hay fechas → [].
    Si periodicidad ninguna → una sola ocurrencia.
    """
    if not fecha_inicio and not fecha_fin:
        return []
    ini = fecha_inicio or fecha_fin
    fin = fecha_fin or fecha_inicio
    if not ini or not fin:
        return []
    if fin < ini:
        ini, fin = fin, ini
    span = (fin - ini).days
    per = (periodicidad or "ninguna").strip().lower()
    if per not in PERIODICIDADES:
        per = "ninguna"

    if per == "ninguna":
        occs = [(ini, fin)]
    else:
        limite = hasta or fin
        if limite < fin:
            limite = fin
        # Tope de seguridad: 5 años
        hard = ini + timedelta(days=365 * 5)
        if limite > hard:
            limite = hard
        occs = []
        cur_ini = ini
        cur_fin = fin
        while cur_ini <= limite:
            occs.append((cur_ini, cur_fin))
            if per == "semanal":
                delta = timedelta(days=7)
            elif per == "quincenal":
                delta = timedelta(days=14)
            else:  # mensual
                # Avance por mes calendario conservando día (clamp)
                y, m = cur_ini.year, cur_ini.month
                m += 1
                if m > 12:
                    y += 1
                    m = 1
                day = min(cur_ini.day, calendar.monthrange(y, m)[1])
                next_ini = date(y, m, day)
                delta = next_ini - cur_ini
            cur_ini = cur_ini + delta
            cur_fin = cur_ini + timedelta(days=span)
            if len(occs) >= 520:
                break

    if rango_desde or rango_hasta:
        filtered = []
        for a, b in occs:
            if rango_hasta and a > rango_hasta:
                continue
            if rango_desde and b < rango_desde:
                continue
            filtered.append((a, b))
        return filtered
    return occs


def _intervalos_solapan(a0: date, a1: date, b0: date, b1: date) -> bool:
    return a0 <= b1 and b0 <= a1


def _item_intervalos(item: dict) -> List[Tuple[date, date]]:
    plan = _plan_blob(item)
    fi = _parse_date(plan.get("fecha_inicio") or item.get("fecha_vencimiento"))
    ff = _parse_date(plan.get("fecha_fin") or item.get("fecha_vencimiento"))
    per = str(plan.get("periodicidad") or "ninguna")
    hasta = _parse_date(plan.get("periodicidad_hasta"))
    return expandir_ocurrencias(fi, ff, per, hasta)


def detectar_solapes(
    sb,
    contrato_id: int,
    *,
    asignado_ids: List[int],
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
    periodicidad: str,
    periodicidad_hasta: Optional[date],
    excluir_item_id: Optional[int] = None,
) -> List[dict]:
    """Alerta informativa: cruza con otras actividades del plan y compromisos/tareas del asignado."""
    if not asignado_ids:
        return []
    if not fecha_inicio and not fecha_fin:
        return []

    nuevas = expandir_ocurrencias(
        fecha_inicio, fecha_fin, periodicidad, periodicidad_hasta,
    )
    if not nuevas:
        return []

    # Cargar ítems del contrato (plan + compromiso + tarea) abiertos con fechas
    rows = (
        sb.table("seguimiento_item")
        .select(
            "id, origen, titulo, estado_gestion, asignado_a_id, asignado_a_nombre, "
            "fecha_vencimiento, campos_libres, created_by"
        )
        .eq("contrato_id", int(contrato_id))
        .in_("origen", ["plan_actividad", "compromiso", "tarea"])
        .limit(3000)
        .execute()
        .data
        or []
    )

    asign_set = {int(x) for x in asignado_ids}
    choques: List[dict] = []
    seen = set()

    for r in rows:
        try:
            rid = int(r.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if excluir_item_id and rid == int(excluir_item_id):
            continue
        if r.get("estado_gestion") in ("cumplido", "cancelado"):
            continue
        ids = _ids_asignados(r)
        if not (ids & asign_set):
            continue

        if r.get("origen") == ORIGEN:
            otros = _item_intervalos(r)
        else:
            fv = _parse_date(r.get("fecha_vencimiento"))
            if not fv:
                continue
            # Compromiso/tarea: día puntual (o rango en plan-like campos)
            plan = _plan_blob(r)
            fi = _parse_date(plan.get("fecha_inicio")) or fv
            ff = _parse_date(plan.get("fecha_fin")) or fv
            otros = [(fi, ff)]

        for n0, n1 in nuevas:
            for o0, o1 in otros:
                if _intervalos_solapan(n0, n1, o0, o1):
                    key = (rid, o0.isoformat(), o1.isoformat())
                    if key in seen:
                        continue
                    seen.add(key)
                    plan_r = _plan_blob(r)
                    prio = plan_r.get("prioridad")
                    try:
                        prio = int(prio) if prio is not None else None
                    except (TypeError, ValueError):
                        prio = None
                    choques.append({
                        "item_id": rid,
                        "origen": r.get("origen"),
                        "titulo": r.get("titulo") or f"#{rid}",
                        "fecha_inicio": o0.isoformat(),
                        "fecha_fin": o1.isoformat(),
                        "prioridad": prio,
                        "asignados": [
                            a for a in _asignaciones_de(r)
                            if int(a["usuario_id"]) in asign_set
                        ],
                    })
    choques.sort(key=lambda x: (x.get("fecha_inicio") or "", x.get("titulo") or ""))
    return choques


def _normalizar_asignados(sb, contrato_id: int, asignados: List[Any]) -> List[dict]:
    out = []
    seen = set()
    for raw in asignados or []:
        if isinstance(raw, dict):
            try:
                uid = int(raw.get("usuario_id") or raw.get("id") or 0)
            except (TypeError, ValueError):
                uid = 0
            nombre = str(raw.get("nombre") or "").strip()
        else:
            try:
                uid = int(raw)
            except (TypeError, ValueError):
                uid = 0
            nombre = ""
        if uid <= 0 or uid in seen:
            continue
        seen.add(uid)
        if not nombre:
            u = _usuario_row(sb, uid)
            nombre = _nombre_usuario(u)
        out.append({
            "usuario_id": uid,
            "nombre": nombre,
            "estado_gestion": "abierto",
        })
    return out


def _norm_adjuntos(raw) -> List[dict]:
    out = []
    for a in raw or []:
        if not isinstance(a, dict):
            continue
        data = a.get("data_uri") or a.get("url") or a.get("src")
        if not data and not a.get("blob_path"):
            continue
        out.append({
            "nombre": str(a.get("nombre") or "esquema.png")[:200],
            "data_uri": a.get("data_uri"),
            "url": a.get("url") or a.get("src"),
            "blob_path": a.get("blob_path"),
            "mime_type": a.get("mime_type") or "image/png",
            "kind": a.get("kind") or "esquema",
            "campo": a.get("campo"),
            "created_at": a.get("created_at"),
        })
    return out[:16]


def _build_campos_plan(
    *,
    grupo: dict,
    comentario_comite: str,
    prioridad: int,
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
    periodicidad: str,
    periodicidad_hasta: Optional[date],
    asignaciones: List[dict],
    acta_tema_vinculo: Optional[dict] = None,
    adjuntos_descripcion: Optional[List[dict]] = None,
    adjuntos_comentario: Optional[List[dict]] = None,
) -> dict:
    plan = {
        "grupo_id": int(grupo["id"]),
        "grupo_nombre": grupo.get("nombre"),
        "comentario_comite": comentario_comite or "",
        "prioridad": int(prioridad),
        "fecha_inicio": fecha_inicio.isoformat() if fecha_inicio else None,
        "fecha_fin": fecha_fin.isoformat() if fecha_fin else None,
        "periodicidad": periodicidad,
        "periodicidad_hasta": periodicidad_hasta.isoformat() if periodicidad_hasta else None,
        "adjuntos_descripcion": _norm_adjuntos(adjuntos_descripcion),
        "adjuntos_comentario": _norm_adjuntos(adjuntos_comentario),
    }
    if acta_tema_vinculo:
        plan["desde_acta"] = True
        plan["acta_id"] = acta_tema_vinculo.get("acta_id")
        plan["idea_id"] = acta_tema_vinculo.get("idea_id")
    return {
        "plan": plan,
        "asignaciones": asignaciones,
        "es_plan_actividad": True,
    }


def _gracia_para_fecha(sb, contrato_id: int, fv: date):
    try:
        from prog_obra_calendar import CalendarioNoHabilesCache, make_calendar_loader
        from seguimiento_service import calcular_fecha_limite_gracia

        cache = CalendarioNoHabilesCache(loader=make_calendar_loader(sb))
        return calcular_fecha_limite_gracia(contrato_id, fv, cache)
    except Exception:
        # Fallback: +1 día calendario 23:59 Bogotá → UTC
        fin = datetime(fv.year, fv.month, fv.day, 23, 59, 59, tzinfo=BOGOTA) + timedelta(days=1)
        return fin.astimezone(timezone.utc)


def _proximo_consecutivo(sb, contrato_id: int) -> int:
    rows = (
        sb.table("seguimiento_item")
        .select("consecutivo")
        .eq("contrato_id", int(contrato_id))
        .eq("origen", ORIGEN)
        .order("consecutivo", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    try:
        return int((rows[0] if rows else {}).get("consecutivo") or 0) + 1
    except Exception:
        return 1


def _acta_id_de_item(item: dict) -> Optional[int]:
    try:
        aid = int(item.get("acta_id") or 0)
    except (TypeError, ValueError):
        aid = 0
    if aid > 0:
        return aid
    plan = _plan_blob(item)
    try:
        aid = int(plan.get("acta_id") or 0)
    except (TypeError, ValueError):
        aid = 0
    return aid if aid > 0 else None


def _idea_id_de_item(item: dict) -> Optional[int]:
    try:
        iid = int(item.get("idea_id") or 0)
    except (TypeError, ValueError):
        iid = 0
    if iid > 0:
        return iid
    plan = _plan_blob(item)
    try:
        iid = int(plan.get("idea_id") or 0)
    except (TypeError, ValueError):
        iid = 0
    return iid if iid > 0 else None


def _es_elaborador_acta_vinculada(sb, item: dict, user_id: int) -> bool:
    """Moderador del acta (elaborador) puede leer el Plan vinculado a su acta."""
    aid = _acta_id_de_item(item)
    if not aid:
        return False
    try:
        rows = (
            sb.table("seguimiento_acta")
            .select("id, elaborador_id")
            .eq("id", int(aid))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return False
    if not rows:
        return False
    try:
        return int(rows[0].get("elaborador_id") or 0) == int(user_id)
    except (TypeError, ValueError):
        return False


def _puede_ver_item(sb, item: dict, user_id: int, current_user: dict) -> bool:
    if _es_desarrollador(current_user):
        return True
    if _es_gerencial_o_admin(sb, user_id, current_user):
        return True
    if int(item.get("created_by") or 0) == int(user_id):
        return True
    if int(item.get("solicitante_id") or 0) == int(user_id):
        return True
    if int(user_id) in _ids_asignados(item):
        return True
    # Lectura: elaborador/moderador del acta a la que está vinculada la actividad.
    return _es_elaborador_acta_vinculada(sb, item, user_id)


def _puede_comentar(sb, item: dict, user_id: int, current_user: dict) -> bool:
    if _es_desarrollador(current_user) or _es_gerencial_o_admin(sb, user_id, current_user):
        return True
    if int(item.get("created_by") or 0) == int(user_id):
        return True
    if int(item.get("solicitante_id") or 0) == int(user_id):
        return True
    return int(user_id) in _ids_asignados(item)


def _puede_cambiar_estado(item: dict, user_id: int, current_user: dict) -> bool:
    if _es_desarrollador(current_user):
        return True
    return int(user_id) in _ids_asignados(item)


def _enrich_item(item: dict) -> dict:
    plan = _plan_blob(item)
    asigns = _asignaciones_de(item)
    item = dict(item)
    item["plan"] = plan
    item["asignaciones"] = asigns
    item["grupo_nombre"] = plan.get("grupo_nombre")
    item["grupo_id"] = plan.get("grupo_id")
    item["prioridad"] = plan.get("prioridad")
    item["comentario_comite"] = plan.get("comentario_comite")
    item["fecha_inicio"] = plan.get("fecha_inicio")
    item["fecha_fin"] = plan.get("fecha_fin") or item.get("fecha_vencimiento")
    item["periodicidad"] = plan.get("periodicidad") or "ninguna"
    item["periodicidad_hasta"] = plan.get("periodicidad_hasta")
    item["adjuntos_descripcion"] = _norm_adjuntos(plan.get("adjuntos_descripcion"))
    item["adjuntos_comentario"] = _norm_adjuntos(plan.get("adjuntos_comentario"))
    item["ocurrencias"] = [
        {"fecha_inicio": a.isoformat(), "fecha_fin": b.isoformat()}
        for a, b in _item_intervalos(item)
    ]
    return item


def list_actividades(
    sb,
    contrato_id: int,
    user_id: int,
    current_user: dict,
    *,
    colaborador_id: Optional[int] = None,
    incluir_cerrados: bool = True,
    ver_todos: bool = False,
    acta_id: Optional[int] = None,
    idea_id: Optional[int] = None,
) -> List[dict]:
    try:
        q = (
            sb.table("seguimiento_item")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("origen", ORIGEN)
        )
        if acta_id is not None:
            q = q.eq("acta_id", int(acta_id))
        if idea_id is not None:
            q = q.eq("idea_id", int(idea_id))
        rows = q.order("id").limit(2000).execute().data or []
    except Exception as exc:
        _log.exception("list_actividades query: %s", exc)
        raise ValueError(
            "No se pudo cargar el Plan de actividades. Verifique que la base de datos "
            "esté actualizada (origen plan_actividad) o contacte a soporte."
        ) from exc

    es_vista_amplia = _es_desarrollador(current_user) or _es_gerencial_o_admin(
        sb, user_id, current_user
    )
    # Alcance acta/tema: el elaborador lee el plan del expositor (sin mutar).
    alcance_acta = acta_id is not None or idea_id is not None
    out = []
    for r in rows:
        if not incluir_cerrados and r.get("estado_gestion") in ("cumplido", "cancelado"):
            continue
        if not _puede_ver_item(sb, r, user_id, current_user):
            continue
        if colaborador_id is not None:
            cid = int(colaborador_id)
            ids = _ids_asignados(r) | {
                int(r.get("created_by") or 0),
                int(r.get("solicitante_id") or 0),
            }
            if cid not in ids:
                continue
        elif not alcance_acta and (not ver_todos or not es_vista_amplia):
            # Ambiente propio (gerencia/admin solo ven todos si ver_todos=true).
            # Con acta_id/idea_id se listan las del tema visibles al elaborador/expositor.
            if not (
                int(r.get("created_by") or 0) == int(user_id)
                or int(r.get("solicitante_id") or 0) == int(user_id)
                or int(user_id) in _ids_asignados(r)
            ):
                continue

        out.append(_enrich_item(r))

    # Orden: grupo, prioridad desc, fecha inicio
    def sk(it):
        return (
            str(it.get("grupo_nombre") or "zzz").lower(),
            -(int(it.get("prioridad") or 0)),
            str(it.get("fecha_inicio") or it.get("fecha_fin") or "9999"),
            int(it.get("id") or 0),
        )

    out.sort(key=sk)
    return out


def list_colaboradores_plan(sb, contrato_id: int) -> List[dict]:
    try:
        from seguimiento_service import list_usuarios_contrato_enriquecidos

        return list_usuarios_contrato_enriquecidos(sb, int(contrato_id))
    except Exception:
        rows = (
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
        ids = [int(r["usuario_id"]) for r in rows if r.get("usuario_id")]
        if not ids:
            return []
        users = (
            sb.table("usuarios")
            .select("id, nombre, apellidos, email")
            .in_("id", ids)
            .execute()
            .data
            or []
        )
        return [
            {
                "id": u["id"],
                "nombre": _nombre_usuario(u),
                "email": u.get("email"),
            }
            for u in users
        ]


def crear_actividad(
    sb,
    contrato_id: int,
    user_id: int,
    current_user: dict,
    data: dict,
    *,
    confirmar_solape: bool = False,
) -> dict:
    if not tiene_permiso_plan_actividades(current_user, "crear", contrato_id):
        raise PermissionError("No tiene permiso para crear actividades del plan.")

    titulo = re.sub(r"\s+", " ", str(data.get("titulo") or data.get("actividad") or "").strip())
    if not titulo:
        raise ValueError("La actividad (título) es obligatoria")
    titulo = titulo[:500]
    descripcion = str(data.get("descripcion") or "")
    comentario = str(data.get("comentario_comite") or "")

    try:
        prioridad = int(data.get("prioridad") or 3)
    except (TypeError, ValueError):
        prioridad = 3
    if prioridad not in PRIORIDADES:
        raise ValueError("Prioridad inválida (1 a 5)")

    periodicidad = str(data.get("periodicidad") or "ninguna").strip().lower()
    if periodicidad not in PERIODICIDADES:
        raise ValueError("Periodicidad inválida")
    fi = _parse_date(data.get("fecha_inicio"))
    ff = _parse_date(data.get("fecha_fin"))
    hasta = _parse_date(data.get("periodicidad_hasta"))
    if periodicidad != "ninguna" and not hasta:
        raise ValueError("Indique hasta qué fecha se repite la periodicidad")
    if periodicidad != "ninguna" and not (fi or ff):
        raise ValueError("La periodicidad requiere fecha de inicio o fin")

    grupo = ensure_grupo(
        sb,
        contrato_id,
        data.get("grupo_nombre") or data.get("grupo") or "",
        user_id,
        grupo_id=data.get("grupo_id"),
    )

    asignaciones = _normalizar_asignados(sb, contrato_id, data.get("asignados") or data.get("asignaciones") or [])
    if not asignaciones:
        raise ValueError("Indique al menos un asignado")

    solicitante_id = data.get("solicitante_id")
    try:
        solicitante_id = int(solicitante_id) if solicitante_id is not None else int(user_id)
    except (TypeError, ValueError):
        solicitante_id = int(user_id)
    sol_u = _usuario_row(sb, solicitante_id)
    solicitante_nombre = (
        str(data.get("solicitante_nombre") or "").strip()
        or _nombre_usuario(sol_u)
        or _nombre_usuario(_usuario_row(sb, user_id))
    )

    acta_id = data.get("acta_id")
    idea_id = data.get("idea_id")
    vinculo = None
    if acta_id is not None:
        try:
            acta_id = int(acta_id)
        except (TypeError, ValueError):
            acta_id = None
    if idea_id is not None:
        try:
            idea_id = int(idea_id)
        except (TypeError, ValueError):
            idea_id = None
    if acta_id:
        vinculo = {"acta_id": acta_id, "idea_id": idea_id}

    solapes = detectar_solapes(
        sb,
        contrato_id,
        asignado_ids=[a["usuario_id"] for a in asignaciones],
        fecha_inicio=fi,
        fecha_fin=ff,
        periodicidad=periodicidad,
        periodicidad_hasta=hasta,
    )
    if solapes and not confirmar_solape and not data.get("confirmar_solape"):
        return {
            "requiere_confirmacion_solape": True,
            "solapes": solapes,
        }

    fv = ff or fi
    gracia = _gracia_para_fecha(sb, contrato_id, fv) if fv else None
    campos = _build_campos_plan(
        grupo=grupo,
        comentario_comite=comentario,
        prioridad=prioridad,
        fecha_inicio=fi,
        fecha_fin=ff,
        periodicidad=periodicidad,
        periodicidad_hasta=hasta,
        asignaciones=asignaciones,
        acta_tema_vinculo=vinculo,
        adjuntos_descripcion=data.get("adjuntos_descripcion") or data.get("esquemas_descripcion"),
        adjuntos_comentario=data.get("adjuntos_comentario") or data.get("esquemas_comentario"),
    )

    nombres = ", ".join(a["nombre"] for a in asignaciones if a.get("nombre"))
    row = {
        "origen": ORIGEN,
        "titulo": titulo,
        "descripcion": descripcion,
        "estado_gestion": "abierto",
        "asignado_a_id": asignaciones[0]["usuario_id"],
        "asignado_a_nombre": nombres[:500] or asignaciones[0].get("nombre"),
        "created_by": int(user_id),
        "contrato_id": int(contrato_id),
        "solicitante_id": solicitante_id,
        "solicitante_nombre": solicitante_nombre[:200],
        "relacion_destinatario": "asignacion",
        "campos_libres": campos,
        "fecha_vencimiento": fv.isoformat() if fv else None,
        "fecha_vencimiento_original": fv.isoformat() if fv else None,
        "fecha_limite_gracia": gracia.isoformat() if gracia else None,
        "consecutivo": _proximo_consecutivo(sb, contrato_id),
        "acta_id": acta_id,
        "idea_id": idea_id,
    }

    try:
        ins = sb.table("seguimiento_item").insert(row).execute().data
    except Exception as exc:
        _log.exception("crear_actividad insert: %s", exc)
        raw = str(exc).lower()
        if "origen" in raw or "check" in raw:
            raise ValueError(
                "No se pudo crear la actividad: la base de datos aún no admite el origen "
                "«plan_actividad». Ejecute la migración del Plan de actividades."
            ) from exc
        raise ValueError(
            "No se pudo crear la actividad. Verifique los datos e intente de nuevo."
        ) from exc
    if not ins:
        raise ValueError("No se pudo crear la actividad")
    item = ins[0]

    try:
        from seguimiento_service import _registrar_evento, _notificar_compromiso_asignado

        _registrar_evento(
            sb,
            int(item["id"]),
            "plan_actividad_creada",
            user_id,
            {"titulo": titulo, "prioridad": prioridad, "grupo": grupo.get("nombre")},
        )
        for a in asignaciones:
            if int(a["usuario_id"]) == int(user_id):
                continue
            try:
                _notificar_compromiso_asignado(
                    sb,
                    destinatario_id=int(a["usuario_id"]),
                    remitente_id=int(user_id),
                    titulo=titulo,
                    fecha_vencimiento=fv,
                    contrato_id=contrato_id,
                    item_id=int(item["id"]),
                    descripcion=descripcion,
                )
            except Exception as exc:
                _log.warning("notif asignado plan: %s", exc)
    except Exception as exc:
        _log.warning("post-create plan: %s", exc)

    enriched = _enrich_item(get_item_raw(sb, int(item["id"])))
    if solapes:
        enriched["solapes_informativos"] = solapes
    return enriched


def get_item_raw(sb, item_id: int) -> dict:
    rows = (
        sb.table("seguimiento_item")
        .select("*")
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Actividad no encontrada")
    return rows[0]


def get_actividad(
    sb,
    item_id: int,
    user_id: int,
    current_user: dict,
) -> dict:
    item = get_item_raw(sb, item_id)
    if item.get("origen") != ORIGEN:
        raise ValueError("El ítem no es una actividad del plan")
    if not _puede_ver_item(sb, item, user_id, current_user):
        raise PermissionError("No puede ver esta actividad")

    detalle = _enrich_item(item)
    # Comentarios + eventos
    comentarios = (
        sb.table("seguimiento_item_comentario")
        .select("*")
        .eq("item_id", int(item_id))
        .order("created_at")
        .execute()
        .data
        or []
    )
    eventos = (
        sb.table("seguimiento_evento_gestion")
        .select("*")
        .eq("item_id", int(item_id))
        .order("created_at")
        .execute()
        .data
        or []
    )
    detalle["comentarios"] = comentarios
    detalle["eventos"] = eventos
    detalle["puede_editar"] = (
        int(item.get("created_by") or 0) == int(user_id)
        and tiene_permiso_plan_actividades(current_user, "editar", item.get("contrato_id"))
    ) or _es_desarrollador(current_user)
    detalle["puede_eliminar"] = (
        int(item.get("created_by") or 0) == int(user_id)
        and tiene_permiso_plan_actividades(current_user, "eliminar", item.get("contrato_id"))
    ) or _es_desarrollador(current_user)
    detalle["puede_comentar"] = _puede_comentar(sb, item, user_id, current_user)
    detalle["puede_cambiar_estado"] = _puede_cambiar_estado(item, user_id, current_user)
    return detalle


def actualizar_actividad(
    sb,
    item_id: int,
    user_id: int,
    current_user: dict,
    data: dict,
) -> dict:
    item = get_item_raw(sb, item_id)
    if item.get("origen") != ORIGEN:
        raise ValueError("El ítem no es una actividad del plan")
    cid = int(item["contrato_id"])

    es_creador = int(item.get("created_by") or 0) == int(user_id)
    if not es_creador and not _es_desarrollador(current_user):
        raise PermissionError("Solo quien creó la actividad puede editarla.")
    if not tiene_permiso_plan_actividades(current_user, "editar", cid) and not _es_desarrollador(current_user):
        raise PermissionError("No tiene permiso para editar actividades del plan.")

    antes = _enrich_item(item)
    plan_prev = _plan_blob(item)
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}

    titulo = data.get("titulo") if "titulo" in data or "actividad" in data else item.get("titulo")
    if "actividad" in data and "titulo" not in data:
        titulo = data.get("actividad")
    titulo = re.sub(r"\s+", " ", str(titulo or "").strip())[:500]
    if not titulo:
        raise ValueError("La actividad (título) es obligatoria")

    descripcion = data.get("descripcion") if "descripcion" in data else item.get("descripcion")
    comentario = (
        data.get("comentario_comite")
        if "comentario_comite" in data
        else plan_prev.get("comentario_comite")
    )

    if "prioridad" in data:
        try:
            prioridad = int(data.get("prioridad"))
        except (TypeError, ValueError):
            raise ValueError("Prioridad inválida") from None
    else:
        prioridad = int(plan_prev.get("prioridad") or 3)
    if prioridad not in PRIORIDADES:
        raise ValueError("Prioridad inválida (1 a 5)")

    if "periodicidad" in data:
        periodicidad = str(data.get("periodicidad") or "ninguna").strip().lower()
    else:
        periodicidad = str(plan_prev.get("periodicidad") or "ninguna")
    if periodicidad not in PERIODICIDADES:
        raise ValueError("Periodicidad inválida")

    fi = _parse_date(data["fecha_inicio"]) if "fecha_inicio" in data else _parse_date(plan_prev.get("fecha_inicio"))
    ff = _parse_date(data["fecha_fin"]) if "fecha_fin" in data else _parse_date(plan_prev.get("fecha_fin"))
    hasta = (
        _parse_date(data["periodicidad_hasta"])
        if "periodicidad_hasta" in data
        else _parse_date(plan_prev.get("periodicidad_hasta"))
    )
    if periodicidad != "ninguna" and not hasta:
        raise ValueError("Indique hasta qué fecha se repite la periodicidad")

    if "grupo_id" in data or "grupo_nombre" in data or "grupo" in data:
        grupo = ensure_grupo(
            sb,
            cid,
            data.get("grupo_nombre") or data.get("grupo") or plan_prev.get("grupo_nombre") or "",
            user_id,
            grupo_id=data.get("grupo_id"),
        )
    else:
        grupo = {
            "id": plan_prev.get("grupo_id"),
            "nombre": plan_prev.get("grupo_nombre"),
        }
        if not grupo.get("id"):
            grupo = ensure_grupo(sb, cid, grupo.get("nombre") or "General", user_id)

    if "asignados" in data or "asignaciones" in data:
        asignaciones = _normalizar_asignados(
            sb, cid, data.get("asignados") or data.get("asignaciones") or []
        )
        if not asignaciones:
            raise ValueError("Indique al menos un asignado")
    else:
        asignaciones = _asignaciones_de(item)

    solicitante_id = item.get("solicitante_id")
    solicitante_nombre = item.get("solicitante_nombre")
    if "solicitante_id" in data:
        try:
            solicitante_id = int(data.get("solicitante_id"))
        except (TypeError, ValueError):
            pass
        sol_u = _usuario_row(sb, solicitante_id)
        solicitante_nombre = (
            str(data.get("solicitante_nombre") or "").strip()
            or _nombre_usuario(sol_u)
            or solicitante_nombre
        )

    solapes = detectar_solapes(
        sb,
        cid,
        asignado_ids=[a["usuario_id"] for a in asignaciones],
        fecha_inicio=fi,
        fecha_fin=ff,
        periodicidad=periodicidad,
        periodicidad_hasta=hasta,
        excluir_item_id=item_id,
    )
    if solapes and not data.get("confirmar_solape"):
        return {
            "requiere_confirmacion_solape": True,
            "solapes": solapes,
        }

    fv = ff or fi
    gracia = _gracia_para_fecha(sb, cid, fv) if fv else None
    vinculo = None
    if item.get("acta_id"):
        vinculo = {"acta_id": item.get("acta_id"), "idea_id": item.get("idea_id")}

    adj_desc = (
        data.get("adjuntos_descripcion")
        if "adjuntos_descripcion" in data or "esquemas_descripcion" in data
        else plan_prev.get("adjuntos_descripcion")
    )
    if "esquemas_descripcion" in data and "adjuntos_descripcion" not in data:
        adj_desc = data.get("esquemas_descripcion")
    adj_com = (
        data.get("adjuntos_comentario")
        if "adjuntos_comentario" in data or "esquemas_comentario" in data
        else plan_prev.get("adjuntos_comentario")
    )
    if "esquemas_comentario" in data and "adjuntos_comentario" not in data:
        adj_com = data.get("esquemas_comentario")

    campos = _build_campos_plan(
        grupo=grupo,
        comentario_comite=str(comentario or ""),
        prioridad=prioridad,
        fecha_inicio=fi,
        fecha_fin=ff,
        periodicidad=periodicidad,
        periodicidad_hasta=hasta,
        asignaciones=asignaciones,
        acta_tema_vinculo=vinculo,
        adjuntos_descripcion=adj_desc,
        adjuntos_comentario=adj_com,
    )
    # Conservar otras claves de campos_libres
    for k, v in libres.items():
        if k not in ("plan", "asignaciones", "es_plan_actividad"):
            campos[k] = v

    nombres = ", ".join(a["nombre"] for a in asignaciones if a.get("nombre"))
    patch = {
        "titulo": titulo,
        "descripcion": descripcion,
        "asignado_a_id": asignaciones[0]["usuario_id"],
        "asignado_a_nombre": nombres[:500] or asignaciones[0].get("nombre"),
        "solicitante_id": solicitante_id,
        "solicitante_nombre": (solicitante_nombre or "")[:200],
        "campos_libres": campos,
        "fecha_vencimiento": fv.isoformat() if fv else None,
        "fecha_limite_gracia": gracia.isoformat() if gracia else None,
        "updated_at": _now_utc().isoformat(),
    }
    sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()

    try:
        from seguimiento_service import _registrar_evento

        _registrar_evento(
            sb,
            int(item_id),
            "plan_actividad_editada",
            user_id,
            {
                "antes": {
                    "titulo": antes.get("titulo"),
                    "prioridad": antes.get("prioridad"),
                    "fecha_inicio": antes.get("fecha_inicio"),
                    "fecha_fin": antes.get("fecha_fin"),
                    "estado_gestion": antes.get("estado_gestion"),
                },
                "despues": {
                    "titulo": titulo,
                    "prioridad": prioridad,
                    "fecha_inicio": fi.isoformat() if fi else None,
                    "fecha_fin": ff.isoformat() if ff else None,
                },
            },
        )
    except Exception as exc:
        _log.warning("evento edit plan: %s", exc)

    enriched = get_actividad(sb, item_id, user_id, current_user)
    if solapes:
        enriched["solapes_informativos"] = solapes
    return enriched


def eliminar_actividad(sb, item_id: int, user_id: int, current_user: dict) -> None:
    item = get_item_raw(sb, item_id)
    if item.get("origen") != ORIGEN:
        raise ValueError("El ítem no es una actividad del plan")
    cid = int(item["contrato_id"])
    es_creador = int(item.get("created_by") or 0) == int(user_id)
    if not es_creador and not _es_desarrollador(current_user):
        raise PermissionError("Solo quien creó la actividad puede eliminarla.")
    if not tiene_permiso_plan_actividades(current_user, "eliminar", cid) and not _es_desarrollador(current_user):
        raise PermissionError("No tiene permiso para eliminar actividades del plan.")
    sb.table("seguimiento_item").delete().eq("id", int(item_id)).execute()


def comentar_actividad(
    sb,
    item_id: int,
    user_id: int,
    current_user: dict,
    mensaje: str,
) -> dict:
    item = get_item_raw(sb, item_id)
    if item.get("origen") != ORIGEN:
        raise ValueError("El ítem no es una actividad del plan")
    if not _puede_comentar(sb, item, user_id, current_user):
        raise PermissionError("No puede comentar esta actividad.")
    msg = str(mensaje or "").strip()
    if not msg:
        raise ValueError("Mensaje vacío")
    u = _usuario_row(sb, user_id)
    ins = (
        sb.table("seguimiento_item_comentario")
        .insert({
            "item_id": int(item_id),
            "autor_id": int(user_id),
            "autor_nombre": _nombre_usuario(u),
            "mensaje": msg,
        })
        .execute()
        .data
    )
    if not ins:
        raise ValueError("No se pudo guardar el comentario")
    try:
        from seguimiento_service import _registrar_evento

        _registrar_evento(
            sb, int(item_id), "plan_comentario", user_id, {"comentario_id": ins[0].get("id")}
        )
    except Exception:
        pass
    return ins[0]


def editar_comentario(
    sb,
    comentario_id: int,
    user_id: int,
    current_user: dict,
    mensaje: str,
) -> dict:
    rows = (
        sb.table("seguimiento_item_comentario")
        .select("*")
        .eq("id", int(comentario_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Comentario no encontrado")
    c = rows[0]
    item = get_item_raw(sb, int(c["item_id"]))
    if item.get("origen") != ORIGEN:
        raise ValueError("El comentario no pertenece al plan")
    if int(c.get("autor_id") or 0) != int(user_id) and not _es_desarrollador(current_user):
        raise PermissionError("Solo el autor puede editar su comentario.")
    msg = str(mensaje or "").strip()
    if not msg:
        raise ValueError("Mensaje vacío")
    u = _usuario_row(sb, user_id)
    patch = {
        "mensaje_anterior": c.get("mensaje"),
        "mensaje": msg,
        "editado_en": _now_utc().isoformat(),
        "editado_por_id": int(user_id),
        "editado_por_nombre": _nombre_usuario(u),
    }
    sb.table("seguimiento_item_comentario").update(patch).eq("id", int(comentario_id)).execute()
    updated = (
        sb.table("seguimiento_item_comentario")
        .select("*")
        .eq("id", int(comentario_id))
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    return updated


def cambiar_estado_actividad(
    sb,
    item_id: int,
    user_id: int,
    current_user: dict,
    estado_gestion: str,
) -> dict:
    item = get_item_raw(sb, item_id)
    if item.get("origen") != ORIGEN:
        raise ValueError("El ítem no es una actividad del plan")
    if not _puede_cambiar_estado(item, user_id, current_user):
        raise PermissionError("Solo el asignado puede cambiar el estado de la actividad.")

    estado = str(estado_gestion or "").strip().lower()
    permitidos = {
        "abierto", "en_progreso", "cumplido", "parcial", "vencido", "cancelado", "reprogramado",
    }
    if estado not in permitidos:
        raise ValueError("Estado inválido")

    prev = item.get("estado_gestion")
    try:
        from seguimiento_service import actualizar_estado_gestion

        actualizar_estado_gestion(
            sb, item_id, estado, user_id, contrato_id=item.get("contrato_id"),
        )
    except Exception:
        patch = {
            "estado_gestion": estado,
            "updated_at": _now_utc().isoformat(),
        }
        sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
        try:
            from seguimiento_service import _registrar_evento

            _registrar_evento(
                sb,
                int(item_id),
                "cambio_estado",
                user_id,
                {"antes": prev, "despues": estado},
            )
        except Exception:
            pass

    # Actualizar estado en asignaciones del usuario
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
    asigns = list(libres.get("asignaciones") or [])
    changed = False
    for a in asigns:
        if isinstance(a, dict) and int(a.get("usuario_id") or 0) == int(user_id):
            a["estado_gestion"] = estado
            a["updated_at"] = _now_utc().isoformat()
            changed = True
    if changed:
        libres["asignaciones"] = asigns
        sb.table("seguimiento_item").update({
            "campos_libres": libres,
            "updated_at": _now_utc().isoformat(),
        }).eq("id", int(item_id)).execute()

    return get_actividad(sb, item_id, user_id, current_user)


# Identificación de calidad (sistema CCD ClaraCore). Ajustable si Calidad redefine.
PLAN_ACTIVIDADES_FORMATO = {
    "codigo": "CC-SEG-PLAN-001",
    "version": "1.0",
    "nombre": "Plan de actividades",
    "nombre_mayus": "PLAN DE ACTIVIDADES",
}

# Columnas de grilla (igual que pantalla). El departamento va como banda, no columna.
_EXPORT_HEADERS = [
    "Actividad",
    "Descripción",
    "Comentario comité",
    "Solicitante",
    "Asignado(s)",
    "Prioridad",
    "Estado",
    "Fecha inicio",
    "Fecha fin",
    "Periodicidad",
]


def _fmt_fecha_co(raw) -> str:
    d = _parse_date(raw)
    if not d:
        return ""
    return d.strftime("%d/%m/%Y")


def _sheet_title_safe(nombre: str, used: Set[str]) -> str:
    base = re.sub(r"[:\\/?*\[\]]+", " ", str(nombre or "Colaborador")).strip()
    base = re.sub(r"\s+", " ", base)[:28] or "Colaborador"
    title = base
    n = 2
    while title.lower() in used:
        suffix = f" ({n})"
        title = (base[: max(1, 31 - len(suffix))] + suffix)[:31]
        n += 1
    used.add(title.lower())
    return title


def _contrato_meta_export(sb, contrato_id: int) -> Dict[str, str]:
    try:
        from main import _xlsx_load_contrato_export_meta

        return _xlsx_load_contrato_export_meta(int(contrato_id))
    except Exception:
        pass
    meta = {
        "numero": "",
        "objeto": "",
        "contratista": "",
        "logo_contratista": "",
    }
    try:
        cr = (
            sb.table("contratos")
            .select("numero, objeto, contratista, logo_contratista")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if cr:
            meta["numero"] = str(cr[0].get("numero") or "").strip()
            meta["objeto"] = str(cr[0].get("objeto") or "").strip()
            meta["contratista"] = str(cr[0].get("contratista") or "").strip()
            meta["logo_contratista"] = str(cr[0].get("logo_contratista") or "").strip()
    except Exception:
        pass
    return meta


def _usuario_export_info(sb, uid: int) -> Dict[str, str]:
    u = _usuario_row(sb, uid) or {}
    nombre = _nombre_usuario(u) or f"Usuario {uid}"
    cargo = ""
    try:
        cid = u.get("cargo_id")
        if cid:
            crow = (
                sb.table("cargos")
                .select("nombre")
                .eq("id", int(cid))
                .limit(1)
                .execute()
                .data
                or []
            )
            if crow:
                cargo = str(crow[0].get("nombre") or "").strip()
    except Exception:
        pass
    return {"id": int(uid), "nombre": nombre, "cargo": cargo}


def _targets_export(
    sb,
    contrato_id: int,
    user_id: int,
    current_user: dict,
    *,
    colaborador_id: Optional[int],
    colaborador_ids: Optional[List[int]],
    todos: bool,
) -> List[Dict[str, str]]:
    """Lista de colaboradores a exportar (una hoja cada uno)."""
    es_amplia = _es_desarrollador(current_user) or _es_gerencial_o_admin(
        sb, user_id, current_user
    )
    if not es_amplia:
        return [_usuario_export_info(sb, int(user_id))]

    cols = list_colaboradores_plan(sb, contrato_id) or []
    by_id: Dict[int, dict] = {}
    for c in cols:
        try:
            cid = int(c.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if cid > 0:
            by_id[cid] = c

    ids: List[int] = []
    if todos:
        # Todos = cada colaborador del contrato (también sin actividades).
        # Si el cliente manda IDs explícitos, se unen para no perder a nadie
        # cuando list_colaboradores_plan falle o venga incompleto.
        ids = list(by_id.keys())
        if colaborador_ids:
            for x in colaborador_ids:
                try:
                    xi = int(x)
                except (TypeError, ValueError):
                    continue
                if xi > 0 and xi not in ids:
                    ids.append(xi)
        if int(user_id) not in ids and int(user_id) > 0:
            ids.insert(0, int(user_id))
        if not ids:
            ids = [int(user_id)]
    elif colaborador_ids:
        ids = [int(x) for x in colaborador_ids if x is not None and int(x) > 0]
    elif colaborador_id is not None:
        ids = [int(colaborador_id)]
    else:
        ids = [int(user_id)]

    seen: Set[int] = set()
    out: List[Dict[str, str]] = []
    for i in ids:
        if i in seen or i <= 0:
            continue
        seen.add(i)
        info = _usuario_export_info(sb, i)
        c = by_id.get(i)
        if c:
            nm = (
                c.get("nombre_completo")
                or f"{c.get('nombre') or ''} {c.get('apellidos') or ''}".strip()
                or c.get("nombre")
            )
            if nm:
                info["nombre"] = str(nm).strip()
            if c.get("cargo_nombre"):
                info["cargo"] = str(c.get("cargo_nombre") or "").strip()
        out.append(info)
    return out or [_usuario_export_info(sb, int(user_id))]


def _apply_calidad_header(ws, *, n_cols: int, contrato: dict, colaborador: dict) -> int:
    """
    Encabezado de calidad (3 partes) + bloque contrato/colaborador.
    Retorna la primera fila libre para la grilla.
    """
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    fmt = PLAN_ACTIVIDADES_FORMATO
    fill_title = PatternFill("solid", fgColor="0F2942")
    font_title = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
    font_calidad = Font(name="Calibri", bold=True, size=9, color="FFFFFF")
    font_head = Font(name="Calibri", bold=True, size=9, color="0F2942")
    font_body = Font(name="Calibri", size=9, color="0F2942")
    thin = Border(
        left=Side(style="thin", color="94A3B8"),
        right=Side(style="thin", color="94A3B8"),
        top=Side(style="thin", color="94A3B8"),
        bottom=Side(style="thin", color="94A3B8"),
    )
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)

    n_cols = max(n_cols, 8)
    title_end = min(4, n_cols)
    right_start = min(5, n_cols)

    for c in range(1, n_cols + 1):
        cell = ws.cell(1, c, "")
        cell.fill = fill_title
        cell.border = thin
        cell.alignment = center

    if title_end >= 2:
        ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=title_end)
    if right_start <= n_cols and right_start > title_end:
        ws.merge_cells(start_row=1, start_column=right_start, end_row=1, end_column=n_cols)

    # Logo (imagen o fallback texto)
    logo_cell = ws.cell(1, 1)
    logo_cell.font = font_calidad
    logo_cell.alignment = center
    logo_ok = False
    logo_url = (contrato.get("logo_contratista") or "").strip()
    if logo_url:
        try:
            from main import _xlsx_fetch_image_bytes, _xlsx_fit_image_to_cell
            from openpyxl.drawing.image import Image as XLImage
            import io as _io

            raw = _xlsx_fetch_image_bytes(logo_url)
            if raw:
                img = XLImage(_io.BytesIO(raw))
                _xlsx_fit_image_to_cell(img, 48, 18)
                ws.add_image(img, "A1")
                logo_ok = True
        except Exception:
            logo_ok = False
    if not logo_ok:
        logo_cell.value = "ClaraCore"

    titulo = ws.cell(1, 2 if n_cols >= 2 else 1)
    titulo.value = fmt.get("nombre_mayus") or "PLAN DE ACTIVIDADES"
    titulo.font = font_title
    titulo.alignment = center

    if right_start <= n_cols:
        cal = ws.cell(1, right_start)
        cal.value = (
            f"{fmt.get('codigo') or 'CC-SEG-PLAN-001'}\n"
            f"Versión {fmt.get('version') or '1.0'}\n"
            f"Fecha {_now_bogota().strftime('%d/%m/%Y')}"
        )
        cal.font = font_calidad
        cal.alignment = center
    ws.row_dimensions[1].height = 52

    # Fila 2: contrato + descripción
    ws.cell(2, 1, "Contrato").font = font_head
    ws.cell(2, 1).border = thin
    ws.cell(2, 2, str(contrato.get("numero") or "—")).font = font_body
    ws.cell(2, 2).border = thin
    ws.cell(2, 3, "Descripción").font = font_head
    ws.cell(2, 3).border = thin
    if n_cols >= 4:
        ws.merge_cells(start_row=2, start_column=4, end_row=2, end_column=n_cols)
    desc = ws.cell(2, 4 if n_cols >= 4 else 3, str(contrato.get("objeto") or "—"))
    desc.font = font_body
    desc.alignment = left
    desc.border = thin
    for c in range(1, n_cols + 1):
        ws.cell(2, c).border = thin

    # Fila 3: colaborador + cargo
    ws.cell(3, 1, "Colaborador").font = font_head
    ws.cell(3, 1).border = thin
    ws.merge_cells(start_row=3, start_column=2, end_row=3, end_column=min(4, n_cols))
    ws.cell(3, 2, str(colaborador.get("nombre") or "—")).font = font_body
    ws.cell(3, 2).border = thin
    cargo_col = min(5, n_cols)
    ws.cell(3, cargo_col, "Cargo").font = font_head
    ws.cell(3, cargo_col).border = thin
    if n_cols >= cargo_col + 1:
        ws.merge_cells(start_row=3, start_column=cargo_col + 1, end_row=3, end_column=n_cols)
        ws.cell(3, cargo_col + 1, str(colaborador.get("cargo") or "—")).font = font_body
        ws.cell(3, cargo_col + 1).border = thin
    for c in range(1, n_cols + 1):
        ws.cell(3, c).border = thin

    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22

    # Fila 4 vacía de respiro
    return 5


def _write_plan_sheet(ws, items: List[dict], *, contrato: dict, colaborador: dict) -> None:
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    headers = list(_EXPORT_HEADERS)
    thin = Border(
        left=Side(style="thin", color="94A3B8"),
        right=Side(style="thin", color="94A3B8"),
        top=Side(style="thin", color="94A3B8"),
        bottom=Side(style="thin", color="94A3B8"),
    )
    header_fill = PatternFill("solid", fgColor="DDEFF8")
    group_fill = PatternFill("solid", fgColor="FDE68A")
    header_font = Font(name="Calibri", bold=True, color="0F2942", size=9)
    body_font = Font(name="Calibri", size=9, color="0F2942")
    bar_fill = PatternFill("solid", fgColor="38BDF8")
    bar_overlap = PatternFill("solid", fgColor="F97316")

    # Rango Gantt
    all_days: List[date] = []
    for it in items:
        for occ in it.get("ocurrencias") or []:
            a = _parse_date(occ.get("fecha_inicio"))
            b = _parse_date(occ.get("fecha_fin"))
            if a:
                all_days.append(a)
            if b:
                all_days.append(b)
    if all_days:
        d0, d1 = min(all_days), max(all_days)
    else:
        hoy = _now_bogota().date()
        d0, d1 = hoy, hoy + timedelta(days=14)

    gantt_start = len(headers) + 1
    day_cols: Dict[str, int] = {}
    col_i = gantt_start
    cur = d0
    while cur <= d1 and col_i < gantt_start + 120:
        day_cols[cur.isoformat()] = col_i
        col_i += 1
        cur += timedelta(days=1)
    total_cols = max(col_i - 1, len(headers), 8)

    header_row = _apply_calidad_header(
        ws, n_cols=total_cols, contrato=contrato, colaborador=colaborador
    )

    for col, h in enumerate(headers, 1):
        cell = ws.cell(header_row, col, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = thin
        cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")

    for iso, col in day_cols.items():
        d = date.fromisoformat(iso)
        cell = ws.cell(header_row, col, d.strftime("%d/%m"))
        cell.fill = header_fill
        cell.font = Font(name="Calibri", bold=True, size=8, color="0F2942")
        cell.border = thin
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(col)].width = 3.6

    ws.row_dimensions[header_row].height = 32

    # Solapes
    by_asig: Dict[int, List[Tuple[int, date, date]]] = {}
    for it in items:
        for a in it.get("asignaciones") or []:
            uid = int(a.get("usuario_id") or 0)
            if uid <= 0:
                continue
            for occ in it.get("ocurrencias") or []:
                a0 = _parse_date(occ.get("fecha_inicio"))
                a1 = _parse_date(occ.get("fecha_fin"))
                if a0 and a1:
                    by_asig.setdefault(uid, []).append((int(it["id"]), a0, a1))
    overlap_ids: Set[int] = set()
    for spans in by_asig.values():
        for i, (id1, a0, a1) in enumerate(spans):
            for id2, b0, b1 in spans[i + 1:]:
                if id1 != id2 and _intervalos_solapan(a0, a1, b0, b1):
                    overlap_ids.add(id1)
                    overlap_ids.add(id2)

    row_i = header_row + 1
    last_dep = None
    if not items:
        cell = ws.cell(row_i, 1, "Sin actividades en este plan.")
        cell.font = Font(name="Calibri", italic=True, size=9, color="64748B")
        for c in range(1, len(headers) + 1):
            ws.cell(row_i, c).border = thin
        row_i += 1
    else:
        for it in items:
            dep = it.get("grupo_nombre") or "Sin departamento"
            if dep != last_dep:
                # Banda de departamento (agrupa filas; no es columna de datos)
                ws.merge_cells(
                    start_row=row_i,
                    start_column=1,
                    end_row=row_i,
                    end_column=len(headers),
                )
                band = ws.cell(row_i, 1, dep)
                band.fill = group_fill
                band.font = Font(name="Calibri", bold=True, size=9, color="0F2942")
                band.alignment = Alignment(vertical="center", wrap_text=True)
                for c in range(1, gantt_start):
                    cell = ws.cell(row_i, c)
                    cell.fill = group_fill
                    cell.border = thin
                last_dep = dep
                row_i += 1

            vals = [
                it.get("titulo") or "",
                _strip_html(it.get("descripcion")),
                _strip_html(it.get("comentario_comite")),
                it.get("solicitante_nombre") or "",
                it.get("asignado_a_nombre") or "",
                it.get("prioridad") if it.get("prioridad") is not None else "",
                it.get("estado_gestion") or "",
                _fmt_fecha_co(it.get("fecha_inicio")),
                _fmt_fecha_co(it.get("fecha_fin")),
                it.get("periodicidad") or "ninguna",
            ]
            for col, v in enumerate(vals, 1):
                cell = ws.cell(row_i, col, v)
                cell.border = thin
                cell.font = body_font
                cell.alignment = Alignment(wrap_text=True, vertical="top")

            fill = bar_overlap if int(it.get("id") or 0) in overlap_ids else bar_fill
            for occ in it.get("ocurrencias") or []:
                a0 = _parse_date(occ.get("fecha_inicio"))
                a1 = _parse_date(occ.get("fecha_fin"))
                if not a0 or not a1:
                    continue
                d = a0
                while d <= a1:
                    col = day_cols.get(d.isoformat())
                    if col:
                        cell = ws.cell(row_i, col, "■")
                        cell.fill = fill
                        cell.alignment = Alignment(horizontal="center")
                        cell.border = thin
                    d += timedelta(days=1)
            row_i += 1

    widths = [28, 32, 28, 16, 18, 10, 12, 12, 12, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = f"A{header_row + 1}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = f"1:{header_row}"
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5


def exportar_xlsx(
    sb,
    contrato_id: int,
    user_id: int,
    current_user: dict,
    *,
    colaborador_id: Optional[int] = None,
    colaborador_ids: Optional[List[int]] = None,
    ver_todos: bool = False,
    todos: bool = False,
) -> Tuple[bytes, str]:
    """
    Excel institucional del Plan (una hoja por colaborador).
    Retorna (bytes, filename).
    """
    if not tiene_permiso_plan_actividades(current_user, "exportar", contrato_id):
        raise PermissionError("No tiene permiso para exportar el Plan de actividades.")

    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise RuntimeError("openpyxl no disponible para exportar") from exc

    # Compat: ver_todos sin selección explícita → todos (solo vista amplia)
    es_amplia = _es_desarrollador(current_user) or _es_gerencial_o_admin(
        sb, user_id, current_user
    )
    if es_amplia and ver_todos and not colaborador_ids and colaborador_id is None and not todos:
        todos = True

    targets = _targets_export(
        sb,
        contrato_id,
        user_id,
        current_user,
        colaborador_id=colaborador_id,
        colaborador_ids=colaborador_ids,
        todos=todos,
    )
    contrato = _contrato_meta_export(sb, contrato_id)

    wb = Workbook()
    # Quitar hoja por defecto; se recrean por colaborador
    default = wb.active
    wb.remove(default)

    used_titles: Set[str] = set()
    for target in targets:
        uid = int(target["id"])
        items = list_actividades(
            sb,
            contrato_id,
            user_id,
            current_user,
            colaborador_id=uid,
            incluir_cerrados=True,
            ver_todos=True,
        )
        ws = wb.create_sheet(
            _sheet_title_safe(target.get("nombre") or f"Usuario {uid}", used_titles)
        )
        _write_plan_sheet(ws, items, contrato=contrato, colaborador=target)

    if not wb.sheetnames:
        ws = wb.create_sheet("Plan")
        _write_plan_sheet(
            ws,
            [],
            contrato=contrato,
            colaborador=_usuario_export_info(sb, int(user_id)),
        )

    bio = __import__("io").BytesIO()
    wb.save(bio)
    codigo = str(PLAN_ACTIVIDADES_FORMATO.get("codigo") or "CC-SEG-PLAN-001").replace("/", "-")
    num = re.sub(r"[^\w\-]+", "_", str(contrato.get("numero") or contrato_id))[:40]
    fname = f"{codigo}_plan_actividades_{num}.xlsx"
    return bio.getvalue(), fname


def _strip_html(html: Optional[str]) -> str:
    if not html:
        return ""
    s = re.sub(r"<br\s*/?>", "\n", str(html), flags=re.I)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()
