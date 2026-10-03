"""Tests del clasificador de dibujo masivo."""
from sicoe_dibujar_masivo import (
    acumular_resultado,
    clasificar_resultado_dibujo,
    merge_resumenes,
    resumen_vacio,
)


def test_clasificar_preciso_aproximado_omitido():
    assert clasificar_resultado_dibujo({"huella": {"type": "Feature"}, "precision": "precisa"}) == "preciso"
    assert clasificar_resultado_dibujo({"huella": {"type": "Feature"}, "precision": "aproximada"}) == "aproximado"
    assert clasificar_resultado_dibujo({"omitido": True}) == "no_dibujado"
    assert clasificar_resultado_dibujo({"huella": None}) == "no_dibujado"


def test_acumular_y_merge():
    r = resumen_vacio()
    acumular_resultado(r, {"huella": {"x": 1}, "precision": "precisa", "hallazgos": [{"tipo": "traslapo"}]})
    acumular_resultado(r, {"huella": {"x": 1}, "precision": "aproximada", "hallazgos": []})
    acumular_resultado(r, {"omitido": True, "huella": None})
    acumular_resultado(r, None, ya_dibujado=True)
    assert r["precisos"] == 1
    assert r["aproximados"] == 1
    assert r["no_dibujados"] == 1
    assert r["con_inconsistencia"] == 1
    assert r["procesados"] == 3
    assert r["omitidos_ya_dibujados"] == 1
    m = merge_resumenes(r, {"precisos": 2})
    assert m["precisos"] == 3
