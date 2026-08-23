"""Tests: encabezado 3 logos + flatten de transparencia para PDF."""
from __future__ import annotations

import base64
import io
import re

import pytest

from almacen_firma_pdf import _flatten_image_bytes_on_white
from pdf_institucional import (
    html_encabezado_institucional,
    prepare_image_for_pdf,
    prepare_logos_contrato,
)
from topografia_utils import html_encabezado_pdf, html_encabezado_pdf_compacto


def _png_rgba_with_transparent_corners(size=32) -> bytes:
    from PIL import Image

    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for x in range(8, 24):
        for y in range(8, 24):
            im.putpixel((x, y), (0, 120, 255, 255))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def test_flatten_transparent_png_not_black_background():
    raw = _png_rgba_with_transparent_corners()
    flat, mime = _flatten_image_bytes_on_white(raw)
    assert mime == "image/png"
    from PIL import Image

    im = Image.open(io.BytesIO(flat)).convert("RGB")
    # Esquina que era transparente → blanco, no negro
    assert im.getpixel((0, 0)) == (255, 255, 255)
    # Centro opaco azul
    r, g, b = im.getpixel((16, 16))
    assert b > 200 and r < 80


def test_prepare_image_for_pdf_data_uri_flattens():
    raw = _png_rgba_with_transparent_corners()
    data_uri = f"data:image/png;base64,{base64.b64encode(raw).decode()}"
    out = prepare_image_for_pdf(data_uri)
    assert out.startswith("data:image/")
    m = re.match(r"data:image/[^;]+;base64,(.+)$", out)
    assert m
    decoded = base64.b64decode(m.group(1))
    from PIL import Image

    im = Image.open(io.BytesIO(decoded)).convert("RGB")
    assert im.getpixel((1, 1)) == (255, 255, 255)


def test_html_encabezado_institucional_tres_placeholders():
    html_doc = html_encabezado_institucional(
        {"numero": "C-1", "objeto": "Obra demo", "contratista": "A", "interventoria": "B", "entidad": "C"},
        "Informe Topografía",
        logo_uris={},
    )
    assert "Contratista" in html_doc
    assert "Interventoría" in html_doc
    assert "Entidad" in html_doc
    assert "Informe Topografía" in html_doc
    assert "Contrato N° C-1" in html_doc


def test_topo_html_encabezado_usa_tres_logos():
    contrato = {
        "numero": "99",
        "objeto": "Test",
        "contratista": "Contratista SA",
        "interventoria": "Interventoria SA",
        "entidad": "Municipio",
        "logo_contratista": "",
        "logo_interventoria": "",
        "logo_entidad": "",
    }
    full = html_encabezado_pdf(contrato, "Poligonal cerrada")
    compact = html_encabezado_pdf_compacto(contrato, "Nivelación", subtitulo="Circuito 1")
    for doc in (full, compact):
        assert "Contratista" in doc
        assert "Interventoría" in doc
        assert "Entidad" in doc


def test_prepare_image_bare_base64_png():
    raw = _png_rgba_with_transparent_corners()
    out = prepare_image_for_pdf(base64.b64encode(raw).decode())
    assert out.startswith("data:image/")
    m = re.match(r"data:image/[^;]+;base64,(.+)$", out)
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGB")
    assert im.getpixel((1, 1)) == (255, 255, 255)


def test_prepare_logos_contrato_keys():
    out = prepare_logos_contrato({})
    assert set(out.keys()) == {"logo_contratista", "logo_interventoria", "logo_entidad"}


def test_informes_logo_url_pdf_safe_calls_prepare():
    """Regresión: _logo_url_pdf_safe debe aplanar (no dejar GIF/PNG con alpha crudo)."""
    src = open("/workspace/backend/informes.py", encoding="utf-8").read()
    # Localizar la función actual (no la docstring antigua)
    idx = src.index("def _logo_url_pdf_safe")
    chunk = src[idx : idx + 900]
    assert "prepare_image_for_pdf" in chunk
    assert "convert(\"RGBA\")  # preserva transparencia del GIF" not in chunk
