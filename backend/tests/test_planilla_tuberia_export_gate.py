"""Gate de exportación vacía — solo Desarrollador (sin dependencias pesadas)."""
from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")


class ExportGateSourceTests(unittest.TestCase):
    def test_helpers_present(self):
        self.assertIn("def _tiene_datos_exportables", ROUTES)
        self.assertIn("def _assert_export_permitido", ROUTES)

    def test_dev_gate_message(self):
        start = ROUTES.index("def _assert_export_permitido")
        block = ROUTES[start: start + 900]
        self.assertIn("Desarrollador", block)
        self.assertIn("422", block)
        self.assertIn("_es_desarrollador", block)

    def test_calc_fill_f2f2f2(self):
        self.assertIn("F2F2F2", ROUTES)


class ExportGateLogicTests(unittest.TestCase):
    """Replica la lógica de los helpers (misma firma) para validar el contrato."""

    @staticmethod
    def _tiene_datos_exportables(det: dict) -> bool:
        calc = det.get("calculo") or {}
        for f in (calc.get("cartera") or {}).get("filas") or []:
            if not f.get("vacio"):
                return True
        for f in det.get("filas_campo") or []:
            if any(f.get(k) is not None for k in (
                "abscisa", "terreno_natural", "subrasante_via", "terminado_filtro", "cota_fondo_excavacion"
            )):
                return True
        return False

    def test_empty(self):
        self.assertFalse(self._tiene_datos_exportables({"filas_campo": [], "calculo": {}}))

    def test_with_field(self):
        self.assertTrue(self._tiene_datos_exportables({"filas_campo": [{"abscisa": 1}], "calculo": {}}))

    def test_with_calc_row(self):
        self.assertTrue(self._tiene_datos_exportables({
            "filas_campo": [],
            "calculo": {"cartera": {"filas": [{"vacio": False}]}},
        }))


if __name__ == "__main__":
    unittest.main()
