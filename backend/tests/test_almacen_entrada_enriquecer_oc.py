"""Autodiligencia de metadatos de entrada desde la Orden de Compra."""

from unittest.mock import MagicMock

from almacen_service import _enriquecer_entrada_desde_oc


def test_enriquecer_entrada_desde_oc_autodiligencia(monkeypatch):
    def table(name):
        q = MagicMock()
        if name == "almacen_solicitud_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "pk_id": "PK-42",
                "tramo": "Tramo 1",
                "costado": "Derecho",
                "abscisa_inicial": 1815.0,
                "abscisa_final": 1935.0,
            }]
        return q

    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=table))
    monkeypatch.setattr("almacen_service._resolve_proveedor_id", lambda _cid, nombre: 9 if nombre else None)

    oc = {
        "items": [{
            "id": 5,
            "solicitud_item_id": 77,
            "proveedor_nombre": "Proveedor Test S.A.S.",
        }],
    }
    body = {"items": [{"orden_compra_item_id": 5, "cantidad_recibida": 2}]}
    out = _enriquecer_entrada_desde_oc(1, oc, body["items"], body)

    assert out["pk_id"] == "PK-42"
    assert out["tramo"] == "Tramo 1"
    assert out["costado"] == "Derecho"
    assert out["abscisa_inicial"] == "K1+815"
    assert out["abscisa_final"] == "K1+935"
    assert out["proveedor_id"] == 9


def test_enriquecer_no_sobrescribe_valores_enviados(monkeypatch):
    def table(name):
        q = MagicMock()
        if name == "almacen_solicitud_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "pk_id": "PK-DB",
                "tramo": "T DB",
                "costado": "Izq",
                "abscisa_inicial": 100.0,
                "abscisa_final": 200.0,
            }]
        return q

    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=table))
    monkeypatch.setattr("almacen_service._resolve_proveedor_id", lambda *_a, **_k: 99)

    oc = {"items": [{"id": 5, "solicitud_item_id": 77, "proveedor_nombre": "X"}]}
    body = {
        "pk_id": "PK-MANUAL",
        "tramo": "T manual",
        "costado": "Der",
        "abscisa_inicial": "K0+100",
        "abscisa_final": "K0+200",
        "proveedor_id": 3,
        "items": [{"orden_compra_item_id": 5}],
    }
    out = _enriquecer_entrada_desde_oc(1, oc, body["items"], body)
    assert out["pk_id"] == "PK-MANUAL"
    assert out["tramo"] == "T manual"
    assert out["costado"] == "Der"
    assert out["abscisa_inicial"] == "K0+100"
    assert out["abscisa_final"] == "K0+200"
    assert out["proveedor_id"] == 3
