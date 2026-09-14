"""Persistencia segura de cartera de nivelación (helpers de sanitizado/conteo)."""

import unittest

from topografia_utils import (
    contar_puntos_lecturas_nivelacion,
    sanitizar_fila_lectura_nivelacion,
)


class TestNivelacionGuardarCartera(unittest.TestCase):
    def test_sanitizar_descarta_calculados_y_normaliza_tp(self):
        raw = {
            "orden": 3,
            "nombre_punto": "BM1",
            "tipo_punto": "TP",
            "tipo_lectura": "V+",
            "lectura": 1.25,
            "distancia_m": 40,
            "altura_instrumento": 100.5,
            "cota_calculada": 99.0,
            "id": "should-drop",
            "foo": "bar",
        }
        out = sanitizar_fila_lectura_nivelacion(raw)
        self.assertNotIn("altura_instrumento", out)
        self.assertNotIn("cota_calculada", out)
        self.assertNotIn("id", out)
        self.assertNotIn("foo", out)
        self.assertEqual(out["tipo_punto"], "estacion")
        self.assertEqual(out["lectura"], 1.25)

        with_id = sanitizar_fila_lectura_nivelacion(raw, keep_id=True)
        self.assertEqual(with_id["id"], "should-drop")

    def test_sanitizar_quita_tipo_punto_vacio(self):
        out = sanitizar_fila_lectura_nivelacion(
            {"orden": 1, "nombre_punto": "A", "tipo_punto": "", "tipo_lectura": "Vi", "lectura": 1.0}
        )
        self.assertNotIn("tipo_punto", out)

    def test_contar_puntos_agrupa_por_bloque_de_orden(self):
        rows = [
            {"orden": 3},
            {"orden": 1},
            {"orden": 2},  # misma fila 0
            {"orden": 11},
            {"orden": 13},  # fila 1
            {"orden": 22},  # fila 2
        ]
        self.assertEqual(contar_puntos_lecturas_nivelacion(rows), 3)


if __name__ == "__main__":
    unittest.main()
