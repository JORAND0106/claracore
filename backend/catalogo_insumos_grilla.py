"""
Proyección de la grilla del catálogo de insumos.

La grilla lee la vista `v_catalogo_insumo_grilla` (o, si aún no está creada,
las mismas columnas escalares de `almacen_insumo`). No incluye cotizaciones,
adjuntos ni historial, y no recalcula el negociado.
"""
from __future__ import annotations

from typing import Any, Dict


VISTA_GRILLA = "v_catalogo_insumo_grilla"

# Columnas de la vista. Ninguna es el JSON de cotizaciones ni un blob.
GRILLA_VISTA_SELECT = (
    "id, codigo, descripcion, unidad, rendimiento, proveedor_id, proveedor_nombre, "
    "tipo_impuesto, impuesto_porcentaje, tributos, cantidad_negociada, "
    "cotizacion_numero, cotizacion_fecha, costo_base, valor_compra_referencia"
)

# Respaldo sobre la tabla, sin cotizaciones_detalle ni soportes.
GRILLA_TABLA_SELECT = (
    "id, codigo, descripcion, unidad, rendimiento, proveedor_id, "
    "tipo_impuesto, impuesto_porcentaje, tributos, cantidad_negociada, "
    "cotizacion_numero, cotizacion_fecha, costo_base, valor_compra_referencia"
)

GRILLA_PAGE_MAX = 100


def vista_grilla_ausente(exc: BaseException) -> bool:
    """PostgREST aún no tiene la vista en el schema cache."""
    msg = str(exc).lower()
    return (
        VISTA_GRILLA in msg
        or "pgrst205" in msg
        or "schema cache" in msg
        or "could not find the table" in msg
    )


def fila_grilla_catalogo(row: dict, proveedor_nombre: str = "") -> dict:
    """Una fila de grilla. Ignora cualquier campo que no sea de las 11 columnas."""
    nombre = (proveedor_nombre or row.get("proveedor_nombre") or "").strip() or "—"
    costo = row.get("costo_base")
    total = row.get("valor_compra_referencia")
    tributos = row.get("tributos")
    if not isinstance(tributos, (dict, list)):
        tributos = {}
    fecha = row.get("cotizacion_fecha") or ""
    if fecha:
        fecha = str(fecha)[:10]
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
        "cotizacion_fecha": fecha,
        "costo": costo,
        "costo_base": costo,
        "costo_total": total,
        "valor_compra_referencia": total,
        "origen": VISTA_GRILLA,
    }


def proyectar_grilla_catalogo(rows: list, proveedores: Dict[int, str] | None = None) -> list:
    provs = proveedores or {}
    out = []
    for row in rows or []:
        pid = row.get("proveedor_id")
        nombre = row.get("proveedor_nombre") or ""
        if pid not in (None, "") and not str(nombre).strip():
            try:
                nombre = provs.get(int(pid)) or ""
            except (TypeError, ValueError):
                nombre = ""
        out.append(fila_grilla_catalogo(row, nombre))
    return out


def fila_sin_detalle(fila: dict) -> bool:
    """El payload de grilla no arrastra detalle ni archivos."""
    prohibidos = (
        "cotizaciones_detalle",
        "soporte_pdf_blob_path",
        "soporte_pdf_nombre",
        "consumo_negociado",
        "historial",
    )
    return not any(k in fila for k in prohibidos)


def clamp_grilla_limit(limit: Any) -> int:
    try:
        n = int(limit)
    except (TypeError, ValueError):
        n = 50
    return max(1, min(n, GRILLA_PAGE_MAX))
