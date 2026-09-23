"""Planilla tubería → so_registros (mapeo de líneas)."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    abscisas_extremos_cartera,
    calcular_planilla_completa,
    dims_y_cantidad_registro_sicoe,
    formatear_observacion_registro_sicoe,
    lineas_planilla_a_registros_sicoe,
    redondear_costo_directo_sicoe,
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
    def test_lineas_sin_item_y_observacion_enriquecida(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        regs = lineas_planilla_a_registros_sicoe(
            r, tipo="ALCANTARILLA", tramo="TRAMO 1",
        )
        self.assertGreaterEqual(len(regs), 2)
        for reg in regs:
            self.assertIsNone(reg.get("item_numero"))
            self.assertTrue(reg.get("observacion"))
            self.assertIn(" para ALCANTARILLA en tramo TRAMO 1", reg["observacion"])
            self.assertTrue(reg["observacion"].startswith(reg["nombre"]))
            self.assertIsNone(reg.get("cantidad"), "factor cantidad no debe enviarse")
            self.assertIsNotNone(reg.get("cantidad_total"))
            self.assertNotAlmostEqual(float(reg["cantidad_total"]), 0.0)
            for k in ("longitud", "ancho", "espesor"):
                self.assertIn(k, reg)
            match = next(
                (n for n in r["netos"] if n["nombre"] == reg["nombre"]),
                None,
            )
            if match:
                self.assertAlmostEqual(
                    float(reg["cantidad_total"]), float(match["neto"]), places=2,
                )

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
                {"codigo": "REL", "nombre": "Relleno Gran.", "neto": 0.0, "unidad": "m³"},
                {"codigo": "EXC", "nombre": "Excavación Varias", "neto": 3.2, "unidad": "m³",
                 "long": 10, "ancho": 1.5, "espesor": 0.2},
            ],
            "descuentos": [
                {"codigo": "DESC_A1", "nombre": "Area 1", "cantidad": 0, "unidad": "m³"},
                {"codigo": "DESC_A2", "nombre": "Area 2", "cantidad": 0.5, "unidad": "m³"},
            ],
        }
        regs = lineas_planilla_a_registros_sicoe(
            calc, tipo="FILTRO", tramo="TRAMO 8",
        )
        self.assertEqual(len(regs), 2)
        nombres = {r["nombre"] for r in regs}
        self.assertEqual(nombres, {"Excavación Varias", "Area 2"})
        for r in regs:
            self.assertEqual(
                r["observacion"],
                f"{r['nombre']} para FILTRO en tramo TRAMO 8",
            )
            self.assertIsNone(r.get("cantidad"))

    def test_formatear_observacion(self):
        self.assertEqual(
            formatear_observacion_registro_sicoe("Excavación Varias", "FILTRO", "TRAMO 8"),
            "Excavación Varias para FILTRO en tramo TRAMO 8",
        )
        self.assertEqual(
            formatear_observacion_registro_sicoe("Geotextil", "alcantarilla", "  T1 "),
            "Geotextil para ALCANTARILLA en tramo T1",
        )
        self.assertEqual(
            formatear_observacion_registro_sicoe("X", None, None),
            "X para — en tramo —",
        )

    def test_dims_3_dec_cantidad_total_2_sin_factor_cantidad(self):
        dims = dims_y_cantidad_registro_sicoe(10.12345, 1.56789, 0.12345, 3.2167)
        self.assertEqual(dims["longitud"], 10.123)
        self.assertEqual(dims["ancho"], 1.568)
        self.assertEqual(dims["espesor"], 0.123)
        self.assertIsNone(dims["cantidad"])
        self.assertEqual(dims["cantidad_total"], 3.22)
        self.assertEqual(redondear_costo_directo_sicoe(1234.56), 1235.0)
        self.assertIsNone(redondear_costo_directo_sicoe(None))

    def test_no_recalcula_producto(self):
        """cantidad_total = neto del resumen, aunque L×A×E dé otro valor."""
        calc = {
            "netos": [
                {
                    "codigo": "EXC", "nombre": "Excavación Varias", "unidad": "m³",
                    "long": 10, "ancho": 1.5, "espesor": 0.2,
                    "neto": 2.99,  # distinto de 10*1.5*0.2=3.0
                },
            ],
            "descuentos": [],
        }
        regs = lineas_planilla_a_registros_sicoe(calc, tipo="ALCANTARILLA", tramo="T1")
        self.assertEqual(len(regs), 1)
        self.assertEqual(regs[0]["cantidad_total"], 2.99)
        self.assertEqual(regs[0]["longitud"], 10.0)
        self.assertEqual(regs[0]["ancho"], 1.5)
        self.assertEqual(regs[0]["espesor"], 0.2)
        self.assertIsNone(regs[0]["cantidad"])


class TestRutaUsaTramoYFiltroCero(unittest.TestCase):
    def test_crear_reporte_pasa_tipo_tramo_y_ubicacion(self):
        from pathlib import Path
        src = Path(__file__).resolve().parents[1] / "topografia_planilla_tuberia_routes.py"
        text = src.read_text(encoding="utf-8")
        self.assertIn("_fetch_pk_maestro", text)
        self.assertIn("lineas_planilla_a_registros_sicoe(", text)
        self.assertIn("tipo=p.get(\"tipo\")", text)
        self.assertIn("tramo=tramo_lbl", text)
        self.assertIn("**ubicacion_pk", text)
        self.assertIn('data["cantidad"] = None', text)
        self.assertIn("redondear_costo_directo_sicoe", text)


if __name__ == "__main__":
    unittest.main()
