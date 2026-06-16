"""NewPoint: devuelve dos opciones A/B; el usuario elige en campo."""
from topografia_utils import newpoint_por_angulo_distancias, _punto_dentro_poligono

VERTICES = [
    (1620.71, 2598.0),
    (1563.3646, 2735.6884),
    (1457.9302, 2712.0218),
    (1490.2428, 2569.0409),
]
D2 = (1457.9302, 2712.0218)
D3 = (1490.2428, 2569.0409)


def test_newpoint_dos_opciones_espejo():
    r = newpoint_por_angulo_distancias(
        D2[0], D2[1], 114.6926,
        D3[0], D3[1], 119.2510,
        77.341353,
        vertices_poligonal=VERTICES,
    )
    opciones = r["opciones"]
    assert len(opciones) == 2
    assert opciones[0]["id"] == "A"
    assert opciones[1]["id"] == "B"
    dentro = [o for o in opciones if _punto_dentro_poligono(o["norte"], o["este"], VERTICES)]
    fuera = [o for o in opciones if not _punto_dentro_poligono(o["norte"], o["este"], VERTICES)]
    assert len(dentro) == 1
    assert len(fuera) == 1
    assert fuera[0]["norte"] < 1400
