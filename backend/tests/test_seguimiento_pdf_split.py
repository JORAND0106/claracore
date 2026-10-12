"""
Regresión: PDF de acta no debe fallar con Splitting error(n==2).

Causa de fondo (xhtml2pdf/reportlab):
- Una sola tabla de firmas a 2 columnas con muchos firmantes, o
  `page-break-inside:avoid` dentro de celdas, no puede partirse entre páginas.
- Un contenedor de sección con encabezado + cuerpo alto (tablas TipTap,
  muchos compromisos) se vuelve un BlockBox indivisible → el PDF no se genera.

Corrección: secciones en hermanos (barra + cuerpo) y firmas emparejadas de a dos.
"""
from __future__ import annotations

import io

from pypdf import PdfReader

from seguimiento_pdf import PDF_ACTA_TEMPLATE_VERSION, generar_pdf_acta


def _pdf_ok(pdf: bytes) -> tuple[int, str]:
    assert pdf and pdf[:4] == b"%PDF"
    reader = PdfReader(io.BytesIO(pdf))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    return len(reader.pages), text


def _base_acta(**extra):
    a = {
        "consecutivo": 7,
        "fecha_reunion": "2026-10-01",
        "ubicacion": "Sala",
        "elaborador_nombre": "Ana",
        "tipo_acta": "interna",
        "estado": "borrador",
        "orden_del_dia": [{"texto": "Punto 1", "hecho": True}],
        "hora_inicio": "08:00",
        "hora_fin": "10:00",
    }
    a.update(extra)
    return a


def test_template_version_bumped_for_split_fix():
    assert "split" in PDF_ACTA_TEMPLATE_VERSION or "2026-10-12" in PDF_ACTA_TEMPLATE_VERSION


def test_pdf_con_asistentes_y_firmas_no_falla():
    """Antes fallaba con 1+ asistentes (tabla firmas 2-col + avoid)."""
    asis = [
        {
            "id": i,
            "nombre": f"Asistente {i}",
            "cargo": "Cargo",
            "entidad": "Entidad",
            "email": f"a{i}@x.com",
        }
        for i in range(1, 6)
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-SPLIT-2026", "objeto": "Obra de prueba"},
        _base_acta(),
        asis,
        [{"id": 1, "orden": 0, "texto": "Tema corto", "titulo": "Inicio"}],
        [],
    )
    pages, text = _pdf_ok(pdf)
    assert pages >= 1
    assert "Firmas" in text
    assert "Asistente 1" in text


def test_pdf_muchos_asistentes_pagina():
    asis = [
        {
            "id": i,
            "nombre": f"Asistente Nombre Largo {i}",
            "cargo": "Director de obra",
            "entidad": "Constructora Ejemplo S.A.S.",
            "email": f"asistente{i}@empresa.com",
        }
        for i in range(1, 41)
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-SPLIT-2026", "objeto": "Obra"},
        _base_acta(tipo_acta="externa"),
        asis,
        [{"id": 1, "orden": 0, "texto": "OK", "titulo": "T"}],
        [],
    )
    pages, text = _pdf_ok(pdf)
    assert pages >= 2
    assert "Asistente Nombre Largo 1" in text
    assert "Asistente Nombre Largo 40" in text
    assert "Firmas" in text


def test_pdf_tabla_tiptap_larga_en_tema():
    rows = "".join(
        f"<tr><td>fila {r} col A</td><td>dato {r}</td><td>x</td><td>y</td><td>z</td></tr>"
        for r in range(60)
    )
    html = f"<table><tbody>{rows}</tbody></table>"
    pdf = generar_pdf_acta(
        {"numero": "CT-SPLIT-2026", "objeto": "Obra"},
        _base_acta(),
        [{"id": 1, "nombre": "A", "cargo": "C", "entidad": "E", "email": "a@x.com"}],
        [{"id": 1, "orden": 0, "texto": html, "titulo": "Tabla larga", "quien_dijo": "X"}],
        [],
    )
    pages, text = _pdf_ok(pdf)
    assert pages >= 2
    assert "Tabla larga" in text or "Tema 1" in text
    assert "fila 0" in text
    assert "fila 59" in text


def test_pdf_muchos_compromisos_previos():
    previos = [
        {
            "titulo": f"Compromiso previo {i} con texto descriptivo",
            "asignado_a_nombre": "Persona",
            "fecha_vencimiento": "2026-09-01",
            "estado_gestion": "abierto",
        }
        for i in range(50)
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-SPLIT-2026", "objeto": "Obra"},
        _base_acta(),
        [{"id": 1, "nombre": "A", "cargo": "C", "entidad": "E", "email": "a@x.com"}],
        [{"id": 1, "orden": 0, "texto": "Tema", "titulo": "T"}],
        [],
        compromisos_previos=previos,
    )
    pages, text = _pdf_ok(pdf)
    assert pages >= 2
    assert "Compromisos abiertos" in text
    assert "Compromiso previo 0" in text
    assert "Compromiso previo 49" in text


def test_pdf_tema_muy_largo_y_siguientes():
    long = ("Párrafo extenso del tema. " * 100) + "\n" + ("Más contenido. " * 80)
    ideas = [
        {"id": 1, "orden": 0, "texto": "MARKER_A", "titulo": "Primero"},
        {"id": 2, "orden": 1, "texto": "MARKER_B\n" + long, "titulo": "Largo"},
        {"id": 3, "orden": 2, "texto": "MARKER_C", "titulo": "Después"},
    ]
    pdf = generar_pdf_acta(
        {"numero": "CT-SPLIT-2026", "objeto": "Obra"},
        _base_acta(),
        [{"id": i, "nombre": f"A{i}", "cargo": "C", "entidad": "E", "email": f"a{i}@x.com"} for i in range(1, 4)],
        ideas,
        [{"titulo": "Notas", "contenido": "Apartado"}],
        compromisos=[{"titulo": "Comp", "asignado_a_nombre": "U", "fecha_vencimiento": "2026-11-01"}],
    )
    pages, text = _pdf_ok(pdf)
    assert pages >= 2
    assert "MARKER_A" in text
    assert "MARKER_B" in text
    assert "MARKER_C" in text
