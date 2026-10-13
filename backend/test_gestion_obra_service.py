"""Tests unitarios del consolidado Gestión de obra (sin DB)."""
from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from gestion_obra_service import (
    SCHEMA_VERSION,
    _agg_actividades,
    _agg_personal_desde_diarios,
    _agg_programacion,
    _bogota_day_bounds_utc,
    _dias_rango,
    _empresa_asistencia,
    _fecha_bogota,
    build_informe_redactado,
    empty_observaciones,
    merge_observaciones,
    normalize_gestion_obra,
    rango_semana_anterior,
    snapshot_esta_obsoleto,
)


class TestGestionObraRango(unittest.TestCase):
    def test_semana_anterior_a_reunion(self):
        d0, d1 = rango_semana_anterior("2026-10-12")
        self.assertEqual(d1, "2026-10-11")
        self.assertEqual(d0, "2026-10-05")

    def test_dias_rango(self):
        dias = _dias_rango(date(2026, 10, 5), date(2026, 10, 7))
        self.assertEqual(dias, ["2026-10-05", "2026-10-06", "2026-10-07"])


class TestEmpresaAsistencia(unittest.TestCase):
    def test_usa_subcontratista_nombre(self):
        self.assertEqual(
            _empresa_asistencia({"subcontratista_nombre": "ACME SAS", "empresa": "Otro"}),
            "ACME SAS",
        )

    def test_fallback(self):
        self.assertEqual(_empresa_asistencia({}), "Sin empresa")


class TestPersonalMaxDiario(unittest.TestCase):
    def test_max_diario_no_suma_dias(self):
        dias = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]
        # Auxiliar de Tráfico: 6 cada día → máx = 6, no 30
        diarios = []
        for f in dias:
            asis = [
                {
                    "rrhh_trabajador_id": i,
                    "nombre": f"P{i}",
                    "cargo": "Auxiliar de Tráfico",
                    "subcontratista_nombre": "OC Ingeniería",
                    "estado": "activo",
                    "hora_ingreso": "07:00",
                    "hora_salida": "16:00",
                }
                for i in range(1, 7)
            ]
            diarios.append({"fecha": f, "asistencia_colaboradores": asis})
        out = _agg_personal_desde_diarios(diarios, dias)
        emp = next(e for e in out["personal"]["empresas"] if e["empresa"] == "OC Ingeniería")
        self.assertEqual(emp["max_diario"], 6)
        self.assertEqual(out["personal"]["series"][0]["valor"], 6)
        aux = next(f for f in emp["filas"] if f["cargo"] == "Auxiliar de Tráfico")
        self.assertEqual(aux["max_diario"], 6)
        total_dia = next(f for f in emp["filas"] if f.get("es_total_dia"))
        self.assertEqual(total_dia["por_dia"]["2026-10-05"], 6)
        self.assertEqual(total_dia["max_diario"], 6)
        self.assertFalse(out.get("notas_conteo"))

    def test_ausentismo_maestro_oc(self):
        """Maestros 3,4,3,4,4 del 5–9 oct → 1 ausencia el día 7."""
        dias = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]
        # 4 maestros: A B C D. Día 5: A B C (3). Día 6: A B C D. Día 7: A B C (D falta). …
        maestros = [
            {"id": 101, "nombre": "Maestro A"},
            {"id": 102, "nombre": "Maestro B"},
            {"id": 103, "nombre": "Maestro C"},
            {"id": 104, "nombre": "Maestro D"},
        ]
        presentes_por_dia = {
            "2026-10-05": [101, 102, 103],
            "2026-10-06": [101, 102, 103, 104],
            "2026-10-07": [101, 102, 103],  # D ausente
            "2026-10-08": [101, 102, 103, 104],
            "2026-10-09": [101, 102, 103, 104],
        }
        diarios = []
        for f in dias:
            asis = []
            for m in maestros:
                if m["id"] not in presentes_por_dia[f]:
                    continue
                asis.append({
                    "rrhh_trabajador_id": m["id"],
                    "nombre": m["nombre"],
                    "cargo": "Maestro",
                    "subcontratista_nombre": "OC Ingeniería",
                    "estado": "activo",
                })
            diarios.append({"fecha": f, "asistencia_colaboradores": asis})
        out = _agg_personal_desde_diarios(diarios, dias)
        self.assertEqual(out["ausentismo"]["ausentes"], 1)
        emp = next(e for e in out["personal"]["empresas"] if e["empresa"] == "OC Ingeniería")
        mae = next(f for f in emp["filas"] if f["cargo"] == "Maestro")
        self.assertEqual(mae["ausencias_por_dia"].get("2026-10-07"), 1)
        self.assertEqual(mae["por_dia"]["2026-10-07"], 3)
        self.assertEqual(mae["max_diario"], 4)
        # Domingo sin asistencia no cuenta
        diarios_con_domingo = diarios + [{"fecha": "2026-10-11", "asistencia_colaboradores": []}]
        dias2 = dias + ["2026-10-10", "2026-10-11"]
        out2 = _agg_personal_desde_diarios(diarios_con_domingo, dias2)
        self.assertEqual(out2["ausentismo"]["ausentes"], 1)

    def test_vacio(self):
        out = _agg_personal_desde_diarios([], ["2026-10-05"])
        self.assertFalse(out["disponible"])


class TestMaquinariaMaxDiario(unittest.TestCase):
    def test_max_no_suma(self):
        dias = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]
        diarios = [
            {
                "fecha": f,
                "asistencia_colaboradores": [],
                "equipos_uso": [{"equipo_nombre": "Retro", "cantidad": 1}],
            }
            for f in dias
        ]
        out = _agg_personal_desde_diarios(diarios, dias)
        filas = out["maquinaria"]["filas"]
        self.assertEqual(filas[0]["max_diario"], 1)
        self.assertEqual(out["maquinaria"]["series"][0]["valor"], 1)


class TestActividades(unittest.TestCase):
    def test_por_dia(self):
        dias = ["2026-10-07"]
        diarios = [{
            "fecha": "2026-10-07",
            "tramo": "K0+000",
            "eventos": [{
                "evento_detalle": {
                    "actividades": [{"nombre": "Excavación", "detalle": "norte"}],
                },
            }],
        }]
        out = _agg_actividades(diarios, dias)
        self.assertTrue(out["disponible"])
        self.assertEqual(out["series"][0]["valor"], 1)
        self.assertEqual(out["por_dia"][0]["actividades"][0]["actividad"], "Excavación")


class TestObservaciones(unittest.TestCase):
    def test_merge(self):
        m = merge_observaciones({"personal_jornada": "<p>A</p>"}, {"almacen": "<p>B</p>"})
        self.assertEqual(m["personal_jornada"], "<p>A</p>")
        self.assertEqual(m["almacen"], "<p>B</p>")

    def test_normalize(self):
        n = normalize_gestion_obra({
            "fecha_desde": "2026-10-01",
            "fecha_hasta": "2026-10-07",
            "schema_version": SCHEMA_VERSION,
            "datos": {"x": 1},
            "observaciones": {"personal_jornada": "ok"},
        })
        self.assertEqual(n["fecha_desde"], "2026-10-01")
        self.assertEqual(n["schema_version"], SCHEMA_VERSION)
        self.assertEqual(set(empty_observaciones().keys()), set(n["observaciones"].keys()))

    def test_snapshot_obsoleto(self):
        self.assertTrue(snapshot_esta_obsoleto(None))
        self.assertTrue(snapshot_esta_obsoleto({"schema_version": 2, "datos": {}}))
        self.assertFalse(snapshot_esta_obsoleto({
            "schema_version": SCHEMA_VERSION, "datos": {"personal_jornada": {}},
        }))


class TestBogotaFechas(unittest.TestCase):
    def test_bounds_cubre_tarde_bogota(self):
        start, end = _bogota_day_bounds_utc("2026-10-06", "2026-10-12")
        self.assertTrue(end.startswith("2026-10-13") or "2026-10-13" in end)
        self.assertTrue(start.startswith("2026-10-06"))

    def test_fecha_bogota_desde_utc_noche(self):
        dt = datetime(2026, 10, 13, 0, 30, tzinfo=timezone.utc)
        self.assertEqual(_fecha_bogota(dt), "2026-10-12")


class TestInformeRedactado(unittest.TestCase):
    def _datos_base(self):
        return {
            "personal_jornada": {
                "disponible": True,
                "dias": ["2026-10-05", "2026-10-06", "2026-10-07"],
                "personal": {
                    "empresas": [{
                        "empresa": "OC Ingeniería",
                        "max_diario": 4,
                        "filas": [
                            {
                                "cargo": "Maestro",
                                "por_dia": {"2026-10-05": 3, "2026-10-06": 4, "2026-10-07": 3},
                                "max_diario": 4,
                                "ausencias_por_dia": {"2026-10-07": 1},
                            },
                            {
                                "cargo": "Total del día",
                                "es_total_dia": True,
                                "por_dia": {"2026-10-05": 3, "2026-10-06": 4, "2026-10-07": 3},
                                "max_diario": 4,
                            },
                        ],
                    }],
                },
                "ausentismo": {"disponible": True, "ausentes": 1},
                "jornada": {"disponible": True, "promedio_horas": 9, "registros": 10},
                "maquinaria": {
                    "filas": [{
                        "equipo": "Retro",
                        "max_diario": 1,
                        "por_dia": {"2026-10-05": 1, "2026-10-06": 1},
                    }],
                },
            },
            "cantidades_obra": {
                "disponible": True,
                "tramos": [{
                    "tramo": "T1",
                    "capitulos": [{
                        "capitulo": "1. Exc",
                        "items": [{"item_numero": "1.1", "cantidad": 10, "valor_total": 1000}],
                        "subtotal_valor": 1000,
                    }],
                }],
                "total_general_valor": 1000,
            },
            "actividades": {
                "disponible": True,
                "por_dia": [{"fecha": "2026-10-06", "cantidad": 2}],
            },
            "almacen": {
                "disponible": True,
                "solicitudes": [{"estado": "enviada", "valor": 500}],
                "series_por_dia": [{
                    "creadas": 1, "gestionadas": 1, "aprobadas": 0, "pendientes": 1,
                }],
                "entradas": [],
                "salidas": [],
            },
            "programacion": {
                "disponible": False,
                "mensaje": "Este contrato no tiene Programación de obra cargada.",
            },
        }

    def test_cifras_verificables(self):
        inf = build_informe_redactado(
            self._datos_base(), "2026-10-05", "2026-10-11",
            ver_valores_cantidades=True, ver_valores_almacen=True,
        )
        self.assertIn("oct.", inf["titulo"])
        pers = next(p for p in inf["parrafos"] if p["id"] == "personal_jornada")
        self.assertIn("máximo de personas", pers["texto"])
        self.assertIn("4", pers["texto"])
        self.assertIn("1 ausencia", pers["texto"])
        self.assertIn("Maestro", pers["texto"])
        cant = next(p for p in inf["parrafos"] if p["id"] == "cantidades_obra")
        self.assertIn("$", cant["texto"])
        prog = next(p for p in inf["parrafos"] if p["id"] == "programacion")
        self.assertIn("no tiene Programación", prog["texto"])

    def test_sin_valores_economicos(self):
        inf = build_informe_redactado(
            self._datos_base(), "2026-10-05", "2026-10-11",
            ver_valores_cantidades=False, ver_valores_almacen=False,
        )
        cant = next(p for p in inf["parrafos"] if p["id"] == "cantidades_obra")
        self.assertNotIn("valor total", cant["texto"].lower())
        alm = next(p for p in inf["parrafos"] if p["id"] == "almacen")
        self.assertNotIn("$", alm["texto"])


class TestProgramacionSinCarga(unittest.TestCase):
    def test_sin_actividades_programadas_vacio(self):
        class _Q:
            def __init__(self, data):
                self._data = data
                self.not_ = self

            def select(self, *_a, **_k):
                return self

            def eq(self, *_a, **_k):
                return self

            def in_(self, *_a, **_k):
                return self

            def is_(self, *_a, **_k):
                return self

            def limit(self, *_a, **_k):
                return self

            def execute(self):
                class R:
                    data = self._data
                return R()

        class _Sb:
            def table(self, name):
                if name == "prog_versiones":
                    return _Q([{"id": "v1", "numero_version": 1, "tipo": "borrador", "estado": "borrador"}])
                # actividades sin fecha_inicio → no cargada
                return _Q([])

        out = _agg_programacion(_Sb(), 1)
        self.assertFalse(out["disponible"])
        self.assertIn("no tiene Programación", out["mensaje"])


if __name__ == "__main__":
    unittest.main()
