"""Orden predeterminado de la grilla Por reporte."""
from sicoe_grilla_orden import (
    ordenar_ids_reporte_reciente,
    ordenar_registros_export_como_grilla,
    reporte_orden_reciente_key,
)


def test_reporte_nuevo_con_numero_bajo_va_primero():
    # Último histórico #10000; borrador reutiliza #2 pero es más reciente.
    meta = {
        1: ("2026-01-01T10:00:00+00:00", 10000),
        2: ("2026-11-13T15:00:00+00:00", 2),
        3: ("2026-06-01T08:00:00+00:00", 5000),
    }
    assert ordenar_ids_reporte_reciente(meta) == [2, 3, 1]


def test_mismo_created_at_ordena_por_numero_desc():
    ts = "2026-11-13T12:00:00+00:00"
    meta = {
        10: (ts, 3),
        11: (ts, 9),
        12: (ts, 1),
    }
    assert ordenar_ids_reporte_reciente(meta) == [11, 10, 12]


def test_sin_created_at_queda_al_final():
    meta = {
        1: (None, 99),
        2: ("2026-11-13T10:00:00+00:00", 1),
    }
    assert ordenar_ids_reporte_reciente(meta) == [2, 1]


def test_clave_reverse_pone_reciente_arriba():
    a = reporte_orden_reciente_key("2026-11-13T18:00:00Z", 2)
    b = reporte_orden_reciente_key("2026-11-12T18:00:00Z", 10000)
    assert a > b


def test_export_excel_sigue_orden_de_grilla_y_id_asc_dentro_reporte():
    rows = [
        {"id": 20, "reporte_numero": 10000, "_reporte_created_at": "2026-01-01T10:00:00+00:00"},
        {"id": 21, "reporte_numero": 10000, "_reporte_created_at": "2026-01-01T10:00:00+00:00"},
        {"id": 5, "reporte_numero": 2, "_reporte_created_at": "2026-11-13T15:00:00+00:00"},
        {"id": 6, "reporte_numero": 2, "_reporte_created_at": "2026-11-13T15:00:00+00:00"},
    ]
    out = ordenar_registros_export_como_grilla(rows)
    assert [r["id"] for r in out] == [5, 6, 20, 21]
    assert all("_reporte_created_at" not in r for r in out)
