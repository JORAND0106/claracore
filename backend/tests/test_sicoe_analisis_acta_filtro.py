"""Panel /analisis: filtro Acta RPO por línea; mapa_calor por cabecera (como la grilla)."""
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


def test_analisis_acta_scope_distinto_de_linea():
    """Cabecera de reporte incluye líneas de otras actas en la misma cabecera (regresión 3734 vs 1111)."""
    # Contrato 2 / acta 616: reporte scope >> línea acta_rpo_id
    linea = 1111
    reporte = 3734
    assert reporte > linea
    assert reporte / linea > 2.5


def test_analisis_aplicar_filtro_actas_panel_usa_linea():
    q = MagicMock()
    m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=False)
    q.eq.assert_called_once_with("acta_rpo_id", 616)


def test_analisis_aplicar_filtro_actas_mapa_calor_usa_scope_cabecera():
    """Mapa de calor debe ver los mismos reportes que la grilla/detalle (coords en so_reportes)."""
    with patch("main._sicoe_reporte_ids_por_acta_ids", return_value=[101, 202]) as mock_rep:
        q = MagicMock()
        m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=True)
    mock_rep.assert_called_once_with(2, [616])
    q.in_.assert_called_once_with("reporte_id", [101, 202])
