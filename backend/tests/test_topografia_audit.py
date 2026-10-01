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

    def test_snapshot_tablas_diff_campo_a_campo(self):
        mod, _ = _load_audit_module()
        antes = mod.snapshot_edicion_planilla_tuberia(
            {"id": "p1", "version": 1, "nombre": "T1"},
            filas=[
                {"orden": 1, "abscisa": 0, "terreno_natural": 100.0, "cota_fondo_excavacion": 98},
                {"orden": 2, "abscisa": 10, "terreno_natural": 100.5, "cota_fondo_excavacion": 98},
            ],
            cantidades_manuales=[
                {"codigo": "EXC_ROC", "long": 10, "ancho": 1.5, "espesor": 0.05},
            ],
            descuentos_manuales=[
                {"codigo": "DESC_OTROS_1", "nombre": "Pozo", "long": 90, "espesor": 0.009},
            ],
        )
        despues = mod.snapshot_edicion_planilla_tuberia(
            {"id": "p1", "version": 2, "nombre": "T1"},
            filas=[
                {"orden": 1, "abscisa": 0, "terreno_natural": 100.0, "cota_fondo_excavacion": 98},
                {"orden": 2, "abscisa": 10, "terreno_natural": 101.0, "cota_fondo_excavacion": 98},
            ],
            cantidades_manuales=[
                {"codigo": "EXC_ROC", "long": 10, "ancho": 1.5, "espesor": 0.05},
            ],
            descuentos_manuales=[
                {"codigo": "DESC_OTROS_1", "nombre": "Pozo", "long": 90, "espesor": 0.01},
            ],
        )
        # Claves por fila/ítem (no listas) para expandir en Campos modificados
        self.assertIn("fila_2_abs_10", antes["cartera"])
        self.assertEqual(antes["cartera"]["fila_2_abs_10"]["terreno_natural"], 100.5)
        self.assertEqual(despues["cartera"]["fila_2_abs_10"]["terreno_natural"], 101)
        self.assertEqual(antes["descuentos_especificos"]["DESC_OTROS_1"]["espesor"], 0.009)
        self.assertEqual(despues["descuentos_especificos"]["DESC_OTROS_1"]["espesor"], 0.01)
        n = mod.contar_campos_modificados(antes, despues)
        # version + terreno_natural fila 2 + espesor descuento
        self.assertGreaterEqual(n, 3)

    def test_planilla_routes_dual_write_en_audit(self):
        src = (ROOT / "topografia_planilla_tuberia_routes.py").read_text(encoding="utf-8")
        self.assertIn("from topografia_audit import", src)
        self.assertIn("log_topo(", src)
        self.assertIn('ENTIDAD_PLANILLA_TUBERIA', src)
        self.assertIn("snapshot_edicion_planilla_tuberia", src)
        self.assertIn("ambito\": \"cartera_resumen_descuentos\"", src)
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
