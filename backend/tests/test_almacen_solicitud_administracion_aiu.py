"""Líneas de solicitud Administración (AIU) sin presupuesto de obra."""
from unittest.mock import patch

import almacen_service as svc


def test_is_administracion_aiu():
    assert svc.is_administracion_aiu(svc.CAPITULO_ADMINISTRACION_AIU) is True
    assert svc.is_administracion_aiu("1. PRELIMINARES") is False
    assert svc.is_administracion_aiu("1.", svc.CAPITULO_ADMINISTRACION_AIU) is True


def test_validate_items_payload_aiu_sin_presupuesto_id():
    raw = [{
        "presupuesto_capitulo": svc.CAPITULO_ADMINISTRACION_AIU,
        "presupuesto_item": svc.CAPITULO_ADMINISTRACION_AIU,
        "pk_id": "PK-9",
        "cantidad": 4,
        "descripcion_solicitada": "Papelería de oficina",
        "observacion_residente": "Admin",
    }]

    def _flags(contrato_id, items, exclude_solicitud_id=None, descontar_linea_actual=True, **_kw):
        for it in items:
            it.setdefault("supera_presupuesto", False)
            it.setdefault("supera_negociado", False)

    with patch("almacen_insumos_service.apply_saldo_flags_batch", side_effect=_flags):
        out = svc._validate_items_payload(raw, contrato_id=1, user_id=7)

    assert len(out) == 1
    assert out[0]["presupuesto_id"] is None
    assert out[0]["capitulo"] == svc.CAPITULO_ADMINISTRACION_AIU
    assert out[0]["item"] == svc.CAPITULO_ADMINISTRACION_AIU
    assert out[0]["supera_presupuesto"] is False
    assert out[0]["descripcion_solicitada"] == "Papelería de oficina"
    assert out[0]["cant_presupuestada"] is None


def test_item_for_db_insert_aiu_limpia_presupuesto_id():
    row = svc._item_for_db_insert({
        "capitulo": svc.CAPITULO_ADMINISTRACION_AIU,
        "item": svc.CAPITULO_ADMINISTRACION_AIU,
        "presupuesto_id": 99,
        "pk_id": "PK-1",
        "material_descripcion": "Toner",
        "unidad": "UND",
        "cantidad": 1,
        "es_principal": True,
        "supera_presupuesto": True,
        "cant_presupuestada": 10,
    })
    assert row["presupuesto_id"] is None
    assert row["supera_presupuesto"] is False
    assert row["cant_presupuestada"] is None


def test_humanize_null_presupuesto_id_apunta_sql_aiu():
    msg = svc._humanize_solicitud_db_error(
        Exception('null value in column "presupuesto_id" violates not-null constraint')
    )
    assert "almacen_solicitud_administracion_aiu.sql" in msg
