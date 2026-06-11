"""Cache prog_pk_ejecutado y enriquecimiento mapa."""
from unittest.mock import MagicMock, patch

from prog_obra_ejecutado import (
    _ejecutado_pct,
    enrich_mapa_rows_with_ejecutado,
    refresh_prog_pk_ejecutado,
)


def test_ejecutado_pct():
    assert _ejecutado_pct(1000, 250) == 25.0
    assert _ejecutado_pct(0, 100) == 100.0
    assert _ejecutado_pct(0, 0) == 0.0


def test_enrich_mapa_rows_with_ejecutado():
    rows = [{"pk_id": "120367", "estado_programacion": "completa"}]
    ej = {"120367": {"presupuesto_directo": 1000, "ejecutado": 400, "ejecutado_pct": 40.0}}
    out = enrich_mapa_rows_with_ejecutado(rows, ej)
    assert out[0]["ejecutado"] == 400.0
    assert out[0]["ejecutado_pct"] == 40.0
    assert out[0]["presupuesto_directo"] == 1000.0


@patch("prog_obra_ejecutado.resolve_ppto_vigente_version_id", return_value="vid")
@patch("prog_obra_ejecutado._aggregate_presupuesto_por_pk", return_value={"120367": 1000.0})
@patch("prog_obra_ejecutado._aggregate_ejecutado_por_pk", return_value={"120367": 250.0})
def test_refresh_prog_pk_ejecutado_upsert(_ej, _ppto, _vid):
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"pk_id": "120367"},
    ]
    sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    out = refresh_prog_pk_ejecutado(sb, 3)
    assert out["ok"] is True
    assert out["pk_count"] == 1
    sb.table.return_value.upsert.assert_called_once()
    row = sb.table.return_value.upsert.call_args[0][0][0]
    assert row["pk_id"] == "120367"
    assert row["ejecutado_pct"] == 25.0
