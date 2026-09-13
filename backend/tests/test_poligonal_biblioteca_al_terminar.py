"""
Publicación a biblioteca al terminar poligonal (sin esperar interventoría).

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_biblioteca_al_terminar -v
"""
from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _poligonal_sellada_src() -> str:
    src = (ROOT / "topografia_routes.py").read_text(encoding="utf-8")
    return src


class TestPoligonalBibliotecaAlTerminar(unittest.TestCase):
    def test_sellada_solo_nivel2_aprobado(self):
        """biblioteca_at ya no sella; solo interventoría (nivel2 Aprobado)."""
        # Evaluar la función actual del módulo sin cargar FastAPI/supabase.
        src = _poligonal_sellada_src()
        self.assertIn("def _poligonal_sellada", src)
        # Extraer cuerpo de la función
        tree = ast.parse(src)
        fn = next(
            n for n in tree.body
            if isinstance(n, ast.FunctionDef) and n.name == "_poligonal_sellada"
        )
        body_src = ast.get_source_segment(src, fn)
        self.assertIsNotNone(body_src)
        # Solo el return importa: no usar biblioteca_at como predicado
        ret = next(n for n in fn.body if isinstance(n, ast.Return))
        ret_src = ast.get_source_segment(src, ret)
        self.assertIn("nivel2_estado", ret_src)
        self.assertIn("Aprobado", ret_src)
        self.assertNotIn("biblioteca_at", ret_src)

    def test_cerrar_publica_biblioteca(self):
        src = _poligonal_sellada_src()
        # cerrar_poligonal debe llamar a publicar
        idx_cerrar = src.index("def cerrar_poligonal")
        idx_next = src.index("\n@router.", idx_cerrar + 1)
        bloque = src[idx_cerrar:idx_next]
        self.assertIn("_publicar_poligonal_en_biblioteca", bloque)
        self.assertIn('"biblioteca": True', bloque)
        self.assertIn("Puntos publicados en biblioteca", bloque)

    def test_validacion_nivel2_sigue_publicando(self):
        src = _poligonal_sellada_src()
        idx = src.index("def _aplicar_validacion_poligonal")
        idx_next = src.index("\ndef _punto_verificado", idx)
        bloque = src[idx:idx_next]
        self.assertIn("nivel == 2 and body.estado == \"Aprobado\"", bloque)
        self.assertIn("_publicar_poligonal_en_biblioteca", bloque)

    def test_reabrir_limpia_biblioteca_at(self):
        src = _poligonal_sellada_src()
        idx = src.index("def reabrir_poligonal")
        idx_next = src.index("\n@router.", idx + 1)
        bloque = src[idx:idx_next]
        self.assertIn('"biblioteca_at": None', bloque)


if __name__ == "__main__":
    unittest.main()
