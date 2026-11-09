"""Parseo de CSV/filas de diseño geométrico — reconocimiento de cotas."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from topografia_diseno_utils import (  # noqa: E402
    PLANTILLA_CSV_DISENO,
    _map_headers,
    _norm_header,
    parse_csv_diseno_rasante,
    parse_filas_diseno_rasante,
)


class TestNormHeaders(unittest.TestCase):
    def test_quita_sufijo_unidad(self):
        self.assertEqual(_norm_header("Izquierda (m)"), "izquierda")
        self.assertEqual(_norm_header("Eje_m"), "eje")
        self.assertEqual(_norm_header("Cota Izq"), "cota_izq")

    def test_mapea_aliases_comunes(self):
        mapped = _map_headers([
            "Tramo", "Abscisa", "Izquierda (m)", "Eje (m)", "Derecha (m)", "Ancho",
        ])
        self.assertEqual(set(mapped.values()), {
            "tramo", "abscisa", "cota_izquierda", "cota_eje", "cota_derecha", "ancho",
        })
        mapped2 = _map_headers(["PK", "Cota Izq", "Cota Eje", "Cota Der"])
        self.assertEqual(mapped2[0], "abscisa")
        self.assertEqual(mapped2[1], "cota_izquierda")
        self.assertEqual(mapped2[2], "cota_eje")
        self.assertEqual(mapped2[3], "cota_derecha")


class TestParseCsv(unittest.TestCase):
    def test_plantilla_ok(self):
        filas = parse_csv_diseno_rasante(PLANTILLA_CSV_DISENO)
        self.assertEqual(len(filas), 3)
        self.assertAlmostEqual(filas[0]["cota_eje"], 801.55)

    def test_titulo_antes_del_encabezado(self):
        csv = (
            "Diseño Tramo 7\r\n"
            "TRAMO,ABSCISA,IZQUIERDA,EJE,DERECHA,ANCHO\r\n"
            "T7,11170,900.1,900.2,900.15,9\r\n"
        )
        filas = parse_csv_diseno_rasante(csv)
        self.assertEqual(len(filas), 1)
        self.assertAlmostEqual(filas[0]["cota_izquierda"], 900.1)

    def test_rechaza_solo_abscisas(self):
        csv = "TRAMO,ABSCISA,ANCHO\r\nT7,11170,9\r\n"
        with self.assertRaises(ValueError) as ctx:
            parse_csv_diseno_rasante(csv)
        self.assertIn("cotas", str(ctx.exception).lower())

    def test_rechaza_columnas_cotas_vacias(self):
        csv = "TRAMO,ABSCISA,IZQUIERDA,EJE,DERECHA\r\nT7,11170,,,\r\n"
        with self.assertRaises(ValueError) as ctx:
            parse_csv_diseno_rasante(csv)
        self.assertIn("ninguna fila tiene cotas", str(ctx.exception).lower())


class TestParseFilas(unittest.TestCase):
    def test_acepta_cero_como_cota(self):
        filas = parse_filas_diseno_rasante([
            {"abscisa": 10, "cota_izquierda": 0, "cota_eje": 0.1, "cota_derecha": 0},
        ])
        self.assertEqual(filas[0]["cota_izquierda"], 0.0)
        self.assertEqual(filas[0]["cota_derecha"], 0.0)

    def test_rechaza_sin_cotas(self):
        with self.assertRaises(ValueError):
            parse_filas_diseno_rasante([{"abscisa": 10}])


if __name__ == "__main__":
    unittest.main()
