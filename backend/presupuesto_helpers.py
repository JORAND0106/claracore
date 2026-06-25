"""Helpers de consulta/filtro de presupuesto (sin dependencia de main.py)."""
from __future__ import annotations

import unicodedata
from typing import List, Optional

from fastapi import HTTPException


def _norm_rol_presupuesto(txt: Optional[str]) -> str:
    s = unicodedata.normalize("NFD", (txt or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _so_reg_filtro_abs_solape(q, abs_inicio: Optional[float], abs_final: Optional[float]):
    """Abscisa en línea: solape del tramo [abs_inicio, abs_final] del registro con el rango filtrado."""
    if abs_inicio is None and abs_final is None:
        return q
    q = q.not_.is_("abs_inicio", "null").not_.is_("abs_final", "null")
    if abs_inicio is not None:
        q = q.gte("abs_final", abs_inicio)
    if abs_final is not None:
        q = q.lte("abs_inicio", abs_final)
    return q


def presupuesto_oficial_version_id(sb, contrato_id) -> Optional[str]:
    """ID de la última versión SELLADA y vigente (es_vigente_aprobada) del contrato.

    Devuelve None si aún no hay versión sellada (o si la columna no existe todavía,
    p. ej. antes de aplicar la migración): los consumidores hacen fallback al
    presupuesto vivo, preservando el comportamiento actual sin regresión.
    """
    try:
        rows = (
            sb.table("presupuesto_versiones")
            .select("id")
            .eq("contrato_id", int(contrato_id))
            .eq("es_vigente_aprobada", True)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    return str(rows[0]["id"]) if rows else None


def _es_rol_interventoria_ppto(current_user) -> bool:
    """Perfiles Interventoría (validar, sellar versión, etc.)."""
    rol = _norm_rol_presupuesto(current_user.get("rol_nombre"))
    if rol in ("administrador", "desarrollador"):
        return False
    cargo = _norm_rol_presupuesto(current_user.get("cargo_nombre"))
    if cargo == "desarrollador":
        return False
    if rol in ("interventoria", "operativo interventoria"):
        return True
    if "intervent" in rol and "gerencial" in rol:
        return True
    return False


def _presupuesto_aplica_filtro_interventoria(current_user) -> bool:
    """Filtro de listados por depuración contratista (pre_interv_estado).

    Devuelve siempre False: Interventoría ve las mismas cantidades que Contratista.
    La restricción operativa queda en validación (_pre_interv_liberado / bulk-estado),
    no ocultando filas en grilla, panel, conteo ni exportación.
    """
    return False


PRESUPUESTO_ESTADOS_VALIDACION = ("No Revisado", "Aprobado", "Pendiente", "Rechazado")


def presupuesto_estados_validacion_opciones(extra=None) -> List[str]:
    """Lista fija para filtros UI; incluye los 4 estados aunque no existan aún en BD."""
    canon = list(PRESUPUESTO_ESTADOS_VALIDACION)
    seen = set(canon)
    for x in extra or ():
        s = str(x).strip()
        if s and s not in seen:
            seen.add(s)
            canon.append(s)
    return canon


def _presupuesto_q_in_str_field(q, col: str, single: Optional[str], multi: Optional[List[str]] = None, *, max_items: int = 200):
    """Un valor (eq) o varios (.in_) para filtros multi-selección."""
    vals = [str(x).strip() for x in (multi or []) if str(x).strip()]
    if not vals and single and str(single).strip():
        vals = [str(single).strip()]
    if not vals:
        return q
    if len(vals) > max_items:
        raise HTTPException(status_code=422, detail=f"Máximo {max_items} valores en filtro {col}")
    if len(vals) == 1:
        return q.eq(col, vals[0])
    return q.in_(col, vals)


def _presupuesto_q_estructura(
    q,
    *,
    capitulo: Optional[str] = None,
    capitulos: Optional[List[str]] = None,
    item: Optional[str] = None,
    items: Optional[List[str]] = None,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    calzada: Optional[str] = None,
    calzadas: Optional[List[str]] = None,
    competencia: Optional[str] = None,
    competencias: Optional[List[str]] = None,
    und: Optional[str] = None,
    unds: Optional[List[str]] = None,
):
    q = _presupuesto_q_in_str_field(q, "capitulo", capitulo, capitulos)
    q = _presupuesto_q_in_str_field(q, "item", item, items)
    q = _presupuesto_q_in_str_field(q, "tramo", tramo, tramos)
    q = _presupuesto_q_in_str_field(q, "calzada", calzada, calzadas)
    q = _presupuesto_q_in_str_field(q, "competencia", competencia, competencias)
    q = _presupuesto_q_in_str_field(q, "und", und, unds)
    return q


def _presupuesto_q_rango_numerico(q, col: str, desde: Optional[float], hasta: Optional[float]):
    if desde is not None:
        q = q.gte(col, desde)
    if hasta is not None:
        q = q.lte(col, hasta)
    return q


def _presupuesto_q_filtros_ubicacion(
    q,
    nodo_inicio: Optional[str] = None,
    nodo_final: Optional[str] = None,
    buscar: Optional[str] = None,
    id_pol: Optional[str] = None,
    pk_criterio: Optional[str] = None,
    texto: Optional[str] = None,
    abs_desde: Optional[float] = None,
    abs_hasta: Optional[float] = None,
    revisado: Optional[str] = None,
    pre_interv_estado: Optional[str] = None,
    competencia: Optional[str] = None,
    und: Optional[str] = None,
    sellado: Optional[bool] = None,
    vlr_unitario_desde: Optional[float] = None,
    vlr_unitario_hasta: Optional[float] = None,
    cant_total_desde: Optional[float] = None,
    cant_total_hasta: Optional[float] = None,
    costo_directo_desde: Optional[float] = None,
    costo_directo_hasta: Optional[float] = None,
):
    """Filtros opcionales para GET /presupuesto (alineable con criterios tipo SICOE / dashboard)."""
    if nodo_inicio and str(nodo_inicio).strip():
        q = q.ilike("no_inicio", f"%{str(nodo_inicio).strip()}%")
    if nodo_final and str(nodo_final).strip():
        q = q.ilike("no_final", f"%{str(nodo_final).strip()}%")
    has_split = (id_pol and str(id_pol).strip()) or (pk_criterio and str(pk_criterio).strip()) or (texto and str(texto).strip())
    if not has_split and buscar and str(buscar).strip():
        b = str(buscar).strip()
        pat = f"%{b}%"
        # Legacy: un solo cuadro busca en cuatro columnas
        q = q.or_(f"id_pol.ilike.{pat},pk_id.ilike.{pat},descripcion.ilike.{pat},observacion.ilike.{pat}")
    else:
        if id_pol and str(id_pol).strip():
            q = q.ilike("id_pol", f"%{str(id_pol).strip()}%")
        if pk_criterio and str(pk_criterio).strip():
            q = q.ilike("pk_id", f"%{str(pk_criterio).strip()}%")
        if texto and str(texto).strip():
            t = f"%{str(texto).strip()}%"
            q = q.or_(f"descripcion.ilike.{t},id_pol.ilike.{t},pk_id.ilike.{t},observacion.ilike.{t}")
    if competencia and str(competencia).strip():
        q = q.eq("competencia", str(competencia).strip())
    if und and str(und).strip():
        q = q.eq("und", str(und).strip())
    if sellado is not None:
        q = q.eq("sellado", bool(sellado))
    if revisado and str(revisado).strip():
        rv = str(revisado).strip()
        # UI trata NULL como «No Revisado»; eq solo no coincide con filas sin valor.
        if rv.lower() in ("no revisado", "no revisados"):
            q = q.or_('revisado.is.null,revisado.eq."No Revisado"')
        else:
            q = q.eq("revisado", rv)
    if pre_interv_estado and str(pre_interv_estado).strip():
        pe = str(pre_interv_estado).strip()
        if str(pe).strip().lower() in ("no revisado", "—", "-"):
            q = q.is_("pre_interv_estado", "null")
        else:
            q = q.eq("pre_interv_estado", pe)
    q = _so_reg_filtro_abs_solape(q, abs_desde, abs_hasta)
    q = _presupuesto_q_rango_numerico(q, "vlr_unitario", vlr_unitario_desde, vlr_unitario_hasta)
    q = _presupuesto_q_rango_numerico(q, "cant_total", cant_total_desde, cant_total_hasta)
    q = _presupuesto_q_rango_numerico(q, "costo_directo", costo_directo_desde, costo_directo_hasta)
    return q
