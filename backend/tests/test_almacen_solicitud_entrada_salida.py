"""Estados Entrada/Salida (Total|Parcial) para grilla de solicitudes."""
from almacen_service import (
    _estado_entrada_vs_oc,
    _estado_salida_vs_entrada,
    _rollup_estados_parcial_total,
)


def test_estado_entrada_vs_oc():
    assert _estado_entrada_vs_oc([]) is None
    assert _estado_entrada_vs_oc(
        [{"cantidad": 100, "cantidad_recibida": 0}]
    ) is None
    assert _estado_entrada_vs_oc(
        [{"cantidad": 100, "cantidad_recibida": 40}]
    ) == "parcial"
    assert _estado_entrada_vs_oc(
        [{"cantidad": 100, "cantidad_recibida": 100}]
    ) == "total"
    assert _estado_entrada_vs_oc(
        [{"cantidad": 50, "cantidad_recibida": 50}, {"cantidad": 50, "cantidad_recibida": 20}]
    ) == "parcial"
    assert _estado_entrada_vs_oc(
        [{"cantidad": 10, "cantidad_recibida": 10}], "anulada"
    ) is None


def test_estado_salida_vs_entrada():
    assert _estado_salida_vs_entrada([], {}) is None
    items = [{"id": 1, "cantidad_recibida": 40}]
    assert _estado_salida_vs_entrada(items, {}) is None
    assert _estado_salida_vs_entrada(items, {1: 10}) == "parcial"
    assert _estado_salida_vs_entrada(items, {1: 40}) == "total"
    # Salida se mide contra lo recibido, no contra la OC
    assert _estado_salida_vs_entrada(
        [{"id": 1, "cantidad_recibida": 40}],
        {1: 40},
    ) == "total"


def test_rollup_estados_parcial_total():
    assert _rollup_estados_parcial_total([]) is None
    assert _rollup_estados_parcial_total([None, None]) is None
    assert _rollup_estados_parcial_total(["total", "total"]) == "total"
    assert _rollup_estados_parcial_total(["total", None]) == "parcial"
    assert _rollup_estados_parcial_total(["parcial", "total"]) == "parcial"
