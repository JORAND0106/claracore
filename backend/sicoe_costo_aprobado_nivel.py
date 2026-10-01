"""
Regla canónica — Costo/valor aprobado en el nivel máximo de validación SICOE.

Una sola definición compartida por Dashboard (KPI / CapFin cobrado), Panel
«Validación por rol» (fila Aprobado · nivel máx.), análisis y conciliaciones.

Predicado (registro cuenta como aprobado nivel máx.):
  1. Ítem asignado (item_numero no vacío).
  2. Todos los niveles activos estrictamente inferiores al máximo en «Aprobado».
  3. Nivel máximo activo del contrato en «Aprobado».

Dinero (regla única, misma que Informes PDF/Excel):
  Por (capítulo, ítem): cant = ROUND(Σ cantidad_total, 2);
  valor = ROUND(cant × VU_listado(mismo cap+ítem), 0);
  total = Σ valores por ítem.
  Nunca SUM(costo_directo) almacenado ni VU de otro capítulo.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence

from sicoe_valor_canonico import (
    CapItemKey,
    sum_valor_canonico,
    valor_cant_vu,
    valor_linea_canonico,
    vu_listado_para_registro,
)


CRITERIO_COSTO_APROBADO_NIVEL_MAX = (
    "Ítem asignado + prerrequisitos de niveles activos inferiores en Aprobado + "
    "nivel máximo activo en Aprobado; dinero = Σ ROUND0(ROUND(Σcant,2)×VU_listado "
    "por cap+ítem). Sin filtro bloqueado/reversión/semana."
)


def _norm_estado(v: Any) -> str:
    if v is None:
        return "No Revisado"
    s = str(v).strip()
    if not s:
        return "No Revisado"
    low = s.lower()
    if low == "aprobado":
        return "Aprobado"
    if low == "pendiente":
        return "Pendiente"
    if low == "rechazado":
        return "Rechazado"
    if "no revis" in low:
        return "No Revisado"
    return s


def niveles_activos_norm(niveles_activos: Optional[Sequence[int]]) -> List[int]:
    out = sorted({int(x) for x in (niveles_activos or []) if 1 <= int(x) <= 6})
    return out or [1, 2, 3]


def campo_nivel_maximo(niveles_activos: Optional[Sequence[int]]) -> str:
    na = niveles_activos_norm(niveles_activos)
    return f"nivel{max(na)}_estado"


def registro_aprobado_nivel_max(
    reg: Optional[Dict[str, Any]],
    niveles_activos: Optional[Sequence[int]] = None,
    *,
    campo_nivel_max: Optional[str] = None,
) -> bool:
    """True si el registro está plenamente aprobado en el nivel máximo (con cascada)."""
    if not reg:
        return False
    if not str(reg.get("item_numero") or "").strip():
        return False
    na = niveles_activos_norm(niveles_activos)
    campo = campo_nivel_max or campo_nivel_maximo(na)
    max_n = max(na)
    for n in na:
        if n >= max_n:
            continue
        if _norm_estado(reg.get(f"nivel{n}_estado")) != "Aprobado":
            return False
    return _norm_estado(reg.get(campo)) == "Aprobado"


def costo_directo_linea(
    reg: Optional[Dict[str, Any]],
    listado_idx: Optional[Dict[CapItemKey, dict]] = None,
) -> float:
    """
    Valor de una línea según regla única (cant×VU listado).

    Si ``listado_idx`` está presente, usa VU del listado (cap+ítem).
    Si no hay cruce, retorna 0 (no usa costo_directo guardado como total canónico).
    Sin ``listado_idx`` (compat tests legacy): fallback a CD guardado / cant×vu stamp.
    """
    if not reg:
        return 0.0
    if listado_idx is not None:
        return valor_linea_canonico(reg, listado_idx)
    raw = reg.get("costo_directo")
    if raw is not None and str(raw).strip() != "":
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    try:
        cant = float(reg.get("cantidad_total") or 0)
    except (TypeError, ValueError):
        cant = 0.0
    try:
        vlr = float(reg.get("vlr_unitario") or 0)
    except (TypeError, ValueError):
        vlr = 0.0
    return float(round(cant * vlr, 0))


def sum_costo_aprobado_nivel_max(
    regs: Iterable[Dict[str, Any]],
    niveles_activos: Optional[Sequence[int]] = None,
    *,
    campo_nivel_max: Optional[str] = None,
    listado_idx: Optional[Dict[CapItemKey, dict]] = None,
) -> float:
    """
    Total canónico de registros aprobados nivel máx.

    Con ``listado_idx``: Σ ROUND0(ROUND(Σcant,2)×VU) por (cap, ítem).
    Sin listado (tests unitarios legacy): Σ costo_directo_linea (CD guardado).
    """
    filtered = [
        reg
        for reg in (regs or [])
        if registro_aprobado_nivel_max(
            reg, niveles_activos, campo_nivel_max=campo_nivel_max
        )
    ]
    if listado_idx is not None:
        return sum_valor_canonico(filtered, listado_idx)
    total = 0.0
    for reg in filtered:
        total += costo_directo_linea(reg, None)
    return float(round(total, 0))


def valor_linea_con_listado(
    reg: Optional[Dict[str, Any]],
    listado_idx: Optional[Dict[CapItemKey, dict]],
) -> float:
    """Alias explícito para callers que siempre deben usar listado."""
    return valor_linea_canonico(reg, listado_idx)


__all__ = [
    "CRITERIO_COSTO_APROBADO_NIVEL_MAX",
    "campo_nivel_maximo",
    "costo_directo_linea",
    "niveles_activos_norm",
    "registro_aprobado_nivel_max",
    "sum_costo_aprobado_nivel_max",
    "valor_cant_vu",
    "valor_linea_con_listado",
    "vu_listado_para_registro",
]
