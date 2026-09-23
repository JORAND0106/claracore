"""Margen SICOE + sync planilla → so_registros."""
from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    filtrar_capitulos_por_tipo_planilla,
    mapa_lineas_sicoe_por_origen,
    normalizar_margen_sicoe,
    patch_so_registro_desde_linea_planilla,
)


class TestNormalizarMargenSicoe(unittest.TestCase):
    def test_aliases_costado_pk(self):
        self.assertEqual(normalizar_margen_sicoe("Derecho"), "Derecha")
        self.assertEqual(normalizar_margen_sicoe("Izquierdo"), "Izquierda")
        self.assertEqual(normalizar_margen_sicoe("derecha"), "Derecha")
        self.assertEqual(normalizar_margen_sicoe("Única"), "Única")
        self.assertEqual(normalizar_margen_sicoe("unico"), "Única")
        self.assertEqual(normalizar_margen_sicoe("Central"), "Central")

    def test_otro_y_vacio(self):
        self.assertIsNone(normalizar_margen_sicoe(""))
        self.assertIsNone(normalizar_margen_sicoe(None))
        self.assertEqual(normalizar_margen_sicoe("Otro: Berma"), "Otro: Berma")
        self.assertEqual(normalizar_margen_sicoe("Norte"), "Otro: Norte")


class TestFiltrarCapitulos(unittest.TestCase):
    def test_filtro_vs_alcantarilla(self):
        caps = [
            "3. OBRAS DE ARTE (ALCANTARILLA)",
            "4. FILTROS DE PAVIMENTO",
            "1. MOVIMIENTO DE TIERRAS",
        ]
        fil = filtrar_capitulos_por_tipo_planilla(caps, "FILTRO")
        self.assertEqual(fil, ["4. FILTROS DE PAVIMENTO"])
        alc = filtrar_capitulos_por_tipo_planilla(caps, "ALCANTARILLA")
        self.assertIn("3. OBRAS DE ARTE (ALCANTARILLA)", alc)
        self.assertNotIn("4. FILTROS DE PAVIMENTO", alc)

    def test_sin_match_conserva_lista(self):
        caps = ["CAPITULO X", "CAPITULO Y"]
        self.assertEqual(filtrar_capitulos_por_tipo_planilla(caps, "FILTRO"), caps)


class TestSyncPatch(unittest.TestCase):
    def test_mapa_incluye_cero_para_bajar_cantidad(self):
        calc = {
            "netos": [
                {"codigo": "EXC", "nombre": "Exc", "neto": 12.5, "long": 10, "ancho": 1, "espesor": 1.2, "unidad": "m³"},
                {"codigo": "TUB", "nombre": "Tub", "neto": 0, "unidad": "ml"},
            ],
            "descuentos": [
                {"codigo": "DESC_A1", "nombre": "Area 1", "cantidad": 0.5},
            ],
        }
        m = mapa_lineas_sicoe_por_origen(calc)
        self.assertIn("cantidades:EXC", m)
        self.assertIn("cantidades:TUB", m)
        self.assertEqual(m["cantidades:TUB"]["cantidad"], 0.0)
        patch = patch_so_registro_desde_linea_planilla(m["cantidades:EXC"])
        self.assertEqual(patch["cantidad"], 12.5)
        self.assertEqual(patch["longitud"], 10)


if __name__ == "__main__":
    unittest.main()
