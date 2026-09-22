"""Planilla tubería → so_registros (mapeo de líneas)."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    abscisas_extremos_cartera,
    calcular_planilla_completa,
    lineas_planilla_a_registros_sicoe,
)


def _filas():
    return [
        {
            "orden": 1, "abscisa": 0, "terreno_natural": 100,
            "subrasante_via": 99.5, "cota_fondo_excavacion": 98,
        },
        {
            "orden": 2, "abscisa": 10, "terreno_natural": 100.2,
            "subrasante_via": 99.7, "cota_fondo_excavacion": 98.1,
        },
    ]


class TestPlanillaARegistrosSicoe(unittest.TestCase):
    def test_lineas_sin_item_y_con_observacion(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        regs = lineas_planilla_a_registros_sicoe(r)
        self.assertGreaterEqual(len(regs), 2)
        for reg in regs:
            self.assertIsNone(reg.get("item_numero"))
            self.assertTrue(reg.get("observacion"))
            self.assertEqual(reg["observacion"], reg["nombre"])
            self.assertTrue(reg.get("cantidad"))

    def test_abscisas_extremos(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        a0, a1 = abscisas_extremos_cartera(r, _filas())
        self.assertEqual(a0, 0)
        self.assertEqual(a1, 10)

    def test_cero_no_genera_registro(self):
        calc = {
            "netos": [
                {"codigo": "OTROS", "nombre": "Otros: ____", "neto": 0, "unidad": "m³"},
                {"codigo": "EXC", "nombre": "Excavación Varias", "neto": 3.2, "unidad": "m³",
                 "long": 10, "ancho": 1.5, "espesor": 0.2},
            ],
            "descuentos": [],
        }
        regs = lineas_planilla_a_registros_sicoe(calc)
        self.assertEqual(len(regs), 1)
        self.assertEqual(regs[0]["nombre"], "Excavación Varias")


if __name__ == "__main__":
    unittest.main()
