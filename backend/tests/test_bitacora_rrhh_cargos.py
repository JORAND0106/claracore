"""Tests — catálogo de cargos RRHH expuesto a Bitácora."""
from __future__ import annotations

from bitacora_service import (
    es_etiqueta_administrativo_excluida,
    list_rrhh_cargos_para_bitacora,
)


def test_list_rrhh_cargos_para_bitacora_dedupe_y_orden(monkeypatch):
    rows = [
        {"id": 1, "categoria": "cargo", "valor": "Topógrafo", "activo": True},
        {"id": 2, "categoria": "cargo", "valor": "Ayudante", "activo": True},
        {"id": 3, "categoria": "cargo", "valor": "ayudante", "activo": True},
        {"id": 4, "categoria": "cargo", "valor": "  ", "activo": True},
        {"id": 5, "categoria": "cargo", "valor": "Oficial", "activo": True},
    ]

    def _fake_list_catalogo(_sb, _cid, _cat):
        return rows

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", _fake_list_catalogo)

    out = list_rrhh_cargos_para_bitacora(object(), 10)
    assert out == ["Ayudante", "Oficial", "Topógrafo"]


def test_list_rrhh_cargos_para_bitacora_excluye_administrativo(monkeypatch):
    rows = [
        {"id": 1, "categoria": "cargo", "valor": "Administrativo", "activo": True},
        {"id": 2, "categoria": "cargo", "valor": "administrativo", "activo": True},
        {"id": 3, "categoria": "cargo", "valor": "Residente Administrativo", "activo": True},
        {"id": 4, "categoria": "cargo", "valor": "Oficial", "activo": True},
    ]

    def _fake_list_catalogo(_sb, _cid, _cat):
        return rows

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", _fake_list_catalogo)

    out = list_rrhh_cargos_para_bitacora(object(), 10)
    assert out == ["Oficial", "Residente Administrativo"]
    assert not any(es_etiqueta_administrativo_excluida(c) for c in out)


def test_list_rrhh_cargos_para_bitacora_sin_rrhh_devuelve_vacio(monkeypatch):
    def _boom(*_a, **_k):
        raise RuntimeError("no db")

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", _boom)
    assert list_rrhh_cargos_para_bitacora(object(), 1) == []
