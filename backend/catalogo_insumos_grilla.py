"""
Proyección liviana de la grilla del catálogo de insumos.

Solo las columnas que se muestran. El detalle (cotizaciones, adjuntos, historial)
no viaja en este payload: se pide al abrir el insumo.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


GRILLA_INSUMO_SELECT = (
    "id, codigo, descripcion, unidad, rendimiento, proveedor_id, "
    "tipo_impuesto, impuesto_porcentaje, tributos, "
    "cantidad_negociada, cotizacion_numero, cotizacion_fecha, "
    "costo_base, valor_compra_referencia"
)


def _as_list(raw: Any) -> List[dict]:
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def ganadora_display_desde_detalle(detalle: Any) -> dict:
    """Número, fecha, valor base y proveedor de la cotización ganadora, sin el resto del detalle."""
    rows = _as_list(detalle)
    gan = None
    for item in rows:
        tipo = str(item.get("tipo") or "insumo").strip().lower()
        if tipo != "insumo":
            continue
        if item.get("es_ganadora"):
            gan = item
            break
        if gan is None:
            gan = item
    if not gan:
        return {}
    fecha = gan.get("fecha") or ""
    if fecha:
        fecha = str(fecha)[:10]
    valor = gan.get("valor")
    return {
        "cotizacion_numero": (gan.get("numero") or "").strip(),
        "cotizacion_fecha": fecha,
        "costo_base": valor,
        "proveedor_nombre": (gan.get("proveedor") or "").strip(),
    }


def fila_grilla_catalogo(row: dict, proveedor_nombre: str = "—") -> dict:
    """Una fila de grilla. No incluye cotizaciones_detalle, soportes ni historial."""
    nombre = (proveedor_nombre or "").strip() or "—"
    costo = row.get("costo_base")
    total = row.get("valor_compra_referencia")
    tributos = row.get("tributos") if isinstance(row.get("tributos"), (dict, list)) else (row.get("tributos") or {})
    return {
        "id": row.get("id"),
        "insumo_id": row.get("id"),
        "proveedor_id": row.get("proveedor_id"),
        "proveedor_nombre": nombre,
        "codigo": row.get("codigo") or "",
        "descripcion": row.get("descripcion") or "",
        "unidad": row.get("unidad") or "",
        "rendimiento": row.get("rendimiento"),
        "tipo_impuesto": row.get("tipo_impuesto"),
        "impuesto_porcentaje": row.get("impuesto_porcentaje"),
        "tributos": tributos,
        "cantidad_negociada": row.get("cantidad_negociada"),
        "cotizacion_numero": row.get("cotizacion_numero") or "",
        "cotizacion_fecha": row.get("cotizacion_fecha") or "",
        "costo": costo,
        "costo_base": costo,
        "costo_total": total,
        "valor_compra_referencia": total,
        "origen": "almacen_insumo_grilla",
    }


def completar_fila_grilla_desde_detalle(fila: dict, detalle: Any) -> dict:
    """Rellena columnas vacías con la ganadora. El detalle no se adjunta a la fila."""
    info = ganadora_display_desde_detalle(detalle)
    if not info:
        return fila
    out = dict(fila)
    if not str(out.get("cotizacion_numero") or "").strip() and info.get("cotizacion_numero"):
        out["cotizacion_numero"] = info["cotizacion_numero"]
    if not out.get("cotizacion_fecha") and info.get("cotizacion_fecha"):
        out["cotizacion_fecha"] = info["cotizacion_fecha"]
    if out.get("proveedor_nombre") in (None, "", "—") and info.get("proveedor_nombre"):
        out["proveedor_nombre"] = info["proveedor_nombre"]
    if out.get("costo") in (None, "") and info.get("costo_base") not in (None, ""):
        out["costo"] = info["costo_base"]
        out["costo_base"] = info["costo_base"]
    return out


def fila_grilla_incompleta(fila: dict) -> bool:
    """Hace falta mirar el detalle solo si faltan proveedor o datos de la cotización visible."""
    sin_prov = fila.get("proveedor_id") in (None, "") and fila.get("proveedor_nombre") in (None, "", "—")
    sin_cot = not str(fila.get("cotizacion_numero") or "").strip() and not fila.get("cotizacion_fecha")
    sin_valor = fila.get("costo_total") in (None, "") and fila.get("costo") in (None, "")
    return bool(sin_prov or sin_cot or sin_valor)


def proyectar_grilla_catalogo(
    rows: List[dict],
    proveedores: Optional[Dict[int, str]] = None,
    detalles_por_id: Optional[Dict[int, Any]] = None,
) -> List[dict]:
    """Proyecta un lote. `detalles_por_id` solo se consulta para filas incompletas y no se copia al resultado."""
    provs = proveedores or {}
    detalles = detalles_por_id or {}
    out = []
    for row in rows or []:
        pid = row.get("proveedor_id")
        nombre = "—"
        if pid not in (None, ""):
            try:
                nombre = provs.get(int(pid)) or "—"
            except (TypeError, ValueError):
                nombre = "—"
        fila = fila_grilla_catalogo(row, nombre)
        if fila_grilla_incompleta(fila):
            iid = fila.get("id")
            try:
                key = int(iid) if iid is not None else None
            except (TypeError, ValueError):
                key = None
            if key is not None and key in detalles:
                fila = completar_fila_grilla_desde_detalle(fila, detalles[key])
        out.append(fila)
    return out
