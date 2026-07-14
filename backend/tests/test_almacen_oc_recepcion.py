"""Resumen de recepción y saldo pendiente de órdenes de compra."""
from almacen_service import _oc_recepcion_resumen


def test_oc_recepcion_pendiente_sin_entradas():
    items = [{"cantidad": 1500, "cantidad_recibida": 0, "valor_unitario": 10, "valor_recibido": 0, "unidad": "UND"}]
    r = _oc_recepcion_resumen(items, "aprobada")
    assert r["estado_recepcion"] == "pendiente"
    assert r["saldo_cantidad_pendiente"] == 1500
    assert r["tiene_saldo_recepcion"] is True


def test_oc_recepcion_parcial():
    items = [{"cantidad": 1500, "cantidad_recibida": 200, "valor_unitario": 10, "valor_recibido": 2000, "unidad": "UND"}]
    r = _oc_recepcion_resumen(items, "parcial")
    assert r["estado_recepcion"] == "parcial"
    assert r["saldo_cantidad_pendiente"] == 1300
    assert r["tiene_saldo_recepcion"] is True


def test_oc_recepcion_completa():
    items = [{"cantidad": 1500, "cantidad_recibida": 1500, "valor_unitario": 10, "valor_recibido": 15000, "unidad": "UND"}]
    r = _oc_recepcion_resumen(items, "completa")
    assert r["estado_recepcion"] == "completa"
    assert r["saldo_cantidad_pendiente"] == 0
    assert r["tiene_saldo_recepcion"] is False
