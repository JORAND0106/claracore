"""Bloqueo de remisión repetida (mismo proveedor): lookup + ruta."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

import almacen_service as svc


def test_lookup_entrada_por_numero_remision_por_proveedor_id(monkeypatch):
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = MagicMock(
        data=[{
            "id": 42,
            "numero_documento": "REM-100",
            "codigo": "Ent-1614-00007",
            "numero_entrada": 7,
            "proveedor_id": 5,
            "proveedor_nombre_texto": None,
            "tipo": "recibo",
        }],
    )
    monkeypatch.setattr(svc, "_sb", lambda: sb)
    monkeypatch.setattr(
        svc,
        "_format_codigo_entrada",
        lambda _cid, n: f"Ent-1614-{int(n):05d}",
    )

    hit = svc.lookup_entrada_por_numero_remision(
        1, " rem-100 ", proveedor_id=5, proveedor_nombre=None,
    )
    assert hit is not None
    assert hit["entrada_id"] == 42
    assert hit["codigo_entrada"] == "Ent-1614-00007"
    assert hit["numero_documento"] == "REM-100"


def test_lookup_sin_numero_devuelve_none(monkeypatch):
    monkeypatch.setattr(svc, "_sb", lambda: (_ for _ in ()).throw(AssertionError("no db")))
    assert svc.lookup_entrada_por_numero_remision(1, "   ", proveedor_id=1) is None


def test_ruta_check_numero_remision_registrada():
    routes = Path(__file__).resolve().parents[1].joinpath("almacen_routes.py").read_text(encoding="utf-8")
    assert "check-numero-remision" in routes
    assert "lookup_entrada_por_numero_remision" in routes
