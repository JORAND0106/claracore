"""PDF y Excel comparten ``informes_formatos_numericos`` (dim 3dp, cant 2dp, money .00)."""
from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from informes_formatos_numericos import (
    EXCEL_FMT_CANT,
    EXCEL_FMT_DIM,
    EXCEL_FMT_MONEY,
    fmt_cant_informe,
    fmt_dim_informe,
    fmt_money_informe,
)
from test_corte_sub_001_excel_filtro import _import_informes_with_stubs


def test_definicion_unica_pdf_excel_constantes():
    inf = _import_informes_with_stubs()
    assert inf._EXCEL_NUM_FMT_DIM == EXCEL_FMT_DIM == "0.000"
    assert inf._EXCEL_NUM_FMT_CANT == EXCEL_FMT_CANT == "#,##0.00"
    assert inf._EXCEL_NUM_FMT_MONEY == EXCEL_FMT_MONEY == '"$"#,##0.00'


def test_fmt_dim_cant_money_siempre_decimales():
    assert fmt_dim_informe(1) == "1.000"
    assert fmt_dim_informe(1.5) == "1.500"
    assert fmt_dim_informe(None) == "—"
    assert fmt_cant_informe(6) == "6.00"
    assert fmt_cant_informe(6.005) == "6.00"
    assert fmt_cant_informe(0) == "0.00"
    assert fmt_money_informe(13239136) == "$ 13,239,136.00"
    assert fmt_money_informe(13230.4) == "$ 13,230.00"
    assert fmt_money_informe(0) == "$ 0.00"


def test_pdf_helpers_delegan_en_modulo_unico():
    inf = _import_informes_with_stubs()
    assert inf._fn_dim_informe(1) == "1.000"
    assert inf._fn_cant_informe(6) == "6.00"
    assert inf._fm_informe(13230) == "$ 13,230.00"


def test_html_cc_sub_usa_money_con_centavos():
    inf = _import_informes_with_stubs()
    items = [
        {
            "capitulo": "1. PRELIMINARES",
            "item_numero": "1.1",
            "item_descripcion": "Exc",
            "unidad": "M3",
            "vlr_unitario_sub": 2205.0,
            "cant_actualizadas": 10.0,
            "cant_presente": 6.0,
            "cant_acumulado": 7.0,
            "cant_saldo": 3.0,
            "valor_actualizadas": 22050.0,
            "valor_presente": 13230.0,
            "valor_acumulado": 15435.0,
            "valor_saldo": 6615.0,
            "costo_directo": 13230.0,
        }
    ]
    html = inf._html_cc_sub_v1_plain(
        {"numero": "ICCU-CTO-1614-2025", "contratista": "C", "nit": "1", "interventoria": "I"},
        {"razon_social": "M.E OBRAS Y PAVIMENTOS SAS", "nombre_contacto": "A"},
        {"consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
        items,
        13230.0,
        "T",
        "D",
    )
    assert "6.00" in html
    assert "10.00" in html
    assert "$ 13,230.00" in html
    assert "$ 22,050.00" in html
    # No debe quedar el formato antiguo sin centavos como único display de ese valor
    assert html.count("$ 13,230.00") >= 1


def test_html_memoria_dim_3_cant_2():
    inf = _import_informes_with_stubs()
    regs = [
        {
            "numero_registro": "1",
            "abs_inicio": 0,
            "abs_final": 10,
            "tramo": "1",
            "longitud": 1,
            "ancho": 2,
            "espesor": 0.15,
            "cantidad": 1,
            "cantidad_total": 6,
            "observacion": "ok",
        }
    ]
    body = inf._html_memoria_item_body(
        {"numero": "ICCU-CTO-1614-2025"},
        {"razon_social": "M.E OBRAS Y PAVIMENTOS SAS"},
        {"consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
        {"item_numero": "1.1", "item_descripcion": "Exc", "unidad": "M3", "capitulo": "1"},
        regs,
        "T",
        "D",
    )
    assert "1.000" in body  # longitud
    assert "2.000" in body  # ancho
    assert "0.150" in body  # espesor
    assert "6.00" in body  # cant tot / total ítem


def test_excel_pdf_mismo_texto_para_mismos_numeros():
    """Misma cadena PDF que el valor numérico Excel formateado a ojo."""
    inf = _import_informes_with_stubs()
    assert inf._fn_cant_informe(6.0) == "6.00"
    assert inf._EXCEL_NUM_FMT_CANT == "#,##0.00"
    assert inf._fm_informe(13230) == "$ 13,230.00"
    assert inf._EXCEL_NUM_FMT_MONEY == '"$"#,##0.00'
    assert inf._fn_dim_informe(1) == "1.000"
    assert inf._EXCEL_NUM_FMT_DIM == "0.000"
