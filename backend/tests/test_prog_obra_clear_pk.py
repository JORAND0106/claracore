"""Reset programación por PK — borra actividades, capítulo y CPM."""
from unittest.mock import MagicMock, patch

from prog_obra_service import clear_pk_programacion


def test_clear_pk_borra_actividades_capitulo_y_cpm():
    sb = MagicMock()
    delete_chain = MagicMock()
    delete_chain.eq.return_value = delete_chain
    delete_chain.execute.return_value = MagicMock(data=[])

    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.execute.return_value = MagicMock(count=3)

    def table(name):
        m = MagicMock()
        if name == "prog_actividades":
            m.select.return_value = select_chain
        m.delete.return_value = delete_chain
        return m

    sb.table.side_effect = table

    with patch("prog_obra_service.assert_version_borrador", return_value={"contrato_id": 3}), patch(
        "prog_obra_service.upsert_prog_pk_estado"
    ) as upsert, patch("prog_obra_service.mark_cpm_dirty") as dirty:
        out = clear_pk_programacion(sb, "vid", 3, "120367")

    assert out["ok"] is True
    assert out["eliminados"] == 3
    assert delete_chain.execute.call_count == 3
    upsert.assert_called_once_with(sb, "vid", 3, "120367")
    dirty.assert_called_once()
