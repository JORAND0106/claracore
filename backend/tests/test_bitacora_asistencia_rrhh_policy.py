"""Tests — política Bitácora ↔ RRHH (corte + contrato 3)."""
from __future__ import annotations

from datetime import datetime

from bitacora_asistencia_rrhh_policy import (
    BITACORA_ASISTENCIA_RRHH_CORTE,
    BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID,
    TZ_BOGOTA,
    cutover_asistencia_rrhh_activo,
    doc_validacion_es_aprobado,
    es_contrato_exento_asistencia_rrhh,
    policy_snapshot,
    requiere_asistencia_rrhh_aprobado,
)


def test_antes_del_corte_ningun_contrato_exige_gate():
    before = datetime(2026, 9, 24, 23, 59, 59, tzinfo=TZ_BOGOTA)
    assert cutover_asistencia_rrhh_activo(before) is False
    assert requiere_asistencia_rrhh_aprobado(1, activa_en_exento=False, now=before) is False
    assert requiere_asistencia_rrhh_aprobado(3, activa_en_exento=True, now=before) is False


def test_desde_corte_resto_de_contratos_exigen_gate():
    after = datetime(2026, 9, 25, 0, 0, 0, tzinfo=TZ_BOGOTA)
    assert cutover_asistencia_rrhh_activo(after) is True
    assert requiere_asistencia_rrhh_aprobado(1, now=after) is True
    assert requiere_asistencia_rrhh_aprobado(99, now=after) is True


def test_contrato_3_exento_hasta_activar():
    after = datetime(2026, 9, 26, 12, 0, 0, tzinfo=TZ_BOGOTA)
    assert es_contrato_exento_asistencia_rrhh(BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID)
    assert requiere_asistencia_rrhh_aprobado(3, activa_en_exento=False, now=after) is False
    assert requiere_asistencia_rrhh_aprobado(3, activa_en_exento=True, now=after) is True


def test_policy_snapshot_permite_cargo_cuadrilla_en_exento():
    after = datetime(2026, 9, 25, 8, 0, 0, tzinfo=TZ_BOGOTA)
    snap = policy_snapshot(3, activa_en_exento=False, now=after)
    assert snap["corte_activo"] is True
    assert snap["contrato_exento"] is True
    assert snap["requiere_rrhh_aprobado"] is False
    assert snap["permite_cargo_cuadrilla"] is True
    assert snap["corte_iso"] == BITACORA_ASISTENCIA_RRHH_CORTE.date().isoformat()

    snap_on = policy_snapshot(3, activa_en_exento=True, now=after)
    assert snap_on["requiere_rrhh_aprobado"] is True
    assert snap_on["permite_cargo_cuadrilla"] is False


def test_doc_validacion_aprobado():
    assert doc_validacion_es_aprobado("aprobado") is True
    assert doc_validacion_es_aprobado("Aprobado") is True
    assert doc_validacion_es_aprobado("pendiente") is False
    assert doc_validacion_es_aprobado(None) is False
