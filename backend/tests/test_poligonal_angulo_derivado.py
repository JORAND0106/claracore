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
        cah = calcular_cierre_poligonal(arms, {"nombre": "A", **A}, sentido="antihorario", tipo_pol="cerrada")
        cho = calcular_cierre_poligonal(arms, {"nombre": "A", **A}, sentido="horario", tipo_pol="cerrada")
        self.assertAlmostEqual(cah["suma_observada"], cho["suma_observada"])
        self.assertEqual(cah["suma_teorica"], 360)
        self.assertEqual(cho["suma_teorica"], 1080)


if __name__ == "__main__":
    unittest.main()
