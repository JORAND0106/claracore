"""Tests unitarios del consolidado Gestión de obra (sin DB)."""
from __future__ import annotations

import unittest
from datetime import date

from gestion_obra_service import (
    _agg_actividades,
    _agg_personal_desde_diarios,
    _dias_rango,
    _empresa_asistencia,
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

    def test_dias_rango(self):
        dias = _dias_rango(date(2026, 10, 5), date(2026, 10, 7))
        self.assertEqual(dias, ["2026-10-05", "2026-10-06", "2026-10-07"])


class TestEmpresaAsistencia(unittest.TestCase):
    def test_usa_subcontratista_nombre(self):
        self.assertEqual(
            _empresa_asistencia({"subcontratista_nombre": "ACME SAS", "empresa": "Otro"}),
            "ACME SAS",
        )

    def test_fallback(self):
        self.assertEqual(_empresa_asistencia({}), "Sin empresa")


class TestPersonalAgg(unittest.TestCase):
    def test_personal_con_empresa_desde_asistencia(self):
        dias = ["2026-10-06", "2026-10-07"]
        diarios = [
            {
                "fecha": "2026-10-06",
                # personal agregado NO debe sumarse si hay asistencia (evita doble conteo)
                "personal": [{"cargo": "Oficial", "cantidad": 99}],
                "asistencia_colaboradores": [
                    {
                        "nombre": "Juan Pérez",
                        "cargo": "Ayudante",
                        "subcontratista_nombre": "ACME",
                        "estado": "activo",
                        "hora_ingreso": "07:00",
                        "hora_salida": "17:00",
                    },
                    {
                        "nombre": "Ana",
                        "cargo": "Ayudante",
                        "subcontratista_nombre": "ACME",
                        "estado": "ausente",
                    },
                ],
                "equipos_uso": [{"equipo_nombre": "Retro", "cantidad": 1}],
            },
            {
                "fecha": "2026-10-07",
                "asistencia_colaboradores": [
                    {
                        "cargo": "Oficial",
                        "subcontratista_nombre": "ACME",
                        "estado": "activo",
                        "hora_ingreso": "07:00",
                        "hora_salida": "16:00",
                    },
                ],
            },
        ]
        out = _agg_personal_desde_diarios(diarios, dias)
        self.assertTrue(out["disponible"])
        empresas = {e["empresa"] for e in out["personal"]["empresas"]}
        self.assertIn("ACME", empresas)
        self.assertNotIn("Sin empresa", empresas)
        # No debe haber filas con cantidad 99 del personal agregado
        for e in out["personal"]["empresas"]:
            for f in e["filas"]:
                self.assertLess(f["total"], 99)
        # persona-días presentes: 1 (día6) + 1 (día7) = 2
        self.assertEqual(out["personal"]["total_persona_dias"], 2)
        self.assertEqual(out["ausentismo"]["presentes"], 2)
        self.assertEqual(out["ausentismo"]["ausentes"], 1)
        # ACME Ayudante solo el 06
        acme = next(e for e in out["personal"]["empresas"] if e["empresa"] == "ACME")
        ayud = next(f for f in acme["filas"] if f["cargo"] == "Ayudante")
        self.assertEqual(ayud["por_dia"]["2026-10-06"], 1)
        self.assertEqual(ayud["por_dia"].get("2026-10-07", 0), 0)

    def test_vacio(self):
        out = _agg_personal_desde_diarios([], ["2026-10-05"])
        self.assertFalse(out["disponible"])


class TestActividades(unittest.TestCase):
    def test_por_dia(self):
        dias = ["2026-10-07"]
        diarios = [{
            "fecha": "2026-10-07",
            "tramo": "K0+000",
            "eventos": [{
                "evento_detalle": {
                    "actividades": [{"nombre": "Excavación", "detalle": "norte"}],
                },
            }],
        }]
        out = _agg_actividades(diarios, dias)
        self.assertTrue(out["disponible"])
        self.assertEqual(out["series"][0]["valor"], 1)
        self.assertEqual(out["por_dia"][0]["actividades"][0]["actividad"], "Excavación")


class TestObservaciones(unittest.TestCase):
    def test_merge(self):
        m = merge_observaciones({"personal_jornada": "<p>A</p>"}, {"almacen": "<p>B</p>"})
        self.assertEqual(m["personal_jornada"], "<p>A</p>")
        self.assertEqual(m["almacen"], "<p>B</p>")

    def test_normalize(self):
        n = normalize_gestion_obra({
            "fecha_desde": "2026-10-01",
            "fecha_hasta": "2026-10-07",
            "datos": {"x": 1},
            "observaciones": {"personal_jornada": "ok"},
        })
        self.assertEqual(n["fecha_desde"], "2026-10-01")
        self.assertEqual(set(empty_observaciones().keys()), set(n["observaciones"].keys()))


if __name__ == "__main__":
    unittest.main()
