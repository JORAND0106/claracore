"""Tests agregado panel validación Interventoría."""
from presupuesto_panel_validacion import panel_validacion_rpc_a_filas, presupuesto_filtros_a_jsonb


def test_filtros_jsonb_capitulos():
    j = presupuesto_filtros_a_jsonb(capitulo="1. Cap", tramo="T1")
    assert j["capitulos"] == ["1. Cap"]
    assert j["tramos"] == ["T1"]


def test_panel_filas_desde_rpc():
    data = {
        "nivel": "capitulo",
        "total_registros": 3,
        "grupos": [
            {
                "capitulo": "1. Test",
                "item": None,
                "descripcion": "",
                "und": "",
                "cant_total": 0,
                "total_registros": 3,
                "total_costo": 300,
                "por_estado": {
                    "No Revisado": {"registros": 2, "costo_directo": 200},
                    "Aprobado": {"registros": 1, "costo_directo": 100},
                },
            },
        ],
    }
    filas = panel_validacion_rpc_a_filas(data, "capitulo")
    assert len(filas) == 1
    assert filas[0]["totalRegs"] == 3
    assert filas[0]["celdas"]["No Revisado"]["count"] == 2
    assert filas[0]["pctValidado"] == 33
