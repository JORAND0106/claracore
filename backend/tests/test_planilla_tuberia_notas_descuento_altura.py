"""Compat: notas de descuento (antes altura) ahora en volumen."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    calcular_planilla_completa,
    formatear_nota_descuento_altura,
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


class TestNotasDescuentoAlturaCompat(unittest.TestCase):
    def test_formato_nota_breve_redirige_a_volumen(self):
        nota = formatear_nota_descuento_altura(
            actividad="Excavación Roca",
            campo_label="Excavación Varias",
            altura_original=30.0,
            valor_descontado=1.5,
            altura_final=28.5,
        )
        self.assertIn("Vol", nota)
        self.assertIn("m³", nota)

    def test_detalle_y_nota_en_calculo(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.1, espesor_m=0.003,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 10, "ancho": 1.5, "espesor": 0.1,
                    "descontar_de": "prom_altura_excavacion",
                },
                {
                    "codigo": "OTROS_1",
                    "nombre": "Relleno especial",
                    "long": 10, "ancho": 1.5, "espesor": 0.05,
                    "descontar_de": "EXC",
                },
            ],
        )
        self.assertTrue(r.get("descuentos_volumen_detalle") or r.get("descuentos_altura_detalle"))
        self.assertTrue(r.get("notas_descuento_volumen") or r.get("notas_descuento_altura"))
        notas = r.get("notas_descuento_volumen") or r["notas_descuento_altura"]
        self.assertTrue(any("Excavación Roca" in n for n in notas))
        self.assertTrue(any("Relleno especial" in n for n in notas))
        self.assertFalse(any(n.lower().startswith("otros:") for n in notas))

    def test_sicoe_emite_negativo_volumen_y_bruto_exc(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.1, espesor_m=0.003,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 10, "ancho": 1.5, "espesor": 0.2,
                    "descontar_de": "EXC",
                },
            ],
        )
        regs = lineas_planilla_a_registros_sicoe(r, tipo="FILTRO", tramo="TRAMO 8")
        neg = [
            x for x in regs
            if str(x.get("_origen_codigo") or "").startswith(("DESC_VOL_", "DESC_ALT_"))
        ]
        self.assertEqual(len(neg), 1)
        self.assertLess(float(neg[0]["cantidad_total"]), 0)
        self.assertIn("volumen", neg[0]["observacion"].lower())

        exc = next(x for x in regs if x.get("_origen_codigo") == "EXC")
        exc_neto = next(n for n in r["netos"] if n["codigo"] == "EXC")
        # Bruto SICOE = bruto planilla (completo); el negativo lleva el volumen.
        self.assertAlmostEqual(float(exc["cantidad_total"]), float(exc_neto["bruto"]), places=2)
        vol_desc = abs(float(neg[0]["cantidad_total"]))
        self.assertAlmostEqual(float(exc_neto["neto"]), float(exc_neto["bruto"]) - vol_desc, places=2)


if __name__ == "__main__":
    unittest.main()
