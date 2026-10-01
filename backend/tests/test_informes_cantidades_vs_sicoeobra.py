"""
Consistencia cantidades informes vs SicoeObra — regla unificada 2026-10.

Regla única CC-SUB/MES (plataforma = PDF = Excel):
  cant = ROUND(cant_agregada, 2)
  valor = ROUND(cant × VU, 0)

Cuadro comparativo (ejemplo sintético):

| Ítem | Registros (cantidad_total) | Suma cruda SicoeObra | Informe (ROUND 2 dp) | Valor VU=1000 |
|------|----------------------------|----------------------|----------------------|---------------|
| 1.1  | 0.044+0.044+0.044          | 0.132                | 0.13                 | 130           |
| 2.1  | 0.055+0.055                | 0.110                | 0.11                 | 110           |
| 3.1  | 1.255+1.255                | 2.510                | 2.51                 | 2510          |

Nota: la suma cruda de registros sigue siendo la de SicoeObra; el informe
aplica ROUND a 2 dp una sola vez sobre ese agregado para alinear PDF/Excel.
"""
from __future__ import annotations

from ccd_conciliacion import aggregate_items_conciliacion
from corte_sub_conciliacion import (
    enriquecer_items_bloques,
    filtrar_items_con_cantidades,
    valor_por_cantidad_vu,
)


def test_informe_redondea_agregado_a_2dp_regla_unica():
    """0.044×3 → suma 0.132 → informe 0.13; valor ROUND0(0.13×VU)."""
    regs = [
        {"item_numero": "1.1", "cantidad_total": 0.044, "vlr_unitario": 1000, "costo_directo": 44},
        {"item_numero": "1.1", "cantidad_total": 0.044, "vlr_unitario": 1000, "costo_directo": 44},
        {"item_numero": "1.1", "cantidad_total": 0.044, "vlr_unitario": 1000, "costo_directo": 44},
    ]
    items, _ = aggregate_items_conciliacion(regs)
    assert abs(items[0]["cantidad"] - 0.132) < 1e-9

    enriched = enriquecer_items_bloques(
        items,
        cant_actualizadas={"1.1": 10.0},
        cant_acum_anterior={},
        vu_por_item={"1.1": 1000.0},
    )
    assert abs(enriched[0]["cant_presente"] - 0.13) < 1e-9
    assert abs(enriched[0]["cant_acumulado"] - 0.13) < 1e-9
    assert enriched[0]["valor_presente"] == valor_por_cantidad_vu(0.13, 1000)
    assert enriched[0]["valor_presente"] == 130.0


def test_aggregate_normaliza_espacios_item_como_sicoeobra():
    regs = [
        {"item_numero": " 1.1 ", "cantidad_total": 2.0, "vlr_unitario": 100, "costo_directo": 200},
        {"item_numero": "1.1", "cantidad_total": 3.0, "vlr_unitario": 100, "costo_directo": 300},
    ]
    items, _ = aggregate_items_conciliacion(regs)
    assert len(items) == 1
    assert items[0]["item_numero"] == "1.1"
    assert items[0]["cantidad"] == 5.0


def test_filtrar_incluye_solo_actualizadas():
    items = [
        {"item_numero": "a", "cant_presente": 0, "cant_acumulado": 0, "cant_actualizadas": 12},
        {"item_numero": "b", "cant_presente": 1, "cant_acumulado": 0, "cant_actualizadas": 0},
        {"item_numero": "c", "cant_presente": 0, "cant_acumulado": 0, "cant_actualizadas": 0},
    ]
    out = filtrar_items_con_cantidades(items)
    assert {i["item_numero"] for i in out} == {"a", "b"}


def test_fuente_sin_fila_cd_presente_acta_bajo_cuadro():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / "informes.py").read_text(encoding="utf-8")
    assert "COSTO DIRECTO (PRESENTE ACTA):" not in text
    assert "RESUMEN DE CONCILIACIÓN" in text


def test_excel_cd_resumen_suma_subtotales_capitulo():
    from io import BytesIO

    from openpyxl import load_workbook
    from corte_sub_conciliacion import build_resumen_conciliacion_4cols
    from test_corte_sub_001_excel_filtro import _import_informes_with_stubs

    inf = _import_informes_with_stubs()
    items = [
        {
            "capitulo": "I",
            "item_numero": "1.1",
            "item_descripcion": "Exc",
            "unidad": "M3",
            "vlr_unitario_sub": 1000.0,
            "cant_actualizadas": 100.0,
            "cant_presente": 10.0,
            "cant_acum_anterior": 0.0,
            "cant_acumulado": 10.0,
            "cant_saldo": 90.0,
            "valor_presente": 10000.0,
            "valor_actualizadas": 100000.0,
            "valor_acumulado": 10000.0,
            "valor_saldo": 90000.0,
            "costo_directo": 10000.0,
        }
    ]
    r4 = build_resumen_conciliacion_4cols(items=items, tributos={"administracion": 10}, otros_presente=0)
    raw = inf._corte_sub_001_excel_bytes(
        {"numero": "C-1", "contratista": "Ctor", "nit": "900", "interventoria": "Int"},
        {"razon_social": "Sub SA", "nombre_contacto": "Ana"},
        {"consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-15"},
        items,
        10000.0,
        "Tester",
        "Desarrollador",
        {},
        resumen_4cols=r4,
    )
    wb = load_workbook(BytesIO(raw))
    ws = wb.active
    # R9 ítem, R10 subtotal → CD referencia F10
    assert ws.cell(9, 1).value == "1.1"
    assert str(ws.cell(10, 1).value).startswith("Subtotal")
    assert ws.cell(10, 6).value == "=F9"
    labels = []
    cd_resumen_formula = None
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=12):
        a = row[0].value
        if isinstance(a, str):
            labels.append(a)
            if a.strip() == "Costo Directo":
                cd_resumen_formula = row[5].value
    assert "COSTO DIRECTO:" not in labels
    assert any(x == "RESUMEN DE CONCILIACIÓN" for x in labels)
    assert cd_resumen_formula is not None
    assert str(cd_resumen_formula).startswith("=")
    assert "F10" in str(cd_resumen_formula)
    assert "F9" not in str(cd_resumen_formula)
