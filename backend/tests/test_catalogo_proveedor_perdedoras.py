"""Proveedores de cotizaciones perdedoras → directorio + detalle."""
from __future__ import annotations

import catalogo_insumos_service as cis


def test_normalize_conserva_nit_y_contactos():
    raw = [
        {
            "pair_id": "a",
            "tipo": "insumo",
            "es_ganadora": True,
            "proveedor": "PAVCO",
            "proveedor_id": 1,
            "nit": "8601",
            "contacto_email": "a@p.co",
            "contacto_nombre": "Ana",
            "contacto_telefono": "300",
            "valor": 100,
            "numero": "BO-1",
        },
        {
            "pair_id": "b",
            "tipo": "insumo",
            "es_ganadora": False,
            "proveedor": "OTRO SAS",
            "nit": "9002",
            "contacto_email": "o@x.co",
            "contacto_nombre": "Luis",
            "contacto_telefono": "310",
            "valor": 200,
            "numero": "OT-1",
        },
    ]
    out = cis.normalize_cotizaciones_detalle(raw)
    assert len(out) == 2
    perd = next(r for r in out if r["pair_id"] == "b")
    assert perd["nit"] == "9002"
    assert perd["contacto_email"] == "o@x.co"
    assert perd["contacto_nombre"] == "Luis"
    assert perd["contacto_telefono"] == "310"


def test_upsert_proveedores_desde_detalle_incluye_perdedoras(monkeypatch):
    created = []

    def fake_create(contrato_id, user_id, body):
        created.append(dict(body))
        pid = 10 + len(created)
        return {"id": pid, **body}

    monkeypatch.setattr(cis, "create_proveedor", fake_create)
    monkeypatch.setattr(cis, "sync_proveedor_contacto", lambda *a, **k: None)
    monkeypatch.setattr(cis, "_lookup_proveedor_id_by_nombre", lambda *a, **k: None)

    detalle = [
        {
            "pair_id": "a",
            "tipo": "insumo",
            "es_ganadora": True,
            "proveedor": "PAVCO",
            "proveedor_id": 42,
            "nit": "8601",
            "contacto_email": "a@p.co",
            "valor": 100,
        },
        {
            "pair_id": "b",
            "tipo": "insumo",
            "es_ganadora": False,
            "proveedor": "OTRO SAS",
            "nit": "9002",
            "contacto_email": "o@x.co",
            "contacto_nombre": "Luis",
            "contacto_telefono": "310",
            "valor": 200,
        },
    ]
    out = cis._upsert_proveedores_desde_detalle(1, 7, detalle)
    assert any(c.get("nit") == "9002" for c in created)
    perd = next(r for r in out if r["pair_id"] == "b")
    assert perd["proveedor_id"] is not None
    gan = next(r for r in out if r["pair_id"] == "a")
    assert gan["proveedor_id"] == 42
