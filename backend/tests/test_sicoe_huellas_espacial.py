"""Tests del motor de huellas de nodo y polígono."""
from sicoe_huellas_espacial import (
    analizar_nodo,
    analizar_poligono,
    area_poligono_m2,
    interseccion_poligonos_m2,
    normalizar_geometria_tipo,
    punto_en_poligono,
    sugerir_geometria_tipo,
)


def _poly_around(lng, lat, d=0.00005):
    return {
        "type": "Polygon",
        "coordinates": [[
            [lng - d, lat - d],
            [lng + d, lat - d],
            [lng + d, lat + d],
            [lng - d, lat + d],
            [lng - d, lat - d],
        ]],
    }


def test_sugerir_geometria_por_unidad_y_coords():
    assert sugerir_geometria_tipo({"unidad": "UN"}) == "punto"
    assert sugerir_geometria_tipo({"unidad": "m2"}) == "area"
    assert sugerir_geometria_tipo({"unidad": "ml", "abs_inicio": 1, "abs_final": 2}) == "linea"
    assert sugerir_geometria_tipo({}, n_coords=3) == "area"
    assert normalizar_geometria_tipo("área") == "area"


def test_nodo_primera_coord_oficial_y_snap():
    reg1 = {
        "id": 1,
        "pk_id_id": 10,
        "item_numero": "2.1",
        "coord_lat": 4.72,
        "coord_lng": -74.05,
        "geometria_tipo": "punto",
    }
    r1 = analizar_nodo(reg1, None, radio_m=1.0)
    assert r1["huella_tipo"] == "nodo"
    assert r1["nodo_update"]["coord_lat"] == 4.72
    assert r1["hallazgos"] == []

    nodo = {"pk_id_id": 10, "coord_lat": 4.72, "coord_lng": -74.05}
    # Punto cercano (< 1 m) se pega
    reg2 = {
        "id": 2,
        "pk_id_id": 10,
        "item_numero": "2.2",
        "coord_lat": 4.72 + 0.000004,  # ~0.4 m
        "coord_lng": -74.05,
    }
    r2 = analizar_nodo(reg2, nodo, radio_m=1.0)
    assert r2["precision"] == "precisa"
    assert not any(h["tipo"] == "ubicacion_inconsistente" for h in r2["hallazgos"])

    # Punto lejos → inconsistente
    reg3 = {
        "id": 3,
        "pk_id_id": 10,
        "item_numero": "2.3",
        "coord_lat": 4.72 + 0.00005,  # ~5.5 m
        "coord_lng": -74.05,
    }
    r3 = analizar_nodo(reg3, nodo, radio_m=1.0)
    tipos = [h["tipo"] for h in r3["hallazgos"]]
    assert "ubicacion_inconsistente" in tipos


def test_nodo_poligono_contiene_punto_sin_distancia():
    poly = _poly_around(-74.05, 4.72, d=0.0001)
    nodo = {
        "pk_id_id": 10,
        "coord_lat": 4.72,
        "coord_lng": -74.05,
        "poligono_geojson": {"type": "Feature", "geometry": poly},
    }
    # Punto dentro del polígono pero > 1 m del centro oficial
    reg = {
        "id": 4,
        "pk_id_id": 10,
        "item_numero": "3.1",
        "coord_lat": 4.72 + 0.00008,
        "coord_lng": -74.05,
    }
    r = analizar_nodo(reg, nodo, radio_m=1.0)
    assert r["precision"] == "precisa"
    assert not any(h["tipo"] == "ubicacion_inconsistente" for h in r["hallazgos"])


def test_traslapo_mismo_item_en_nodo():
    nodo = {"pk_id_id": 10, "coord_lat": 4.72, "coord_lng": -74.05}
    reg = {
        "id": 5,
        "numero_registro": 5,
        "pk_id_id": 10,
        "item_numero": "4.1",
        "coord_lat": 4.72,
        "coord_lng": -74.05,
    }
    pares = [
        {"id": 5, "numero_registro": 5, "item_numero": "4.1", "pk_id_id": 10},
        {"id": 6, "numero_registro": 6, "item_numero": "4.1", "pk_id_id": 10},
    ]
    r = analizar_nodo(reg, nodo, radio_m=1.0, pares_mismo_item_en_nodo=pares)
    assert any(h["tipo"] == "traslapo" for h in r["hallazgos"])
    assert r["semaforo"] == "rojo"


def test_poligono_cantidad_mayor_y_solape():
    poly_a = _poly_around(-74.05, 4.72, d=0.00005)
    area = area_poligono_m2(poly_a["coordinates"])
    assert area > 0

    reg = {
        "id": 7,
        "numero_registro": 7,
        "item_numero": "5.1",
        "unidad": "m2",
        "cantidad_total": area + 10,
        "coords_geojson": poly_a,
    }
    # Peer overlapping
    poly_b = _poly_around(-74.05 + 0.00003, 4.72, d=0.00005)
    peer = {
        "id": 8,
        "numero_registro": 8,
        "item_numero": "5.1",
        "coords_geojson": poly_b,
    }
    r = analizar_poligono(reg, pares_mismo_item=[peer])
    tipos = [h["tipo"] for h in r["hallazgos"]]
    assert "cantidad_mayor_area" in tipos
    assert "traslapo" in tipos
    assert r["huella_tipo"] == "poligono"


def test_punto_en_poligono_y_interseccion():
    poly = _poly_around(-74.05, 4.72)
    assert punto_en_poligono(-74.05, 4.72, poly["coordinates"])
    assert not punto_en_poligono(-74.06, 4.72, poly["coordinates"])
    ov = interseccion_poligonos_m2(poly["coordinates"], poly["coordinates"])
    assert ov > 0
