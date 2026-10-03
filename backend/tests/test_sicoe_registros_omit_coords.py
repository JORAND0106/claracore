"""Resiliencia PGRST204 al escribir so_registros (coords_geojson / geometria_tipo)."""
from __future__ import annotations

import pytest

from sicoe_registros_schema import (
    so_registros_clear_omit_cache,
    so_registros_omit_cache_snapshot,
    so_registros_pgrst_unknown_column,
    so_registros_remember_omit,
    so_registros_strip_omitted,
    so_registros_write_omit_missing,
    so_registros_insert_rows_omit_missing,
)


class _FakeAPIError(Exception):
    def __init__(self, message: str, code: str = "PGRST204"):
        super().__init__(message)
        self.code = code
        self.message = message


@pytest.fixture(autouse=True)
def _clear_omit_cache():
    so_registros_clear_omit_cache()
    yield
    so_registros_clear_omit_cache()


def test_pgrst_unknown_column_coords_geojson():
    err = _FakeAPIError(
        "{'message': \"Could not find the 'coords_geojson' column of 'so_registros' in the schema cache\", "
        "'code': 'PGRST204', 'hint': None, 'details': None}"
    )
    assert so_registros_pgrst_unknown_column(err) == "coords_geojson"


def test_write_omite_coords_geojson_y_reintenta():
    calls = []

    def write_fn(data):
        calls.append(dict(data))
        if "coords_geojson" in data:
            raise _FakeAPIError(
                "Could not find the 'coords_geojson' column of 'so_registros' in the schema cache"
            )
        if "geometria_tipo" in data:
            raise _FakeAPIError(
                "Could not find the 'geometria_tipo' column of 'so_registros' in the schema cache"
            )
        return [{"id": 1, **data}]

    out = so_registros_write_omit_missing(
        write_fn,
        {
            "nombre": "Registro A",
            "coords_geojson": {"type": "Point", "coordinates": [-74.0, 4.6]},
            "geometria_tipo": "punto",
            "coord_lat": 4.6,
            "coord_lng": -74.0,
        },
        operacion="test",
    )
    assert out and out[0]["id"] == 1
    assert "coords_geojson" not in out[0]
    assert "geometria_tipo" not in out[0]
    assert out[0]["coord_lat"] == 4.6
    assert len(calls) >= 3
    cache = so_registros_omit_cache_snapshot()
    assert "coords_geojson" in cache
    assert "geometria_tipo" in cache


def test_strip_omitted_respeta_cache():
    so_registros_remember_omit("coords_geojson")
    cleaned = so_registros_strip_omitted(
        {"nombre": "X", "coords_geojson": {"type": "Point"}, "margen": "Izquierda"}
    )
    assert "coords_geojson" not in cleaned
    assert cleaned["margen"] == "Izquierda"


def test_insert_batch_omite_coords_geojson():
    calls = []

    def insert_fn(chunk):
        calls.append([dict(r) for r in chunk])
        if any("coords_geojson" in r for r in chunk):
            raise _FakeAPIError(
                "Could not find the 'coords_geojson' column of 'so_registros' in the schema cache"
            )
        return [{"id": i + 1, **r} for i, r in enumerate(chunk)]

    out = so_registros_insert_rows_omit_missing(
        insert_fn,
        [
            {"nombre": "A", "coords_geojson": {"type": "Point"}, "geometria_tipo": "punto"},
            {"nombre": "B", "coords_geojson": None, "geometria_tipo": "linea"},
        ],
    )
    assert len(out) == 2
    assert all("coords_geojson" not in r for r in out)
    assert "coords_geojson" in so_registros_omit_cache_snapshot()
