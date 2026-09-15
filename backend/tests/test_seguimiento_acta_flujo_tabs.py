"""Flujo secuencial de pestañas y reserva de orden del día."""
from __future__ import annotations

import pytest

import seguimiento_service as svc


def test_norm_y_merge_flujo_tabs():
    # Vacío / null → legacy liberado
    assert svc._norm_flujo_tabs(None)["liberado"] is True
    assert svc._norm_flujo_tabs({})["liberado"] is True
    assert svc._norm_flujo_tabs("{}")["liberado"] is True

    n = svc._norm_flujo_tabs({"orden": True, "ideas": 1, "x": True, "v": 1})
    assert n["orden"] is True
    assert n["ideas"] is True
    assert n["asistentes"] is False
    assert n["liberado"] is True
    assert n["v"] == 1

    assert svc._norm_flujo_tabs({"liberado": True})["liberado"] is True

    nueva = svc._flujo_inicial_nueva_acta()
    assert nueva["v"] == 1
    assert nueva["liberado"] is False
    assert nueva["orden"] is False

    merged = svc._merge_flujo_tabs(
        {"v": 1, "orden": True},
        {"asistentes": True, "orden": False},
    )
    assert merged["orden"] is True  # no se revierte
    assert merged["asistentes"] is True
    assert merged["v"] == 1

    merged_lib = svc._merge_flujo_tabs({"v": 1, "orden": True}, {"liberado": True})
    assert merged_lib["liberado"] is True
    assert merged_lib["orden"] is True

    # Merge no libera por incoming vacío
    merged_empty = svc._merge_flujo_tabs({"v": 1, "orden": True}, {})
    assert merged_empty["liberado"] is False
    assert merged_empty["orden"] is True


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
        "flujo_tabs": {"v": 1, "orden": True},
    })
    assert row["flujo_tabs"]["orden"] is True
    assert row["flujo_tabs"]["asistentes"] is False
    assert row["flujo_tabs"]["liberado"] is False

    legacy = svc._enrich_acta_row({
        "orden_del_dia": "[]",
        "tipo_acta": "interna",
        "estado": "borrador",
        "flujo_tabs": {},
    })
    assert legacy["flujo_tabs"]["liberado"] is True

    legacy_flag = svc._enrich_acta_row({
        "orden_del_dia": "[]",
        "tipo_acta": "interna",
        "estado": "borrador",
        "flujo_tabs": {"liberado": True},
    })
    assert legacy_flag["flujo_tabs"]["liberado"] is True


def test_enrich_lee_flujo_embebido_en_orden():
    import json
    wrapped = json.dumps({
        "v": 3,
        "orden": [{"texto": "Punto", "hecho": False}],
        "flujo_tabs": {"v": 1, "orden": True, "liberado": False},
    })
    row = svc._enrich_acta_row({
        "orden_del_dia": wrapped,
        "tipo_acta": "interna",
        "estado": "borrador",
        "flujo_tabs": {},
    })
    assert row["flujo_tabs"]["orden"] is True
    assert row["flujo_tabs"]["liberado"] is False


def test_assert_puede_reservar_orden_asistente(monkeypatch):
    acta = {"id": 5, "elaborador_id": 10, "estado": "borrador"}
    monkeypatch.setattr(svc, "_usuario_es_asistente_registrado", lambda *_a, **_k: True)
    monkeypatch.setattr(svc, "_acta_esta_sellada", lambda *_a, **_k: False)
    svc._assert_puede_reservar_orden_acta(None, acta, 20, {"rol_nombre": "Operativo"})

    monkeypatch.setattr(svc, "_usuario_es_asistente_registrado", lambda *_a, **_k: False)
    with pytest.raises(ValueError, match="invitado"):
        svc._assert_puede_reservar_orden_acta(None, acta, 99, {"rol_nombre": "Operativo"})
