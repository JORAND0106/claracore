"""
Elección de acta RPO al revalidar un registro reversado.

Tras la reversión (doble llave / aceptar), el registro conserva su acta_rpo_id y
guarda una copia en acta_rpo_id_pre_reversion. Al aprobar de nuevo en un nivel
que asigna acta, si original ≠ vigente se exige elección explícita.
"""
from __future__ import annotations

from typing import Any, Optional, Tuple


def sicoe_acta_eleccion_requerida(
    *,
    acta_pre_reversion_id: Any,
    acta_vigente_id: Any,
) -> bool:
    """True si hay acta pre-reversión distinta de la vigente → hay que preguntar."""
    if acta_pre_reversion_id is None:
        return False
    if acta_vigente_id is None:
        return False
    try:
        return int(acta_pre_reversion_id) != int(acta_vigente_id)
    except (TypeError, ValueError):
        return str(acta_pre_reversion_id) != str(acta_vigente_id)


def sicoe_resolver_acta_elegida(
    *,
    eleccion: Optional[str],
    acta_original_id: Any,
    acta_vigente_id: Any,
) -> Tuple[Optional[int], Optional[str]]:
    """
    Resuelve el id de acta a asignar.

    Returns:
      (acta_id, error_code). error_code es None si ok.
      Códigos: 'eleccion_requerida', 'eleccion_invalida'.
    """
    if not sicoe_acta_eleccion_requerida(
        acta_pre_reversion_id=acta_original_id,
        acta_vigente_id=acta_vigente_id,
    ):
        # Misma acta o sin vigente: conservar original si existe, si no vigente.
        if acta_original_id is not None:
            try:
                return int(acta_original_id), None
            except (TypeError, ValueError):
                pass
        if acta_vigente_id is not None:
            try:
                return int(acta_vigente_id), None
            except (TypeError, ValueError):
                pass
        return None, None

    e = (eleccion or "").strip().lower()
    if e not in ("original", "vigente"):
        return None, "eleccion_requerida"
    chosen = acta_original_id if e == "original" else acta_vigente_id
    try:
        return int(chosen), None
    except (TypeError, ValueError):
        return None, "eleccion_invalida"


def sicoe_payload_desellar_con_acta_pre(
    base_desellar: dict,
    *,
    acta_rpo_id_actual: Any,
    acta_rpo_id_pre_reversion_actual: Any,
) -> dict:
    """
    Extiende el payload de desellar: conserva acta_rpo_id y, si aún no hay
    respaldo, guarda acta_rpo_id_pre_reversion = acta actual.
    No toca acta_rpo_id (el registro reversado conserva su acta).
    """
    out = dict(base_desellar)
    if acta_rpo_id_pre_reversion_actual is not None:
        return out
    if acta_rpo_id_actual is None:
        return out
    try:
        out["acta_rpo_id_pre_reversion"] = int(acta_rpo_id_actual)
    except (TypeError, ValueError):
        pass
    return out


def sicoe_formatear_acta_opcion(acta: Optional[dict]) -> Optional[dict]:
    """Resumen para UI/API: número RPO + periodo."""
    if not acta:
        return None
    try:
        aid = int(acta.get("id")) if acta.get("id") is not None else None
    except (TypeError, ValueError):
        aid = None
    return {
        "id": aid,
        "numero_rpo": acta.get("numero_rpo"),
        "fecha_inicio": (str(acta.get("fecha_inicio") or "")[:10] or None),
        "fecha_fin": (str(acta.get("fecha_fin") or "")[:10] or None),
        "label": _label_acta(acta),
    }


def _label_acta(acta: dict) -> str:
    num = acta.get("numero_rpo")
    fi = (str(acta.get("fecha_inicio") or "")[:10] or "")
    ff = (str(acta.get("fecha_fin") or "")[:10] or "")
    periodo = f"{fi} → {ff}" if fi or ff else ""
    if num is not None and periodo:
        return f"Acta RPO {num} ({periodo})"
    if num is not None:
        return f"Acta RPO {num}"
    if periodo:
        return f"Acta ({periodo})"
    return "Acta"
