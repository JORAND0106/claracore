"""Tests del motor de calificación (porcentajes centralizados)."""
from __future__ import annotations

from seguimiento_calificacion import (
    CALIFICACION_CONFIG,
    calcular_nota,
    clasificar_tope_fecha,
    es_calificable,
    es_tarea_personal,
    get_calificacion_config,
    promedio,
    resultado_pct,
)


def test_config_unico_lugar():
    cfg = get_calificacion_config()
    assert cfg["resultado"]["cumplido"] == CALIFICACION_CONFIG["resultado"]["cumplido"]
    assert cfg["tope_fecha"]["a_tiempo"] == 100.0
    assert cfg["excepcion_tercero_tope"] == 100.0


def test_personal_no_califica():
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 1,
        "relacion_destinatario": None,
        "estado_gestion": "cumplido",
    }
    assert es_tarea_personal(item) is True
    assert es_calificable(item) is False
    assert calcular_nota(item) is None


def test_asignada_cumplida_a_tiempo():
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 2,
        "relacion_destinatario": "asignacion",
        "estado_gestion": "cumplido",
        "fecha_vencimiento": "2099-12-31",
        "se_reprogramo": False,
        "se_reprogramo_tras_vencer": False,
    }
    assert es_calificable(item) is True
    out = calcular_nota(item)
    assert out["nota"] == 100.0
    assert out["resultado_pct"] == 100.0
    assert out["tope_fecha_pct"] == 100.0


def test_parcial_con_reprogramacion_antes():
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 2,
        "relacion_destinatario": "asignacion",
        "estado_gestion": "parcial",
        "fecha_vencimiento": "2099-12-31",
        "se_reprogramo": True,
        "se_reprogramo_tras_vencer": False,
    }
    out = calcular_nota(item)
    # min(60, 80) = 60
    assert out["nota"] == 60.0
    assert out["tope_codigo"] == "reprogramada_antes_de_vencer"


def test_vencido_sin_cumplir_cero():
    item = {
        "origen": "compromiso",
        "created_by": 1,
        "solicitante_id": 1,
        "asignado_a_id": 5,
        "estado_gestion": "vencido",
        "vencido_at": "2026-01-01T00:00:00Z",
    }
    out = calcular_nota(item)
    assert out["resultado_pct"] == 0.0
    assert out["nota"] == 0.0


def test_excepcion_tercero_mantiene_tope_100():
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 2,
        "relacion_destinatario": "asignacion",
        "estado_gestion": "cumplido",
        "se_reprogramo": True,
        "se_reprogramo_tras_vencer": True,
        "vencido_at": "2026-01-01T00:00:00Z",
    }
    tope, codigo = clasificar_tope_fecha(item, excepcion_aprobada=True)
    assert tope == 100.0
    assert codigo == "excepcion_tercero"
    out = calcular_nota(item, excepcion_aprobada=True)
    assert out["nota"] == 100.0


def test_cancelado_excluido():
    assert resultado_pct("cancelado") is None
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 2,
        "relacion_destinatario": "asignacion",
        "estado_gestion": "cancelado",
    }
    assert es_calificable(item) is False


def test_abierto_no_puntua():
    item = {
        "origen": "tarea",
        "created_by": 1,
        "asignado_a_id": 2,
        "relacion_destinatario": "asignacion",
        "estado_gestion": "abierto",
    }
    assert calcular_nota(item) is None


def test_promedio():
    assert promedio([100, 60, 0]) == 53.33
    assert promedio([]) is None


def test_compromiso_autoasignado_no_califica():
    item = {
        "origen": "compromiso",
        "solicitante_id": 9,
        "asignado_a_id": 9,
        "estado_gestion": "cumplido",
    }
    assert es_calificable(item) is False
