"""Verificación panel SICOE vs KPI: no debe consultar RPC/VM legacy."""
from __future__ import annotations

import ast
from pathlib import Path


def _verificacion_fn_source() -> str:
    src = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
    start = src.index("def _sicoe_analisis_verificacion_totales(")
    # hasta la siguiente def al mismo nivel (columna 0)
    rest = src[start + 1 :]
    end_rel = rest.index("\ndef ")
    return src[start : start + 1 + end_rel]


def test_verificacion_ya_no_llama_rpc_ni_vm_legacy():
    body = _verificacion_fn_source()
    assert "_dashboard_scan_sicoe_by_item" in body
    assert "sicoe_costo_aprobado_nivel" in body
    assert "_fetch_dashboard_resumen_sicoe_agg" not in body
    assert "vm_dashboard" not in body


def test_delta_historico_documentado():
    """El Δ que veía el usuario: panel canónico − KPI VM legacy."""
    assert 78_318_891 - 76_788_964 == 1_529_927


def test_frontend_aviso_distingue_coincide_vs_filtros():
    app = Path(__file__).resolve().parents[2].joinpath("frontend/src/App.jsx").read_text(
        encoding="utf-8"
    )
    assert "✓ coincide" in app
    assert "revisar filtros del panel" in app
    # Ya no muestra Δ en amarillo sin contexto cuando coincide
    assert "coherente_dashboard" in app
