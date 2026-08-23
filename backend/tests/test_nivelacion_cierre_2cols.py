"""Tests: cuadro Verificación de cierre en 2 columnas de pares."""
from __future__ import annotations

import re

from topografia_utils import html_cierre_nivelacion_pdf, html_documento_poligonal_pdf


def _niv_base(**over):
    d = {
        "nombre": "C1",
        "tipo_nivel": "electronico",
        "error_cierre": 0.003,
        "tolerancia_calculada": 0.002,
        "distancia_total_km": 1.5,
        "distancia_vplus_km": 0.75,
        "distancia_vminus_km": 0.75,
        "tolerancia_mm_km": 1,
        "bm_inicial": "BM-A",
        "bm_final": "BM-B",
    }
    d.update(over)
    return d


def test_cierre_cuadro_two_column_pairs():
    html_doc = html_cierre_nivelacion_pdf(_niv_base())
    assert 'colspan="4"' in html_doc
    assert 'colspan="2"' not in html_doc.split("Verificación de cierre")[0][-80:] + html_doc.split("Verificación de cierre")[1][:200]
    # Título del cuadro usa colspan 4
    assert re.search(r'colspan="4">Verificación de cierre<', html_doc)
    for label in (
        "Error cierre",
        "Tolerancia",
        "Dist. total",
        "Dist. V+",
        "Dist. V−",
        "BM ini. → fin.",
        "Tipo nivel",
        "Dictamen",
    ):
        assert label in html_doc
    # Sin width fijo 42% en etiquetas
    assert "width:42%" not in html_doc
    # Layout lateral ampliado para el cuadro
    assert 'width="52%"' in html_doc
    assert 'width="48%"' in html_doc
    assert "Procedimiento de verificación" in html_doc
    assert "Conclusión" in html_doc


def test_cierre_dictamen_color_and_tolerancia_formula():
    html_no = html_cierre_nivelacion_pdf(_niv_base())  # error > tol → NO ACEPTADA
    assert "NO ACEPTADA" in html_no
    assert "background:#fee2e2" in html_no
    assert "color:#991b1b" in html_no
    assert "mm/km" in html_no
    assert "√" in html_no

    html_ok = html_cierre_nivelacion_pdf(_niv_base(error_cierre=0.001))
    assert "ACEPTADA" in html_ok
    assert "background:#dcfce7" in html_ok


def test_poligonal_untouched_by_cierre_change():
    # Smoke: builder de poligonal sigue existiendo y no usa el cuadro de nivelación
    src = open("/workspace/backend/topografia_utils.py", encoding="utf-8").read()
    idx = src.index("def html_documento_poligonal_pdf")
    chunk = src[idx : idx + 800]
    assert "html_cierre_nivelacion_pdf" not in chunk
