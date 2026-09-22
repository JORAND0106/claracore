"""Tests — normalización de cargos a formato Nombre Propio."""
from __future__ import annotations

from types import SimpleNamespace

import rrhh_service as rrhh


def test_normalizar_cargo_mayusculas_y_minusculas():
    assert rrhh.normalizar_cargo_nombre_propio("OPERARIO VOLQUETA") == "Operario Volqueta"
    assert rrhh.normalizar_cargo_nombre_propio("auxiliar de tráfico") == "Auxiliar de Tráfico"
    assert rrhh.normalizar_cargo_nombre_propio("AUXILIAR DE TRÁFICO") == "Auxiliar de Tráfico"


def test_normalizar_cargo_idempotente_ya_formateado():
    assert rrhh.normalizar_cargo_nombre_propio("Auxiliar de Tráfico") == "Auxiliar de Tráfico"
    assert rrhh.normalizar_cargo_nombre_propio("Oficial") == "Oficial"
    assert rrhh.normalizar_cargo_nombre_propio("Insp. SST") == "Insp. SST"
    assert rrhh.normalizar_cargo_nombre_propio("Ing. SST") == "Ing. SST"


def test_normalizar_cargo_siglas_y_particulas():
    assert rrhh.normalizar_cargo_nombre_propio("INSP. SST") == "Insp. SST"
    assert rrhh.normalizar_cargo_nombre_propio("inspector sst") == "Inspector SST"
    assert rrhh.normalizar_cargo_nombre_propio("QA inspector") == "QA Inspector"
    assert rrhh.normalizar_cargo_nombre_propio("oficial de obra") == "Oficial de Obra"
    assert rrhh.normalizar_cargo_nombre_propio("Maestro de obra") == "Maestro de Obra"


def test_normalizar_cargo_vacio_y_espacios():
    assert rrhh.normalizar_cargo_nombre_propio("") == ""
    assert rrhh.normalizar_cargo_nombre_propio("   ") == ""
    assert rrhh.normalizar_cargo_nombre_propio("  operario   volqueta  ") == "Operario Volqueta"


class _FakeTable:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self._filters = {}
        self._payload = None
        self._op = "select"
        self._select = "*"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def is_(self, col, val):
        self._filters[f"is:{col}"] = val
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = list(self.store.get(self.name) or [])
        if self._op == "select":
            out = []
            for r in rows:
                ok = True
                for k, v in self._filters.items():
                    if k.startswith("is:"):
                        col = k[3:]
                        if v == "null" and r.get(col) is not None:
                            ok = False
                    elif r.get(k) != v:
                        ok = False
                if ok:
                    out.append(dict(r))
            return SimpleNamespace(data=out)
        if self._op == "update":
            updated = []
            for r in rows:
                ok = True
                for k, v in self._filters.items():
                    if r.get(k) != v:
                        ok = False
                if ok:
                    r.update(self._payload or {})
                    updated.append(dict(r))
            return SimpleNamespace(data=updated)
        if self._op == "insert":
            row = dict(self._payload or {})
            row.setdefault("id", len(rows) + 1)
            rows.append(row)
            self.store[self.name] = rows
            return SimpleNamespace(data=[row])
        return SimpleNamespace(data=[])


class _FakeSb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeTable(self.store, name)


def test_ensure_cargos_nombre_propio_corrige_catalogo_y_trabajadores():
    rrhh._CARGOS_NP_ENSURED.clear()
    store = {
        "rrhh_catalogo_opciones": [
            {"id": 1, "contrato_id": 7, "categoria": "cargo", "valor": "OPERARIO VOLQUETA",
             "valor_norm": "operario volqueta", "activo": True},
            {"id": 2, "contrato_id": 7, "categoria": "cargo", "valor": "Auxiliar de Tráfico",
             "valor_norm": "auxiliar de tráfico", "activo": True},
            {"id": 3, "contrato_id": 7, "categoria": "eps", "valor": "SURA",
             "valor_norm": "sura", "activo": True},
        ],
        "rrhh_trabajadores": [
            {"id": 10, "contrato_id": 7, "cargo_aspira": "AYUDANTE DE OBRA", "eliminado_en": None},
            {"id": 11, "contrato_id": 7, "cargo_aspira": "Oficial", "eliminado_en": None},
            {"id": 12, "contrato_id": 7, "cargo_aspira": "INSP. SST", "eliminado_en": None},
        ],
    }
    sb = _FakeSb(store)
    stats = rrhh.ensure_cargos_nombre_propio(sb, 7, force=True)
    assert stats["catalogo_actualizados"] == 1
    assert stats["trabajadores_actualizados"] == 2
    assert store["rrhh_catalogo_opciones"][0]["valor"] == "Operario Volqueta"
    assert store["rrhh_catalogo_opciones"][1]["valor"] == "Auxiliar de Tráfico"
    assert store["rrhh_catalogo_opciones"][2]["valor"] == "SURA"  # no cargo
    assert store["rrhh_trabajadores"][0]["cargo_aspira"] == "Ayudante de Obra"
    assert store["rrhh_trabajadores"][1]["cargo_aspira"] == "Oficial"
    assert store["rrhh_trabajadores"][2]["cargo_aspira"] == "Insp. SST"

    # Segunda pasada: idempotente (cache de proceso)
    stats2 = rrhh.ensure_cargos_nombre_propio(sb, 7)
    assert stats2 == {"catalogo_actualizados": 0, "trabajadores_actualizados": 0}


def test_payload_trabajador_normaliza_cargo_aspira():
    body = {
        "nombres": "Ana",
        "apellidos": "López",
        "numero_documento": "123456",
        "cargo_aspira": "OPERARIO VOLQUETA",
        "empresa_tipo": "consorcio",
        "empresa_nombre": "Consorcio Demo",
    }
    # _resolve_empresa needs sb when empresa fields present; use partial + only cargo
    out = rrhh._payload_trabajador(None, 1, {
        "cargo_aspira": "OPERARIO VOLQUETA",
    }, partial=True)
    assert out["cargo_aspira"] == "Operario Volqueta"
