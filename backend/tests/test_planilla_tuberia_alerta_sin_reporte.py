"""Alerta del ícono de Topografía: planillas sin reporte vigente."""
from __future__ import annotations

import unittest
from pathlib import Path

from topografia_planilla_tuberia import (
    contar_planillas_sin_reporte_vigente,
    planilla_sin_reporte_vigente,
    reportes_sicoe_para_listado,
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
        self.assertIn("_so_reportes_existentes", bloque)
        listar = src.split("def listar(", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("reportes_sicoe_para_listado", listar)
        self.assertIn("_so_reportes_existentes", listar)

    def test_grilla_y_alerta_coinciden(self):
        """El número guardado no cuenta si el reporte ya no existe."""
        vigente = _planilla([{"reporte_id": 9, "numero_reporte": 1}])
        eliminado = _planilla([{"reporte_id": 4, "numero_reporte": 99}])
        nueva = _planilla([])
        casos = [vigente, eliminado, nueva]
        self.assertEqual(contar_planillas_sin_reporte_vigente(casos, _VIGENTES), 2)
        self.assertEqual(
            reportes_sicoe_para_listado(vigente, _VIGENTES),
            [{"reporte_id": 9, "numero_reporte": 128}],
        )
        self.assertEqual(reportes_sicoe_para_listado(eliminado, _VIGENTES), [])
        self.assertEqual(reportes_sicoe_para_listado(nueva, _VIGENTES), [])
        self.assertEqual(
            sum(1 for p in casos if not reportes_sicoe_para_listado(p, _VIGENTES)),
            contar_planillas_sin_reporte_vigente(casos, _VIGENTES),
        )
        mezcla = _planilla([
            {"reporte_id": 4, "numero_reporte": 99},
            {"reporte_id": 3, "numero_reporte": 1},
        ])
        self.assertFalse(planilla_sin_reporte_vigente(mezcla, _VIGENTES))
        self.assertEqual(
            reportes_sicoe_para_listado(mezcla, _VIGENTES),
            [{"reporte_id": 3, "numero_reporte": 7}],
        )


if __name__ == "__main__":
    unittest.main()
