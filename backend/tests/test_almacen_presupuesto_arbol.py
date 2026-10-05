"""Agregados del acordeón de tramo / PK-ID."""
from almacen_presupuesto_arbol import resumir_pks, resumir_tramos


def _rows():
    return [
        {"id": 1, "pk_id": "1", "tramo": "7", "cant_total": 30, "und": "m3", "abs_inicio": "0+100"},
        {"id": 2, "pk_id": "2", "tramo": "7", "cant_total": 40, "und": "m3"},
        {"id": 3, "pk_id": "3", "tramo": "7", "cant_total": 30, "und": "m3"},
        {"id": 4, "pk_id": "", "tramo": "7", "cant_total": 999, "und": "m3"},
        {"id": 5, "pk_id": "9", "tramo": "8", "cant_total": 12, "und": "m3"},
    ]


def test_tramo_agrega_pk_y_omite_filas_sin_pk():
    tramos = resumir_tramos(_rows(), {(1, "1"): 10})
    por_tramo = {t["tramo"]: t for t in tramos}
    assert por_tramo["7"]["cant_total"] == 100
    assert por_tramo["7"]["cant_solicitada_acumulada"] == 10
    assert por_tramo["7"]["saldo_disponible"] == 90
    assert por_tramo["7"]["pk_count"] == 3
    assert por_tramo["7"]["unidad"] == "m3"
    assert por_tramo["8"]["saldo_disponible"] == 12
    assert "" not in por_tramo


def test_pks_sin_registros_cuentan_filas_y_el_detalle_las_trae():
    rows = _rows()
    pks = resumir_pks([r for r in rows if r["tramo"] == "7"], {}, con_registros=False)
    assert [p["pk_id"] for p in pks] == ["1", "2", "3"]
    assert [p["saldo_disponible"] for p in pks] == [30, 40, 30]
    assert [p["registros_count"] for p in pks] == [1, 1, 1]
    assert "registros" not in pks[0]

    detalle = resumir_pks([r for r in rows if r["pk_id"] == "1"], {}, con_registros=True)
    assert detalle[0]["registros_count"] == 1
    assert detalle[0]["registros"][0]["presupuesto_id"] == 1
    assert detalle[0]["registros"][0]["abs_inicio"] == "0+100"


def test_sin_tramo_usa_etiqueta():
    rows = [{"id": 8, "pk_id": "4", "tramo": "  ", "cant_total": 5, "und": "und"}]
    tramos = resumir_tramos(rows, {})
    assert tramos[0]["tramo"] == ""
    assert tramos[0]["etiqueta"] == "Sin tramo"
    assert tramos[0]["pk_count"] == 1
