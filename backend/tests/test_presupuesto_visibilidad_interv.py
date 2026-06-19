"""Visibilidad presupuesto: Interventoría vs Contratista."""
from presupuesto_helpers import (
    _es_rol_interventoria_ppto,
    _presupuesto_aplica_filtro_interventoria,
)


def test_interventoria_no_filtra_listado():
    interv = {"rol_nombre": "Interventoría", "cargo_nombre": "Residente"}
    assert _presupuesto_aplica_filtro_interventoria(interv) is False


def test_es_rol_interventoria_ppto():
    assert _es_rol_interventoria_ppto({"rol_nombre": "Interventoría"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Operativo Interventoría"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Interventoría Gerencial"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Contratista"}) is False
    assert _es_rol_interventoria_ppto({"rol_nombre": "Desarrollador", "cargo_nombre": "Desarrollador"}) is False
