from sicoe_registros_vacios_plantilla import (
    registro_vacio_tipo_plantilla,
    resumir_registros_vacios_plantilla,
)


def test_heuristica_vacio():
    assert registro_vacio_tipo_plantilla(
        {"nombre": "Exc", "longitud": None, "observacion": "", "foto_url": None}
    )
    assert not registro_vacio_tipo_plantilla(
        {"nombre": "Exc", "longitud": 1.2, "observacion": "", "foto_url": None}
    )
    assert not registro_vacio_tipo_plantilla({"nombre": "", "observacion": ""})


def test_resumen_por_reporte():
    out = resumir_registros_vacios_plantilla(
        [
            {"id": 1, "reporte_id": 10, "numero_registro": 1, "nombre": "A"},
            {"id": 2, "reporte_id": 10, "numero_registro": 2, "nombre": "B", "longitud": 1},
            {"id": 3, "reporte_id": 11, "numero_registro": 1, "nombre": "C"},
        ]
    )
    assert out["count"] == 2
    assert {r["reporte_id"] for r in out["reportes"]} == {10, 11}
