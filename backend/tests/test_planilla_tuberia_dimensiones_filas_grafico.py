"""Planilla tubería: alturas de fila cartera/resumen y panel gráfico 160%."""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_pdf_mod():
    tu = types.ModuleType("topografia_utils")
    tu.svg_embed_pdf = lambda s, w, h: f'<img width="{w}" height="{h}"/>'
    tu._html_logo_pdf = lambda *a, **k: "<div>LOGO</div>"
    sys.modules["topografia_utils"] = tu
    spec = importlib.util.spec_from_file_location(
        "topografia_planilla_tuberia_pdf", ROOT / "topografia_planilla_tuberia_pdf.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestDimensionesPdf(unittest.TestCase):
    def test_routes_css_escalas(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn("class=\"sheet cartera\"", src)
        self.assertIn("class=\"sheet resumen\"", src)
        self.assertIn("padding:3px 4px", src)  # cartera ~70%
        self.assertIn("padding:2px 3px", src)  # resumen ~50%
        self.assertIn("height:141px", src)  # gráfico ~160% de 88

    def test_bloque_graficos_defaults_160(self):
        mod = _load_pdf_mod()
        # Inspect defaults via signature
        import inspect
        sig = inspect.signature(mod.html_bloque_graficos_pdf)
        self.assertEqual(sig.parameters["sec_w"].default, 256)
        self.assertEqual(sig.parameters["sec_h"].default, 136)
        self.assertEqual(sig.parameters["perfil_h"].default, 136)


if __name__ == "__main__":
    unittest.main()
