"""create_entrada debe persistir pk_id enriquecido desde solicitud/OC."""
from unittest.mock import MagicMock

import pytest

from almacen_service import create_entrada


@pytest.fixture(autouse=True)
def _segmento_contrato_1614(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )


def test_create_entrada_oc_persiste_pk_id_desde_solicitud(monkeypatch):
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
    monkeypatch.setattr(
        "almacen_service.get_orden_compra",
        lambda *_a, **_k: {
            "id": 2,
            "estado": "aprobada",
            "numero_oc": 2,
            "items": [{
                "id": 3,
                "presupuesto_id": 1,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "cantidad": 100,
                "cantidad_recibida": 0,
                "valor_unitario": 1000,
                "valor_recibido": 0,
                "solicitud_item_id": 8,
                "almacen_solicitud_item": {
                    "pk_id": "120350",
                    "tramo": "TRAMO 5",
                    "costado": "Central",
                    "abscisa_inicial": "11880.86",
                    "abscisa_final": "11880.86",
                },
            }],
        },
    )

    create_entrada(
        3,
        1,
        {
            "orden_compra_id": 2,
            "tipo": "recibo",
            "numero_documento": "REM-001",
            "items": [{"orden_compra_item_id": 3, "cantidad_recibida": 10}],
        },
        remision_data=b"%PDF-test",
        remision_nombre="rem.pdf",
        remision_mime="application/pdf",
    )

    assert calls, "debe insertar almacen_entrada"
    assert calls[0]["pk_id"] == "120350"
    assert calls[0]["tramo"] == "TRAMO 5"
