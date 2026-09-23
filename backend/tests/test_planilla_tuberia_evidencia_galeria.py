"""Evidencia planilla tubería: galería por URL (sin CORS en el browser).

Evita importar topografia_planilla_tuberia_routes (circular con main).
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROUTES = Path(__file__).resolve().parents[1] / "topografia_planilla_tuberia_routes.py"
EVID_BTN = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "components"
    / "topografia"
    / "planillaTuberia"
    / "PlanillaTuberiaEvidenciaBtn.jsx"
)
FORM = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "components"
    / "topografia"
    / "planillaTuberia"
    / "PlanillaTuberiaForm.jsx"
)


class TestEvidenciaGaleriaContrato(unittest.TestCase):
    def test_backend_acepta_url_y_descarga_server_side(self):
        src = ROUTES.read_text(encoding="utf-8")
        self.assertIn("class EvidenciaBody", src)
        self.assertIn("url: Optional[str] = None", src)
        self.assertIn("data_base64: Optional[str] = None", src)
        self.assertIn("def _descargar_imagen_desde_url", src)
        self.assertIn("def _contenido_evidencia_desde_body", src)
        self.assertIn("_contenido_evidencia_desde_body(body)", src)
        self.assertIn('origen = str(body.origen or "").strip() or ("galeria"', src)
        # AST: EvidenciaBody tiene campos url y data_base64 opcionales
        tree = ast.parse(src)
        body_cls = next(
            n for n in tree.body
            if isinstance(n, ast.ClassDef) and n.name == "EvidenciaBody"
        )
        anns = {
            n.target.id
            for n in body_cls.body
            if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
        }
        self.assertIn("url", anns)
        self.assertIn("data_base64", anns)

    def test_frontend_galeria_no_redescarga_en_browser(self):
        evid = EVID_BTN.read_text(encoding="utf-8")
        form = FORM.read_text(encoding="utf-8")
        self.assertNotIn("fileFromUrl", evid)
        self.assertNotIn("await fetch(", evid)
        self.assertIn("origen: 'galeria'", evid)
        self.assertIn("url: String(url)", evid)
        self.assertIn("EVIDENCIA_GALERIA_Z_INDEX", evid)
        self.assertIn("if (url) payload.url = url", form)


if __name__ == "__main__":
    unittest.main()
