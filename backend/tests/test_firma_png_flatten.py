"""Aplanado de PNG transparentes para PDFs (xhtml2pdf)."""
from __future__ import annotations

import base64
import io

from PIL import Image

from almacen_firma_pdf import firma_url_a_data_uri


def test_firma_url_aplana_png_transparente():
    im = Image.new("RGBA", (8, 8), (0, 128, 255, 0))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    out = firma_url_a_data_uri(uri)
    assert out.startswith("data:image/png;base64,")
    flat = Image.open(io.BytesIO(base64.b64decode(out.split(",", 1)[1])))
    assert flat.mode == "RGB"
    assert flat.getpixel((0, 0)) == (255, 255, 255)
