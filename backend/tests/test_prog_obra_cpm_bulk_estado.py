"""CPM post-proceso: bulk prog_pk_estado."""
from __future__ import annotations

from unittest.mock import MagicMock

from prog_obra_service import _count_items_con_fecha_bulk, upsert_prog_pk_estado_bulk


def test_count_items_con_fecha_bulk_en_memoria():
    ppto = {
        "120367": {("CAP 1", "1.1")},
        "120368": {("CAP 1", "1.1"), ("CAP 1", "1.2")},
    }
    ag_by_item = {("CAP 1", "1.1"): 10, ("CAP 1", "1.2"): 11}
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[
            {
                "pk_id": "120367",
                "capitulo": "CAP 1",
                "item": "1.1",
                "fecha_inicio": "2026-06-09",
                "fecha_inicio_temprana": None,
                "agrupador_id": None,
            },
            {
                "pk_id": "120368",
                "capitulo": "CAP 1",
                "item": "2.A",
                "fecha_inicio": None,
                "fecha_inicio_temprana": "2026-06-09",
                "agrupador_id": 10,
            },
        ]
    )
    counts = _count_items_con_fecha_bulk(
        sb, "vid", 3, ["120367", "120368"], ppto_keys_by_pk=ppto, ag_by_item=ag_by_item,
    )
    assert counts["120367"] == 1
    assert counts["120368"] == 1


def test_upsert_prog_pk_estado_bulk_una_consulta_upsert():
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value.select.return_value = chain
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.execute.return_value = MagicMock(data=[])

    import prog_obra_service as svc

    svc._items_total_por_pks = MagicMock(return_value={"120367": 5})
    svc._ppto_keys_por_pks = MagicMock(return_value={"120367": set()})
    svc._count_items_con_fecha_bulk = MagicMock(return_value={"120367": 2})
    svc.fetch_sin_agrupador_count_by_pk = MagicMock(return_value={"120367": 0})
    svc._compute_estado_pk = MagicMock(return_value="parcial")

    upsert_prog_pk_estado_bulk(sb, "vid", 3, ["120367"])
    sb.table.return_value.upsert.assert_called_once()
