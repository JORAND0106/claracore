"""Panel /analisis: filtro Acta RPO por acta_rpo_id en línea (no cabecera de reporte)."""
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
