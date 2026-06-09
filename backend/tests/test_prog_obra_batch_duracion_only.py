"""Clasificación batch tramo: duración sin fecha vs borrado."""
from __future__ import annotations

from prog_obra_service import (
    _actividad_batch_es_borrado,
    _actividad_batch_es_solo_duracion,
)


def test_solo_duracion_no_es_borrado():
    it = {
        "fecha_inicio": None,
        "duracion_dias_habiles": 12,
        "solo_duracion": True,
    }
    assert _actividad_batch_es_solo_duracion(it) is True
    assert _actividad_batch_es_borrado(it) is False


def test_fila_vacia_es_borrado():
    it = {"fecha_inicio": None, "duracion_dias_habiles": None}
    assert _actividad_batch_es_borrado(it) is True
    assert _actividad_batch_es_solo_duracion(it) is False


def test_clear_schedule_es_borrado():
    it = {
        "clear_schedule": True,
        "fecha_inicio": None,
        "duracion_dias_habiles": 10,
    }
    assert _actividad_batch_es_borrado(it) is True
    assert _actividad_batch_es_solo_duracion(it) is False


def test_fecha_y_duracion_no_es_solo_duracion():
    it = {"fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10}
    assert _actividad_batch_es_solo_duracion(it) is False
    assert _actividad_batch_es_borrado(it) is False
