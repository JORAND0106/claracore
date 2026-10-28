"""Unit tests — fuente combinada y agregación por PK para transporte."""
from __future__ import annotations

from presupuesto_export_obra_ejecutada import ORIGEN_PRESUPUESTO, ORIGEN_SICOE_OBRA
from presupuesto_transporte_fuentes import agregar_por_pk, _item_variants


def test_item_variants_incluye_punto():
    v = _item_variants(["8.01", "8.02."])
    assert "8.01" in v and "8.01." in v
    assert "8.02." in v and "8.02" in v


def test_agregar_por_pk_suma_y_ubicacion_mayor_cant():
    rows = [
        {
            "pk_id": "A",
            "cant_total": 2,
            "tramo": "T1",
            "calzada": "C1",
            "competencia": "IDU",
            "_origen_export": ORIGEN_PRESUPUESTO,
        },
        {
            "pk_id": "A",
            "cant_total": 8,
            "tramo": "T2",
            "calzada": "C2",
            "civ": "CIV-9",
            "infraestructura": "Red",
            "no_inicio": "N1",
            "no_final": "N2",
            "competencia": "CODENSA",
            "_origen_export": ORIGEN_SICOE_OBRA,
        },
        {
            "pk_id": "B",
            "cant_total": 5,
            "tramo": "TB",
            "competencia": "IDU",
            "_origen_export": ORIGEN_PRESUPUESTO,
        },
    ]
    filas = agregar_por_pk(rows, {})
    by = {f["pk_id"]: f for f in filas}
    assert by["A"]["cant_compacta"] == 10
    assert by["A"]["ubicacion"]["tramo"] == "T2"
    assert by["A"]["ubicacion"]["civ"] == "CIV-9"
    assert by["A"]["ubicacion"]["no_inicio"] == "N1"
    assert by["A"]["origen"] == ORIGEN_SICOE_OBRA
    assert by["A"]["competencia"] == "CODENSA"
    assert by["B"]["cant_compacta"] == 5
    assert by["B"]["competencia"] == "IDU"
    assert by["B"]["origen"] == ORIGEN_PRESUPUESTO


def test_agregar_por_pk_civ_desde_maestro_si_falta():
    rows = [{"pk_id": "P1", "cant_total": 3, "tramo": "T", "_origen_export": ORIGEN_PRESUPUESTO}]
    filas = agregar_por_pk(rows, {"P1": {"civ": "CIV-M", "infraestructura": "Inf"}})
    assert filas[0]["ubicacion"]["civ"] == "CIV-M"
    assert filas[0]["ubicacion"]["infraestructura"] == "Inf"


def test_comp_eq_trim():
    from presupuesto_transporte_fuentes import _comp_eq
    assert _comp_eq(" IDU ", "IDU")
    assert _comp_eq("", "")
    assert not _comp_eq("IDU", "CODENSA")


def test_ordenar_competencias_vacia_al_final():
    from presupuesto_transporte_fuentes import _ordenar_competencias
    out = _ordenar_competencias({"Zebra", "", "Alpha", "beta"})
    assert out[-1] == ""
    assert out[0] == "Alpha"
    assert "Zebra" in out and "beta" in out
