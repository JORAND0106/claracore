"""Tests — sincronización vlr_unitario con listado de precios."""
from presupuesto_sincronizar_vlr import _aplicar_filtros_listado, _norm_item_key


def test_norm_item_key_trailing_dots():
    assert _norm_item_key("4.22.") == "4.22"
    assert _norm_item_key("  1.01  ") == "1.01"
    assert _norm_item_key(None) == ""
    assert _norm_item_key("") == ""


class _QStub:
    def __init__(self):
        self.ops = []

    def eq(self, col, val):
        self.ops.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.ops.append(("in_", col, list(vals)))
        return self

    def gte(self, col, val):
        self.ops.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self.ops.append(("lte", col, val))
        return self

    def ilike(self, col, val):
        self.ops.append(("ilike", col, val))
        return self

    def or_(self, expr):
        self.ops.append(("or_", expr))
        return self

    def is_(self, col, val):
        self.ops.append(("is_", col, val))
        return self

    def not_(self):
        return self


def test_aplicar_filtros_listado_recibe_sb_y_contrato_id():
    """Regresión: NameError 'supabase' / 'contrato_id' no definidos en el helper."""
    q = _QStub()
    sb = object()  # no se usa si no hay filtro de infraestructura
    out = _aplicar_filtros_listado(q, sb, 42, {"tipo_ejecucion": "Presupuesto de Obra"})
    assert out is q
    assert ("eq", "dado_de_baja", False) in q.ops
    assert ("eq", "tipo_ejecucion", "Presupuesto de Obra") in q.ops
