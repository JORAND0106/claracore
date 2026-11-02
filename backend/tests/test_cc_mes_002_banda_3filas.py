"""CC-MES-002: encabezado PDF=Excel + banda CONTRATO|OBJETO|Acta|Período."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from openpyxl import Workbook


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


def _acta():
    return {
        "numero_rpo": 1,
        "consecutivo": 1,
        "fecha_inicio": "2025-01-01",
        "fecha_fin": "2025-01-31",
    }


def _objeto_iccu():
    return (
        "Mantenimiento y rehabilitación de la malla vial local y obras de "
        "drenaje asociadas en el contrato ICCU-CTO-1614-2025 según alcance "
        "técnico del pliego y listado de precios vigente"
    )


def test_conc_meta_cc_mes_002_contrato_objeto_acta_periodo():
    inf = _import_informes_with_stubs()
    meta = inf._conc_meta_cc_mes_002(
        {"numero": "ICCU-CTO-1614-2025", "objeto": _objeto_iccu()},
        _acta(),
    )
    assert meta["codigo"] == "CC-MES-002"
    assert meta["banda"] == "mes_3filas"
    labels = [c[0] for c in meta["cells"]]
    assert labels == ["CONTRATO", "OBJETO", "ACTA RPO", "PERÍODO"]
    assert "CTO." not in labels
    assert "CONSECUTIVO" not in labels
    assert meta["cells"][0][1] == "ICCU-CTO-1614-2025"
    assert meta["cells"][1][1] == _objeto_iccu()
    assert meta["cells"][3][1] == "2025-01-01 → 2025-01-31"
    # Legado: primer arg string
    legacy = inf._conc_meta_cc_mes_002("C-1", _acta())
    assert legacy["cells"][0] == ("CONTRATO", "C-1")
    assert legacy["cells"][1][0] == "OBJETO"


def test_html_encabezado_doble_y_banda_objeto():
    inf = _import_informes_with_stubs()
    objeto = _objeto_iccu()
    desc = "DESCRIPCION LARGA DEL ITEM PARA VERIFICAR QUE SIGUE COMPLETA EN BANDA"
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": objeto,
        "logo_contratista": None,
    }
    item_info = {
        "item_numero": "1.1",
        "item_descripcion": desc,
        "unidad": "M3",
        "capitulo": "1. ACTIVIDADES PRELIMINARES",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 1,
            "capitulo": item_info["capitulo"],
            "item_numero": "1.1",
            "item_descripcion": desc,
            "unidad": "M3",
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(contrato, _acta())
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
    assert "1.20cm" in html  # encabezado institucional compacto
    assert "2.28cm" not in html
    assert 'id="firmasFooter"' in html
    assert "@frame footer" in html
    assert "RESUMEN ACTIVIDADES" in html
    assert "CONCILIACIÓN MENSUAL (INTERVENTORÍA–CONTRATISTA)" in html
    assert "CC-MES-002" in html
    assert "CONTRATO" in html
    assert "OBJETO" in html
    assert objeto in html
    assert "mem002-objeto" in html
    assert "ACTA RPO" in html
    assert "PERÍODO" in html
    assert "2025-01-01 → 2025-01-31" in html
    assert "CTO." not in html
    assert "CONSECUTIVO" not in html
    assert desc in html
    assert "CAPÍTULO" in html and "ÍTEM" in html and "UNIDAD" in html


def test_excel_encabezado_igual_pdf_y_fila3_objeto():
    inf = _import_informes_with_stubs()
    objeto = _objeto_iccu()
    desc = "ITEM NP-08 CON DESCRIPCION EXTENSA SEGUN LISTADO DE PRECIOS"
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": objeto,
        "logo_contratista": None,
    }
    item_info = {
        "item_numero": "NP-08",
        "item_descripcion": desc,
        "unidad": "ML",
        "capitulo": "2. DRENAJE",
    }
    regs = [
        {
            "numero_registro": 8,
            "cantidad_total": 2,
            "capitulo": "2. DRENAJE",
            "item_numero": "NP-08",
            "longitud": 2,
            "ancho": 1,
            "espesor": 1,
            "cantidad": 2,
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(contrato, _acta())
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
    assert "A1:B2" in merges
    assert "C1:I2" in merges
    assert "J1:J2" in merges
    assert "A3:B3" in merges
    assert "C3:H3" in merges
    assert "A4:H4" in merges
    assert "A5:J5" in merges
    assert ws["C1"].value == (
        "RESUMEN ACTIVIDADES\nCONCILIACIÓN MENSUAL (INTERVENTORÍA–CONTRATISTA)"
    )
    assert ws["J1"].value == "CC-MES-002"
    assert (ws.row_dimensions[1].height or 0) == 15
    assert (ws.row_dimensions[2].height or 0) == 15
    assert ws["A1"].value in (None, "")  # logo real o vacío; nunca «LOGO»
    assert ws["A3"].value == "CONTRATO\nICCU-CTO-1614-2025"
    assert ws["C3"].value == f"OBJETO\n{objeto}"
    assert ws["C3"].alignment.wrap_text is True
    assert ws["C3"].alignment.vertical == "center"
    assert ws["I3"].value == "ACTA RPO\n1"
    assert ws["J3"].value == "PERÍODO\n2025-01-01 → 2025-01-31"
    assert (ws.row_dimensions[3].height or 0) >= 15
    assert (ws.row_dimensions[3].height or 0) > 31  # crece por objeto largo
    assert ws["A5"].value == f"DESCRIPCIÓN\n{desc}"
    assert ws["A5"].alignment.vertical == "center"


def test_excel_objeto_altura_crece():
    inf = _import_informes_with_stubs()
    corto = inf._excel_row_height_objeto_banda("Obra corta")
    largo = inf._excel_row_height_objeto_banda("X" * 220)
    assert largo > corto


def test_html_objeto_tambien_en_fotos_y_graficos():
    inf = _import_informes_with_stubs()
    objeto = _objeto_iccu()
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": objeto,
        "logo_contratista": None,
    }
    item_info = {
        "item_numero": "NP-08",
        "item_descripcion": "Desc NP-08",
        "unidad": "M2",
        "capitulo": "2. DRENAJE",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 1,
            "capitulo": "2. DRENAJE",
            "item_numero": "NP-08",
            "item_descripcion": "Desc NP-08",
            "unidad": "M2",
            "foto_url": "https://cdn.example/f1.jpg",
            "foto_numero": 1,
            "grafico_url": "https://cdn.example/g1.png",
            "grafico_numero": 1,
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(contrato, _acta())
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
    assert html.count("OBJETO") >= 3
    assert html.count(objeto) >= 3
    assert html.count("1.20cm") >= 3
    assert 'id="firmasFooter"' in html
    assert "REGISTRO FOTOGRÁFICO" in html
    assert "REGISTRO GRÁFICO" in html
