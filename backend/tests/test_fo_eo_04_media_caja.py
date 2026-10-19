"""FO-EO-04: foto y gráfico caben en la misma caja de 130 mm × 98 mm."""

from __future__ import annotations

import base64
import io
import sys
from types import ModuleType, SimpleNamespace

from PIL import Image


def _import_informes_with_stubs():
    if "informes" in sys.modules:
        return sys.modules["informes"]

    stubs = {
        "main": SimpleNamespace(
            get_current_user=lambda: None,
            get_current_user_optional=lambda: None,
        ),
        "mail_smtp": SimpleNamespace(try_send_text_email=lambda *a, **k: None),
    }
    saved = {}
    for name, mod in stubs.items():
        saved[name] = sys.modules.get(name)
        fake = ModuleType(name)
        for k, v in vars(mod).items():
            if not k.startswith("_"):
                setattr(fake, k, v)
        sys.modules[name] = fake

    for extra in ("passlib", "passlib.context", "jose", "python_jose"):
        if extra not in sys.modules:
            sys.modules[extra] = ModuleType(extra)

    try:
        import informes as inf  # noqa: WPS433
    finally:
        for name, prev in saved.items():
            if prev is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = prev
    return inf


def _png_data_uri(w: int, h: int) -> str:
    im = Image.new("RGB", (w, h), (20, 80, 140))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def test_caja_foto_y_grafico_es_130_por_98():
    inf = _import_informes_with_stubs()
    assert inf._FO_EO04_MEDIA_ANCHO_MM == 130.0
    assert inf._FO_EO04_MEDIA_ALTO_MM == 98.0
    foto = inf._fo_eo_04_img_block_html(
        "https://example.test/alta.jpg",
        4,
        "foto",
        preview_ui=True,
        empty_label="Sin foto",
    )
    graf = inf._fo_eo_04_img_block_html(
        "https://example.test/ancho.png",
        5,
        "grafico",
        preview_ui=True,
        empty_label="Sin grafico",
    )
    for html in (foto, graf):
        assert "width:130" in html and "mm" in html
        assert "height:98" in html or "height:98.0mm" in html
        assert "object-fit:contain" in html
        assert "240px" not in html
    vacia = inf._fo_eo_04_img_block_html(
        None, None, "foto", preview_ui=False, empty_label="Sin foto"
    )
    assert "height:98" in vacia
    assert "width:130" in vacia


def test_foto_vertical_no_supera_98mm_en_el_pdf():
    inf = _import_informes_with_stubs()
    alta = _png_data_uri(100, 800)
    ancha = _png_data_uri(800, 100)
    w_pt = inf._fo_eo_04_pt_desde_mm(130)
    h_pt = inf._fo_eo_04_pt_desde_mm(98)
    fw, fh = inf._fo_eo_04_contain_pt(alta, w_pt, h_pt)
    assert fh <= h_pt + 0.05
    assert fw <= w_pt + 0.05
    assert abs(fh - h_pt) < 0.2
    assert fw < w_pt
    gw, gh = inf._fo_eo_04_contain_pt(ancha, w_pt, h_pt)
    assert abs(gw - w_pt) < 0.2
    assert gh <= h_pt + 0.05
    html_alta = inf._fo_eo_04_img_block_html(
        alta, None, "foto", preview_ui=False, empty_label="Sin foto"
    )
    assert f"height:{fh}pt" in html_alta
    assert "240px" not in html_alta
    assert "228px" not in html_alta
