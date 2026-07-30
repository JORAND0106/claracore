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
    assert "Ideas centrales" in compact or "TEMAS TRATADOS" in compact
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i}"
        assert f"Tema {i}" in text


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
    assert "TEMAS A TRATAR" in compact or "TEMAS A TRATAR EN PRESENTE ACTA" in text
    assert "Compromisos abiertos de actas anteriores" in text
    assert "Próxima reunión" in text
    assert "Sala gerencia" in text
    for i in range(1, 6):
        assert f"IDEA_MARKER_{i}" in text, f"falta idea {i} tras contenido largo"
        assert f"Tema {i}" in text


def test_pdf_interna_no_muestra_bloque_entidad():
    pdf = generar_pdf_acta(
        {"numero": "CT-1-2026", "objeto": "Obra", "logo_entidad": "https://example.com/e.png"},
        {
            "consecutivo": 1,
            "fecha_reunion": "2026-07-28",
            "tipo_acta": "interna",
            "orden_del_dia": "Punto",
        },
        [],
        [{"orden": 0, "texto": "TEMA_MARKER", "titulo": "Drenaje norte"}],
        [],
    )
    text = _pdf_text(pdf)
    compact = " ".join(text.split())
    assert "Tema 1: Drenaje norte" in compact or ("Tema 1" in compact and "Drenaje norte" in compact)
    assert "TEMAS A TRATAR EN PRESENTE ACTA" in compact
    # Interna no etiqueta bloque Entidad en el encabezado de tres recuadros
    assert "Entidad" not in text.split("Objeto")[0] or "Logo entidad" not in text


def test_pdf_externa_incluye_identidad_entidad():
    pdf = generar_pdf_acta(
        {"numero": "CT-2-2026", "objeto": "Obra", "logo_entidad": ""},
        {
            "consecutivo": 2,
            "fecha_reunion": "2026-07-28",
            "tipo_acta": "externa",
            "orden_del_dia": "Punto",
        },
        [],
        [],
        [],
    )
    text = _pdf_text(pdf)
    assert "Entidad" in text.split("Objeto")[0]
    assert "Contratista" in text.split("Objeto")[0]


def test_contenido_hash_incluye_quien_dijo():
    base = {"consecutivo": 1, "fecha_reunion": "2026-01-01"}
    h1 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "A", "orden": 0}], [])
    h2 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "B", "orden": 0}], [])
    assert h1 != h2


def test_encabezado_compacto_constantes_y_legibilidad():
    """El bloque de encabezado usa dimensiones ~50% más compactas y sigue legible."""
    from seguimiento_pdf import (
        _HDR_META_FS,
        _HDR_PAD,
        _HDR_TITLE_FS,
        _LOGO_MAX_H,
        _encabezado_oficial_html,
        _logo_cell,
    )

    assert _LOGO_MAX_H <= 12
    assert "7.5" in _HDR_TITLE_FS or float(_HDR_TITLE_FS.replace("pt", "")) <= 8.0
    assert float(_HDR_META_FS.replace("pt", "")) <= 6.5
    assert "1pt" in _HDR_PAD or "2pt" in _HDR_PAD

    logo = _logo_cell(None, "Logo")
    assert f"max-height:{_LOGO_MAX_H}pt" in logo or "min-height" in logo

    for tipo in ("interna", "externa"):
        html = _encabezado_oficial_html(
            {"numero": "CT-9-2026", "objeto": "Obra de prueba", "numero_interventoria": "INT-1"},
            {
                "consecutivo": 3,
                "fecha_reunion": "2026-07-28",
                "tipo_acta": tipo,
                "hora_inicio": "08:00",
                "hora_fin": "09:30",
            },
            logo_contratista=_logo_cell(None, "C"),
            logo_entidad=_logo_cell(None, "E"),
        )
        assert "Acta No." in html
        assert "08:00" in html and "09:30" in html
        assert "INT-1" in html
        assert "Objeto del contrato" in html
        # Padding compacto en celdas del encabezado (no el padding antiguo 8pt del título).
        assert "padding:8pt" not in html
        assert "padding:3pt 4pt" not in html
        pdf = generar_pdf_acta(
            {"numero": "CT-9-2026", "objeto": "Obra de prueba", "numero_interventoria": "INT-1"},
            {
                "consecutivo": 3,
                "fecha_reunion": "2026-07-28",
                "tipo_acta": tipo,
                "hora_inicio": "08:00",
                "hora_fin": "09:30",
                "orden_del_dia": "Punto",
            },
            [{"nombre": "A", "cargo": "C", "entidad": "E", "email": "a@x.com"}],
            [{"orden": 0, "texto": "Contenido", "titulo": "Tema compacto"}],
            [],
        )
        text = _pdf_text(pdf)
        assert "CT-9-2026" in text
        assert "08:00" in text
        assert "Tema 1" in text
