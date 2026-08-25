"""
Regresión: con coordenadas reales de amarre, Ang.Obs. ES el azimut (lectura directa);
sin coordenadas, ceros atrás (Az = 0 + α).

Az_base (estación→visado) es solo referencia de orientación (backsight); no se combina
con las lecturas de puntos cuando método = coordenadas.

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_azimut_amarre -v
"""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_utils import (  # noqa: E402
    azimut_base_referencia,
    azimut_desde_deltas,
    azimut_punto_desde_lectura,
    calcular_cierre_poligonal,
    radiar_armadas,
)


class TestAzimutDesdeDeltas(unittest.TestCase):
    def test_cuadrantes(self):
        self.assertAlmostEqual(azimut_desde_deltas(1, 0), 0.0)
        self.assertAlmostEqual(azimut_desde_deltas(0, 1), 90.0)
        self.assertAlmostEqual(azimut_desde_deltas(-1, 0), 180.0)
        self.assertAlmostEqual(azimut_desde_deltas(0, -1), 270.0)


class TestAzimutBaseReferencia(unittest.TestCase):
    def test_con_coordenadas_reales(self):
        est = {"norte": 1000.0, "este": 2000.0}
        vis = {"norte": 1000.0, "este": 2100.0}  # 100 m al este → Az = 90°
        az, metodo = azimut_base_referencia(est, vis)
        self.assertEqual(metodo, "coordenadas")
        self.assertAlmostEqual(az, 90.0)

    def test_sin_coordenadas_usa_ceros_atras(self):
        az, metodo = azimut_base_referencia(None, None)
        self.assertEqual(metodo, "ceros_atras")
        self.assertEqual(az, 0.0)
        az2, metodo2 = azimut_base_referencia({"norte": 1}, {"norte": 2, "este": 3})
        self.assertEqual(metodo2, "ceros_atras")
        self.assertEqual(az2, 0.0)


class TestAzimutPuntoDesdeLectura(unittest.TestCase):
    def test_coordenadas_lectura_directa(self):
        self.assertAlmostEqual(azimut_punto_desde_lectura(45.0, "coordenadas", 90.0), 45.0)
        self.assertAlmostEqual(azimut_punto_desde_lectura(286.1684389, "coordenadas", 0.0), 286.1684389 % 360)

    def test_ceros_atras_suma_base(self):
        self.assertAlmostEqual(azimut_punto_desde_lectura(45.0, "ceros_atras", 0.0), 45.0)
        self.assertAlmostEqual(azimut_punto_desde_lectura(45.0, "ceros_atras", 90.0), 135.0)


class TestRadiarArmadas(unittest.TestCase):
    def test_con_amarres_azimut_es_angulo_obs_directo(self):
        """Con N/E: base=90° (orientación); Ang.Obs.=45° → Az punto = 45° (no 135°)."""
        est = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        vis = {"norte": 1000.0, "este": 2100.0, "cota": 100.0}
        armadas = [
            {
                "id": "a1",
                "orden": 1,
                "estacion_nombre": "E1",
                "visado_nombre": "V1",
                "altura_instrumento": 1.5,
            }
        ]
        estaciones = [
            {
                "id": "p1",
                "armada_id": "a1",
                "orden": 1,
                "nombre_punto": "P1",
                "tipo_punto": "estacion",
                "angulo_medido": 45.0,
                "angulo_vertical": 0.0,
                "distancia": 100.0,
                "altura_objetivo": 0,
            }
        ]
        arms, known, flat = radiar_armadas(armadas, estaciones, {"E1": est, "V1": vis})

        self.assertEqual(arms[0]["metodo_azimut"], "coordenadas")
        self.assertAlmostEqual(arms[0]["base_azimut"], 90.0)
        self.assertAlmostEqual(flat[0]["azimut"], 45.0)
        self.assertEqual(flat[0]["metodo_azimut"], "coordenadas")
        self.assertAlmostEqual(
            flat[0]["norte"],
            1000 + 100 * math.cos(math.radians(45)),
            places=3,
        )
        self.assertAlmostEqual(
            flat[0]["este"],
            2000 + 100 * math.sin(math.radians(45)),
            places=3,
        )
        self.assertIn("P1", known)

    def test_sin_amarres_ceros_atras_az_igual_lectura(self):
        """Sin N/E de amarre: Az_base = 0 → Az_punto = α_obs (ceros atrás)."""
        armadas = [
            {
                "id": "a1",
                "orden": 1,
                "estacion_nombre": "E1",
                "visado_nombre": "V1",
                "altura_instrumento": 1.5,
            }
        ]
        estaciones = [
            {
                "id": "p1",
                "armada_id": "a1",
                "orden": 1,
                "nombre_punto": "P1",
                "tipo_punto": "auxiliar",
                "angulo_medido": 45.0,
                "angulo_vertical": None,
                "distancia": 100.0,
                "altura_objetivo": 0,
            }
        ]
        arms, _, flat = radiar_armadas(armadas, estaciones, {})
        self.assertEqual(arms[0]["metodo_azimut"], "ceros_atras")
        self.assertAlmostEqual(arms[0]["base_azimut"], 0.0)
        self.assertAlmostEqual(flat[0]["azimut"], 45.0)
        self.assertIsNone(flat[0]["norte"])
        self.assertIsNone(flat[0]["este"])

    def test_cierre_usa_azimut_lectura_directa(self):
        """Con coords: lectura 90° (azimut real al este) → Az=90°, no base+0."""
        est = {"norte": 1000.0, "este": 2000.0, "cota": 100.0, "nombre": "E1"}
        vis = {"norte": 1000.0, "este": 2100.0, "cota": 100.0, "nombre": "V1"}
        armadas = [
            {
                "id": "a1",
                "orden": 1,
                "estacion_nombre": "E1",
                "visado_nombre": "V1",
                "altura_instrumento": 1.5,
            }
        ]
        estaciones = [
            {
                "id": "p1",
                "armada_id": "a1",
                "orden": 1,
                "nombre_punto": "E1",
                "tipo_punto": "estacion",
                "angulo_medido": 90.0,
                "angulo_vertical": 0.0,
                "distancia": 50.0,
                "altura_objetivo": 0,
            }
        ]
        arms, _, _ = radiar_armadas(armadas, estaciones, {"E1": est, "V1": vis})
        self.assertAlmostEqual(arms[0]["puntos"][0]["azimut"], 90.0)
        self.assertEqual(arms[0]["metodo_azimut"], "coordenadas")
        cierre = calcular_cierre_poligonal(arms, est, sentido="antihorario", tipo_pol="cerrada")
        self.assertIsInstance(cierre, dict)

    def test_armada_siguiente_base_por_coordenadas_no_combina_con_puntos(self):
        """Contra-azimut Estación→Visado entre armadas: base de armada 2 = atan2, no Az_punto±α."""
        gps2 = {"norte": 1000.0, "este": 2000.0, "cota": 100.0}
        gps1 = {"norte": 1000.0, "este": 1900.0, "cota": 100.0}  # 100 m al oeste → Az GPS2→GPS1 = 270°
        armadas = [
            {
                "id": "a1",
                "orden": 1,
                "estacion_nombre": "GPS2",
                "visado_nombre": "GPS1",
                "altura_instrumento": 1.5,
            },
            {
                "id": "a2",
                "orden": 2,
                "estacion_nombre": "D1",
                "visado_nombre": "GPS2",
                "altura_instrumento": 1.5,
            },
        ]
        # Ang.Obs. = azimut real leído (equipo orientado). D1 al este → 90°.
        estaciones = [
            {
                "id": "p1",
                "armada_id": "a1",
                "orden": 1,
                "nombre_punto": "D1",
                "tipo_punto": "estacion",
                "angulo_medido": 90.0,
                "angulo_vertical": 90.0,
                "distancia": 50.0,
                "altura_objetivo": 0,
            },
            {
                "id": "p2",
                "armada_id": "a2",
                "orden": 1,
                "nombre_punto": "D2",
                "tipo_punto": "estacion",
                "angulo_medido": 0.0,
                "angulo_vertical": 90.0,
                "distancia": 40.0,
                "altura_objetivo": 0,
            },
        ]
        arms, known, flat = radiar_armadas(
            armadas, estaciones, {"GPS2": gps2, "GPS1": gps1}
        )
        self.assertAlmostEqual(arms[0]["base_azimut"], 270.0)
        self.assertAlmostEqual(flat[0]["azimut"], 90.0)
        # Armada 2: estación D1 radiada, visado GPS2 con coords → azimut D1→GPS2 = 270°
        self.assertEqual(arms[1]["metodo_azimut"], "coordenadas")
        self.assertAlmostEqual(arms[1]["base_azimut"], 270.0, places=2)
        self.assertAlmostEqual(flat[1]["azimut"], 0.0)
        self.assertIn("D1", known)


if __name__ == "__main__":
    unittest.main()
