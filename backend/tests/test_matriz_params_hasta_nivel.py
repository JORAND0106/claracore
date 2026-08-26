"""Filtro de nivel de aprobación para Preacta mensual (CC-MES)."""
from __future__ import annotations

import pytest

from ccd_conciliacion import (
    _registro_aprobado_matriz_panel,
    matriz_params_hasta_nivel,
)


def test_default_usa_maximo_de_activos():
    campo, cascada = matriz_params_hasta_nivel([1, 2, 4])
    assert campo == "nivel4_estado"
    assert cascada == [1, 2, 4]


def test_seleccion_nivel_intermedio_recorta_cascada():
    campo, cascada = matriz_params_hasta_nivel([1, 2, 3, 4], 2)
    assert campo == "nivel2_estado"
    assert cascada == [1, 2]


def test_seleccion_nivel_no_contiguo():
    """Activos 2 y 4; elegir 2 solo exige N2 (sin N1 ni N4)."""
    campo, cascada = matriz_params_hasta_nivel([2, 4], 2)
    assert campo == "nivel2_estado"
    assert cascada == [2]


def test_seleccion_ultimo_igual_default():
    campo_a, casc_a = matriz_params_hasta_nivel([2, 4], None)
    campo_b, casc_b = matriz_params_hasta_nivel([2, 4], 4)
    assert campo_a == campo_b == "nivel4_estado"
    assert casc_a == casc_b == [2, 4]


def test_nivel_no_activo_raises():
    with pytest.raises(ValueError, match="no está entre"):
        matriz_params_hasta_nivel([1, 3], 2)


def test_filtro_panel_respeta_cascada_recortada():
    """Con tope N2, un registro aprobado en N1+N2 entra aunque N4 no esté aprobado."""
    campo, cascada = matriz_params_hasta_nivel([1, 2, 4], 2)
    reg_ok = {
        "item_numero": "1.01",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel4_estado": "No Revisado",
    }
    reg_fail = {
        "item_numero": "1.02",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Pendiente",
        "nivel4_estado": "Aprobado",
    }
    assert _registro_aprobado_matriz_panel(reg_ok, cascada, campo) is True
    assert _registro_aprobado_matriz_panel(reg_fail, cascada, campo) is False


def test_filtro_panel_nivel_max_sigue_exigiendo_cascada_completa():
    campo, cascada = matriz_params_hasta_nivel([1, 2, 4], 4)
    reg = {
        "item_numero": "1.01",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel4_estado": "Aprobado",
    }
    reg_sin_n2 = {
        "item_numero": "1.02",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Pendiente",
        "nivel4_estado": "Aprobado",
    }
    assert _registro_aprobado_matriz_panel(reg, cascada, campo) is True
    assert _registro_aprobado_matriz_panel(reg_sin_n2, cascada, campo) is False
