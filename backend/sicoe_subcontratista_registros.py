"""
Visibilidad de registros SicoeObra para cargo subcontratista + precios propios.

- Solo líneas de su subcontratista_id (con fallback a cabecera del reporte).
- Solo líneas con nivel2_objeto_pago_sub verdadero (no ve «no objeto de pago»).
- Economía: anula VU/costo del contrato y aplica precios pactados del sub.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from subcontratista_visibilidad import (
    parse_subcontratista_id,
    redactar_valores_economicos_contrato,
)


def _truthy_objeto_pago(val: Any) -> bool:
    if val is True:
        return True
    if val is False or val is None:
        return False
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return int(val) == 1
    s = str(val).strip().lower()
    return s in ("1", "true", "t", "yes", "si", "sí")


def subcontratista_id_efectivo(
    registro: Optional[dict],
    reporte: Optional[dict] = None,
) -> Optional[int]:
    """Prioriza subcontratista_id del registro; si falta, el de la cabecera."""
    if isinstance(registro, dict):
        sid = parse_subcontratista_id(registro.get("subcontratista_id"))
        if sid is not None:
            return sid
    if isinstance(reporte, dict):
        return parse_subcontratista_id(reporte.get("subcontratista_id"))
    return None


def registro_pertenece_a_sub(
    registro: Optional[dict],
    sub_id: Any,
    reporte: Optional[dict] = None,
) -> bool:
    forced = parse_subcontratista_id(sub_id)
    if forced is None or not isinstance(registro, dict):
        return False
    eff = subcontratista_id_efectivo(registro, reporte)
    return eff is not None and int(eff) == int(forced)


def registro_visible_para_sub(
    registro: Optional[dict],
    sub_id: Any,
    reporte: Optional[dict] = None,
) -> bool:
    """Pertenece al sub y es objeto de pago (pendientes de validar incluidos)."""
    if not registro_pertenece_a_sub(registro, sub_id, reporte):
        return False
    return _truthy_objeto_pago((registro or {}).get("nivel2_objeto_pago_sub"))


def filtrar_registros_para_sub(
    registros: Optional[Iterable[dict]],
    sub_id: Any,
    reporte: Optional[dict] = None,
) -> List[dict]:
    out: List[dict] = []
    for r in registros or []:
        if registro_visible_para_sub(r, sub_id, reporte):
            out.append(r)
    return out


def _cantidad_linea(reg: dict) -> Any:
    if reg.get("cantidad_total") is not None and str(reg.get("cantidad_total")).strip() != "":
        return reg.get("cantidad_total")
    return reg.get("cantidad")


def aplicar_precios_propios_sub_a_registros(
    registros: Sequence[dict],
    *,
    vu_por_item: Optional[Dict[str, float]] = None,
    vu_por_cap_item: Optional[Dict[Tuple[str, str], float]] = None,
) -> List[dict]:
    """
    Redacta economía del contrato y coloca VU/costo del subcontratista.
    Si no hay precio pactado, vlr/costo quedan en null (no se inventa el del contrato).
    """
    from corte_sub_conciliacion import resolver_vu_costo_mo_item, valor_por_cantidad_vu

    out: List[dict] = []
    for raw in registros or []:
        row = redactar_valores_economicos_contrato(raw)
        vu = resolver_vu_costo_mo_item(
            item_numero=row.get("item_numero"),
            capitulo=row.get("capitulo"),
            vu_por_item=vu_por_item or {},
            vu_por_cap_item=vu_por_cap_item or {},
        )
        if vu > 0:
            row["vlr_unitario"] = vu
            row["precio_unitario"] = vu
            row["vlr_unitario_sub"] = vu
            row["costo_directo"] = valor_por_cantidad_vu(_cantidad_linea(row), vu)
            row["precio_fuente"] = "subcontratista_precios"
            row["sin_precio"] = False
        else:
            row["vlr_unitario"] = None
            row["precio_unitario"] = None
            row["vlr_unitario_sub"] = None
            row["costo_directo"] = None
            row["precio_fuente"] = None
            row["sin_precio"] = True
        out.append(row)
    return out
