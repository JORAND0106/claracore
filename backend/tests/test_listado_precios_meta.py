"""Tests unitarios — overlay e impacto de meta listado (ítem/desc/unidad)."""
from __future__ import annotations

from listado_precios_meta import (
    aplicar_identificacion_listado,
    build_impacto_edicion_meta,
    listado_meta_for_cap_item,
    merge_listado_ficha_prefer_newer,
    meta_fields_changed,
    overlay_presupuesto_row,
    overlay_sicoe_row,
)
from sicoe_valor_canonico import cap_item_key


def _norm_item(s):
    if s is None:
        return ""
    t = str(s).strip()
    return t.rstrip(".") if t else ""


def _norm_cap(s):
    if not s or not str(s).strip():
        return "Sin capítulo"
    return " ".join(str(s).split())


def test_listado_meta_for_cap_item():
    idx = {
        ("1. PRELIMINARES", "1.01"): {
            "item_numero": "1.01",
            "descripcion": "Replanteo",
            "unidad": "M2",
            "precio_unitario": 100,
        }
    }
    meta = listado_meta_for_cap_item(
        "1. PRELIMINARES", "1.01", full_listado_by_cap_item=idx
    )
    assert meta["descripcion"] == "Replanteo"
    assert listado_meta_for_cap_item("X", "1.01", full_listado_by_cap_item=idx) is None


def test_listado_meta_fallback_sin_capitulo_si_item_unico():
    idx = {
        ("1.CAP", "1.01"): {
            "item_numero": "1.01",
            "descripcion": "Solo",
            "unidad": "M2",
        }
    }
    meta = listado_meta_for_cap_item(
        "Sin capítulo", "1.01", full_listado_by_cap_item=idx
    )
    assert meta["descripcion"] == "Solo"


def test_merge_listado_ficha_prefer_newer_por_id():
    older = {
        "id": 10,
        "item_numero": "1.01",
        "descripcion": "Vieja",
        "unidad": "M2",
        "competencia": "",
    }
    newer = {
        "id": 20,
        "item_numero": "1.01",
        "descripcion": "Nueva desc",
        "unidad": "ML",
        "competencia": "IDU",
    }
    merged = merge_listado_ficha_prefer_newer(older, newer)
    assert merged["descripcion"] == "Nueva desc"
    assert merged["unidad"] == "ML"
    assert merged["competencia"] == "IDU"
    # Editar la ficha de mayor id debe prevalecer aunque llegue primero la vieja
    merged2 = merge_listado_ficha_prefer_newer(newer, older)
    assert merged2["descripcion"] == "Nueva desc"


def test_overlay_presupuesto_row():
    idx = {
        ("1.PRELIM", "1.01"): {
            "item_numero": "1.01",
            "descripcion": "Nueva desc",
            "unidad": "ML",
        }
    }
    row = {
        "id": 9,
        "capitulo": "1.PRELIM",
        "item": "1.01",
        "descripcion": "Vieja",
        "und": "M2",
    }
    out = overlay_presupuesto_row(row, idx, norm_cap=_norm_cap, norm_item=_norm_item)
    assert out["descripcion"] == "Nueva desc"
    assert out["und"] == "ML"
    assert out["_listado_meta_vivo"] is True
    assert row["descripcion"] == "Vieja"  # no muta original


def test_identificacion_pisa_copia_y_norma_no_es_acta():
    """NP-08 y NP-05: la ficha visible es la del listado, no la del registro."""
    filas = {
        cap_item_key("3. EXCAVACIONES", "NP-08"): {
            "capitulo": "3. EXCAVACIONES",
            "item_numero": "NP-08",
            "descripcion": "EXCAVACIÓN MANUAL EN ROCA H=0.0-2.0 M (SECO SIN EXPLOSIVOS)",
            "unidad": "M3",
            "vlr_unitario": 222133,
            "especificacion_tecnica": "INVIAS 210",
            "acta_fijacion": "00",
        },
        cap_item_key("4. PAVIMENTOS", "NP-05"): {
            "capitulo": "4. PAVIMENTOS",
            "item_numero": "NP-05",
            "descripcion": "MEJORAMIENTO DE LA SUBRASANTE INVOLUCRANDO EL SUELO EXISTENTE",
            "unidad": "M2",
            "vlr_unitario": 15000,
            "especificacion_tecnica": "INVIAS 320",
            "acta_fijacion": "NA",
        },
    }
    copias = [
        {
            "capitulo": "3. EXCAVACIONES",
            "item_numero": "NP-08",
            "item_descripcion": "EXCAVACION EN ROCA",
            "unidad": "M3",
            "vlr_unitario": 1,
            "vlr_unitario_sub": 1,
        },
        {
            "capitulo": "4. PAVIMENTOS",
            "item_numero": "NP-05",
            "item_descripcion": "nivelacion y compactacion",
            "unidad": "M3",
            "vlr_unitario": 9,
        },
    ]
    out = aplicar_identificacion_listado(copias, filas, aplicar_vu=True)
    by = {r["item_numero"]: r for r in out}
    np08 = by["NP-08"]
    assert np08["item_descripcion"] == filas[cap_item_key("3. EXCAVACIONES", "NP-08")]["descripcion"]
    assert np08["unidad"] == "M3"
    assert np08["norma_tecnica"] == "INVIAS 210"
    assert np08["especificacion_tecnica"] == "INVIAS 210"
    assert np08["norma_tecnica"] != "00"
    assert np08["vlr_unitario"] == 222133
    assert np08["vlr_unitario_sub"] == 222133
    np05 = by["NP-05"]
    assert np05["item_descripcion"] == "MEJORAMIENTO DE LA SUBRASANTE INVOLUCRANDO EL SUELO EXISTENTE"
    assert np05["unidad"] == "M2"
    assert np05["norma_tecnica"] == "INVIAS 320"
    assert "acta_fijacion" not in np05 or np05.get("acta_fijacion") != np05["norma_tecnica"]
    assert copias[0]["item_descripcion"] == "EXCAVACION EN ROCA"


def test_overlay_sicoe_norma_es_especificacion():
    idx = {
        ("2.EXC", "NP-08"): {
            "item_numero": "NP-08",
            "descripcion": "EXCAVACIÓN MANUAL EN ROCA",
            "unidad": "M3",
            "especificacion_tecnica": "INVIAS 210",
            "acta_fijacion": "00",
        }
    }
    out = overlay_sicoe_row(
        {"capitulo": "2.EXC", "item_numero": "NP-08", "item_descripcion": "excavacion en roca", "unidad": "UND"},
        idx,
        norm_cap=_norm_cap,
        norm_item=_norm_item,
    )
    assert out["item_descripcion"] == "EXCAVACIÓN MANUAL EN ROCA"
    assert out["norma_tecnica"] == "INVIAS 210"
    assert out["especificacion_tecnica"] == "INVIAS 210"
    assert "00" not in (out["norma_tecnica"],)


def test_overlay_sicoe_row():
    idx = {
        ("2.EXC", "2.01"): {
            "item_numero": "2.01",
            "descripcion": "Excavación",
            "unidad": "M3",
        }
    }
    row = {
        "id": 3,
        "capitulo": "2.EXC",
        "item_numero": "2.01",
        "item_descripcion": "Old",
        "unidad": "M2",
    }
    out = overlay_sicoe_row(row, idx, norm_cap=_norm_cap, norm_item=_norm_item)
    assert out["item_descripcion"] == "Excavación"
    assert out["unidad"] == "M3"


def test_meta_fields_changed():
    assert meta_fields_changed(
        {"item_numero": "1.01", "descripcion": "A", "unidad": "M2"},
        {"item_numero": "1.01", "descripcion": "B", "unidad": "M2"},
    ) == ["descripcion"]
    assert set(meta_fields_changed(
        {"item_numero": "1", "descripcion": "A", "unidad": "M2"},
        {"item_numero": "2", "descripcion": "A", "unidad": "ML"},
    )) == {"item_numero", "unidad"}


def test_build_impacto_edicion_meta():
    precio = {
        "id": 10,
        "contrato_id": 1,
        "capitulo": "1.CAP",
        "competencia": "IDU",
        "item_numero": "1.01",
    }
    ppto = [
        {"id": 1, "capitulo": "1.CAP", "competencia": "IDU", "item": "1.01"},
        {"id": 2, "capitulo": "1.CAP", "competencia": "IDU", "item": "1.99"},
        {"id": 3, "capitulo": "1.CAP", "competencia": "IDU", "item": "1.01"},
    ]
    sicoe = [
        {
            "id": 11,
            "capitulo": "1.CAP",
            "competencia": "IDU",
            "item_numero": "1.01",
            "acta_rpo_id": 50,
            "reporte_id": 70,
        },
        {
            "id": 12,
            "capitulo": "1.CAP",
            "competencia": "IDU",
            "item_numero": "1.01",
            "acta_rpo_id": 50,
            "reporte_id": 71,
        },
    ]
    actas = {50: {"numero_rpo": 3}}
    reportes = {
        70: {"numero_reporte": 101, "acta_rpo_id": 50, "estado": "Enviado"},
        71: {"numero_reporte": 102, "acta_rpo_id": 50, "estado": "Borrador"},
    }
    out = build_impacto_edicion_meta(
        precio=precio,
        ppto_rows=ppto,
        sicoe_rows=sicoe,
        actas_by_id=actas,
        reportes_by_id=reportes,
        firmadas_ids={50},
        norm_cap=_norm_cap,
        norm_item=_norm_item,
        campos_cambiados=["descripcion"],
    )
    assert out["presupuesto_count"] == 2
    assert out["sicoe_registros_count"] == 2
    assert out["actas_rpo_count"] == 1
    assert out["actas_rpo"][0]["numero_rpo"] == 3
    assert out["actas_rpo"][0]["firmada"] is True
    assert out["reportes_count"] == 2
    assert {r["numero_reporte"] for r in out["reportes"]} == {101, 102}
