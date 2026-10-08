"""Filtro SicoeObra «Editado por»: normalización y coincidencia de líneas."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_filtro_editado_por import (  # noqa: E402
    normalize_editado_por_ids,
    registro_coincide_editado_por,
    union_reporte_ids,
)


def test_normalize_json_lista():
    assert normalize_editado_por_ids('[1, 2, 2, "3"]') == [1, 2, 3]


def test_normalize_legacy_id():
    assert normalize_editado_por_ids(None, 7) == [7]
    assert normalize_editado_por_ids("", 7) == [7]


def test_normalize_ignora_cero_y_basura():
    assert normalize_editado_por_ids('[0, -1, "x", 4]') == [4]
    assert normalize_editado_por_ids("no-json") == []


def test_union_reporte_ids():
    assert union_reporte_ids([1, 2], [2, 3, "4"]) == [1, 2, 3, 4]
    assert union_reporte_ids([], []) == []


def test_registro_coincide_editado_por():
    assert registro_coincide_editado_por({"modificado_por_reg": 9}, [9, 10]) is True
    assert registro_coincide_editado_por({"modificado_por_reg": 8}, [9, 10]) is False
    assert registro_coincide_editado_por({}, [9]) is False
    assert registro_coincide_editado_por({"modificado_por_reg": 9}, []) is False
