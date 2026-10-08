"""Bandeja debe filtrar contrato_id en SQL antes del limit(800).

Sin ese filtro, con muchos ítems de otros contratos el tope global puede
dejar fuera tareas/compromisos del contrato activo (calendario solo con actas).
"""
from __future__ import annotations

import seguimiento_service as svc


class TrackingQ:
    """Fake query que aplica eq/gte/lte/limit como PostgREST (filtros → order → limit)."""

    def __init__(self, data):
        self._all = list(data)
        self._filters = []
        self._limit = None
        self.eq_calls = []

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.eq_calls.append((col, val))
        self._filters.append(("eq", col, val))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self._filters.append(("lte", col, val))
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = int(n)
        return self

    def execute(self):
        rows = list(self._all)
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "gte":
                rows = [r for r in rows if str(r.get(col) or "") >= str(val)]
            elif op == "lte":
                rows = [r for r in rows if str(r.get(col) or "") <= str(val)]
        if self._limit is not None:
            rows = rows[: self._limit]
        return type("R", (), {"data": rows})()


def test_list_bandeja_filtra_contrato_en_sql_antes_del_limit(monkeypatch):
    """Ítems del contrato activo sobreviven aunque el tope 800 esté lleno de otros."""
    otros = [
        {
            "id": i,
            "origen": "tarea",
            "contrato_id": 99,
            "estado_gestion": "abierto",
            "created_by": 1,
            "asignado_a_id": 1,
            "fecha_vencimiento": "2026-10-01",
            "titulo": f"Ajena {i}",
            "campos_libres": {},
        }
        for i in range(1, 801)
    ]
    propias = [
        {
            "id": 9001,
            "origen": "tarea",
            "contrato_id": 5,
            "estado_gestion": "abierto",
            "created_by": 30,
            "asignado_a_id": 30,
            "fecha_vencimiento": "2026-10-15",
            "titulo": "Mía",
            "campos_libres": {},
        },
        {
            "id": 9002,
            "origen": "compromiso",
            "contrato_id": 5,
            "estado_gestion": "abierto",
            "created_by": 30,
            "asignado_a_id": 30,
            "fecha_vencimiento": "2026-10-16",
            "titulo": "Compromiso mío",
            "campos_libres": {},
        },
    ]
    # Sin filtro SQL de contrato, limit(800) se comería solo las 800 ajenas
    # (orden por id de construcción) y dejaría fuera 9001/9002.
    items = otros + propias
    tracked = {"q": None}

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                q = TrackingQ(items)
                tracked["q"] = q
                return q
            return TrackingQ([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {"id": uid, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)

    out = svc.list_bandeja(
        FakeSb(),
        30,
        {"sub": "30"},
        contrato_id=5,
        fecha_desde="2026-10-01",
        fecha_hasta="2026-10-31",
        incluir_cerrados=True,
    )
    assert tracked["q"] is not None
    assert ("contrato_id", 5) in tracked["q"].eq_calls
    ids = {r["id"] for r in out}
    assert ids == {9001, 9002}


def test_list_bandeja_sin_contrato_no_fuerza_eq_contrato(monkeypatch):
    items = [
        {
            "id": 1,
            "origen": "tarea",
            "contrato_id": 5,
            "estado_gestion": "abierto",
            "created_by": 1,
            "asignado_a_id": 1,
            "fecha_vencimiento": "2026-10-01",
            "titulo": "T",
            "campos_libres": {},
        },
    ]
    tracked = {"q": None}

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                q = TrackingQ(items)
                tracked["q"] = q
                return q
            return TrackingQ([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {"id": uid, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)

    svc.list_bandeja(FakeSb(), 1, {"sub": "1"}, incluir_cerrados=True)
    assert tracked["q"] is not None
    assert not any(col == "contrato_id" for col, _ in tracked["q"].eq_calls)
