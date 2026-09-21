"""Unit tests — bridge planilla tubería → SICOE."""
from __future__ import annotations

import unittest

from topografia_planilla_tuberia_sicoe import (
    abscisas_minmax_cartera,
    lineas_registros_desde_calculo,
    marker_origen_planilla,
    planilla_id_desde_enlace_soporte,
)


class TestPlanillaTuberiaSicoe(unittest.TestCase):
    def test_marker_roundtrip(self):
        m = marker_origen_planilla("abc-123")
        self.assertTrue(m.startswith("claracore:planilla-tuberia:"))
        self.assertEqual(planilla_id_desde_enlace_soporte(m), "abc-123")
        self.assertEqual(
            planilla_id_desde_enlace_soporte('["claracore:planilla-tuberia:xyz"]'),
            "xyz",
        )

    def test_abscisas_minmax(self):
        lo, hi = abscisas_minmax_cartera([
            {"abscisa": 100},
            {"abscisa": None},
            {"abscisa": 120.5},
            {"abscisa": ""},
        ])
        self.assertEqual(lo, 100.0)
        self.assertEqual(hi, 120.5)

    def test_lineas_sin_item_y_cero_omitido(self):
        calc = {
            "netos": [
                {"codigo": "EXC", "nombre": "Excavación Varias", "unidad": "m³",
                 "long": 10, "ancho": 1.5, "espesor": 2, "neto": 30},
                {"codigo": "OTROS", "nombre": "Otros: ____", "neto": 0},
            ],
            "descuentos": [
                {"codigo": "DESC_A1", "nombre": "Area 1", "cantidad": 1.25, "unidad": "m³"},
                {"codigo": "DESC_X", "nombre": "Vacio", "cantidad": 0},
            ],
        }
        lines = lineas_registros_desde_calculo(calc)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["observacion"], "Excavación Varias")
        self.assertEqual(lines[0]["cantidad"], 30.0)
        self.assertNotIn("item_numero", lines[0])
        self.assertTrue(lines[1]["observacion"].startswith("Descuento"))
        self.assertEqual(lines[1]["cantidad"], 1.25)


if __name__ == "__main__":
    unittest.main()
