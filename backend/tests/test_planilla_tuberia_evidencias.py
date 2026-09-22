"""Evidencias fotográficas por línea de cantidad — Planillas de Tubería."""

from __future__ import annotations

import unittest

from topografia_planilla_tuberia import (
    calcular_planilla_completa,
    lineas_con_cantidad_calculada,
    mensaje_faltan_evidencias,
    normalizar_evidencias_fotograficas,
    validar_evidencias_fotograficas,
)


def _filas():
    return [
        {
            "orden": 1, "abscisa": 0, "terreno_natural": 100,
            "subrasante_via": 99.5, "cota_fondo_excavacion": 98,
        },
        {
            "orden": 2, "abscisa": 10, "terreno_natural": 100.2,
            "subrasante_via": 99.7, "cota_fondo_excavacion": 98.1,
        },
    ]


class TestEvidenciasFotograficas(unittest.TestCase):
    def test_lineas_con_cantidad_requieren_foto(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        lineas = lineas_con_cantidad_calculada(r)
        self.assertGreaterEqual(len(lineas), 2)
        self.assertTrue(any(l["scope"] == "cantidades" and l["codigo"] == "EXC" for l in lineas))
        self.assertTrue(any(l["scope"] == "descuentos" for l in lineas))

    def test_validacion_bloquea_sin_fotos(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        v = validar_evidencias_fotograficas(r, {})
        self.assertFalse(v["ok"])
        self.assertTrue(v["faltantes"])
        msg = mensaje_faltan_evidencias(v["faltantes"])
        self.assertIn("falta registro fotográfico", msg.lower())
        self.assertIn("Resumen de Cantidades", msg)

    def test_validacion_ok_con_foto_por_linea(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(),
        )
        ev = {"cantidades": {}, "descuentos": {}}
        for linea in lineas_con_cantidad_calculada(r):
            ev[linea["scope"]][linea["codigo"]] = [{
                "id": "f1", "data_uri": "data:image/jpeg;base64,aaa",
            }]
        v = validar_evidencias_fotograficas(r, ev)
        self.assertTrue(v["ok"])
        self.assertEqual(v["faltantes"], [])

    def test_normalizar_descarta_fotos_vacias(self):
        raw = {
            "cantidades": {"EXC": [{"id": "1"}, {"id": "2", "blob_path": "x/y.jpg"}]},
            "descuentos": {"DESC_A1": "bad"},
        }
        n = normalizar_evidencias_fotograficas(raw)
        self.assertEqual(len(n["cantidades"]["EXC"]), 1)
        self.assertEqual(n["cantidades"]["EXC"][0]["id"], "2")
        self.assertEqual(n["descuentos"], {})

    def test_lineas_cero_no_exigen_foto(self):
        calc = {
            "netos": [
                {"codigo": "OTROS", "nombre": "Otros: ____", "neto": 0},
                {"codigo": "EXC", "nombre": "Excavación Varias", "neto": 1.5},
            ],
            "descuentos": [
                {"codigo": "DESC_OTROS", "nombre": "Otros", "cantidad": 0},
            ],
        }
        lineas = lineas_con_cantidad_calculada(calc)
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]["codigo"], "EXC")


if __name__ == "__main__":
    unittest.main()
