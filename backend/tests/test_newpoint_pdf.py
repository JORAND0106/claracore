"""Smoke test NewPoint PDF HTML build."""
from topografia_utils import (
    demostracion_calculo_newpoint,
    html_documento_newpoint_pdf,
    to_pdf_bytes,
)


def test_newpoint_pdf_build():
    np = {
        "nombre_punto_nuevo": "Aux1",
        "poligonal_nombre": "Poligonal 1",
        "angulo_observado_gms": 77.341353,
        "distancia1": 114.6926,
        "distancia2": 119.251,
        "admisible": True,
        "opcion_elegida": "B",
        "norte_resultado": 1384.1234,
        "este_resultado": 2624.5678,
        "error_lineal": 0.0007,
        "error_angular_segundos": 1.52,
        "tolerancia_lineal": 0.05,
        "tolerancia_angular_seg": 30,
        "nivel1_estado": "No Revisado",
        "nivel2_estado": "No Revisado",
        "tipo_punto": "auxiliar",
        "operador": "Topógrafo prueba",
        "fecha": "2026-06-03",
    }
    p1 = {"nombre": "D2", "norte": 1457.9302, "este": 2712.0218}
    p2 = {"nombre": "D3", "norte": 1490.2428, "este": 2569.0409}
    vertices = [
        {"nombre": "D1", "norte": 1620.71, "este": 2598.0},
        {"nombre": "D4", "norte": 1563.3646, "este": 2735.6884},
        {"nombre": "D2", "norte": 1457.9302, "este": 2712.0218},
        {"nombre": "D3", "norte": 1490.2428, "este": 2569.0409},
    ]
    contrato = {"numero": "123", "objeto": "Prueba", "contratista": "Test", "interventoria": "Test"}
    html_doc = html_documento_newpoint_pdf(contrato, np, p1, p2, vertices)
    assert "D2" in html_doc
    assert "D3" in html_doc
    assert "Aux1" in html_doc
    assert "Informe de creación" in html_doc
    assert "Procedimiento y metodología" in html_doc
    assert "00.0000" in html_doc
    assert "Elementos del triángulo" in html_doc
    assert "ELABORA" in html_doc
    assert "APRUEBA" in html_doc
    assert "Opción A" not in html_doc
    assert "Opción B" not in html_doc
    assert "Ley de cosenos" in html_doc
    pdf = to_pdf_bytes(html_doc)
    assert len(pdf) > 100


def test_demostracion_calculo_consistente():
    from topografia_utils import newpoint_por_angulo_distancias

    p1 = (1457.9302, 2712.0218)
    p2 = (1490.2428, 2569.0409)
    r = newpoint_por_angulo_distancias(
        p1[0], p1[1], 114.6926, p2[0], p2[1], 119.251, 77.341353,
    )
    ext = next(o for o in r["opciones"] if o["norte"] < 1400)
    d = demostracion_calculo_newpoint(
        ext["norte"], ext["este"],
        p1[0], p1[1], 114.6926,
        p2[0], p2[1], 119.251,
        77.341353,
    )
    assert d["error_dist_p1"] < 0.01
    assert d["error_dist_p2"] < 0.01
