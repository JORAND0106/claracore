"""Planilla tubería → so_registros (mapeo de líneas)."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    abscisas_extremos_cartera,
    calcular_planilla_completa,
    dims_y_cantidad_registro_sicoe,
    formatear_observacion_descuento_sicoe,
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
    def test_lineas_obs_positiva_y_descuento_negativo(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        regs = lineas_planilla_a_registros_sicoe(
            r, tipo="ALCANTARILLA", tramo="TRAMO 1",
        )
        self.assertGreaterEqual(len(regs), 2)
        pos = [x for x in regs if (x.get("cantidad_total") or 0) > 0]
        neg = [x for x in regs if (x.get("cantidad_total") or 0) < 0]
        self.assertTrue(pos)
        # ALC con Area1/Area2 típicos → al menos un negativo si hay descuento > 0
        for reg in pos:
            self.assertIsNone(reg.get("item_numero"))
            self.assertIn(" para ALCANTARILLA para TRAMO 1", reg["observacion"])
            self.assertNotIn(" en tramo ", reg["observacion"])
            self.assertIsNone(reg.get("cantidad"))
            self.assertTrue(reg["observacion"].startswith(reg["nombre"]))
        for reg in neg:
            self.assertLess(float(reg["cantidad_total"]), 0)
            self.assertTrue(reg["observacion"].lower().startswith("descuento"))
            self.assertIn(" para ALCANTARILLA para TRAMO 1", reg["observacion"])
            self.assertEqual(reg.get("_origen_tabla"), "descuentos")

        # TRI: positivo = bruto; negativo Area 1 ≈ descuentos del neto
        tri_neto = next(n for n in r["netos"] if n["codigo"] == "TRI")
        tri_reg = next(x for x in pos if x["nombre"] == tri_neto["nombre"])
        self.assertAlmostEqual(
            float(tri_reg["cantidad_total"]), float(tri_neto["bruto"]), places=2,
        )
        if tri_neto["descuentos"]:
            a1 = next(x for x in neg if x.get("_origen_codigo") == "DESC_A1")
            self.assertAlmostEqual(
                float(a1["cantidad_total"]), -float(tri_neto["descuentos"]), places=2,
            )
            self.assertIn("Area 1", a1["observacion"])

    def test_abscisas_extremos(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        a0, a1 = abscisas_extremos_cartera(r, _filas())
        self.assertEqual(a0, 0)
        self.assertEqual(a1, 10)

    def test_cero_no_genera_registro_ni_descuento(self):
        calc = {
            "netos": [
                {"codigo": "OTROS", "nombre": "Otros: ____", "bruto": 0, "neto": 0, "unidad": "m³"},
                {"codigo": "REL", "nombre": "Relleno Gran.", "bruto": 0.0, "neto": 0.0, "unidad": "m³"},
                {
                    "codigo": "EXC", "nombre": "Excavación Varias", "bruto": 3.2, "neto": 3.2,
                    "unidad": "m³", "long": 10, "ancho": 1.5, "espesor": 0.2,
                },
                {
                    "codigo": "TRI", "nombre": "Atraque mat. filtrante", "bruto": 5.0, "neto": 4.5,
                    "descuentos": 0.5, "unidad": "m³", "long": 10, "ancho": 1.5, "espesor": 0.3,
                },
            ],
            "descuentos": [
                {"codigo": "DESC_A1", "nombre": "Area 1", "cantidad": 0, "unidad": "m³"},
                {
                    "codigo": "DESC_A2", "nombre": "Area 2", "cantidad": 0.5, "unidad": "m³",
                    "long": 10, "espesor": 0.05,
                },
                {
                    "codigo": "DESC_TUB_FILT", "nombre": "Tubería Filtro", "cantidad": 0.5,
                    "unidad": "m³", "long": 10, "espesor": 0.05,
                },
            ],
        }
        regs = lineas_planilla_a_registros_sicoe(
            calc, tipo="FILTRO", tramo="TRAMO 8",
        )
        # EXC + TRI positivos; DESC_A2 y DESC_TUB_FILT negativos; ceros omitidos
        pos = [x for x in regs if float(x["cantidad_total"]) > 0]
        neg = [x for x in regs if float(x["cantidad_total"]) < 0]
        self.assertEqual({p["nombre"] for p in pos}, {"Excavación Varias", "Atraque mat. filtrante"})
        self.assertEqual({n["_origen_codigo"] for n in neg}, {"DESC_A2", "DESC_TUB_FILT"})
        tri = next(p for p in pos if p["nombre"] == "Atraque mat. filtrante")
        self.assertEqual(tri["cantidad_total"], 5.0)  # bruto, no neto 4.5
        self.assertEqual(
            tri["observacion"],
            "Atraque mat. filtrante para FILTRO para TRAMO 8",
        )
        tub = next(n for n in neg if n["_origen_codigo"] == "DESC_TUB_FILT")
        self.assertEqual(tub["cantidad_total"], -0.5)
        self.assertIn("Tubería Filtro", tub["observacion"])
        self.assertIn("Longitud × área de tubería", tub["observacion"])

    def test_formatear_observacion(self):
        self.assertEqual(
            formatear_observacion_registro_sicoe("Excavación Varias", "FILTRO", "TRAMO 8"),
            "Excavación Varias para FILTRO para TRAMO 8",
        )
        self.assertEqual(
            formatear_observacion_registro_sicoe("Geotextil", "alcantarilla", "  T1 "),
            "Geotextil para ALCANTARILLA para T1",
        )
        self.assertIn(
            "Area 1",
            formatear_observacion_descuento_sicoe("DESC_A1", "Area 1", "ALCANTARILLA", "T1"),
        )
        self.assertTrue(
            formatear_observacion_descuento_sicoe(
                "DESC_TUB_FILT", "Tubería Filtro", "FILTRO", "T8",
            ).startswith("Descuento Tubería Filtro"),
        )

    def test_dims_3_dec_cantidad_total_2_sin_factor_cantidad(self):
        dims = dims_y_cantidad_registro_sicoe(10.12345, 1.56789, 0.12345, 3.2167)
        self.assertEqual(dims["longitud"], 10.123)
        self.assertEqual(dims["ancho"], 1.568)
        self.assertEqual(dims["espesor"], 0.123)
        self.assertIsNone(dims["cantidad"])
        self.assertEqual(dims["cantidad_total"], 3.22)
        self.assertEqual(
            dims_y_cantidad_registro_sicoe(10, None, 0.05, -1.256)["cantidad_total"],
            -1.26,
        )
        self.assertEqual(redondear_costo_directo_sicoe(1234.56), 1235.0)
        self.assertIsNone(redondear_costo_directo_sicoe(None))

    def test_no_recalcula_producto(self):
        calc = {
            "netos": [
                {
                    "codigo": "EXC", "nombre": "Excavación Varias", "unidad": "m³",
                    "long": 10, "ancho": 1.5, "espesor": 0.2,
                    "bruto": 2.99, "neto": 2.99,
                },
            ],
            "descuentos": [],
        }
        regs = lineas_planilla_a_registros_sicoe(calc, tipo="ALCANTARILLA", tramo="T1")
        self.assertEqual(len(regs), 1)
        self.assertEqual(regs[0]["cantidad_total"], 2.99)
        self.assertIsNone(regs[0]["cantidad"])

    def test_multi_desc_otros_negativos_excluye_cero(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
            descuentos_manuales=[
                {"codigo": "DESC_OTROS_1", "nombre": "Pozo", "long": 2, "ancho": 1, "espesor": 0.5},
                {"codigo": "DESC_OTROS_2", "nombre": "Vacío", "long": 0, "ancho": 0, "espesor": 0},
                {"codigo": "DESC_OTROS_3", "nombre": "Caja", "long": 1, "ancho": 1, "espesor": 0.8},
            ],
        )
        regs = lineas_planilla_a_registros_sicoe(r, tipo="ALCANTARILLA", tramo="T2")
        neg_otros = [
            x for x in regs
            if str(x.get("_origen_codigo") or "").startswith("DESC_OTROS")
            and (x.get("cantidad_total") or 0) < 0
        ]
        cods = {x["_origen_codigo"] for x in neg_otros}
        self.assertIn("DESC_OTROS_1", cods)
        self.assertIn("DESC_OTROS_3", cods)
        self.assertNotIn("DESC_OTROS_2", cods)
        by = {x["_origen_codigo"]: x for x in neg_otros}
        self.assertAlmostEqual(float(by["DESC_OTROS_1"]["cantidad_total"]), -1.0, places=2)
        self.assertAlmostEqual(float(by["DESC_OTROS_3"]["cantidad_total"]), -0.8, places=2)
        self.assertIn("Otros", by["DESC_OTROS_1"]["nombre"])
        obs = formatear_observacion_descuento_sicoe(
            "DESC_OTROS_1", "Otros: Pozo", "ALCANTARILLA", "T2",
        )
        self.assertTrue(obs.lower().startswith("descuento otros"))
        self.assertIn("Pozo", obs)


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
        motor = (
            Path(__file__).resolve().parents[1] / "topografia_planilla_tuberia.py"
        ).read_text(encoding="utf-8")
        self.assertIn("formatear_observacion_descuento_sicoe", motor)
        self.assertIn("cant_neg = -abs", motor)


if __name__ == "__main__":
    unittest.main()
