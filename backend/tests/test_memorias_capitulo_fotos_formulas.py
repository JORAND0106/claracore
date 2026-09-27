"""Memorias SEM/MES/SUB-002: capítulo en banda, fotos 2×4 y Excel con fórmulas."""
from __future__ import annotations

import sys
from io import BytesIO
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from openpyxl import load_workbook


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


def test_memoria_cells_con_capitulo_agrega_sin_duplicar():
    inf = _import_informes_with_stubs()
    cells = inf._memoria_cells_con_capitulo(
        [("CONTRATO", "C1"), ("ACTA RPO", "10"), ("CONSECUTIVO", "1"), ("FECHA ACTA", "—")],
        "2. PLUVIAL",
    )
    assert len(cells) == 5
    assert cells[4] == ("CAPÍTULO", "2. PLUVIAL")
    again = inf._memoria_cells_con_capitulo(cells, "OTRO")
    assert sum(1 for a, _ in again if a.upper().replace("Í", "I") == "CAPITULO") == 1
    assert again[4][1] == "2. PLUVIAL"


def test_excel_formula_cantidad_total_redondeo_dinamico():
    inf = _import_informes_with_stubs()
    f = inf._excel_formula_cantidad_total(12)
    assert f.startswith("=")
    assert 'IF(F12="",1,F12)' in f
    assert "ROUND(" in f
    assert ">=0.1" in f


def test_html_memoria_incluye_capitulo_y_grilla_8_fotos():
    inf = _import_informes_with_stubs()
    contrato = {"numero": "IDU-1", "logo_contratista": None}
    sub = {"razon_social": "Sub SA", "nombre_contacto": "Ana"}
    corte = {"consecutivo": 3, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-07"}
    registros = [
        {
            "numero_registro": i + 1,
            "abs_inicio": "1+000",
            "abs_final": "1+010",
            "pk_ids": {"pk_id": "PK1"},
            "calzada": "Izq",
            "longitud": 10,
            "ancho": 2,
            "espesor": 0.1,
            "cantidad": None,
            "cantidad_total": 2.0,
            "observacion": "Obs " + ("larga " * 30),
            "foto_url": f"https://example.com/f{i}.jpg",
            "foto_numero": i + 1,
            "item_numero": "5.01",
            "item_descripcion": "Excavación",
            "unidad": "m3",
            "capitulo": "3. SANITARIO",
        }
        for i in range(3)
    ]
    item_info = inf._item_info_desde_registros(registros, "5.01")
    html = inf._html_memoria_item_body(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        "Usuario",
        "Cargo",
        conc_meta={
            "titulo": "MEMORIA SEMANAL",
            "codigo": "CC-SEM-002",
            "cells": [
                ("CONTRATO", "IDU-1"),
                ("SEMANA", "N° 1"),
                ("VIGENCIA", "2026-01-01 — 2026-01-07"),
                ("REFERENCIA", "Cantidades"),
            ],
        },
        pie_fotos_contexto="Semana N° 1",
    )
    assert "CAPÍTULO" in html
    assert "3. SANITARIO" in html
    assert html.count('class="mem002-foto-slot"') == 8
    assert "mem002-foto-box" in html
    assert "REGISTRO FOTOGRÁFICO — ÍTEM" in html


def test_fill_memoria_excel_ws_formulas_y_capitulo():
    inf = _import_informes_with_stubs()
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    contrato = {"numero": "IDU-1"}
    sub = {"razon_social": "Sub SA", "nombre_contacto": "Ana"}
    corte = {"consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-07"}
    registros = [
        {
            "numero_registro": 1,
            "abs_inicio": "1+000",
            "abs_final": "1+010",
            "pk_ids": {"pk_id": "A"},
            "calzada": "Der",
            "longitud": 2,
            "ancho": 3,
            "espesor": 4,
            "cantidad": None,
            "cantidad_total": 24,
            "observacion": "ok",
            "foto_url": "",
            "foto_numero": None,
            "item_numero": "1.01",
            "item_descripcion": "Item",
            "unidad": "m3",
            "capitulo": "1. PRELIMINARES",
        },
        {
            "numero_registro": 2,
            "abs_inicio": None,
            "abs_final": None,
            "pk_ids": {},
            "calzada": None,
            "longitud": None,
            "ancho": None,
            "espesor": None,
            "cantidad": 5,
            "cantidad_total": 5,
            "observacion": "",
            "foto_url": "https://example.com/x.jpg",
            "foto_numero": 1,
            "item_numero": "1.01",
            "item_descripcion": "Item",
            "unidad": "m3",
            "capitulo": "1. PRELIMINARES",
        },
    ]
    item_info = inf._item_info_desde_registros(registros, "1.01")
    inf._fill_memoria_excel_ws(
        ws,
        contrato,
        sub,
        corte,
        item_info,
        registros,
        None,
        conc_meta={
            "titulo": "MEMORIA MENSUAL",
            "codigo": "CC-MES-002",
            "cells": [
                ("CONTRATO", "IDU-1"),
                ("ACTA RPO", "72"),
                ("CONSECUTIVO", "1"),
                ("FECHA ACTA", "—"),
            ],
        },
        pie_fotos_contexto="Acta RPO 72",
        aprobo_interventoria_desde_config=True,
    )
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    ws2 = load_workbook(buf)[ws.title]

    # Capítulo en banda de identificación
    flat = []
    for row in ws2.iter_rows(min_row=3, max_row=4, max_col=11, values_only=True):
        flat.extend([str(v) for v in row if v is not None])
    assert any("CAPÍTULO" in v for v in flat)
    assert any("1. PRELIMINARES" in v for v in flat)

    # Encabezado detalle en fila 7; datos en 9–10; total en 11
    assert ws2["J8"].value == "CANT TOT"
    assert isinstance(ws2["J9"].value, str) and ws2["J9"].value.startswith("=")
    assert "F9" in ws2["J9"].value and "G9" in ws2["J9"].value
    assert isinstance(ws2["F9"].value, (int, float)) and ws2["F9"].value == 2
    assert ws2["I10"].value == 5
    assert ws2["J11"].value == "=SUM(J9:J10)"
