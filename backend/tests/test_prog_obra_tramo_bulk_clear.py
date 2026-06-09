"""Borrado masivo de fechas en tramo — pocas queries."""
from __future__ import annotations

from unittest.mock import MagicMock

from prog_obra_service import apply_actividades_batch_tramo, apply_tramo_clear_schedule_bulk
from prog_obra_calendar import CalendarioNoHabilesCache


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def _chain_mock():
    chain = MagicMock()
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.not_.is_.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    return chain


def test_apply_tramo_clear_schedule_bulk_tres_queries():
    sb = MagicMock()
    sb.table.return_value.update.return_value = _chain_mock()
    sb.table.return_value.delete.return_value = _chain_mock()

    import prog_obra_service as svc

    svc.fetch_tramos_contrato = MagicMock(
        return_value=[{"tramo": "TRAMO 7", "pk_ids": ["120367", "120368"]}],
    )
    svc._reset_prog_pk_estado_tramo = MagicMock()

    actividades = [
        {"capitulo": "2. CAP", "agrupador_id": 16, "clear_schedule": True},
        {"capitulo": "2. CAP", "agrupador_id": 14, "clear_schedule": True},
    ]
    result = apply_tramo_clear_schedule_bulk(
        sb,
        contrato_id=3,
        version_id="00000000-0000-0000-0000-000000000001",
        tramo="TRAMO 7",
        actividades=actividades,
        uid=1,
    )

    assert result["agrupadores"] == 2
    assert sb.table.return_value.update.call_count == 2
    assert sb.table.return_value.delete.call_count == 1
    svc._reset_prog_pk_estado_tramo.assert_called_once()


def test_apply_batch_tramo_solo_borrados_usa_fast_path():
    sb = MagicMock()
    sb.table.return_value.update.return_value = _chain_mock()
    sb.table.return_value.delete.return_value = _chain_mock()

    import prog_obra_service as svc

    svc.fetch_tramos_contrato = MagicMock(
        return_value=[{"tramo": "TRAMO 7", "pk_ids": ["120367"]}],
    )
    svc._reset_prog_pk_estado_tramo = MagicMock()
    svc.mark_cpm_dirty = MagicMock()

    result = apply_actividades_batch_tramo(
        sb,
        contrato_id=3,
        version_id="00000000-0000-0000-0000-000000000001",
        tramo="TRAMO 7",
        actividades=[
            {
                "capitulo": "2. CAP",
                "agrupador_id": 16,
                "fecha_inicio": None,
                "clear_schedule": True,
            },
        ],
        uid=1,
        cache=_cache(),
        allow_overwrite=True,
    )

    assert result["bulk_cleared"] == 1
    assert result["actividades_enviadas"] == 0
    sb.rpc.assert_not_called()
