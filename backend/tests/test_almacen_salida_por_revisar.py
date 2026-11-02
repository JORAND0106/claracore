"""Salidas: por revisar + disponibles sin filtrar por PK."""
from unittest.mock import MagicMock

import pytest

from almacen_salida_por_revisar import (
    MOTIVO_SIN_RECEPTOR,
    MOTIVO_SIN_SECTOR,
    patch_por_revisar,
    unir_motivos,
)
from almacen_service import create_salida


def test_unir_motivos_salida():
    assert unir_motivos([MOTIVO_SIN_SECTOR, MOTIVO_SIN_RECEPTOR]) == "Sin sector | Sin receptor"
    assert patch_por_revisar([]) == {"por_revisar": False, "por_revisar_motivos": None}
    assert patch_por_revisar([MOTIVO_SIN_SECTOR])["por_revisar"] is True


def test_create_salida_sin_pk_ni_receptor_marca_por_revisar(monkeypatch):
    sb = MagicMock()
    inserted = {}

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 5,
                "cantidad_recibida": 50,
                "presupuesto_id": None,
                "orden_compra_item_id": None,
            }]
        elif name == "almacen_entrada":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "pk_id": "PK-ORIG",
                "tramo": "T1",
            }]
        elif name == "almacen_salida":
            def _insert(row):
                inserted.update(row)
                r = MagicMock()
                r.execute.return_value.data = [{**row, "id": 77}]
                return r

            q.insert.side_effect = _insert
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "usuarios":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 99,
                "nombre": "Desp",
                "apellidos": "X",
                "firma_imagen_url": None,
            }]
        else:
            q.select.return_value.execute.return_value.data = []
            q.insert.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr("almacen_service._ubicacion_efectiva_entrada_items", lambda *_a, **_k: {
        10: {"pk_id": "PK-ORIG", "tramo": "T1"},
    })
    monkeypatch.setattr("almacen_service._despacho_neto_por_entrada_item", lambda *_a, **_k: {10: 0.0})
    monkeypatch.setattr("almacen_service._cantidad_recibida_entrada_item", lambda *_a, **_k: 50.0)
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 1)
    monkeypatch.setattr("almacen_service._format_codigo_salida", lambda *_a, **_k: "Sal-X-00001")
    monkeypatch.setattr("almacen_service._map_usuario_nombres", lambda *_a, **_k: {99: "Desp X"})
    monkeypatch.setattr("almacen_service._invalidar_graficos_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service.threading.Thread", lambda *a, **k: MagicMock(start=lambda: None))

    out = create_salida(1, 99, {
        "entrada_item_id": 10,
        "cantidad_salida": 3,
        # sin pk_id ni receptor
    })
    assert out["id"] == 77
    assert out["por_revisar"] is True
    assert "Sin sector" in (out.get("por_revisar_motivos") or "")
    assert "Sin receptor" in (out.get("por_revisar_motivos") or "")
    assert inserted.get("receptor_usuario_id") is None
    assert inserted.get("pk_id") is None


def test_create_salida_permite_pk_destino_distinto(monkeypatch):
    """El PK de destino ya no debe coincidir con el de la entrada."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 5,
                "cantidad_recibida": 50,
                "presupuesto_id": None,
                "orden_compra_item_id": None,
            }]
        elif name == "almacen_entrada":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "pk_id": "PK-ORIG",
            }]
        elif name == "almacen_salida":
            q.insert.return_value.execute.return_value.data = [{"id": 88, "numero_salida": 2}]
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "usuarios":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 2,
                "nombre": "Juan",
                "apellidos": "Pérez",
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
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr("almacen_service._ubicacion_efectiva_entrada_items", lambda *_a, **_k: {
        10: {"pk_id": "PK-ORIG"},
    })
    monkeypatch.setattr("almacen_service._despacho_neto_por_entrada_item", lambda *_a, **_k: {10: 0.0})
    monkeypatch.setattr("almacen_service._cantidad_recibida_entrada_item", lambda *_a, **_k: 50.0)
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 2)
    monkeypatch.setattr("almacen_service._format_codigo_salida", lambda *_a, **_k: "Sal-X-00002")
    monkeypatch.setattr("almacen_service._map_usuario_nombres", lambda *_a, **_k: {99: "Desp", 2: "Juan Pérez"})
    monkeypatch.setattr("almacen_service._invalidar_graficos_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service.threading.Thread", lambda *a, **k: MagicMock(start=lambda: None))

    out = create_salida(1, 99, {
        "pk_id": "PK-DESTINO",
        "receptor_usuario_id": 2,
        "entrada_item_id": 10,
        "cantidad_salida": 4,
    })
    assert out["pk_id"] == "PK-DESTINO"
    assert out.get("por_revisar") is False
