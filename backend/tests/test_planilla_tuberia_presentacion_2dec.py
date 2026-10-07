"""Presentación Resumen/Descuentos: dims a 2 dec antes del PRODUCT (90×0.009→0.90)."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    presentar_calculo_resumen_2dec,
    _cantidad_desde_dims,
    _dim_resumen_2,
)


class TestPresentacionResumen2Dec(unittest.TestCase):
    def test_caso_90_por_0_009_es_0_90(self):
        self.assertEqual(_dim_resumen_2(0.009), 0.01)
        self.assertEqual(_cantidad_desde_dims(90, None, 0.009), 0.9)
        self.assertEqual(_cantidad_desde_dims(90, 1, 0.009), 0.9)

    def test_snapshot_viejo_se_corrige_solo_en_presentacion(self):
        """Snapshot sellado con cantidad 0.81 (90×0.009) → presentación 0.90."""
        snap = {
            "cantidades": [],
            "descuentos": [
                {
                    "codigo": "DESC_OTROS_1",
                    "nombre": "Otros: X",
                    "long": 90,
                    "ancho": None,
                    "espesor": 0.009,
                    "cantidad": 0.81,  # valor crudo incorrecto vs dims vistas
                    "unidad": "m³",
                }
            ],
            "netos": [
                {
                    "codigo": "EXC",
                    "nombre": "Excavación Varias",
                    "long": 90,
                    "ancho": 1.5,
                    "espesor": 0.009,
                    "bruto": 1.215,  # 90×1.5×0.009
                    "descuentos": 0,
                    "neto": 1.215,
                    "unidad": "m³",
                }
            ],
        }
        visto = presentar_calculo_resumen_2dec(snap)
        d = visto["descuentos"][0]
        self.assertEqual(d["espesor"], 0.01)
        self.assertEqual(d["cantidad"], 0.9)
        n = visto["netos"][0]
        self.assertEqual(n["espesor"], 0.01)
        self.assertEqual(n["bruto"], 1.35)  # 90×1.5×0.01
        self.assertEqual(n["neto"], 1.35)
        # Original intacto
        self.assertEqual(snap["descuentos"][0]["cantidad"], 0.81)
        self.assertEqual(snap["descuentos"][0]["espesor"], 0.009)

    def test_idempotente_si_ya_redondeado(self):
        calc = {
            "descuentos": [
                {"codigo": "DESC_A1", "long": 90.0, "ancho": None, "espesor": 0.01, "cantidad": 0.9}
            ],
            "netos": [
                {
                    "codigo": "TRI", "long": 90.0, "ancho": 1.5, "espesor": 2.0,
                    "bruto": 270.0, "descuentos": 0.9, "neto": 269.1,
                }
            ],
            "cantidades": [],
        }
        a = presentar_calculo_resumen_2dec(calc)
        b = presentar_calculo_resumen_2dec(a)
        self.assertEqual(a["descuentos"][0]["cantidad"], b["descuentos"][0]["cantidad"])
        self.assertEqual(a["netos"][0]["neto"], b["netos"][0]["neto"])


if __name__ == "__main__":
    unittest.main()
