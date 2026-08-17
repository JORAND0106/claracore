"""Saldo por línea de entrada en get_entrada + alertas de color."""
from unittest.mock import MagicMock

from almacen_service import (
    _alerta_saldo_entrada,
    _disponible_entrada_item,
    _porcentaje_saldo_disponible,
    get_entrada,
)


def test_alerta_saldo_umbrales():
    assert _alerta_saldo_entrada(25, 100) == "normal"
    assert _alerta_saldo_entrada(20.01, 100) == "normal"
    assert _alerta_saldo_entrada(20, 100) == "naranja"
    assert _alerta_saldo_entrada(10.01, 100) == "naranja"
    assert _alerta_saldo_entrada(10, 100) == "rojo"
    assert _alerta_saldo_entrada(0, 100) == "rojo"
    assert _alerta_saldo_entrada(0, 0) == "normal"


def test_porcentaje_y_disponible():
    assert _disponible_entrada_item(1500, 1200) == 300
    assert _porcentaje_saldo_disponible(1500, 300) == 20.0
    assert _porcentaje_saldo_disponible(1000, 50) == 5.0
    assert _porcentaje_saldo_disponible(0, 0) == 0.0


def test_get_entrada_enriquece_saldo_por_item(monkeypatch):
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 7,
                "contrato_id": 1,
                "tipo": "recibo",
                "numero_documento": "REM-1",
                "fecha_entrada": "2026-08-01",
                "orden_compra_id": None,
                "proveedor_id": None,
                "insumo_id": None,
                "created_by": None,
                "pk_id": "PK-001",
                "tramo": None,
                "costado": "Derecha",
                "abscisa_inicial": "0+100",
                "abscisa_final": "0+120",
                "placa": None,
                "transportador": None,
                "disposicion_pdf_blob_path": None,
                "remision_blob_path": None,
                "codigo": "Ent-7",
                "numero_entrada": 7,
            }]
        elif name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 7,
                "orden_compra_item_id": 3,
                "cantidad_recibida": 1000,
            }]
        elif name == "almacen_orden_compra_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "material_descripcion": "Cemento",
                "unidad": "KG",
                "cantidad": 5000,
            }]
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service._despacho_neto_por_entrada_item",
        lambda *_a, **_k: {10: 900.0},
    )
    monkeypatch.setattr(
        "almacen_service._movimientos_salida_devolucion_por_entrada_item",
        lambda *_a, **_k: {10: [{
            "id": 5,
            "numero_salida": 1,
            "codigo": "Sal-1",
            "cantidad_salida": 350.0,
            "cantidad_devuelta": 50.0,
            "cantidad_neta": 300.0,
            "fecha_hora_salida": "2026-08-10T15:00:00Z",
            "pk_id": "PK-001",
            "devoluciones": [{
                "id": 9,
                "numero_devolucion": 1,
                "codigo": "Dev-1",
                "cantidad": 50.0,
                "fecha_hora_devolucion": "2026-08-11T10:00:00Z",
            }],
        }]},
    )
    monkeypatch.setattr(
        "almacen_service._asegurar_codigo_entrada",
        lambda _cid, ent: ent,
    )

    ent = get_entrada(1, 7)
    it = ent["items"][0]
    assert it["cantidad_recibida"] == 1000
    assert it["cantidad_despachada"] == 900.0
    assert it["saldo_disponible"] == 100.0
    assert it["porcentaje_saldo_disponible"] == 10.0
    assert it["alerta_saldo"] == "rojo"
    assert len(it["salidas"]) == 1
    assert it["salidas"][0]["cantidad_salida"] == 350.0
    assert it["salidas"][0]["cantidad_neta"] == 300.0
    assert it["salidas"][0]["devoluciones"][0]["cantidad"] == 50.0


def test_movimientos_salida_con_devolucion_anidada(monkeypatch):
    from almacen_service import _movimientos_salida_devolucion_por_entrada_item

    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 5,
                "entrada_item_id": 10,
                "numero_salida": 1,
                "codigo": "Sal-1",
                "cantidad_salida": 350,
                "fecha_hora_salida": "2026-08-10T15:00:00Z",
                "created_at": "2026-08-10T15:00:00Z",
                "pk_id": "PK-001",
            }]
        elif name == "almacen_devolucion":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 9,
                "salida_id": 5,
                "numero_devolucion": 1,
                "codigo": "Dev-1",
                "cantidad": 50,
                "fecha_hora_devolucion": "2026-08-11T10:00:00Z",
                "created_at": "2026-08-11T10:00:00Z",
            }]
        else:
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    mov = _movimientos_salida_devolucion_por_entrada_item(sb, [10])
    assert len(mov[10]) == 1
    sal = mov[10][0]
    assert sal["cantidad_salida"] == 350.0
    assert sal["cantidad_devuelta"] == 50.0
    assert sal["cantidad_neta"] == 300.0
    assert len(sal["devoluciones"]) == 1
    assert sal["devoluciones"][0]["codigo"] == "Dev-1"
