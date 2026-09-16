"""
Regla canónica — Costo Directo aprobado en el nivel máximo de validación SICOE.

Una sola definición compartida por Dashboard (KPI / CapFin cobrado), Panel
«Validación por rol» (fila Aprobado · nivel máx.) y conciliaciones RPO/CCD.

Predicado (registro cuenta como aprobado nivel máx.):
  1. Ítem asignado (item_numero no vacío).
  2. Todos los niveles activos estrictamente inferiores al máximo en «Aprobado».
  3. Nivel máximo activo del contrato en «Aprobado».

Dinero:
  SUM(costo_directo) por línea, con fallback round(cantidad_total × vlr_unitario, 0)
  si costo_directo es nulo. Sin AIU/IVA, sin filtro bloqueado / solicitud_reversion,
  sin semana. El alcance por acta_rpo_id lo aplica el consumidor.

NO usar:
  - SUM(costo_directo) sin prerrequisitos ni exigir ítem (sobreestima / mezcla basura).
  - cant×listado_precios.VU sin prerrequisitos (Dashboard histórico).
  - cant×MAX(vlr_unitario) por ítem (RPC matriz histórico) — diverge del CD por línea.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence


CRITERIO_COSTO_APROBADO_NIVEL_MAX = (
    "Ítem asignado + prerrequisitos de niveles activos inferiores en Aprobado + "
    "nivel máximo activo en Aprobado; dinero = SUM(costo_directo) por línea "
    "(fallback cant×vlr). Sin filtro bloqueado/reversión/semana."
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


def costo_directo_linea(reg: Optional[Dict[str, Any]]) -> float:
    """Costo directo de una línea so_registros (columna o fallback cant×VU)."""
    if not reg:
        return 0.0
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
) -> float:
    """Σ costo_directo de registros que cumplen la regla canónica."""
    total = 0.0
    for reg in regs or []:
        if registro_aprobado_nivel_max(
            reg, niveles_activos, campo_nivel_max=campo_nivel_max
        ):
            total += costo_directo_linea(reg)
    return float(round(total, 0))
