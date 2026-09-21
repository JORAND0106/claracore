"""Tests — SMMLV, dedicación y redacción salarial RRHH."""
from rrhh_service import (
    aplica_salario_minimo,
    es_dedicacion_parcial,
    es_prestacion_servicios,
    redactar_salario_trabajador,
    validar_salario_minimo,
)


def test_prestacion_servicios_detecta_variantes():
    assert es_prestacion_servicios("Prestación de servicios")
    assert es_prestacion_servicios("PRESTACION DE SERVICIOS")
    assert not es_prestacion_servicios("Término fijo")


def test_dedicacion_parcial():
    assert es_dedicacion_parcial("parcial")
    assert es_dedicacion_parcial("tiempo_parcial")
    assert not es_dedicacion_parcial("tiempo_completo")


def test_aplica_salario_minimo_excepcion_prestacion_parcial():
    assert aplica_salario_minimo(
        tipo_contrato="Prestación de servicios",
        dedicacion="parcial",
    ) is False
    assert aplica_salario_minimo(
        tipo_contrato="Prestación de servicios",
        dedicacion="tiempo_completo",
    ) is True
    assert aplica_salario_minimo(
        tipo_contrato="Término indefinido",
        dedicacion="parcial",
    ) is True


def test_validar_salario_minimo_rechaza_bajo_smmlv(monkeypatch):
    monkeypatch.setattr("rrhh_service._smmlv_vigente", lambda anio=None: 1_750_000.0)
    try:
        validar_salario_minimo(
            1_000_000,
            tipo_contrato="Término fijo",
            dedicacion="tiempo_completo",
        )
        assert False, "debía lanzar ValueError"
    except ValueError as exc:
        assert "mínimo" in str(exc).lower() or "minimo" in str(exc).lower()


def test_validar_salario_minimo_permite_prestacion_parcial(monkeypatch):
    monkeypatch.setattr("rrhh_service._smmlv_vigente", lambda anio=None: 1_750_000.0)
    validar_salario_minimo(
        800_000,
        tipo_contrato="Prestación de servicios",
        dedicacion="parcial",
    )


def test_redactar_salario_trabajador():
    row = {"id": 1, "nombres": "Ana", "salario": 2_000_000, "salario_liquidable": True}
    out = redactar_salario_trabajador(row)
    assert out["salario"] is None
    assert out["salario_liquidable"] is None
    assert out["nombres"] == "Ana"
    assert row["salario"] == 2_000_000  # no muta original
