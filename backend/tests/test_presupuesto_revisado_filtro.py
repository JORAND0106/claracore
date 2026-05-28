"""Filtro revisado «No Revisado» incluye filas con revisado NULL."""

from presupuesto_helpers import _presupuesto_q_filtros_ubicacion


class _FakeQ:
    def __init__(self):
        self.ops = []

    def or_(self, expr):
        self.ops.append(("or_", expr))
        return self

    def eq(self, col, val):
        self.ops.append(("eq", col, val))
        return self


def test_revisado_no_revisado_usa_or_null():
    q = _FakeQ()
    _presupuesto_q_filtros_ubicacion(q, revisado="No Revisado")
    assert ("or_", 'revisado.is.null,revisado.eq."No Revisado"') in q.ops


def test_revisado_aprobado_usa_eq():
    q = _FakeQ()
    _presupuesto_q_filtros_ubicacion(q, revisado="Aprobado")
    assert ("eq", "revisado", "Aprobado") in q.ops
