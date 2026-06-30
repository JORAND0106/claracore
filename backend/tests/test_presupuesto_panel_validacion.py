"""Tests agregado panel validación Interventoría."""
from presupuesto_panel_validacion import (
    _enrich_rpc_por_estado_cant,
    _por_estado_sin_cantidad,
    panel_validacion_rpc_a_filas,
    presupuesto_filtros_a_jsonb,
)


def test_filtros_jsonb_capitulos():
    j = presupuesto_filtros_a_jsonb(capitulo="1. Cap", tramo="T1")
    assert j["capitulos"] == ["1. Cap"]
    assert j["tramos"] == ["T1"]


def test_por_estado_sin_cantidad_detecta_rpc_antigua():
    data = {
        "grupos": [{
            "capitulo": "1. X",
            "cant_total": 0,
            "por_estado": {
                "No Revisado": {"registros": 5, "costo_directo": 50},
            },
        }],
    }
    assert _por_estado_sin_cantidad(data) is True
    rows = [
        {"capitulo": "1. X", "item": None, "revisado": "No Revisado", "cant_total": 60},
        {"capitulo": "1. X", "item": None, "revisado": "Rechazado", "cant_total": 40},
    ]
    enriched = _enrich_rpc_por_estado_cant(data, rows, "capitulo")
    filas = panel_validacion_rpc_a_filas(enriched, "capitulo")
    assert filas[0]["celdas"]["No Revisado"]["cant"] == 60
    assert filas[0]["celdas"]["Rechazado"]["cant"] == 40


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
                    "No Revisado": {"registros": 2, "costo_directo": 200, "cant_total": 15.5},
                    "Aprobado": {"registros": 1, "costo_directo": 100, "cant_total": 8.25},
                },
            },
        ],
    }
    filas = panel_validacion_rpc_a_filas(data, "capitulo")
    assert len(filas) == 1
    assert filas[0]["totalRegs"] == 3
    assert filas[0]["celdas"]["No Revisado"]["count"] == 2
    assert filas[0]["celdas"]["No Revisado"]["cant"] == 15.5
    assert filas[0]["pctValidado"] == 33
