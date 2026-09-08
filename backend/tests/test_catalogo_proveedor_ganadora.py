"""Tests: no perder proveedor_id de la ganadora al agregar cotizaciones."""
from __future__ import annotations

import catalogo_insumos_service as cis


def test_resolve_proveedor_conserva_existing_si_ganadora_sin_id(monkeypatch):
    detalle = [
        {
            "id": "a-insumo",
            "pair_id": "a",
            "tipo": "insumo",
            "es_ganadora": True,
            "proveedor": "PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.",
            "proveedor_id": None,
            "valor": 21703,
            "numero": "BO-160-2026",
        },
        {
            "id": "b-insumo",
            "pair_id": "b",
            "tipo": "insumo",
            "es_ganadora": False,
            "proveedor": "OTRO PROVEEDOR",
            "proveedor_id": 99,
            "valor": 25000,
            "numero": "OT-1",
        },
    ]

    monkeypatch.setattr(
        cis,
        "_lookup_proveedor_id_by_nombre",
        lambda contrato_id, razon, nit="": 42 if "PAVCO" in (razon or "").upper() else None,
    )

    pid, fixed = cis._resolve_proveedor_id_for_payload(
        contrato_id=1,
        proveedor_id=None,
        body={},  # body vacío = simula clearCaptureAfterSend
        detalle=detalle,
        existing={"proveedor_id": 42},
    )
    assert pid == 42
    gan = next(r for r in fixed if r.get("es_ganadora"))
    assert gan["proveedor_id"] == 42


def test_resolve_proveedor_usa_ganadora_no_la_oferta_adicional(monkeypatch):
    detalle = [
        {
            "pair_id": "a",
            "tipo": "insumo",
            "es_ganadora": True,
            "proveedor": "PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.",
            "proveedor_id": 42,
            "valor": 100,
        },
        {
            "pair_id": "b",
            "tipo": "insumo",
            "es_ganadora": False,
            "proveedor": "OTRO",
            "proveedor_id": 99,
            "valor": 200,
        },
    ]
    monkeypatch.setattr(cis, "_lookup_proveedor_id_by_nombre", lambda *a, **k: None)
    pid, _ = cis._resolve_proveedor_id_for_payload(
        contrato_id=1,
        proveedor_id=99,  # body traería el de la oferta adicional por error
        body={"proveedor_id": 99, "razon_social": "OTRO"},
        detalle=detalle,
        existing=None,
    )
    assert pid == 42


def test_enrich_usa_nombre_ganadora_si_falta_fk():
    row = {
        "id": 1,
        "contrato_id": 1,
        "codigo": "CC-1614-001",
        "descripcion": "GEOCELDA",
        "unidad": "M2",
        "costo_base": 21703,
        "proveedor_id": None,
        "cotizaciones_detalle": [
            {
                "tipo": "insumo",
                "es_ganadora": True,
                "proveedor": "PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.",
                "valor": 21703,
                "numero": "BO-160-2026",
            }
        ],
        "tributos": {},
        "impuestos": [],
    }
    # Evitar consulta de consumo negociado
    item = cis._enrich_insumo_catalogo_row(row, {})
    assert item["proveedor_nombre"] == "PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S."


def test_proveedor_nombre_fallback_almacen():
    from almacen_insumos_service import _proveedor_nombre_fallback_desde_row

    row = {
        "cotizaciones_detalle": [
            {"tipo": "insumo", "es_ganadora": True, "proveedor": "PAVCO SAS", "valor": 1},
        ]
    }
    assert _proveedor_nombre_fallback_desde_row(row) == "PAVCO SAS"
