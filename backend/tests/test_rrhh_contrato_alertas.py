"""Tests — alertas ciclo de vida contrato laboral RRHH."""
from __future__ import annotations

from datetime import date, timedelta

from rrhh_contrato_alertas_service import (
    clasificar_alerta_periodo_prueba,
    clasificar_alerta_vencimiento,
    es_contrato_termino_fijo,
    fecha_fin_periodo_prueba,
)


def test_es_termino_fijo():
    assert es_contrato_termino_fijo("Término fijo") is True
    assert es_contrato_termino_fijo("Contrato a término fijo") is True
    assert es_contrato_termino_fijo("Término indefinido") is False
    assert es_contrato_termino_fijo("Obra o labor") is False
    assert es_contrato_termino_fijo("") is False


def test_alerta_35_dias():
    hoy = date(2026, 9, 17)
    fin = hoy + timedelta(days=35)
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término fijo",
        fecha_fin=fin.isoformat(),
        hoy=hoy,
    ) == "vencimiento_35"
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término fijo",
        fecha_fin=fin.isoformat(),
        hoy=hoy,
        alerta_35_enviada_at="2026-09-01T00:00:00Z",
    ) is None


def test_alerta_10_requiere_alerta_35_sin_renovacion():
    hoy = date(2026, 9, 17)
    fin = hoy + timedelta(days=10)
    # Sin alerta 35 previa → emitir 35 primero
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término fijo",
        fecha_fin=fin.isoformat(),
        hoy=hoy,
    ) == "vencimiento_35"
    # Con alerta 35 y sin renovación → 10
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término fijo",
        fecha_fin=fin.isoformat(),
        hoy=hoy,
        alerta_35_enviada_at="2026-08-20T00:00:00Z",
        hubo_renovacion_tras_alerta_35=False,
    ) == "vencimiento_10"
    # Con renovación → nada
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término fijo",
        fecha_fin=fin.isoformat(),
        hoy=hoy,
        alerta_35_enviada_at="2026-08-20T00:00:00Z",
        hubo_renovacion_tras_alerta_35=True,
    ) is None


def test_no_alerta_indefinido():
    hoy = date(2026, 9, 17)
    assert clasificar_alerta_vencimiento(
        tipo_contrato="Término indefinido",
        fecha_fin=(hoy + timedelta(days=5)).isoformat(),
        hoy=hoy,
    ) is None


def test_periodo_prueba_5_dias():
    hoy = date(2026, 9, 17)
    ingreso = hoy - timedelta(days=55)
    assert fecha_fin_periodo_prueba(ingreso.isoformat(), 60) == hoy + timedelta(days=5)
    assert clasificar_alerta_periodo_prueba(
        fecha_ingreso=ingreso.isoformat(),
        periodo_prueba_dias=60,
        hoy=hoy,
    ) is True
    assert clasificar_alerta_periodo_prueba(
        fecha_ingreso=ingreso.isoformat(),
        periodo_prueba_dias=60,
        hoy=hoy,
        alerta_enviada_at="2026-09-16T00:00:00Z",
    ) is False
