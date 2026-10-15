"""Tests — avance documental 4 grupos para grilla RRHH."""
from __future__ import annotations

from unittest.mock import MagicMock

from rrhh_docs_fill import (
    _fill_for_trabajador,
    attach_docs_fill,
    empty_docs_fill,
)


def test_empty_docs_fill():
    e = empty_docs_fill()
    assert set(e.keys()) == {"contrato", "soporte", "ingreso", "afiliacion"}
    assert e["contrato"]["ratio"] == 0.0


def test_fill_parcial_soporte_e_ingreso():
    trab = {"id": 1, "doc_validacion_estado": "pendiente", "eps": "Sura"}
    docs = [
        ("soporte", "cedula"),
        ("soporte", "hoja_vida"),
        ("ingreso", "induccion"),
        ("afiliacion", "cert_eps"),
        ("soporte", "ext_diploma"),
    ]
    custom = {"soporte": {"ext_diploma"}, "ingreso": set()}
    fill = _fill_for_trabajador(trab, docs, tiene_contrato=True, custom=custom)
    assert fill["contrato"] == {"filled": 1, "total": 1, "ratio": 1.0}
    # soporte builtin 3 + ext_diploma = 4; filled cedula+hv+diploma = 3
    assert fill["soporte"]["total"] == 4
    assert fill["soporte"]["filled"] == 3
    # ingreso: 3 builtin, 1 filled
    assert fill["ingreso"]["total"] == 3
    assert fill["ingreso"]["filled"] == 1
    # afiliacion: solo EPS aplica
    assert fill["afiliacion"]["total"] == 1
    assert fill["afiliacion"]["filled"] == 1


def test_aprobado_llena_todo():
    trab = {"id": 2, "doc_validacion_estado": "aprobado"}
    fill = _fill_for_trabajador(trab, [], tiene_contrato=False, custom={"soporte": set(), "ingreso": set()})
    for g in ("contrato", "soporte", "ingreso", "afiliacion"):
        assert fill[g]["ratio"] == 1.0


def test_attach_docs_fill_batch(monkeypatch):
    items = [
        {"id": 10, "doc_validacion_estado": "pendiente", "eps": ""},
        {"id": 11, "doc_validacion_estado": "aprobado"},
    ]
    sb = MagicMock()

    def fake_custom(_sb, _cid):
        return {"soporte": set(), "ingreso": set()}

    def fake_docs(_sb, _cid, ids):
        return {
            10: [("soporte", "cedula"), ("soporte", "hoja_vida"), ("soporte", "certificados")],
            11: [],
        }

    def fake_contratos(_sb, _cid, ids):
        return {10}

    monkeypatch.setattr("rrhh_docs_fill._custom_tipos_por_categoria", fake_custom)
    monkeypatch.setattr("rrhh_docs_fill._fetch_docs_batch", fake_docs)
    monkeypatch.setattr("rrhh_docs_fill._fetch_contratos_batch", fake_contratos)

    out = attach_docs_fill(sb, 1, items)
    assert out[0]["docs_fill"]["contrato"]["ratio"] == 1.0
    assert out[0]["docs_fill"]["soporte"]["ratio"] == 1.0
    assert out[1]["docs_fill"]["soporte"]["ratio"] == 1.0  # aprobado
