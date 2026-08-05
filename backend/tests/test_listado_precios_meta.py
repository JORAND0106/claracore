"""Tests unitarios — overlay e impacto de meta listado (ítem/desc/unidad)."""
from __future__ import annotations

from listado_precios_meta import (
    build_impacto_edicion_meta,
    listado_meta_for_cap_item,
    meta_fields_changed,
    overlay_presupuesto_row,
    overlay_sicoe_row,
)


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
