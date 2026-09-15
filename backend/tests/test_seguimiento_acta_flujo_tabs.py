"""Flujo secuencial de pestañas y reserva de orden del día."""
from __future__ import annotations

import pytest

import seguimiento_service as svc


def test_norm_y_merge_flujo_tabs():
    assert svc._norm_flujo_tabs(None) == {
        "orden": False,
        "asistentes": False,
        "compromisos": False,
        "ideas": False,
    }
    assert svc._norm_flujo_tabs({"orden": True, "ideas": 1, "x": True})["orden"] is True
    assert svc._norm_flujo_tabs({"orden": True, "ideas": 1, "x": True})["ideas"] is True
    assert svc._norm_flujo_tabs({"orden": True, "ideas": 1, "x": True})["asistentes"] is False

    merged = svc._merge_flujo_tabs(
        {"orden": True},
        {"asistentes": True, "orden": False},
    )
    assert merged["orden"] is True  # no se revierte
    assert merged["asistentes"] is True


def test_normalize_orden_items_conserva_expositor():
    out = svc._normalize_orden_items_for_storage([
        {
            "texto": "Punto A",
            "hecho": False,
            "expositor_nombre": "Ana",
            "expositor_usuario_id": 7,
        },
        {"texto": "  ", "hecho": False},
        "legacy",
    ])
    assert out[0]["expositor_nombre"] == "Ana"
    assert out[0]["expositor_usuario_id"] == 7
    assert out[1] == "legacy"


def test_es_patch_reserva_orden():
    assert svc._es_patch_reserva_orden({"orden_del_dia": [{"texto": "A"}]}) is True
    assert svc._es_patch_reserva_orden({
        "orden_del_dia": [],
        "flujo_tabs": {"orden": True},
    }) is True
    assert svc._es_patch_reserva_orden({
        "orden_del_dia": [],
        "asistentes": [{"nombre": "X"}],
    }) is False
    assert svc._es_patch_reserva_orden({"ubicacion": "Sala"}) is False


def test_enrich_acta_incluye_flujo_tabs():
    row = svc._enrich_acta_row({
        "orden_del_dia": '[{"texto":"A","hecho":false}]',
        "tipo_acta": "interna",
        "estado": "borrador",
        "flujo_tabs": {"orden": True},
    })
    assert row["flujo_tabs"]["orden"] is True
    assert row["flujo_tabs"]["asistentes"] is False


def test_assert_puede_reservar_orden_asistente(monkeypatch):
    acta = {"id": 5, "elaborador_id": 10, "estado": "borrador"}
    monkeypatch.setattr(svc, "_usuario_es_asistente_registrado", lambda *_a, **_k: True)
    monkeypatch.setattr(svc, "_acta_esta_sellada", lambda *_a, **_k: False)
    svc._assert_puede_reservar_orden_acta(None, acta, 20, {"rol_nombre": "Operativo"})

    monkeypatch.setattr(svc, "_usuario_es_asistente_registrado", lambda *_a, **_k: False)
    with pytest.raises(ValueError, match="invitado"):
        svc._assert_puede_reservar_orden_acta(None, acta, 99, {"rol_nombre": "Operativo"})
