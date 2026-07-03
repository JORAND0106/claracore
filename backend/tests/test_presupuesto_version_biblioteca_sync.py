"""Tests — sincronización de validación entre versiones (presupuesto_version_biblioteca)."""
from presupuesto_version_biblioteca import (
    _estado_pre_interv_sin_validar,
    _estado_revisado_sin_validar,
    _extraer_patch_validacion,
    _patch_validacion_destino,
    _sync_origen_id,
    _sync_rows_identity_match,
    _sync_rows_match,
)


def test_identity_match_exact():
    a = {
        "item": "1.01",
        "descripcion": "Excavación",
        "und": "M3",
        "vlr_unitario": 1000,
        "cant_total": 10.5,
        "costo_directo": 10500,
        "id_pol": "POL-1",
    }
    b = dict(a)
    assert _sync_rows_identity_match(a, b) is True


def test_identity_match_numeric_tolerance():
    a = {"item": "1", "descripcion": "X", "und": "M2", "vlr_unitario": 1.0000001, "cant_total": 2.0, "costo_directo": 2, "id_pol": None}
    b = {"item": "1", "descripcion": "X", "und": "M2", "vlr_unitario": 1.0, "cant_total": 2.0, "costo_directo": 2, "id_pol": ""}
    assert _sync_rows_identity_match(a, b) is True


def test_identity_mismatch_on_item():
    a = {"item": "1", "descripcion": "X", "und": "M2", "vlr_unitario": 1, "cant_total": 2, "costo_directo": 2, "id_pol": None}
    b = dict(a, item="2")
    assert _sync_rows_identity_match(a, b) is False


def test_revisado_sin_validar():
    assert _estado_revisado_sin_validar(None) is True
    assert _estado_revisado_sin_validar("No Revisado") is True
    assert _estado_revisado_sin_validar("Aprobado") is False
    assert _estado_revisado_sin_validar("Pendiente") is False


def test_pre_interv_sin_validar():
    assert _estado_pre_interv_sin_validar(None) is True
    assert _estado_pre_interv_sin_validar("") is True
    assert _estado_pre_interv_sin_validar("No Revisado") is True
    assert _estado_pre_interv_sin_validar("Aprobado") is False


def test_extraer_patch_validacion():
    patch = _extraer_patch_validacion(
        {"revisado": "Aprobado", "validado_por": "Ana", "capitulo": "1", "cant_total": 5}
    )
    assert patch == {"revisado": "Aprobado", "validado_por": "Ana"}


def test_sync_match_por_origen_id():
    vivo = {"id": 42, "item": "9", "descripcion": "X", "und": "M", "vlr_unitario": 1, "cant_total": 2, "costo_directo": 2, "id_pol": None}
    version = {
        "presupuesto_item_id_origen": 42,
        "item": "9",
        "descripcion": "Distinto",
        "und": "M",
        "vlr_unitario": 99,
        "cant_total": 99,
        "costo_directo": 99,
        "id_pol": None,
    }
    assert _sync_rows_match(vivo, version) is True
    assert _sync_origen_id(vivo) == 42
    assert _sync_origen_id(version) == 42


def test_patch_validacion_solo_si_sin_validar():
    row = {"revisado": "No Revisado", "pre_interv_estado": None}
    patch = _patch_validacion_destino(row, {"revisado": "Aprobado", "validado_por": "U"})
    assert patch["revisado"] == "Aprobado"
    row2 = {"revisado": "Pendiente", "pre_interv_estado": None}
    assert _patch_validacion_destino(row2, {"revisado": "Aprobado"}) == {}
