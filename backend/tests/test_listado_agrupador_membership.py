"""Membership N:N listado ↔ agrupadores."""
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from listado_agrupador_membership import (
    asignar_items_a_agrupador,
    invalidate_membership_cache,
    membership_disponible,
    require_membership,
    sync_legacy_agrupador_id,
)


class _Resp:
    def __init__(self, data=None):
        self.data = data or []


class _Q:
    def __init__(self, sb, name):
        self.sb = sb
        self.name = name
        self._filters = {}
        self._in = {}
        self._payload = None
        self._op = "select"
        self._sel = "*"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._in[col] = list(vals)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, rows, on_conflict=None):
        self._op = "upsert"
        self._payload = rows
        self.sb.upserts.append((self.name, rows))
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        if self.name == "listado_precios_agrupador_items":
            if self._op == "select":
                rows = list(self.sb.bridge)
                if "agrupador_id" in self._filters:
                    aid = int(self._filters["agrupador_id"])
                    rows = [r for r in rows if int(r["agrupador_id"]) == aid]
                if "item_id" in self._in:
                    wanted = {int(x) for x in self._in["item_id"]}
                    rows = [r for r in rows if int(r["item_id"]) in wanted]
                return _Resp([{"item_id": r["item_id"], "agrupador_id": r["agrupador_id"]} for r in rows])
            if self._op == "upsert":
                for row in self._payload or []:
                    key = (int(row["agrupador_id"]), int(row["item_id"]))
                    if key not in {(int(b["agrupador_id"]), int(b["item_id"])) for b in self.sb.bridge}:
                        self.sb.bridge.append(dict(row))
                return _Resp(self._payload)
            if self._op == "delete":
                aid = int(self._filters.get("agrupador_id") or 0)
                iid = int(self._filters.get("item_id") or 0)
                self.sb.bridge = [
                    b for b in self.sb.bridge
                    if not (int(b["agrupador_id"]) == aid and int(b["item_id"]) == iid)
                ]
                return _Resp([])
        if self.name == "listado_precios":
            if self._op == "select":
                rows = list(self.sb.items)
                if "contrato_id" in self._filters:
                    rows = [r for r in rows if int(r["contrato_id"]) == int(self._filters["contrato_id"])]
                if "id" in self._in:
                    wanted = {int(x) for x in self._in["id"]}
                    rows = [r for r in rows if int(r["id"]) in wanted]
                return _Resp(rows)
            if self._op == "update":
                iid = self._filters.get("id")
                for r in self.sb.items:
                    if iid is not None and int(r["id"]) == int(iid):
                        r["agrupador_id"] = self._payload.get("agrupador_id")
                self.sb.updates.append((iid, self._payload))
                return _Resp([])
        if self.name == "listado_precios_agrupadores":
            rows = list(self.sb.ags)
            if "id" in self._in:
                wanted = {int(x) for x in self._in["id"]}
                rows = [r for r in rows if int(r["id"]) in wanted]
            return _Resp(rows)
        return _Resp([])


class _Sb:
    def __init__(self, *, membership=True):
        self.membership = membership
        self.bridge = []
        self.upserts = []
        self.updates = []
        self.items = [
            {"id": 1, "contrato_id": 3, "capitulo": "1. CAP A", "item_numero": "1.1"},
            {"id": 2, "contrato_id": 3, "capitulo": "1. CAP A", "item_numero": "1.2"},
            {"id": 3, "contrato_id": 3, "capitulo": "2. CAP B", "item_numero": "2.1"},
        ]
        self.ags = [
            {"id": 10, "es_transversal": False, "capitulo": "1. CAP A"},
            {"id": 20, "es_transversal": True, "capitulo": "Transversales"},
        ]

    def table(self, name):
        if name == "listado_precios_agrupador_items" and not self.membership:
            raise RuntimeError("PGRST205 Could not find the table")
        return _Q(self, name)


def test_require_membership_falla_si_no_hay_tabla():
    invalidate_membership_cache()
    sb = _Sb(membership=False)
    with pytest.raises(HTTPException) as ei:
        require_membership(sb)
    assert ei.value.status_code == 503


def test_asignar_items_persiste_en_bridge_y_permite_multi():
    invalidate_membership_cache()
    sb = _Sb(membership=True)
    n = asignar_items_a_agrupador(sb, 3, 10, "1. CAP A", [1, 2], reemplazar=True)
    assert n == 2
    assert {(b["agrupador_id"], b["item_id"]) for b in sb.bridge} == {(10, 1), (10, 2)}
    # Segundo agrupador (capítulo) conserva el primero
    n2 = asignar_items_a_agrupador(sb, 3, 10, "1. CAP A", [1], reemplazar=False)
    assert n2 == 1
    # Transversal con ítems de dos capítulos
    n3 = asignar_items_a_agrupador(
        sb, 3, 20, "Transversales", [1, 3],
        reemplazar=True, permitir_multi_capitulo=True,
    )
    assert n3 == 2
    assert (20, 1) in {(b["agrupador_id"], b["item_id"]) for b in sb.bridge}
    assert (20, 3) in {(b["agrupador_id"], b["item_id"]) for b in sb.bridge}
    # Ítem 1 sigue en AG 10
    assert (10, 1) in {(b["agrupador_id"], b["item_id"]) for b in sb.bridge}


def test_sync_legacy_prefiere_ag_de_capitulo():
    invalidate_membership_cache()
    sb = _Sb(membership=True)
    sb.bridge = [
        {"agrupador_id": 20, "item_id": 1},  # transversal
        {"agrupador_id": 10, "item_id": 1},  # capítulo
    ]
    sync_legacy_agrupador_id(sb, [1])
    assert sb.items[0]["agrupador_id"] == 10


def test_asignar_sin_membership_exige_tabla():
    invalidate_membership_cache()
    sb = _Sb(membership=False)
    with pytest.raises(HTTPException) as ei:
        asignar_items_a_agrupador(sb, 3, 10, "1. CAP A", [1])
    assert ei.value.status_code == 503
