"""Ejecutado programación: regla nivel 1 SICOE."""
from datetime import date

from prog_obra_ejecutado import (
    _estado_nivel1_aprobado,
    _linea_costo_registro,
    build_ejecucion_resumen,
    fetch_ejecutado_nivel1_mensual,
)


def test_nivel1_aprobado_solo_inspector():
    assert _estado_nivel1_aprobado("Aprobado") is True
    assert _estado_nivel1_aprobado("Pendiente") is False
    assert _estado_nivel1_aprobado(None) is False


def test_linea_costo_fallback_cantidad_vlr():
    assert _linea_costo_registro({"costo_directo": 100}) == 100.0
    assert _linea_costo_registro({"cantidad_total": 10, "vlr_unitario": 5}) == 50.0


def test_fetch_ejecutado_nivel1_ignora_sin_n1():
    rows = [
        {
            "costo_directo": 100,
            "nivel1_estado": "Aprobado",
            "nivel1_fecha": "2026-06-15",
            "pk_ids": {"pk_id": "120367"},
        },
        {
            "costo_directo": 200,
            "nivel1_estado": "Pendiente",
            "nivel2_estado": "Aprobado",
            "nivel2_fecha": "2026-06-20",
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

    monthly, total = fetch_ejecutado_nivel1_mensual(_Q(), 3)
    assert total == 100.0
    assert monthly.get("2026-06") == 100.0


def test_build_ejecucion_resumen_pct():
    from unittest.mock import patch

    with patch("prog_obra_ejecutado.resolve_ppto_vigente_version_id", return_value="vid"), patch(
        "prog_obra_ejecutado.ppto_scope_direct_total", return_value=1000.0
    ), patch(
        "prog_obra_ejecutado._aggregate_presupuesto_por_capitulo",
        return_value={"1. CAP": 1000.0},
    ), patch(
        "prog_obra_ejecutado._aggregate_ejecutado_por_capitulo",
        return_value={"1. CAP": 250.0},
    ), patch(
        "prog_obra_ejecutado.fetch_ejecutado_nivel1_mensual",
        return_value=({"2026-06": 250.0}, 250.0),
    ):
        out = build_ejecucion_resumen(object(), 3)
    assert out["ejecutado_pct"] == 25.0
    assert out["por_capitulo"][0]["ejecutado_pct"] == 25.0
