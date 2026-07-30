"""PDF de acta: encabezado oficial y todas las ideas centrales."""
from __future__ import annotations

import io

from pypdf import PdfReader

from seguimiento_pdf import (
    _anio_contrato,
    _fecha_partes_dia_mes_anio,
    _titulo_seguimiento_contrato,
    contenido_hash_acta,
    generar_pdf_acta,
)


def _pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def test_titulo_seguimiento_incluye_numero_y_anio():
    titulo = _titulo_seguimiento_contrato(
        {"numero": "ICCU-CTO-1614-2025"},
        {"fecha_reunion": "2026-07-28"},
    )
    assert "Seguimiento al Contrato de obra No. ICCU-CTO-1614-2025 DE 2025" == titulo
    assert _anio_contrato("CT-9", "2026-07-28") == "2026"
    assert _fecha_partes_dia_mes_anio("2026-07-28") == ("28", "07", "2026")


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
        {
            "numero": "ICCU-CTO-1614-2025",
            "id": 1,
            "objeto": "Obra de prueba",
            "numero_interventoria": "ICCU-INT-0099-2025",
        },
        {
            "consecutivo": 12,
            "fecha_reunion": "2026-07-28",
            "ubicacion": "Sala",
            "elaborador_nombre": "Ana",
            "tipo_acta": "interna",
            "estado": "borrador",
            "orden_del_dia": "Punto 1",
            "hora_inicio": "08:15",
            "hora_fin": "10:40",
        },
        [{"nombre": "A", "cargo": "C", "entidad": "E", "email": "a@x.com"}],
        ideas,
        [],
        firmas=[],
        compromisos=[],
    )
    text = _pdf_text(pdf)
    compact = " ".join(text.split())
    assert "Seguimiento al Contrato de obra No." in compact
    assert "ICCU-CTO-1614-2025 DE 2025" in compact
    assert "Acta No." in compact or "Acta No" in compact
    assert "ICCU-INT-0099-2025" in compact
    assert "08:15" in compact
    assert "10:40" in compact
    assert "Objeto del contrato" in compact
    assert "Ideas centrales" in compact
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i}"
        assert f"Idea {i}" in text


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
        {"numero": "CT-9-2026", "id": 9, "objeto": "Objeto largo de contrato de obra"},
        {
            "consecutivo": 3,
            "fecha_reunion": "2026-07-28",
            "ubicacion": "Auditorio",
            "elaborador_nombre": "Luis",
            "tipo_acta": "externa",
            "estado": "borrador",
            "orden_del_dia": [{"texto": f"Punto {i}", "hecho": False} for i in range(1, 6)],
            "proxima_fecha": "2026-08-15",
            "proxima_hora": "09:00",
            "proxima_lugar": "Sala gerencia",
        },
        asis,
        ideas,
        [{"titulo": "Notas", "contenido": "Apartado libre"}],
        firmas=[],
        compromisos=[{"titulo": "Comp", "asignado_a_nombre": "U", "fecha_vencimiento": "2026-08-01"}],
        compromisos_previos=[
            {"titulo": "Prev", "asignado_a_nombre": "P", "fecha_vencimiento": "2026-07-01", "estado_gestion": "abierto"}
        ],
    )
    text = _pdf_text(pdf)
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 2
    compact = " ".join(text.split())
    assert "Seguimiento al Contrato de obra No." in compact
    assert "CT-9-2026 DE 2026" in compact
    assert "Compromisos abiertos de actas anteriores" in text
    assert "Próxima reunión" in text
    assert "Sala gerencia" in text
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i} tras contenido largo"


def test_contenido_hash_incluye_quien_dijo():
    base = {"consecutivo": 1, "fecha_reunion": "2026-01-01"}
    h1 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "A", "orden": 0}], [])
    h2 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "B", "orden": 0}], [])
    assert h1 != h2
