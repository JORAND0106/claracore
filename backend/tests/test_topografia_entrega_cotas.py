"""Cota de diseño por capa y etiqueta de tramo/sector en entrega."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from topografia_diseno_utils import (  # noqa: E402
    cota_diseno_capa,
    cota_fondo_capa,
    espesor_acumulado_hasta_capa,
)
from topografia_entrega_utils import (  # noqa: E402
    _etiqueta_tramo_rasante,
    enriquecer_tramo_rasante,
    info_sector_rango,
    calcular_lectura_entrega,
)


CAPAS_MDC = [
    {"nombre": "MDC-19", "espesor_m": 0.09},
    {"nombre": "MGEA", "espesor_m": 0.13},
    {"nombre": "Reciclado", "espesor_m": 0.30},
]


class TestCotaDisenoCapa(unittest.TestCase):
    def test_ejemplo_mdc_mgea_reciclado(self):
        ras = 1000.0
        # MDC-19 (índice 0) → rasante
        self.assertAlmostEqual(cota_diseno_capa(ras, CAPAS_MDC, 0), 1000.0)
        # MGEA → rasante − 0.09
        self.assertAlmostEqual(cota_diseno_capa(ras, CAPAS_MDC, 1), 999.91)
        # Reciclado → rasante − 0.22
        self.assertAlmostEqual(cota_diseno_capa(ras, CAPAS_MDC, 2), 999.78)
        # Fondo de cada capa (incl. propio espesor) sigue disponible
        self.assertAlmostEqual(cota_fondo_capa(ras, CAPAS_MDC, 0), 999.91)
        self.assertAlmostEqual(espesor_acumulado_hasta_capa(CAPAS_MDC, 2), 0.22)

    def test_cota_campo_directa_sin_hi(self):
        grilla = [{
            "abscisa": 10.0, "ordenada": 0.0, "tramo": "T7",
            "cota_rasante": 1000.0, "cota_diseno": 1000.0, "espesor_diseno_m": 0.09,
        }]
        calc = calcular_lectura_entrega(
            grilla, 10.0, 0.0, None, None, 0.01,
            cota_campo_directa=999.995,
        )
        self.assertAlmostEqual(calc["cota_campo"], 999.995)
        self.assertIsNotNone(calc["delta"])


class TestEtiquetaTramo(unittest.TestCase):
    def test_usa_nombre_eje_si_csv_sin_tramo(self):
        row = {"abscisa": 11170, "tramo": None}
        self.assertEqual(
            _etiqueta_tramo_rasante(row, eje_nombre="TRAMO 7", sectores=[]),
            "TRAMO 7",
        )

    def test_enriquece_e_info_sector(self):
        ras = [
            {"abscisa": 11170, "tramo": None, "cota_eje": 900},
            {"abscisa": 11200, "tramo": "", "cota_eje": 901},
        ]
        out = enriquecer_tramo_rasante(ras, eje_nombre="TRAMO 7", sectores=[])
        self.assertEqual(out[0]["tramo"], "TRAMO 7")
        info = info_sector_rango(out, 11170, 11200, eje_nombre="TRAMO 7", sectores=[])
        self.assertEqual(info["tramos"][0]["tramo"], "TRAMO 7")
        self.assertNotIn("Sin tramo", info["tramos"][0]["tramo"])


if __name__ == "__main__":
    unittest.main()
