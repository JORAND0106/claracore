"""Devoluciones de material — reactivación de saldo sobre salida."""
from unittest.mock import MagicMock

import pytest

from almacen_service import (
    _despacho_neto_por_entrada_item,
    _disponible_entrada_item,
    create_devolucion,
)


def test_disponible_tras_devolucion_parcial():
    """Salida 100, devolución 20 → despacho neto 80; disponible = 1500−80 = 1420."""
    recibida = 1500.0
    # Sin devoluciones: disponible 1400 tras salida 100
    assert _disponible_entrada_item(recibida, 100) == 1400
    # Con devolución 20: neto 80
    assert _disponible_entrada_item(recibida, 80) == 1420


def test_despacho_neto_resta_devoluciones(monkeypatch):
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = [
                {"entrada_item_id": 10, "cantidad_salida": 100},
            ]
        elif name == "almacen_devolucion":
            q.select.return_value.in_.return_value.execute.return_value.data = [
                {"entrada_item_id": 10, "cantidad": 20},
            ]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    neto = _despacho_neto_por_entrada_item(sb, [10])
    assert neto[10] == 80.0


def test_create_devolucion_rechaza_exceso(monkeypatch):
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_salida":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "entrada_item_id": 10,
                "cantidad_salida": 100,
                "pk_id": "PK-001",
                "pk_id_id": None,
                "tramo": None,
                "costado": None,
                "abscisa_inicial": None,
                "abscisa_final": None,
                "numero_salida": 1,
                "codigo": "Sal-1",
            }]
        elif name == "almacen_devolucion":
            # Sin devoluciones previas
            q.select.return_value.in_.return_value.execute.return_value.data = []
            q.insert.return_value.execute.return_value.data = []
        elif name == "usuarios":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 2,
                "nombre": "Ana",
                "apellidos": "Obra",
                "activo": True,
                "rol_id": 3,
                "contrato_id": 1,
                "firma_imagen_url": None,
            }]
        elif name == "roles":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"nombre": "Contratista"}]
        elif name == "usuario_contratos":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": 1}]
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service._validar_receptor_obra",
        lambda *_a, **_k: {"id": 2, "label": "Ana Obra"},
    )
    monkeypatch.setattr(
        "almacen_service._sum_devoluciones_por_salida",
        lambda *_a, **_k: {5: 0.0},
    )

    with pytest.raises(ValueError, match="Máximo permitido: 100"):
        create_devolucion(1, 99, {
            "pk_id": "PK-001",
            "receptor_usuario_id": 2,
            "salida_id": 5,
            "cantidad": 120,
            "costado": "Derecha",
            "abscisa_inicial": "0+100",
            "abscisa_final": "0+120",
        })


def test_create_devolucion_rechaza_ubicacion_vacia_sin_heredar_salida(monkeypatch):
    """No acepta costado/abscisas vacíos aunque la salida los tuviera."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_salida":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "entrada_item_id": 10,
                "cantidad_salida": 100,
                "pk_id": "PK-001",
                "pk_id_id": None,
                "tramo": "T1",
                "costado": "Derecha",
                "abscisa_inicial": "0+100",
                "abscisa_final": "0+120",
                "numero_salida": 1,
                "codigo": "Sal-1",
            }]
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service._validar_receptor_obra",
        lambda *_a, **_k: {"id": 2, "label": "Ana Obra"},
    )
    monkeypatch.setattr(
        "almacen_service._sum_devoluciones_por_salida",
        lambda *_a, **_k: {5: 0.0},
    )

    base = {
        "pk_id": "PK-001",
        "receptor_usuario_id": 2,
        "salida_id": 5,
        "cantidad": 10,
    }
    with pytest.raises(ValueError, match="costado"):
        create_devolucion(1, 99, {**base, "costado": "", "abscisa_inicial": "0+100", "abscisa_final": "0+120"})
    with pytest.raises(ValueError, match="abscisa"):
        create_devolucion(1, 99, {
            **base,
            "costado": "Derecha",
            "abscisa_inicial": "",
            "abscisa_final": "0+120",
        })
    with pytest.raises(ValueError, match="abscisa"):
        create_devolucion(1, 99, {
            **base,
            "costado": "Derecha",
            "abscisa_inicial": "0+100",
            "abscisa_final": None,
        })


def test_enrich_salidas_incluye_devuelta_y_neta(monkeypatch):
    """listado de salidas expone cantidad_devuelta / cantidad_neta (opción A+)."""
    from almacen_service import _enrich_salidas_rows

    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 10,
                "orden_compra_item_id": 3,
                "presupuesto_id": 1,
            }]
        elif name == "almacen_orden_compra_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 3,
                "material_descripcion": "Cemento",
                "unidad": "KG",
                "orden_compra_id": 2,
            }]
        elif name == "almacen_orden_compra":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 2,
                "numero_oc": 14,
            }]
        elif name == "almacen_devolucion":
            q.select.return_value.in_.return_value.execute.return_value.data = [
                {"salida_id": 5, "cantidad": 50},
            ]
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._map_usuario_nombres", lambda *_a, **_k: {})
    monkeypatch.setattr("almacen_service._contrato_segmento_documento", lambda *_a, **_k: "1614")

    rows = [{
        "id": 5,
        "numero_salida": 1,
        "codigo": "Sal-1614-00001",
        "entrada_item_id": 10,
        "cantidad_salida": 200,
        "receptor_usuario_id": None,
        "created_by": None,
        "salida_pdf_blob_path": None,
    }]
    out = _enrich_salidas_rows(sb, 1, rows)
    assert out[0]["cantidad_devuelta"] == 50.0
    assert out[0]["cantidad_neta"] == 150.0


def test_eliminar_devolucion_revierte_inventario_y_borra(monkeypatch):
    import time
    from almacen_service import eliminar_devolucion

    sb = MagicMock()
    upsert_calls = []
    deleted_mov = []
    deleted_dev = []
    pdf_calls = []

    def table(name):
        q = MagicMock()
        if name == "almacen_devolucion":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 9,
                "contrato_id": 1,
                "numero_devolucion": 2,
                "salida_id": 5,
                "entrada_item_id": 10,
                "cantidad": 20.0,
            }]
            q.delete.return_value.eq.return_value.eq.return_value.execute = lambda: MagicMock(data=[])
            q.delete.return_value.eq.return_value.eq.side_effect = lambda *a, **k: (
                deleted_dev.append(True) or q.delete.return_value.eq.return_value
            )
        elif name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 10,
                "presupuesto_id": 7,
                "orden_compra_item_id": 3,
            }]
        elif name == "almacen_orden_compra_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "material_descripcion": "Arena",
                "unidad": "M3",
                "presupuesto_id": 7,
            }]
        elif name == "almacen_movimiento":
            q.delete.return_value.eq.return_value.eq.return_value.execute = lambda: MagicMock(data=[])
            q.delete.return_value.eq.side_effect = lambda *a, **k: (
                deleted_mov.append(a) or q.delete.return_value
            )
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service._upsert_inventario",
        lambda *a, **k: upsert_calls.append(a),
    )
    monkeypatch.setattr("almacen_service._max_consecutivo", lambda *_a, **_k: 2)
    monkeypatch.setattr("almacen_service._invalidar_graficos_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "almacen_service.get_salida",
        lambda *_a, **_k: {"id": 5, "entrada_item_id": 10, "cantidad_salida": 100},
    )
    monkeypatch.setattr("almacen_service._pdf_ctx_for_salida", lambda *_a, **_k: {})
    monkeypatch.setattr(
        "almacen_service._generar_pdf_salida",
        lambda *a, **k: pdf_calls.append(a) or time.sleep(0.2),
    )

    t0 = time.perf_counter()
    out = eliminar_devolucion(1, 9)
    elapsed = time.perf_counter() - t0

    assert out["ok"] is True
    assert out["id"] == 9
    assert out["salida_id"] == 5
    assert out["cantidad"] == 20.0
    assert out.get("pdf_generando") is True
    assert upsert_calls, "debe revertir inventario"
    assert upsert_calls[0][4] == -20.0
    assert deleted_mov, "debe borrar movimiento"
    assert deleted_dev, "debe borrar fila devolución"
    # PDF no debe bloquear la respuesta (antes era sync ~firmas+upload).
    assert elapsed < 0.15, f"eliminar_devolucion bloqueó {elapsed:.3f}s; PDF debe ir en background"

    # Dar tiempo al hilo daemon a registrar la llamada.
    deadline = time.time() + 1.0
    while not pdf_calls and time.time() < deadline:
        time.sleep(0.02)
    assert pdf_calls, "PDF debe regenerarse en background"


def test_get_devolucion_no_lista_todo_el_contrato(monkeypatch):
    from almacen_service import get_devolucion

    sb = MagicMock()
    list_calls = []

    def table(name):
        q = MagicMock()
        if name == "almacen_devolucion":
            # by-id path
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 9,
                "contrato_id": 1,
                "salida_id": None,
                "cantidad": 1,
                "receptor_usuario_id": None,
                "created_by": None,
            }]
            # list path would use order without limit-eq-eq
            def order(*_a, **_k):
                list_calls.append("list")
                return q
            q.select.return_value.eq.return_value.order.side_effect = order
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr("almacen_service._map_usuario_nombres", lambda *_a, **_k: {})
    monkeypatch.setattr("almacen_service._enrich_salidas_rows", lambda *_a, **_k: [])

    row = get_devolucion(1, 9)
    assert row["id"] == 9
    assert not list_calls, "get_devolucion no debe listar todas las devoluciones"
