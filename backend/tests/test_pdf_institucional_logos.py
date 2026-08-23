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


def _near_white(rgb, tol: int = 8) -> bool:
    return all(c >= 255 - tol for c in rgb[:3])


def _png_rgba_with_transparent_corners(size=32) -> bytes:
    from PIL import Image

    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for x in range(8, 24):
        for y in range(8, 24):
            im.putpixel((x, y), (0, 120, 255, 255))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _png_logo_on_opaque_black_matte(size=64) -> bytes:
    """Simula logo institucional (p.ej. ICCU) exportado con mate negro opaco."""
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((10, 10, size - 10, size - 10), fill=(30, 100, 180, 255))
    d.polygon(
        [(size // 2, 16), (14, size - 14), (size - 14, size - 14)],
        fill=(240, 200, 40, 255),
    )
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _rgb_logo_on_black_matte(size=64) -> bytes:
    """Misma situación sin canal alpha (JPEG/PNG RGB)."""
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (size, size), (0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((10, 10, size - 10, size - 10), fill=(30, 100, 180))
    d.polygon(
        [(size // 2, 16), (14, size - 14), (size - 14, size - 14)],
        fill=(240, 200, 40),
    )
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def test_flatten_transparent_png_not_black_background():
    raw = _png_rgba_with_transparent_corners()
    flat, mime = _flatten_image_bytes_on_white(raw)
    assert mime == "image/png"
    from PIL import Image

    im = Image.open(io.BytesIO(flat)).convert("RGB")
    assert im.getpixel((0, 0)) == (255, 255, 255)
    r, g, b = im.getpixel((16, 16))
    assert b > 200 and r < 80


def test_flatten_opaque_black_matte_becomes_white():
    """Causa del ICCU en Topografía: mate negro opaco (no alpha) → debe blanquearse."""
    from PIL import Image

    for raw in (_png_logo_on_opaque_black_matte(), _rgb_logo_on_black_matte()):
        # Sin knockout el mate negro opaco permanece (regresión del bug ICCU).
        flat_raw, _ = _flatten_image_bytes_on_white(raw, knockout_black_matte=False)
        im_raw = Image.open(io.BytesIO(flat_raw)).convert("RGB")
        assert im_raw.getpixel((1, 1)) == (0, 0, 0)

        flat, _ = _flatten_image_bytes_on_white(raw, knockout_black_matte=True)
        im = Image.open(io.BytesIO(flat)).convert("RGB")
        assert im.getpixel((1, 1)) == (255, 255, 255)
        mid = im.getpixel((im.size[0] // 2, im.size[1] // 2))
        assert mid != (255, 255, 255)


def test_prepare_image_for_pdf_data_uri_flattens():
    raw = _png_rgba_with_transparent_corners()
    data_uri = f"data:image/png;base64,{base64.b64encode(raw).decode()}"
    out = prepare_image_for_pdf(data_uri)
    assert out.startswith("data:image/jpeg")
    m = re.match(r"data:image/[^;]+;base64,(.+)$", out)
    assert m
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGB")
    assert _near_white(im.getpixel((1, 1)))


def test_prepare_black_matte_logo_entidad():
    raw = _png_logo_on_opaque_black_matte(120)
    out = prepare_image_for_pdf(f"data:image/png;base64,{base64.b64encode(raw).decode()}")
    assert out.startswith("data:image/jpeg")
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(out.split(",", 1)[1]))).convert("RGB")
    assert _near_white(im.getpixel((2, 2)))


def test_html_encabezado_usa_tamano_explicito_pt():
    """xhtml2pdf ignora max-height; el encabezado debe fijar width/height en pt y attrs."""
    raw = _png_rgba_with_transparent_corners(64)
    uri = prepare_image_for_pdf(f"data:image/png;base64,{base64.b64encode(raw).decode()}")
    html_doc = html_encabezado_institucional(
        {"numero": "C-1", "objeto": "Obra", "contratista": "A", "interventoria": "B", "entidad": "C"},
        "Poligonal",
        logo_uris={
            "logo_contratista": uri,
            "logo_interventoria": uri,
            "logo_entidad": uri,
        },
    )
    assert "max-height" not in html_doc
    assert re.search(r'width="\d+"', html_doc)
    assert re.search(r'height="\d+"', html_doc)
    assert re.search(r"width:\d+(\.\d+)?pt", html_doc)
    assert re.search(r"height:\d+(\.\d+)?pt", html_doc)
    heights = [float(x) for x in re.findall(r"height:(\d+(?:\.\d+)?)pt", html_doc)]
    # Caja −40% sobre original 48pt → 28.8pt
    assert heights and max(heights) <= 30.0


def test_logo_box_is_40_percent_smaller_than_original():
    """Constantes: caja actual = 60% de la original (reducción del 40%)."""
    from pdf_institucional import (
        _LOGO_BOX_H_PT,
        _LOGO_BOX_W_PT,
        _LOGO_ORIG_H_PT,
        _LOGO_ORIG_W_PT,
        _LOGO_SIZE_FACTOR,
    )

    assert _LOGO_SIZE_FACTOR == pytest.approx(0.60)
    assert _LOGO_BOX_H_PT == pytest.approx(_LOGO_ORIG_H_PT * 0.60, abs=0.01)
    assert _LOGO_BOX_W_PT == pytest.approx(_LOGO_ORIG_W_PT * 0.60, abs=0.01)


def test_pdf_render_logo_height_is_40_percent_of_original():
    """Comparación real de bboxes PDF: reducido / original ≈ 0.60."""
    pytest.importorskip("xhtml2pdf")
    from io import BytesIO

    from PIL import Image, ImageDraw
    from xhtml2pdf import pisa

    from pdf_institucional import (
        _LOGO_BOX_H_PT,
        _LOGO_BOX_W_PT,
        _LOGO_ORIG_H_PT,
        _LOGO_ORIG_W_PT,
        _fit_pt,
        _logo_cell_html,
        prepare_image_for_pdf,
    )

    try:
        import fitz
    except ImportError:
        pytest.skip("pymupdf no disponible")

    im = Image.new("RGB", (200, 200), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((20, 20, 180, 180), fill=(30, 100, 180))
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=90)
    uri_big = f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    uri_prep = prepare_image_for_pdf(uri_big)

    def _pdf_logo_h(max_h: float, max_w: float, uri: str) -> float:
        cell = _logo_cell_html(uri, "L", max_h_pt=max_h, max_w_pt=max_w)
        html_doc = f"<html><body>{cell}</body></html>"
        out = BytesIO()
        assert pisa.CreatePDF(html_doc, dest=out).err == 0
        doc = fitz.open(stream=out.getvalue(), filetype="pdf")
        infos = doc[0].get_image_info()
        assert infos
        b = infos[0]["bbox"]
        return float(b[3] - b[1])

    h_orig = _pdf_logo_h(_LOGO_ORIG_H_PT, _LOGO_ORIG_W_PT, uri_big)
    h_new = _pdf_logo_h(_LOGO_BOX_H_PT, _LOGO_BOX_W_PT, uri_prep)
    ratio = h_new / h_orig
    assert h_orig == pytest.approx(48.0, abs=0.5)
    assert h_new == pytest.approx(28.8, abs=0.5)
    assert ratio == pytest.approx(0.60, abs=0.05)
    w, h = _fit_pt(uri_prep, _LOGO_BOX_W_PT, _LOGO_BOX_H_PT)
    assert h <= _LOGO_BOX_H_PT + 0.01
    assert w <= _LOGO_BOX_W_PT + 0.01


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
    assert _near_white(im.getpixel((1, 1)))


def test_prepare_logos_contrato_keys():
    out = prepare_logos_contrato({})
    assert set(out.keys()) == {"logo_contratista", "logo_interventoria", "logo_entidad"}


def test_informes_logo_url_pdf_safe_calls_prepare():
    """Regresión: _logo_url_pdf_safe debe aplanar (no dejar GIF/PNG con alpha crudo)."""
    src = open("/workspace/backend/informes.py", encoding="utf-8").read()
    idx = src.index("def _logo_url_pdf_safe")
    chunk = src[idx : idx + 900]
    assert "prepare_image_for_pdf" in chunk
    assert "convert(\"RGBA\")  # preserva transparencia del GIF" not in chunk
