"""Agrupación de tramos desde presupuesto poligonal."""
from prog_obra_service import group_tramos_from_presupuesto_rows


def test_group_tramos_deduplica_pk_y_ignora_vacios():
    rows = [
        {"pk_id": "120114", "tramo": "TRAMO 1"},
        {"pk_id": "120114", "tramo": "TRAMO 1"},
        {"pk_id": "120115", "tramo": "TRAMO 1"},
        {"pk_id": "120122", "tramo": ""},
        {"pk_id": "120123", "tramo": "TRAMO 2"},
    ]
    out = group_tramos_from_presupuesto_rows(rows)
    assert out == [
        {"tramo": "TRAMO 1", "pk_ids": ["120114", "120115"]},
        {"tramo": "TRAMO 2", "pk_ids": ["120123"]},
    ]


def test_group_tramos_orden_natural():
    rows = [
        {"pk_id": "120240", "tramo": "TRAMO 10"},
        {"pk_id": "120122", "tramo": "TRAMO 2"},
        {"pk_id": "120113", "tramo": "TRAMO 1"},
    ]
    out = group_tramos_from_presupuesto_rows(rows)
    assert [t["tramo"] for t in out] == ["TRAMO 1", "TRAMO 2", "TRAMO 10"]


def test_group_tramos_vacio():
    assert group_tramos_from_presupuesto_rows([]) == []
    assert group_tramos_from_presupuesto_rows([{"pk_id": "1", "tramo": None}]) == []


def test_clear_tramo_programacion_elimina_y_recalcula_pks(monkeypatch):
    from unittest.mock import MagicMock

    from prog_obra_service import clear_tramo_programacion

    monkeypatch.setattr(
        "prog_obra_service.assert_version_borrador",
        lambda sb, vid: {"contrato_id": 99},
    )
    monkeypatch.setattr(
        "prog_obra_service.fetch_tramos_contrato",
        lambda sb, cid: [{"tramo": "TRAMO 7", "pk_ids": ["120367", "120368"]}],
    )
    upsert_calls = []
    monkeypatch.setattr(
        "prog_obra_service._reset_prog_pk_estado_tramo",
        lambda sb, vid, cid, pks: upsert_calls.extend(pks),
    )
    mark_dirty = []
    monkeypatch.setattr(
        "prog_obra_service.mark_cpm_dirty",
        lambda sb, vid: mark_dirty.append(vid),
    )

    sb = MagicMock()
    count_resp = MagicMock(count=12)
    sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = count_resp
    sb.table.return_value.delete.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock()

    result = clear_tramo_programacion(sb, "ver-1", 99, "TRAMO 7")

    assert result["ok"] is True
    assert result["tramo"] == "TRAMO 7"
    assert result["pk_count"] == 2
    assert result["eliminados"] == 12
    assert upsert_calls == ["120367", "120368"]
    assert mark_dirty == ["ver-1"]
    assert sb.table.return_value.delete.return_value.eq.return_value.in_.return_value.execute.call_count == 3
