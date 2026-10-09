"""Visibilidad y precios propios de registros SicoeObra para cargo subcontratista."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_subcontratista_registros import (  # noqa: E402
    aplicar_precios_propios_sub_a_registros,
    filtrar_registros_para_sub,
    registro_pertenece_a_sub,
    registro_visible_para_sub,
    subcontratista_id_efectivo,
)


def test_id_efectivo_prioriza_registro():
    assert subcontratista_id_efectivo({"subcontratista_id": 7}, {"subcontratista_id": 9}) == 7
    assert subcontratista_id_efectivo({"subcontratista_id": None}, {"subcontratista_id": "9"}) == 9
    assert subcontratista_id_efectivo({}, {"subcontratista_id": 3}) == 3


def test_pertenece_comparacion_str_int():
    assert registro_pertenece_a_sub({"subcontratista_id": "12"}, 12) is True
    assert registro_pertenece_a_sub({"subcontratista_id": 12}, "12") is True
    assert registro_pertenece_a_sub({"subcontratista_id": 5}, 12) is False


def test_pertenece_fallback_cabecera():
    assert registro_pertenece_a_sub(
        {"subcontratista_id": None},
        8,
        {"subcontratista_id": 8},
    ) is True
    assert registro_pertenece_a_sub(
        {"subcontratista_id": None},
        8,
        {"subcontratista_id": 9},
    ) is False


def test_visible_requiere_objeto_pago():
    reg = {"subcontratista_id": 1, "nivel2_objeto_pago_sub": True}
    assert registro_visible_para_sub(reg, 1) is True
    assert registro_visible_para_sub({**reg, "nivel2_objeto_pago_sub": False}, 1) is False
    assert registro_visible_para_sub({**reg, "nivel2_objeto_pago_sub": None}, 1) is False


def test_filtrar_mezcla():
    regs = [
        {"id": 1, "subcontratista_id": 5, "nivel2_objeto_pago_sub": True},
        {"id": 2, "subcontratista_id": 5, "nivel2_objeto_pago_sub": False},
        {"id": 3, "subcontratista_id": 9, "nivel2_objeto_pago_sub": True},
        {"id": 4, "subcontratista_id": None, "nivel2_objeto_pago_sub": True},
    ]
    out = filtrar_registros_para_sub(regs, 5, {"subcontratista_id": 5})
    assert [r["id"] for r in out] == [1, 4]


def test_aplicar_precios_propios_sin_contrato():
    regs = [
        {
            "item_numero": "1.01",
            "capitulo": "1",
            "cantidad_total": 2,
            "vlr_unitario": 999999,
            "costo_directo": 999999,
        }
    ]
    out = aplicar_precios_propios_sub_a_registros(
        regs,
        vu_por_item={"1.01": 1000},
        vu_por_cap_item={("1", "1.01"): 1000},
    )
    assert out[0]["vlr_unitario"] == 1000
    assert out[0]["costo_directo"] == 2000
    assert out[0]["precio_fuente"] == "subcontratista_precios"
    assert regs[0]["vlr_unitario"] == 999999  # original intacto


def test_aplicar_precios_sin_pacto_no_filtra_contrato():
    regs = [{"item_numero": "9.9", "cantidad_total": 3, "vlr_unitario": 50, "costo_directo": 150}]
    out = aplicar_precios_propios_sub_a_registros(regs, vu_por_item={})
    assert out[0]["vlr_unitario"] is None
    assert out[0]["costo_directo"] is None
    assert out[0]["sin_precio"] is True
