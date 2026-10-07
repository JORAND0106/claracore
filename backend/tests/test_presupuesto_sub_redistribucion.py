"""Tests puros — redistribución de cantidades compartidas entre subcontratistas."""
from presupuesto_sub_redistribucion import (
    atribuir_ejecutado_a_filas,
    proporciones_iguales,
    redistribuir_cantidades,
    saldo_disponible,
    validar_proporciones,
)


def test_proporciones_iguales_dos():
    p = proporciones_iguales([10, 20])
    assert abs(sum(p.values()) - 1.0) < 1e-9
    assert abs(p[10] - 0.5) < 1e-6
    assert abs(p[20] - 0.5) < 1e-6


def test_proporciones_iguales_tres():
    p = proporciones_iguales([1, 2, 3])
    assert abs(sum(p.values()) - 1.0) < 1e-9
    assert len(p) == 3


def test_ejemplo_spec_a40_saldo60_5050():
    """A tenía 100, ejecutó 40; entra B; 50/50 → A=70, B=30."""
    out = redistribuir_cantidades(
        presupuestado=100,
        ejecutados={1: 40},
        proporciones={1: 0.5, 2: 0.5},
    )
    assert out[1] == 70.0
    assert out[2] == 30.0
    assert saldo_disponible(100, {1: 40}) == 60.0


def test_tres_subs_proporciones_distintas():
    out = redistribuir_cantidades(
        presupuestado=100,
        ejecutados={1: 20, 2: 10},
        proporciones={1: 0.2, 2: 0.3, 3: 0.5},
    )
    # saldo = 70; A=20+14=34, B=10+21=31, C=0+35=35
    assert out[1] == 34.0
    assert out[2] == 31.0
    assert out[3] == 35.0
    # ejecutados no disminuyen
    assert out[1] >= 20
    assert out[2] >= 10


def test_saldo_cero_o_negativo():
    assert saldo_disponible(50, {1: 50}) == 0.0
    assert saldo_disponible(40, {1: 50}) == 0.0
    out = redistribuir_cantidades(50, {1: 50}, {1: 0.5, 2: 0.5})
    assert out[1] == 50.0
    assert out[2] == 0.0


def test_validar_proporciones():
    assert validar_proporciones({1: 0.5, 2: 0.5}, [1, 2]) is None
    err = validar_proporciones({1: 0.4, 2: 0.5}, [1, 2])
    assert err and "1.00" in err
    err2 = validar_proporciones({1: 1.0}, [1, 2])
    assert err2 and "Falta" in err2


def test_atribuir_ejecutado_proporcional():
    out = atribuir_ejecutado_a_filas(40, [(10, 60), (11, 40)])
    assert abs(out[10] + out[11] - 40) < 0.02
    assert out[10] <= 60
    assert out[11] <= 40
