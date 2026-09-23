"""Notas de descuento de altura + registro negativo hacia SICOE."""

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


class TestNotasDescuentoAltura(unittest.TestCase):
    def test_formato_nota_breve(self):
        self.assertEqual(
            formatear_nota_descuento_altura(
                actividad="Excavación Roca",
                campo_label="Altura Excavación",
                altura_original=1.005,
                valor_descontado=0.1,
                altura_final=0.905,
            ),
            "Excavación Roca: Altura Excavación 1.005 − 0.1 = 0.905 m",
        )

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
                    "descontar_de": "prom_altura_excavacion",
                },
            ],
        )
        self.assertTrue(r.get("descuentos_altura_detalle"))
        self.assertTrue(r.get("notas_descuento_altura"))
        notas = r["notas_descuento_altura"]
        self.assertTrue(any("Excavación Roca" in n for n in notas))
        self.assertTrue(any("Relleno especial" in n for n in notas))
        self.assertFalse(any(n.lower().startswith("otros:") for n in notas))

    def test_sicoe_emite_negativo_altura_y_restaura_bruto_exc(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.1, espesor_m=0.003,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 10, "ancho": 1.5, "espesor": 0.2,
                    "descontar_de": "prom_altura_excavacion",
                },
            ],
        )
        regs = lineas_planilla_a_registros_sicoe(r, tipo="FILTRO", tramo="TRAMO 8")
        neg_alt = [
            x for x in regs
            if str(x.get("_origen_codigo") or "").startswith("DESC_ALT_")
        ]
        self.assertEqual(len(neg_alt), 1)
        self.assertLess(float(neg_alt[0]["cantidad_total"]), 0)
        self.assertIn("Descuento altura", neg_alt[0]["observacion"])

        exc = next(x for x in regs if x.get("_origen_codigo") == "EXC")
        exc_neto = next(n for n in r["netos"] if n["codigo"] == "EXC")
        # Bruto SICOE = neto planilla (ya reducido) + volumen descontado
        vol_desc = abs(float(neg_alt[0]["cantidad_total"]))
        self.assertAlmostEqual(
            float(exc["cantidad_total"]),
            float(exc_neto["bruto"]) + vol_desc,
            places=2,
        )


if __name__ == "__main__":
    unittest.main()
