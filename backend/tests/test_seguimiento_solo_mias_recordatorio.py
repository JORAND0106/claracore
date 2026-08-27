"""Filtro solo_mias bandeja/actas + recordatorios de reunión."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from seguimiento_service import (
    list_actas,
    list_bandeja,
    procesar_recordatorios_reunion_acta,
)

BOGOTA = ZoneInfo("America/Bogota")


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._in_filters = []
        self._limit = None
        self._order = None
        self._cols = "*"

    def select(self, cols="*", **_k):
        self._cols = cols
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self._filters.append(("lte", col, val))
        return self

    def in_(self, col, vals):
        self._in_filters.append((col, set(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, row):
        self._store.setdefault(self._table, []).append(dict(row))
        return self

    def execute(self):
        rows = list(self._store.get(self._table) or [])
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val or str(r.get(col)) == str(val)]
            elif op == "gte":
                rows = [r for r in rows if str(r.get(col) or "") >= str(val)]
            elif op == "lte":
                rows = [r for r in rows if str(r.get(col) or "") <= str(val)]
        for col, vals in self._in_filters:
            rows = [r for r in rows if r.get(col) in vals or str(r.get(col)) in {str(v) for v in vals}]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Resp(rows)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQ(self.store, name)


def test_list_bandeja_solo_mias_excluye_ajenos():
    store = {
        "seguimiento_item": [
            {
                "id": 1,
                "contrato_id": 10,
                "origen": "tarea",
                "estado_gestion": "abierto",
                "created_by": 5,
                "asignado_a_id": 5,
                "fecha_vencimiento": "2026-09-01",
                "campos_libres": {},
            },
            {
                "id": 2,
                "contrato_id": 10,
                "origen": "tarea",
                "estado_gestion": "abierto",
                "created_by": 99,
                "asignado_a_id": 99,
                "fecha_vencimiento": "2026-09-02",
                "campos_libres": {},
            },
            {
                "id": 3,
                "contrato_id": 10,
                "origen": "compromiso",
                "estado_gestion": "abierto",
                "created_by": 1,
                "asignado_a_id": 5,
                "solicitante_id": 1,
                "fecha_vencimiento": "2026-09-03",
                "campos_libres": {},
            },
        ],
        "usuarios": [{"id": 5, "nombre": "Yo", "apellidos": "User"}],
    }
    sb = _FakeSB(store)
    user = {"id": 5, "rol_nombre": "contratista", "cargo_nombre": "residente"}
    out = list_bandeja(sb, 5, user, contrato_id=10, solo_mias=True, incluir_cerrados=True)
    ids = sorted(r["id"] for r in out)
    assert ids == [1, 3]


def test_list_actas_solo_mias_elaborador_o_asistente():
    store = {
        "seguimiento_acta": [
            {"id": 100, "contrato_id": 10, "consecutivo": 1, "fecha_reunion": "2026-09-01",
             "elaborador_id": 5, "estado": "borrador", "tipo_acta": "interna", "orden_del_dia": "[]"},
            {"id": 101, "contrato_id": 10, "consecutivo": 2, "fecha_reunion": "2026-09-02",
             "elaborador_id": 9, "estado": "borrador", "tipo_acta": "interna", "orden_del_dia": "[]"},
            {"id": 102, "contrato_id": 10, "consecutivo": 3, "fecha_reunion": "2026-09-03",
             "elaborador_id": 9, "estado": "borrador", "tipo_acta": "interna", "orden_del_dia": "[]"},
        ],
        "seguimiento_acta_asistente": [
            {"id": 1, "acta_id": 102, "usuario_id": 5, "nombre": "Yo"},
        ],
    }
    sb = _FakeSB(store)
    user = {"id": 5, "rol_nombre": "interventoria"}
    out = list_actas(sb, 10, user_id=5, current_user=user, solo_mias=True)
    ids = sorted(r["id"] for r in out)
    assert ids == [100, 102]


def test_recordatorio_reunion_solo_asistentes_con_usuario_id():
    hoy = datetime(2026, 9, 10, 7, 15, tzinfo=BOGOTA)
    store = {
        "seguimiento_acta": [
            {
                "id": 50,
                "contrato_id": 10,
                "consecutivo": 7,
                "fecha_reunion": "2026-09-10",
                "ubicacion": "Sala A",
                "elaborador_id": 1,
                "estado": "borrador",
                "tipo_acta": "interna",
            },
            {
                "id": 51,
                "contrato_id": 10,
                "consecutivo": 8,
                "fecha_reunion": "2026-09-11",
                "ubicacion": "",
                "elaborador_id": 1,
                "estado": "borrador",
                "tipo_acta": "externa",
            },
        ],
        "seguimiento_acta_asistente": [
            {"id": 1, "acta_id": 50, "usuario_id": 20, "nombre": "Ana"},
            {"id": 2, "acta_id": 50, "usuario_id": None, "nombre": "Externo"},
            {"id": 3, "acta_id": 51, "usuario_id": 20, "nombre": "Ana"},
            {"id": 4, "acta_id": 51, "usuario_id": 30, "nombre": "Luis"},
        ],
        "notificaciones": [],
    }
    sb = _FakeSB(store)
    res = procesar_recordatorios_reunion_acta(sb, now_bogota=hoy, forzar_hora=True)
    assert res["enviados"] == 3  # mismo_día: Ana; día_antes: Ana+Luis
    notifs = store["notificaciones"]
    assert len(notifs) == 3
    dests = sorted(n["destinatario_id"] for n in notifs)
    assert dests == [20, 20, 30]
    assert all(n["entidad_tipo"] == "seguimiento_acta_recordatorio" for n in notifs)
    # No notificar a externo sin usuario_id
    assert all(n["destinatario_id"] != 0 for n in notifs)

    # Idempotencia: segunda pasada no duplica
    res2 = procesar_recordatorios_reunion_acta(sb, now_bogota=hoy, forzar_hora=True)
    assert res2["enviados"] == 0
    assert res2["omitidos_duplicado"] == 3
