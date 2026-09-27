"""Indicador de biblioteca de soportes en grilla SICOE Obra."""
from unittest.mock import MagicMock

import main as m


def test_enlace_soporte_tiene_urls_variantes():
    assert m._sicoe_enlace_soporte_tiene_urls(None) is False
    assert m._sicoe_enlace_soporte_tiene_urls("") is False
    assert m._sicoe_enlace_soporte_tiene_urls("[]") is False
    assert m._sicoe_enlace_soporte_tiene_urls("null") is False
    assert m._sicoe_enlace_soporte_tiene_urls('["https://drive.google.com/x"]') is True
    assert m._sicoe_enlace_soporte_tiene_urls('["", "  "]') is False
    assert m._sicoe_enlace_soporte_tiene_urls("https://sharepoint.com/doc") is True
    assert m._sicoe_enlace_soporte_tiene_urls(["https://a.com", ""]) is True
    assert m._sicoe_enlace_soporte_tiene_urls([]) is False


def test_enriquecer_tiene_enlace_desde_cabecera(monkeypatch):
    rows = [
        {"id": 1, "enlace_soporte": '["https://a.com"]'},
        {"id": 2, "enlace_soporte": None},
        {"id": 3, "enlace_soporte": "[]"},
    ]
    calls = {"n": 0}
    q = MagicMock()
    q.select.return_value = q
    q.in_.return_value = q
    q.not_ = q
    q.is_.return_value = q
    q.execute.return_value = MagicMock(data=[])

    def _table(*_a, **_k):
        calls["n"] += 1
        return q

    monkeypatch.setattr(m, "supabase", MagicMock(table=_table))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    m._sicoe_enriquecer_tiene_enlace_soporte(rows)
    assert rows[0]["tiene_enlace_soporte"] is True
    assert rows[1]["tiene_enlace_soporte"] is False
    assert rows[2]["tiene_enlace_soporte"] is False
    assert calls["n"] == 1  # batch solo para ids sin cabecera


def test_enriquecer_tiene_enlace_desde_registro(monkeypatch):
    rows = [
        {"id": 10, "enlace_soporte": None},
        {"id": 20, "enlace_soporte": ""},
    ]
    q = MagicMock()
    q.select.return_value = q
    q.in_.return_value = q
    q.not_ = q
    q.is_.return_value = q
    q.execute.return_value = MagicMock(
        data=[
            {"reporte_id": 10, "enlace_soporte": '["https://reg.com"]'},
            {"reporte_id": 20, "enlace_soporte": "[]"},
        ]
    )
    monkeypatch.setattr(m, "supabase", MagicMock(table=MagicMock(return_value=q)))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    m._sicoe_enriquecer_tiene_enlace_soporte(rows)
    assert rows[0]["tiene_enlace_soporte"] is True
    assert rows[1]["tiene_enlace_soporte"] is False
