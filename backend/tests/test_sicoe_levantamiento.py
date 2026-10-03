"""Tests del motor de levantamiento topográfico (parseo, CRS, validación, geojson)."""
from sicoe_levantamiento import (
    enriquecer_punto_wgs84,
    geometria_desde_vertices,
    parse_levantamiento_csv,
    parse_levantamiento_matrix,
    puntos_a_geojson,
    resumir_precision_huellas,
    validar_puntos_levantamiento,
    validar_ubicacion_punto,
)


def test_parse_csv_con_cabecera():
    text = "Punto,Norte,Este,Cota,Descripción\n1,1000001,1000002,2550,Pozo\n2,1000010,1000005,,\n"
    rows = parse_levantamiento_csv(text)
    assert len(rows) == 2
    assert rows[0]["punto"] == "1"
    assert rows[0]["norte"] == 1000001.0
    assert rows[0]["este"] == 1000002.0
    assert rows[0]["descripcion"] == "Pozo"


def test_parse_matrix_sin_cabecera():
    rows = parse_levantamiento_matrix([
        ["A", 1000001, 1000002, 10, "x"],
        ["B", 1000011, 1000012, "", ""],
    ])
    assert len(rows) == 2
    assert rows[0]["punto"] == "A"


def test_enriquecer_wgs84_bogota_centro():
    # Origen aproximado EPSG:3116 (E=1e6, N=1e6) → cerca de Bogotá
    p = enriquecer_punto_wgs84({"punto": "1", "este": 1000000, "norte": 1000000})
    assert p["lng"] is not None and p["lat"] is not None
    assert -75 < p["lng"] < -73
    assert 4 < p["lat"] < 5.5


def test_validar_sin_eje_acepta_crs_ok():
    p = {"punto": "1", "este": 1000000, "norte": 1000000}
    r = validar_ubicacion_punto(p, [])
    assert r["ok"] is True


def test_validar_fuera_eje_rechaza():
    # Eje artificial lejos del punto transformado
    ejes = [{
        "id": "e1",
        "puntos": [
            {"lng": -70.0, "lat": 0.0, "m": 0},
            {"lng": -70.0, "lat": 0.01, "m": 1000},
        ],
    }]
    p = {"punto": "1", "este": 1000000, "norte": 1000000}
    r = validar_ubicacion_punto(p, ejes, max_dist_m=30)
    assert r["ok"] is False
    assert r["razon"] == "fuera_eje"


def test_validar_lote_mezcla():
    ejes = []
    check = validar_puntos_levantamiento(
        [
            {"punto": "1", "este": 1000000, "norte": 1000000},
            {"punto": "bad", "este": None, "norte": None},
        ],
        ejes,
    )
    # El segundo se omite en parse normalmente; aquí norte/este 0 vía enriquecer
    assert check["total"] >= 1


def test_puntos_a_geojson_labels():
    fc = puntos_a_geojson(
        [{"punto": "P-12", "este": 1000000, "norte": 1000000, "descripcion": "x"}],
        reporte_id=99,
    )
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["label"] == "P-12"
    assert fc["features"][0]["properties"]["reporte_id"] == 99


def test_geometria_desde_vertices_poligono():
    verts = [
        {"lng": -74.05, "lat": 4.72},
        {"lng": -74.049, "lat": 4.72},
        {"lng": -74.049, "lat": 4.721},
    ]
    geom, tipo, centro = geometria_desde_vertices(verts, "area")
    assert tipo == "area"
    assert geom["type"] == "Polygon"
    assert geom["coordinates"][0][0] == geom["coordinates"][0][-1]
    assert centro is not None


def test_geometria_punto_y_linea():
    g1, t1, _ = geometria_desde_vertices([{"lng": -74.0, "lat": 4.7}], "punto")
    assert t1 == "punto" and g1["type"] == "Point"
    g2, t2, _ = geometria_desde_vertices(
        [{"lng": -74.0, "lat": 4.7}, {"lng": -74.01, "lat": 4.71}],
        "linea",
    )
    assert t2 == "linea" and g2["type"] == "LineString"


def test_resumir_precision():
    rows = [
        {"huella_precision": "precisa", "creado_por_reg": 1},
        {"huella_precision": "aproximada", "creado_por_reg": 1},
        {"huella_precision": None, "creado_por_reg": 2},
        {"huella_precision": "precisa", "creado_por_reg": 2},
    ]
    r = resumir_precision_huellas(rows, usuario_id=1)
    assert r["contrato"]["precisas"] == 2
    assert r["contrato"]["aproximadas"] == 1
    assert r["contrato"]["sin_huella"] == 1
    assert r["usuario"]["precisas"] == 1
    assert r["usuario"]["aproximadas"] == 1
    assert r["usuario"]["total"] == 2
