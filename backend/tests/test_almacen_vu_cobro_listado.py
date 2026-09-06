"""Lookup robusto de VU cobro en listado (NP-01 y variantes)."""
from __future__ import annotations

from unittest.mock import MagicMock

import almacen_insumos_service as insumos


def _mock_listado(monkeypatch, rows):
    insumos.clear_listado_cache()
    calls = {"n": 0}

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return MagicMock(data=rows)

    class _Sb:
        def table(self, _name):
            return _Q()

    monkeypatch.setattr(insumos, "_sb", lambda: _Sb())
    return calls


def test_item_key_variants_np():
    variants = insumos._item_key_variants("NP-01")
    assert "np-01" in variants
    assert "np.01" in variants
    assert "np01" in variants


def test_lookup_por_capitulo_item(monkeypatch):
    _mock_listado(monkeypatch, [
        {"capitulo": "9. NO PREVISTOS", "item_numero": "NP-01", "precio_unitario": 12500, "estado_precio": "Aprobado"},
    ])
    assert insumos.get_listado_precio_unitario(1, "9. NO PREVISTOS", "NP-01") == 12500


def test_lookup_variante_guion_punto(monkeypatch):
    _mock_listado(monkeypatch, [
        {"capitulo": "NP", "item_numero": "NP.01", "precio_unitario": 8800, "estado_precio": "Aprobado"},
    ])
    # Solicitud guarda NP-01; listado tiene NP.01
    assert insumos.get_listado_precio_unitario(1, "NP", "NP-01") == 8800


def test_lookup_fallback_item_unico_otro_capitulo(monkeypatch):
    _mock_listado(monkeypatch, [
        {"capitulo": "NO PREVISTOS", "item_numero": "NP-01", "precio_unitario": 15000, "estado_precio": "Aprobado"},
    ])
    # Capítulo distinto al del presupuesto/solicitud
    assert insumos.get_listado_precio_unitario(1, "9. NO PREVISTOS", "NP-01") == 15000
    det = insumos.lookup_listado_precio_detalle(1, "9. NO PREVISTOS", "NP-01")
    assert det["encontrado"] is True
    assert det["match"] in ("item_unico", "item_capitulo_parcial")


def test_resolver_pendiente_aprobacion_sin_precio(monkeypatch):
    _mock_listado(monkeypatch, [
        {"capitulo": "NP", "item_numero": "NP-01", "precio_unitario": None, "estado_precio": "Pendiente"},
    ])
    res = insumos.resolver_vlr_cobro_listado(1, "NP", "NP-01")
    assert res["vlr_unitario_cobro"] == 0
    assert res["cobro_motivo"] == "pendiente_aprobacion"


def test_analisis_valor_incluye_motivo():
    av = insumos._build_analisis_valor(2, 100, 0, cobro_motivo="sin_valor_listado")
    assert av["valor_cobro_unitario"] is None
    assert av["cobro_motivo"] == "sin_valor_listado"
    av2 = insumos._build_analisis_valor(2, 100, 50)
    assert av2["valor_cobro_unitario"] == 50
    assert av2["cobro_motivo"] is None
