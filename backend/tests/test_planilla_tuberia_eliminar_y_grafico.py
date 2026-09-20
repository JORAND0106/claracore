"""Eliminar planilla + gráfico dinámico ALCANTARILLA/FILTRO."""
from __future__ import annotations

import ast
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


class TestEliminarPlanillaRoute(unittest.TestCase):
    def test_delete_endpoint_present(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn('@router.delete("/{contrato_id}/planillas-tuberia/{planilla_id}")', src)
        self.assertIn("def eliminar(", src)
        self.assertIn('_perm(current_user, "eliminar")', src)
        for table in (
            "topo_planilla_tuberia_filas",
            "topo_planilla_tuberia_descuentos",
            "topo_planilla_tuberia_consolidado",
            "topo_planilla_tuberia_auditoria",
            "topo_planillas_tuberia",
        ):
            self.assertIn(table, src[src.index("def eliminar(") : src.index("def eliminar(") + 1800])
        self.assertIn("tenia_datos", src)


class TestGraficoDinamicoTipo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import sys
        import types
        import importlib.util

        tu = types.ModuleType("topografia_utils")
        tu._html_logo_pdf = lambda *a, **k: "<div>LOGO</div>"
        tu.svg_embed_pdf = lambda s, w, h: f'<img width="{w}" height="{h}"/>'
        sys.modules["topografia_utils"] = tu
        spec = importlib.util.spec_from_file_location(
            "topografia_planilla_tuberia_pdf", ROOT / "topografia_planilla_tuberia_pdf.py"
        )
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_png_media_present(self):
        for tipo in ("ALCANTARILLA", "FILTRO"):
            path = self.mod._SECCION_PNG[tipo]
            self.assertTrue(path.is_file(), msg=str(path))

    def test_bloque_usa_png_segun_tipo(self):
        h_alc = self.mod.html_bloque_graficos_pdf(
            {"seccion_tipica": {"tipo": "ALCANTARILLA"}, "perfil": {}}
        )
        h_fil = self.mod.html_bloque_graficos_pdf(
            {"seccion_tipica": {"tipo": "FILTRO"}, "perfil": {}}
        )
        self.assertIn("data:image/png", h_alc)
        self.assertIn("data:image/png", h_fil)
        self.assertIn("Filtro", h_fil)
        self.assertIn("Tuber", h_alc)
        self.assertNotEqual(h_alc, h_fil)
        self.assertIn("graficos-wrap", h_alc)

    def test_svg_fallback_layouts_differ(self):
        alc = self.mod.svg_seccion_tipica_pdf({"tipo": "ALCANTARILLA", "ancho_excavacion_m": 1.8})
        fil = self.mod.svg_seccion_tipica_pdf({"tipo": "FILTRO", "ancho_excavacion_m": 1.8})
        self.assertIn("Filtro", fil)
        self.assertIn("Tuber", alc)
        self.assertIn("hatchPink", fil)
        self.assertIn("hatchBlue", alc)


class TestPdfCellPadding(unittest.TestCase):
    def test_routes_css_row_height(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn("padding:4px 5px", src)
        self.assertIn("line-height:1.4", src)
        self.assertIn("graficos-wrap", src)


if __name__ == "__main__":
    unittest.main()
