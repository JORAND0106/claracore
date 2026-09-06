"""Ranking inteligente de insumos vs texto solicitado."""
from almacen_insumos_service import score_insumo_contra_consulta


def test_score_prioriza_numero_de_producto_exacto():
    q = "Geotextil NT 2400"
    s2400 = score_insumo_contra_consulta(q, "GT-2400", "Geotextil NT 2400", "")
    s2500 = score_insumo_contra_consulta(q, "GT-2500", "Geotextil NT 2500", "")
    assert s2400 > s2500
    assert s2400 > 0


def test_score_descarta_sin_relacion_semantica():
    q = "geocelda"
    cemento = score_insumo_contra_consulta(q, "CEM-01", "Cemento gris tipo 1", "")
    base = score_insumo_contra_consulta(q, "BASE-1", "Base granular", "")
    geo = score_insumo_contra_consulta(q, "GC-01", "Geocelda HDPE 100mm", "")
    assert cemento < 0
    assert base < 0
    assert geo > 0
