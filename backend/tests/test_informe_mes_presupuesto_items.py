"""Informe mensual: ítems aprobados del listado, sin cruzar capítulos ni PMT."""
from __future__ import annotations

import sys
from io import BytesIO
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from openpyxl import load_workbook

from acta_mes_conciliacion import build_resumen_contrato_4cols
from corte_sub_conciliacion import valor_por_cantidad_vu
from excel_formula_eval import FormulaBook
from informe_mes_items import (
    MOTIVO_AUSENTE,
    MOTIVO_ESTADO,
    MOTIVO_PMT,
    clasificar_registros_excluidos,
    clave_item_exacta,
    construir_cuadro_mensual,
    sumar_cantidad_por_clave,
)

CAP_PAV = "2. ESTRUCTURA DE PAVIMENTO Y ADOQUINES"
CAP_SENAL = "2. SEÑALIZACIÓN Y CANALIZACIÓN"
CAP_HORIZ = "4. SEÑALIZACIÓN HORIZONTAL Y VERTICAL"
CAP_PMT = "4. OPERACIÓN PMT"
CAP_PERSONAL = "1. PERSONAL OPERATIVO"
CAP_COM = "3. COMUNICACIONES"


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


def _listado(cap, item, desc, und, vu, *, estado="Aprobado", norma="", id_=1):
    return {
        "id": id_,
        "capitulo": cap,
        "item_numero": item,
        "descripcion": desc,
        "unidad": und,
        "precio_unitario": vu,
        "estado_precio": estado,
        "especificacion_tecnica": norma,
    }


def _cuadro_base():
    """Listado con aprobados, un pendiente, un ítem sin cantidad y capítulos PMT."""
    vu_subbase = 297349.0
    cant_subbase = 1363.79
    vu_41 = 1500.0
    cant_41 = 11623.24
    filas = [
        _listado(CAP_PAV, "2.1", "SUBBASE GRANULAR", "M3", vu_subbase, norma="INVIAS 320", id_=1),
        _listado(CAP_PAV, "2.1._", "Código con sufijo", "UND", 10, norma="NP", id_=2),
        _listado(CAP_PAV, "2.2", "Base granular", "M3", 1000, id_=3),
        _listado(CAP_PAV, "2.3", "Adoquín", "M2", 2000, id_=4),
        _listado(CAP_HORIZ, "2.1", "Flecha", "UND", 50, id_=5),
        _listado(CAP_HORIZ, "4.1", "LÍNEA DE DEMARCACIÓN", "ML", vu_41, norma="INVIAS 700", id_=6),
        _listado(CAP_HORIZ, "4.2", "Tachas", "UND", 800, id_=7),
        _listado(CAP_HORIZ, "4.3", "Señal vertical", "UND", 900, id_=8),
        _listado(CAP_HORIZ, "4.4", "Poste", "UND", 700, id_=9),
        _listado(CAP_PAV, "2.9", "Riego", "M2", 100, id_=10),
        # Aprobado sin cantidad en el presupuesto.
        _listado(CAP_PAV, "2.8", "Ítem sin cantidad", "UND", 40, norma="SIN-CANT", id_=11),
        # Tiene cantidad ejecutada, pero no está aprobado: no entra.
        _listado(CAP_PAV, "2.7", "Pendiente de precio", "UND", 80, estado="Pendiente", id_=12),
        # Capítulos de PMT, aunque estén aprobados.
        _listado(CAP_SENAL, "2.1._", "Señal SR-30", "UND", 50000, norma="PMT-30", id_=20),
        _listado(CAP_SENAL, "2.2._", "Señal Estrechamiento", "UND", 100, id_=21),
        _listado(CAP_PMT, "4.1._", "Instalación inicial PMT", "UND", 5000000, id_=22),
        _listado(CAP_PERSONAL, "1.1", "Inspector", "MES", 1000, id_=23),
        _listado(CAP_COM, "3.1", "Radio", "UND", 200, id_=24),
        _listado("4.  OPERACIÓN   PMT", "4.9._", "Desmonte con espacios", "UND", 10, id_=25),
    ]
    cantidades = {
        (CAP_PAV, "2.1"): cant_subbase,
        (CAP_PAV, "2.1._"): 5,
        (CAP_PAV, "2.2"): 10,
        (CAP_PAV, "2.3"): 4,
        (CAP_HORIZ, "2.1"): 7,
        (CAP_HORIZ, "4.1"): cant_41,
        (CAP_HORIZ, "4.2"): 3,
        (CAP_HORIZ, "4.3"): 2,
        (CAP_HORIZ, "4.4"): 1,
        (CAP_PAV, "2.9"): 2.012,
        (CAP_PAV, "2.7"): 9,
        (CAP_SENAL, "2.1._"): cant_subbase,
        (CAP_PMT, "4.1._"): cant_41,
    }
    return filas, cantidades, vu_subbase, cant_subbase, vu_41, cant_41


def test_aprobados_del_listado_no_cruzan_capitulo_ni_sufijo():
    filas, cantidades, vu_subbase, cant_subbase, vu_41, cant_41 = _cuadro_base()
    registros = [
        {
            "capitulo": CAP_SENAL,
            "item_numero": "2.1._",
            "item_descripcion": "Señal SR-30",
            "cantidad_total": 12,
            "vlr_unitario": 50000,
            "costo_directo": 600000,
        },
        {
            "capitulo": CAP_PMT,
            "item_numero": "4.1._",
            "item_descripcion": "Instalación inicial PMT",
            "cantidad_total": 3,
            "costo_directo": 11623.24,
        },
        {
            "capitulo": CAP_PAV,
            "item_numero": "2.2",
            "item_descripcion": "copia vieja",
            "cantidad_total": 1.5,
            "costo_directo": 1500,
        },
        {
            "capitulo": CAP_PAV,
            "item_numero": "2.7",
            "item_descripcion": "Pendiente de precio",
            "cantidad_total": 4,
            "costo_directo": 320,
        },
        {
            "capitulo": CAP_PAV,
            "item_numero": "9.9",
            "item_descripcion": "No está en el listado",
            "cantidad_total": 2,
            "costo_directo": 50,
        },
    ]
    presente = sumar_cantidad_por_clave(registros)
    cuadro = construir_cuadro_mensual(
        filas,
        cantidades_por_clave=cantidades,
        cant_presente=presente,
        claves_con_registros_acta=presente.keys(),
    )
    items = cuadro["items"]
    codigos = [(it["capitulo"], it["item_numero"]) for it in items]

    assert (CAP_PAV, "2.1") in codigos
    assert (CAP_PAV, "2.1._") in codigos
    assert (CAP_PAV, "2.2") in codigos
    assert (CAP_PAV, "2.3") in codigos
    assert (CAP_PAV, "2.8") in codigos
    assert (CAP_HORIZ, "4.1") in codigos
    assert (CAP_HORIZ, "4.2") in codigos
    assert (CAP_HORIZ, "4.3") in codigos
    assert (CAP_HORIZ, "4.4") in codigos
    assert (CAP_HORIZ, "2.1") in codigos
    assert (CAP_PAV, "2.7") not in codigos
    assert (CAP_SENAL, "2.1._") not in codigos
    assert (CAP_PMT, "4.1._") not in codigos
    assert (CAP_PERSONAL, "1.1") not in codigos
    assert (CAP_COM, "3.1") not in codigos
    assert all(it["item_numero"] != "4.9._" for it in items)
    assert all(it["capitulo"] not in (CAP_SENAL, CAP_PMT, CAP_PERSONAL, CAP_COM) for it in items)
    assert all(it["estado_precio"] == "Aprobado" for it in items)

    subbase = next(it for it in items if it["capitulo"] == CAP_PAV and it["item_numero"] == "2.1")
    assert subbase["item_descripcion"] == "SUBBASE GRANULAR"
    assert subbase["unidad"] == "M3"
    assert subbase["norma_tecnica"] == "INVIAS 320"
    assert subbase["vlr_unitario"] == vu_subbase
    assert subbase["cant_actualizadas"] == cant_subbase
    assert subbase["cant_presente"] == 0
    assert subbase["cant_acumulado"] == 0
    assert subbase["cant_saldo"] == cant_subbase
    assert subbase["valor_actualizadas"] == valor_por_cantidad_vu(cant_subbase, vu_subbase)
    assert subbase["valor_actualizadas_literal"] is False

    sufijo = next(it for it in items if it["capitulo"] == CAP_PAV and it["item_numero"] == "2.1._")
    assert sufijo["cant_actualizadas"] == 5
    assert sufijo["vlr_unitario"] == 10
    assert sufijo["item_descripcion"] == "Código con sufijo"
    assert sufijo["cant_presente"] == 0

    horiz = next(it for it in items if it["capitulo"] == CAP_HORIZ and it["item_numero"] == "4.1")
    assert horiz["cant_actualizadas"] == cant_41
    assert horiz["item_descripcion"] == "LÍNEA DE DEMARCACIÓN"
    assert horiz["vlr_unitario"] == vu_41
    assert horiz["norma_tecnica"] == "INVIAS 700"
    assert horiz["cant_presente"] == 0

    otro_21 = next(it for it in items if it["capitulo"] == CAP_HORIZ and it["item_numero"] == "2.1")
    assert otro_21["cant_actualizadas"] == 7
    assert otro_21["vlr_unitario"] == 50
    assert otro_21["item_descripcion"] == "Flecha"

    base = next(it for it in items if it["capitulo"] == CAP_PAV and it["item_numero"] == "2.2")
    assert base["cant_presente"] == 1.5
    assert base["cant_acumulado"] == 1.5
    assert base["cant_saldo"] == 8.5
    assert base["item_descripcion"] == "Base granular"

    sin_cant = next(it for it in items if it["item_numero"] == "2.8")
    assert sin_cant["cant_actualizadas"] == 0
    assert sin_cant["cant_presente"] == 0
    assert sin_cant["cant_saldo"] == 0
    assert sin_cant["tiene_registros_acta"] is False

    riego = next(it for it in items if it["item_numero"] == "2.9")
    assert riego["cant_actualizadas"] == 2.01
    assert riego["valor_actualizadas"] == valor_por_cantidad_vu(2.01, 100)
    assert riego["valor_actualizadas_literal"] is False
    assert sum(it["valor_actualizadas"] for it in items) == cuadro["costo_directo_actualizadas"]

    fuera = clasificar_registros_excluidos(registros, filas, cuadro["claves"])
    assert fuera["n_registros"] == 4
    por_codigo = {clave_item_exacta(it["capitulo"], it["item_numero"]): it for it in fuera["items"]}
    senal = por_codigo[(CAP_SENAL, "2.1._")]
    assert senal["motivo"] == MOTIVO_PMT
    assert senal["cantidad"] == 12
    assert senal["valor"] == 600000
    pmt = por_codigo[(CAP_PMT, "4.1._")]
    assert pmt["motivo"] == MOTIVO_PMT
    assert pmt["cantidad"] == 3
    assert pmt["valor"] == 11623
    pendiente = por_codigo[(CAP_PAV, "2.7")]
    assert pendiente["motivo"] == MOTIVO_ESTADO
    assert pendiente["estado_precio"] == "Pendiente"
    assert pendiente["cantidad"] == 4
    assert pendiente["valor"] == 320
    ausente = por_codigo[(CAP_PAV, "9.9")]
    assert ausente["motivo"] == MOTIVO_AUSENTE
    assert ausente["cantidad"] == 2
    assert ausente["valor"] == 50
    assert fuera["por_motivo"][MOTIVO_PMT]["valor_total"] == 600000 + 11623
    assert fuera["por_motivo"][MOTIVO_ESTADO]["items"][0]["item_numero"] == "2.7"


def test_vista_previa_pdf_y_excel_muestran_los_mismos_items():
    inf = _import_informes_with_stubs()
    vu = 297349.0
    filas = [
        _listado(CAP_PAV, "2.1", "SUBBASE GRANULAR", "M3", vu, norma="INVIAS 320", id_=1),
        _listado(CAP_PAV, "2.2", "Base granular", "M3", 1000, id_=2),
        _listado(CAP_PAV, "2.3", "Adoquín", "M2", 2000, id_=3),
        _listado(CAP_HORIZ, "4.1", "Línea", "ML", 1500, norma="INVIAS 700", id_=4),
        _listado(CAP_HORIZ, "4.2", "Tachas", "UND", 800, id_=5),
        _listado(CAP_HORIZ, "4.3", "Señal vertical", "UND", 900, id_=6),
        _listado(CAP_HORIZ, "4.4", "Poste", "UND", 700, id_=7),
        _listado(CAP_PAV, "2.8", "Sin ejecución", "UND", 40, id_=8),
        _listado(CAP_SENAL, "2.1._", "Señal SR-30", "UND", 50000, id_=9),
        _listado(CAP_PMT, "4.1._", "Instalación inicial PMT", "UND", 5000000, id_=10),
        _listado(CAP_PAV, "2.7", "Pendiente", "UND", 80, estado="Rechazado", id_=11),
    ]
    cantidades = {
        (CAP_PAV, "2.1"): 1363.79,
        (CAP_PAV, "2.2"): 10,
        (CAP_PAV, "2.3"): 4,
        (CAP_HORIZ, "4.1"): 11623.24,
        (CAP_HORIZ, "4.2"): 3,
        (CAP_HORIZ, "4.3"): 2,
        (CAP_HORIZ, "4.4"): 1,
        (CAP_SENAL, "2.1._"): 1363.79,
    }
    registros_acta = [
        {
            "capitulo": CAP_PAV,
            "item_numero": "2.2",
            "item_descripcion": "Base granular",
            "cantidad_total": 1.25,
            "vlr_unitario": 1000,
            "costo_directo": 1250,
            "numero_registro": 1,
            "unidad": "M3",
            "longitud": 1.25,
            "ancho": "",
            "espesor": "",
            "cantidad": "",
            "observacion": "",
            "abs_inicio": "",
            "abs_final": "",
            "infraestructura": "",
        }
    ]
    cuadro = construir_cuadro_mensual(
        filas,
        cantidades_por_clave=cantidades,
        cant_presente=sumar_cantidad_por_clave(registros_acta),
        claves_con_registros_acta=[(CAP_PAV, "2.2")],
    )
    items = cuadro["items"]
    assert [it["item_numero"] for it in items] == ["2.1", "2.2", "2.3", "2.8", "4.1", "4.2", "4.3", "4.4"]
    sin_ejec = next(it for it in items if it["item_numero"] == "2.8")
    assert sin_ejec["cant_actualizadas"] == 0
    assert sin_ejec["cant_saldo"] == 0
    r4 = build_resumen_contrato_4cols(items=items)
    contrato = {"numero": "ICCU-CTO-1614-2025", "contratista": "Ctor", "nit": "900", "interventoria": "Int"}
    acta = {"numero_rpo": "1", "consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"}
    html = inf._html_cc_mes_001_v1(
        contrato,
        acta,
        items,
        sum(it["valor_presente"] for it in items),
        "Ana",
        "Residente",
        resumen_4cols=r4,
        c3_value="1",
        c4_value="1",
    )
    assert "SUBBASE GRANULAR" in html
    assert CAP_PAV in html
    assert CAP_HORIZ in html
    assert CAP_SENAL not in html
    assert CAP_PMT not in html
    assert "2.1._" not in html
    assert "4.1._" not in html
    assert "Pendiente" not in html
    for it in items:
        assert it["item_numero"] in html
        assert inf._fm_informe(it["valor_actualizadas"]) in html
        assert inf._fn_cant_informe(it["cant_actualizadas"]) in html

    ctx = {
        "contrato": contrato,
        "acta": acta,
        "items": items,
        "total_costo": sum(it["valor_presente"] for it in items),
        "resumen_4cols": r4,
        "otros_conceptos": [],
        "usuario_nombre": "Ana",
        "usuario_cargo": "Residente",
        "costo_directo_presupuesto": cuadro["costo_directo_actualizadas"],
    }
    user = {"nombre": "Ana", "apellidos": "Pérez", "cargo_nombre": "Residente"}

    def _fetch(_sb, _cid, inum, **_kw):
        return [
            r
            for r in registros_acta
            if str(r.get("item_numero")) == str(inum) and str(r.get("capitulo")) == CAP_PAV
        ]

    with (
        patch.object(inf, "_acta_pertenece_contrato", return_value=True),
        patch.object(inf, "_contexto_acta_mes_conciliacion", return_value=ctx),
        patch.object(inf, "_row", return_value=contrato),
        patch.object(inf, "_get_firma_cfg_para_documento", return_value={}),
        patch.object(inf, "_sub_corte_dummy_memoria", return_value=({}, {})),
        patch.object(inf, "fetch_registros_memoria_cc_mes_alineado_acta", side_effect=_fetch),
    ):
        raw_001 = inf._cc_mes_001_excel_bytes(3, 620, user, nivel_aprobacion=4)
        raw_int = inf._cc_mes_integral_excel_bytes(3, 620, user, nivel_aprobacion=4)

    wb = load_workbook(BytesIO(raw_001))
    ws = wb["CC-MES-001"]
    book = FormulaBook(wb)
    filas_excel = _filas_item(ws)
    assert len(filas_excel) == len(items)
    for row, it in zip(filas_excel, items):
        assert ws.cell(row, 1).value == it["item_numero"]
        assert ws.cell(row, 2).value == it["item_descripcion"]
        assert float(ws.cell(row, 5).value) == float(it["cant_actualizadas"])
        assert "ROUND(ROUND(" in str(ws.cell(row, 6).value)
        assert book.eval_cell("CC-MES-001", row, 6) == it["valor_actualizadas"]
        assert book.eval_cell("CC-MES-001", row, 7) == it["cant_presente"]
        assert book.eval_cell("CC-MES-001", row, 8) == it["valor_presente"]
    texto = " ".join(str(c.value) for row in ws.iter_rows() for c in row if c.value is not None)
    assert CAP_SENAL not in texto
    assert CAP_PMT not in texto
    assert "2.1._" not in texto

    cd_row = next(r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == "Costo Directo")
    assert book.eval_cell("CC-MES-001", cd_row, 6) == cuadro["costo_directo_actualizadas"]

    wb_i = load_workbook(BytesIO(raw_int))
    assert wb_i.sheetnames[0] == "CC-MES-001"
    assert len(wb_i.sheetnames) == 2
    assert "2.1._" not in " ".join(wb_i.sheetnames)
    assert CAP_PMT not in " ".join(wb_i.sheetnames)
    book_i = FormulaBook(wb_i)
    ws_i = wb_i["CC-MES-001"]
    for row, it in zip(_filas_item(ws_i), items):
        assert ws_i.cell(row, 1).value == it["item_numero"]
        assert (ws_i.cell(row, 4).value or "") == (it.get("norma_tecnica") or "")
        assert book_i.eval_cell("CC-MES-001", row, 7) == it["valor_actualizadas"]


def test_norm_item_es_la_causa_del_cruce_y_el_cuadro_no_la_usa():
    """``norm_item`` convierte 2.1._ en 2.1. El cuadro compara el texto completo."""
    from sicoe_valor_canonico import norm_item

    assert norm_item("2.1._") == norm_item("2.1") == "2.1"
    assert norm_item("4.1._") == norm_item("4.1") == "4.1"
    assert clave_item_exacta(CAP_PAV, "2.1._") != clave_item_exacta(CAP_PAV, "2.1")
    assert clave_item_exacta(CAP_SENAL, "2.1._") != clave_item_exacta(CAP_PAV, "2.1")
    assert clave_item_exacta(CAP_HORIZ, "4.1._") != clave_item_exacta(CAP_HORIZ, "4.1")

    filas = [
        _listado(CAP_PAV, "2.1", "SUBBASE GRANULAR", "M3", 297349, id_=1),
        _listado(CAP_PAV, "2.2", "BASE GRANULAR", "M3", 336064, id_=2),
        _listado(CAP_PAV, "2.3", "ADOQUÍN", "M2", 7292, id_=3),
        _listado(CAP_HORIZ, "4.1", "LÍNEA DE DEMARCACIÓN", "ML", 1800, id_=4),
        _listado(CAP_HORIZ, "4.2", "TACHAS", "UND", 22444, id_=5),
        _listado(CAP_HORIZ, "4.3", "SEÑAL VERTICAL", "UND", 900, id_=6),
        _listado(CAP_HORIZ, "4.4", "POSTE", "UND", 700, id_=7),
        _listado(CAP_SENAL, "2.1._", "Señal SR-30", "Und", 50000, id_=8),
        _listado(CAP_PMT, "4.1._", "Instalación inicial PMT", "Und", 5000000, id_=9),
    ]
    cantidades = {
        (CAP_PAV, "2.1"): 1363.79,
        (CAP_PAV, "2.2"): 20,
        (CAP_PAV, "2.3"): 30,
        (CAP_HORIZ, "4.1"): 11623.24,
        (CAP_HORIZ, "4.2"): 449.24,
        (CAP_HORIZ, "4.3"): 36,
        (CAP_HORIZ, "4.4"): 898.4,
        (CAP_SENAL, "2.1._"): 1363.79,
        (CAP_PMT, "4.1._"): 11623.24,
    }
    registros = [
        {"capitulo": CAP_SENAL, "item_numero": "2.1._", "item_descripcion": "Señal SR-30", "cantidad_total": 4, "costo_directo": 200000},
        {"capitulo": CAP_SENAL, "item_numero": "2.2._", "item_descripcion": "Señal Estrechamiento de Calzada", "cantidad_total": 1, "costo_directo": 100},
        {"capitulo": CAP_SENAL, "item_numero": "2.3._", "item_descripcion": "Señal Obra en la Vía", "cantidad_total": 2, "costo_directo": 200},
        {"capitulo": CAP_PMT, "item_numero": "4.1._", "item_descripcion": "Instalación inicial PMT", "cantidad_total": 1, "costo_directo": 5000000},
        {"capitulo": CAP_PMT, "item_numero": "4.2._", "item_descripcion": "Transporte PMT", "cantidad_total": 1, "costo_directo": 7000000},
        {"capitulo": CAP_PMT, "item_numero": "4.3._", "item_descripcion": "Mantenimiento PMT", "cantidad_total": 1, "costo_directo": 6000000},
        {"capitulo": CAP_PMT, "item_numero": "4.4._", "item_descripcion": "Desmonte final PMT", "cantidad_total": 1, "costo_directo": 3000000},
    ]
    cuadro = construir_cuadro_mensual(
        filas,
        cantidades_por_clave=cantidades,
        cant_presente=sumar_cantidad_por_clave(registros),
    )
    codigos = [it["item_numero"] for it in cuadro["items"]]
    assert codigos == ["2.1", "2.2", "2.3", "4.1", "4.2", "4.3", "4.4"]
    subbase = cuadro["items"][0]
    assert subbase["item_numero"] == "2.1"
    assert subbase["vlr_unitario"] == 297349
    assert subbase["cant_actualizadas"] == 1363.79
    assert subbase["item_descripcion"] == "SUBBASE GRANULAR"
    assert subbase["cant_presente"] == 0
    horiz = next(it for it in cuadro["items"] if it["item_numero"] == "4.1")
    assert horiz["capitulo"] == CAP_HORIZ
    assert horiz["cant_actualizadas"] == 11623.24
    assert horiz["vlr_unitario"] == 1800
    fuera = clasificar_registros_excluidos(registros, filas, cuadro["claves"])
    assert {(it["capitulo"], it["item_numero"]) for it in fuera["items"]} == {
        (CAP_SENAL, "2.1._"),
        (CAP_SENAL, "2.2._"),
        (CAP_SENAL, "2.3._"),
        (CAP_PMT, "4.1._"),
        (CAP_PMT, "4.2._"),
        (CAP_PMT, "4.3._"),
        (CAP_PMT, "4.4._"),
    }
    assert all(it["motivo"] == MOTIVO_PMT for it in fuera["items"])
    assert fuera["por_motivo"][MOTIVO_PMT]["cantidad"] == 11
    assert fuera["por_motivo"][MOTIVO_PMT]["valor_total"] == 200000 + 100 + 200 + 5000000 + 7000000 + 6000000 + 3000000


def _filas_item(ws):
    limite = next(
        r for r in range(9, ws.max_row + 1) if ws.cell(r, 1).value == "RESUMEN DE CONCILIACIÓN"
    )
    rows = []
    for r in range(9, limite):
        val = ws.cell(r, 1).value
        if isinstance(val, str) and val.startswith("Subtotal"):
            continue
        if val in (None, ""):
            continue
        rows.append(r)
    return rows
