"""Unit tests — reparto de transporte."""
from __future__ import annotations

from presupuesto_transporte import (
    elegir_ubicacion_origen,
    normalizar_items_origen,
    repartir_transporte_por_pk,
)


def test_repartir_suma_exacta():
    r = repartir_transporte_por_pk(
        [
            {"pk_id": "A", "cant_compacta": 10},
            {"pk_id": "B", "cant_compacta": 20},
            {"pk_id": "C", "cant_compacta": 30},
        ],
        6950,
    )
    assert r["ok"] is True
    assert r["total_asignado"] == 6950
    assert round(sum(f["cant_transporte"] for f in r["filas"]), 2) == 6950


def test_repartir_compacta_cero():
    r = repartir_transporte_por_pk([{"pk_id": "A", "cant_compacta": 0}], 100)
    assert r["ok"] is False


def test_normalizar_items():
    assert normalizar_items_origen(["8.02", "8.01", "8.02", ""]) == ["8.01", "8.02"]


def test_elegir_ubicacion_mayor_cant():
    ubi = elegir_ubicacion_origen(
        [
            {"pk_id": "P", "cant_total": 1, "tramo": "T1"},
            {"pk_id": "P", "cant_total": 9, "tramo": "T2"},
        ]
    )
    assert ubi["tramo"] == "T2"
