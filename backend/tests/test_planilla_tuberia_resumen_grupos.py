"""Agrupación Resumen de Cantidades (PDF/Excel) — solo presentación."""
from __future__ import annotations

import unittest

from topografia_planilla_tuberia import calcular_planilla_completa
from topografia_planilla_tuberia_resumen_grupos import (
    GRUPOS_RESUMEN,
    agrupar_netos_resumen,
    grupo_id_de_linea,
)


class TestResumenGrupos(unittest.TestCase):
    def test_grupo_id_basicos(self):
        self.assertEqual(grupo_id_de_linea("EXC_ROC"), "excavacion")
        self.assertEqual(grupo_id_de_linea("OTROS_1"), "otros")
        self.assertEqual(grupo_id_de_linea("OTROS_2", {"grupo": "triturado"}), "triturado")
        self.assertEqual(len(GRUPOS_RESUMEN), 6)

    def test_total_suma_netos(self):
        grupos = agrupar_netos_resumen([
            {"codigo": "EXC", "neto": 100},
            {"codigo": "EXC_ROC", "neto": 15},
            {"codigo": "OTROS_1", "neto": 2, "grupo": "excavacion"},
            {"codigo": "TUB", "neto": 50},
        ])
        by_id = {g["id"]: g for g in grupos}
        self.assertEqual(by_id["excavacion"]["total"], 117.0)
        self.assertEqual(by_id["tuberia"]["total"], 50.0)

    def test_calculo_conserva_grupo_sin_cambiar_formulas(self):
        calc = calcular_planilla_completa(
            tipo="ALCANTARILLA",
            diametro_m=0.9,
            espesor_m=0.05,
            ancho_excavacion_m=1.5,
            relacion_atraque="1:3",
            cama_triturado_m=0.1,
            filas_campo=[
                {"orden": 1, "abscisa": 0, "terreno_natural": 100,
                 "subrasante_via": 99, "cota_fondo_excavacion": 98},
                {"orden": 2, "abscisa": 100, "terreno_natural": 100,
                 "subrasante_via": 99, "cota_fondo_excavacion": 98},
            ],
            cantidades_manuales=[
                {"codigo": "EXC_ROC", "long": 10, "ancho": 1.5, "espesor": 0.5,
                 "descontar_de": "EXC"},
                {"codigo": "OTROS_1", "nombre": "Extra", "long": 2, "ancho": 1,
                 "espesor": 0.5, "grupo": "excavacion", "descontar_de": "EXC"},
            ],
        )
        otr = next(n for n in calc["netos"] if n["codigo"] == "OTROS_1")
        self.assertEqual(otr.get("grupo"), "excavacion")
        grupos = agrupar_netos_resumen(calc["netos"])
        exc = next(g for g in grupos if g["id"] == "excavacion")
        codigos = {n["codigo"] for n in exc["lineas"]}
        self.assertIn("EXC", codigos)
        self.assertIn("EXC_ROC", codigos)
        self.assertIn("OTROS_1", codigos)


if __name__ == "__main__":
    unittest.main()
