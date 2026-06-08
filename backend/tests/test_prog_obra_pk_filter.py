"""Tests filtro opcional por PK en exportaciones y curva S."""
from prog_obra_pk_filter import filter_nodes_by_pk, parse_pk_ids_param


def test_parse_pk_ids_param_empty():
    assert parse_pk_ids_param(None) is None
    assert parse_pk_ids_param("") is None
    assert parse_pk_ids_param("  ,  ") is None


def test_parse_pk_ids_param_list():
    assert parse_pk_ids_param("120114,120123") == {"120114", "120123"}
    assert parse_pk_ids_param(" 120114 , 120123 ") == {"120114", "120123"}


def test_filter_nodes_by_pk():
    nodes = {
        "a": {"pk_id": "120114", "label": "A"},
        "b": {"pk_id": "120123", "label": "B"},
        "c": {"pk_id": "120241", "label": "C"},
    }
    filtered = filter_nodes_by_pk(nodes, {"120114", "120123"})
    assert set(filtered.keys()) == {"a", "b"}
    assert filter_nodes_by_pk(nodes, None) == nodes
