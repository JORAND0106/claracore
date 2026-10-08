"""Tests: criterio ejecutado reconocido, Mantener/Saldar, no-reemplazo."""
from presupuesto_sub_redistribucion import (
    DECISION_MANTENER,
    DECISION_SALDAR,
    participantes_desde_decisiones,
    proporciones_iguales,
    redistribuir_cantidades,
    redistribuir_con_decisiones,
    saldo_disponible,
    validar_proporciones,
)


def test_saldar_a_queda_ejecutado_b_recibe_saldo():
    """A tenía 100, ejec 40; saldar A → A=40, B=60."""
    out = redistribuir_con_decisiones(
        presupuestado=100,
        ejecutados={1: 40, 2: 0},
        proporciones={2: 1.0},
        participantes=[2],
        saldados=[1],
    )
    assert out[1] == 40.0
    assert out[2] == 60.0


def test_mantener_5050_igual_que_antes():
    out = redistribuir_con_decisiones(
        presupuestado=100,
        ejecutados={1: 40, 2: 0},
        proporciones={1: 0.5, 2: 0.5},
        participantes=[1, 2],
        saldados=[],
    )
    assert out[1] == 70.0
    assert out[2] == 30.0


def test_tres_subs_uno_saldado_dos_participantes():
    # A ejec 20 saldado; B y C participan 0.4 / 0.6; saldo = 100-20-10 = 70? B ejec 10
    out = redistribuir_con_decisiones(
        presupuestado=100,
        ejecutados={1: 20, 2: 10, 3: 0},
        proporciones={2: 0.4, 3: 0.6},
        participantes=[2, 3],
        saldados=[1],
    )
    assert out[1] == 20.0
    # saldo = 100 - 20 - 10 = 70
    assert out[2] == 10.0 + 28.0  # 38
    assert out[3] == 42.0
    assert out[2] >= 10
    assert out[1] == 20


def test_saldar_sin_ejecutado_queda_cero():
    out = redistribuir_con_decisiones(
        presupuestado=50,
        ejecutados={1: 0, 2: 0},
        proporciones={2: 1.0},
        participantes=[2],
        saldados=[1],
    )
    assert out[1] == 0.0
    assert out[2] == 50.0


def test_participantes_desde_decisiones():
    parts, saldados = participantes_desde_decisiones(
        [10, 20], 30, {10: DECISION_SALDAR, 20: DECISION_MANTENER},
    )
    assert parts == [20, 30]
    assert saldados == [10]


def test_default_mantener_si_falta_decision():
    parts, saldados = participantes_desde_decisiones([10], 20, {})
    assert parts == [10, 20]
    assert saldados == []


def test_proporciones_solo_participantes_tras_saldar():
    parts, _ = participantes_desde_decisiones(
        [1, 2], 3, {1: DECISION_SALDAR, 2: DECISION_MANTENER},
    )
    props = proporciones_iguales(parts)
    assert abs(sum(props.values()) - 1.0) < 1e-9
    assert 1 not in props
    assert validar_proporciones(props, parts) is None


def test_saldo_no_cambia_por_decision_saldar():
    """El saldo depende del ejecutado, no de la cantidad asignada previa."""
    assert saldo_disponible(100, {1: 40}) == 60.0
    # Mantener o saldar no altera el saldo base
    out_m = redistribuir_cantidades(100, {1: 40}, {1: 0.5, 2: 0.5})
    out_s = redistribuir_con_decisiones(100, {1: 40}, {2: 1.0}, [2], [1])
    assert saldo_disponible(100, {1: 40}) == 60.0
    assert out_m[1] + out_m[2] == 100.0
    assert out_s[1] + out_s[2] == 100.0
