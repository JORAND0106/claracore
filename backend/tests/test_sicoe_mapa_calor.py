"""Mapa de calor SicoeObra: coords WGS84 + peso por costo_directo."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_mapa_calor import (  # noqa: E402
    build_dibujos_mapa_calor,
    build_mapa_calor_geojson,
    features_desde_dibujo_reporte,
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


def test_fallback_coords_desde_reporte_como_detalle_unica():
    """Detalle loc. única muestra so_reportes.coord_*; el mapa debe usarlas si la línea no tiene GPS."""
    registros = [
        {
            "id": 1,
            "reporte_id": 50,
            "costo_directo": 1000,
            "coord_lat": None,
            "coord_lng": None,
            "numero_registro": 7,
        }
    ]
    reporte_map = {
        50: {
            "id": 50,
            "numero_reporte": 12,
            "estado": "Enviado",
            "coord_lat": 4.760271,
            "coord_lng": -74.031242,
        }
    }
    geo = build_mapa_calor_geojson(registros, reporte_map)
    assert geo["meta"]["con_coords"] == 1
    assert geo["meta"]["sin_coords"] == 0
    f0 = geo["features"][0]
    assert f0["geometry"]["coordinates"] == [-74.031242, 4.760271]
    assert f0["properties"]["origen_coord"] == "reporte"


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


def _poly():
    return {
        "type": "Polygon",
        "coordinates": [
            [[-74.1, 4.7], [-74.09, 4.7], [-74.09, 4.71], [-74.1, 4.71], [-74.1, 4.7]]
        ],
    }


def test_features_desde_dibujo_reporte_conserva_todas_las_partes():
    """El botón Dibujar guarda un FC; no colapsar a un solo nodo."""
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-74.1, 4.7]},
                "properties": {"dibujo_tipo": "nodo", "es_bloque": True},
            },
            {
                "type": "Feature",
                "geometry": _poly(),
                "properties": {"dibujo_tipo": "poligono"},
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-74.1, 4.7], [-74.09, 4.71]],
                },
                "properties": {"dibujo_tipo": "linea"},
            },
        ],
    }
    feats = features_desde_dibujo_reporte(fc, reporte_id=60)
    assert len(feats) == 3
    tipos = {f["properties"]["huella_tipo"] for f in feats}
    assert tipos == {"nodo", "poligono", "linea"}
    assert all(f["properties"]["reporte_id"] == 60 for f in feats)
    assert all(f["properties"]["origen"] == "reporte_dibujo" for f in feats)


def test_build_dibujos_prioriza_dibujo_del_reporte_sobre_huella():
    registros = [
        {
            "id": 1,
            "reporte_id": 60,
            "costo_directo": 800,
            "huella_geojson": {
                "type": "Feature",
                "geometry": _poly(),
                "properties": {"huella_tipo": "franja"},
            },
        },
        {"id": 2, "reporte_id": 60, "costo_directo": 400},
    ]
    reporte_map = {
        60: {
            "id": 60,
            "dibujo_geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": _poly(),
                        "properties": {"dibujo_tipo": "poligono"},
                    }
                ],
            },
        }
    }
    heat = build_mapa_calor_geojson(
        [
            {**registros[0], "coord_lat": 4.7, "coord_lng": -74.1},
            {**registros[1], "coord_lat": 4.71, "coord_lng": -74.1},
        ],
        reporte_map,
    )
    dibujos = build_dibujos_mapa_calor(registros, reporte_map, heat_features=heat["features"])
    assert len(dibujos["features"]) == 1
    assert dibujos["features"][0]["properties"]["origen"] == "reporte_dibujo"
    assert dibujos["features"][0]["properties"]["weight"] == 1.0  # max del reporte
    assert dibujos["meta"]["reportes_con_dibujo"] == 1


def test_build_mapa_calor_incluir_dibujos():
    registros = [
        {
            "id": 1,
            "reporte_id": 7,
            "costo_directo": 100,
            "coord_lat": 4.7,
            "coord_lng": -74.0,
        }
    ]
    reporte_map = {
        7: {
            "id": 7,
            "dibujo_geojson": {
                "type": "Feature",
                "geometry": _poly(),
                "properties": {},
            },
        }
    }
    geo = build_mapa_calor_geojson(registros, reporte_map, incluir_dibujos=True)
    assert "dibujos" in geo
    assert geo["dibujos"]["meta"]["total"] == 1
    assert geo["meta"]["con_dibujo"] == 1
