"""Write-back visible CPM: fecha_inicio en cabecera WBS e ítems hijo."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from prog_obra_cpm import NodoCPM
from prog_obra_service import (
    _apply_cpm_programacion_visible,
    _count_ppto_items_fecha_inicio_directo,
    mark_cpm_synced,
    propagar_fechas_agrupador_a_hijos,
)


def test_propagar_hijos_usa_ag_by_item():
    sb = MagicMock()
    ppto_items = [("01", "1.1", Decimal("10"), "m2", Decimal("100"))]
    ag_by_item = {("01", "1.1"): 10}

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.in_.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[{"item": "1.1"}])

    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.in_.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=[{"item": "1.1"}])

    table_mock = MagicMock()
    table_mock.update.return_value = update_chain
    table_mock.select.return_value = select_chain
    insert_mock = MagicMock()
    table_mock.insert.return_value = insert_mock
    sb.table.return_value = table_mock

    cache = MagicMock()
    n = propagar_fechas_agrupador_a_hijos(
        sb,
        "vid",
        1,
        "PK1",
        "01",
        10,
        "2.A",
        date(2026, 6, 1),
        5,
        date(2026, 6, 7),
        0,
        cache,
        ppto_items=ppto_items,
        ag_by_item=ag_by_item,
    )
    assert n == 1
    sb.table.assert_any_call("prog_actividades")
    update_chain.in_.assert_called()
    table_mock.insert.assert_not_called()


def test_propagar_cpm_no_inserta_filas_faltantes():
    sb = MagicMock()
    ppto_items = [
        ("01", "1.1", Decimal("10"), "m2", Decimal("100")),
        ("01", "1.2", Decimal("5"), "m2", Decimal("50")),
    ]
    ag_by_item = {("01", "1.1"): 10, ("01", "1.2"): 10}

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.in_.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[])

    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.in_.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=[{"item": "1.1"}])

    table_mock = MagicMock()
    table_mock.update.return_value = update_chain
    table_mock.select.return_value = select_chain
    sb.table.return_value = table_mock

    cache = MagicMock()
    n = propagar_fechas_agrupador_a_hijos(
        sb,
        "vid",
        1,
        "PK1",
        "01",
        10,
        "2.A",
        date(2026, 6, 1),
        5,
        date(2026, 6, 7),
        0,
        cache,
        ppto_items=ppto_items,
        ag_by_item=ag_by_item,
        insert_missing=False,
    )
    assert n == 1
    table_mock.insert.assert_not_called()


def test_apply_cpm_programacion_visible_batch_por_id():
    n = NodoCPM(
        pk_id="PK1",
        capitulo="03",
        duracion=10,
        fecha_inicio_base=date(2026, 1, 1),
        fecha_fin_base=date(2026, 1, 12),
        agrupador_id="10",
    )
    n.fecha_inicio_temprana = date(2026, 3, 1)
    n.fecha_fin_temprana = date(2026, 3, 14)

    sb = MagicMock()
    cache = MagicMock()
    bulk_patches: list[list[dict]] = []

    with patch("prog_obra_service._prog_actividades_agrupador_index") as idx, patch(
        "prog_obra_service._listado_agrupador_por_item"
    ) as ag_map, patch("prog_obra_service._ppto_items_por_pk") as ppto, patch(
        "prog_obra_service._fetch_prog_actividades_items_index"
    ) as items_idx, patch("prog_obra_service._hijo_ppto_for_agrupador") as hijo, patch(
        "prog_obra_service._bulk_patch_prog_actividades_by_id"
    ) as bulk:
        idx.return_value = (
            {("PK1", "03", 10): ["row-header"]},
            {
                ("PK1", "03", 10): [
                    {"id": "row-header", "item": "2.A", "codigo_wbs": "2.A", "agrupador_id": 10},
                ],
            },
        )
        ag_map.return_value = ({("03", "1.1"): 10}, {})
        ppto.return_value = (1, [("03", "1.1", Decimal("1"), "und", Decimal("1"))])
        items_idx.return_value = {
            ("PK1", "03", "1.1"): {"id": "row-child", "override_manual": False},
        }
        hijo.return_value = [("03", "1.1", Decimal("1"), "und", Decimal("1"))]
        bulk.side_effect = lambda _sb, rows: bulk_patches.append(list(rows))

        count = _apply_cpm_programacion_visible(sb, "vid", 1, cache, [n])

    assert count == 2
    bulk.assert_called_once()
    ids = {r["id"] for r in bulk_patches[0]}
    assert ids == {"row-header", "row-child"}
    header = next(r for r in bulk_patches[0] if r["id"] == "row-header")
    assert header["fecha_inicio"] == "2026-03-01"
    assert header["fecha_fin_calculada"] == "2026-03-14"


def test_count_ppto_items_fecha_inicio_directo():
    sb = MagicMock()
    with patch("prog_obra_service._ppto_items_por_pk") as ppto:
        ppto.return_value = (
            2,
            [
                ("01", "1.1", Decimal("1"), "und", Decimal("1")),
                ("01", "1.2", Decimal("1"), "und", Decimal("1")),
            ],
        )
        select_chain = MagicMock()
        select_chain.eq.return_value = select_chain
        select_chain.execute.return_value = MagicMock(
            data=[
                {"capitulo": "01", "item": "1.1", "fecha_inicio": "2026-06-01"},
                {"capitulo": "01", "item": "1.2", "fecha_inicio": None},
            ]
        )
        sb.table.return_value.select.return_value = select_chain

        n = _count_ppto_items_fecha_inicio_directo(sb, "vid", 1, "PK1")

    assert n == 1


def test_mark_cpm_synced_limpia_dirty():
    sb = MagicMock()
    chain = MagicMock()
    chain.eq.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    sb.table.return_value.update.return_value = chain

    mark_cpm_synced(sb, "vid")

    payload = sb.table.return_value.update.call_args[0][0]
    assert payload["cpm_dirty"] is False
    assert payload["cpm_calculado_en"]
