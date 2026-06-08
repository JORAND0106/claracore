"""Write-back CPM: fechas sí, duración manual no."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_cpm import NodoCPM
from prog_obra_service import _apply_cpm_fechas_bulk


def test_apply_cpm_fechas_bulk_update_sin_duracion():
    n = NodoCPM(
        pk_id="PK1",
        capitulo="03",
        duracion=15,
        fecha_inicio_base=date(2026, 1, 1),
        fecha_fin_base=date(2026, 1, 15),
        agrupador_id="10",
    )
    n.fecha_inicio_temprana = date(2026, 3, 1)
    n.fecha_fin_temprana = date(2026, 3, 19)

    sb = MagicMock()
    update_payloads: list[dict] = []

    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.in_.return_value = select_chain
    select_chain.not_.is_.return_value = select_chain
    select_chain.execute.return_value = MagicMock(
        data=[{"id": "row-1", "pk_id": "PK1", "capitulo": "03", "agrupador_id": 10}]
    )

    table_mock = MagicMock()
    table_mock.select.return_value = select_chain

    def capture_update(payload):
        update_payloads.append(dict(payload))
        chain = MagicMock()
        chain.in_.return_value = chain
        chain.execute.return_value = MagicMock(data=[])
        return chain

    table_mock.update.side_effect = capture_update
    sb.table.return_value = table_mock

    count = _apply_cpm_fechas_bulk(sb, "vid", [n])
    assert count == 1
    assert update_payloads
    payload = update_payloads[0]
    assert payload["fecha_inicio"] == "2026-03-01"
    assert payload["fecha_fin_calculada"] == "2026-03-19"
    assert payload["override_manual"] is False
    assert "duracion_dias_habiles" not in payload
    table_mock.upsert.assert_not_called()
