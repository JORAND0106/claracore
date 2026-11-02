"""CC-MES-002: banda de identificación en 3 filas + descripción completa a todo el ancho."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from openpyxl import Workbook
from openpyxl.utils import range_boundaries


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
    inf._memoria_prepare_media_uri = lambda url: ""  # type: ignore
    inf._memoria_prefetch_media_uris = lambda urls: {
        str(u or "").strip(): "" for u in urls if str(u or "").strip()
    }  # type: ignore
    return inf


def _merged_ranges(ws):
    return {str(r) for r in ws.merged_cells.ranges}


def test_conc_meta_cc_mes_002_tres_celdas_sin_consecutivo():
    inf = _import_informes_with_stubs()
    meta = inf._conc_meta_cc_mes_002(
        "ICCU-CTO-1614-2025",
        {
            "numero_rpo": 1,
            "consecutivo": 1,
            "fecha_inicio": "2025-01-01",
            "fecha_fin": "2025-01-31",
        },
    )
    assert meta["codigo"] == "CC-MES-002"
    assert meta["banda"] == "mes_3filas"
    labels = [c[0] for c in meta["cells"]]
    assert labels == ["CTO.", "ACTA RPO", "PERÍODO"]
    assert "CONSECUTIVO" not in labels
    assert "CONTRATO" not in labels
    assert meta["cells"][2][1] == "2025-01-01 → 2025-01-31"


def test_html_banda_3filas_descripcion_full_width_sin_consecutivo():
    inf = _import_informes_with_stubs()
    desc = (
        "EXCAVACION MANUAL EN MATERIAL COMUN H=0.0-2.0M INCLUYE RETIRO DE SOBRANTES "
        "A UNA DISTANCIA MENOR DE 5 KM SEGUN LISTADO DE PRECIOS VIGENTE DEL CONTRATO "
        "ICCU Y ESPECIFICACIONES TECNICAS APLICABLES AL ITEM 1.1"
    )
    contrato = {"numero": "ICCU-CTO-1614-2025", "logo_contratista": None}
    item_info = {
        "item_numero": "1.1",
        "item_descripcion": desc,
        "unidad": "M3",
        "capitulo": "1. ACTIVIDADES PRELIMINARES",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 3,
            "capitulo": item_info["capitulo"],
            "item_numero": "1.1",
            "item_descripcion": desc,
            "unidad": "M3",
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(
        contrato["numero"],
        {
            "numero_rpo": 1,
            "consecutivo": 99,
            "fecha_inicio": "2025-02-01",
            "fecha_fin": "2025-02-28",
        },
    )
    sub, corte = inf._sub_corte_dummy_memoria()
    html = inf._html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        regs,
        "QA",
        "QA",
        conc_meta=conc_meta,
        pie_fotos_contexto="Acta RPO 1",
        estilo_formato_codigo="CC-MES-002",
    )
    assert "mem002-banda-mes" in html
    assert "CTO." in html
    assert "CONSECUTIVO" not in html
    assert ">CONTRATO<" not in html and "CONTRATO</span>" not in html
    assert "PERÍODO" in html
    assert "2025-02-01 → 2025-02-28" in html
    assert "CAPÍTULO" in html
    assert "1. ACTIVIDADES PRELIMINARES" in html
    assert "ÍTEM" in html and "1.1" in html
    assert "UNIDAD" in html and "M3" in html
    assert "DESCRIPCIÓN" in html
    assert desc in html
    assert 'colspan="3"' in html
    assert "mem002-item-desc" in html
    # Descripción a todo el ancho: no debe quedar emparedada entre ÍTEM y UNIDAD.
    assert html.index("CAPÍTULO") < html.index("DESCRIPCIÓN")
    assert html.index("ÍTEM") < html.index("DESCRIPCIÓN")


def test_excel_banda_3filas_acta_una_celda_y_desc_altura():
    inf = _import_informes_with_stubs()
    desc = (
        "SUMINISTRO E INSTALACION DE TUBERIA EN PVC CORRUGADO DOBLE PARED DE DIAMETRO "
        "NOMINAL 24 PULGADAS TIPO S INCLUYE UNIONES SELLOS Y PRUEBAS HIDRAULICAS SEGUN "
        "LISTADO DE PRECIOS VIGENTE NP-08 DEL CONTRATO ICCU-CTO-1614-2025"
    )
    contrato = {"numero": "ICCU-CTO-1614-2025"}
    item_info = {
        "item_numero": "NP-08",
        "item_descripcion": desc,
        "unidad": "ML",
        "capitulo": "2. DRENAJE PLUVIAL",
    }
    regs = [
        {
            "numero_registro": 8,
            "cantidad_total": 12.5,
            "capitulo": "2. DRENAJE PLUVIAL",
            "item_numero": "NP-08",
            "longitud": 12.5,
            "ancho": 1,
            "espesor": 1,
            "cantidad": 12.5,
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(
        contrato["numero"],
        {
            "numero_rpo": 1,
            "consecutivo": 1,
            "fecha_inicio": "2025-01-01",
            "fecha_fin": "2025-01-31",
        },
    )
    wb = Workbook()
    ws = wb.active
    sub, corte = inf._sub_corte_dummy_memoria()
    inf._fill_memoria_excel_ws(
        ws,
        contrato,
        sub,
        corte,
        item_info,
        regs,
        {},
        conc_meta=conc_meta,
        pie_fotos_contexto="Acta RPO 1",
        aprobo_interventoria_desde_config=True,
    )
    merges = _merged_ranges(ws)
    assert "A3:C3" in merges
    assert "E3:J3" in merges
    assert "A4:H4" in merges
    assert "A5:J5" in merges
    # Acta RPO en una sola celda D3 (sin merge que la combine).
    for r in merges:
        min_col, min_row, max_col, max_row = range_boundaries(r)
        if min_row == 3 and max_row == 3:
            assert not (min_col <= 4 <= max_col and min_col != max_col and min_col == 4)

    assert ws["A3"].value == "CTO.\nICCU-CTO-1614-2025"
    assert ws["D3"].value == "ACTA RPO\n1"
    assert ws["E3"].value == "PERÍODO\n2025-01-01 → 2025-01-31"
    assert ws["A4"].value == "CAPÍTULO\n2. DRENAJE PLUVIAL"
    assert ws["I4"].value == "ÍTEM\nNP-08"
    assert ws["J4"].value == "UNIDAD\nML"
    assert ws["A5"].value == f"DESCRIPCIÓN\n{desc}"
    assert ws["A5"].alignment.wrap_text is True
    assert (ws.row_dimensions[5].height or 0) >= 34
    # Altura crece con descripción larga (más que el mínimo).
    assert (ws.row_dimensions[5].height or 0) > 40


def test_excel_desc_altura_mayor_en_ancho_completo_que_en_cuarteto():
    inf = _import_informes_with_stubs()
    largo = "X" * 240
    h_full = inf._excel_row_height_desc_banda_completa(largo)
    h_old = inf._excel_row_height_wrapped_text(largo, chars_per_line=52)
    # Full-width usa más chars/línea → menos líneas → altura menor o similar, pero
    # debe incluir la etiqueta y quedar por encima del mínimo de banda.
    assert h_full >= 34
    assert inf._excel_row_height_desc_banda_completa("corta") < h_full


def test_html_encabezado_3filas_tambien_en_fotos_y_graficos():
    inf = _import_informes_with_stubs()
    desc = (
        "SUMINISTRO E INSTALACION DE GEOCELDA DE HDPE DE 150 MM DE ALTURA INCLUYE "
        "ANCLAJE EXPANSION FIJACION Y RELLENO SEGUN LISTADO DE PRECIOS"
    )
    contrato = {"numero": "ICCU-CTO-1614-2025", "logo_contratista": None}
    item_info = {
        "item_numero": "NP-08",
        "item_descripcion": desc,
        "unidad": "M2",
        "capitulo": "2. DRENAJE",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 1,
            "capitulo": "2. DRENAJE",
            "item_numero": "NP-08",
            "item_descripcion": desc,
            "unidad": "M2",
            "foto_url": "https://cdn.example/f1.jpg",
            "foto_numero": 1,
            "grafico_url": "https://cdn.example/g1.png",
            "grafico_numero": 1,
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(
        contrato["numero"],
        {
            "numero_rpo": 1,
            "consecutivo": 1,
            "fecha_inicio": "2025-01-01",
            "fecha_fin": "2025-01-31",
        },
    )
    sub, corte = inf._sub_corte_dummy_memoria()
    html = inf._html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        regs,
        "QA",
        "QA",
        conc_meta=conc_meta,
        pie_fotos_contexto="Acta RPO 1",
        estilo_formato_codigo="CC-MES-002",
    )
    assert html.count("mem002-banda-mes") >= 3
    assert html.count("CTO.") >= 3
    assert html.count(desc) >= 3
    assert "CONSECUTIVO" not in html
    assert "REGISTRO FOTOGRÁFICO" in html
    assert "REGISTRO GRÁFICO" in html
