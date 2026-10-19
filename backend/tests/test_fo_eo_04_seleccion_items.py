"""Ventana de selección FO-EO-04: el PDF y la vista previa respetan capítulo e ítem."""

from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


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


def _items_dos_capitulos():
    return [
        {
            "capitulo": "1 PRELIMINARES",
            "item_numero": "1.1",
            "item_descripcion": "EXCAVACION MANUAL UNICA",
            "unidad": "M3",
            "total_acta": 12.5,
            "semanas": [
                {
                    "numero_semana": 1,
                    "fecha_inicio": "2025-01-01",
                    "fecha_fin": "2025-01-07",
                    "cantidad": 12.5,
                }
            ],
        },
        {
            "capitulo": "2 OTRO",
            "item_numero": "1.1",
            "item_descripcion": "RELLENO COMPACTADO UNICO",
            "unidad": "M2",
            "total_acta": 3,
            "semanas": [
                {
                    "numero_semana": 2,
                    "fecha_inicio": "2025-01-08",
                    "fecha_fin": "2025-01-14",
                    "cantidad": 3,
                }
            ],
        },
    ]


def _parchear_html(monkeypatch, inf, items):
    monkeypatch.setattr(inf, "_resolver_acta_id_en_contrato", lambda *a, **k: 620)
    monkeypatch.setattr(inf, "_row", lambda *a, **k: None)
    monkeypatch.setattr(inf, "_get_firma_cfg_para_documento", lambda *a, **k: {})
    monkeypatch.setattr(inf, "_fo_eo_04_firmas_data_uris", lambda *a, **k: (None, None, None, None))
    monkeypatch.setattr(
        inf,
        "_fo_eo_04_firmas_marcas_registro",
        lambda *a, **k: (("", "", ""), ("", "", ""), ("", "", ""), ("", "", "")),
    )
    monkeypatch.setattr(inf, "_fetch_items_n3_acta", lambda *a, **k: list(items))
    monkeypatch.setattr(inf, "_fetch_totales_batch", lambda *a, **k: ({}, {"items_con_acumulado": 0}))


def test_filtrar_none_conserva_orden_y_el_mismo_codigo_en_otro_capitulo():
    inf = _import_informes_with_stubs()
    items = _items_dos_capitulos()
    todos = inf._fo_eo_04_filtrar_items_seleccion(items, None)
    assert [it["capitulo"] for it in todos] == ["1 PRELIMINARES", "2 OTRO"]
    assert len(items) == 2
    sub = inf._fo_eo_04_filtrar_items_seleccion(
        items, [{"capitulo": "2 OTRO", "item_numero": "1.1"}]
    )
    assert len(sub) == 1
    assert sub[0]["item_descripcion"] == "RELLENO COMPACTADO UNICO"
    assert sub[0] is items[1]


def test_filas_toman_ficha_y_cantidad_del_acta():
    inf = _import_informes_with_stubs()
    filas = inf._fo_eo_04_filas_seleccion(
        [
            {
                "capitulo": " 1 CAP ",
                "item_numero": " 1.2 ",
                "item_descripcion": " Desc listado ",
                "unidad": " UND ",
                "total_acta": 1.23456,
            }
        ]
    )
    assert filas == [
        {
            "capitulo": "1 CAP",
            "item_numero": "1.2",
            "descripcion": "Desc listado",
            "unidad": "UND",
            "cantidad": 1.235,
        }
    ]


def test_claves_desde_body_todos_o_al_menos_uno():
    inf = _import_informes_with_stubs()
    assert inf._fo_eo_04_claves_desde_body(None) is None
    assert inf._fo_eo_04_claves_desde_body({}) is None
    with pytest.raises(inf.HTTPException) as exc:
        inf._fo_eo_04_claves_desde_body({"items": []})
    assert exc.value.status_code == 400
    assert "al menos un" in str(exc.value.detail).lower()
    got = inf._fo_eo_04_claves_desde_body(
        {"items": [{"capitulo": "1", "item_numero": "A"}, {"capitulo": "1", "item_numero": ""}]}
    )
    assert got == [{"capitulo": "1", "item_numero": "A"}]


def test_html_subset_omite_el_otro_capitulo_y_sin_filtro_los_incluye(monkeypatch):
    inf = _import_informes_with_stubs()
    items = _items_dos_capitulos()
    _parchear_html(monkeypatch, inf, items)
    html_uno, _, _, pages_uno = inf._build_fo_eo_04_html(
        3,
        "FO-IDU-EO-04-V2",
        "vial",
        620,
        "Supervisor",
        preview_ui=True,
        claves_items=[{"capitulo": "2 OTRO", "item_numero": "1.1"}],
    )
    assert len(pages_uno) == 1
    assert "RELLENO COMPACTADO UNICO" in html_uno
    assert "EXCAVACION MANUAL UNICA" not in html_uno
    assert "TOTAL EJECUTADO PRESENTE ACTA" in html_uno
    assert "3,000" in html_uno

    html_todos, _, _, pages_todos = inf._build_fo_eo_04_html(
        3,
        "FO-IDU-EO-04-V2",
        "vial",
        620,
        "Supervisor",
        preview_ui=True,
    )
    assert len(pages_todos) == 2
    assert "EXCAVACION MANUAL UNICA" in html_todos
    assert "RELLENO COMPACTADO UNICO" in html_todos
    assert "12,500" in html_todos

    with pytest.raises(ValueError, match="Ninguno de los ítems seleccionados"):
        inf._build_fo_eo_04_html(
            3,
            "FO-IDU-EO-04-V2",
            "vial",
            620,
            "Supervisor",
            preview_ui=True,
            claves_items=[{"capitulo": "NO", "item_numero": "9.9"}],
        )


def test_ui_abre_la_ventana_antes_de_generar():
    root = Path(__file__).resolve().parents[2]
    modal = (root / "frontend/src/informes/FoEo04SeleccionModal.jsx").read_text(encoding="utf-8")
    page = (root / "frontend/src/ModuloInformes.jsx").read_text(encoding="utf-8")
    assert "Formatos a generar" in modal
    assert "Seleccionar todos" in modal
    assert "Ítem" in modal and "Descripción" in modal and "Cantidad" in modal
    assert "nSel === 0" in modal
    assert "items-seleccion" in page
    assert "abrirSeleccionFoEo04('preview')" in page
    assert "abrirSeleccionFoEo04('pdf')" in page
    assert '{"items": cuerpoItems}' in page or "items: cuerpoItems" in page
