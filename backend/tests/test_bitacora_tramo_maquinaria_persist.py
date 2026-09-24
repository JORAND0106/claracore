"""
Regresión guardado Maquinaria:
1. Tramo se conserva si falla columna opcional (preoperacionales).
2. Si TODOS los inserts fallan, NO se borran los usos existentes
   (el DELETE-first del PR #657 dejaba la bitácora vacía con «éxito»).
3. Error de columna desconocida no relacionada → se propaga (no silenciar).
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

import bitacora_service as svc


class _FakeInsertResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, behavior):
        self.behavior = behavior
        self.inserts = []
        self.deleted_ids = []
        self._existing = list(getattr(behavior, "existing", []) or [])

    def delete(self):
        self._mode = "delete"
        return self

    def select(self, *_a, **_k):
        self._mode = "select"
        return self

    def eq(self, key, val):
        self._eq = (key, val)
        return self

    def in_(self, key, vals):
        self._in = (key, list(vals))
        if getattr(self, "_mode", None) == "delete":
            self.deleted_ids.extend(list(vals))
            # quitar de existentes simulados
            ids = set(int(v) for v in vals)
            self._existing = [r for r in self._existing if int(r.get("id") or 0) not in ids]
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        if getattr(self, "_mode", None) == "select":
            return _FakeInsertResult(list(self._existing))
        if getattr(self, "_mode", None) == "delete":
            return _FakeInsertResult([])
        return _FakeInsertResult([])

    def insert(self, payload):
        self.inserts.append(dict(payload))
        self.behavior.on_insert(payload)
        return self


class _Behavior:
    def __init__(self, existing=None):
        self.calls = 0
        self.existing = existing or []

    def on_insert(self, payload):
        self.calls += 1
        if "preoperacionales" in payload:
            raise RuntimeError('column "preoperacionales" does not exist')


def _make_sb(behavior: _Behavior):
    table = _FakeTable(behavior)

    def table_fn(name):
        if name == "seguimiento_bitacora_equipo_uso":
            return table
        raise AssertionError(f"tabla inesperada: {name}")

    sb = MagicMock()
    sb.table.side_effect = table_fn
    return sb, table


def test_sync_usos_conserva_tramo_si_falla_preoperacionales():
    behavior = _Behavior()
    sb, table = _make_sb(behavior)

    def insert_and_return(payload):
        table.inserts.append(dict(payload))
        try:
            behavior.on_insert(payload)
        except Exception:
            # Simular fallo de insert: la cadena no llega a execute con data
            class FailChain:
                def execute(self_inner):
                    raise RuntimeError('column "preoperacionales" does not exist')
            return FailChain()

        class Chain:
            def execute(self_inner):
                return _FakeInsertResult([{
                    "id": 100,
                    "entrada_id": 10,
                    "equipo_nombre": payload.get("equipo_nombre"),
                    "tramo": payload.get("tramo"),
                    "operador": payload.get("operador"),
                }])

        return Chain()

    table.insert = insert_and_return

    out = svc._sync_usos(
        sb,
        contrato_id=3,
        entrada_id=10,
        usos=[{
            "equipo_id": 5,
            "equipo_nombre": "Retroexcavadora",
            "operador": "Luis Mora",
            "operador_rrhh_id": 99,
            "tramo": "Tramo Norte",
            "cantidad": 1,
            "preoperacionales": [{"nombre": "p.png"}],
        }],
        user_id=1,
    )
    assert len(out) == 1
    assert out[0]["tramo"] == "Tramo Norte"
    assert any("tramo" in p and p.get("tramo") == "Tramo Norte" for p in table.inserts)
    assert any("preoperacionales" not in p for p in table.inserts)


def test_sync_usos_no_borra_existentes_si_insert_falla_total():
    """DELETE-first era el bug de producción: éxito vacío + UI en blanco."""
    existing = [{
        "id": 7,
        "entrada_id": 10,
        "equipo_nombre": "Retro",
        "tramo": "Tramo 1",
    }]
    behavior = _Behavior(existing=existing)
    sb, table = _make_sb(behavior)

    def insert_always_fail(payload):
        table.inserts.append(dict(payload))

        class Chain:
            def execute(self_inner):
                raise RuntimeError("permission denied for table")

        return Chain()

    table.insert = insert_always_fail

    with pytest.raises(ValueError, match="No se pudo guardar Maquinaria"):
        svc._sync_usos(
            sb,
            3,
            10,
            [{
                "equipo_id": 5,
                "equipo_nombre": "Volqueta",
                "tramo": "Tramo 2",
                "cantidad": 1,
                "preoperacionales": [],
            }],
        )
    # No se borraron los existentes
    assert table.deleted_ids == []
    assert any(r.get("id") == 7 for r in table._existing)


def test_sync_usos_tramo_vacio_omitido_del_payload():
    behavior = _Behavior()
    sb, table = _make_sb(behavior)

    def insert_ok(payload):
        table.inserts.append(dict(payload))

        class Chain:
            def execute(self_inner):
                return _FakeInsertResult([{**payload, "id": 2}])

        return Chain()

    table.insert = insert_ok
    out = svc._sync_usos(
        sb,
        3,
        11,
        [{
            "equipo_id": 5,
            "equipo_nombre": "Volqueta",
            "tramo": "",
            "cantidad": 1,
            "preoperacionales": [],
        }],
    )
    assert len(out) == 1
    assert "tramo" not in table.inserts[0] or table.inserts[0].get("tramo") in (None, "")


def test_missing_column_parser():
    assert svc._missing_column_from_exc(
        RuntimeError('column "preoperacionales" does not exist')
    ) == "preoperacionales"
    assert svc._missing_column_from_exc(
        RuntimeError("Could not find the 'operador_rrhh_id' column of 'seguimiento_bitacora_equipo_uso'")
    ) == "operador_rrhh_id"
    assert svc._missing_column_from_exc(RuntimeError("permission denied")) is None
