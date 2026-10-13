"""Tipos de acta personalizados: normalización y sin duplicados."""
from __future__ import annotations

import unittest

from seguimiento_tipo_acta import (
    acta_incluye_gestion_obra,
    display_tipo_acta,
    norm_tipo_key,
    normalize_tipo_acta_value,
)


class TestTipoActaNorm(unittest.TestCase):
    def test_builtins(self):
        self.assertEqual(normalize_tipo_acta_value("Interna"), "interna")
        self.assertEqual(normalize_tipo_acta_value("EXTERNA"), "externa")
        self.assertEqual(display_tipo_acta("interna"), "Interna")

    def test_gestion_obra_solo_interna_externa(self):
        self.assertTrue(acta_incluye_gestion_obra("interna"))
        self.assertTrue(acta_incluye_gestion_obra("Externa"))
        self.assertFalse(acta_incluye_gestion_obra("Capacitación"))
        self.assertFalse(acta_incluye_gestion_obra("Comité"))
        self.assertFalse(acta_incluye_gestion_obra(""))

    def test_custom_dedupe_accents(self):
        k1 = norm_tipo_key("Comité Técnico")
        k2 = norm_tipo_key("COMITE TECNICO")
        k3 = norm_tipo_key("comité técnico")
        self.assertEqual(k1, k2)
        self.assertEqual(k1, k3)
        canon = normalize_tipo_acta_value(
            "COMITE TECNICO",
            custom_nombres=["Comité Técnico"],
        )
        self.assertEqual(canon, "Comité Técnico")

    def test_custom_new(self):
        self.assertEqual(normalize_tipo_acta_value("  Seguimiento  semanal "), "Seguimiento semanal")

    def test_empty(self):
        with self.assertRaises(ValueError):
            normalize_tipo_acta_value("   ")


if __name__ == "__main__":
    unittest.main()
