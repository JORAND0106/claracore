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
    import rrhh_service as rrhh_mod

    trabs = [
        {"id": 1, "cargo_aspira": "Topógrafo", "email": "a@x.com"},
        {"id": 2, "cargo_aspira": "Ayudante", "email": "b@x.com"},
        {"id": 3, "cargo_aspira": "Oficial", "email": "c@x.com"},
        {"id": 4, "cargo_aspira": "Gerente Administrativo", "email": "d@x.com"},
    ]
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabs)

    out = list_rrhh_cargos_para_bitacora(_FakeSb(), 10)
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

    monkeypatch.setattr(rrhh_mod, "list_trabajadores", _boom)
    assert list_rrhh_cargos_para_bitacora(_FakeSb(), 1) == []


def test_list_catalogo_cargo_no_dispara_ensure(monkeypatch):
    """Hot path de listado no debe reescribir cargos (latencia)."""
    import rrhh_service as rrhh_mod

    calls = {"ensure": 0}

    def _ensure(*_a, **_k):
        calls["ensure"] += 1
        return {"catalogo_actualizados": 0, "trabajadores_actualizados": 0}

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    class _Sb:
        def table(self, *_a, **_k):
            return _Q()

    monkeypatch.setattr(rrhh_mod, "ensure_cargos_nombre_propio", _ensure)
    monkeypatch.setattr(rrhh_mod, "ensure_catalogo_defaults", lambda *_a, **_k: None)
    rrhh_mod.list_catalogo(_Sb(), 1, "cargo")
    assert calls["ensure"] == 0
