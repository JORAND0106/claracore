"""Tests — catálogo de cargos RRHH expuesto a Bitácora."""
from __future__ import annotations

from types import SimpleNamespace

from bitacora_service import CARGOS_PERSONAL_PLANTILLA, list_rrhh_cargos_para_bitacora


class _FakeSb:
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


def test_list_rrhh_cargos_incluye_obra_y_plantilla(monkeypatch):
    rows = [
        {"valor": "Topógrafo"},
        {"valor": "Ayudante"},
        {"valor": "ayudante"},
        {"valor": "  "},
        {"valor": "Oficial"},
        {"valor": "Gerente Administrativo"},  # sin trabajadores obra → no entra
    ]
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", lambda *_a, **_k: rows)
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: [])

    out = list_rrhh_cargos_para_bitacora(_FakeSb(), 10)
    assert "Gerente Administrativo" not in out
    assert "Oficial" in out
    assert "Ayudante" in out
    assert "Topógrafo" in out
    # Plantilla completa presente
    for c in CARGOS_PERSONAL_PLANTILLA:
        assert c in out


def test_list_rrhh_cargos_sin_rrhh_devuelve_vacio(monkeypatch):
    def _boom(*_a, **_k):
        raise RuntimeError("no db")

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", _boom)
    assert list_rrhh_cargos_para_bitacora(_FakeSb(), 1) == []
