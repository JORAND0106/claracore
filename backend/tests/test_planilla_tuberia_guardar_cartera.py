"""Persistencia segura de cartera — Planillas de Tubería.

Cubre huella y la lógica de orden temporal que evita chocar
UNIQUE(planilla_id, orden) al insertar antes de borrar previas.
"""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock


def _load_routes_with_stubs():
    """Carga el módulo de rutas sin inicializar FastAPI/supabase reales."""
    backend = Path(__file__).resolve().parents[1]
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))

    def _ensure(name: str, factory):
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
        m.Query = lambda *a, **k: None
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

            @classmethod
            def __class_getitem__(cls, _item):
                return cls

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
        perm.require_topo_puede_validar_nivel = lambda *_a, **_k: None
        sys.modules["topografia_permissions"] = perm
    else:
        perm = sys.modules["topografia_permissions"]
        if not hasattr(perm, "require_topo_puede_validar_nivel"):
            perm.require_topo_puede_validar_nivel = lambda *_a, **_k: None
    if "topo_crs" not in sys.modules:
        crs = types.ModuleType("topo_crs")
        crs.gk_bogota_to_wgs84 = lambda e, n: (e, n)
        sys.modules["topo_crs"] = crs

    path = backend / "topografia_planilla_tuberia_routes.py"
    spec = importlib.util.spec_from_file_location("topo_pt_routes_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class TestPlanillaTuberiaGuardarCartera(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_routes_with_stubs()

    def test_fingerprint_estable_e_independiente_de_orden_de_lista(self):
        a = [
            {"orden": 2, "abscisa": 20, "terreno_natural": 100.5, "cota_fondo_excavacion": 98},
            {"orden": 1, "abscisa": 10, "terreno_natural": 101.0, "cota_fondo_excavacion": 99},
        ]
        b = list(reversed(a))
        self.assertEqual(
            self.mod.fingerprint_filas_campo(a),
            self.mod.fingerprint_filas_campo(b),
        )
        self.assertIn("1|10|101|99||", self.mod.fingerprint_filas_campo(a)[0])

    def test_orden_temp_offset_constante_compat(self):
        self.assertEqual(self.mod._ORDEN_TEMP_OFFSET, 1_000_000)

    def test_replace_filas_actualiza_por_orden_sin_wipe(self):
        mod = self.mod
        planilla_id = "p-1"
        prev = [{
            "id": "old-1", "planilla_id": planilla_id, "orden": 1,
            "abscisa": 1.0, "terreno_natural": 10.0, "subrasante_via": None,
            "terminado_filtro": None, "cota_fondo_excavacion": 9.0,
            "norte": None, "este": None, "observacion": None,
        }]
        nuevas_in = [{
            "orden": 1, "abscisa": 5.0, "terreno_natural": 11.0,
            "subrasante_via": 10.5, "terminado_filtro": None,
            "cota_fondo_excavacion": 9.5, "norte": None, "este": None, "observacion": None,
        }, {
            "orden": 2, "abscisa": 15.0, "terreno_natural": 12.0,
            "subrasante_via": 11.0, "terminado_filtro": None,
            "cota_fondo_excavacion": 10.0, "norte": None, "este": None, "observacion": None,
        }]

        store: dict[str, dict] = {prev[0]["id"]: dict(prev[0])}
        updates = []
        inserts = []

        class _Q:
            def __init__(self, table):
                self.table = table
                self._ids = None
                self._eq = {}
                self._update = None
                self._action = "select"
                self._rows = None

            def select(self, *_a, **_k):
                self._action = "select"
                return self

            def insert(self, rows):
                self._action = "insert"
                self._rows = rows if isinstance(rows, list) else [rows]
                return self

            def delete(self):
                self._action = "delete"
                return self

            def update(self, patch):
                self._action = "update"
                self._update = patch
                return self

            def eq(self, k, v):
                self._eq[k] = v
                return self

            def in_(self, k, vals):
                self._ids = list(vals)
                return self

            def order(self, *_a, **_k):
                return self

            def execute(self):
                if self._action == "insert":
                    for r in self._rows:
                        store[r["id"]] = dict(r)
                        inserts.append(dict(r))
                    return types.SimpleNamespace(data=list(self._rows))
                if self._action == "delete":
                    for i in (self._ids or []):
                        store.pop(i, None)
                    return types.SimpleNamespace(data=[])
                if self._action == "update":
                    rid = self._eq.get("id")
                    if rid and rid in store and self._update:
                        store[rid].update(self._update)
                        updates.append({"id": rid, **self._update})
                    return types.SimpleNamespace(data=[store[rid]] if rid in store else [])
                rows = [dict(v) for v in store.values() if v.get("planilla_id") == planilla_id]
                rows.sort(key=lambda r: int(r.get("orden") or 0))
                return types.SimpleNamespace(data=rows)

        class _SB:
            def table(self, name):
                return _Q(name)

        orig_sb = mod.supabase
        mod.supabase = _SB()
        try:
            rows = mod._replace_filas(planilla_id, nuevas_in)
        finally:
            mod.supabase = orig_sb

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["orden"], 1)
        self.assertEqual(rows[0]["abscisa"], 5.0)
        self.assertEqual(rows[0]["id"], "old-1")  # misma fila actualizada
        self.assertEqual(rows[1]["orden"], 2)
        self.assertEqual(rows[1]["abscisa"], 15.0)
        self.assertTrue(any(u["id"] == "old-1" and u.get("abscisa") == 5.0 for u in updates))
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0]["orden"], 2)


if __name__ == "__main__":
    unittest.main()
