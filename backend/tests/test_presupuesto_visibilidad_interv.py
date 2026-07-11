"""Visibilidad presupuesto: Interventoría vs Contratista."""
from presupuesto_helpers import (
    _es_rol_interventoria_ppto,
    _presupuesto_aplica_filtro_interventoria,
    _presupuesto_q_visibilidad_interventoria,
)


def test_interventoria_filtra_listado():
    interv = {"rol_nombre": "Interventoría", "cargo_nombre": "Residente"}
    assert _presupuesto_aplica_filtro_interventoria(interv) is True


def test_contratista_no_filtra_listado():
    assert _presupuesto_aplica_filtro_interventoria({"rol_nombre": "Contratista"}) is False


def test_desarrollador_no_filtra_listado():
    assert _presupuesto_aplica_filtro_interventoria(
        {"rol_nombre": "Desarrollador", "cargo_nombre": "Desarrollador"}
    ) is False


def test_es_rol_interventoria_ppto():
    assert _es_rol_interventoria_ppto({"rol_nombre": "Interventoría"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Operativo Interventoría"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Interventoría Gerencial"}) is True
    assert _es_rol_interventoria_ppto({"rol_nombre": "Contratista"}) is False
    assert _es_rol_interventoria_ppto({"rol_nombre": "Desarrollador", "cargo_nombre": "Desarrollador"}) is False


class _QStub:
    def __init__(self):
        self.ops = []

    def eq(self, col, val):
        self.ops.append(("eq", col, val))
        return self


def test_visibilidad_interventoria_solo_aprobado():
    q = _QStub()
    out = _presupuesto_q_visibilidad_interventoria(q, {"rol_nombre": "Interventoría"})
    assert out.ops == [("eq", "pre_interv_estado", "Aprobado")]


def test_visibilidad_contratista_sin_filtro():
    q = _QStub()
    out = _presupuesto_q_visibilidad_interventoria(q, {"rol_nombre": "Contratista"})
    assert out.ops == []
