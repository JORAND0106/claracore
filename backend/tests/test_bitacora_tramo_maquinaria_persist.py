"""
Regresión: Tramo de Maquinaria debe persistir aunque fallen columnas opcionales
(preoperacionales / operador_rrhh_id). El retry anterior hacía pop(tramo) y el
insert “exitoso” dejaba tramo NULL en BD mientras la UI mostraba éxito.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_service as svc


class _FakeInsertResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, behavior):
        self.behavior = behavior
        self.inserts = []

    def delete(self):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return _FakeInsertResult([])

    def insert(self, payload):
        self.inserts.append(dict(payload))
        self.behavior.on_insert(payload)
        return self


class _Behavior:
    def __init__(self):
        self.calls = 0

    def on_insert(self, payload):
        self.calls += 1
        # Primer intento: falla si trae preoperacionales (columna “ausente”).
        if "preoperacionales" in payload:
            raise RuntimeError('column "preoperacionales" does not exist')
        # Éxito en reintentos sin preoperacionales


def _make_sb(behavior: _Behavior):
    table = _FakeTable(behavior)

    def table_fn(name):
        if name == "seguimiento_bitacora_equipo_uso":
            return table
        # upsert_equipo path — no usado si viene equipo_id
        raise AssertionError(f"tabla inesperada: {name}")

    sb = MagicMock()
    sb.table.side_effect = table_fn
    return sb, table


def test_sync_usos_conserva_tramo_si_falla_preoperacionales():
    behavior = _Behavior()
    sb, table = _make_sb(behavior)
    # Parchear insert.execute para devolver fila con tramo en el éxito
    real_insert = table.insert

    def insert_and_return(payload):
        real_insert(payload)
        # Fake chain: insert().execute() — redefinir execute en la tabla tras insert

        class Chain:
            def execute(self_inner):
                return _FakeInsertResult([{
                    "id": 1,
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
    # Primer insert falló; el exitoso aún trae tramo
    assert any("tramo" in p and p.get("tramo") == "Tramo Norte" for p in table.inserts)
    assert any("preoperacionales" not in p for p in table.inserts)


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
    # Forzar éxito inmediato (sin preoperacionales en payload → behavior no falla)
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
    # tramo vacío no se escribe (None / ausente)
    assert "tramo" not in table.inserts[0] or table.inserts[0].get("tramo") in (None, "")
