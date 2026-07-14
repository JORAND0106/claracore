"""Códigos Ent-/Sal- y agregados de inventario."""
from almacen_inventario_graficos import (
    _cache_key,
    _norm_filter,
    invalidar_cache_inventario_graficos,
)
from almacen_service import (
    _format_codigo_entrada,
    _format_codigo_salida,
    _asegurar_codigo_entrada,
    _asegurar_codigo_salida,
)


def test_format_codigo_entrada():
    assert _format_codigo_entrada(10, 1) == "Ent-10-00001"


def test_format_codigo_salida():
    assert _format_codigo_salida(10, 42) == "Sal-10-00042"


def test_asegurar_codigo_entrada_usa_existente():
    row = {"codigo": "Ent-1614-00099", "numero_entrada": 99}
    assert _asegurar_codigo_entrada(1, row)["codigo"] == "Ent-1614-00099"


def test_asegurar_codigo_entrada_genera():
    row = {"numero_entrada": 3}
    out = _asegurar_codigo_entrada(10, row)
    assert out["codigo"] == "Ent-10-00003"


def test_asegurar_codigo_salida_genera():
    row = {"numero_salida": 7}
    out = _asegurar_codigo_salida(10, row)
    assert out["codigo"] == "Sal-10-00007"


def test_inventario_graficos_cache_key_incluye_filtros():
    assert _cache_key(5, None, None) == (5, "", "")
    assert _cache_key(5, "Cap 1", "1.1") == (5, "Cap 1", "1.1")
    assert _norm_filter("  x ") == "x"


def test_invalidar_cache_inventario_por_contrato():
    invalidar_cache_inventario_graficos()
    invalidar_cache_inventario_graficos(99)
