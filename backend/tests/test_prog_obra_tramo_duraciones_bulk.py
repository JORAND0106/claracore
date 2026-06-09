"""Guardado solo duración en tramo — inserta filas tras reset."""
from __future__ import annotations

from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_service import apply_tramo_duraciones_bulk


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_apply_tramo_duraciones_bulk_usa_upsert(monkeypatch):
    sb = MagicMock()
    import prog_obra_service as svc

    svc.fetch_tramos_contrato = MagicMock(
        return_value=[{"tramo": "TRAMO 7", "pk_ids": ["120367", "120368"]}],
    )
    svc._aggregate_ppto_rows_tramo = MagicMock(
        return_value={
            "2. CAP": {
                16: {"pk_ids": {"120367", "120368"}},
            },
        },
    )
    svc._build_agrupador_pk_metrics = MagicMock(
        return_value={
            ("2. CAP", 16, "120367"): {"cant_total": 1.0, "und": "m3", "vlr_unitario": 100.0},
            ("2. CAP", 16, "120368"): {"cant_total": 1.0, "und": "m3", "vlr_unitario": 100.0},
        },
    )
    upsert = MagicMock(return_value={"ok": True, "propagaciones": 0})
    monkeypatch.setattr(svc, "upsert_actividades_batch_pk", upsert)
    sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{"pk_id": "120367", "capitulo": "2. CAP", "item": "2.C", "cant_total": 1, "und": "m3", "vlr_unitario": 100, "costo_directo": 100}],
    )
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    result = apply_tramo_duraciones_bulk(
        sb,
        contrato_id=3,
        version_id="00000000-0000-0000-0000-000000000001",
        tramo="TRAMO 7",
        actividades=[
            {
                "capitulo": "2. CAP",
                "item": "2.C",
                "agrupador_id": 16,
                "duracion_dias_habiles": 12,
                "codigo_wbs": "2.C",
            },
        ],
        uid=1,
        cache=_cache(),
    )

    assert result["agrupadores"] == 1
    assert result["filas"] == 2
    assert upsert.call_count == 2
    first_batch = upsert.call_args_list[0][0][4]
    assert first_batch[0]["duracion_dias_habiles"] == 12
    assert first_batch[0]["clear_schedule"] is False
