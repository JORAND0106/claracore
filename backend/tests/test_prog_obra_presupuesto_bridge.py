"""Tests puente presupuesto ↔ programación de obra."""
from prog_obra_presupuesto_bridge import (
    PresupuestoItemAgg,
    compare_presupuesto_delta,
    metadata_resumen_delta,
    _classify_change,
    _impacto_costo_cambio,
    _norm_revisado,
)


def test_norm_revisado_aprobado():
    assert _norm_revisado("Aprobado") == "Aprobado"
    assert _norm_revisado("aprobado") == "Aprobado"
    assert _norm_revisado(None) == "No Revisado"


def test_classify_cantidad_y_nuevo_baja():
    snap = PresupuestoItemAgg(101.65, 45000, "M3", "Subbase")
    live = PresupuestoItemAgg(120.0, 45000, "M3", "Subbase")
    assert _classify_change(snap, live) == "cantidad"
    assert _classify_change(None, live) == "nuevo"
    assert _classify_change(snap, None) == "baja"


def test_impacto_costo_cantidad():
    snap = PresupuestoItemAgg(101.65, 45000, "M3", "Subbase")
    live = PresupuestoItemAgg(120.0, 45000, "M3", "Subbase")
    assert _impacto_costo_cambio("cantidad", snap, live, True) == 825750.0


def test_compare_delta_detecta_tres_cambios():
    snap = {
        ("120114", "02", "2.1"): PresupuestoItemAgg(101.65, 45000, "M3", "Subbase Granular"),
        ("120115", "03", "3.2"): PresupuestoItemAgg(10, 1000, "M3", "Concreto"),
    }
    live = {
        ("120114", "02", "2.1"): PresupuestoItemAgg(120.0, 45000, "M3", "Subbase Granular"),
        ("120114", "02", "2.3"): PresupuestoItemAgg(5, 2000, "M2", "Riego"),
    }
    programados = {("120114", "02", "2.1")}
    cambios = compare_presupuesto_delta(snap, live, programados)
    assert len(cambios) == 3
    tipos = {c["tipo"] for c in cambios}
    assert tipos == {"cantidad", "nuevo", "baja"}


def test_metadata_resumen_delta():
    delta = {
        "costo_programacion_anterior": 127689243,
        "costo_programacion_actualizado": 128515000,
        "variacion": 825757,
        "pct_variacion": 0.65,
        "total_cambios": 3,
        "sin_cambios": False,
        "snapshot_ausente": False,
    }
    meta = metadata_resumen_delta(delta)
    assert meta["costo_anterior"] == 127689243
    assert meta["total_cambios"] == 3
