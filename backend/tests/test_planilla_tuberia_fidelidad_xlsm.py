"""Verificación bloque a bloque vs inventario XLSM (sin Excel)."""
from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from topografia_planilla_tuberia import (
    area_1_m2,
    area_2_m2,
    area_tuberia_m2,
    calcular_planilla_completa,
    altura_relleno_atraque_m,
)
from topografia_planilla_tuberia_excel import build_planilla_tuberia_xlsx, TITULO_ALC, TITULO_FIL, CODIGO_DOC

ROOT = Path(__file__).resolve().parents[2]
INV = ROOT / "docs" / "topografia" / "planillas_tuberia" / "inventario_planilla_tuberia_xlsm.json"
LAYOUT = ROOT / "docs" / "topografia" / "planillas_tuberia" / "layout_map_planilla_tuberia.json"


class TestInventarioPresente(unittest.TestCase):
    def test_artefactos(self):
        self.assertTrue(INV.exists())
        self.assertTrue(LAYOUT.exists())
        inv = json.loads(INV.read_text())
        self.assertEqual(inv["sheetnames"], ["Tbl_Auxiliares", "planilla", "Resumen_BASE"])


class TestFormulasVsInventario(unittest.TestCase):
    def test_k13_area_tuberia(self):
        # K13 = ROUND(PI()*((I13/2)+J13)^2,3)
        self.assertAlmostEqual(area_tuberia_m2(0.9, 0.05), round(math.pi * 0.5 ** 2, 3))

    def test_e15_altura_relleno(self):
        self.assertAlmostEqual(altura_relleno_atraque_m(0.9, 0.05, "1:3"), 0.333)

    def test_b15_segmento_circular(self):
        r = 0.5
        h = 0.333
        esperado = round(
            r ** 2 * math.acos((r - h) / r) - (r - h) * math.sqrt(2 * r * h - h ** 2),
            3,
        )
        self.assertAlmostEqual(area_1_m2(0.9, 0.05, 1.5, "1:3"), esperado, places=3)
        self.assertAlmostEqual(
            area_1_m2(0.9, 0.05, 1.5, "1:3") + area_2_m2(0.9, 0.05, "1:3"),
            area_tuberia_m2(0.9, 0.05),
            places=3,
        )

    def test_items_resumen_literales(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA",
            diametro_m=0.9,
            espesor_m=0.05,
            ancho_excavacion_m=1.5,
            relacion_atraque="1:3",
            filas_campo=[
                {"orden": 1, "abscisa": 100, "terreno_natural": 105, "subrasante_via": 104, "cota_fondo_excavacion": 103},
                {"orden": 2, "abscisa": 130, "terreno_natural": 104.7, "subrasante_via": 103.7, "cota_fondo_excavacion": 102.7},
            ],
            cama_triturado_m=0.1,
        )
        nombres = [n["nombre"] for n in r["netos"]]
        self.assertEqual(
            nombres,
            [
                "Excavación Varias",
                "Excavación Roca",
                "Long Tubería",
                "Triturado / Atraque",
                "Relleno Gran.",
                "Geotextil",
            ],
        )
        desc = [d["nombre"] for d in r["descuentos"]]
        self.assertIn("Area 1", desc)
        self.assertIn("Area 2", desc)


class TestExcelExportFidelidad(unittest.TestCase):
    def test_titulos_y_formulas_vivas(self):
        from openpyxl import load_workbook
        import io

        raw = build_planilla_tuberia_xlsx(
            planilla={
                "tipo": "ALCANTARILLA",
                "diametro_m": 0.9,
                "espesor_m": 0.05,
                "ancho_excavacion_m": 1.5,
                "relacion_atraque": "1:3",
                "pk_id": "K0+000",
                "meta_cabecera": {"cama_triturado_m": 0.3},
            },
            calculo={
                "cartera": {
                    "filas": [
                        {
                            "orden": 1,
                            "abscisa": 100,
                            "terreno_natural": 105,
                            "subrasante_via": 104,
                            "cota_fondo_excavacion": 103,
                            "vacio": False,
                        }
                    ]
                }
            },
        )
        wb = load_workbook(io.BytesIO(raw))
        ws = wb["planilla"]
        self.assertEqual(ws["F1"].value, TITULO_ALC)
        self.assertEqual(ws["P2"].value, TITULO_FIL)
        self.assertEqual(ws["M1"].value, CODIGO_DOC)
        self.assertTrue(str(ws["G17"].value).startswith("=IFERROR"))
        self.assertTrue(str(ws["H48"].value).startswith("=ROUND(PRODUCT"))
        self.assertGreaterEqual(len(ws._charts), 1)


if __name__ == "__main__":
    unittest.main()
