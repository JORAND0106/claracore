"""Localización es excepción editable en registros sellados."""
from __future__ import annotations

from sicoe_creador_permisos import SICOE_CAMPOS_LOCALIZACION, SICOE_CAMPOS_DIMENSIONALES


def test_localizacion_campos_basicos():
    for k in (
        "abs_inicio", "abs_final", "nodo_ini", "nodo_fin", "margen",
        "pk_id_id", "coord_lat", "coord_lng",
    ):
        assert k in SICOE_CAMPOS_LOCALIZACION


def test_localizacion_incluido_en_dimensionales():
    assert SICOE_CAMPOS_LOCALIZACION <= SICOE_CAMPOS_DIMENSIONALES


def test_sellado_permitidos_incluyen_localizacion():
    """Misma unión que usa actualizar_registro para sellados."""
    n3 = {
        "corte_id", "subcontratista_id", "reporte_id", "numero_registro",
        "observacion",
        "foto_url", "foto_numero", "foto_descripcion", "fotos_historial",
        "grafico_url", "grafico_numero", "grafico_descripcion",
        "graficos_historial",
    } | set(SICOE_CAMPOS_LOCALIZACION)
    assert "abs_inicio" in n3
    assert "pk_id_id" in n3
    assert "cantidad_total" not in n3
    assert "item_numero" not in n3
    assert "vlr_unitario" not in n3
