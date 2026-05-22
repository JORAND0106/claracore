"""Tests Fase 3B — motor de comparación (sin Supabase)."""
from datetime import date

from prog_obra_compare import (
    _alerta_fechas,
    _label_fechas,
    _pct_desviacion,
    classify_tipo_cambio,
)


def test_classify_atrasado():
    b = {"fecha_fin": date(2026, 6, 1)}
    t = {"fecha_fin": date(2026, 6, 15)}
    assert classify_tipo_cambio(b, t, 14, 0) == "atrasado"


def test_classify_adelantado():
    b = {"fecha_fin": date(2026, 6, 15)}
    t = {"fecha_fin": date(2026, 6, 1)}
    assert classify_tipo_cambio(b, t, -14, 0) == "adelantado"


def test_classify_duracion_sin_mover_fin():
    b = {"fecha_fin": date(2026, 6, 15)}
    t = {"fecha_fin": date(2026, 6, 15)}
    assert classify_tipo_cambio(b, t, 0, 3) == "duracion"


def test_classify_nuevo_eliminado():
    assert classify_tipo_cambio(None, {"x": 1}, None, None) == "nuevo"
    assert classify_tipo_cambio({"x": 1}, None, None, None) == "eliminado"


def test_classify_sin_cambio():
    b = {"fecha_fin": date(2026, 6, 15)}
    t = {"fecha_fin": date(2026, 6, 15)}
    assert classify_tipo_cambio(b, t, 0, 0) == "sin_cambio"


def test_pct_desviacion():
    assert _pct_desviacion(15, 180) == 8.3


def test_alerta_fechas_por_pct():
    assert _alerta_fechas(15, 12.0, 10.0, 180) is True


def test_alerta_fechas_por_dias_equivalentes():
    # 10% de 100 días = 10 días umbral
    assert _alerta_fechas(10, 5.0, 10.0, 100) is True


def test_label_fechas():
    assert _label_fechas(15, 8.3) == "+15 días · 8.3% de desviación"
    assert _label_fechas(-5, 2.1) == "-5 días · 2.1% de desviación"
