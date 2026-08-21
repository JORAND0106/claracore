"""Tests PDF Bitácora (encabezado / clima / prioridad manual)."""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_pdf as pdf


def test_encabezado_incluye_tres_logos():
    html = pdf._encabezado({
        "numero": "C-1",
        "objeto": "Obra demo",
        "contratista": "ABC",
        "interventoria": "INT",
        "entidad": "IDU",
        "logo_contratista": None,
        "logo_interventoria": None,
        "logo_entidad": None,
    }, "2026-08-20")
    assert "Bitácora de Obra" in html
    assert "Logo contratista" in html
    assert "Logo interventoría" in html
    assert "Logo entidad" in html
    assert "C-1" in html


def test_html_clima_marca_manual():
    slots = [
        {"hora": "06:00", "hora_num": 6, "clima_descripcion": "Lluvia", "clima_temp_c": 18.0, "manual": True},
        {"hora": "09:00", "hora_num": 9, "clima_descripcion": "Despejado", "clima_temp_c": 22.0, "manual": False},
    ]
    html = pdf._html_clima(slots)
    assert "★" in html
    assert "Manual" in html
    assert "Open-Meteo" in html


def test_generar_pdf_bitacora_dia_mock(monkeypatch):
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
    })
    monkeypatch.setattr(pdf, "list_entradas_del_dia", lambda *_a, **_k: {
        "fecha": "2026-08-20",
        "diario": {
            "fecha": "2026-08-20",
            "hora_inicio_labores": "07:00",
            "personal": [{"cargo": "Oficial", "cantidad": 2}],
            "equipos_uso": [],
            "materiales": [{
                "movimiento": "ingreso",
                "tipo_material": "Arena",
                "cantidad": 1,
                "ubicacion_lat": 4.7,
                "ubicacion_lng": -74.0,
            }],
            "cuerpo_html": "<p>Ok</p>",
            "imagenes": [],
            "created_by_nombre": "Ana",
            "clima_editado_manual": False,
        },
        "eventos": [{
            "fecha": "2026-08-20",
            "evento_tipo": "novedades",
            "cuerpo_html": "Nota",
            "created_by_nombre": "Luis",
            "imagenes": [],
        }],
    })
    monkeypatch.setattr(pdf, "consultar_clima_slots_3h", lambda *_a, **_k: [
        {"hora": f"{h:02d}:00", "hora_num": h, "clima_descripcion": "Despejado",
         "clima_temp_c": 20, "manual": False, "fuente": "open-meteo"}
        for h in (0, 3, 6, 9, 12, 15, 18, 21)
    ])
    monkeypatch.setattr(pdf, "to_pdf_bytes", lambda doc, landscape=True: b"%PDF-1.4 mock")
    out = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20")
    assert out.startswith(b"%PDF")
