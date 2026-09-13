"""
Ángulo observado derivado para cierre angular (método coordenadas).

Despeje único (sin signo por Sentido):
  Ang_Obs = (Az_siguiente − Az_anterior − 180°) mod 360
         ≡ (Az_siguiente − base_azimut) mod 360

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_angulo_derivado -v
"""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_utils import (  # noqa: E402
    angulo_obs_derivado_desde_azimuts,
    angulo_obs_derivado_desde_base,
    calcular_cierre_poligonal,
    decimal_to_gms,
    inferir_sentido_poligonal,
    radiar_armadas,
)


class TestDespejeUnico(unittest.TestCase):
    def test_equivalencia_base_y_anterior(self):
        az_ant, az_sig = 10.0, 100.0
        a = angulo_obs_derivado_desde_azimuts(az_sig, az_ant)
        b = angulo_obs_derivado_desde_base(az_sig, (az_ant + 180) % 360)
        self.assertAlmostEqual(a, b)
        # (100 − 10 − 180) mod 360 = 270
        self.assertAlmostEqual(a, 270.0)

    def test_normalizacion_negativo(self):
        # Az_sig=10, Az_ant=200 → (10-200-180)= -370 → mod 360 = 350
        self.assertAlmostEqual(angulo_obs_derivado_desde_azimuts(10.0, 200.0), 350.0)


class TestCuadradoPerfecto(unittest.TestCase):
    """Cuadrado antihorario: 4×90° = 360° = (n−2)×180°. Horario: 4×270° = 1080°."""

    def _cuadrado_ah(self):
        # A(1000,2000) → B norte → C oeste → D sur → A este
        # Visado inicial al sur de A → base=180°; Az B=0° → ang=(0-180)%360=180? 
        # Mejor: cadena con amarres A y V, y cierre en A.
        # Vértices: A(0,0), B(0,100), C(-100,100), D(-100,0)
        # Az: A→B=0, B→C=270, C→D=180, D→A=90
        # Visado de A: punto al este V(0,-1) wait este is +E: V at (0 negative N)? 
        # Para base=180° (sur): visado S( -1 N, 0 E) from A(0,0) → az=180
        A = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        V = {"norte": 900.0, "este": 2000.0, "cota": 100.0}  # sur → base 180°
        # Con base 180 y Az A→B = 0: ang = (0-180)%360 = 180 (exterior en 1ª estación
        # si el visado no es el lado previo). Para cuadrado cerrado con 4 vértices
        # radiados desde estaciones A,B,C,D con cierre a A:
        # Usamos azimuts de lados y bases recíprocas de radiar_armadas.
        azs = [0.0, 270.0, 180.0, 90.0]
        nombres = ["B", "C", "D", "A"]
        estaciones_nombres = ["A", "B", "C", "D"]
        visados = ["V", "A", "B", "C"]
        armadas = []
        estaciones = []
        for i in range(4):
            armadas.append({
                "id": f"a{i+1}",
                "orden": i + 1,
                "estacion_nombre": estaciones_nombres[i],
                "visado_nombre": visados[i],
                "altura_instrumento": 1.5,
            })
            estaciones.append({
                "id": f"p{i+1}",
                "armada_id": f"a{i+1}",
                "orden": 1,
                "nombre_punto": nombres[i],
                "tipo_punto": "estacion",
                "angulo_medido": azs[i],
                "angulo_vertical": 90.0,
                "distancia": 100.0,
                "altura_objetivo": 0,
            })
        amarres = {"A": A, "V": V}
        return armadas, estaciones, amarres, A

    def test_antihorario_error_cero(self):
        armadas, estaciones, amarres, A = self._cuadrado_ah()
        arms, _, flat = radiar_armadas(armadas, estaciones, amarres)
        self.assertTrue(all(a["metodo_azimut"] == "coordenadas" for a in arms))
        # Azimuts no alterados
        for i, az in enumerate([0.0, 270.0, 180.0, 90.0]):
            self.assertAlmostEqual(flat[i]["azimut"], az, places=5)
        cierre = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A}, sentido="antihorario", tipo_pol="cerrada",
            precision_angular_seg=10.0,
        )
        self.assertTrue(cierre["angulos_derivados"])
        self.assertTrue(cierre["cerrado"])
        # Ángulos derivados: est. A con base 180 → (0-180)%360=180;
        # luego B base=0+180=180 → (270-180)=90; C base=270+180=90 → 90; D base=180+180=0 → 90
        # Σ = 180+90+90+90 = 450 ≠ 360 — la 1ª estación con visado externo no es el lado previo.
        # Para un cierre con vértices del polígono, el visado de A debe ser D (lado previo).
        # Reconstruimos con visado inicial = D ficticio vía coords: D radiado antes no existe.
        # Usamos azimut de llegada sintético: plantamos A con visado D conocido.
        D = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}  # oeste de A → az A→D=270; D→A=90
        # Polígono A→B→C→D→A con Amarres A y D (D como visado inicial = lado previo invertido)
        # Visado en A debe mirar a D: Az_base A→D = 270°. Az_fwd A→B = 0 → ang=(0-270)%360=90 ✓
        A2 = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        D2 = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "A", "visado_nombre": "D", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "B", "visado_nombre": "A", "altura_instrumento": 1.5},
            {"id": "a3", "orden": 3, "estacion_nombre": "C", "visado_nombre": "B", "altura_instrumento": 1.5},
            {"id": "a4", "orden": 4, "estacion_nombre": "D", "visado_nombre": "C", "altura_instrumento": 1.5},
        ]
        # D amarre fijo: al radiar D desde C con az 180 dist 100 llegamos a D amarre.
        # B: N=1100 E=2000; C: N=1100 E=1900; cierre D amarre.
        azs = [0.0, 270.0, 180.0, 90.0]  # último D→A az=90, nombre A
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
                "distancia": 100.0,
                "altura_objetivo": 0,
            }
            for i in range(4)
        ]
        arms, known, flat = radiar_armadas(armadas, estaciones, {"A": A2, "D": D2})
        self.assertAlmostEqual(arms[0]["base_azimut"], 270.0)
        for i, az in enumerate(azs):
            self.assertAlmostEqual(flat[i]["azimut"], az, places=5)
        # Coordenadas / azimuts intactos
        self.assertAlmostEqual(flat[0]["norte"], 1100.0, places=3)
        self.assertAlmostEqual(flat[0]["este"], 2000.0, places=3)
        cierre = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A2}, sentido="antihorario", tipo_pol="cerrada",
            precision_angular_seg=10.0,
        )
        self.assertTrue(cierre["angulos_derivados"])
        dets = cierre["angulos_cierre_detalle"]
        self.assertEqual(len(dets), 4)
        for d in dets:
            self.assertTrue(d["derivado"])
            self.assertAlmostEqual(d["angulo_cierre"], 90.0, places=4)
        self.assertAlmostEqual(cierre["suma_observada"], 360.0, places=4)
        self.assertAlmostEqual(cierre["suma_teorica"], 360.0)
        self.assertAlmostEqual(cierre["error_angular_seg"] or 0, 0.0, places=1)
        self.assertTrue(cierre["admisible_angular"])
        # Cierre lineal no debe romperse por el cambio angular
        self.assertIsNotNone(cierre["error_lineal"])

    def test_ceros_atras_sin_derivar(self):
        armadas = [{
            "id": "a1", "orden": 1,
            "estacion_nombre": "E1", "visado_nombre": "V1",
            "altura_instrumento": 1.5,
        }]
        estaciones = [{
            "id": "p1", "armada_id": "a1", "orden": 1,
            "nombre_punto": "E1", "tipo_punto": "estacion",
            "angulo_medido": 90.0, "angulo_vertical": None,
            "distancia": 50.0, "altura_objetivo": 0,
        }]
        arms, _, flat = radiar_armadas(armadas, estaciones, {})
        self.assertEqual(arms[0]["metodo_azimut"], "ceros_atras")
        self.assertIsNone(flat[0].get("angulo_derivado"))
        cierre = calcular_cierre_poligonal(
            arms, {"nombre": "E1"}, sentido="antihorario", tipo_pol="cerrada",
        )
        self.assertFalse(cierre.get("angulos_derivados"))


class TestSentidoSoloTeorica(unittest.TestCase):
    def test_mismo_angulo_derivado_distinto_teorico(self):
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
                "id": f"p{i+1}", "armada_id": f"a{i+1}", "orden": 1,
                "nombre_punto": nombres[i], "tipo_punto": "estacion",
                "angulo_medido": azs[i], "angulo_vertical": 90.0,
                "distancia": 100.0, "altura_objetivo": 0,
            }
            for i in range(4)
        ]
        arms, _, _ = radiar_armadas(armadas, estaciones, {"A": A, "D": D})
        cah = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A}, sentido="antihorario", tipo_pol="cerrada",
            inferir_sentido=False,
        )
        cho = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A}, sentido="horario", tipo_pol="cerrada",
            inferir_sentido=False,
        )
        self.assertAlmostEqual(cah["suma_observada"], cho["suma_observada"])
        self.assertEqual(cah["suma_teorica"], 360)
        self.assertEqual(cho["suma_teorica"], 1080)

    def test_inferencia_semiautomatica_antihorario(self):
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
                "id": f"p{i+1}", "armada_id": f"a{i+1}", "orden": 1,
                "nombre_punto": nombres[i], "tipo_punto": "estacion",
                "angulo_medido": azs[i], "angulo_vertical": 90.0,
                "distancia": 100.0, "altura_objetivo": 0,
            }
            for i in range(4)
        ]
        arms, _, _ = radiar_armadas(armadas, estaciones, {"A": A, "D": D})
        # Declarado horario (errado); la inferencia debe corregir a antihorario.
        cierre = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A}, sentido="horario", tipo_pol="cerrada",
            inferir_sentido=True,
        )
        self.assertEqual(cierre["sentido_inferido"], "antihorario")
        self.assertEqual(cierre["sentido"], "antihorario")
        self.assertEqual(cierre["suma_teorica"], 360)
        self.assertTrue(cierre["sentido_auto"])


class TestDerivacionUniformeYOrientRef(unittest.TestCase):
    """Regresión: azimut directo + 2 armadas sin N/E de visado + orient. ref. arranque/cierre."""

    def _gms(self, g, m, s):
        return g + m / 60.0 + s / 3600.0

    def test_visado_sin_coords_sigue_derivando(self):
        """Si la cadena ya es azimut directo, un visado sin N/E no debe romper la derivación."""
        gps2 = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        gps1 = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}  # base GPS2→GPS1 = 270°
        az_start = self._gms(164, 19, 53)
        az_mid = self._gms(100, 0, 0)
        az_end = self._gms(50, 0, 0)
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "GPS2", "visado_nombre": "GPS1", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "D1", "visado_nombre": "GPS2", "altura_instrumento": 1.5},
            # Visado inventado sin coordenadas → antes caía a ceros_atrás
            {"id": "a3", "orden": 3, "estacion_nombre": "D2", "visado_nombre": "SIN_COORDS", "altura_instrumento": 1.5},
            {"id": "a4", "orden": 4, "estacion_nombre": "D3", "visado_nombre": "D2", "altura_instrumento": 1.5},
        ]
        estaciones = [
            {
                "id": "p1", "armada_id": "a1", "orden": 1, "nombre_punto": "D1",
                "tipo_punto": "estacion", "angulo_medido": az_start, "angulo_vertical": 90.0,
                "distancia": 50.0, "altura_objetivo": 0,
            },
            {
                "id": "p2", "armada_id": "a2", "orden": 1, "nombre_punto": "D2",
                "tipo_punto": "estacion", "angulo_medido": az_mid, "angulo_vertical": 90.0,
                "distancia": 40.0, "altura_objetivo": 0,
            },
            {
                "id": "p3", "armada_id": "a3", "orden": 1, "nombre_punto": "D3",
                "tipo_punto": "estacion", "angulo_medido": az_end, "angulo_vertical": 90.0,
                "distancia": 35.0, "altura_objetivo": 0,
            },
            {
                "id": "p4", "armada_id": "a4", "orden": 1, "nombre_punto": "D4",
                "tipo_punto": "estacion", "angulo_medido": 10.0, "angulo_vertical": 90.0,
                "distancia": 30.0, "altura_objetivo": 0,
            },
        ]
        arms, _, flat = radiar_armadas(armadas, estaciones, {"GPS2": gps2, "GPS1": gps1})
        self.assertTrue(all(a["metodo_azimut"] == "coordenadas" for a in arms))
        self.assertTrue(all(p.get("angulo_derivado_para_cierre") for p in flat))
        # Armada 3 (visado sin coords) debe usar recíproco de llegada a D2
        self.assertAlmostEqual(arms[2]["base_azimut"], (az_mid + 180) % 360, places=5)

    def test_orient_ref_usa_azimut_arranque_no_amarre(self):
        """Orient. ref. = azimut primer lado vs azimut de orientación final (~55"), no GPS."""
        # D1 = vértice inicial. GPS2 en la dirección del lado previo (D4), para que
        # el ángulo derivado en D1 sea el exterior de la poligonal (270° horario).
        d1 = {"norte": 5000.0, "este": 6000.0, "cota": 100.0}
        az_arranque = self._gms(164, 19, 53)
        az_cierre = self._gms(164, 18, 58)
        az_backsight = (az_arranque + 90) % 360  # D1 → D4 (= recíproco del último lado)
        gps2 = {
            "norte": d1["norte"] + 80.0 * math.cos(math.radians(az_backsight)),
            "este": d1["este"] + 80.0 * math.sin(math.radians(az_backsight)),
            "cota": 100.0,
        }
        azs_lados = [
            az_arranque,
            (az_arranque + 90) % 360,
            (az_arranque + 180) % 360,
            (az_arranque + 270) % 360,
        ]
        nombres_est = ["D1", "D2", "D3", "D4"]
        nombres_fwd = ["D2", "D3", "D4", "D1"]
        visados = ["GPS2", "D1", "D2", "D3"]
        armadas = []
        estaciones = []
        for i in range(4):
            armadas.append({
                "id": f"a{i+1}", "orden": i + 1,
                "estacion_nombre": nombres_est[i],
                "visado_nombre": visados[i],
                "altura_instrumento": 1.5,
            })
            estaciones.append({
                "id": f"p{i+1}", "armada_id": f"a{i+1}", "orden": 1,
                "nombre_punto": nombres_fwd[i], "tipo_punto": "estacion",
                "angulo_medido": azs_lados[i], "angulo_vertical": 90.0,
                "distancia": 100.0, "altura_objetivo": 0,
            })
        armadas.append({
            "id": "a5", "orden": 5,
            "estacion_nombre": "D1", "visado_nombre": "GPS2",
            "altura_instrumento": 1.5,
        })
        estaciones.append({
            "id": "p5", "armada_id": "a5", "orden": 1,
            "nombre_punto": "CIERRE", "tipo_punto": "estacion",
            "angulo_medido": az_cierre, "angulo_vertical": 90.0,
            "distancia": 0.0, "altura_objetivo": 0,
        })
        arms, _, _ = radiar_armadas(armadas, estaciones, {"D1": d1, "GPS2": gps2})
        cierre = calcular_cierre_poligonal(
            arms,
            {"nombre": "D1", **d1},
            sentido="horario",
            tipo_pol="cerrada",
            precision_angular_seg=10.0,
        )
        self.assertTrue(cierre["tiene_orientacion"])
        self.assertTrue(cierre["angulos_derivados"])
        self.assertEqual(cierre["azimut_referencia_inicial_texto"], decimal_to_gms(az_arranque))
        self.assertEqual(cierre["azimut_referencia_final_texto"], decimal_to_gms(az_cierre))
        self.assertFalse((cierre["azimut_referencia_inicial_texto"] or "").startswith("286"))
        self.assertIsNotNone(cierre["error_orientacion_seg"])
        self.assertLess(abs(cierre["error_orientacion_seg"]), 120)
        self.assertAlmostEqual(cierre["error_orientacion_seg"], -55.0, delta=1.0)
        # Diferencia genuina Σobs−Σteor (= Orient.ref de forma natural, no por copia)
        self.assertAlmostEqual(cierre["error_angular_seg"], -55.0, delta=1.0)
        self.assertAlmostEqual(
            cierre["error_angular_seg"], cierre["error_orientacion_seg"], delta=0.05,
        )
        self.assertAlmostEqual(
            (cierre["suma_observada"] - cierre["suma_teorica"]) * 3600,
            cierre["error_angular_seg"],
            delta=0.05,
        )
        self.assertIsNotNone(cierre.get("angulo_amarre_inicial_excluido"))

    def test_dos_angulos_sin_coords_visado_no_corrompen_suma(self):
        """Dos armadas con visado sin N/E deben derivarse igual y no inflar Σ observada."""
        A = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        D = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "A", "visado_nombre": "D", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "B", "visado_nombre": "SIN_A", "altura_instrumento": 1.5},
            {"id": "a3", "orden": 3, "estacion_nombre": "C", "visado_nombre": "SIN_B", "altura_instrumento": 1.5},
            {"id": "a4", "orden": 4, "estacion_nombre": "D", "visado_nombre": "C", "altura_instrumento": 1.5},
        ]
        azs = [0.0, 270.0, 180.0, 90.0]
        nombres = ["B", "C", "D", "A"]
        estaciones = [
            {
                "id": f"p{i+1}", "armada_id": f"a{i+1}", "orden": 1,
                "nombre_punto": nombres[i], "tipo_punto": "estacion",
                "angulo_medido": azs[i], "angulo_vertical": 90.0,
                "distancia": 100.0, "altura_objetivo": 0,
            }
            for i in range(4)
        ]
        arms, _, _ = radiar_armadas(armadas, estaciones, {"A": A, "D": D})
        self.assertTrue(all(a["metodo_azimut"] == "coordenadas" for a in arms))
        cierre = calcular_cierre_poligonal(
            arms, {"nombre": "A", **A}, sentido="antihorario", tipo_pol="cerrada",
            inferir_sentido=False,
        )
        self.assertTrue(all(d["derivado"] for d in cierre["angulos_cierre_detalle"]))
        self.assertAlmostEqual(cierre["suma_observada"], 360.0, places=3)
        self.assertAlmostEqual(cierre["error_angular_seg"] or 0, 0.0, delta=1.0)

    def test_nombre_estacion_desfasado_sigue_derivando_secuencial(self):
        """Si estacion_nombre no coincide con el punto radiado, usar azimut del lado previo."""
        gps2 = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        gps1 = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}
        azs = [164.3313888889, 100.0, 50.0, 10.0]
        # Armadas 3 y 4: nombres de estación que NO coinciden con el punto anterior
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "GPS2", "visado_nombre": "GPS1", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "D1", "visado_nombre": "GPS2", "altura_instrumento": 1.5},
            {"id": "a3", "orden": 3, "estacion_nombre": "EST_X", "visado_nombre": "SIN_COORDS", "altura_instrumento": 1.5},
            {"id": "a4", "orden": 4, "estacion_nombre": "EST_Y", "visado_nombre": "TAMPOCO", "altura_instrumento": 1.5},
        ]
        nombres = ["D1", "D2", "D3", "D4"]
        estaciones = [
            {
                "id": f"p{i+1}", "armada_id": f"a{i+1}", "orden": 1,
                "nombre_punto": nombres[i], "tipo_punto": "estacion",
                "angulo_medido": azs[i], "angulo_vertical": 90.0,
                "distancia": 40.0, "altura_objetivo": 0,
            }
            for i in range(4)
        ]
        arms, _, flat = radiar_armadas(armadas, estaciones, {"GPS2": gps2, "GPS1": gps1})
        self.assertTrue(all(a["metodo_azimut"] == "coordenadas" for a in arms))
        self.assertTrue(all(
            p.get("angulo_derivado_para_cierre") and p.get("angulo_derivado") is not None
            for p in flat
        ))
        # Ningún ángulo derivado debe ser copia del azimut directo
        for p in flat:
            self.assertGreater(abs(float(p["angulo_derivado"]) - float(p["azimut"])), 1e-6)

    def test_ceros_atras_sigue_sin_forzar_coordenadas(self):
        armadas = [
            {"id": "a1", "orden": 1, "estacion_nombre": "E1", "visado_nombre": "V1", "altura_instrumento": 1.5},
            {"id": "a2", "orden": 2, "estacion_nombre": "E2", "visado_nombre": "E1", "altura_instrumento": 1.5},
        ]
        estaciones = [
            {
                "id": "p1", "armada_id": "a1", "orden": 1, "nombre_punto": "E2",
                "tipo_punto": "estacion", "angulo_medido": 90.0, "angulo_vertical": None,
                "distancia": 50.0, "altura_objetivo": 0,
            },
            {
                "id": "p2", "armada_id": "a2", "orden": 1, "nombre_punto": "E3",
                "tipo_punto": "estacion", "angulo_medido": 90.0, "angulo_vertical": None,
                "distancia": 40.0, "altura_objetivo": 0,
            },
        ]
        arms, _, flat = radiar_armadas(armadas, estaciones, {})
        self.assertTrue(all(a["metodo_azimut"] == "ceros_atras" for a in arms))
        self.assertTrue(all(p.get("angulo_derivado") is None for p in flat))
        cierre = calcular_cierre_poligonal(arms, {"nombre": "E1"}, sentido="antihorario")
        self.assertFalse(cierre.get("angulos_derivados"))


class TestInferirSentidoHelper(unittest.TestCase):
    def test_horario_por_suma(self):
        # n=4 → teor H=1080, A=360; suma cerca de 1080
        self.assertEqual(inferir_sentido_poligonal(1080.05, 4), "horario")

    def test_antihorario_por_suma(self):
        self.assertEqual(inferir_sentido_poligonal(360.1, 4), "antihorario")

    def test_orientacion_no_fuerza_si_suma_es_interior(self):
        # n=32 → teor A=5400, H=6120; suma cerca de 5400 ⇒ antihorario aunque haya orientación
        self.assertEqual(
            inferir_sentido_poligonal(5399.98, 32, tiene_orientacion=True),
            "antihorario",
        )

    def test_orientacion_empate_puede_preferir_horario(self):
        # Empate exacto a mitad: winding vacío → desempate con orientación
        mid = ((32 + 2) * 180 + (32 - 2) * 180) / 2
        self.assertEqual(
            inferir_sentido_poligonal(mid, 32, tiene_orientacion=True),
            "horario",
        )


if __name__ == "__main__":
    unittest.main()
