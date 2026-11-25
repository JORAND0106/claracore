"""Exclusiones puntuales del *informe* de horas extras.

No modifican el cálculo de horas extra ni la Bitácora / asistencia.
Solo filtran filas al armar grilla, PDF y Word del informe HE.

Clave: (contrato_id, fecha ISO YYYY-MM-DD).
"""
from __future__ import annotations

from typing import Any, Optional

# Contrato 3 — 31/10/2026: asistencia en jornada ordinaria (07:30–16:30);
# no hubo tiempo extra. No debe figurar ni sumar en el informe HE.
EXCLUSIONES_INFORME_HE = frozenset({
    (3, "2026-10-31"),
})


def fecha_excluida_informe_he(
    contrato_id: Any,
    fecha: Any,
) -> bool:
    """True si esa fecha del contrato no debe aparecer en el informe HE."""
    try:
        cid = int(contrato_id)
    except (TypeError, ValueError):
        return False
    f = str(fecha or "").strip()[:10]
    if not f:
        return False
    return (cid, f) in EXCLUSIONES_INFORME_HE
