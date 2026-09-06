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
        "contrato_id": 1,
    }

    def _flags(contrato_id, items, exclude_solicitud_id=None, descontar_linea_actual=True, **_kw):
        for it in items:
            it["vlr_unitario_cobro"] = 12000
            it["supera_presupuesto"] = False
            it["supera_negociado"] = False

    with patch.object(svc, "_fetch_ppto_rows_batch", return_value={11: ppto}), \
         patch("almacen_insumos_service.apply_saldo_flags_batch", side_effect=_flags) as flags_mock:
        out = svc._validate_items_payload(raw, contrato_id=1, user_id=7)
    assert len(out) == 1
    assert out[0]["descripcion_solicitada"] == "Arena de río lavada"
    assert out[0]["material_descripcion"] == "Arena de río lavada"
    assert out[0]["insumo_id"] is None
    assert out[0]["cantidad"] == 4
    assert out[0]["valor_compra_unitario"] is None
    assert out[0]["vlr_unitario_cobro"] == 12000
    assert flags_mock.call_args.kwargs.get("refresh_listado") is False


def test_validate_items_payload_exige_descripcion_minima():
    raw = [{
        "presupuesto_id": 11,
        "cantidad": 1,
        "descripcion_solicitada": "ab",
    }]
    ppto = {
        "id": 11, "capitulo": "1", "item": "1", "pk_id": "X",
        "und": "UND", "cant_total": 1, "contrato_id": 1,
    }
    with patch.object(svc, "_fetch_ppto_rows_batch", return_value={11: ppto}):
        try:
            svc._validate_items_payload(raw, contrato_id=1, user_id=1)
            assert False, "debía fallar"
        except ValueError as exc:
            assert "mínimo 3" in str(exc).lower() or "describa" in str(exc).lower()


def test_validate_items_payload_alto_volumen_una_pasada_batch():
    """50 líneas texto libre: un solo batch de presupuesto + un apply_saldo_flags."""
    raw = []
    ppto_map = {}
    for i in range(50):
        pid = 100 + i
        raw.append({
            "presupuesto_id": pid,
            "presupuesto_capitulo": "1",
            "presupuesto_item": f"1.{i:02d}",
            "pk_id": f"PK-{i}",
            "cantidad": 1,
            "descripcion_solicitada": f"Material solicitado número {i}",
        })
        ppto_map[pid] = {
            "id": pid,
            "capitulo": "1",
            "item": f"1.{i:02d}",
            "pk_id": f"PK-{i}",
            "und": "UND",
            "cant_total": 1000,
            "contrato_id": 1,
        }

    calls = {"flags": 0}

    def _flags(*_a, **_k):
        calls["flags"] += 1

    with patch.object(svc, "_fetch_ppto_rows_batch", return_value=ppto_map) as batch_ppto, \
         patch("almacen_insumos_service.apply_saldo_flags_batch", side_effect=_flags) as flags_mock:
        out = svc._validate_items_payload(raw, contrato_id=1, user_id=7)
    assert len(out) == 50
    assert batch_ppto.call_count == 1
    assert calls["flags"] == 1
    assert flags_mock.call_args.kwargs.get("refresh_listado") is False
