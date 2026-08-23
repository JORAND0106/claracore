"""Comparación real: logos +20% sin cambiar altura ni anchos de columna del encabezado."""
from __future__ import annotations

import base64
from io import BytesIO

import pytest
from PIL import Image, ImageDraw

from pdf_institucional import html_encabezado_institucional


def _raw_logo_data_uri(size: int = 200) -> str:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((12, 12, size - 12, size - 12), fill=(30, 100, 180, 255))
    buf = BytesIO()
    im.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def _measure(scale: float) -> dict:
    pytest.importorskip("xhtml2pdf")
    try:
        import fitz
    except ImportError:
        pytest.skip("pymupdf no disponible")
    from xhtml2pdf import pisa

    raw = _raw_logo_data_uri()
    c = {
        "numero": "1",
        "objeto": "Obra demo",
        "contratista": "Consorcio",
        "interventoria": "Inter",
        "entidad": "ICCU",
        "logo_contratista": raw,
        "logo_interventoria": raw,
        "logo_entidad": raw,
    }
    hdr = html_encabezado_institucional(
        c,
        "Informe de circuito de nivelación geométrica",
        subtitulo="Circuito: demo",
        compact=True,
        generado_por="QA",
        logo_scale=scale,
        title_fs="10pt",
        meta_fs="7.5pt",
        sub_fs="7.5pt",
        dense=True,
    )
    assert 'width="13%"' in hdr and 'width="61%"' in hdr
    html = f"<!DOCTYPE html><html><body>{hdr}<p>AFTER</p></body></html>"
    buf = BytesIO()
    assert pisa.CreatePDF(html, dest=buf).err == 0
    page = fitz.open(stream=buf.getvalue(), filetype="pdf")[0]
    imgs = sorted(page.get_image_info(), key=lambda x: x["bbox"][0])
    logo_hs = [imgs[i]["bbox"][3] - imgs[i]["bbox"][1] for i in range(min(3, len(imgs)))]
    after_y = None
    for b in page.get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                if span.get("text", "").strip() == "AFTER":
                    after_y = span["bbox"][1]
    wide = [
        d["rect"]
        for d in page.get_drawings()
        if d.get("rect") and (d["rect"].x1 - d["rect"].x0) > 400
    ]
    top = [r for r in wide if r.y0 < 90]
    hdr_h = (max(r.y1 for r in top) - min(r.y0 for r in top)) if top else None
    # Anchos de columna vía posiciones de logos (centro de cada imagen)
    centers = [0.5 * (imgs[i]["bbox"][0] + imgs[i]["bbox"][2]) for i in range(min(3, len(imgs)))]
    return {
        "logo_hs": logo_hs,
        "after_y": after_y,
        "hdr_h": hdr_h,
        "centers": centers,
        "col_widths_html": (13, 13, 61, 13),
    }


def test_logo_plus_20_keeps_header_height_and_column_widths():
    before = _measure(1.2)
    after = _measure(1.44)
    assert before["logo_hs"] and after["logo_hs"]
    ratio = after["logo_hs"][0] / before["logo_hs"][0]
    assert ratio == pytest.approx(1.2, abs=0.05)
    # Altura del bloque / posición del contenido siguiente intactas
    assert after["hdr_h"] == pytest.approx(before["hdr_h"], abs=0.5)
    assert after["after_y"] == pytest.approx(before["after_y"], abs=0.5)
    # Columnas HTML fijas
    assert after["col_widths_html"] == before["col_widths_html"] == (13, 13, 61, 13)
    # Centros de logos en la misma región de columna (no migran a otra columna)
    for i in range(3):
        assert after["centers"][i] == pytest.approx(before["centers"][i], abs=8.0)
