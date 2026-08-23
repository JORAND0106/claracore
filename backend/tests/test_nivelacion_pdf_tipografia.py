"""Tests: tipografía y logos del PDF de Circuito de Nivelación (no poligonal)."""
from __future__ import annotations

import base64
import io
import re

import pytest
from PIL import Image

from pdf_institucional import (
    _LOGO_BOX_H_PT_COMPACT,
    html_encabezado_institucional,
    prepare_image_for_pdf,
)
from topografia_utils import (
    html_documento_nivelacion_pdf,
    html_encabezado_pdf,
    html_encabezado_pdf_compacto,
    html_encabezado_pdf_nivelacion,
)


def _jpeg_uri(size: int = 80) -> str:
    im = Image.new("RGB", (size, size), (255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, format="JPEG")
    return prepare_image_for_pdf(
        f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}",
        max_px_w=size,
        max_px_h=size,
    )


def test_nivelacion_header_typography_and_dense_padding():
    html_doc = html_encabezado_pdf_nivelacion(
        {"numero": "1", "objeto": "O", "contratista": "C", "interventoria": "I", "entidad": "E"},
        "Informe de circuito de nivelación geométrica",
        "Circuito: demo",
        generado_por="Tester",
    )
    assert "font-size:10pt" in html_doc  # título compact 8→10
    assert "font-size:7.5pt" in html_doc  # meta/sub 5.5→7.5
    assert "Generado por" in html_doc
    assert "padding:1px 1px" in html_doc or "padding:2px 6px" in html_doc

    compact = html_encabezado_pdf_compacto(
        {"numero": "1", "objeto": "O", "contratista": "C", "interventoria": "I", "entidad": "E"},
        "Poligonal",
    )
    assert re.search(r"font-size:8pt;font-weight:bold", compact)

    full = html_encabezado_pdf(
        {"numero": "1", "objeto": "O", "contratista": "C", "interventoria": "I", "entidad": "E"},
        "Poligonal full",
    )
    assert re.search(r"font-size:10pt;font-weight:bold", full)


def test_nivelacion_header_logo_scale_20pct():
    """Nivelación usa scale 1.44 (+20% sobre el 1.2 previo); poligonal compacto sin scale."""
    # Fuente grande para que prepare/fit no queden limitados por píxeles chicos
    uri = _jpeg_uri(120)
    html_doc = html_encabezado_institucional(
        {"numero": "1", "objeto": "O", "contratista": "C", "interventoria": "I", "entidad": "E"},
        "Nivelación",
        compact=True,
        logo_scale=1.44,
        title_fs="10pt",
        meta_fs="7.5pt",
        dense=True,
        logo_uris={
            "logo_contratista": uri,
            "logo_interventoria": uri,
            "logo_entidad": uri,
        },
    )
    heights = [float(x) for x in re.findall(r"height:(\d+(?:\.\d+)?)pt", html_doc)]
    assert heights
    # Con URI pre-preparada el fit no upscalea por encima del natural; la caja pedida es 1.44×
    assert "width=\"13%\"" in html_doc
    assert html_doc.count('width="13%"') == 3
    assert 'width="61%"' in html_doc

    # El helper de nivelación pide scale 1.44
    src = open("/workspace/backend/topografia_utils.py", encoding="utf-8").read()
    idx = src.index("def html_encabezado_pdf_nivelacion")
    chunk = src[idx : idx + 1200]
    assert "logo_scale=1.44" in chunk

    compact = html_encabezado_institucional(
        {"numero": "1", "objeto": "O", "contratista": "C", "interventoria": "I", "entidad": "E"},
        "Poligonal",
        compact=True,
        logo_uris={
            "logo_contratista": uri,
            "logo_interventoria": uri,
            "logo_entidad": uri,
        },
    )
    h_compact = [float(x) for x in re.findall(r"height:(\d+(?:\.\d+)?)pt", compact)]
    assert max(h_compact) == pytest.approx(_LOGO_BOX_H_PT_COMPACT, abs=0.15)


def test_nivelacion_document_body_fonts_bumped():
    html_doc = html_documento_nivelacion_pdf(
        {
            "numero": "CT-1",
            "objeto": "Obra",
            "contratista": "A",
            "interventoria": "B",
            "entidad": "C",
        },
        {
            "nombre": "Circuito demo",
            "operador": "Op",
            "fecha_campo": "2026-01-01",
            "tipo_nivel": "electronico",
        },
        [],
        generado_por="QA",
    )
    assert 'font-size:10pt' in html_doc or "font-size:10pt;" in html_doc
    assert "font-size:7.5pt" in html_doc
    assert "font-size:7pt" in html_doc
    assert "font-size:9pt" in html_doc
    assert "Datos de campo" in html_doc
    assert "ELABORÓ" in html_doc
    assert "Informe de circuito de nivelación geométrica" in html_doc
