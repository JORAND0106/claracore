"""Tests del motor de auditoría de traslapos/vacíos."""
from sicoe_auditoria_traslapos import (
    analizar_candidato_contra_pares,
    analizar_varios,
    fmt_abscisa_k,
    normalizar_tolerancia_m,
    usuario_ve_auditoria_traslapos,
)


def test_tolerancia_minima():
    assert normalizar_tolerancia_m(0.5) == 0.5
    assert normalizar_tolerancia_m(0.01) == 0.1
    assert normalizar_tolerancia_m(None) == 0.5


def test_traslapo_lineal_valor_proporcional():
    cand = {
        "id": 10,
        "numero_registro": 100,
        "item_numero": "1.1",
        "tramo": "T1",
        "infraestructura": "Calzada",
        "calzada": "Derecha",
        "abs_inicio": 100,
        "abs_final": 200,
        "cantidad_total": 100,
        "vlr_unitario": 1000,
    }
    peer = {
        "id": 11,
        "numero_registro": 101,
        "item_numero": "1.1",
        "tramo": "T1",
        "infraestructura": "Calzada",
        "calzada": "Derecha",
        "abs_inicio": 150,
        "abs_final": 250,
    }
    r = analizar_candidato_contra_pares(cand, [peer], tolerancia_m=0.5)
    assert r["semaforo"] == "rojo"
    assert r["hallazgos"][0]["medida_m"] == 50
    assert r["hallazgos"][0]["valor_en_juego"] == 50000.0


def test_sector_distinto_no_traslapa():
    cand = {
        "id": 1,
        "item_numero": "2",
        "tramo": "A",
        "infraestructura": "X",
        "calzada": "Izq",
        "sector": "Norte",
        "abs_inicio": 0,
        "abs_final": 100,
        "cantidad_total": 1,
        "vlr_unitario": 1,
    }
    peer = {**cand, "id": 2, "sector": "Sur", "abs_inicio": 50, "abs_final": 150}
    r = analizar_candidato_contra_pares(cand, [peer], tolerancia_m=0.5)
    assert r["semaforo"] == "verde"


def test_vacio_y_no_auditable():
    cand = {
        "id": 2,
        "numero_registro": 2,
        "item_numero": "3",
        "tramo": "T",
        "infraestructura": "I",
        "margen": "Der",
        "abs_inicio": 70,
        "abs_final": 100,
        "cantidad_total": 1,
        "vlr_unitario": 1,
    }
    peer = {
        "id": 1,
        "numero_registro": 1,
        "item_numero": "3",
        "tramo": "T",
        "infraestructura": "I",
        "margen": "Der",
        "abs_inicio": 0,
        "abs_final": 50,
    }
    r = analizar_candidato_contra_pares(cand, [peer], tolerancia_m=0.5)
    assert r["semaforo"] == "amarillo"
    assert r["hallazgos"][0]["tipo"] == "vacio"

    r2 = analizar_candidato_contra_pares(
        {"id": 9, "item_numero": "1.1", "cantidad_total": 1, "vlr_unitario": 1},
        [],
        tolerancia_m=0.5,
    )
    assert r2["semaforo"] == "amarillo"
    assert r2["hallazgos"][0]["tipo"] == "no_auditable"


def test_puntual_y_interventoria():
    cand = {
        "id": 1,
        "numero_registro": 9,
        "item_numero": "5",
        "pk_id_id": 44,
        "cantidad_total": 2,
        "vlr_unitario": 5000,
    }
    peer = {"id": 2, "numero_registro": 8, "item_numero": "5", "pk_id_id": 44}
    r = analizar_candidato_contra_pares(cand, [peer], tolerancia_m=0.5)
    assert r["semaforo"] == "rojo"
    assert r["hallazgos"][0]["valor_en_juego"] == 10000.0

    assert usuario_ve_auditoria_traslapos({"rol_nombre": "Contratista"}) is True
    assert usuario_ve_auditoria_traslapos({"rol_nombre": "Interventoría"}) is False
    assert fmt_abscisa_k(112.5) == "K0+112,5"


def test_analizar_varios_rojo():
    out = analizar_varios(
        [
            {
                "id": 1,
                "item_numero": "1",
                "tramo": "T",
                "infraestructura": "I",
                "calzada": "C",
                "abs_inicio": 0,
                "abs_final": 10,
                "cantidad_total": 1,
                "vlr_unitario": 1,
            },
            {
                "id": 2,
                "item_numero": "1",
                "tramo": "T",
                "infraestructura": "I",
                "calzada": "C",
                "abs_inicio": 5,
                "abs_final": 15,
                "cantidad_total": 1,
                "vlr_unitario": 1,
            },
        ],
        {},
        tolerancia_m=0.5,
    )
    assert out["semaforo"] == "rojo"
