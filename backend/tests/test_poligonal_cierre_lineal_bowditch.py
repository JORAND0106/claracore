"""
Cierre lineal preliminar + compensación angular/Bowditch al terminar.

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_cierre_lineal_bowditch -v
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_utils import (  # noqa: E402
    ajustar_poligonal_armadas,
    aplicar_cierre_lineal_coords_ajustadas,
    calcular_cierre_poligonal,
    radiar_armadas,
    reconstruir_cierre_preliminar,
)


def _cuadrado(dists, con_orientacion=False):
    A = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
    D = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}
    armadas = [
        {"id": "a1", "orden": 1, "estacion_nombre": "A", "visado_nombre": "D", "altura_instrumento": 1.5},
        {"id": "a2", "orden": 2, "estacion_nombre": "B", "visado_nombre": "A", "altura_instrumento": 1.5},
        {"id": "a3", "orden": 3, "estacion_nombre": "C", "visado_nombre": "B", "altura_instrumento": 1.5},
        {"id": "a4", "orden": 4, "estacion_nombre": "D", "visado_nombre": "C", "altura_instrumento": 1.5},
    ]
    azs = [0.0, 270.0, 180.0, 90.0]
    nombres = ["B", "C", "D", "A"]
    estaciones = [
        {
            "id": f"p{i+1}",
            "armada_id": f"a{i+1}",
            "orden": 1,
            "nombre_punto": nombres[i],
            "tipo_punto": "estacion",
            "angulo_medido": azs[i],
            "angulo_vertical": 90.0,
            "distancia": dists[i],
            "altura_objetivo": 0,
        }
        for i in range(4)
    ]
    if con_orientacion:
        armadas.append({
            "id": "a5", "orden": 5,
            "estacion_nombre": "A", "visado_nombre": "D",
            "altura_instrumento": 1.5,
        })
        estaciones.append({
            "id": "p5", "armada_id": "a5", "orden": 1,
            "nombre_punto": "CIERRE", "tipo_punto": "estacion",
            "angulo_medido": 0.0, "angulo_vertical": 90.0,
            "distancia": 0.0, "altura_objetivo": 0,
        })
    return armadas, estaciones, {"A": A, "D": D}, {"nombre": "A", **A}


class TestCierreLinealPreliminar(unittest.TestCase):
    def test_delta_y_precision_reales(self):
        armadas, estaciones, amarres, pi = _cuadrado([100.0, 100.0, 100.0, 100.5])
        arms, _, _ = radiar_armadas(armadas, estaciones, amarres)
        cierre = calcular_cierre_poligonal(
            arms, pi, tipo_pol="cerrada", tol_relativa=500, precision_angular_seg=10.0,
        )
        self.assertTrue(cierre["cerrado"])
        self.assertAlmostEqual(cierre["error_lineal"], 0.5, places=3)
        self.assertIsNotNone(cierre["delta_norte"])
        self.assertIsNotNone(cierre["delta_este"])
        self.assertNotEqual(cierre["precision"], None)
        self.assertGreater(cierre["precision"], 0)
        # 400.5 / 0.5 = 801 ≥ 500 → CUMPLE
        self.assertTrue(cierre["admisible_lineal"])

    def test_error_cero_cumple_con_precision_alta(self):
        armadas, estaciones, amarres, pi = _cuadrado([100.0, 100.0, 100.0, 100.0])
        arms, _, _ = radiar_armadas(armadas, estaciones, amarres)
        cierre = calcular_cierre_poligonal(
            arms, pi, tipo_pol="cerrada", tol_relativa=30000,
        )
        self.assertAlmostEqual(cierre["error_lineal"] or 0, 0.0, places=4)
        self.assertTrue(cierre["admisible_lineal"])
        self.assertIsNotNone(cierre["precision"])
        self.assertGreaterEqual(cierre["precision"], 30000)

    def test_no_cierre_prematuro_en_primera_visual(self):
        """Si el 1º punto adelante se llama como el inicial, no debe cerrar aún."""
        A = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        GPS = {"norte": 1000.0, "este": 2100.0, "cota": 100.0}
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "GPS", "visado_nombre": "A", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "A", "visado_nombre": "GPS", "altura_instrumento": 1.5},
            {"id": "a3", "orden": 3, "estacion_nombre": "B", "visado_nombre": "A", "altura_instrumento": 1.5},
        ]
        estaciones = [
            {"id": "p1", "armada_id": "a1", "orden": 1, "nombre_punto": "A", "tipo_punto": "estacion",
             "angulo_medido": 270.0, "angulo_vertical": 90.0, "distancia": 100.0, "altura_objetivo": 0},
            {"id": "p2", "armada_id": "a2", "orden": 1, "nombre_punto": "B", "tipo_punto": "estacion",
             "angulo_medido": 0.0, "angulo_vertical": 90.0, "distancia": 50.0, "altura_objetivo": 0},
            {"id": "p3", "armada_id": "a3", "orden": 1, "nombre_punto": "C", "tipo_punto": "estacion",
             "angulo_medido": 90.0, "angulo_vertical": 90.0, "distancia": 40.0, "altura_objetivo": 0},
        ]
        arms, _, _ = radiar_armadas(armadas, estaciones, {"A": A, "GPS": GPS})
        cierre = calcular_cierre_poligonal(arms, {"nombre": "A", **A}, tipo_pol="cerrada")
        # 3 legs: puede marcar cerrado por n_legs>=3, pero perímetro debe incluir los 3
        self.assertGreaterEqual(cierre["num_vertices"], 3)
        self.assertGreater(cierre["perimetro"], 150)


class TestBowditchAlTerminar(unittest.TestCase):
    def test_ajuste_cierra_lineal_a_cero(self):
        armadas, estaciones, amarres, pi = _cuadrado([100.0, 100.0, 100.0, 100.5])
        pol = {
            "sentido": "antihorario",
            "tipo": "cerrada",
            "tolerancia_relativa": 500,
            "precision_angular_seg": 10.0,
        }
        res = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, pi)
        # Preliminar con error
        self.assertGreater(res["resumen"]["error_lineal"], 0.1)
        # Tras Bowditch, coords del último tramo = punto inicial
        last = [u for u in res["updates"] if u.get("norte_ajustado") is not None][-1]
        self.assertAlmostEqual(last["norte_ajustado"], pi["norte"], places=3)
        self.assertAlmostEqual(last["este_ajustado"], pi["este"], places=3)
        post = res["cierre_ajustado"]
        self.assertLessEqual(abs(post.get("error_lineal") or 0), 1e-3)
        self.assertTrue(post.get("admisible_lineal"))

    def test_correccion_proporcional_a_distancia(self):
        armadas, estaciones, amarres, pi = _cuadrado([100.0, 100.0, 100.0, 100.5])
        pol = {"sentido": "antihorario", "tipo": "cerrada", "tolerancia_relativa": 500}
        res = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, pi)
        trav = [u for u in res["updates"] if u.get("correccion_este") is not None]
        # Tramo más largo (100.5) recibe mayor |corrección| en valor absoluto acumulado
        self.assertEqual(len(trav), 4)
        corr_e = [abs(u["correccion_este"]) for u in trav]
        self.assertGreaterEqual(corr_e[3], corr_e[0] - 1e-9)

    def test_cierre_tras_ajuste_no_empeora_al_reconsultar(self):
        """Simula GET post-Terminar: azimuts ajustados sin correcciones en ΣΔ.

        El cierre lineal mostrado debe seguir midiendo coords ajustadas (~0),
        nunca el residual az×dist (que puede ser peor que el preliminar).
        """
        armadas, estaciones, amarres, pi = _cuadrado([100.0, 100.0, 100.0, 100.5])
        pol = {
            "sentido": "antihorario",
            "tipo": "cerrada",
            "tolerancia_relativa": 500,
            "precision_angular_seg": 10.0,
            "ajustada_at": "2026-01-01T00:00:00Z",
        }
        res = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, pi)
        pre_prec = res["cierre"].get("precision") or 0
        pre_err = res["cierre"].get("error_lineal") or 0
        self.assertGreater(pre_err, 0.1)

        # Persistir updates como haría el POST /cerrar
        by_id = {u["id"]: u for u in res["updates"] if u.get("id")}
        estaciones_db = []
        for e in estaciones:
            u = by_id.get(e["id"], {})
            estaciones_db.append({**e, **u})

        arms, _, _ = radiar_armadas(armadas, estaciones_db, amarres)
        # Overlay azimuts (como obtener_poligonal)
        from topografia_utils import _aplicar_azimuts_a_armadas

        arms = _aplicar_azimuts_a_armadas(arms, by_id)
        cierre_vivo = calcular_cierre_poligonal(
            arms, pi, tipo_pol="cerrada", tol_relativa=500, sentido="antihorario",
        )
        # Sin corrección: residual az×dist puede ser > preliminar
        cierre_ok = aplicar_cierre_lineal_coords_ajustadas(
            cierre_vivo,
            punto_inicial=pi,
            estaciones=estaciones_db,
            tol_relativa=500,
        )
        self.assertLessEqual(abs(cierre_ok.get("error_lineal") or 0), 1e-3)
        self.assertTrue(cierre_ok.get("cierre_desde_coords_ajustadas"))
        post_prec = cierre_ok.get("precision") or 0
        self.assertGreaterEqual(post_prec, pre_prec)

        # Preliminar reconstruible para auditoría
        pol_saved = {
            **pol,
            "error_cierre_dn": res["resumen"]["error_dn"],
            "error_cierre_de": res["resumen"]["error_de"],
            "error_lineal_preliminar": res["cierre"]["error_lineal"],
            "precision_relativa_preliminar": res["cierre"]["precision"],
            "error_lineal": cierre_ok["error_lineal"],
            "precision_relativa": cierre_ok["precision"],
        }
        pre = reconstruir_cierre_preliminar(pol_saved, cierre_ok.get("perimetro"))
        self.assertIsNotNone(pre)
        self.assertAlmostEqual(pre["error_lineal"], pre_err, places=3)
        self.assertTrue(pre["es_preliminar"])


if __name__ == "__main__":
    unittest.main()
