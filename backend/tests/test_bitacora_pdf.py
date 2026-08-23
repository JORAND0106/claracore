"""Tests PDF Bitácora (encabezado / clima / layout compacto)."""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_pdf as pdf


def test_encabezado_incluye_tres_logos():
    pal = pdf._palette({})
    html = pdf._encabezado({
        "numero": "C-1",
        "objeto": "Obra demo",
        "contratista": "ABC",
        "interventoria": "INT",
        "entidad": "IDU",
        "logo_contratista": None,
        "logo_interventoria": None,
        "logo_entidad": None,
    }, "2026-08-20", pal)
    assert "Bitácora de Obra" in html
    assert "Contratista" in html
    assert "Interventoría" in html
    assert "Entidad" in html
    assert "C-1" in html


def test_html_clima_en_panel_compacto():
    pal = pdf._palette({})
    slots = [
        {"hora": "06:00", "hora_num": 6, "clima_descripcion": "Lluvia", "clima_temp_c": 18.0, "manual": True},
        {"hora": "09:00", "hora_num": 9, "clima_descripcion": "Despejado", "clima_temp_c": 22.0, "manual": False},
    ]
    html = pdf._html_panel_superior(
        {"personal": [{"cargo": "Oficial", "cantidad": 2}], "equipos_uso": [], "hora_inicio_labores": "07:00"},
        slots,
        pal,
    )
    assert "Clima" in html
    assert "Personal" in html
    assert "Maquinaria" in html
    assert "★" in html


def test_materiales_muestra_pk_no_placa():
    pal = pdf._palette({})
    html = pdf._html_materiales({
        "materiales": [{
            "movimiento": "ingreso",
            "tipo_material": "Arena",
            "cantidad": 1,
            "numeros_vale": "10",
            "ubicacion_pk": "PK 1+200",
            "placa": "ABC123",
        }],
    }, pal)
    assert "PK 1+200" in html
    assert "ABC123" not in html
    assert "Vale(s)" in html
    assert "Placa" not in html


def test_cuerpo_diario_materiales_ancho_completo_obs_fotos_mitades():
    """Materiales full-width; debajo Observaciones (izq) | Registro Fotográfico (der)."""
    pal = pdf._palette({})
    html = pdf._html_cuerpo_diario(
        {
            "materiales": [{
                "movimiento": "ingreso",
                "tipo_material": "Arena",
                "cantidad": 1,
                "ubicacion_pk": "PK 1+000",
            }],
            "cuerpo_html": "<p>Novedad de obra</p>",
            "created_by_nombre": "Ana",
            "imagenes": [],
        },
        1,
        pal,
    )
    idx_mat = html.find("Materiales")
    idx_obs = html.find("Observaciones")
    idx_foto = html.find("Registro Fotográfico")
    assert 0 <= idx_mat < idx_obs < idx_foto
    assert "Elaborado por: Ana" in html
    assert "Novedad de obra" in html
    assert "PK 1+000" in html
    # Mitades 50/50 debajo de Materiales (no columnas 52/48 con materiales a la izquierda).
    assert 'width="50%"' in html
    assert 'width="52%"' not in html
    # Materiales queda fuera de la tabla de mitades.
    split_idx = html.find('width="50%"')
    assert split_idx > 0
    assert html.find("Materiales") < split_idx
    assert html.find("Observaciones") > split_idx


def test_fit_pt_no_deforma_vertical_en_caja_horizontal():
    """Fotos verticales se ajustan dentro de la caja landscape sin estirar."""
    import base64
    import io

    from PIL import Image

    im = Image.new("RGB", (100, 200), (10, 20, 30))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    w, h = pdf._fit_pt(uri, pdf._FOTO_BOX_W, pdf._FOTO_BOX_H)
    assert w <= pdf._FOTO_BOX_W + 1e-6
    assert h <= pdf._FOTO_BOX_H + 1e-6
    assert abs((w / h) - 0.5) < 0.02


def test_foto_box_mas_grande_que_legacy():
    """Caja landscape ampliada respecto al tamaño previo (~118×78)."""
    assert pdf._FOTO_BOX_W >= 160
    assert pdf._FOTO_BOX_H >= 100
    assert pdf._FOTO_BOX_W / pdf._FOTO_BOX_H > 1.3  # landscape


def test_pie_foto_label_combina_tipo_y_usuario():
    assert pdf._pie_foto_label({}, "Reporte Diario") == "Reporte Diario"
    assert pdf._pie_foto_label({"pie": "Frente norte"}, "Reporte Diario") == (
        "Reporte Diario — Frente norte"
    )
    assert pdf._pie_foto_label({"caption": "X"}, "Reporte de Evento").endswith("X")


def test_omit_pagina_eventos_si_vacia(monkeypatch):
    pdf.clear_pdf_caches_for_tests()
    captured = {}

    def fake_pdf(doc, landscape=True):
        captured["doc"] = doc
        return b"%PDF-1.4 mock"

    monkeypatch.setattr(pdf, "contrato_meta_bitacora", lambda *_a, **_k: {
        "id": 1,
        "numero": "X",
        "objeto": "O",
        "contratista": "C",
        "interventoria": "I",
        "entidad": "E",
        "geo_lat": 4.7,
        "geo_lng": -74.0,
        "logo_entidad": None,
        "logo_contratista": None,
        "logo_interventoria": None,
        "export_palette": {
            "encabezado": {"bg": "#112233", "text": "#FFFFFF"},
            "titulo_1": {"bg": "#223344", "text": "#FFFFFF"},
            "titulo_2": {"bg": "#334455", "text": "#FFFFFF"},
            "linea_principal": {"bg": "#FFFFFF", "text": "#112233"},
            "linea_secundaria": {"bg": "#F0F0F0", "text": "#112233"},
        },
    })
    monkeypatch.setattr(pdf, "list_entradas_del_dia", lambda *_a, **_k: {
        "fecha": "2026-08-20",
        "diario": {
            "fecha": "2026-08-20",
            "hora_inicio_labores": "07:00",
            "personal": [],
            "equipos_uso": [],
            "materiales": [],
            "cuerpo_html": "",
            "imagenes": [],
        },
        "eventos": [],
    })
    monkeypatch.setattr(pdf, "consultar_clima_slots_3h", lambda *_a, **_k: [])
    monkeypatch.setattr(pdf, "to_pdf_bytes", fake_pdf)
    out = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20")
    assert out.startswith(b"%PDF")
    assert "Reportes de Evento" not in captured["doc"]
    assert "class=\"break\"" not in captured["doc"]
    assert "#112233" in captured["doc"]


def test_generar_pdf_con_eventos_y_fotos(monkeypatch):
    pdf.clear_pdf_caches_for_tests()
    captured = {}

    def fake_pdf(doc, landscape=True):
        captured["doc"] = doc
        return b"%PDF-1.4 mock"

    monkeypatch.setattr(pdf, "contrato_meta_bitacora", lambda *_a, **_k: {
        "id": 1, "numero": "X", "objeto": "O", "contratista": "C",
        "interventoria": "I", "entidad": "E", "geo_lat": 4.7, "geo_lng": -74.0,
        "logo_entidad": None, "logo_contratista": None, "logo_interventoria": None,
        "export_palette": {},
    })
    monkeypatch.setattr(pdf, "list_entradas_del_dia", lambda *_a, **_k: {
        "fecha": "2026-08-20",
        "diario": {
            "fecha": "2026-08-20",
            "hora_inicio_labores": "07:00",
            "personal": [{"cargo": "Oficial", "cantidad": 2}],
            "equipos_uso": [],
            "materiales": [{
                "movimiento": "ingreso", "tipo_material": "Arena", "cantidad": 1,
                "ubicacion_pk": "K12",
            }],
            "cuerpo_html": "<p>Ok</p>",
            "imagenes": [],
            "created_by_nombre": "Ana",
        },
        "eventos": [{
            "fecha": "2026-08-20",
            "evento_tipo": "novedades",
            "cuerpo_html": "Nota",
            "created_by_nombre": "Luis",
            "imagenes": [{"nombre": "e.png", "data_uri": "data:image/png;base64,aaa"}],
        }],
    })
    monkeypatch.setattr(pdf, "consultar_clima_slots_3h", lambda *_a, **_k: [
        {"hora": f"{h:02d}:00", "hora_num": h, "clima_descripcion": "Despejado",
         "clima_temp_c": 20, "manual": False, "fuente": "open-meteo"}
        for h in (0, 3, 6, 9, 12, 15, 18, 21)
    ])
    monkeypatch.setattr(pdf, "to_pdf_bytes", fake_pdf)
    out = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20")
    assert out.startswith(b"%PDF")
    doc = captured["doc"]
    assert "Reportes de Evento" in doc
    assert "Registro Fotográfico" in doc
    assert "Fotografías del día" not in doc
    assert "K12" in doc


def test_pdf_cache_reusa_bytes_sin_regenerar(monkeypatch):
    pdf.clear_pdf_caches_for_tests()
    renders = {"n": 0}

    def fake_pdf(doc, landscape=True):
        renders["n"] += 1
        return b"%PDF-1.4 cached-mock"

    monkeypatch.setattr(pdf, "contrato_meta_bitacora", lambda *_a, **_k: {
        "id": 1, "numero": "X", "objeto": "O", "contratista": "C",
        "interventoria": "I", "entidad": "E", "geo_lat": 4.7, "geo_lng": -74.0,
        "logo_entidad": None, "logo_contratista": None, "logo_interventoria": None,
        "export_palette": {},
    })
    monkeypatch.setattr(pdf, "list_entradas_del_dia", lambda *_a, **_k: {
        "fecha": "2026-08-20",
        "diario": {
            "id": 9, "updated_at": "2026-08-20T12:00:00Z",
            "fecha": "2026-08-20", "hora_inicio_labores": "07:00",
            "personal": [], "equipos_uso": [], "materiales": [],
            "cuerpo_html": "", "imagenes": [],
        },
        "eventos": [],
    })
    monkeypatch.setattr(pdf, "consultar_clima_slots_3h", lambda *_a, **_k: [])
    monkeypatch.setattr(pdf, "to_pdf_bytes", fake_pdf)
    a = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20")
    b = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20")
    assert a == b == b"%PDF-1.4 cached-mock"
    assert renders["n"] == 1


def test_bytes_to_pdf_data_uri_reduce_vertical_grande():
    import base64
    import io

    from PIL import Image

    im = Image.new("RGB", (800, 1600), (30, 40, 50))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    uri = pdf._bytes_to_pdf_data_uri(buf.getvalue(), pdf._FOTO_MAX_PX_W, pdf._FOTO_MAX_PX_H)
    assert uri.startswith("data:image/")
    m = __import__("re").match(r"data:image/[^;]+;base64,(.+)$", uri)
    raw = base64.b64decode(m.group(1))
    out = Image.open(io.BytesIO(raw))
    assert out.size[0] <= pdf._FOTO_MAX_PX_W
    assert out.size[1] <= pdf._FOTO_MAX_PX_H
    assert abs((out.size[0] / out.size[1]) - 0.5) < 0.05
