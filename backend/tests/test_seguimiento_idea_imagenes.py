"""Esquemas/gráficos en ideas: tamaño fijo en PDF y adjunto API."""
from __future__ import annotations

import base64
import io
import re

from PIL import Image
from pypdf import PdfReader
from xhtml2pdf import pisa

from seguimiento_pdf import (
    _IDEA_IMG_BOX_H_PT,
    _IDEA_IMG_BOX_W_PT,
    _fit_image_in_box_pt,
    _idea_imagenes_html,
    contenido_hash_acta,
    generar_pdf_acta,
)
from seguimiento_service import _normalizar_imagenes_idea, adjuntar_imagen_idea_base64


def _png_data_uri(w=800, h=200, color=(30, 90, 180)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def test_fit_image_in_box_no_excede_caja_estandar():
    uri = _png_data_uri(1200, 400)
    w, h = _fit_image_in_box_pt(uri)
    assert w <= _IDEA_IMG_BOX_W_PT + 0.05
    assert h <= _IDEA_IMG_BOX_H_PT + 0.05
    # Proporción ~3:1
    assert abs((w / h) - 3.0) < 0.15


def test_idea_imagenes_html_usa_width_height_explicitos():
    uri = _png_data_uri(600, 600)
    html = _idea_imagenes_html([{"nombre": "Plano.png", "data_uri": uri}])
    assert "width:" in html and "height:" in html
    assert "max-height" not in html
    assert str(int(_IDEA_IMG_BOX_W_PT)) in html or f"{_IDEA_IMG_BOX_W_PT}" in html
    # xhtml2pdf escala con height explícito
    out = io.BytesIO()
    pisa.CreatePDF(f"<html><body>{html}</body></html>", dest=out)
    page = PdfReader(io.BytesIO(out.getvalue())).pages[0]
    data = page.get_contents().get_data()
    cms = re.findall(rb"([\d\.\-]+) 0 0 ([\d\.\-]+) [\d\.\-]+ [\d\.\-]+ cm", data)
    assert cms
    rendered_h = float(cms[-1][1])
    assert rendered_h <= _IDEA_IMG_BOX_H_PT + 2.0
    assert rendered_h < 200  # no usa tamaño intrínseco enorme


def test_pdf_acta_incluye_esquema_en_tema():
    uri = _png_data_uri(500, 300)
    pdf = generar_pdf_acta(
        {"numero": "CT-IMG-1", "objeto": "Obra"},
        {
            "consecutivo": 1,
            "fecha_reunion": "2026-07-31",
            "tipo_acta": "interna",
            "orden_del_dia": "Punto",
        },
        [],
        [{
            "orden": 0,
            "texto": "Se adjunta esquema de drenaje.",
            "titulo": "Drenaje",
            "imagenes": [{"nombre": "drenaje.png", "data_uri": uri}],
        }],
        [],
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000


def test_contenido_hash_cambia_con_imagenes():
    base = {"consecutivo": 1, "fecha_reunion": "2026-01-01"}
    h1 = contenido_hash_acta(base, [], [{"texto": "X", "orden": 0, "imagenes": []}], [])
    h2 = contenido_hash_acta(
        base, [],
        [{"texto": "X", "orden": 0, "imagenes": [{"blob_path": "seguimiento-acta-ideas/1/a.png"}]}],
        [],
    )
    assert h1 != h2


def test_normalizar_imagenes_idea_omite_pending_sin_blob():
    out = _normalizar_imagenes_idea([
        {"nombre": "a.png", "data_uri": "data:image/png;base64,aaa", "pending": True},
        {"nombre": "b.png", "blob_path": "seguimiento-acta-ideas/1/b.png", "mime_type": "image/png"},
    ])
    assert len(out) == 1
    assert out[0]["blob_path"].endswith("b.png")
    assert "data_uri" not in out[0] or out[0].get("data_uri") is None


def test_adjuntar_imagen_idea_base64(monkeypatch):
    idea_row = {
        "id": 11,
        "acta_id": 5,
        "texto": "Idea",
        "imagenes": [],
    }
    store = {"idea": dict(idea_row)}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self):
            self._op = None
            self._payload = None

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def update(self, payload):
            self._op = "update"
            self._payload = payload
            store["idea"].update(payload)
            return self

        def execute(self):
            if self._op == "update":
                return _Resp([store["idea"]])
            return _Resp([store["idea"]])

    class _SB:
        def table(self, _name):
            return _Q()

    monkeypatch.setattr(
        "seguimiento_service._ensure_idea_imagenes_column",
        lambda _sb: True,
    )
    monkeypatch.setattr(
        "seguimiento_service.get_acta",
        lambda sb, aid, cid: {"id": aid, "estado": "borrador", "elaborador_id": 1},
    )
    monkeypatch.setattr(
        "seguimiento_service._assert_puede_editar_acta",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "seguimiento_service._store_imagen_bytes",
        lambda idea_id, nombre, content, mime, prefix="seguimiento-tareas": {
            "nombre": nombre,
            "blob_path": f"{prefix}/{idea_id}/{nombre}",
            "data_uri": "data:image/png;base64,xx",
            "mime_type": mime,
            "created_at": "2026-07-31T00:00:00+00:00",
        },
    )
    monkeypatch.setattr("seguimiento_service._touch_acta_hora_fin", lambda *a, **k: None)

    uri = _png_data_uri(40, 40)
    out = adjuntar_imagen_idea_base64(
        _SB(), 1, 11, 1, "plano.png", uri, "image/png",
    )
    assert len(out.get("imagenes") or []) == 1
    assert store["idea"]["imagenes"][0]["blob_path"].startswith("seguimiento-acta-ideas/")
