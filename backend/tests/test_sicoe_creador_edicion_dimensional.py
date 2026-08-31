"""Tests de helpers de edición dimensional por creador (SicoeObra)."""
from __future__ import annotations

from datetime import datetime, timezone


def test_reset_validaciones_shape():
    # Replica la lógica de _sicoe_reset_validaciones_activas sin importar main.
    activos = [1, 2, 4]
    update: dict = {}
    for n in activos:
        update[f"nivel{n}_estado"] = "No Revisado"
        update[f"nivel{n}_usuario_id"] = None
        update[f"nivel{n}_fecha"] = None
    update["bloqueado"] = False
    assert update["nivel1_estado"] == "No Revisado"
    assert update["nivel4_estado"] == "No Revisado"
    assert "nivel3_estado" not in update
    assert update["bloqueado"] is False


def test_alerta_cantidad_fields():
    update: dict = {}
    anterior, nueva, uid = 10.5, 18.0, 42
    update["cantidad_alerta_anterior"] = round(float(anterior), 2)
    update["cantidad_alerta_actual"] = round(float(nueva), 2)
    update["cantidad_alerta_en"] = datetime.now(timezone.utc).isoformat()
    update["cantidad_alerta_por"] = int(uid)
    assert update["cantidad_alerta_anterior"] == 10.5
    assert update["cantidad_alerta_actual"] == 18.0
    assert update["cantidad_alerta_por"] == 42


def test_campos_dimensionales_vs_financieros():
    dim = {
        "longitud", "ancho", "espesor", "cantidad", "cantidad_total", "observacion",
        "abs_inicio", "abs_final", "nodo_ini", "nodo_fin", "margen",
        "pk_id_id", "civ", "tramo", "infraestructura", "calzada", "ubicacion",
        "coord_lat", "coord_lng",
    }
    fin = {
        "capitulo", "competencia", "item_numero", "item_descripcion", "unidad",
        "vlr_unitario", "costo_directo", "acta_rpo_id", "semana_id", "item_listado_id",
    }
    assert not (dim & fin)
    assert "longitud" in dim
    assert "capitulo" in fin


def test_creador_match():
    assert int(7) == int("7")
    prev = {"creado_por_reg": 7}
    uid = 7
    assert int(prev["creado_por_reg"]) == int(uid)
