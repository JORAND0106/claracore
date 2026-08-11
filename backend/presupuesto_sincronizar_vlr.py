"""
Sincroniza vlr_unitario del presupuesto (vivo y version_items) con listado_precios vigente.
Solo invocado desde endpoint exclusivo de Desarrollador.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from presupuesto_helpers import (
    _presupuesto_q_estructura,
    _presupuesto_q_filtro_infraestructura_via_pk_ids,
    _presupuesto_q_filtros_ubicacion,
)

PAGE = 1000
_TIPO_EJEC_DEFAULT = "Presupuesto de Obra"
_TIPOS_EJEC_VALIDOS = ("Presupuesto de Obra", "Obra Ejecutada")


def _norm_item_key(val: Any) -> str:
    """Alinea presupuesto.item ↔ listado_precios.item_numero (p. ej. '4.22.' → '4.22')."""
    if val is None:
        return ""
    t = str(val).strip()
    if not t:
        return ""
    return re.sub(r"\.+$", "", t)


def _resolve_tipo_ejecucion(tipo_ejecucion: Optional[str]) -> str:
    t = (tipo_ejecucion or "").strip()
    if t in _TIPOS_EJEC_VALIDOS:
        return t
    return _TIPO_EJEC_DEFAULT


def _aplicar_filtros_listado(
    q,
    filtros: Optional[Dict[str, Any]] = None,
):
    """Mismos filtros que GET /presupuesto/{contrato_id} (_q_base)."""
    f = filtros or {}
    dado_de_baja = f.get("dado_de_baja")
    papelera = bool(f.get("papelera"))
    if dado_de_baja is not None:
        q = q.eq("dado_de_baja", dado_de_baja)
    elif papelera:
        q = q.eq("dado_de_baja", True)
    else:
        q = q.eq("dado_de_baja", False)

    q = q.eq("tipo_ejecucion", _resolve_tipo_ejecucion(f.get("tipo_ejecucion")))
    q = _presupuesto_q_estructura(
        q,
        capitulo=f.get("capitulo"),
        capitulos=f.get("capitulos"),
        item=f.get("item"),
        items=f.get("items"),
        tramo=f.get("tramo"),
        tramos=f.get("tramos"),
        calzada=f.get("calzada"),
        calzadas=f.get("calzadas"),
        competencia=f.get("competencia"),
        competencias=f.get("competencias"),
        und=f.get("und"),
        unds=f.get("unds"),
    )
    q = _presupuesto_q_filtro_infraestructura_via_pk_ids(
        q,
        supabase,
        int(contrato_id),
        single=f.get("infraestructura"),
        multi=f.get("infraestructuras"),
    )
    q = _presupuesto_q_filtros_ubicacion(
        q,
        nodo_inicio=f.get("nodo_inicio"),
        nodo_final=f.get("nodo_final"),
        buscar=f.get("buscar"),
        id_pol=f.get("id_pol"),
        pk_criterio=f.get("pk_criterio"),
        texto=f.get("texto"),
        abs_desde=f.get("abs_desde"),
        abs_hasta=f.get("abs_hasta"),
        revisado=f.get("revisado"),
        pre_interv_estado=f.get("pre_interv_estado"),
        competencia=f.get("competencia"),
        und=f.get("und"),
        sellado=f.get("sellado"),
        vlr_unitario_desde=f.get("vlr_unitario_desde"),
        vlr_unitario_hasta=f.get("vlr_unitario_hasta"),
        cant_total_desde=f.get("cant_total_desde"),
        cant_total_hasta=f.get("cant_total_hasta"),
        costo_directo_desde=f.get("costo_directo_desde"),
        costo_directo_hasta=f.get("costo_directo_hasta"),
    )
    return q


def _build_listado_vlr_por_item(sb, contrato_id: int) -> Dict[str, float]:
    """Índice item normalizado → precio_unitario vigente del contrato."""
    idx: Dict[str, float] = {}
    offset = 0
    while True:
        batch = (
            sb.table("listado_precios")
            .select("item_numero, precio_unitario")
            .eq("contrato_id", contrato_id)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for row in batch:
            ik = _norm_item_key(row.get("item_numero"))
            pu = row.get("precio_unitario")
            if not ik or pu is None:
                continue
            try:
                idx[ik] = float(pu)
            except (TypeError, ValueError):
                continue
        if len(batch) < PAGE:
            break
        offset += PAGE
    return idx


def _aplicar_sync_tabla(
    sb,
    tabla: str,
    contrato_id: int,
    listado_idx: Dict[str, float],
    filtros: Optional[Dict[str, Any]] = None,
) -> int:
    """Actualiza filas que coinciden con filtros (incluye sellados)."""
    if not listado_idx:
        return 0
    actualizados = 0
    offset = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    while True:
        q = sb.table(tabla).select("id, item, cant_total, vlr_unitario, costo_directo")
        q = q.eq("contrato_id", contrato_id)
        q = _aplicar_filtros_listado(q, filtros)
        batch = q.order("id").range(offset, offset + PAGE - 1).execute().data or []
        for row in batch:
            ik = _norm_item_key(row.get("item"))
            if not ik:
                continue
            new_vlr = listado_idx.get(ik)
            if new_vlr is None:
                continue
            cant = float(row.get("cant_total") or 0)
            new_costo = round(cant * new_vlr, 0)
            try:
                old_vlr = float(row.get("vlr_unitario") or 0)
                old_costo = float(row.get("costo_directo") or 0)
            except (TypeError, ValueError):
                old_vlr = 0.0
                old_costo = 0.0
            if old_vlr == new_vlr and old_costo == new_costo:
                continue
            sb.table(tabla).update(
                {
                    "vlr_unitario": new_vlr,
                    "costo_directo": new_costo,
                    "updated_at": now_iso,
                }
            ).eq("id", row["id"]).execute()
            actualizados += 1
        if len(batch) < PAGE:
            break
        offset += PAGE
    return actualizados


def sincronizar_vlr_unitario_contrato(
    sb,
    contrato_id: int,
    filtros: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """
    Sincroniza presupuesto vivo y bibliotecas de versión del contrato.
    Con filtros: mismo alcance que GET /presupuesto/{contrato_id}.
    Sin filtros (dict vacío o solo tipo_ejecucion): todo el contrato activo.
    """
    listado_idx = _build_listado_vlr_por_item(sb, contrato_id)
    ppto_n = _aplicar_sync_tabla(sb, "presupuesto", contrato_id, listado_idx, filtros)
    ver_n = _aplicar_sync_tabla(sb, "presupuesto_version_items", contrato_id, listado_idx, filtros)
    return {
        "presupuesto_actualizados": ppto_n,
        "presupuesto_version_items_actualizados": ver_n,
        "listado_items": len(listado_idx),
    }
