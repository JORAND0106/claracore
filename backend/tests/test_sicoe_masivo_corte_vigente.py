"""Validación de contrato: solo corte vigente en asignación masiva (lógica pura)."""

from datetime import date


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
