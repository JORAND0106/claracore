"""Batch upsert: borrar fechas con clear_schedule."""
from __future__ import annotations

from unittest.mock import MagicMock, call

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_service import upsert_actividades_batch_pk


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_upsert_batch_clear_schedule_llama_update_explicito():
    sb = MagicMock()
    sb.rpc.return_value.execute.return_value = MagicMock(data={"ok": True, "actividades": []})

    update_chain = MagicMock()
    sb.table.return_value.update.return_value = update_chain
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[])

    actividades = [
        {
            "capitulo": "2. ESTRUCTURA",
            "item": "2.C",
            "segmento": 1,
            "fecha_inicio": None,
            "duracion_dias_habiles": None,
            "clear_schedule": True,
            "agrupador_id": 16,
            "codigo_wbs": "2.C",
            "_propagate": {
                "capitulo": "2. ESTRUCTURA",
                "agrupador_id": 16,
                "codigo_wbs": "2.C",
                "item": "2.C",
            },
        }
    ]

    result = upsert_actividades_batch_pk(
        sb,
        contrato_id=3,
        version_id="00000000-0000-0000-0000-000000000001",
        pk_id="120369",
        actividades=actividades,
        uid=1,
        cache=_cache(),
    )

    assert result.get("limpiezas_ag") == 1
    rpc_payload = sb.rpc.call_args[0][1]["p_actividades"]
    assert rpc_payload[0]["clear_schedule"] is True
    sb.table.assert_called()
    update_calls = sb.table.return_value.update.call_args_list
    assert any(
        c.args[0].get("fecha_inicio") is None and c.args[0].get("fecha_inicio_temprana") is None
        for c in update_calls
    )
