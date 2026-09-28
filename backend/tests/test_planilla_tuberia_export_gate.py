"""Gate de exportación Excel/PDF — Desarrollador vs no-Desarrollador + contrato_id."""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


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

    def test_assert_export_recibe_contrato_id(self):
        """Regresión NameError: contrato_id debe ser parámetro del gate."""
        start = ROUTES.index("def _assert_export_permitido")
        sig = ROUTES[start: start + 120]
        self.assertIn("contrato_id", sig)
        # Call sites excel/pdf pasan el id del path
        self.assertIn(
            "_assert_export_permitido(current_user, det, contrato_id)",
            ROUTES,
        )
        self.assertEqual(
            ROUTES.count("_assert_export_permitido(current_user, det, contrato_id)"),
            2,
        )

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


def _load_routes_with_stubs():
    backend = Path(__file__).resolve().parents[1]
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))

    def _fastapi():
        m = types.ModuleType("fastapi")

        class HTTPException(Exception):
            def __init__(self, status_code=400, detail=None):
                self.status_code = status_code
                self.detail = detail
                super().__init__(str(detail))

        m.HTTPException = HTTPException
        m.APIRouter = lambda **_k: types.SimpleNamespace(
            get=lambda *a, **k: (lambda f: f),
            put=lambda *a, **k: (lambda f: f),
            post=lambda *a, **k: (lambda f: f),
            delete=lambda *a, **k: (lambda f: f),
        )
        m.Depends = lambda x: x
        m.Query = lambda *a, **k: None
        return m

    def _responses():
        m = types.ModuleType("fastapi.responses")
        m.Response = object
        return m

    def _pydantic():
        m = types.ModuleType("pydantic")

        class BaseModel:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

            def model_dump(self):
                return dict(self.__dict__)

            @classmethod
            def __class_getitem__(cls, _item):
                return cls

        def Field(default=None, **_k):
            return default

        m.BaseModel = BaseModel
        m.Field = Field
        return m

    sys.modules["fastapi"] = _fastapi()
    sys.modules["fastapi.responses"] = _responses()
    sys.modules["pydantic"] = _pydantic()

    main = types.ModuleType("main")
    main._es_desarrollador = lambda *_a, **_k: False
    main._require_contract_access = lambda *_a, **_k: None
    main.get_current_user = lambda: {}
    main.supabase = MagicMock()
    sys.modules["main"] = main

    perm = types.ModuleType("topografia_permissions")
    perm.require_permiso_topografia = lambda *_a, **_k: None
    perm.require_topo_puede_validar_nivel = lambda *_a, **_k: None
    sys.modules["topografia_permissions"] = perm

    crs = types.ModuleType("topo_crs")
    crs.gk_bogota_to_wgs84 = lambda e, n: (e, n)
    sys.modules["topo_crs"] = crs

    path = backend / "topografia_planilla_tuberia_routes.py"
    for key in list(sys.modules):
        if key.startswith("topo_pt_routes_export_gate"):
            del sys.modules[key]
    spec = importlib.util.spec_from_file_location("topo_pt_routes_export_gate", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class ExportGateRuntimeTests(unittest.TestCase):
    """Ejecuta el helper real: no-Desarrollador con datos no debe NameError."""

    @classmethod
    def setUpClass(cls):
        cls.mod = _load_routes_with_stubs()
        cls.HTTPException = sys.modules["fastapi"].HTTPException

    def test_non_dev_con_datos_pasa_contrato_id_a_perm(self):
        det = {
            "filas_campo": [{"abscisa": 10.0}],
            "calculo": {"cartera": {"filas": []}},
        }
        user = {"sub": 9, "cargo": "Topógrafo"}
        with patch.object(self.mod, "_perm") as mock_perm, \
             patch.object(self.mod, "_es_desarrollador", return_value=False):
            vacia = self.mod._assert_export_permitido(user, det, 42)
        self.assertFalse(vacia)
        mock_perm.assert_called_once_with(user, "exportar", 42)

    def test_dev_plantilla_vacia_sin_perm_exportar(self):
        det = {"filas_campo": [], "calculo": {}}
        user = {"sub": 1, "cargo": "Desarrollador"}
        with patch.object(self.mod, "_perm") as mock_perm, \
             patch.object(self.mod, "_es_desarrollador", return_value=True):
            vacia = self.mod._assert_export_permitido(user, det, 7)
        self.assertTrue(vacia)
        mock_perm.assert_not_called()

    def test_non_dev_plantilla_vacia_422(self):
        det = {"filas_campo": [], "calculo": {}}
        with patch.object(self.mod, "_es_desarrollador", return_value=False):
            with self.assertRaises(self.HTTPException) as ctx:
                self.mod._assert_export_permitido({"sub": 2}, det, 7)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_dev_con_datos_tambien_exige_exportar(self):
        det = {
            "filas_campo": [],
            "calculo": {"cartera": {"filas": [{"vacio": False}]}},
        }
        user = {"sub": 1, "cargo": "Desarrollador"}
        with patch.object(self.mod, "_perm") as mock_perm, \
             patch.object(self.mod, "_es_desarrollador", return_value=True):
            vacia = self.mod._assert_export_permitido(user, det, 99)
        self.assertFalse(vacia)
        mock_perm.assert_called_once_with(user, "exportar", 99)


if __name__ == "__main__":
    unittest.main()
