"""Blindaje: planilla sellada muestra su calculo_snapshot (no la fórmula vigente)."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from topografia_planilla_tuberia import calcular_planilla_completa, presentar_calculo_resumen_2dec
from topografia_planilla_tuberia_motor import (
    CORTE_MOTOR_VOLUMEN_UTC,
    MOTOR_ALTURA_V1,
    MOTOR_VOLUMEN_V1,
    calculo_coincide_con_snapshot,
    planilla_tuberia_sellada,
    resolver_motor_calculo,
    snapshot_completo,
)
from topografia_planilla_tuberia_motor_altura import calcular_planilla_completa_altura


def _filas(abscisa_fin: float = 100.0):
    return [
        {
            "orden": 1, "abscisa": 0, "terreno_natural": 100,
            "subrasante_via": 99, "cota_fondo_excavacion": 98,
        },
        {
            "orden": 2, "abscisa": abscisa_fin, "terreno_natural": 100,
            "subrasante_via": 99, "cota_fondo_excavacion": 98,
        },
    ]


class TestSnapshotCompleto(unittest.TestCase):
    def test_calculo_completo_tiene_resumen_y_descuentos_linea_a_linea(self):
        """Paso 1: calculo_snapshot = salida completa de calcular_planilla_completa."""
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(100),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 20, "ancho": 1.5, "espesor": 0.5,
                    "descontar_de": "EXC",
                },
            ],
        )
        self.assertTrue(snapshot_completo(r))
        self.assertIsInstance(r["cantidades"], list)
        self.assertIsInstance(r["descuentos"], list)
        self.assertIsInstance(r["netos"], list)
        exc = next(c for c in r["cantidades"] if c["codigo"] == "EXC")
        for key in ("long", "ancho", "espesor", "cantidad", "unidad"):
            self.assertIn(key, exc)
        # Descuentos específicos presentes (Area 1 / Area 2 / …)
        self.assertTrue(any(d.get("codigo") for d in r["descuentos"]))
        for d in r["descuentos"]:
            self.assertIn("cantidad", d)
            self.assertIn("unidad", d)


class TestMotorResolver(unittest.TestCase):
    def test_sellada_antes_del_corte_sin_meta_usa_altura(self):
        p = {
            "estado": "validado",
            "cerrado_at": "2026-10-01T12:00:00+00:00",
            "meta_cabecera": {},
        }
        self.assertEqual(resolver_motor_calculo(p), MOTOR_ALTURA_V1)
        self.assertTrue(planilla_tuberia_sellada(p))

    def test_abierta_usa_volumen(self):
        p = {"estado": "borrador", "meta_cabecera": {}}
        self.assertEqual(resolver_motor_calculo(p), MOTOR_VOLUMEN_V1)

    def test_meta_explicita_gana(self):
        p = {
            "estado": "validado",
            "cerrado_at": "2026-10-01T12:00:00+00:00",
            "meta_cabecera": {"motor_calculo_version": MOTOR_VOLUMEN_V1},
        }
        self.assertEqual(resolver_motor_calculo(p), MOTOR_VOLUMEN_V1)


class TestBlindajeSelladaVsSnapshot(unittest.TestCase):
    def test_mostrado_debe_coincidir_con_snapshot_no_con_motor_vigente(self):
        """
        Si la fórmula vigente (volumen) diverge del snapshot (altura),
        el resultado *mostrado* de una sellada debe seguir al snapshot.
        Este test falla si alguien vuelve a servir el motor vivo sobre selladas.
        """
        kwargs = dict(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(100),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC",
                    "long": 20, "ancho": 1.5, "espesor": 0.5,
                    "descontar_de": "prom_altura_excavacion",
                },
            ],
        )
        snapshot = calcular_planilla_completa_altura(**kwargs)
        vigente = calcular_planilla_completa(
            **{**kwargs, "cantidades_manuales": [
                {
                    "codigo": "EXC_ROC",
                    "long": 20, "ancho": 1.5, "espesor": 0.5,
                    "descontar_de": "EXC",
                },
            ]},
        )
        # Premisa del incidente: motores divergen.
        exc_s = next(n for n in snapshot["netos"] if n["codigo"] == "EXC")
        exc_v = next(n for n in vigente["netos"] if n["codigo"] == "EXC")
        self.assertNotAlmostEqual(float(exc_s["neto"]), float(exc_v["neto"]), places=2)

        # Lo mostrado en sellada = snapshot (correcto).
        mostrado_correcto = snapshot
        self.assertTrue(calculo_coincide_con_snapshot(mostrado_correcto, snapshot))

        # Si se mostrara el motor vigente, el blindaje debe detectar la divergencia.
        self.assertFalse(calculo_coincide_con_snapshot(vigente, snapshot))

    def test_corte_datetime_conocido(self):
        self.assertEqual(
            CORTE_MOTOR_VOLUMEN_UTC,
            datetime(2026, 10, 5, 2, 25, 23, tzinfo=timezone.utc),
        )


class TestDetalleSelladaNoEscribe(unittest.TestCase):
    """_detalle sobre sellada no hace UPDATE ni recalcula con motor vivo."""

    def test_sellada_con_snapshot_no_llama_update(self):
        import importlib.util
        import sys
        import types
        from pathlib import Path

        backend = Path(__file__).resolve().parents[1]
        if str(backend) not in sys.path:
            sys.path.insert(0, str(backend))

        # Stubs mínimos para cargar routes sin FastAPI real completo.
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

            def APIRouter(**_k):
                r = types.SimpleNamespace()
                r.get = lambda *a, **k: (lambda f: f)
                r.put = lambda *a, **k: (lambda f: f)
                r.post = lambda *a, **k: (lambda f: f)
                r.delete = lambda *a, **k: (lambda f: f)
                return r

            m.HTTPException = HTTPException
            m.APIRouter = APIRouter
            m.Depends = lambda x: x
            m.Query = lambda *a, **k: None
            return m

        _ensure("fastapi", _fastapi)
        _ensure("fastapi.responses", lambda: types.SimpleNamespace(Response=object))
        _ensure("pydantic", lambda: types.SimpleNamespace(
            BaseModel=type("BaseModel", (), {"model_dump": lambda self: dict(self.__dict__)}),
            Field=lambda *a, **k: None,
        ))

        if "main" not in sys.modules:
            main = types.ModuleType("main")
            main._es_desarrollador = lambda *_a, **_k: False
            main._require_contract_access = lambda *_a, **_k: None
            main.get_current_user = lambda: {}
            main.registrar_log = lambda *_a, **_k: None
            main.supabase = MagicMock()
            sys.modules["main"] = main
        else:
            main = sys.modules["main"]
            if not hasattr(main, "registrar_log"):
                main.registrar_log = lambda *_a, **_k: None
            if not hasattr(main, "supabase"):
                main.supabase = MagicMock()
        if "topografia_permissions" not in sys.modules:
            perm = types.ModuleType("topografia_permissions")
            perm.require_permiso_topografia = lambda *_a, **_k: None
            perm.require_topo_puede_validar_nivel = lambda *_a, **_k: None
            sys.modules["topografia_permissions"] = perm
        if "topo_crs" not in sys.modules:
            crs = types.ModuleType("topo_crs")
            crs.gk_bogota_to_wgs84 = lambda e, n: (e, n)
            sys.modules["topo_crs"] = crs
        # Evitar que topografia_audit falle si ya estaba a medias
        if "topografia_audit" in sys.modules:
            del sys.modules["topografia_audit"]

        snap = calcular_planilla_completa_altura(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas(50),
            cantidades_manuales=[
                {
                    "codigo": "EXC_ROC", "long": 10, "ancho": 1.5, "espesor": 0.2,
                    "descontar_de": "prom_altura_excavacion",
                },
            ],
        )
        planilla = {
            "id": "p-sellada",
            "contrato_id": 1,
            "estado": "validado",
            "tipo": "ALCANTARILLA",
            "diametro_m": 0.9,
            "ancho_excavacion_m": 1.5,
            "espesor_m": 0.05,
            "relacion_atraque": "1:3",
            "cerrado_at": "2026-10-01T00:00:00Z",
            "calculo_snapshot": snap,
            "meta_cabecera": {"motor_calculo_version": MOTOR_ALTURA_V1},
            "norte_ref": None,
            "este_ref": None,
        }

        path = backend / "topografia_planilla_tuberia_routes.py"
        spec = importlib.util.spec_from_file_location("topo_pt_sellada_test", path)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        # Evitar choque con módulo ya cargado en otros tests
        with patch.dict(sys.modules, {"topo_pt_sellada_test": mod}):
            spec.loader.exec_module(mod)

        sb = MagicMock()
        mod.supabase = sb
        with patch.object(mod, "_row", return_value=dict(planilla)), \
             patch.object(mod, "_filas", return_value=[]), \
             patch.object(mod, "_descuentos", return_value=[]), \
             patch.object(mod, "_filtrar_sicoe_reportes_vigentes", side_effect=lambda c, p, persist=True: p), \
             patch.object(mod, "_calcular") as calc_mock:
            det = mod._detalle(1, "p-sellada")

        self.assertEqual(det.get("calculo_origen"), "snapshot")
        self.assertFalse(det.get("calculo_reconstruido"))
        # Lo mostrado = snapshot con capa de presentación 2dec (sin persistir).
        self.assertTrue(
            calculo_coincide_con_snapshot(
                det.get("calculo"),
                presentar_calculo_resumen_2dec(snap),
            )
        )
        calc_mock.assert_not_called()
        # Ningún UPDATE al abrir sellada
        sb.table.return_value.update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
