"""Galería del módulo: listado de soportes de entradas (en uso)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import almacen_service as svc


def test_list_entrada_soportes_galeria_marca_en_uso(monkeypatch):
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.not_ = MagicMock()
    chain.not_.is_.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = MagicMock(
        data=[{
            "id": 9,
            "codigo": "Ent-1614-00009",
            "numero_entrada": 9,
            "fecha_entrada": "2026-11-02",
            "remision_blob_path": "almacen-soportes/1/remisiones/9/a.jpg",
            "remision_nombre": "a.jpg",
            "remision_mime": "image/jpeg",
        }],
    )
    monkeypatch.setattr(svc, "_sb", lambda: sb)
    items = svc.list_entrada_soportes_galeria(1, "remision")
    assert len(items) == 1
    assert items[0]["en_uso"] is True
    assert items[0]["codigo_entrada"] == "Ent-1614-00009"
    assert items[0]["tipo_soporte"] == "remision"


def test_ruta_soportes_galeria_registrada():
    routes = Path(__file__).resolve().parents[1].joinpath("almacen_routes.py").read_text(encoding="utf-8")
    assert "soportes-galeria" in routes
    assert "list_entrada_soportes_galeria" in routes
