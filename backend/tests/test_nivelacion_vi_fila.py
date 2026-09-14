"""Vi como fila de cartera independiente en nivelación geométrica."""

from topografia_utils import (
    _agrupar_lecturas_por_fila,
    _fila_tiene_vista_adelante,
    calcular_nivelacion_geometrica,
    validar_lecturas_nivelacion,
)


def _lect(orden, nombre, tipo_lect, lectura, *, tipo_punto="estacion", desc="punto"):
    return {
        "orden": orden,
        "nombre_punto": nombre,
        "tipo_punto": tipo_punto,
        "tipo_lectura": tipo_lect,
        "lectura": lectura,
        "abscisa": "0",
        "descripcion_punto": desc,
        "ubicacion_pk_id": 1,
    }


def test_vi_fila_independiente_cota_hi_menos_vi():
    lecturas = [
        _lect(3, "BM1", "V+", 1.5, tipo_punto="BM", desc="BM"),
        _lect(12, "Aux1", "Vi", 1.2, tipo_punto="auxiliar", desc="Intermedia"),
        _lect(21, "TP1", "V-", 1.0, tipo_punto="cambio", desc="Cambio"),
        _lect(23, "TP1", "V+", 1.3, tipo_punto="cambio", desc="Cambio"),
    ]
    cotas = {"BM1": 100.0}
    niv = {
        "tipo_nivel": "electronico",
        "distancia_max_visual_m": 50,
        "distancia_max_circuito_km": 1,
        "tolerancia_mm_km": 1,
    }
    res = calcular_nivelacion_geometrica(niv, lecturas, cotas, "BM1", None)
    by_name = {}
    for row in res["lecturas"]:
        by_name.setdefault(row["nombre_punto"], row)
    assert abs(by_name["Aux1"]["cota_calculada"] - 100.3) < 1e-6
    assert abs(res["altura_instrumento_ultima"] - 101.8) < 1e-6
    grupos = _agrupar_lecturas_por_fila(lecturas)
    assert _fila_tiene_vista_adelante(grupos, 0, "electronico") is True
    assert validar_lecturas_nivelacion(lecturas, "electronico", "BM1", modo_apertura=False) == []


def test_vplus_con_vi_siguiente_no_marca_sin_vista():
    lecturas = [
        _lect(3, "BM1", "V+", 1.5, tipo_punto="BM", desc="BM"),
        _lect(12, "Aux1", "Vi", 1.1, tipo_punto="auxiliar", desc="Vi"),
    ]
    err = validar_lecturas_nivelacion(lecturas, "electronico", "BM1", modo_apertura=False)
    assert err == []
