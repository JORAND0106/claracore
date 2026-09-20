
"""PDF planilla tubería: portrait, 2 filas vacías, sin duplicar contrato, gráfico tipado."""
from __future__ import annotations

import ast
import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_pdf_mod():
    tu = types.ModuleType("topografia_utils")
    tu._html_logo_pdf = lambda *a, **k: "<div>LOGO</div>"
    tu.svg_embed_pdf = lambda s, w, h: f'<img width="{w}" height="{h}"/>'
    sys.modules["topografia_utils"] = tu
    spec = importlib.util.spec_from_file_location(
        "topografia_planilla_tuberia_pdf", ROOT / "topografia_planilla_tuberia_pdf.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestMotorFilasIniciales(unittest.TestCase):
    def test_constante_2(self):
        from topografia_planilla_tuberia import FILAS_INICIALES_CARTERA
        self.assertEqual(FILAS_INICIALES_CARTERA, 2)


class TestRoutesPortraitYFilas(unittest.TestCase):
    def test_source_portrait_2_filas_tipo(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn("size: letter portrait", src)
        self.assertIn("landscape=False", src)
        self.assertNotIn("size: letter landscape", src)
        self.assertIn("FILAS_INICIALES_CARTERA + 1", src)
        self.assertNotIn("range(1, 9)", src)
        self.assertIn("html_bloque_graficos_pdf(calc, tipo=tipo)", src)


class TestCabeceraSinDuplicado(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_pdf_mod()

    def test_numero_objeto_una_vez(self):
        cab = self.mod.html_cabecera_planilla_tuberia(
            contrato={"numero": "CTO-99", "objeto": "Obra puente demo", "contratista": "ACME"},
            meta={},
            titulo="PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS",
        )
        self.assertEqual(cab.count("CTO-99"), 1)
        self.assertEqual(cab.count("Obra puente demo"), 1)
        self.assertIn("<b>Nº:</b>", cab)
        self.assertIn("<b>Objeto:</b>", cab)
        # No debe repetir numero/objeto como bloque libre debajo
        self.assertNotIn("info_contrato", cab)


class TestGraficoTipadoPorParametro(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_pdf_mod()

    def test_tipo_param_override_vacio(self):
        # calc vacío: el tipo de planilla debe decidir el PNG
        h_alc = self.mod.html_bloque_graficos_pdf({}, tipo="ALCANTARILLA")
        h_fil = self.mod.html_bloque_graficos_pdf({}, tipo="FILTRO")
        self.assertIn("data:image/png", h_alc)
        self.assertIn("data:image/png", h_fil)
        self.assertIn("Tuber", h_alc)
        self.assertIn("Filtro", h_fil)
        self.assertNotEqual(h_alc, h_fil)


if __name__ == "__main__":
    unittest.main()
