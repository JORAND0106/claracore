"""Excel integral SEM/MES: ejecución + memorias con fórmulas cruzadas."""
from __future__ import annotations

import sys
from io import BytesIO
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from openpyxl import Workbook, load_workbook


def _import_informes_with_stubs():
    if "informes" in sys.modules:
        # Force reload-friendly: drop if previously stubbed differently
        pass

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


def test_excel_sheet_name_cap_item_distingue_capitulos():
    inf = _import_informes_with_stubs()
    a = inf._excel_sheet_name_cap_item("IV", "NP-1")
    b = inf._excel_sheet_name_cap_item("V", "NP-1")
    assert a != b
    assert "NP-1" in a and "NP-1" in b
    assert "IV" in a and "V" in b
    assert len(a) <= 31 and len(b) <= 31


def test_fill_cc_conc_formulas_referencian_memoria():
    inf = _import_informes_with_stubs()
    wb = Workbook()
    ws_m = wb.active
    ws_m.title = "IV|NP-1"
    # Simula total del ítem en H12
    ws_m["H12"] = 10.5
    ws = wb.create_sheet("CC-SEM-001")
    items = [
        {
            "capitulo": "IV",
            "item_numero": "NP-1",
            "item_descripcion": "Excavación",
            "unidad": "m3",
            "vlr_unitario": 1000.0,
            "cantidad": 10.5,
            "costo_directo": 10500.0,
        }
    ]
    links = {"IV||NP-1": {"sheet": "IV|NP-1", "tot_row": 12}, "NP-1": {"sheet": "IV|NP-1", "tot_row": 12}}
    inf._fill_cc_conc_001_excel_ws(
        ws,
        {"numero": "C-1", "contratista": "Ctor", "nit": "1", "interventoria": "Int"},
        items,
        10500.0,
        "Ana",
        "Residente",
        {},
        titulo_documento="INFORME EJECUCIÓN SEMANAL",
        codigo_ccd="CC-SEM-001",
        c3_label="SEMANA",
        c3_value="N° 1",
        c4_label="VIGENCIA",
        c4_value="a — b",
        pie_contexto="test",
        memoria_links=links,
    )
    # Fila de datos = 12 (header en 11)
    qty = ws.cell(12, 6).value
    cost = ws.cell(12, 7).value
    assert isinstance(qty, str) and qty.startswith("=")
    assert "IV|NP-1" in qty.replace("'", "") or "'IV|NP-1'" in qty
    assert "!H12" in qty
    assert isinstance(cost, str) and "ROUND" in cost and "F12" in cost and "E12" in cost
    # Subtotal capítulo y total deben ser fórmulas
    found_sub = False
    found_tot = False
    for r in range(12, 20):
        v = ws.cell(r, 6).value
        lab = ws.cell(r, 1).value
        if isinstance(lab, str) and "Subtotal capítulo" in lab:
            assert isinstance(v, str) and v.startswith("=") and "G12" in v
            found_sub = True
        if lab == "SUBTOTAL:":
            assert isinstance(v, str) and v.startswith("=") and "G12" in v
            found_tot = True
    assert found_sub and found_tot


def test_cc_sem_integral_builds_workbook_with_formulas():
    inf = _import_informes_with_stubs()
    contrato = {
        "numero": "C-1",
        "contratista": "Ctor",
        "nit": "900",
        "interventoria": "Int",
    }
    items = [
        {
            "capitulo": "IV",
            "item_numero": "NP-1",
            "item_descripcion": "Excavación A",
            "unidad": "m3",
            "vlr_unitario": 1000.0,
            "cantidad": 2.0,
            "costo_directo": 2000.0,
        },
        {
            "capitulo": "V",
            "item_numero": "NP-1",
            "item_descripcion": "Excavación B",
            "unidad": "m3",
            "vlr_unitario": 1500.0,
            "cantidad": 3.0,
            "costo_directo": 4500.0,
        },
    ]
    regs_iv = [
        {
            "numero_registro": 1,
            "capitulo": "IV",
            "item_numero": "NP-1",
            "item_descripcion": "Excavación A",
            "unidad": "m3",
            "longitud": 2,
            "ancho": 1,
            "espesor": 1,
            "cantidad": "",
            "cantidad_total": 2.0,
            "observacion": "",
            "abs_inicio": "",
            "abs_final": "",
            "infraestructura": "",
        }
    ]
    regs_v = [
        {
            "numero_registro": 2,
            "capitulo": "V",
            "item_numero": "NP-1",
            "item_descripcion": "Excavación B",
            "unidad": "m3",
            "longitud": 3,
            "ancho": 1,
            "espesor": 1,
            "cantidad": "",
            "cantidad_total": 3.0,
            "observacion": "",
            "abs_inicio": "",
            "abs_final": "",
            "infraestructura": "",
        }
    ]
    user = {"nombre": "Ana", "apellidos": "Pérez", "cargo_nombre": "Residente"}

    def _fetch_mem(_sb, _cid, inum, **kw):
        # Sin filtro de capítulo en fetch; el builder filtra por capítulo del ítem
        return regs_iv + regs_v

    with (
        patch.object(inf, "_semana_pertenece_contrato", return_value=True),
        patch.object(inf, "fetch_registros_conciliacion", return_value=[{"x": 1}]),
        patch.object(inf, "aggregate_items_conciliacion", return_value=(items, 6500.0)),
        patch.object(inf, "_sort_items_corte_por_item_numero_asc"),
        patch.object(
            inf,
            "_row",
            side_effect=lambda table, *_a, **_k: (
                {"id": 7, "numero_semana": 3, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-07"}
                if table == "so_semanas"
                else contrato
            ),
        ),
        patch.object(inf, "_get_firma_cfg_para_documento", return_value={}),
        patch.object(inf, "_sub_corte_dummy_memoria", return_value=({}, {})),
        patch.object(inf, "fetch_registros_memoria_conciliacion", side_effect=_fetch_mem),
    ):
        raw = inf._cc_sem_integral_excel_bytes(1, 7, user)

    wb = load_workbook(BytesIO(raw))
    assert wb.sheetnames[0] == "CC-SEM-001"
    assert len(wb.sheetnames) == 3  # ejecución + 2 memorias
    # Nombres de pestaña incluyen capítulo distinto para mismo ítem
    mem_names = wb.sheetnames[1:]
    assert any("IV" in n for n in mem_names)
    assert any("V" in n for n in mem_names)
    ws = wb["CC-SEM-001"]
    # Buscar fórmulas de cantidad hacia hojas de memoria
    qty_formulas = []
    for r in range(12, 20):
        v = ws.cell(r, 6).value
        if isinstance(v, str) and v.startswith("=") and "!H" in v:
            qty_formulas.append(v)
    assert len(qty_formulas) >= 2
    # Cada memoria conserva fórmula de CANT TOT
    for name in mem_names:
        wsm = wb[name]
        found = False
        for r in range(1, 40):
            v = wsm.cell(r, 8).value
            if isinstance(v, str) and v.startswith("=") and "ROUND" in v:
                found = True
                break
        assert found, f"memoria {name} sin fórmula CANT TOT"


def test_integral_routes_registered():
    inf = _import_informes_with_stubs()
    paths = [getattr(r, "path", "") for r in inf.router.routes]
    assert any("excel/cc-sem-integral/semana" in p for p in paths)
    assert any("excel/cc-mes-integral/acta" in p for p in paths)


def test_ui_sem_mes_excel_unico_integral():
    from pathlib import Path

    src = Path(__file__).resolve().parents[2] / "frontend" / "src" / "ModuloInformes.jsx"
    text = src.read_text(encoding="utf-8")
    assert "descargarExcelIntegralSem" in text or "excel/cc-sem-integral" in text
    assert "descargarExcelIntegralMes" in text or "excel/cc-mes-integral" in text
    # No deben quedar botones Excel parciales SEM/MES en la UI (handlers antiguos retirados del JSX)
    # Los handlers parciales pueden existir como dead code; lo crítico es que no se invoquen en botones.
    assert text.count("onClick={descargarExcelCcSem001}") == 0
    assert text.count("onClick={descargarExcelCcMes001}") == 0
    assert text.count("onClick={descargarExcelCcSem002Completo}") == 0
    assert text.count("onClick={descargarExcelCcMes002Completo}") == 0
    assert "descargarExcelCcSem002Item" not in text or "onClick={() => descargarExcelCcSem002Item" not in text
    assert "descargarExcelCcMes002Item" not in text or "onClick={() => descargarExcelCcMes002Item" not in text
