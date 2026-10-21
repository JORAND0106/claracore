"""Galería no debe exigir fotos_historial si la columna aún no existe."""
from __future__ import annotations

import unittest
from unittest import mock

import sicoe_registros_schema as schema


class TestGaleriaFotosHistorialOmit(unittest.TestCase):
    def setUp(self):
        schema.so_registros_clear_omit_cache()

    def tearDown(self):
        schema.so_registros_clear_omit_cache()

    def test_column_omitted_helper(self):
        self.assertFalse(schema.so_registros_column_omitted("fotos_historial"))
        schema.so_registros_remember_omit("fotos_historial")
        self.assertTrue(schema.so_registros_column_omitted("fotos_historial"))

    def test_pgrst_detecta_fotos_historial(self):
        err = Exception("Could not find the 'fotos_historial' column of 'so_registros' in the schema cache")
        self.assertEqual(schema.so_registros_pgrst_unknown_column(err), "fotos_historial")


if __name__ == "__main__":
    unittest.main()
