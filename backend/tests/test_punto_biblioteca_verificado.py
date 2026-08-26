"""
Regresión: editar BM en Biblioteca debe persistir «verificado».

Causa histórica: PUT /puntos/{id} actualizaba nombre/coords/tipo pero omitía
verificado → el checkbox «Marcar como verificado» no cambiaba el listado ni
habilitaba BM inicial en Circuito de Nivelación.

Ejecutar:
  cd backend && python3 -m unittest tests.test_punto_biblioteca_verificado -v
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_utils import payload_actualizar_punto_biblioteca  # noqa: E402


class TestPayloadActualizarPuntoBiblioteca(unittest.TestCase):
    def test_bm_pendiente_marca_verificado_y_fecha(self):
        existing = {
            "id": "p1",
            "nombre": "GPS 1",
            "verificado": False,
            "tipo": "BM",
            "modulo_origen": "poligonal_amarre",
        }
        payload = payload_actualizar_punto_biblioteca(
            existing,
            nombre="GPS 1",
            norte=1000.0,
            este=2000.0,
            cota=100.0,
            tipo="BM",
            verificado=True,
        )
        self.assertTrue(payload["verificado"])
        self.assertIsNotNone(payload.get("fecha_verificacion"))
        self.assertEqual(payload["nombre"], "GPS 1")
        self.assertEqual(payload["tipo"], "BM")
        self.assertIn("verificado", payload)

    def test_bm_verificado_desmarcar_limpia_fecha(self):
        existing = {"verificado": True, "fecha_verificacion": "2026-01-01T00:00:00Z"}
        payload = payload_actualizar_punto_biblioteca(
            existing,
            nombre="GPS 2",
            norte=None,
            este=None,
            cota=None,
            tipo="BM",
            verificado=False,
        )
        self.assertFalse(payload["verificado"])
        self.assertIsNone(payload["fecha_verificacion"])

    def test_no_bm_no_puede_quedar_verificado_manual(self):
        existing = {"verificado": False}
        payload = payload_actualizar_punto_biblioteca(
            existing,
            nombre="X",
            norte=1.0,
            este=2.0,
            cota=3.0,
            tipo="estacion",
            verificado=True,
        )
        self.assertFalse(payload["verificado"])
        self.assertIsNone(payload["fecha_verificacion"])

    def test_bm_ya_verificado_no_reescribe_fecha(self):
        existing = {"verificado": True, "fecha_verificacion": "2026-01-01T00:00:00Z"}
        payload = payload_actualizar_punto_biblioteca(
            existing,
            nombre="GPS 1",
            norte=1.0,
            este=2.0,
            cota=3.0,
            tipo="BM",
            verificado=True,
        )
        self.assertTrue(payload["verificado"])
        self.assertNotIn("fecha_verificacion", payload)

    def test_regresion_payload_antiguo_sin_verificado_fallaba(self):
        """El bug: update solo tenía nombre/norte/este/cota/tipo."""
        payload = payload_actualizar_punto_biblioteca(
            {"verificado": False},
            nombre="GPS 1",
            norte=1.0,
            este=2.0,
            cota=3.0,
            tipo="BM",
            verificado=True,
        )
        self.assertIn("verificado", payload)
        self.assertTrue(payload["verificado"])


if __name__ == "__main__":
    unittest.main()
