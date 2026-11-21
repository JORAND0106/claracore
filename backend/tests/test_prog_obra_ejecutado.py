"""Ejecutado programación: SicoeObra con ítem asignado (excl. rechazados)."""
from unittest.mock import patch

from prog_obra_ejecutado import (
    _registro_rechazado,
    _registros_ejecutables,
    _tiene_item_cobro,
    fetch_ejecutado_mensual,
    fetch_ejecutado_resumen,
)


def test_tiene_item_cobro():
    assert _tiene_item_cobro({"item_numero": "2.1.1"}) is True
    assert _tiene_item_cobro({"item_numero": ""}) is False
    assert _tiene_item_cobro({}) is False


def test_registro_rechazado_cualquier_nivel():
    assert _registro_rechazado({"nivel1_estado": "Rechazado"}) is True
    assert _registro_rechazado({"nivel3_estado": "rechazado"}) is True
    assert _registro_rechazado({"estado": "Rechazado"}) is True
    assert _registro_rechazado({"nivel1_estado": "Aprobado", "nivel2_estado": "Pendiente"}) is False


def test_registros_ejecutables_incluye_sin_validar_excluye_rechazados_y_sin_item():
    rows = [
        {"item_numero": "1.1", "nivel1_estado": "Pendiente", "cantidad_total": 10},
        {"item_numero": "1.1", "nivel1_estado": "Aprobado", "cantidad_total": 5},
        {"item_numero": "1.1", "nivel1_estado": "Rechazado", "cantidad_total": 99},
        {"item_numero": "", "nivel1_estado": "Aprobado", "cantidad_total": 7},
        {"item_numero": None, "cantidad_total": 3},
    ]
    out = _registros_ejecutables(rows)
    assert len(out) == 2
    assert all(_tiene_item_cobro(r) for r in out)
    assert all(not _registro_rechazado(r) for r in out)


def test_fetch_ejecutado_mensual_usa_listado_y_fecha_reporte():
    rows = [
        {
            "item_numero": "2.1",
            "capitulo": "2. CAP",
            "cantidad_total": 10,
            "fecha": "2026-06-15",
            "nivel1_estado": "Pendiente",
            "pk_ids": {"pk_id": "120367"},
        },
        {
            "item_numero": "2.1",
            "capitulo": "2. CAP",
            "cantidad_total": 5,
            "fecha": "2026-06-20",
            "nivel1_estado": "Rechazado",
            "pk_ids": {"pk_id": "120367"},
        },
        {
            "item_numero": "",
            "capitulo": "2. CAP",
            "cantidad_total": 100,
            "fecha": "2026-06-18",
            "pk_ids": {"pk_id": "120367"},
        },
    ]
    calls = {"n": 0}

    class _Q:
        def table(self, *_a, **_k):
            return self

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def range(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return type("R", (), {"data": rows if calls["n"] == 1 else []})()

    from sicoe_valor_canonico import cap_item_key

    k = cap_item_key("2. CAP", "2.1")
    with patch(
        "prog_obra_ejecutado.load_listado_vu_by_cap_item",
        return_value={k: {"vlr_unitario": 50}},
    ):
        monthly, total = fetch_ejecutado_mensual(_Q(), 3)
    # Solo 10 × 50 = 500 (rechazado y sin ítem excluidos)
    assert total == 500.0
    assert monthly.get("2026-06") == 500.0


def test_fetch_ejecutado_resumen_criterio():
    with patch("prog_obra_ejecutado.resolve_ppto_vigente_version_id", return_value="vid"), patch(
        "prog_obra_costos_presupuesto.ppto_scope_direct_total", return_value=1000.0
    ), patch(
        "prog_obra_ejecutado._aggregate_ejecutado_por_capitulo",
        return_value={"1. CAP": 250.0},
    ), patch(
        "prog_obra_ejecutado.fetch_ejecutado_mensual",
        return_value=({"2026-06": 250.0}, 250.0),
    ):
        out = fetch_ejecutado_resumen(object(), 3)
    assert out["ejecutado_total"] == 250.0
    assert out["porcentaje"] == 25.0
    assert out["criterio"] == "item_asignado_no_rechazado"
