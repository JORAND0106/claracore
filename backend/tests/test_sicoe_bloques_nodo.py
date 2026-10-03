"""Bloques de nodo: vértices y polígono WGS84."""
from sicoe_bloques_nodo import (
    bloque_a_poligono_wgs84,
    normalizar_forma,
    vertices_locales_bloque,
)


def test_normalizar_forma():
    assert normalizar_forma("Círculo") == "circulo"
    assert normalizar_forma("square") == "cuadrado"


def test_vertices_circulo():
    v = vertices_locales_bloque("circulo", 2.0, 2.0, n_circulo=8)
    assert len(v) == 8
    assert abs(max(p[0] for p in v) - 1.0) < 1e-6


def test_bloque_poligono_wgs84():
    poly = bloque_a_poligono_wgs84(
        -74.08, 4.65, forma="cuadrado", ancho_m=1.0, alto_m=1.0, rotacion_deg=45
    )
    assert poly["type"] == "Polygon"
    ring = poly["coordinates"][0]
    assert len(ring) >= 5
    assert ring[0] == ring[-1]
