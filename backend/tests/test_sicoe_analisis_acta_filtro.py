"""Panel /analisis y grilla: mismo universo Acta RPO (cabecera ∪ línea)."""
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


def test_universo_acta_une_cabecera_y_lineas():
    with patch.object(m, "_sicoe_reporte_ids_por_acta_ids", return_value=[10, 20]):
        with patch.object(m, "_sicoe_reporte_ids_por_acta_en_lineas", return_value=[20, 30]):
            out = m._sicoe_reporte_ids_universo_acta(2, [616])
    assert out == [10, 20, 30]


def test_analisis_aplicar_filtro_actas_panel_usa_universo():
    """Panel y grilla comparten universo (ya no solo línea)."""
    with patch.object(m, "_sicoe_reporte_ids_universo_acta", return_value=[101, 202]) as mock_u:
        q = MagicMock()
        m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=False)
    mock_u.assert_called_once_with(2, [616])
    q.in_.assert_called_once_with("reporte_id", [101, 202])


def test_analisis_aplicar_filtro_actas_mapa_calor_usa_universo():
    with patch.object(m, "_sicoe_reporte_ids_universo_acta", return_value=[101, 202]) as mock_u:
        q = MagicMock()
        m._sicoe_analisis_aplicar_filtro_actas(q, 2, [616], mapa_calor=True)
    mock_u.assert_called_once_with(2, [616])
    q.in_.assert_called_once_with("reporte_id", [101, 202])


def test_registros_q_filtrar_actas_scope_usa_universo():
    with patch.object(m, "_sicoe_reporte_ids_universo_acta", return_value=[10, 20]) as mock_u:
        q = MagicMock()
        m._sicoe_registros_q_filtrar_actas_scope(q, 3, [616])
    mock_u.assert_called_once_with(3, [616])
    q.in_.assert_called_once_with("reporte_id", [10, 20])
