"""Cálculo nivelación geométrica: hilo medio, orden Vi/V− antes de V+."""
from topografia_utils import (
    calcular_nivelacion_geometrica,
    distancia_taquimetrica_nivelacion,
    faltantes_campo_nivelacion,
    lectura_efectiva_nivelacion,
)


def test_lectura_efectiva_hilo_medio():
    lect = {"hilo_superior": 1.2, "hilo_medio": 1.0, "hilo_inferior": 0.8}
    assert lectura_efectiva_nivelacion(lect, "automatico") == 1.0


def test_distancia_taquimetrica():
    assert distancia_taquimetrica_nivelacion(1.5, 2.5) == 100.0


def test_bm_vplus_hi():
    niv = {"tipo_nivel": "automatico", "tolerancia_mm_km": 1, "distancia_max_visual_m": 50}
    cotas = {"BM1": 801.4}
    lecturas = [
        {
            "id": "1",
            "orden": 3,
            "nombre_punto": "BM1",
            "tipo_lectura": "V+",
            "hilo_medio": 1.0,
            "hilo_superior": 1.2,
            "hilo_inferior": 0.8,
            "distancia_m": 40,
        },
    ]
    res = calcular_nivelacion_geometrica(niv, lecturas, cotas, "BM1", "BM1")
    assert res["lecturas"][0]["altura_instrumento"] == 802.4


def test_cambio_vi_luego_vplus():
    """Vi establece cota; V+ en cambio genera nueva H.I. Vi no suma distancia al circuito."""
    niv = {"tipo_nivel": "automatico", "distancia_max_visual_m": 50}
    cotas = {"BM1": 801.4}
    lecturas = [
        {
            "id": "1",
            "orden": 3,
            "nombre_punto": "BM1",
            "tipo_lectura": "V+",
            "hilo_medio": 1.0,
            "distancia_m": 40,
        },
        {
            "id": "2a",
            "orden": 11,
            "nombre_punto": "TP1",
            "tipo_lectura": "Vi",
            "hilo_medio": 1.0,
            "distancia_m": 20,
        },
        {
            "id": "2b",
            "orden": 13,
            "nombre_punto": "TP1",
            "tipo_lectura": "V+",
            "hilo_medio": 1.0,
        },
    ]
    res = calcular_nivelacion_geometrica(niv, lecturas, cotas)
    assert not res["errores"]
    assert res["distancia_total_m"] == 40.0
    by_tipo = {l["tipo_lectura"]: l for l in res["lecturas"]}
    assert by_tipo["Vi"]["cota_calculada"] == 801.4
    assert by_tipo["V+"]["altura_instrumento"] == 802.4


def test_cambio_vminus_luego_vplus_misma_fila():
    """Cambio: V− fija cota; V+ en la misma fila actualiza H.I. (sin nombre de punto)."""
    niv = {"tipo_nivel": "automatico", "distancia_max_visual_m": 50}
    cotas = {"BM1": 801.4}
    lecturas = [
        {
            "id": "1",
            "orden": 3,
            "nombre_punto": "BM1",
            "tipo_lectura": "V+",
            "hilo_medio": 1.05,
            "distancia_m": 40,
        },
        {
            "id": "4a",
            "orden": 31,
            "nombre_punto": "",
            "tipo_lectura": "V-",
            "hilo_medio": 1.23,
            "distancia_m": 20,
        },
        {
            "id": "4b",
            "orden": 33,
            "nombre_punto": "",
            "tipo_lectura": "V+",
            "hilo_medio": 1.05,
        },
    ]
    res = calcular_nivelacion_geometrica(niv, lecturas, cotas)
    assert not res["errores"]
    assert res["distancia_total_m"] == 60.0
    by_tipo = {l["tipo_lectura"]: l for l in res["lecturas"] if l.get("orden", 0) >= 30}
    assert by_tipo["V-"]["cota_calculada"] == 801.22
    assert by_tipo["V+"]["altura_instrumento"] == 802.27


def test_distancia_supera_tope():
    niv = {"tipo_nivel": "automatico", "distancia_max_visual_m": 50}
    cotas = {"BM1": 100.0}
    lecturas = [
        {
            "id": "1",
            "orden": 3,
            "nombre_punto": "BM1",
            "tipo_lectura": "V+",
            "hilo_medio": 1.5,
            "distancia_m": 55,
        },
    ]
    res = calcular_nivelacion_geometrica(niv, lecturas, cotas, "BM1", "BM1")
    assert res["errores"]


def test_validar_lecturas_vminus_sin_vplus():
    from topografia_utils import validar_lecturas_nivelacion

    lecturas = [
        {"orden": 3, "nombre_punto": "BM1", "tipo_punto": "BM", "abscisa": "0", "descripcion_punto": "ini", "tipo_lectura": "V+", "hilo_medio": 1.0},
        {"orden": 11, "nombre_punto": "P2", "tipo_punto": "cambio", "abscisa": "40", "descripcion_punto": "x", "tipo_lectura": "V-", "hilo_medio": 1.2},
    ]
    err = validar_lecturas_nivelacion(lecturas, "automatico", "BM1")
    assert any("V− sin V+" in e for e in err)


def test_validar_vplus_sin_vminus_misma_fila():
    from topografia_utils import validar_lecturas_nivelacion

    lecturas = [
        {"orden": 3, "nombre_punto": "BM1", "tipo_punto": "BM", "abscisa": "0", "descripcion_punto": "ini", "tipo_lectura": "V+", "hilo_medio": 1.0},
        {"orden": 13, "nombre_punto": "P2", "tipo_punto": "cambio", "abscisa": "40", "descripcion_punto": "x", "tipo_lectura": "V+", "hilo_medio": 1.0},
    ]
    err = validar_lecturas_nivelacion(lecturas, "automatico", "BM1")
    assert any("V+ requiere V−" in e for e in err)


def test_validar_vplus_sin_vista_adelante():
    from topografia_utils import validar_lecturas_nivelacion

    lecturas = [
        {"orden": 3, "nombre_punto": "BM1", "tipo_punto": "BM", "abscisa": "0", "descripcion_punto": "ini", "tipo_lectura": "V+", "hilo_medio": 1.0},
        {"orden": 13, "nombre_punto": "P2", "tipo_punto": "estacion", "abscisa": "40", "descripcion_punto": "x", "tipo_lectura": "V+", "hilo_medio": 1.0},
    ]
    err = validar_lecturas_nivelacion(lecturas, "automatico", "BM1")
    assert any("V+ sin Vi ni V−" in e for e in err)


def test_validar_vplus_con_fila_cierre_siguiente():
    from topografia_utils import validar_lecturas_nivelacion

    lecturas = [
        {"orden": 3, "nombre_punto": "BM1", "tipo_punto": "BM", "abscisa": "0", "descripcion_punto": "ini", "tipo_lectura": "V+", "hilo_medio": 1.0},
        {"orden": 13, "nombre_punto": "P2", "tipo_punto": "cambio", "abscisa": "40", "descripcion_punto": "x", "tipo_lectura": "V+", "hilo_medio": 1.0},
        {
            "orden": 21,
            "nombre_punto": "BM1",
            "tipo_punto": "estacion",
            "abscisa": "80",
            "descripcion_punto": "cierre",
            "tipo_lectura": "V-",
            "hilo_medio": 1.2,
            "punto_biblioteca_id": "uuid-bm1",
        },
    ]
    err = validar_lecturas_nivelacion(lecturas, "automatico", "BM1")
    assert not any("V+ sin Vi ni V−" in e for e in err)
