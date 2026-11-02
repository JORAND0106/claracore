"""CC-MES-002: alturas exactas Excel, encabezado compacto PDF y firmas al pie."""
from __future__ import annotations

import base64
import io
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from openpyxl import Workbook
from PIL import Image


def _import_informes_with_stubs():
    if "informes" in sys.modules:
        # Forzar recarga si el módulo quedó de un test anterior con CSS viejo.
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


def _acta():
    return {
        "numero_rpo": 1,
        "consecutivo": 1,
        "fecha_inicio": "2025-01-01",
        "fecha_fin": "2025-01-31",
    }


def _png_data_uri(w=80, h=40) -> str:
    img = Image.new("RGB", (w, h), (20, 80, 160))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_excel_altura_exacta_una_linea_vs_varias():
    inf = _import_informes_with_stubs()
    una = inf._excel_row_height_wrapped_text("Solo una linea", chars_per_line=50)
    tres = inf._excel_row_height_wrapped_text("X" * 140, chars_per_line=50)
    assert una == 16.0  # 1×15 + 1
    assert tres == 16.0 + 2 * 15.0  # 3 líneas
    assert tres > una
    assert inf._excel_count_wrapped_lines("a\nb\nc", 50) == 3


def test_excel_logo_real_sin_placeholder_logo():
    inf = _import_informes_with_stubs()
    uri = _png_data_uri()
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": "Objeto corto",
        "logo_contratista": uri,
    }
    item_info = {
        "item_numero": "1.1",
        "item_descripcion": "Excavacion",
        "unidad": "M3",
        "capitulo": "1. PRELIMINARES",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 1,
            "capitulo": "1. PRELIMINARES",
            "item_numero": "1.1",
            "observacion": "Obs de una linea",
        }
    ]
    conc_meta = inf._conc_meta_cc_mes_002(contrato, _acta())
    wb = Workbook()
    ws = wb.active
    sub, corte = inf._sub_corte_dummy_memoria()

    with patch("pdf_institucional.prepare_image_for_pdf", return_value=uri):
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

    assert ws["A1"].value != "LOGO"
    assert (ws.row_dimensions[1].height or 0) == 15
    assert (ws.row_dimensions[2].height or 0) == 15
    assert len(ws._images) >= 1
    # Observación de una línea → altura estándar.
    assert any(
        abs((ws.row_dimensions[r].height or 0) - 16.0) < 0.01
        for r in range(7, 20)
        if ws.row_dimensions[r].height
    )


def test_html_mes_firmas_pie_y_encabezado_compacto():
    inf = _import_informes_with_stubs()
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": "Objeto ICCU de prueba",
        "logo_contratista": None,
    }
    item_info = {
        "item_numero": "NP-08",
        "item_descripcion": "Item NP-08 descripcion",
        "unidad": "ML",
        "capitulo": "2. DRENAJE",
    }
    regs = [
        {
            "numero_registro": 1,
            "cantidad_total": 2,
            "capitulo": "2. DRENAJE",
            "item_numero": "NP-08",
            "item_descripcion": "Item NP-08 descripcion",
            "unidad": "ML",
            "observacion": "Linea 1",
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
    assert "1.20cm" in html
    assert "2.28cm" not in html
    assert 'id="firmasFooter"' in html
    assert "-pdf-frame-content: firmasFooter" in html
    assert "vertical-align:middle" in html
    assert "<thead>" in html
    # Firmas no van en flujo intermedio (antes de fotos): el id está una sola vez.
    assert html.count('id="firmasFooter"') == 1


def test_sub_sin_firmas_pie():
    """CC-SUB-002 no activa franja de firmas (solo MES)."""
    inf = _import_informes_with_stubs()
    contrato = {"numero": "C-1", "objeto": "O", "logo_contratista": None}
    item_info = {
        "item_numero": "1.1",
        "item_descripcion": "D",
        "unidad": "M3",
        "capitulo": "1",
    }
    regs = [{"numero_registro": 1, "cantidad_total": 1, "item_numero": "1.1"}]
    sub, corte = inf._sub_corte_dummy_memoria()
    html = inf._html_memoria_item(
        contrato, sub, corte, item_info, regs, "QA", "QA"
    )
    assert 'id="firmasFooter"' not in html
    assert "-pdf-frame-content: firmasFooter" not in html
    assert "mem002-firmas-wrap" in html
