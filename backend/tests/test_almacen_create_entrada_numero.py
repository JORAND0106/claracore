"""create_entrada: número de documento Recibo vs Disposición (insert simulado)."""

from unittest.mock import MagicMock

import pytest

from almacen_service import create_entrada


@pytest.fixture(autouse=True)
def _segmento_contrato_1614(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )


def _patch_create_entrada_minimo(monkeypatch, *, inserted: dict):
    """Simula insert de entrada y evita OC/inventario/PDF."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            q.insert.return_value.execute.return_value.data = [{"id": 99, **inserted}]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"disposicion_pdf_blob_path": "ok.pdf"},
            ]
        elif name == "almacen_proveedor":
            q.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"id": 1},
            ]
        else:
            q.select.return_value.execute.return_value.data = []
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
            q.update.return_value.eq.return_value.execute.return_value.data = []
        q.select.return_value.eq.return_value.execute.return_value.data = []
        q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service.get_orden_compra",
        lambda _cid, _oc, **kwargs: {
            "id": 1,
            "estado": "aprobada",
            "numero_oc": 10,
            "items": [
                {
                    "id": 5,
                    "presupuesto_id": 1,
                    "material_descripcion": "Arena",
                    "unidad": "M3",
                    "cantidad": 100,
                    "cantidad_recibida": 0,
                    "valor_unitario": 1000,
                    "valor_recibido": 0,
                },
            ],
        },
    )
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 7)
    monkeypatch.setattr("almacen_service._next_numero_disposicion", lambda _cid: "1614-00099")
    monkeypatch.setattr("almacen_service._actualizar_estado_oc", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._upsert_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._generar_pdf_pos_entrada", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "almacen_service.get_entrada",
        lambda _cid, _eid: {"id": 99, "tipo": inserted.get("tipo"), "numero_documento": inserted.get("numero_documento")},
    )
    return sb


def test_create_entrada_recibo_guarda_remision_literal(monkeypatch):
    captured = {}

    def capture_insert(row):
        captured.update(row)
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": 99}])))

    sb = _patch_create_entrada_minimo(monkeypatch, inserted={})
    sb.table.side_effect = lambda name: (
        MagicMock(insert=capture_insert)
        if name == "almacen_entrada"
        else _patch_create_entrada_minimo(monkeypatch, inserted={}).table(name)
    )

    # Re-patch with simpler capture on almacen_entrada only
    calls = []

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            def do_insert(row):
                calls.append(row)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": 99}])))

            q.insert.side_effect = do_insert
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"disposicion_pdf_blob_path": "x.pdf"},
            ]
        elif name == "almacen_proveedor":
            q.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"id": 1},
            ]
        elif name == "almacen_entrada_item":
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
        elif name == "almacen_orden_compra_item":
            q.update.return_value.eq.return_value.execute.return_value.data = []
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        else:
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
            q.select.return_value.execute.return_value.data = []
            q.update.return_value.eq.return_value.execute.return_value.data = []
        return q

    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=table))
    monkeypatch.setattr(
        "almacen_service._upload_soporte",
        lambda *_a, **_k: {"blob_path": "x", "nombre": "rem.pdf", "mime": "application/pdf"},
    )
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 7)
    monkeypatch.setattr("almacen_service._actualizar_estado_oc", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._upsert_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._generar_pdf_pos_entrada", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service.get_orden_compra", lambda *_a, **_k: {
        "id": 1,
        "estado": "aprobada",
        "numero_oc": 10,
        "items": [{
            "id": 5,
            "presupuesto_id": 1,
            "material_descripcion": "Arena",
            "unidad": "M3",
            "cantidad": 100,
            "cantidad_recibida": 0,
            "valor_unitario": 1000,
            "valor_recibido": 0,
        }],
    })

    create_entrada(
        1,
        1,
        {
            "orden_compra_id": 1,
            "tipo": "recibo",
            "numero_documento": "REM-456789",
            "proveedor_id": 1,
            "insumo_id": 2,
            "pk_id": "PK-1",
            "items": [{"orden_compra_item_id": 5, "cantidad_recibida": 1}],
        },
        remision_data=b"%PDF-test",
        remision_nombre="rem.pdf",
        remision_mime="application/pdf",
    )

    assert calls, "debe insertar almacen_entrada"
    assert calls[0]["tipo"] == "recibo"
    assert calls[0]["numero_documento"] == "REM-456789"


def test_create_entrada_disposicion_autonumerador(monkeypatch):
    calls = []

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            def do_insert(row):
                calls.append(row)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": 99}])))

            q.insert.side_effect = do_insert
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"disposicion_pdf_blob_path": "x.pdf"},
            ]
        elif name == "almacen_proveedor":
            q.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"id": 1},
            ]
        elif name == "almacen_entrada_item":
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
        elif name == "almacen_orden_compra_item":
            q.update.return_value.eq.return_value.execute.return_value.data = []
        else:
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
            q.select.return_value.execute.return_value.data = []
            q.update.return_value.eq.return_value.execute.return_value.data = []
        return q

    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=table))
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )
    monkeypatch.setattr("almacen_service.get_orden_compra", lambda *_a, **_k: {
        "id": 1, "estado": "aprobada", "numero_oc": 10,
        "items": [{
            "id": 5, "presupuesto_id": 1, "material_descripcion": "Arena", "unidad": "M3",
            "cantidad": 100, "cantidad_recibida": 0, "valor_unitario": 1000, "valor_recibido": 0,
        }],
    })
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 8)
    monkeypatch.setattr("almacen_service._max_numero_disposicion", lambda _cid: 2)
    monkeypatch.setattr("almacen_service._actualizar_estado_oc", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._upsert_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._generar_pdf_pos_entrada", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "almacen_service.get_entrada",
        lambda *_a, **_k: {"id": 99, "tipo": "disposicion", "numero_documento": "1614-00003"},
    )

    create_entrada(
        1,
        1,
        {
            "orden_compra_id": 1,
            "tipo": "disposicion",
            "numero_documento": "REM-IGNORAR",
            "proveedor_id": 1,
            "insumo_id": 2,
            "pk_id": "PK-1",
            "items": [{"orden_compra_item_id": 5, "cantidad_recibida": 1}],
        },
    )

    assert calls[0]["tipo"] == "disposicion"
    assert calls[0]["numero_documento"] == "1614-00003"
