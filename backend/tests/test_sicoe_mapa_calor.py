"""Mapa de calor SicoeObra: coords WGS84 + peso por costo_directo."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_mapa_calor import (  # noqa: E402
    build_mapa_calor_geojson,
    parse_coord_wgs84,
)


def test_parse_coord_wgs84_ok():
    assert parse_coord_wgs84(4.72, -74.05) == (-74.05, 4.72)


def test_parse_coord_wgs84_rejects_zero_and_oob():
    assert parse_coord_wgs84(0, 0) is None
    assert parse_coord_wgs84(91, -74) is None
    assert parse_coord_wgs84("x", "-74") is None
    assert parse_coord_wgs84(None, -74) is None


def test_build_mapa_calor_weights_by_costo_and_prefers_registro_coords():
    registros = [
        {
            "id": 1,
            "reporte_id": 10,
            "costo_directo": 100,
            "coord_lat": 4.7,
            "coord_lng": -74.0,
            "numero_registro": 1,
            "capitulo": "A",
            "item_numero": "1.1",
            "nivel1_estado": "Aprobado",
        },
        {
            "id": 2,
            "reporte_id": 10,
            "costo_directo": 50,
            "coord_lat": None,
            "coord_lng": None,
            "numero_registro": 2,
            "capitulo": "A",
            "item_numero": "1.2",
        },
        {
            "id": 3,
            "reporte_id": 11,
            "costo_directo": 200,
            "coord_lat": None,
            "coord_lng": None,
            "numero_registro": 3,
        },
    ]
    reporte_map = {
        10: {
            "id": 10,
            "numero_reporte": 5,
            "estado": "Enviado",
            "capitulo": "A",
            "coord_lat": 4.71,
            "coord_lng": -74.01,
        },
        11: {"id": 11, "numero_reporte": 6, "estado": "Borrador"},
    }
    geo = build_mapa_calor_geojson(registros, reporte_map)
    assert geo["type"] == "FeatureCollection"
    assert geo["meta"]["con_coords"] == 2
    assert geo["meta"]["sin_coords"] == 1
    assert geo["meta"]["max_costo_directo"] == 200
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    assert feats[1]["geometry"]["coordinates"] == [-74.0, 4.7]
    assert feats[1]["properties"]["origen_coord"] == "registro"
    assert feats[1]["properties"]["weight"] == 0.5  # 100/200
    assert feats[1]["properties"]["nivel1"] == "Aprobado"
    assert feats[2]["properties"]["origen_coord"] == "reporte"
    assert feats[2]["geometry"]["coordinates"] == [-74.01, 4.71]
    assert feats[2]["properties"]["weight"] == 0.25  # 50/200


def test_build_mapa_calor_truncates_at_max_features():
    regs = [
        {
            "id": i,
            "reporte_id": 1,
            "costo_directo": 10,
            "coord_lat": 4.0 + i * 0.0001,
            "coord_lng": -74.0,
        }
        for i in range(5)
    ]
    geo = build_mapa_calor_geojson(regs, {1: {}}, max_features=3)
    assert len(geo["features"]) == 3
    assert geo["meta"]["truncado"] is True
    assert geo["meta"]["max_features"] == 3


def test_intensidad_relativa_al_conjunto_filtrado():
    """El mismo costo absoluto escala distinto si cambia el máximo del filtro."""
    base = {
        "id": 1,
        "reporte_id": 1,
        "costo_directo": 100,
        "coord_lat": 4.7,
        "coord_lng": -74.0,
    }
    filtro_acta = [
        base,
        {**base, "id": 2, "costo_directo": 400, "coord_lat": 4.71},
    ]
    filtro_item = [base]  # solo el de 100
    g_acta = build_mapa_calor_geojson(filtro_acta, {1: {}})
    g_item = build_mapa_calor_geojson(filtro_item, {1: {}})
    w_acta = next(f["properties"]["weight"] for f in g_acta["features"] if f["properties"]["id"] == 1)
    w_item = next(f["properties"]["weight"] for f in g_item["features"] if f["properties"]["id"] == 1)
    assert w_acta == 0.25  # 100/400
    assert w_item == 1.0   # 100/100 → máximo del filtro
    assert g_acta["meta"]["intensidad"] == "relativa_conjunto_filtrado"
    assert g_acta["meta"]["max_costo_directo"] == 400
    assert g_item["meta"]["max_costo_directo"] == 100
