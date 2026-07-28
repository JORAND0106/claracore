"""PDF de acta: todas las ideas centrales deben aparecer (multipágina)."""
from __future__ import annotations

import io

from pypdf import PdfReader

from seguimiento_pdf import generar_pdf_acta


def _pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def test_pdf_incluye_cinco_ideas_centrales():
    ideas = [
        {
            "id": i,
            "orden": i - 1,
            "texto": f"IDEA_MARKER_{i}: redacción de la idea central número {i}.",
            "quien_dijo": f"Persona {i}",
        }
        for i in range(1, 6)
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-1", "id": 1},
        {
            "consecutivo": 12,
            "fecha_reunion": "2026-07-28",
            "ubicacion": "Sala",
            "elaborador_nombre": "Ana",
            "tipo_acta": "interna",
            "estado": "borrador",
            "orden_del_dia": "Punto 1",
        },
        [{"nombre": "A", "cargo": "C", "entidad": "E", "email": "a@x.com"}],
        ideas,
        [],
        firmas=[],
        compromisos=[],
    )
    text = _pdf_text(pdf)
    assert "Ideas centrales (5)" in text
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i}"
        assert f"Idea central {i}" in text


def test_pdf_pagina_con_idea_larga_y_siguientes():
    """Una idea muy larga no debe impedir renderizar las siguientes."""
    long = ("Párrafo extenso de la idea. " * 120) + "\n" + ("Más contenido. " * 80)
    ideas = [
        {"id": 1, "orden": 0, "texto": "IDEA_MARKER_1 corta", "quien_dijo": "A"},
        {"id": 2, "orden": 1, "texto": "IDEA_MARKER_2\n" + long, "quien_dijo": "B"},
        {"id": 3, "orden": 2, "texto": "IDEA_MARKER_3 después de la larga", "quien_dijo": "C"},
        {"id": 4, "orden": 3, "texto": "IDEA_MARKER_4 también", "quien_dijo": "D"},
        {"id": 5, "orden": 4, "texto": "IDEA_MARKER_5 final", "quien_dijo": "E"},
    ]
    asis = [
        {
            "nombre": f"Asistente {i}",
            "cargo": "Cargo",
            "entidad": "Entidad",
            "email": f"a{i}@x.com",
        }
        for i in range(1, 8)
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-9", "id": 9},
        {
            "consecutivo": 3,
            "fecha_reunion": "2026-07-28",
            "ubicacion": "Auditorio",
            "elaborador_nombre": "Luis",
            "tipo_acta": "externa",
            "estado": "borrador",
            "orden_del_dia": [{"texto": f"Punto {i}", "hecho": False} for i in range(1, 6)],
        },
        asis,
        ideas,
        [{"titulo": "Notas", "contenido": "Apartado libre"}],
        firmas=[],
        compromisos=[{"titulo": "Comp", "asignado_a_nombre": "U", "fecha_vencimiento": "2026-08-01"}],
    )
    text = _pdf_text(pdf)
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 2
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i} tras contenido largo"
