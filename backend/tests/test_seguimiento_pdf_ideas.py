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
    """Externa: grilla [logo entidad | título | meta]; sin logo contratista ni etiquetas."""
    from seguimiento_pdf import _encabezado_oficial_html, _logo_cell

    html = _encabezado_oficial_html(
        {"numero": "CT-2-2026", "objeto": "Obra", "logo_entidad": "", "numero_interventoria": "INT-9"},
        {
            "consecutivo": 2,
            "fecha_reunion": "2026-07-28",
            "tipo_acta": "externa",
            "hora_inicio": "08:00",
            "hora_fin": "09:00",
        },
        logo_contratista=_logo_cell(None, "Logo contratista"),
        logo_entidad=_logo_cell(None, "Logo entidad"),
    )
    assert "Logo entidad" in html
    # Un solo logo a la izquierda: no se renderiza el placeholder de contratista.
    assert "Logo contratista" not in html
    assert "Acta No." in html and "INT-9" in html
    assert "08:00" in html and "09:00" in html
    assert ">Contratista<" not in html
    assert ">Entidad<" not in html

    pdf = generar_pdf_acta(
        {"numero": "CT-2-2026", "objeto": "Obra", "logo_entidad": "", "numero_interventoria": "INT-9"},
        {
            "consecutivo": 2,
            "fecha_reunion": "2026-07-28",
            "tipo_acta": "externa",
            "hora_inicio": "08:00",
            "hora_fin": "09:00",
            "orden_del_dia": "Punto",
        },
        [],
        [],
        [],
    )
    text = _pdf_text(pdf)
    header = text.split("Objeto")[0]
    assert "Logo entidad" in header
    assert "Logo contratista" not in header
    assert "Acta Externa" in header or "Externa" in header
    assert "INT-9" in header
    assert "08:00" in header


def test_contenido_hash_incluye_quien_dijo():
    base = {"consecutivo": 1, "fecha_reunion": "2026-01-01"}
    h1 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "A", "orden": 0}], [])
    h2 = contenido_hash_acta(base, [], [{"texto": "X", "quien_dijo": "B", "orden": 0}], [])
    assert h1 != h2


def test_logo_encabezado_tamano_intermedio_visible():
    """Contratista y entidad a ~40pt reales en pt (xhtml2pdf no debe aplicar ×0.75 de attrs px)."""
    import base64
    import io
    import re

    from PIL import Image

    from seguimiento_pdf import (
        _LOGO_BASE_H_PT,
        _LOGO_ENTIDAD_CELL_W_PT,
        _LOGO_ENTIDAD_MAX_H,
        _LOGO_ENTIDAD_MAX_W_PCT,
        _LOGO_MAX_H,
        _LOGO_MAX_W_PCT,
        _fit_logo_pt,
        _logo_cell,
    )

    assert _LOGO_BASE_H_PT == 22
    assert _LOGO_MAX_H == 40
    assert _LOGO_ENTIDAD_MAX_H == _LOGO_MAX_H
    assert _LOGO_ENTIDAD_MAX_W_PCT == _LOGO_MAX_W_PCT
    # Visibilidad: claramente por encima del 9pt que quedó ilegible.
    assert _LOGO_MAX_H >= 36
    assert _LOGO_ENTIDAD_MAX_H > 9

    img = Image.new("RGB", (400, 200), (20, 80, 160))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    max_w_ent = _LOGO_ENTIDAD_CELL_W_PT * (_LOGO_ENTIDAD_MAX_W_PCT / 100.0)
    w_pt, h_pt = _fit_logo_pt(uri, max_h_pt=float(_LOGO_ENTIDAD_MAX_H), max_w_pt=max_w_ent)
    assert h_pt <= _LOGO_ENTIDAD_MAX_H + 0.01
    assert w_pt <= max_w_ent + 0.01

    # xhtml2pdf: solo style en pt (attrs width/height unitless se interpretan como px).
    entidad = _logo_cell(uri, "E", max_h=_LOGO_ENTIDAD_MAX_H, max_w_pct=_LOGO_ENTIDAD_MAX_W_PCT)
    assert f"height:{h_pt}pt" in entidad
    assert 'width="' not in entidad  # attrs unitless reducirían el tamaño (40→30pt)

    placeholder = _logo_cell(None, "E", max_h=_LOGO_ENTIDAD_MAX_H, max_w_pct=_LOGO_ENTIDAD_MAX_W_PCT)
    assert f"min-height:{_LOGO_ENTIDAD_MAX_H}pt" in placeholder

    from xhtml2pdf import pisa
    from pypdf import PdfReader

    out = io.BytesIO()
    pisa.CreatePDF(f"<html><body>{entidad}</body></html>", dest=out)
    page = PdfReader(io.BytesIO(out.getvalue())).pages[0]
    data = page.get_contents().get_data()
    cms = re.findall(rb"([\d\.\-]+) 0 0 ([\d\.\-]+) [\d\.\-]+ [\d\.\-]+ cm", data)
    assert cms, "se esperaba matriz de escala de imagen"
    rendered_h = float(cms[-1][1])
    # Debe respetar el tope en pt (no el 75% de la conversión px→pt).
    assert abs(rendered_h - float(_LOGO_ENTIDAD_MAX_H)) < 1.5, (rendered_h, h_pt)
    assert rendered_h >= 36.0, rendered_h


def test_pdf_acta_cache_key_incluye_version_plantilla():
    from seguimiento_pdf import (
        PDF_ACTA_TEMPLATE_VERSION,
        parse_pdf_acta_cache_key,
        pdf_acta_cache_key,
    )

    key = pdf_acta_cache_key("abc123")
    assert key.startswith(f"{PDF_ACTA_TEMPLATE_VERSION}:")
    assert key.endswith("abc123")
    ver, h = parse_pdf_acta_cache_key(key)
    assert ver == PDF_ACTA_TEMPLATE_VERSION
    assert h == "abc123"
    # Legacy sin versión → no coincide con la plantilla actual
    ver_legacy, h_legacy = parse_pdf_acta_cache_key("abc123")
    assert ver_legacy is None and h_legacy == "abc123"
    assert pdf_acta_cache_key("abc123") != "abc123"


def test_encabezado_compacto_constantes_y_legibilidad():
    """Grilla unificada [logo|título|meta]; logo 40pt; asistentes compactos."""
    from seguimiento_pdf import (
        _ASIS_PAD,
        _HDR_META_FS,
        _HDR_PAD,
        _HDR_TITLE_FS,
        _LOGO_ENTIDAD_MAX_H,
        _LOGO_ENTIDAD_MAX_W_PCT,
        _LOGO_MAX_H,
        _encabezado_oficial_html,
        _logo_cell,
    )

    assert _LOGO_MAX_H == 40
    assert _LOGO_ENTIDAD_MAX_H == _LOGO_MAX_H
    assert _LOGO_MAX_H >= 36
    assert _ASIS_PAD == "2pt 4pt"
    assert "7.5" in _HDR_TITLE_FS or float(_HDR_TITLE_FS.replace("pt", "")) <= 8.0
    assert float(_HDR_META_FS.replace("pt", "")) <= 6.5
    assert "1pt" in _HDR_PAD or "2pt" in _HDR_PAD

    logo = _logo_cell(None, "Logo")
    assert f"min-height:{_LOGO_MAX_H}pt" in logo

    for tipo in ("interna", "externa"):
        logo_ent = _logo_cell(
            None,
            "Logo entidad",
            max_h=_LOGO_ENTIDAD_MAX_H,
            max_w_pct=_LOGO_ENTIDAD_MAX_W_PCT,
        )
        html = _encabezado_oficial_html(
            {"numero": "CT-9-2026", "objeto": "Obra de prueba", "numero_interventoria": "INT-1"},
            {
                "consecutivo": 3,
                "fecha_reunion": "2026-07-28",
                "tipo_acta": tipo,
                "hora_inicio": "08:00",
                "hora_fin": "09:30",
            },
            logo_contratista=_logo_cell(None, "Logo contratista"),
            logo_entidad=logo_ent,
        )
        assert "Acta No." in html
        assert "08:00" in html and "09:30" in html
        assert "INT-1" in html
        assert "Objeto del contrato" in html
        assert "width:18%" in html and "width:44%" in html and "width:38%" in html
        if tipo == "externa":
            assert "Logo entidad" in html
            assert "Logo contratista" not in html
        else:
            assert "Logo contratista" in html
            assert "Logo entidad" not in html
        assert ">Contratista<" not in html
        assert ">Entidad<" not in html
        assert "padding:8pt" not in html
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
