"""Plan de corrección de cantidad_total no sellados."""
from sicoe_corregir_cantidad_total import plan_correccion_registros


def test_plan_corrige_no_sellados_y_respeta_sellados():
    rows = [
        {
            "id": 1,
            "contrato_id": 1,
            "longitud": 0.25,
            "ancho": 0.015,
            "espesor": None,
            "cantidad": None,
            "cantidad_total": 0.00375,  # no cumple → 0.004
            "vlr_unitario": 1000,
            "costo_directo": 4,
            "bloqueado": False,
        },
        {
            "id": 2,
            "contrato_id": 1,
            "longitud": 2,
            "ancho": 3,
            "espesor": 4,
            "cantidad": 1,
            "cantidad_total": 24.0,
            "vlr_unitario": 10,
            "costo_directo": 240,
            "bloqueado": True,  # sellado
        },
        {
            "id": 3,
            "contrato_id": 1,
            "es_varilla": True,
            "diametro_varilla": "1/2",
            "longitud": 6,
            "cantidad": 4,
            "peso_kg_m": 0.994,
            "cantidad_total": 23.856,  # 3 dp viejo → 23.86
            "vlr_unitario": 100,
            "costo_directo": 2386,
            "bloqueado": False,
        },
    ]
    out = plan_correccion_registros(rows, es_sellado=lambda r: bool(r.get("bloqueado")))
    assert out["sellados_sin_cambio"] == 1
    assert out["corregidos"] == 2
    ids = {d["id"] for d in out["detalle"]}
    assert ids == {1, 3}
    by_id = {d["id"]: d for d in out["detalle"]}
    assert by_id[1]["cantidad_total_despues"] == 0.004
    assert by_id[3]["cantidad_total_despues"] == 23.86
