"""Búsqueda de ítems SICOE: catálogo visible; precios redactados sin economía."""
from subcontratista_visibilidad import (
    redactar_filas_economicos_contrato,
    usuario_ve_valores_economicos_contrato,
)


def test_usuario_subcontratista_no_ve_economia_contrato():
    assert (
        usuario_ve_valores_economicos_contrato(
            "Residente",
            "contratista",
            subcontratista_id=12,
            empresa_tipo="subcontratista",
        )
        is False
    )


def test_desarrollador_ve_economia():
    assert usuario_ve_valores_economicos_contrato("Desarrollador", "desarrollador") is True


def test_redactar_quita_precio_unitario_conserva_capitulo_item():
    rows = [
        {
            "id": 1,
            "capitulo": "01. Preliminar",
            "item_numero": "1.1",
            "descripcion": "Excavación",
            "unidad": "m3",
            "precio_unitario": 125000.0,
        }
    ]
    out = redactar_filas_economicos_contrato(rows)
    assert out[0]["capitulo"] == "01. Preliminar"
    assert out[0]["item_numero"] == "1.1"
    assert out[0]["descripcion"] == "Excavación"
    assert out[0]["precio_unitario"] is None
