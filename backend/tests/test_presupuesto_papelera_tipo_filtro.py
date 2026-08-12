"""Papelera sin tipo_ejecucion explícito no debe filtrar por tipo."""
import os

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")


class _QStub:
    def __init__(self):
        self.ops = []

    def eq(self, col, val):
        self.ops.append(("eq", col, val))
        return self


def test_papelera_sin_tipo_no_filtra():
    from main import _presupuesto_q_tipo_ejecucion_opcional

    q = _QStub()
    out = _presupuesto_q_tipo_ejecucion_opcional(q, None, papelera=True)
    assert out.ops == []


def test_papelera_con_tipo_si_filtra():
    from main import _presupuesto_q_tipo_ejecucion_opcional

    q = _QStub()
    out = _presupuesto_q_tipo_ejecucion_opcional(q, "Obra Ejecutada", papelera=True)
    assert out.ops == [("eq", "tipo_ejecucion", "Obra Ejecutada")]


def test_activos_sin_tipo_usa_default():
    from main import _PRESUPUESTO_TIPO_EJECUCION_DEFAULT, _presupuesto_q_tipo_ejecucion_opcional

    q = _QStub()
    out = _presupuesto_q_tipo_ejecucion_opcional(q, None, papelera=False)
    assert out.ops == [("eq", "tipo_ejecucion", _PRESUPUESTO_TIPO_EJECUCION_DEFAULT)]
