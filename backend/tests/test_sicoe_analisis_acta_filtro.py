"""Panel y grilla: filtro Acta RPO del modal por línea (so_registros.acta_rpo_id)."""
from unittest.mock import MagicMock, patch

import main as m


def test_analisis_acta_filtro_linea_single():
    class _Q:
        def __init__(self):
            self.calls = []

        def eq(self, col, val):
            self.calls.append(("eq", col, val))
            return self

        def in_(self, col, vals):
            self.calls.append(("in_", col, vals))
            return self

    q = _Q()
    m._sicoe_registros_q_filtrar_actas_linea(q, [616])
    assert ("eq", "acta_rpo_id", 616) in q.calls


def test_analisis_aplicar_filtro_actas_panel_usa_linea():
    q = MagicMock()
    m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=False)
    q.eq.assert_called_once_with("acta_rpo_id", 616)


def test_analisis_aplicar_filtro_actas_mapa_calor_usa_scope_cabecera():
    """Mapa de calor sigue por cabecera (coords en so_reportes); no es el modal de filtros."""
    with patch("main._sicoe_reporte_ids_por_acta_ids", return_value=[101, 202]) as mock_rep:
        q = MagicMock()
        m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=True)
    mock_rep.assert_called_once_with(2, [616])
    q.in_.assert_called_once_with("reporte_id", [101, 202])


def test_grilla_linea_filtros_usa_acta_en_linea_como_panel():
    """Collect/grilla del modal: Acta en so_registros.acta_rpo_id (no cabecera)."""
    q = MagicMock()
    with patch("main._sicoe_registros_q_filtrar_actas_scope") as mock_scope:
        with patch("main._apply_acta_rpo_ids_to_so_registros_q", return_value=q) as mock_line:
            out = m._sicoe_so_registros_q_linea_filtros_busqueda(
                q, acta_rpo_ids=[616], contrato_id=2
            )
    mock_scope.assert_not_called()
    mock_line.assert_called_once_with(q, [616])
    assert out is q


def test_collect_pasa_acta_en_linea_sin_reescribir_a_cabecera():
    """Collect del modal mantiene acta_rpo_ids en la query de línea (no scope cabecera)."""
    calls = []

    def _capture(q, **kwargs):
        calls.append(kwargs)
        return q

    def _exec(fn):
        return fn() if callable(fn) else []

    with patch("main._sicoe_reporte_ids_por_acta_ids") as mock_hdr:
        with patch("main._sicoe_so_registros_q_linea_filtros_busqueda", side_effect=_capture):
            with patch("main.supabase_execute", side_effect=_exec):
                with patch("main.supabase") as mock_sb:
                    chain = MagicMock()
                    mock_sb.table.return_value.select.return_value.eq.return_value = chain
                    chain.order.return_value.range.return_value.execute.return_value.data = []
                    m._sicoe_collect_reporte_ids_misma_linea(
                        2,
                        acta_rpo_ids=[616],
                        capas_v=[{"campo": "nivel4_estado", "estado": "Aprobado"}],
                    )
    mock_hdr.assert_not_called()
    assert calls, "debió invocar filtros de línea"
    assert calls[0].get("acta_rpo_ids") == [616]
    assert calls[0].get("reporte_id_in") is None
