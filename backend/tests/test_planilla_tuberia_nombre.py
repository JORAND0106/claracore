"""Nombre obligatorio y único — Planillas de Tubería."""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock


def _load_routes():
    backend = Path(__file__).resolve().parents[1]
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))

    def _ensure(name, factory):
        if name not in sys.modules:
            sys.modules[name] = factory()

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
        return m

    def _responses():
        m = types.ModuleType("fastapi.responses")
        m.Response = object
        return m

    def _pydantic():
        m = types.ModuleType("pydantic")

        class BaseModel:
            def model_dump(self):
                return dict(self.__dict__)

        def Field(default=None, **_k):
            return default

        m.BaseModel = BaseModel
        m.Field = Field
        return m

    _ensure("fastapi", _fastapi)
    _ensure("fastapi.responses", _responses)
    _ensure("pydantic", _pydantic)

    if "main" not in sys.modules:
        main = types.ModuleType("main")
        main._es_desarrollador = lambda *_a, **_k: False
        main._require_contract_access = lambda *_a, **_k: None
        main.get_current_user = lambda: {}
        main.supabase = MagicMock()
        sys.modules["main"] = main
    if "topografia_permissions" not in sys.modules:
        perm = types.ModuleType("topografia_permissions")
        perm.require_permiso_topografia = lambda *_a, **_k: None
        sys.modules["topografia_permissions"] = perm
    if "topo_crs" not in sys.modules:
        crs = types.ModuleType("topo_crs")
        crs.gk_bogota_to_wgs84 = lambda e, n: (e, n)
        sys.modules["topo_crs"] = crs

    path = backend / "topografia_planilla_tuberia_routes.py"
    spec = importlib.util.spec_from_file_location("topo_pt_nombre_test", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class TestNombrePlanilla(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_routes()
        cls.HTTPException = cls.mod.HTTPException

    def test_vacio_rechaza(self):
        with self.assertRaises(self.HTTPException) as ctx:
            self.mod._assert_nombre_planilla_unico(1, "  ")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("obligatorio", str(ctx.exception.detail))

    def test_duplicado_rechaza_case_insensitive(self):
        class _Q:
            def select(self, *_a, **_k): return self
            def eq(self, *_a, **_k): return self
            def execute(self):
                return types.SimpleNamespace(data=[
                    {"id": "1", "nombre": "Tramo Norte"},
                ])

        class _SB:
            def table(self, *_a, **_k):
                return _Q()

        orig = self.mod.supabase
        self.mod.supabase = _SB()
        try:
            with self.assertRaises(self.HTTPException) as ctx:
                self.mod._assert_nombre_planilla_unico(1, "tramo norte")
            self.assertIn("Ya existe", str(ctx.exception.detail))
            # Mismo id excluido → ok
            nom = self.mod._assert_nombre_planilla_unico(1, "Tramo Norte", exclude_id="1")
            self.assertEqual(nom, "Tramo Norte")
        finally:
            self.mod.supabase = orig


if __name__ == "__main__":
    unittest.main()
