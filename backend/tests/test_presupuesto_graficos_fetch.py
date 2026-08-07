"""Tests — proxy de imagen y validación de pie para gráficos de presupuesto."""
import pytest
from fastapi import HTTPException

from presupuesto_graficos_routes import _blob_path_from_public_url, _fetch_grafico_bytes, _norm_pie_foto


def test_blob_path_from_public_url():
    url = "https://acct.blob.core.windows.net/public/42/presupuesto-graficos/g_abc.jpg"
    assert _blob_path_from_public_url(url) == "42/presupuesto-graficos/g_abc.jpg"


def test_fetch_grafico_rechaza_otro_contrato(monkeypatch):
    def boom(_path):
        raise AssertionError("no debe descargar")

    monkeypatch.setattr("presupuesto_graficos_routes.download_blob_bytes", boom)
    with pytest.raises(HTTPException) as exc:
        _fetch_grafico_bytes(7, blob_path="99/presupuesto-graficos/x.jpg")
    assert exc.value.status_code == 403


def test_fetch_grafico_por_blob_path(monkeypatch):
    monkeypatch.setattr(
        "presupuesto_graficos_routes.download_blob_bytes",
        lambda path: b"\x89PNG_fake" if path.startswith("7/") else b"",
    )
    data, media = _fetch_grafico_bytes(7, blob_path="7/presupuesto-graficos/a.png")
    assert data.startswith(b"\x89PNG")
    assert media == "image/png"


def test_norm_pie():
    assert _norm_pie_foto("  hola   mundo ") == "hola mundo"
