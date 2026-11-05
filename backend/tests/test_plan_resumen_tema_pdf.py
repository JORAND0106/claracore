"""Resumen del Plan de actividades bajo cada tema en el PDF del acta."""
from __future__ import annotations

from seguimiento_pdf import _ideas_body_html, _plan_resumen_tema_html


def test_plan_resumen_vacio_si_no_hay_filas():
    assert _plan_resumen_tema_html([]) == ""
    assert _plan_resumen_tema_html(None) == ""


def test_plan_resumen_incluye_columnas_y_datos():
    html = _plan_resumen_tema_html([
        {
            "grupo_nombre": "Obra",
            "titulo": "Revisar planos",
            "asignado_a_nombre": "Ana Pérez",
            "prioridad": 4,
            "fecha_inicio": "2026-11-01",
            "fecha_fin": "2026-11-10",
            "estado_gestion": "abierto",
        },
    ])
    assert "Plan de actividades" in html
    assert "Departamento" in html
    assert "Actividad" in html
    assert "Asignado(s)" in html
    assert "Prioridad" in html
    assert "Fecha inicio" in html
    assert "Fecha fin" in html
    assert "Estado" in html
    assert "Obra" in html
    assert "Revisar planos" in html
    assert "Ana Pérez" in html
    assert "abierto" in html


def test_ideas_body_inyecta_resumen_solo_si_hay_actividades():
    ideas = [
        {"id": 10, "orden": 1, "titulo": "Avance", "texto": "<p>Contenido</p>"},
        {"id": 20, "orden": 2, "titulo": "Sin plan", "texto": "<p>Otro</p>"},
    ]
    plan_por_idea = {
        10: [{
            "grupo_nombre": "Calidad",
            "titulo": "Inspección",
            "asignado_a_nombre": "Luis",
            "prioridad": 3,
            "fecha_inicio": "2026-11-02",
            "fecha_fin": "2026-11-05",
            "estado_gestion": "en_progreso",
        }],
    }
    html = _ideas_body_html(ideas, plan_por_idea=plan_por_idea)
    assert "Tema 1. Avance" in html
    assert "Inspección" in html
    assert "Calidad" in html
    assert "Tema 2. Sin plan" in html
    # El segundo tema no debe mostrar bloque Plan
    idx2 = html.find("Tema 2. Sin plan")
    assert "Plan de actividades" in html[:idx2]
    assert "Plan de actividades" not in html[idx2:]
