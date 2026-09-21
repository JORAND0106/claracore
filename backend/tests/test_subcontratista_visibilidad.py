"""Tests de aislamiento usuario↔subcontratista y redacción económica."""
from __future__ import annotations

import pytest

from subcontratista_visibilidad import (
    apply_subcontratista_filter_q,
    es_cargo_subcontratista,
    ocultar_costo_directo_reportes,
    parse_subcontratista_id,
    redactar_filas_economicos_contrato,
    redactar_valores_economicos_contrato,
    resolver_filtro_subcontratista_solicitado,
    scope_from_user_dict,
    scope_subcontratista,
    usuario_ve_valores_economicos_contrato,
    validar_vinculo_subcontratista_en_contrato,
)


class _FakeQ:
    def __init__(self):
        self.calls = []

    def eq(self, col, val):
        self.calls.append((col, val))
        return self


def test_es_cargo_subcontratista():
    assert es_cargo_subcontratista("Subcontratista") is True
    assert es_cargo_subcontratista("  SUBCONTRATISTA ") is True
    assert es_cargo_subcontratista("Residente") is False
    assert es_cargo_subcontratista(None) is False


def test_scope_sin_cargo_sub():
    assert scope_subcontratista("Residente", 5) == (False, None)


def test_scope_sub_sin_vinculo():
    assert scope_subcontratista("subcontratista", None) == (True, None)
    assert scope_subcontratista("Subcontratista", "") == (True, None)


def test_scope_sub_con_vinculo():
    assert scope_subcontratista("subcontratista", 12) == (True, 12)
    assert scope_subcontratista("subcontratista", "7") == (True, 7)


def test_scope_from_user_dict():
    assert scope_from_user_dict({"cargo_nombre": "Subcontratista", "subcontratista_id": 3}) == (True, 3)
    assert scope_from_user_dict({"cargo_nombre": "Inspector"}) == (False, None)


def test_apply_filter_q():
    q = _FakeQ()
    apply_subcontratista_filter_q(q, False, None)
    assert q.calls == []
    q2 = _FakeQ()
    apply_subcontratista_filter_q(q2, True, None)
    assert q2.calls == [("subcontratista_id", -1)]
    q3 = _FakeQ()
    apply_subcontratista_filter_q(q3, True, 9)
    assert q3.calls == [("subcontratista_id", 9)]


def test_resolver_filtro_otro_sub_rechaza():
    with pytest.raises(ValueError):
        resolver_filtro_subcontratista_solicitado(True, 5, 99)
    assert resolver_filtro_subcontratista_solicitado(True, 5, 5) == 5
    assert resolver_filtro_subcontratista_solicitado(True, 5, None) == 5
    assert resolver_filtro_subcontratista_solicitado(False, None, 8) == 8
    assert resolver_filtro_subcontratista_solicitado(True, None, None) == -1


def test_redactar_economicos():
    row = {"item": "1.01", "vlr_unitario": 1000, "costo_directo": 5000, "cant_total": 2}
    out = redactar_valores_economicos_contrato(row)
    assert out["vlr_unitario"] is None
    assert out["costo_directo"] is None
    assert out["cant_total"] == 2
    assert row["vlr_unitario"] == 1000  # original intacto
    filas = redactar_filas_economicos_contrato([row])
    assert filas[0]["precio_unitario"] if False else filas[0]["costo_directo"] is None


def test_ve_economicos_contrato():
    assert usuario_ve_valores_economicos_contrato("Subcontratista") is False
    assert usuario_ve_valores_economicos_contrato("Residente", "operativo contratista") is False
    assert usuario_ve_valores_economicos_contrato("Residente", "contratista") is True


def test_ocultar_costo_sicoe():
    assert ocultar_costo_directo_reportes("Subcontratista", "subcontratista") is True
    assert ocultar_costo_directo_reportes("Inspector", "operativo interventoria") is True
    assert ocultar_costo_directo_reportes("Residente", "contratista") is False


def test_validar_vinculo():
    assert validar_vinculo_subcontratista_en_contrato(
        cargo_nombre="Residente",
        subcontratista_id=None,
        subcontratista_contrato_id=None,
        usuario_contrato_id=1,
    ) is None
    err = validar_vinculo_subcontratista_en_contrato(
        cargo_nombre="Subcontratista",
        subcontratista_id=None,
        subcontratista_contrato_id=None,
        usuario_contrato_id=1,
    )
    assert err and "requiere" in err.lower()
    err2 = validar_vinculo_subcontratista_en_contrato(
        cargo_nombre="Subcontratista",
        subcontratista_id=9,
        subcontratista_contrato_id=2,
        usuario_contrato_id=1,
    )
    assert err2 and "no pertenece" in err2.lower()
    assert (
        validar_vinculo_subcontratista_en_contrato(
            cargo_nombre="Subcontratista",
            subcontratista_id=9,
            subcontratista_contrato_id=1,
            usuario_contrato_id=1,
        )
        is None
    )


def test_parse_subcontratista_id():
    assert parse_subcontratista_id(0) is None
    assert parse_subcontratista_id(-3) is None
    assert parse_subcontratista_id("12") == 12
