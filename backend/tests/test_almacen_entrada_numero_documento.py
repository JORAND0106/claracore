"""Número de documento en entradas Despachador: Disposición vs Recibo."""

import pytest

from almacen_service import _resolve_numero_documento_entrada


@pytest.fixture(autouse=True)
def _segmento_contrato_1614(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )


def test_disposicion_siempre_autonumerador(monkeypatch):
    monkeypatch.setattr(
        "almacen_service._next_numero_disposicion",
        lambda _cid: "1614-00099",
    )
    assert _resolve_numero_documento_entrada(1, "disposicion", "") == "1614-00099"
    assert _resolve_numero_documento_entrada(1, "disposicion", "REM-123") == "1614-00099"


def test_recibo_usa_remision_literal(monkeypatch):
    monkeypatch.setattr(
        "almacen_service._next_numero_disposicion",
        lambda _cid: (_ for _ in ()).throw(AssertionError("no autonumerador en recibo")),
    )
    assert _resolve_numero_documento_entrada(1, "recibo", " REM-456 ") == "REM-456"
    assert _resolve_numero_documento_entrada(1, "recibo", "384729") == "384729"


def test_recibo_rechaza_sin_numero():
    with pytest.raises(ValueError, match="remisión"):
        _resolve_numero_documento_entrada(1, "recibo", "")
    with pytest.raises(ValueError, match="remisión"):
        _resolve_numero_documento_entrada(1, "recibo", "   ")
