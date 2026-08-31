"""Bloqueo de Ítem/Capítulo/Competencia/Corte para permiso solo Crear (dims)."""
from __future__ import annotations

from sicoe_creador_permisos import (
    SICOE_CAMPOS_DIMENSIONALES,
    SICOE_CAMPOS_GRAFICO,
    SICOE_CAMPOS_PERMITIDOS_CREADOR,
    sicoe_put_keys_prohibidas_creador_dims,
    sicoe_valores_put_equivalentes,
)


def test_eco_item_sin_cambio_no_es_prohibido():
    prev = {"item_numero": "1.01", "capitulo": "I", "longitud": 10}
    data = {"item_numero": "1.01", "longitud": 12}
    keys = set(data.keys())
    prohibidos = sicoe_put_keys_prohibidas_creador_dims(keys, data, prev)
    assert "item_numero" not in data  # eco eliminado
    assert prohibidos == set()
    assert data.get("longitud") == 12


def test_cambio_item_es_prohibido():
    prev = {"item_numero": "1.01", "longitud": 10}
    data = {"item_numero": "2.02", "longitud": 10}
    keys = set(data.keys())
    prohibidos = sicoe_put_keys_prohibidas_creador_dims(keys, data, prev)
    assert "item_numero" in prohibidos


def test_cambio_corte_y_competencia_prohibidos():
    prev = {"corte_id": 5, "competencia": "A", "ancho": 1}
    data = {"corte_id": 9, "competencia": "B", "ancho": 2}
    keys = set(data.keys())
    prohibidos = sicoe_put_keys_prohibidas_creador_dims(keys, data, prev)
    assert "corte_id" in prohibidos
    assert "competencia" in prohibidos
    assert "ancho" not in prohibidos
    assert data.get("ancho") == 2


def test_dims_permitidos_completos():
    prev = {k: 1 for k in SICOE_CAMPOS_DIMENSIONALES}
    data = {k: 2 for k in ("longitud", "ancho", "espesor", "cantidad", "cantidad_total", "observacion")}
    keys = set(data.keys())
    assert sicoe_put_keys_prohibidas_creador_dims(keys, data, prev) == set()


def test_grafico_permitido_para_creador():
    prev = {"grafico_url": "https://old", "grafico_numero": 1, "graficos_historial": []}
    data = {
        "grafico_url": "https://new",
        "grafico_numero": 2,
        "graficos_historial": [{"url": "https://new", "numero": 2}],
    }
    keys = set(data.keys())
    assert sicoe_put_keys_prohibidas_creador_dims(keys, data, prev) == set()
    assert data["grafico_url"] == "https://new"


def test_foto_sigue_prohibida_para_creador():
    prev = {"foto_url": "https://old", "grafico_url": "https://g1"}
    data = {"foto_url": "https://new", "grafico_url": "https://g2"}
    keys = set(data.keys())
    prohibidos = sicoe_put_keys_prohibidas_creador_dims(keys, data, prev)
    assert "foto_url" in prohibidos
    assert "grafico_url" not in prohibidos


def test_permitidos_creador_incluye_grafico_no_foto():
    assert SICOE_CAMPOS_GRAFICO <= SICOE_CAMPOS_PERMITIDOS_CREADOR
    assert "foto_url" not in SICOE_CAMPOS_PERMITIDOS_CREADOR
    assert "foto_numero" not in SICOE_CAMPOS_PERMITIDOS_CREADOR


def test_equivalencia_null_y_vacio():
    assert sicoe_valores_put_equivalentes(None, None)
    assert sicoe_valores_put_equivalentes(None, "")
    assert sicoe_valores_put_equivalentes("1.0", 1)
    assert not sicoe_valores_put_equivalentes("1.01", "2.02")
