"""Persistencia de es_principal — coerce y columnas críticas."""
from almacen_service import (
    _SOLICITUD_ITEM_CRITICAL_COLUMNS,
    _coerce_es_principal,
    _humanize_solicitud_db_error,
    _item_for_db_insert,
)


def test_coerce_es_principal_false_variants():
    assert _coerce_es_principal(False) is False
    assert _coerce_es_principal("false") is False
    assert _coerce_es_principal("0") is False
    assert _coerce_es_principal("f") is False
    assert _coerce_es_principal(0) is False


def test_coerce_es_principal_true_default():
    assert _coerce_es_principal(True) is True
    assert _coerce_es_principal(None) is True
    assert _coerce_es_principal("true") is True
    assert _coerce_es_principal(1) is True


def test_item_for_db_insert_persists_asociado():
    row = _item_for_db_insert({
        "presupuesto_id": 1,
        "cantidad": 2,
        "material_descripcion": "Pines",
        "unidad": "UND",
        "es_principal": False,
        "contexto_presupuesto": {"x": 1},
    })
    assert row["es_principal"] is False
    assert "contexto_presupuesto" not in row


def test_item_for_db_insert_string_false():
    row = _item_for_db_insert({
        "presupuesto_id": 1,
        "cantidad": 2,
        "material_descripcion": "X",
        "es_principal": "false",
    })
    assert row["es_principal"] is False


def test_es_principal_is_critical_column():
    assert "es_principal" in _SOLICITUD_ITEM_CRITICAL_COLUMNS


def test_humanize_es_principal_migration():
    class Exc(Exception):
        pass

    msg = _humanize_solicitud_db_error(
        Exc("Could not find the 'es_principal' column of 'almacen_solicitud_item' in the schema cache")
    )
    assert "es_principal" in msg
    assert "almacen_solicitud_es_principal.sql" in msg
