"""Tests — catálogo de cargos RRHH expuesto a Bitácora."""
from __future__ import annotations

from types import SimpleNamespace

from bitacora_service import list_rrhh_cargos_para_bitacora


class _FakeSb:
    """SB mínimo: sin usuarios admin → no exclusiones por rol."""

    def table(self, name: str):
        store = {"roles": [], "usuarios": [], "usuario_contratos": []}

        class Q:
            def select(self, *_a, **_k):
                return self

            def eq(self, *_a, **_k):
                return self

            def in_(self, *_a, **_k):
                return self

            def execute(self):
                return SimpleNamespace(data=list(store.get(name) or []))

        return Q()


def test_list_rrhh_cargos_para_bitacora_dedupe_y_orden(monkeypatch):
    rows = [
        {"id": 1, "categoria": "cargo", "valor": "Topógrafo", "activo": True},
        {"id": 2, "categoria": "cargo", "valor": "Ayudante", "activo": True},
        {"id": 3, "categoria": "cargo", "valor": "ayudante", "activo": True},
        {"id": 4, "categoria": "cargo", "valor": "  ", "activo": True},
        {"id": 5, "categoria": "cargo", "valor": "Oficial", "activo": True},
    ]

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", lambda *_a, **_k: rows)
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: [])

    out = list_rrhh_cargos_para_bitacora(_FakeSb(), 10)
    assert out == ["Ayudante", "Oficial", "Topógrafo"]


def test_list_rrhh_cargos_para_bitacora_excluye_etiqueta_exacta_administrativo(monkeypatch):
    rows = [
        {"id": 1, "categoria": "cargo", "valor": "Administrativo", "activo": True},
        {"id": 2, "categoria": "cargo", "valor": "Residente Administrativo", "activo": True},
        {"id": 3, "categoria": "cargo", "valor": "Oficial", "activo": True},
    ]
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", lambda *_a, **_k: rows)
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: [])

    out = list_rrhh_cargos_para_bitacora(_FakeSb(), 10)
    assert out == ["Oficial", "Residente Administrativo"]


def test_list_rrhh_cargos_para_bitacora_sin_rrhh_devuelve_vacio(monkeypatch):
    def _boom(*_a, **_k):
        raise RuntimeError("no db")

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", _boom)
    assert list_rrhh_cargos_para_bitacora(_FakeSb(), 1) == []
