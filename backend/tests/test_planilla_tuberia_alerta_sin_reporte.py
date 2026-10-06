"""Alerta del ícono de Topografía: planillas sin reporte vigente."""
from __future__ import annotations

import unittest
from pathlib import Path

from topografia_planilla_tuberia import (
    contar_planillas_sin_reporte_vigente,
    planilla_sin_reporte_vigente,
)

_VIGENTES = [{"id": 9, "numero_reporte": 128}, {"id": 3, "numero_reporte": 7}]


def _planilla(links):
    return {"id": "p1", "meta_cabecera": {"sicoe_reportes": links}}


class TestAlertaPlanillasSinReporte(unittest.TestCase):
    def test_sin_reporte(self):
        p = _planilla([])
        self.assertTrue(planilla_sin_reporte_vigente(p, _VIGENTES))
        self.assertEqual(contar_planillas_sin_reporte_vigente([p], _VIGENTES), 1)

    def test_asociada_a_reporte_vigente(self):
        p = _planilla([{"reporte_id": 9, "numero_reporte": 1}])
        self.assertFalse(planilla_sin_reporte_vigente(p, _VIGENTES))
        self.assertEqual(contar_planillas_sin_reporte_vigente([p], _VIGENTES), 0)

    def test_reporte_eliminado_vuelve_a_contar(self):
        p = _planilla([{"reporte_id": 4, "numero_reporte": 99}])
        self.assertTrue(planilla_sin_reporte_vigente(p, _VIGENTES))
        otra = _planilla([{"reporte_id": 3, "numero_reporte": 7}])
        self.assertEqual(
            contar_planillas_sin_reporte_vigente([p, otra, {"meta_cabecera": {}}], _VIGENTES),
            2,
        )

    def test_la_ruta_exige_ver_topografia_y_consulta_so_reportes(self):
        src = (
            Path(__file__).resolve().parents[1] / "topografia_planilla_tuberia_routes.py"
        ).read_text(encoding="utf-8")
        bloque = src.split("def alerta_planillas_sin_reporte", 1)[1].split("\n@router.", 1)[0]
        self.assertIn('_perm(current_user, "ver", contrato_id)', bloque)
        self.assertIn('supabase.table("so_reportes")', bloque)
        self.assertIn("contar_planillas_sin_reporte_vigente", bloque)


if __name__ == "__main__":
    unittest.main()
