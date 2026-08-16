"""Validación de ítems con descripción libre (sin insumo)."""
from unittest.mock import patch

import almacen_service as svc


def test_validate_items_payload_texto_libre_sin_insumo():
    raw = [{
        "presupuesto_id": 11,
        "presupuesto_capitulo": "1",
        "presupuesto_item": "1.01",
        "pk_id": "PK-9",
        "cantidad": 4,
        "descripcion_solicitada": "Arena de río lavada",
        "observacion_residente": "Urgente",
    }]
    ppto = {
        "id": 11,
        "capitulo": "1",
        "item": "1.01",
        "pk_id": "PK-9",
        "und": "M3",
        "cant_total": 100,
        "descripcion": "Arena",
    }
    with patch.object(svc, "_fetch_ppto_row", return_value=ppto), \
         patch("almacen_insumos_service.get_listado_precio_unitario", return_value=12000), \
         patch("almacen_insumos_service.get_presupuesto_context", return_value={
             "supera_presupuesto": False,
             "cant_presupuestada": 100,
             "vlr_unitario_cobro": 12000,
         }):
        out = svc._validate_items_payload(raw, contrato_id=1, user_id=7)
    assert len(out) == 1
    assert out[0]["descripcion_solicitada"] == "Arena de río lavada"
    assert out[0]["material_descripcion"] == "Arena de río lavada"
    assert out[0]["insumo_id"] is None
    assert out[0]["cantidad"] == 4
    assert out[0]["valor_compra_unitario"] is None


def test_validate_items_payload_exige_descripcion_minima():
    raw = [{
        "presupuesto_id": 11,
        "cantidad": 1,
        "descripcion_solicitada": "ab",
    }]
    ppto = {"id": 11, "capitulo": "1", "item": "1", "pk_id": "X", "und": "UND", "cant_total": 1}
    with patch.object(svc, "_fetch_ppto_row", return_value=ppto), \
         patch("almacen_insumos_service.get_listado_precio_unitario", return_value=0):
        try:
            svc._validate_items_payload(raw, contrato_id=1, user_id=1)
            assert False, "debía fallar"
        except ValueError as exc:
            assert "mínimo 3" in str(exc).lower() or "describa" in str(exc).lower()
