"""Regresión: panel /analisis debe paginar más allá de 1000 filas (límite PostgREST)."""
import main as m


class _FakeQuery:
    def __init__(self):
        self.ranges: list[tuple[int, int]] = []

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start: int, end: int):
        self.ranges.append((start, end))
        self._start = start
        self._end = end
        return self

    def execute(self):
        rows = [
            {"id": i, "costo_directo": 1.0}
            for i in range(self._start + 1, min(self._end + 2, 1112))
        ]
        return type("Resp", (), {"data": rows})()


def test_analisis_fetch_paginates_past_postgrest_cap(monkeypatch):
    """Con 1111 filas y PAGE=1000 debe hacer 2 peticiones, no truncar en 1000."""
    q = _FakeQuery()
    monkeypatch.delenv("SICOE_ANALISIS_PAGE_SIZE", raising=False)
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    rows = m._sicoe_analisis_fetch_registros_paginated(lambda: q)
    assert len(rows) == 1111
    assert len(q.ranges) == 2
    assert q.ranges[0] == (0, 999)
    assert q.ranges[1] == (1000, 1999)


def test_analisis_page_size_capped_at_1000(monkeypatch):
    monkeypatch.setenv("SICOE_ANALISIS_PAGE_SIZE", "2000")
    q = _FakeQuery()
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    m._sicoe_analisis_fetch_registros_paginated(lambda: q)
    assert q.ranges[0][1] - q.ranges[0][0] + 1 == 1000
