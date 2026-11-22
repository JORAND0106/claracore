"""Tests unitarios — subdivisión de PK en subsectores por abscisa."""
from decimal import Decimal

import pytest

from prog_obra_subsectores import (
    absorber_redondeo_ultimo_subsector,
    asignar_excepcion_a_subsector,
    calcular_cantidades_subsector,
    cantidad_automatica,
    clasificar_lineas_para_subsector,
    display_label_subsector,
    es_excepcion_reparto,
    format_abscisa_label,
    lineas_sin_abscisado,
    parse_abscisa_label,
    pendiente_por_linea,
    round_abscisa_decena_m,
    validar_cobertura_cantidades,
    validar_rango_dentro_pk,
    validar_sin_solape,
    SubsectorError,
)


def test_round_abscisa_decena():
    assert round_abscisa_decena_m(3204) == 3200
    assert round_abscisa_decena_m(3205) == 3210
    assert round_abscisa_decena_m("3+204") == 3200
    assert format_abscisa_label(3200) == "K3+200"
    assert format_abscisa_label(3000) == "K3+000"
    assert parse_abscisa_label("K3+200") == 3200.0
    assert parse_abscisa_label("3+010") == 3010.0


def test_display_label():
    assert display_label_subsector("PK-12", 3000, 3200) == "PK-12 · K3+000–K3+200"


def test_lineas_sin_abscisado():
    rows = [
        {"capitulo": "1", "item": "A", "abs_inicio": 100, "abs_final": 200},
        {"capitulo": "1", "item": "B", "abs_inicio": None, "abs_final": None, "descripcion": "sin abs"},
    ]
    sin = lineas_sin_abscisado(rows)
    assert len(sin) == 1
    assert sin[0]["item"] == "B"


def test_excepcion_corta_y_unidad():
    assert es_excepcion_reparto({"abs_inicio": 100, "abs_final": 103, "und": "m"}) is True
    assert es_excepcion_reparto({"abs_inicio": 100, "abs_final": 200, "und": "un"}) is True
    assert es_excepcion_reparto({"abs_inicio": 100, "abs_final": 200, "und": "m3"}) is False


def test_clasificar_y_automatico_cruza():
    lineas = [
        {"id": 1, "capitulo": "1", "item": "L1", "abs_inicio": 3000, "abs_final": 3500, "cant_total": 100, "und": "m"},
        {"id": 2, "capitulo": "1", "item": "L2", "abs_inicio": 3000, "abs_final": 3100, "cant_total": 50, "und": "m"},
        {"id": 3, "capitulo": "1", "item": "L3", "abs_inicio": 3050, "abs_final": 3053, "cant_total": 1, "und": "m"},
    ]
    clases = clasificar_lineas_para_subsector(lineas, 3000, 3200)
    assert len(clases["cruzan"]) == 1
    assert clases["cruzan"][0]["item"] == "L1"
    assert len(clases["completas"]) == 1
    assert clases["completas"][0]["item"] == "L2"
    assert len(clases["excepciones"]) == 1

    cant = cantidad_automatica(lineas[0], 3000, 3200)
    # 200/500 * 100 = 40
    assert cant == Decimal("40.00")

    asigns, cruzan = calcular_cantidades_subsector(lineas, 3000, 3200, modo="automatico")
    assert cruzan == []
    by_item = {a["item"]: a for a in asigns}
    assert by_item["L1"]["cantidad"] == 40.0
    assert by_item["L2"]["cantidad"] == 50.0
    assert by_item["L3"]["modo"] == "excepcion"
    assert by_item["L3"]["cantidad"] == 1.0


def test_manual_no_supera_total():
    lineas = [
        {"id": 1, "capitulo": "1", "item": "L1", "abs_inicio": 3000, "abs_final": 3500, "cant_total": 100, "und": "m"},
    ]
    key = "snap:1"
    with pytest.raises(SubsectorError):
        calcular_cantidades_subsector(
            lineas, 3000, 3200, modo="manual", manual={key: 200}
        )


def test_excepcion_empate_va_al_dibujando():
    row = {"abs_inicio": 3000, "abs_final": 3200, "und": "un", "cant_total": 1}
    # solape 100 de 200 → empate
    assert asignar_excepcion_a_subsector(row, 3000, 3100, dibujando=True) is True
    assert asignar_excepcion_a_subsector(row, 3000, 3100, dibujando=False) is False


def test_cobertura_y_pendiente_y_redondeo():
    lineas = [
        {"id": 1, "capitulo": "1", "item": "L1", "abs_inicio": 0, "abs_final": 100, "cant_total": 10},
    ]
    a1 = [{"linea_key": "snap:1", "capitulo": "1", "item": "L1", "cantidad": 3.33}]
    a2 = [{"linea_key": "snap:1", "capitulo": "1", "item": "L1", "cantidad": 3.33}]
    a3 = [{"linea_key": "snap:1", "capitulo": "1", "item": "L1", "cantidad": 3.33}]
    adjusted = absorber_redondeo_ultimo_subsector(lineas, [a1, a2, a3])
    suma = sum(Decimal(str(a[0]["cantidad"])) for a in adjusted)
    assert suma == Decimal("10.00")

    pend = pendiente_por_linea(lineas, adjusted)
    assert pend[0]["cantidad_pendiente"] == 0.0

    errs = validar_cobertura_cantidades(
        lineas,
        [[{"linea_key": "snap:1", "capitulo": "1", "item": "L1", "cantidad": 12}]],
    )
    assert errs and "supera" in errs[0]["mensaje"]


def test_validar_rango_y_solape():
    validar_rango_dentro_pk(3000, 3200, 2800, 3500)
    with pytest.raises(SubsectorError):
        validar_rango_dentro_pk(3000, 3200, 3100, 3500)
    with pytest.raises(SubsectorError):
        validar_rango_dentro_pk(3005, 3200, 2800, 3500)
    validar_sin_solape(3200, 3400, [{"id": "a", "abs_inicio_m": 3000, "abs_final_m": 3200}])
    with pytest.raises(SubsectorError):
        validar_sin_solape(3100, 3300, [{"id": "a", "abs_inicio_m": 3000, "abs_final_m": 3200}])
