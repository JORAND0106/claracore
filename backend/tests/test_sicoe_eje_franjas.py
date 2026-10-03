"""Tests del motor de eje / franjas lineales."""
from sicoe_eje_franjas import (
    analizar_registro_franja,
    construir_franja_polygon,
    normalizar_costado_digitado,
    proyectar_sobre_eje,
    reconstruir_ejes_desde_indice,
)


def _eje_dummy():
    pts = []
    for m in range(0, 101, 10):
        pts.append({"m": float(m), "lng": -74.05, "lat": 4.72 + m * 0.000009})
    return [{"id": 0, "puntos": pts}]


def test_reconstruir_y_proyectar():
    ejes = reconstruir_ejes_desde_indice(
        [
            {"m": 0, "lng": -74.05, "lat": 4.72},
            {"m": 10, "lng": -74.05, "lat": 4.72009},
            {"m": 20, "lng": -74.05, "lat": 4.72018},
        ]
    )
    assert len(ejes) == 1
    proy = proyectar_sobre_eje(ejes, -74.0499, 4.7201, max_dist_m=50)
    assert proy is not None
    assert proy["sobre_eje"] is True


def test_franja_y_aproximada():
    ejes = _eje_dummy()
    poly = construir_franja_polygon(
        eje=ejes[0],
        abs_inicio=20,
        abs_final=60,
        dist_ini=2,
        dist_fin=2,
        ancho=1,
        lado="derecha",
    )
    assert poly["type"] == "Polygon"
    assert len(poly["coordinates"][0]) >= 4

    r = analizar_registro_franja(
        {
            "id": 2,
            "abs_inicio": 10,
            "abs_final": 40,
            "margen": "Izquierda",
            "ancho": 0.8,
        },
        ejes,
    )
    assert r["precision"] == "aproximada"
    assert r["huella"] is not None
    assert r["hallazgos"] == []


def test_alerta_ubicacion_abscisa():
    ejes = _eje_dummy()
    mid = ejes[0]["puntos"][5]
    r = analizar_registro_franja(
        {
            "id": 1,
            "numero_registro": 1,
            "item_numero": "1.1",
            "abs_inicio": 0,
            "abs_final": 10,
            "margen": "Derecha",
            "ancho": 1,
            "coord_lat": mid["lat"],
            "coord_lng": mid["lng"] + 0.00002,
        },
        ejes,
        tolerancia_ubicacion_m=1.0,
    )
    tipos = [h["tipo"] for h in r["hallazgos"]]
    assert "ubicacion_inconsistente" in tipos
    assert normalizar_costado_digitado("Izquierda") == "izquierda"
