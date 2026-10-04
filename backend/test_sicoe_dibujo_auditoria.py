"""Tests nodo contenedor + auditoría desde dibujos (SicoeObra)."""
from __future__ import annotations

import unittest

from sicoe_dibujo_auditoria import (
    centro_desde_feature,
    cluster_puntos_por_radio,
    dibujo_tipo_desde_feature,
    elegir_contenedor_cercano,
    hallazgos_cantidad_mayor_area_dibujo,
    hallazgos_traslapo_nodo_contenedor,
    interseccion_lineas_aprox_m,
    mensaje_nodo_alojado,
    resumen_dibujos_contrato,
)


class TestNodoContenedor(unittest.TestCase):
    def test_mensaje_alojado(self):
        self.assertIn("alojado", mensaje_nodo_alojado(12).lower())
        self.assertIn("12", mensaje_nodo_alojado(12))

    def test_cluster_radio_1m(self):
        pts = [
            {"lat": 4.700000, "lng": -74.050000, "id": 1},
            {"lat": 4.700008, "lng": -74.050000, "id": 2},  # ~0.9 m
            {"lat": 4.701000, "lng": -74.050000, "id": 3},  # ~111 m
        ]
        clusters = cluster_puntos_por_radio(pts, radio_m=1.0)
        self.assertEqual(len(clusters), 2)
        sizes = sorted(len(c) for c in clusters)
        self.assertEqual(sizes, [1, 2])

    def test_elegir_contenedor_cercano(self):
        conts = [
            {"id": 10, "coord_lat": 4.7, "coord_lng": -74.05},
            {"id": 11, "coord_lat": 4.8, "coord_lng": -74.05},
        ]
        hit = elegir_contenedor_cercano({"lat": 4.700005, "lng": -74.05}, conts, radio_m=1.0)
        self.assertIsNotNone(hit)
        self.assertEqual(hit["id"], 10)
        miss = elegir_contenedor_cercano({"lat": 4.71, "lng": -74.05}, conts, radio_m=1.0)
        self.assertIsNone(miss)


class TestHallazgosDibujo(unittest.TestCase):
    def test_traslapo_mismo_item_en_contenedor(self):
        reps = [{"id": 1, "numero_reporte": 1}, {"id": 2, "numero_reporte": 2}]
        regs = {
            1: [{"id": 101, "reporte_id": 1, "item_numero": "1.1", "numero_registro": 1}],
            2: [{"id": 201, "reporte_id": 2, "item_numero": "1.1", "numero_registro": 1}],
        }
        hs = hallazgos_traslapo_nodo_contenedor(reps, regs)
        self.assertEqual(len(hs), 1)
        self.assertEqual(hs[0]["tipo"], "traslapo")
        self.assertIn("1.1", hs[0]["texto"])

    def test_items_distintos_no_traslapan(self):
        reps = [{"id": 1, "numero_reporte": 1}, {"id": 2, "numero_reporte": 2}]
        regs = {
            1: [{"id": 101, "reporte_id": 1, "item_numero": "1.1"}],
            2: [{"id": 201, "reporte_id": 2, "item_numero": "2.2"}],
        }
        hs = hallazgos_traslapo_nodo_contenedor(reps, regs)
        self.assertEqual(hs, [])

    def test_cantidad_mayor_area(self):
        # Cuadrado ~10m x 10m cerca del ecuador ≈ 100 m²
        ring = [
            [-74.05, 4.70],
            [-74.05 + (10 / 111320), 4.70],
            [-74.05 + (10 / 111320), 4.70 + (10 / 110540)],
            [-74.05, 4.70 + (10 / 110540)],
            [-74.05, 4.70],
        ]
        feat = {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"dibujo_tipo": "poligono", "huella_tipo": "poligono"},
        }
        regs = [
            {"id": 1, "reporte_id": 9, "item_numero": "4.1", "unidad": "m2", "cantidad_total": 150},
        ]
        hs = hallazgos_cantidad_mayor_area_dibujo({"numero_reporte": 9}, feat, regs)
        self.assertEqual(len(hs), 1)
        self.assertEqual(hs[0]["tipo"], "cantidad_mayor_area")

    def test_centro_y_tipo(self):
        feat = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-74.1, 4.5]},
            "properties": {"dibujo_tipo": "nodo"},
        }
        self.assertEqual(dibujo_tipo_desde_feature(feat), "nodo")
        c = centro_desde_feature(feat)
        self.assertAlmostEqual(c["lng"], -74.1)
        self.assertAlmostEqual(c["lat"], 4.5)

    def test_resumen_dibujos(self):
        rows = [
            {"id": 1, "tiene_dibujo": True, "creado_por": 7},
            {"id": 2, "tiene_dibujo": False, "creado_por": 7},
            {"id": 3, "dibujo_geojson": {"type": "FeatureCollection", "features": [{}]}, "creado_por": 8},
        ]
        r = resumen_dibujos_contrato(rows, usuario_id=7)
        self.assertEqual(r["total_reportes"], 3)
        self.assertEqual(r["con_dibujo"], 2)
        self.assertEqual(r["sin_dibujo"], 1)
        self.assertEqual(r["usuario"]["con_dibujo"], 1)
        self.assertEqual(r["usuario"]["sin_dibujo"], 1)

    def test_interseccion_lineas_cercanas(self):
        a = [[-74.05, 4.70], [-74.05, 4.7001]]
        b = [[-74.05, 4.70], [-74.05, 4.7001]]
        m = interseccion_lineas_aprox_m(a, b, step_m=1.0)
        self.assertGreater(m, 0)


if __name__ == "__main__":
    unittest.main()
