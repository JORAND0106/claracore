"""Evidencia unitaria: gap por redondeo por fila vs Σ-luego-ROUND2 (regla única)."""
from sicoe_valor_canonico import (
    clasificar_caso_integridad,
    inconsistencia_con_caso,
    InconsistenciaRegistro,
    norm_item,
    resumen_integridad,
    round_cant,
    valor_cant_vu,
    CASO_AFECTA_TOTALES,
    CASO_VALOR_GUARDADO,
)


def test_norm_item_strips_dot_underscore():
    assert norm_item("2.3._") == "2.3"
    assert norm_item("2.3.") == "2.3"
    assert norm_item("NP-09.") == "NP-09"


def test_sum_then_round_vs_round_each_diverge():
    """Regla única: Σ cant cruda → ROUND2 → ×VU. Round-each-then-sum diverge."""
    cants = [1.004, 2.004, 3.006, 0.003, 10.004, 5.005]
    vu = 1000.0
    total_raw = sum(cants)
    canon = valor_cant_vu(round_cant(total_raw), vu)
    total_rowd = sum(round(c, 2) for c in cants)
    legado = valor_cant_vu(round(total_rowd, 2), vu)
    # ROUND(1.004+2.004+3.006+0.003+10.004+5.005,2)=21.03
    # Σ ROUND2 = 1.00+2.00+3.01+0.00+10.00+5.00 = 21.01
    assert round_cant(total_raw) == 21.03
    assert round(total_rowd, 2) == 21.01
    assert canon == 21030.0
    assert legado == 21010.0
    assert abs(legado - canon) == 20.0


def test_clasificacion_integridad_casos():
    assert clasificar_caso_integridad("sin_item") == CASO_AFECTA_TOTALES
    assert clasificar_caso_integridad("cap_item_ausente_en_listado") == CASO_AFECTA_TOTALES
    assert clasificar_caso_integridad("cd_guardado_distinto_cant_x_vu") == CASO_VALOR_GUARDADO
    incs = [
        InconsistenciaRegistro(
            registro_id=1,
            numero_registro=1,
            capitulo="",
            item_numero="",
            tipo="sin_item",
            detalle="x",
            impacto_plata=100,
        ),
        InconsistenciaRegistro(
            registro_id=2,
            numero_registro=2,
            capitulo="C",
            item_numero="1",
            tipo="cd_guardado_distinto_cant_x_vu",
            detalle="y",
            impacto_plata=50,
        ),
    ]
    r = resumen_integridad(incs)
    assert r["afectan_totales"]["n_registros"] == 1
    assert r["valor_guardado_desactualizado"]["n_registros"] == 1
    d = inconsistencia_con_caso(incs[0])
    assert d["caso"] == CASO_AFECTA_TOTALES
    assert "afecta" in d["caso_label"].lower()
