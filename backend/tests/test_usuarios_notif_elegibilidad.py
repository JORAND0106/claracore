"""Gate de estado Aprobado para notificaciones automáticas."""
from __future__ import annotations

from usuarios_notif_elegibilidad import (
    ESTADO_APROBADO,
    filtrar_usuarios_para_notificaciones_automaticas,
    normalizar_estado_usuario,
    usuario_estado_es_aprobado,
    usuario_puede_recibir_notificaciones_automaticas,
)


def test_normalizar_estado_trim_y_case():
    assert normalizar_estado_usuario(" Aprobado ") == ESTADO_APROBADO
    assert normalizar_estado_usuario(None) == ""
    assert normalizar_estado_usuario("PENDIENTE") == "pendiente"


def test_solo_aprobado_recibe_notif():
    assert usuario_estado_es_aprobado("aprobado") is True
    assert usuario_estado_es_aprobado("Aprobado") is True
    assert usuario_estado_es_aprobado("pendiente") is False
    assert usuario_estado_es_aprobado("rechazado") is False
    assert usuario_estado_es_aprobado(None) is False
    assert usuario_estado_es_aprobado("") is False


def test_usuario_puede_recibir_por_fila():
    assert usuario_puede_recibir_notificaciones_automaticas({"estado": "aprobado"}) is True
    assert usuario_puede_recibir_notificaciones_automaticas({"estado": "pendiente"}) is False
    assert usuario_puede_recibir_notificaciones_automaticas({"estado": "rechazado"}) is False
    assert usuario_puede_recibir_notificaciones_automaticas(None) is False
    assert usuario_puede_recibir_notificaciones_automaticas({}) is False


def test_filtrar_lista_excluye_pendiente_y_rechazado():
    rows = [
        {"id": 1, "estado": "aprobado"},
        {"id": 2, "estado": "pendiente"},
        {"id": 3, "estado": "rechazado"},
        {"id": 4, "estado": "APROBADO"},
        {"id": 5, "estado": None},
    ]
    out = filtrar_usuarios_para_notificaciones_automaticas(rows)
    assert [r["id"] for r in out] == [1, 4]
