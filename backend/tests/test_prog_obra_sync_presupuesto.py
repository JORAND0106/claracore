"""Sync presupuesto → programación (bulk, sin insertar ítems nuevos)."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

import prog_obra_service as svc


@patch.object(svc, "fetch_sin_agrupador_count_by_pk", return_value={})
@patch.object(svc, "_count_items_con_fecha_bulk", return_value={"PK1": 1})
@patch.object(svc, "_listado_agrupador_por_item", return_value=({}, {}))
@patch.object(svc, "_bulk_patch_prog_actividades_by_id")
@patch.object(svc, "_build_ppto_item_map_contrato")
def test_sync_presupuesto_bulk_solo_actualiza_existentes(
    mock_ppto, mock_patch, _ag, _cf, _sin
):
    mock_ppto.return_value = {
        "PK1": {("02", "2.1"): (Decimal("100"), "m3", Decimal("50000"))},
    }
    acts = [
        {
            "id": "a1",
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.1",
            "segmento": 1,
            "cantidad_programada": 1,
        }
    ]
    sb = MagicMock()
    with patch.object(svc, "_fetch_actividades_version_all", return_value=acts):
        out = svc.sync_presupuesto_version(sb, "ver-1", 3)

    assert out["ok"] is True
    assert out["actividades_insertadas"] == 0
    assert out["actividades_actualizadas"] == 1
    mock_patch.assert_called_once()
    patches = mock_patch.call_args[0][1]
    assert patches[0]["costo_unitario"] == 50000.0


@patch.object(svc, "fetch_sin_agrupador_count_by_pk", return_value={})
@patch.object(svc, "_count_items_con_fecha_bulk", return_value={"PK1": 0})
@patch.object(svc, "_listado_agrupador_por_item", return_value=({}, {}))
@patch.object(svc, "_bulk_patch_prog_actividades_by_id")
@patch.object(svc, "_build_ppto_item_map_contrato")
def test_sync_no_inserta_item_nuevo_en_presupuesto(mock_ppto, mock_patch, _ag, _cf, _sin):
    mock_ppto.return_value = {
        "PK1": {
            ("02", "2.1"): (Decimal("100"), "m3", Decimal("50000")),
            ("02", "2.2"): (Decimal("50"), "m3", Decimal("60000")),
        },
    }
    acts = [
        {
            "id": "a1",
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.1",
            "segmento": 1,
            "cantidad_programada": 1,
        }
    ]
    sb = MagicMock()
    with patch.object(svc, "_fetch_actividades_version_all", return_value=acts):
        out = svc.sync_presupuesto_version(sb, "ver-1", 3)

    assert out["actividades_actualizadas"] == 1
    assert len(mock_patch.call_args[0][1]) == 1
