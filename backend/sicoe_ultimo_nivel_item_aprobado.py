"""
Último nivel de validación SicoeObra: solo aprueba cantidades cuyo ítem
esté Aprobado en el Listado de Precios.

Regla forward-only: no toca registros ya sellados/aprobados en el nivel máximo.
Aplica únicamente cuando el nivel que se está aprobando es el máximo activo
del contrato (si cambia la configuración, sigue el nuevo máximo).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

ESTADO_PRECIO_APROBADO = "Aprobado"
ESTADO_PRECIO_PENDIENTE = "Pendiente"
ESTADO_PRECIO_RECHAZADO = "Rechazado"
ESTADO_PRECIO_NO_REVISADO = "No revisado"

ESTADOS_PRECIO_BLOQUEAN_ULTIMO_NIVEL = frozenset(
    {
        ESTADO_PRECIO_PENDIENTE,
        ESTADO_PRECIO_RECHAZADO,
        ESTADO_PRECIO_NO_REVISADO,
    }
)


def normalizar_estado_precio(raw: Any) -> str:
    """Normaliza ``estado_precio`` del Listado a etiqueta canónica de la regla."""
    if raw is None:
        return ESTADO_PRECIO_NO_REVISADO
    s = str(raw).strip()
    if not s:
        return ESTADO_PRECIO_NO_REVISADO
    low = s.lower()
    if low == "aprobado":
        return ESTADO_PRECIO_APROBADO
    if low == "pendiente":
        return ESTADO_PRECIO_PENDIENTE
    if low == "rechazado":
        return ESTADO_PRECIO_RECHAZADO
    if "no revis" in low:
        return ESTADO_PRECIO_NO_REVISADO
    return s


def item_estado_permite_aprobacion_ultimo_nivel(estado_norm: Any) -> bool:
    return normalizar_estado_precio(estado_norm) == ESTADO_PRECIO_APROBADO


def es_aprobacion_en_nivel_maximo(nivel: Any, nivel_maximo: Any, estado: Any) -> bool:
    """True si la acción es aprobar y el nivel coincide con el máximo activo."""
    if str(estado or "").strip() != ESTADO_PRECIO_APROBADO:
        return False
    try:
        return int(nivel) == int(nivel_maximo)
    except (TypeError, ValueError):
        return False


def mensaje_bloqueo_ultimo_nivel(item_numero: Any, estado_norm: Any) -> str:
    item = str(item_numero or "").strip() or "(sin ítem)"
    est = normalizar_estado_precio(estado_norm)
    return (
        f"No se puede aprobar en el último nivel de validación: "
        f"el ítem {item} está en estado «{est}» en el Listado de Precios. "
        f"Solo se aprueban cantidades cuyo ítem esté Aprobado."
    )


def detalle_omitido_item(
    registro_id: Any,
    item_numero: Any,
    estado_norm: Any,
) -> Dict[str, Any]:
    return {
        "registro_id": registro_id,
        "item_numero": str(item_numero or "").strip(),
        "estado_precio": normalizar_estado_precio(estado_norm),
    }


def alerta_omitidos_item_no_aprobado(
    omitidos: Sequence[Mapping[str, Any]],
    *,
    max_items: int = 12,
) -> str:
    """Mensaje breve para aprobación masiva parcial."""
    n = len(omitidos)
    if n <= 0:
        return ""
    # Agrupar por ítem + estado para no repetir.
    seen: Dict[Tuple[str, str], int] = {}
    order: List[Tuple[str, str]] = []
    for o in omitidos:
        item = str(o.get("item_numero") or "").strip() or "(sin ítem)"
        est = normalizar_estado_precio(o.get("estado_precio"))
        key = (item, est)
        if key not in seen:
            seen[key] = 0
            order.append(key)
        seen[key] += 1
    partes: List[str] = []
    for item, est in order[:max_items]:
        cnt = seen[(item, est)]
        if cnt > 1:
            partes.append(f"{item} ×{cnt} («{est}»)")
        else:
            partes.append(f"{item} («{est}»)")
    extra = len(order) - max_items
    if extra > 0:
        partes.append(f"y {extra} ítem(s) más")
    lista = ", ".join(partes)
    return (
        f"{n} registro(s) no se aprobaron en el último nivel porque su ítem "
        f"no está Aprobado en el Listado de Precios: {lista}."
    )


def resolver_estado_precio_en_indice(
    listado_idx: Optional[Mapping[Tuple[str, str], Mapping[str, Any]]],
    capitulo: Any,
    item_numero: Any,
    *,
    norm_cap: Callable[[Any], str],
    norm_item: Callable[[Any], str],
) -> str:
    """
    Busca estado_precio en índice (cap_norm, item_norm) → fila listado.
    Sin coincidencia o sin índice → No revisado (no se puede aprobar).
    """
    if not listado_idx:
        return ESTADO_PRECIO_NO_REVISADO
    ik = norm_item(item_numero)
    if not ik:
        return ESTADO_PRECIO_NO_REVISADO
    ck = norm_cap(capitulo)
    row = listado_idx.get((ck, ik))
    if row is None and ck:
        # Fallback: misma clave de ítem con capítulo vacío (listados legacy).
        row = listado_idx.get(("", ik))
    if not row:
        return ESTADO_PRECIO_NO_REVISADO
    return normalizar_estado_precio(row.get("estado_precio"))
