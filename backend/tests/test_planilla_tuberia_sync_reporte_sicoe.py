"""Sync planilla tubería → SICOE: puntos topográficos, fotos, esquema."""
from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    origen_key_linea_sicoe,
    puntos_topograficos_desde_planilla,
    resolver_lineas_por_origenes_seleccionados,
)


class TestPuntosTopograficosDesdePlanilla(unittest.TestCase):
    def test_inicio_fin_desde_columnas_y_meta(self):
        p = {
            "norte_ref": 1_000_100.5,
            "este_ref": 900_200.25,
            "meta_cabecera": {
                "norte_abs_final": 1_000_250.0,
                "este_abs_final": 900_310.0,
            },
        }
        pts = puntos_topograficos_desde_planilla(p)
        self.assertEqual(len(pts), 2)
        self.assertEqual(pts[0]["punto"], "Inicio")
        self.assertEqual(pts[0]["norte"], 1_000_100.5)
        self.assertEqual(pts[0]["este"], 900_200.25)
        self.assertEqual(pts[1]["punto"], "Fin")
        self.assertEqual(pts[1]["norte"], 1_000_250.0)
        self.assertEqual(pts[1]["este"], 900_310.0)

    def test_inicio_solo_meta_si_no_hay_ref(self):
        p = {
            "meta_cabecera": {
                "norte_abs_inicial": 10.0,
                "este_abs_inicial": 20.0,
            },
        }
        pts = puntos_topograficos_desde_planilla(p)
        self.assertEqual(len(pts), 1)
        self.assertEqual(pts[0]["punto"], "Inicio")
        self.assertEqual(pts[0]["norte"], 10.0)

    def test_vacio_sin_coordenadas(self):
        self.assertEqual(puntos_topograficos_desde_planilla({}), [])
        self.assertEqual(puntos_topograficos_desde_planilla(None), [])


class TestOrigenKeyYContratoCrearReporte(unittest.TestCase):
    def test_origen_key(self):
        self.assertEqual(
            origen_key_linea_sicoe({"_origen_tabla": "cantidades", "_origen_codigo": "EXC"}),
            "cantidades:EXC",
        )
        self.assertEqual(
            origen_key_linea_sicoe({"_origen_tabla": "Cantidades", "_origen_codigo": "exc"}),
            "cantidades:EXC",
        )

    def test_resolver_lineas_por_origenes_seleccionados(self):
        lineas = [
            {"nombre": "Exc", "_origen_tabla": "cantidades", "_origen_codigo": "EXC"},
            {"nombre": "Area 1", "_origen_tabla": "descuentos", "_origen_codigo": "DESC_A1"},
        ]
        found, missing = resolver_lineas_por_origenes_seleccionados(
            lineas, ["cantidades:exc", "descuentos:FALTANTE"],
        )
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["_origen_codigo"], "EXC")
        self.assertEqual(missing, ["descuentos:FALTANTE"])
        empty, miss = resolver_lineas_por_origenes_seleccionados(lineas, [])
        self.assertEqual(empty, [])
        self.assertEqual(miss, [])

    def test_body_y_ruta_aceptan_esquema_y_sync(self):
        from pathlib import Path
        src = Path(__file__).resolve().parents[1] / "topografia_planilla_tuberia_routes.py"
        text = src.read_text(encoding="utf-8")
        self.assertIn("esquema_data_uri", text)
        self.assertIn("so_puntos_topograficos", text)
        self.assertIn("_subir_bytes_sicoe_foto", text)
        self.assertIn("_subir_bytes_sicoe_grafico", text)
        self.assertIn("puntos_topograficos_desde_planilla", text)
        self.assertIn("n_fotos_sincronizadas", text)
        self.assertIn("esquema_adjunto", text)
        self.assertIn("resolver_lineas_por_origenes_seleccionados", text)


class TestFrontendEnviaEsquemaYVistaOrigen(unittest.TestCase):
    def test_modal_envia_esquema_data_uri(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[2]
        modal = (
            root / "frontend/src/components/topografia/planillaTuberia"
            / "PlanillaTuberiaCrearReporteModal.jsx"
        ).read_text(encoding="utf-8")
        self.assertIn("esquema_data_uri: esquemaDataUri", modal)

    def test_origen_tab_usa_form_solo_lectura(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[2]
        tab = (
            root / "frontend/src/modules/sicoe-obra/SicoePlanillaTuberiaOrigenTab.jsx"
        ).read_text(encoding="utf-8")
        form = (
            root / "frontend/src/components/topografia/planillaTuberia"
            / "PlanillaTuberiaForm.jsx"
        ).read_text(encoding="utf-8")
        self.assertIn("modoSoloLectura", tab)
        self.assertIn("PlanillaTuberiaForm", tab)
        self.assertIn("detalleInicial", tab)
        self.assertIn("modoSoloLectura", form)
        self.assertIn("data-planilla-tuberia-vista-sicoe", form)


if __name__ == "__main__":
    unittest.main()
