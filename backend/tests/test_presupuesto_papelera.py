"""Tests de lógica de papelera / purga (sin Supabase)."""
from datetime import datetime, timedelta, timezone

from presupuesto_papelera import (
    DIAS_PURGA_PAPELERA,
    edad_en_papelera_dias,
    eliminar_definitivo_ids,
    payload_marcar_baja,
    payload_restaurar,
    umbral_purga,
)


def test_umbral_purga_30_dias():
    u = umbral_purga(30)
    assert (datetime.now(timezone.utc) - u).days >= 29
    assert DIAS_PURGA_PAPELERA == 30


def test_payload_baja_y_restaurar():
    b = payload_marcar_baja()
    assert b["dado_de_baja"] is True
    assert b["dado_de_baja_at"]
    r = payload_restaurar()
    assert r["dado_de_baja"] is False
    assert r["dado_de_baja_at"] is None


def test_edad_usa_dado_de_baja_at():
    ahora = datetime(2026, 8, 12, tzinfo=timezone.utc)
    row = {
        "dado_de_baja_at": (ahora - timedelta(days=10)).isoformat(),
        "updated_at": (ahora - timedelta(days=1)).isoformat(),
    }
    edad = edad_en_papelera_dias(row, ahora=ahora)
    assert edad is not None
    assert 9.9 <= edad <= 10.1


class _FakeQ:
    def __init__(self, sb, name):
        self.sb = sb
        self.name = name
        self._filters = {}
        self._in_ids = None
        self._op = "select"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._in_ids = list(vals)
        self._filters["_in_col"] = col
        return self

    def execute(self):
        if self.name == "presupuesto" and self._op == "select":
            rows = [r for r in self.sb.rows if r["id"] in (self._in_ids or [])]
            return type("R", (), {"data": rows})()
        if self.name == "presupuesto" and self._op == "delete":
            keep = []
            deleted = []
            for r in self.sb.rows:
                if self._in_ids and r["id"] in self._in_ids and r.get("dado_de_baja"):
                    if self._filters.get("dado_de_baja") is True and not r.get("dado_de_baja"):
                        keep.append(r)
                        continue
                    deleted.append(r["id"])
                    continue
                if self._filters.get("id") == r["id"] and r.get("dado_de_baja"):
                    deleted.append(r["id"])
                    continue
                keep.append(r)
            self.sb.rows = keep
            self.sb.deleted.extend(deleted)
            return type("R", (), {"data": []})()
        if self.name == "comentarios" and self._op == "delete":
            return type("R", (), {"data": []})()
        return type("R", (), {"data": []})()


class _FakeSb:
    def __init__(self, rows):
        self.rows = list(rows)
        self.deleted = []

    def table(self, name):
        return _FakeQ(self, name)


def test_eliminar_definitivo_solo_papelera():
    sb = _FakeSb(
        [
            {"id": 1, "dado_de_baja": True, "contrato_id": 9},
            {"id": 2, "dado_de_baja": False, "contrato_id": 9},
            {"id": 3, "dado_de_baja": True, "contrato_id": 9},
        ]
    )
    out = eliminar_definitivo_ids(sb, [1, 2, 3, 99])
    assert set(out["eliminados"]) == {1, 3}
    assert any(o["id"] == 2 and o["motivo"] == "no_en_papelera" for o in out["omitidos"])
    assert any(o["id"] == 99 and o["motivo"] == "no_encontrado" for o in out["omitidos"])
    assert {r["id"] for r in sb.rows} == {2}
