"""Infraestructura vive en pk_ids, no en presupuesto."""
from presupuesto_helpers import _presupuesto_infra_filter_vals


def test_infra_filter_vals_singular_y_multi():
    assert _presupuesto_infra_filter_vals("Calzada", None) == ["Calzada"]
    assert _presupuesto_infra_filter_vals(None, ["Calzada", "Berm Izq", "Calzada"]) == [
        "Calzada",
        "Berm Izq",
    ]
    assert _presupuesto_infra_filter_vals("  ", []) == []
    assert _presupuesto_infra_filter_vals(None, None) == []
