"""Regla: último nivel solo aprueba si el ítem está Aprobado en Listado de Precios."""
from sicoe_ultimo_nivel_item_aprobado import (
    ESTADO_PRECIO_APROBADO,
    ESTADO_PRECIO_NO_REVISADO,
    ESTADO_PRECIO_PENDIENTE,
    ESTADO_PRECIO_RECHAZADO,
    alerta_omitidos_item_no_aprobado,
    detalle_omitido_item,
    es_aprobacion_en_nivel_maximo,
    item_estado_permite_aprobacion_ultimo_nivel,
    mensaje_bloqueo_ultimo_nivel,
    normalizar_estado_precio,
    resolver_estado_precio_en_indice,
)


def _norm_cap(v):
    return str(v or "").strip().upper()


def _norm_item(v):
    return str(v or "").strip().upper()


def test_normalizar_estado_precio():
    assert normalizar_estado_precio(None) == ESTADO_PRECIO_NO_REVISADO
    assert normalizar_estado_precio("") == ESTADO_PRECIO_NO_REVISADO
    assert normalizar_estado_precio("  ") == ESTADO_PRECIO_NO_REVISADO
    assert normalizar_estado_precio("Aprobado") == ESTADO_PRECIO_APROBADO
    assert normalizar_estado_precio("aprobado") == ESTADO_PRECIO_APROBADO
    assert normalizar_estado_precio("Pendiente") == ESTADO_PRECIO_PENDIENTE
    assert normalizar_estado_precio("Rechazado") == ESTADO_PRECIO_RECHAZADO
    assert normalizar_estado_precio("No Revisado") == ESTADO_PRECIO_NO_REVISADO
    assert normalizar_estado_precio("no revisado") == ESTADO_PRECIO_NO_REVISADO


def test_permite_solo_aprobado():
    assert item_estado_permite_aprobacion_ultimo_nivel("Aprobado") is True
    assert item_estado_permite_aprobacion_ultimo_nivel("Pendiente") is False
    assert item_estado_permite_aprobacion_ultimo_nivel("Rechazado") is False
    assert item_estado_permite_aprobacion_ultimo_nivel(None) is False
    assert item_estado_permite_aprobacion_ultimo_nivel("") is False


def test_es_aprobacion_solo_en_nivel_maximo():
    assert es_aprobacion_en_nivel_maximo(3, 3, "Aprobado") is True
    assert es_aprobacion_en_nivel_maximo(2, 3, "Aprobado") is False
    assert es_aprobacion_en_nivel_maximo(3, 3, "Pendiente") is False
    assert es_aprobacion_en_nivel_maximo(4, 4, "Aprobado") is True
    assert es_aprobacion_en_nivel_maximo(2, 2, "Aprobado") is True
    # Si el máximo cambia a 4, el 3 ya no es último.
    assert es_aprobacion_en_nivel_maximo(3, 4, "Aprobado") is False


def test_mensaje_bloqueo_incluye_item_y_estado():
    msg = mensaje_bloqueo_ultimo_nivel("1.2.3", "Pendiente")
    assert "1.2.3" in msg
    assert "Pendiente" in msg
    assert "Listado de Precios" in msg
    assert "último nivel" in msg.lower() or "ultimo nivel" in msg.lower()


def test_resolver_estado_en_indice():
    idx = {
        ("CAP A", "1.1"): {"estado_precio": "Aprobado"},
        ("CAP A", "2.2"): {"estado_precio": "Pendiente"},
        ("", "3.3"): {"estado_precio": "Rechazado"},
    }
    assert (
        resolver_estado_precio_en_indice(
            idx, "cap a", "1.1", norm_cap=_norm_cap, norm_item=_norm_item
        )
        == ESTADO_PRECIO_APROBADO
    )
    assert (
        resolver_estado_precio_en_indice(
            idx, "CAP A", "2.2", norm_cap=_norm_cap, norm_item=_norm_item
        )
        == ESTADO_PRECIO_PENDIENTE
    )
    assert (
        resolver_estado_precio_en_indice(
            idx, "OTRO", "3.3", norm_cap=_norm_cap, norm_item=_norm_item
        )
        == ESTADO_PRECIO_RECHAZADO
    )
    assert (
        resolver_estado_precio_en_indice(
            idx, "CAP A", "9.9", norm_cap=_norm_cap, norm_item=_norm_item
        )
        == ESTADO_PRECIO_NO_REVISADO
    )
    assert (
        resolver_estado_precio_en_indice(
            None, "CAP A", "1.1", norm_cap=_norm_cap, norm_item=_norm_item
        )
        == ESTADO_PRECIO_NO_REVISADO
    )


def test_alerta_masiva_agrupa_items():
    omitidos = [
        detalle_omitido_item(1, "1.1", "Pendiente"),
        detalle_omitido_item(2, "1.1", "Pendiente"),
        detalle_omitido_item(3, "2.2", "Rechazado"),
        detalle_omitido_item(4, "3.3", ""),
    ]
    alerta = alerta_omitidos_item_no_aprobado(omitidos)
    assert "4 registro" in alerta
    assert "1.1" in alerta
    assert "Pendiente" in alerta
    assert "2.2" in alerta
    assert "No revisado" in alerta
    assert "Listado de Precios" in alerta
