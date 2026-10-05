"""Descuento de volumen (EXC_ROC / Otros → línea Resumen) + registros SICOE +/-."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    calcular_planilla_completa,
    formatear_nota_descuento_volumen,
    lineas_planilla_a_registros_sicoe,
    resolver_linea_descuento_volumen,
)


def _filas(abscisa_fin: float = 100.0):
    return [
        {
            "orden": 1, "abscisa": 0, "terreno_natural": 100,
            "subrasante_via": 99, "cota_fondo_excavacion": 98,
        },
        {
            "orden": 2, "abscisa": abscisa_fin, "terreno_natural": 100,
            "subrasante_via": 99, "cota_fondo_excavacion": 98,
        },
    ]


class TestDescuentoVolumen(unittest.TestCase):
    def test_formato_nota_volumen(self):
        self.assertEqual(
            formatear_nota_descuento_volumen(
                actividad="Excavación Roca",
                linea_label="Excavación Varias",
                volumen_original=300.0,
                volumen_descontado=15.0,
                volumen_final=285.0,
            ),
            "Excavación Roca: Vol Excavación Varias 300.0 − 15.0 = 285.0 m³",
        )

    def test_resolver_legacy_altura(self):
        self.assertEqual(resolver_linea_descuento_volumen("prom_altura_excavacion"), "EXC")
        self.assertEqual(resolver_linea_descuento_volumen("TRI"), "TRI")
        self.assertIsNone(resolver_linea_descuento_volumen(""))

    def test_caso_tramo_100_roca_20ml(self):
        """Tramo 100 m; roca puntual 20×1.5×0.5 = 15 m³ descontados de EXC."""
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(100),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 20, "ancho": 1.5, "espesor": 0.5,
                    "descontar_de": "EXC",
                },
            ],
        )
        exc = next(n for n in r["netos"] if n["codigo"] == "EXC")
        roc = next(n for n in r["netos"] if n["codigo"] == "EXC_ROC")
        self.assertAlmostEqual(float(roc["neto"]), 15.0, places=2)
        self.assertAlmostEqual(float(exc["bruto"]), 300.0, places=2)
        self.assertAlmostEqual(float(exc["descuentos"]), 15.0, places=2)
        self.assertAlmostEqual(float(exc["neto"]), 285.0, places=2)
        notas = r.get("notas_descuento_volumen") or []
        self.assertTrue(any("Vol Excavación Varias" in n for n in notas))
        self.assertTrue(any("15.0" in n for n in notas))
        self.assertFalse(any("Altura" in n for n in notas))

        regs = lineas_planilla_a_registros_sicoe(r, tipo="ALCANTARILLA", tramo="TRAMO 8")
        pos_exc = next(x for x in regs if x.get("_origen_codigo") == "EXC")
        neg = [
            x for x in regs
            if str(x.get("_origen_codigo") or "").startswith("DESC_VOL_")
        ]
        self.assertEqual(len(neg), 1)
        self.assertAlmostEqual(float(pos_exc["cantidad_total"]), 300.0, places=2)
        self.assertAlmostEqual(float(neg[0]["cantidad_total"]), -15.0, places=2)
        self.assertIn("volumen", neg[0]["observacion"].lower())
        self.assertAlmostEqual(float(neg[0]["longitud"]), 20.0, places=3)

    def test_compat_descontar_de_altura_legacy(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.1, espesor_m=0.003,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(10),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 10, "ancho": 1.5, "espesor": 0.1,
                    "descontar_de": "prom_altura_excavacion",
                },
                {
                    "codigo": "OTROS_1",
                    "nombre": "Relleno especial",
                    "long": 4, "ancho": 1.0, "espesor": 0.5,
                    "descontar_de": "EXC",
                },
            ],
        )
        det = r.get("descuentos_volumen_detalle") or []
        self.assertEqual(len(det), 2)
        self.assertTrue(all(d.get("item_cant_codigo") == "EXC" for d in det))
        notas = r["notas_descuento_volumen"]
        self.assertTrue(any("Excavación Roca" in n for n in notas))
        self.assertTrue(any("Relleno especial" in n for n in notas))
        self.assertFalse(any(n.lower().startswith("otros:") for n in notas))


if __name__ == "__main__":
    unittest.main()
