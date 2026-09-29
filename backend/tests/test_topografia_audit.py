"""Auditoría Topografía reutiliza registrar_log (tabla logs), no un sistema paralelo."""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[1]


def _load_audit_module():
    # Stub main.registrar_log antes de importar topografia_audit
    main = types.ModuleType("main")
    main.registrar_log = MagicMock()
    sys.modules["main"] = main

    path = ROOT / "topografia_audit.py"
    for key in list(sys.modules):
        if key.startswith("topo_audit_test_"):
            del sys.modules[key]
    spec = importlib.util.spec_from_file_location("topo_audit_test_mod", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod, main


class TestTopografiaAudit(unittest.TestCase):
    def test_log_topo_usa_modulo_topografia(self):
        mod, main = _load_audit_module()
        user = {"sub": 7, "nombre": "Topo"}
        mod.log_topo(
            user,
            "CREAR",
            mod.ENTIDAD_PLANILLA_TUBERIA,
            "abc-123",
            {"contrato_id": 1},
            valor_nuevo={"id": "abc-123", "nombre": "P1"},
        )
        main.registrar_log.assert_called_once()
        args, kwargs = main.registrar_log.call_args
        self.assertEqual(args[0], user)
        self.assertEqual(args[1], "CREAR")
        self.assertEqual(args[2], "TOPOGRAFIA")
        self.assertEqual(args[3], "topo_planilla_tuberia")
        self.assertEqual(args[4], "abc-123")
        self.assertEqual(kwargs.get("valor_nuevo"), {"id": "abc-123", "nombre": "P1"})

    def test_entidades_estables(self):
        mod, _ = _load_audit_module()
        self.assertEqual(mod.ENTIDAD_PLANILLA_TUBERIA, "topo_planilla_tuberia")
        self.assertEqual(mod.ENTIDAD_POLIGONAL, "topo_poligonal")
        self.assertEqual(mod.ENTIDAD_NIVELACION, "topo_nivelacion")

    def test_planilla_routes_dual_write_en_audit(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn("from topografia_audit import", src)
        self.assertIn("log_topo(", src)
        self.assertIn('ENTIDAD_PLANILLA_TUBERIA', src)
        # Acciones clave instrumentadas
        for accion in (
            '"CREAR"',
            '"EDITAR"',
            '"ELIMINAR"',
            '"EXPORTAR"',
            '"GENERAR_REPORTE"',
            '"ASOCIAR_REPORTE"',
            '"REABRIR"',
            '"REVOCAR_VALIDACION"',
        ):
            self.assertIn(accion, src)

    def test_topografia_routes_instrumentadas(self):
        src = (ROOT / "topografia_routes.py").read_text(encoding="utf-8")
        self.assertIn("from topografia_audit import", src)
        self.assertIn("ENTIDAD_POLIGONAL", src)
        self.assertIn("ENTIDAD_NIVELACION", src)
        self.assertIn("log_topo(", src)
        self.assertGreaterEqual(src.count('ENTIDAD_POLIGONAL'), 5)
        self.assertGreaterEqual(src.count('ENTIDAD_NIVELACION'), 5)
        self.assertIn('"CREAR"', src)
        self.assertIn('"CERRAR"', src)
        self.assertIn('"VALIDAR"', src)
        self.assertIn('"EXPORTAR"', src)


class TestAdminLogsModulosSource(unittest.TestCase):
    def test_admin_incluye_modulos_nuevos(self):
        fe = Path(__file__).resolve().parents[2] / "frontend" / "src" / "AdminPanel.jsx"
        src = fe.read_text(encoding="utf-8")
        for m in ("TOPOGRAFIA", "ALMACEN", "SEGUIMIENTO", "BITACORA", "RRHH"):
            self.assertIn(f'"{m}"', src)
        self.assertIn("TopoTrazabilidadButton", (
            Path(__file__).resolve().parents[2]
            / "frontend/src/components/topografia/TopoTrazabilidadButton.jsx"
        ).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
