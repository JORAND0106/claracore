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
        })
