"""Reparto proporcional multi-registro de presupuesto."""
from almacen_presupuesto_reparto import (
    normalize_presupuesto_ids,
    repartir_cantidad_proporcional,
    round_cant,
    total_saldo_registros,
)
from almacen_service import _humanize_solicitud_db_error


def test_total_saldo_ejemplo():
    regs = [
        {"presupuesto_id": 1, "saldo_disponible": 12.51},
        {"presupuesto_id": 2, "saldo_disponible": 18.71},
        {"presupuesto_id": 3, "saldo_disponible": 13.4},
    ]
    assert total_saldo_registros(regs) == 44.62


def test_reparto_30_proporcional_suma_exacta():
    regs = [
        {"presupuesto_id": 1, "saldo_disponible": 12.51},
        {"presupuesto_id": 2, "saldo_disponible": 18.71},
        {"presupuesto_id": 3, "saldo_disponible": 13.4},
    ]
    shares = repartir_cantidad_proporcional(30, regs)
    assert len(shares) == 3
    total = round_cant(sum(s["cantidad"] for s in shares))
    assert total == 30
    assert shares[1]["cantidad"] > shares[0]["cantidad"]
    assert shares[1]["cantidad"] > shares[2]["cantidad"]
    assert abs(shares[0]["peso"] - 12.51 / 44.62) < 1e-9


def test_normalize_presupuesto_ids():
    assert normalize_presupuesto_ids([2, 2, 1, 0, "x"]) == [2, 1]
    assert normalize_presupuesto_ids([], 9) == [9]


def test_humanize_reparto_table_missing():
    msg = _humanize_solicitud_db_error(
        Exception("Could not find the table 'public.almacen_solicitud_item_reparto' in the schema cache")
    )
    assert "almacen_solicitud_item_reparto.sql" in msg
