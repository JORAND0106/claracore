"""Esquema PNG nítido en PDF Bitácora: sin JPEG ni thumbnail agresivo."""
from __future__ import annotations

import base64
import io
import re

import bitacora_pdf as pdf


def _png_line_art(w: int = 2200, h: int = 2800) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    im = Image.new("RGB", (w, h), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 36)
        font_sm = ImageFont.truetype("DejaVuSans.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
        font_sm = font
    dr.rectangle([40, 40, w - 40, 180], outline=(15, 118, 110), width=3)
    dr.text((60, 70), "Memoria de cálculo — Color", fill=(15, 23, 42), font=font)
    dr.text((60, 130), "Volumen total 2,27 m³", fill=(15, 23, 42), font=font_sm)
    # Isométrico sintético (líneas finas).
    dr.polygon([(400, 900), (900, 700), (1400, 900), (900, 1100)], outline=(0, 100, 80))
    dr.line([(400, 900), (400, 1400), (900, 1600), (900, 1100)], fill=(0, 100, 80), width=2)
    dr.line([(1400, 900), (1400, 1400), (900, 1600)], fill=(0, 100, 80), width=2)
    # Tabla: encabezado Color en una línea + filas.
    y0 = 1800
    headers = ["#", "Color", "Nombre", "Volumen (m³)"]
    xs = [60, 120, 220, 900]
    for i, lab in enumerate(headers):
        dr.text((xs[i], y0), lab, fill=(255, 255, 255), font=font_sm)
    dr.rectangle([50, y0 - 8, w - 50, y0 + 36], outline=(15, 118, 110), width=2)
    dr.rectangle([50, y0 - 8, w - 50, y0 + 36], fill=(15, 118, 110))
    for i, lab in enumerate(headers):
        dr.text((xs[i], y0), lab, fill=(255, 255, 255), font=font_sm)
    for r in range(5):
        yy = y0 + 50 + r * 40
        dr.text((60, yy), str(r + 1), fill=(15, 23, 42), font=font_sm)
        dr.rectangle([130, yy + 4, 170, yy + 24], fill=(20 + r * 30, 140, 100))
        dr.text((220, yy), f"Elemento {r + 1}", fill=(15, 23, 42), font=font_sm)
        dr.text((900, yy), f"0,{40 + r}", fill=(15, 23, 42), font=font_sm)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def test_tabla_esquema_embebe_png_sin_jpeg():
    raw = _png_line_art(2400, 3000)
    uri = pdf._bytes_to_pdf_data_uri(
        raw,
        pdf._TABLA_MAX_PX_W,
        pdf._TABLA_MAX_PX_H,
        lossless=True,
    )
    assert uri.startswith("data:image/png;base64,")
    m = re.match(r"data:image/png;base64,(.+)$", uri)
    out = base64.b64decode(m.group(1))
    from PIL import Image

    im = Image.open(io.BytesIO(out))
    # Resolución completa (sin thumbnail a 1600).
    assert im.size[0] >= 2200
    assert im.size[1] >= 2800
    assert im.format == "PNG"


def test_foto_sigue_jpeg_compacto():
    raw = _png_line_art(800, 600)
    uri = pdf._bytes_to_pdf_data_uri(
        raw, pdf._FOTO_MAX_PX_W, pdf._FOTO_MAX_PX_H, lossless=False,
    )
    assert uri.startswith("data:image/jpeg;base64,")
    m = re.match(r"data:image/[^;]+;base64,(.+)$", uri)
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(m.group(1))))
    assert im.size[0] <= pdf._FOTO_MAX_PX_W
    assert im.size[1] <= pdf._FOTO_MAX_PX_H


def test_prepare_tabla_conserva_png_y_resolucion(monkeypatch):
    raw = _png_line_art(2000, 2500)
    data_uri = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")

    out = pdf._prepare_img_asset(
        {
            "kind": "memoria-calculo",
            "nombre": "memoria_calculo_muro.png",
            "origen": "esquema-calculo",
            "data_uri": data_uri,
        },
        1,
    )
    assert out is not None
    uri, w_pt, h_pt = out
    assert uri.startswith("data:image/png;base64,")
    m = re.match(r"data:image/png;base64,(.+)$", uri)
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(m.group(1))))
    assert im.size[0] >= 1900
    assert im.size[1] >= 2400
    # Caja a ancho de página (no foto 2×2).
    assert w_pt <= pdf._TABLA_BOX_W + 1
    assert h_pt <= pdf._TABLA_BOX_H + 1
    assert w_pt > pdf._FOTO_BOX_W


def test_tope_px_tablas_mucho_mayor_que_fotos():
    assert pdf._TABLA_MAX_PX_W >= 4000
    assert pdf._TABLA_MAX_PX_H >= 5000
    assert pdf._TABLA_MAX_PX_W > pdf._FOTO_MAX_PX_W * 8
    assert pdf._TABLA_BLOB_MAX_BYTES >= 10_000_000


def test_peso_pdf_png_vs_jpeg_razonable():
    """Caso d: PNG lossless es más pesado que JPEG, pero acotado vs. foto-JPEG."""
    raw = _png_line_art(1800, 2200)
    png_uri = pdf._bytes_to_pdf_data_uri(
        raw, pdf._TABLA_MAX_PX_W, pdf._TABLA_MAX_PX_H, lossless=True,
    )
    jpeg_uri = pdf._bytes_to_pdf_data_uri(
        raw, 1600, 2000, jpeg_quality=85, lossless=False,
    )
    png_b64 = re.match(r"data:image/[^;]+;base64,(.+)$", png_uri).group(1)
    jpeg_b64 = re.match(r"data:image/[^;]+;base64,(.+)$", jpeg_uri).group(1)
    png_len = len(base64.b64decode(png_b64))
    jpeg_len = len(base64.b64decode(jpeg_b64))
    # Line-art PNG suele ser comparable o algo mayor; no debe dispararse ×10.
    assert png_len > 0 and jpeg_len > 0
    assert png_len < jpeg_len * 8 or png_len < 1_500_000
    # Evidencia para el informe de entrega.
    print(
        f"peso_embed caso-d: jpeg_legacy={jpeg_len} png_lossless={png_len} "
        f"ratio={png_len / max(1, jpeg_len):.2f}"
    )


if __name__ == "__main__":
    test_tabla_esquema_embebe_png_sin_jpeg()
    test_foto_sigue_jpeg_compacto()

    class _Dummy:
        pass

    # prepare sin monkeypatch de blob
    test_prepare_tabla_conserva_png_y_resolucion(_Dummy())
    test_tope_px_tablas_mucho_mayor_que_fotos()
    test_peso_pdf_png_vs_jpeg_razonable()
    print("ok")
