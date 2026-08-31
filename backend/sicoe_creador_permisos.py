"""
Permiso mixto Crear (dims) vs Editar (financieros/clasificación) — helpers puros.
Sin dependencias de FastAPI/Supabase para tests unitarios.
"""
from __future__ import annotations
from typing import Any, Optional

# Campos dimensionales / localización: el creador con permiso Crear puede editarlos
# hasta el sellado del último nivel (sin permiso Editar).
SICOE_CAMPOS_DIMENSIONALES = frozenset({
    "longitud", "ancho", "espesor", "cantidad", "cantidad_total", "observacion",
    "abs_inicio", "abs_final", "nodo_ini", "nodo_fin", "margen",
    "pk_id_id", "civ", "tramo", "infraestructura", "calzada", "ubicacion",
    "coord_lat", "coord_lng",
})
# Campos financieros / clasificación: solo permiso Editar.
SICOE_CAMPOS_FINANCIEROS = frozenset({
    "capitulo", "competencia", "item_numero", "item_descripcion", "unidad",
    "vlr_unitario", "costo_directo", "acta_rpo_id", "semana_id", "item_listado_id",
})
# Identidad de fila que el cliente suele reenviar en PUT (sin cambio efectivo).
SICOE_CAMPOS_IDENTIDAD_PUT = frozenset({
    "reporte_id", "numero_registro", "contrato_id", "nombre", "descripcion",
})
# Meta/media: siguen las reglas de sellado existentes (editar).
SICOE_CAMPOS_META_MEDIA = frozenset({
    "corte_id", "subcontratista_id",
    "foto_url", "foto_numero", "foto_descripcion",
    "grafico_url", "grafico_numero", "grafico_descripcion", "graficos_historial",
})
# Clasificación + corte/sub: bloqueados para permiso solo Crear (creador dimensional).
SICOE_CAMPOS_BLOQUEADOS_SOLO_CREAR = SICOE_CAMPOS_FINANCIEROS | frozenset({
    "corte_id", "subcontratista_id",
})


def sicoe_valores_put_equivalentes(a: Any, b: Any) -> bool:
    """True si el cliente reenvía el mismo valor efectivo (evita 403 por eco de campos)."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        sa = "" if a is None else str(a).strip()
        sb = "" if b is None else str(b).strip()
        return sa == sb
    try:
        if isinstance(a, (int, float)) or isinstance(b, (int, float)):
            return float(a) == float(b)
    except (TypeError, ValueError):
        pass
    return str(a).strip() == str(b).strip()


def sicoe_put_keys_prohibidas_creador_dims(
    client_keys: set,
    data: dict,
    prev_row: dict,
) -> set:
    """
    Claves que un usuario solo-Crear (dims del propio registro) no puede modificar.
    Ignora eco sin cambio de identidad / financieros / meta (mismo valor que prev).
    Mutates `data` al descartar ecos.
    """
    keys = set(client_keys)
    for ik in list(keys & (SICOE_CAMPOS_IDENTIDAD_PUT | SICOE_CAMPOS_BLOQUEADOS_SOLO_CREAR)):
        if sicoe_valores_put_equivalentes(data.get(ik), prev_row.get(ik)):
            keys.discard(ik)
            data.pop(ik, None)
    return keys - SICOE_CAMPOS_DIMENSIONALES
