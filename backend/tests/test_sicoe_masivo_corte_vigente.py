"""Validación: corte vigente + payload masivo sin columna inexistente updated_at."""

from datetime import date
from typing import Any, Dict, Optional


def elegir_corte_vigente(cortes, hoy: date):
    today_s = hoy.isoformat()
    vigentes = [
        c
        for c in (cortes or [])
        if str(c.get("fecha_inicio") or "")[:10] <= today_s
        and str(c.get("fecha_fin") or "")[:10] >= today_s
    ]
    if not vigentes:
        return None
    return sorted(vigentes, key=lambda c: int(c.get("consecutivo") or 0), reverse=True)[0]


def sicoe_patch_masivo_corte(
    sub_id: int,
    corte_id: int,
    uid: Optional[int],
) -> Dict[str, Any]:
    """Espejo de _sicoe_patch_masivo_corte en main.py (test puro sin FastAPI)."""
    patch: Dict[str, Any] = {
        "subcontratista_id": int(sub_id),
        "corte_id": int(corte_id),
    }
    if uid is not None:
        patch["modificado_por_reg"] = int(uid)
    return patch


def test_solo_corte_abierto():
    hoy = date(2026, 8, 15)
    cortes = [
        {"id": 1, "consecutivo": 1, "fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-15"},
        {"id": 3, "consecutivo": 3, "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31"},
    ]
    v = elegir_corte_vigente(cortes, hoy)
    assert v["id"] == 3
    # Rechazo de corte cerrado
    assert elegir_corte_vigente(cortes[:1], hoy) is None


def test_patch_masivo_corte_sin_updated_at():
    """so_registros no tiene updated_at (PGRST204); trazabilidad vía modificado_por_reg."""
    p = sicoe_patch_masivo_corte(10, 77, 42)
    assert p == {
        "subcontratista_id": 10,
        "corte_id": 77,
        "modificado_por_reg": 42,
    }
    assert "updated_at" not in p


def test_patch_masivo_corte_sin_uid():
    p = sicoe_patch_masivo_corte(10, 77, None)
    assert p == {"subcontratista_id": 10, "corte_id": 77}
    assert "modificado_por_reg" not in p
    assert "updated_at" not in p
