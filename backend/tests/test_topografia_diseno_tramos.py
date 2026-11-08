"""Validaciones de sectores y alertas de abscisas — Configuración DG v3."""
from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

# Evitar dependencia de FastAPI en el entorno de tests unitarios.
if "fastapi" not in sys.modules:
    fake = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code=400, detail=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    fake.HTTPException = HTTPException
    sys.modules["fastapi"] = fake

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from topografia_diseno_tramos import (  # noqa: E402
    alerta_abscisas_diseno,
    capas_para_abscisa,
    estructura_en_abscisa,
    validar_sectores_tramo,
)
from fastapi import HTTPException  # noqa: E402


class TestValidarSectores(unittest.TestCase):
    def test_una_estructura_cubre_todo_el_tramo(self):
        out = validar_sectores_tramo(100.0, 200.0, [
            {"estructura_id": "e1", "abscisa_inicio": 110, "abscisa_fin": 190},
        ])
        self.assertEqual(out[0]["abscisa_inicio"], 100.0)
        self.assertEqual(out[0]["abscisa_fin"], 200.0)

    def test_sector_fuera_del_tramo_falla(self):
        with self.assertRaises(HTTPException) as ctx:
            validar_sectores_tramo(0.0, 100.0, [
                {"estructura_id": "e1", "abscisa_inicio": 0, "abscisa_fin": 50},
                {"estructura_id": "e2", "abscisa_inicio": 50, "abscisa_fin": 150},
            ])
        self.assertEqual(ctx.exception.status_code, 422)


class TestAlertaAbscisas(unittest.TestCase):
    def test_sin_alerta_si_coincide(self):
        alerta = alerta_abscisas_diseno(0, 100, [
            {"abscisa_inicio": 0, "abscisa_fin": 100},
        ], [{"abscisa": 0}, {"abscisa": 100}])
        self.assertIsNone(alerta)

    def test_alerta_si_diseno_excede_tramo(self):
        alerta = alerta_abscisas_diseno(0, 100, [
            {"abscisa_inicio": 0, "abscisa_fin": 100},
        ], [{"abscisa": -10}, {"abscisa": 120}])
        self.assertIsNotNone(alerta)
        self.assertEqual(alerta["tipo"], "abscisas_diseno")


class TestEstructuraPorAbscisa(unittest.TestCase):
    def test_resuelve_sector(self):
        sectores = [
            {
                "abscisa_inicio": 0, "abscisa_fin": 50,
                "estructura": {"id": "a", "capas": [{"nombre": "MD", "espesor_m": 0.05}]},
            },
            {
                "abscisa_inicio": 50, "abscisa_fin": 100,
                "estructura": {"id": "b", "capas": [{"nombre": "BG", "espesor_m": 0.20}]},
            },
        ]
        self.assertEqual(estructura_en_abscisa(sectores, 25)["id"], "a")
        self.assertEqual(estructura_en_abscisa(sectores, 75)["id"], "b")
        capas = capas_para_abscisa(sectores, 75, [{"nombre": "MD", "espesor_m": 0.05}])
        self.assertEqual(capas[0]["nombre"], "BG")


if __name__ == "__main__":
    unittest.main()
