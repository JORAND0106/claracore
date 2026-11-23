"""Regresión: no pedir presupuesto_item_id_origen en tabla viva presupuesto."""

from presupuesto_versiones_service import _sanitize_select_for_tabla


def test_sanitize_quita_origen_en_presupuesto_vivo():
    sel = (
        "id,presupuesto_item_id_origen,pk_id,capitulo,item,"
        "cant_total,vlr_unitario,costo_directo,tramo,abs_inicio,abs_final"
    )
    out = _sanitize_select_for_tabla(sel, "presupuesto")
    assert "presupuesto_item_id_origen" not in out
    assert "pk_id" in out
    assert "abs_inicio" in out


def test_sanitize_conserva_origen_en_snapshot():
    sel = "id,presupuesto_item_id_origen,pk_id,capitulo,item"
    out = _sanitize_select_for_tabla(sel, "presupuesto_version_items")
    assert "presupuesto_item_id_origen" in out
