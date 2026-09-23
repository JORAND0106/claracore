"""Validación dual contratista → interventoría en planillas de tubería."""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _load_routes_with_stubs():
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

    # Forzar stubs (pueden existir módulos reales a medias en el env).
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

    # Stub del motor de cálculo para no arrastrar dependencias pesadas
    if "topografia_planilla_tuberia" not in sys.modules:
        # dejar que se importe el real si está disponible
        pass

    path = backend / "topografia_planilla_tuberia_routes.py"
    for key in list(sys.modules):
        if key.startswith("topo_pt_routes_validacion"):
            del sys.modules[key]
    spec = importlib.util.spec_from_file_location("topo_pt_routes_validacion", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class TestValidacionPlanillaTuberiaLogic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_routes_with_stubs()
        cls.HTTPException = cls.mod.HTTPException if hasattr(cls.mod, "HTTPException") else sys.modules["fastapi"].HTTPException

    def _body(self, estado="Aprobado", comentario_data=None):
        return SimpleNamespace(estado=estado, comentario_data=comentario_data)

    def test_permite_validar_en_borrador(self):
        """Ya no se exige cierre manual previo: N1 puede validar en borrador."""
        fake_sb = MagicMock()
        row = {"estado": "borrador", "nivel1_estado": "No Revisado", "version": 1}
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_audit"), \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            out = self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1", row, 1, self._body("Aprobado"), {"sub": 3},
            )
        self.assertTrue(out["ok"])
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel1_estado"], "Aprobado")

    def test_n2_requiere_n1_aprobado(self):
        with self.assertRaises(self.HTTPException) as ctx:
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1",
                {"estado": "borrador", "nivel1_estado": "Pendiente", "version": 1},
                2, self._body(), {"sub": 3},
            )
        self.assertIn("contratista", str(ctx.exception.detail).lower())

    def test_pendiente_exige_comentario(self):
        with self.assertRaises(self.HTTPException) as ctx:
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1",
                {"estado": "borrador", "nivel1_estado": "Aprobado", "version": 1},
                2, self._body("Pendiente"), {"sub": 3},
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_n2_pendiente_deja_editable_borrador(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "No Revisado",
            "version": 2,
        }
        comentario = {
            "mensaje": "Revisar abscisa final",
            "etiqueta": "Observación",
            "destinatarios": [{"id": 1, "nombre": "A"}],
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_audit"), \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            out = self.mod._aplicar_validacion_planilla_tuberia(
                7, "p1", row, 2, self._body("Pendiente", comentario), {"sub": 9},
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["estado"], "Pendiente")
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel2_estado"], "Pendiente")
        self.assertEqual(update["comentario_interventoria"], "Revisar abscisa final")
        self.assertEqual(update["estado"], "borrador")

    def test_n2_aprobado_auto_cierra_y_sella(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "No Revisado",
            "version": 1,
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_audit"), \
             patch.object(self.mod, "_ejecutar_cierre_planilla_tuberia") as mock_cierre, \
             patch.object(self.mod, "_row", return_value={**row, "estado": "validado", "version": 2}), \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1", "estado": "validado"}}):
            out = self.mod._aplicar_validacion_planilla_tuberia(
                7, "p1", row, 2, self._body("Aprobado"), {"sub": 9},
            )
        mock_cierre.assert_called_once()
        kwargs = mock_cierre.call_args.kwargs
        self.assertEqual(kwargs.get("estado_final"), "validado")
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel2_estado"], "Aprobado")
        self.assertNotIn("estado", update)  # estado lo fijó el auto-cierre
        self.assertEqual(out["nivel"], 2)

    def test_endpoints_y_sql_en_fuente(self):
        src = Path(self.mod.__file__).read_text(encoding="utf-8")
        self.assertIn("/validar-nivel1", src)
        self.assertIn("/validar-nivel2", src)
        self.assertIn("comentario_interventoria", src)
        self.assertIn("_ejecutar_cierre_planilla_tuberia", src)
        self.assertIn("CERRAR_AL_APROBAR_N2", src)
        sql = Path(__file__).resolve().parents[1] / "sql" / "topo_alter_planillas_tuberia_validacion.sql"
        self.assertTrue(sql.is_file())
        self.assertIn("nivel1_estado", sql.read_text(encoding="utf-8"))

    def test_ui_sin_boton_cerrar_y_panel_sin_prerequisito(self):
        root = Path(__file__).resolve().parents[2]
        form = (root / "frontend/src/components/topografia/planillaTuberia/PlanillaTuberiaForm.jsx").read_text(encoding="utf-8")
        panel = (root / "frontend/src/components/topografia/PoligonalValidacionPanel.jsx").read_text(encoding="utf-8")
        self.assertNotIn('title="Cerrar planilla"', form)
        self.assertNotIn("Cierre la planilla antes de validar.", panel)


if __name__ == "__main__":
    unittest.main()
