"""Tests unitarios del consolidado Gestión de obra (sin DB)."""
from __future__ import annotations

import unittest
from datetime import date

from gestion_obra_service import (
    _agg_actividades,
    _agg_personal_desde_diarios,
    empty_observaciones,
    merge_observaciones,
    normalize_gestion_obra,
    rango_semana_anterior,
)


class TestGestionObraRango(unittest.TestCase):
    def test_semana_anterior_a_reunion(self):
        d0, d1 = rango_semana_anterior("2026-10-12")
        self.assertEqual(d1, "2026-10-11")
        self.assertEqual(d0, "2026-10-05")

    def test_semana_con_date(self):
        d0, d1 = rango_semana_anterior(date(2026, 3, 1))
        self.assertEqual(d1, "2026-02-28")
        self.assertEqual(d0, "2026-02-22")


class TestPersonalAgg(unittest.TestCase):
    def test_personal_sin_nombres(self):
        diarios = [
            {
                "fecha": "2026-10-06",
                "personal": [{"cargo": "Oficial", "cantidad": 3, "empresa": "ACME"}],
                "equipos_uso": [{"equipo_nombre": "Retroexcavadora", "cantidad": 1}],
                "asistencia_colaboradores": [
                    {
                        "nombre": "Juan Pérez",
                        "cargo": "Ayudante",
                        "empresa_nombre": "ACME",
                        "estado": "activo",
                        "hora_ingreso": "07:00",
                        "hora_salida": "17:00",
                    },
                    {
                        "nombre": "Ana",
                        "cargo": "Ayudante",
                        "empresa_nombre": "ACME",
                        "estado": "ausente",
                    },
                ],
            }
        ]
        out = _agg_personal_desde_diarios(diarios)
        self.assertTrue(out["disponible"])
        cargos = {(r["empresa"], r["cargo"]) for r in out["personal"]["filas"]}
        self.assertIn(("ACME", "Oficial"), cargos)
        self.assertIn(("ACME", "Ayudante"), cargos)
        # No debe filtrar nombres en filas
        for r in out["personal"]["filas"]:
            self.assertNotIn("nombre", r)
        self.assertTrue(out["ausentismo"]["disponible"])
        self.assertEqual(out["ausentismo"]["ausentes"], 1)
        self.assertTrue(out["jornada"]["disponible"])
        self.assertAlmostEqual(out["jornada"]["promedio_horas"], 10.0)

    def test_vacio(self):
        out = _agg_personal_desde_diarios([])
        self.assertFalse(out["disponible"])
        self.assertIn("No hay", out["mensaje"] or "")


class TestActividades(unittest.TestCase):
    def test_eventos_actividades(self):
        diarios = [{
            "fecha": "2026-10-07",
            "tramo": "K0+000",
            "eventos": [{
                "evento_detalle": {
                    "actividades": [{"nombre": "Excavación", "detalle": "tramo norte"}],
                },
            }],
        }]
        out = _agg_actividades(diarios)
        self.assertTrue(out["disponible"])
        self.assertEqual(out["filas"][0]["actividad"], "Excavación")


class TestObservaciones(unittest.TestCase):
    def test_merge(self):
        m = merge_observaciones({"personal_jornada": "<p>A</p>"}, {"almacen": "<p>B</p>"})
        self.assertEqual(m["personal_jornada"], "<p>A</p>")
        self.assertEqual(m["almacen"], "<p>B</p>")
        self.assertEqual(m["actividades"], "")

    def test_normalize(self):
        n = normalize_gestion_obra({
            "fecha_desde": "2026-10-01",
            "fecha_hasta": "2026-10-07",
            "datos": {"x": 1},
            "observaciones": {"personal_jornada": "ok"},
        })
        self.assertEqual(n["fecha_desde"], "2026-10-01")
        self.assertEqual(n["observaciones"]["personal_jornada"], "ok")
        self.assertEqual(set(empty_observaciones().keys()), set(n["observaciones"].keys()))


if __name__ == "__main__":
    unittest.main()
