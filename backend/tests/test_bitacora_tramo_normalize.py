"""Normalización de tramo Bitácora — sin «Tramo 0»."""
from bitacora_service import (
    SIN_TRAMO_ASIGNADO_LABEL,
    TRAMO_NO_ESPECIFICADO_LABEL,
    _is_tramo_sentinel_invalido,
    _label_tramo,
    _normalize_tramo,
    _require_tramo_nuevo,
)
import pytest


def test_label_sin_tramo_asignado():
    assert SIN_TRAMO_ASIGNADO_LABEL == "Sin tramo asignado"
    assert TRAMO_NO_ESPECIFICADO_LABEL == SIN_TRAMO_ASIGNADO_LABEL
    assert _label_tramo(None) == "Sin tramo asignado"
    assert _label_tramo("") == "Sin tramo asignado"
    assert _label_tramo("Tramo 0") == "Sin tramo asignado"
    assert _label_tramo("0") == "Sin tramo asignado"
    assert _label_tramo("Tramo 1") == "Tramo 1"


def test_normalize_rejects_tramo_cero():
    assert _is_tramo_sentinel_invalido("0") is True
    assert _is_tramo_sentinel_invalido("Tramo 0") is True
    assert _is_tramo_sentinel_invalido("TRAMO 0") is True
    assert _is_tramo_sentinel_invalido("tramo_0") is True
    assert _is_tramo_sentinel_invalido("Tramo 1") is False
    assert _is_tramo_sentinel_invalido("10") is False
    assert _is_tramo_sentinel_invalido("Tramo 10") is False
    assert _normalize_tramo("0") is None
    assert _normalize_tramo("Tramo 0") is None
    assert _normalize_tramo("  Tramo 1  ") == "Tramo 1"


def test_require_tramo_nuevo_rejects_cero():
    with pytest.raises(ValueError):
        _require_tramo_nuevo("0")
    with pytest.raises(ValueError):
        _require_tramo_nuevo("Tramo 0")
    with pytest.raises(ValueError):
        _require_tramo_nuevo(None)
    assert _require_tramo_nuevo("Tramo 1") == "Tramo 1"
