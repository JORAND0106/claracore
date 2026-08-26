"""Cargos de topografía: normalización de acentos para filtro de operadores."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_cargos import es_cargo_topografia, normalizar_texto_cargo  # noqa: E402


class TestEsCargoTopografia(unittest.TestCase):
    def test_acentos_topografo(self):
        self.assertTrue(es_cargo_topografia("Topógrafo"))
        self.assertTrue(es_cargo_topografia("Coordinador de Topografía"))
        self.assertTrue(es_cargo_topografia("Auxiliar de Topografia"))

    def test_cadenero(self):
        self.assertTrue(es_cargo_topografia("Cadenero"))
        self.assertTrue(es_cargo_topografia("CADENERO"))

    def test_desarrollador(self):
        self.assertTrue(es_cargo_topografia("Desarrollador"))

    def test_otros_cargos_excluidos(self):
        self.assertFalse(es_cargo_topografia("Ingeniero residente"))
        self.assertFalse(es_cargo_topografia("Almacenista"))
        self.assertFalse(es_cargo_topografia(""))
        self.assertFalse(es_cargo_topografia(None))

    def test_normalizar(self):
        self.assertEqual(normalizar_texto_cargo("Topógrafo"), "topografo")
        self.assertIn("topograf", normalizar_texto_cargo("Topógrafo"))


if __name__ == "__main__":
    unittest.main()
