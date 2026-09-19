"""Tests del motor único de Planillas de Tubería (datos sintéticos)."""
from __future__ import annotations

import math
import unittest

from topografia_planilla_tuberia import (
    RELACIONES_ATRAQUE,
    TIPOS_PLANILLA,
    altura_relleno_atraque_m,
    area_1_m2,
    area_2_m2,
    calcular_planilla_completa,
    calcular_seccion,
    construir_fila_consolidado,
    validar_cartera_campo,
)


def _filas_sinteticas(tipo: str = "ALCANTARILLA"):
    filas = []
    for i, abs_ in enumerate((100.0, 110.0, 120.0, 130.0), start=1):
        fila = {
            "orden": i,
            "abscisa": abs_,
            "terreno_natural": 105.0 - 0.05 * (i - 1),
            "cota_fondo_excavacion": 102.8 - 0.04 * (i - 1),
        }
        if tipo == "FILTRO":
            fila["terminado_filtro"] = 104.2 - 0.03 * (i - 1)
        else:
            fila["subrasante_via"] = 104.3 - 0.03 * (i - 1)
        filas.append(fila)
    filas.insert(2, {"orden": 99, "abscisa": None, "terreno_natural": None})
    return filas


class TestAlturaRellenoAtraque(unittest.TestCase):
    def test_formula_fija_todas_relaciones(self):
        theta, esp = 0.9, 0.05
        for rel in RELACIONES_ATRAQUE:
            den = int(rel.split(":")[1])
            esperado = 2.0 * (theta / 2.0 + esp) / den
            self.assertAlmostEqual(altura_relleno_atraque_m(theta, esp, rel), esperado, places=12)

    def test_ejemplo_un_tercio(self):
        self.assertAlmostEqual(altura_relleno_atraque_m(0.6, 0.0, "1:3"), 0.2, places=12)
        self.assertAlmostEqual(altura_relleno_atraque_m(0.9, 0.05, "1:3"), 1.0 / 3.0, places=12)


class TestAreas(unittest.TestCase):
    def test_areas_por_relacion(self):
        theta, esp, b = 0.8, 0.04, 1.4
        for rel in RELACIONES_ATRAQUE:
            a1 = area_1_m2(theta, esp, b, rel)
            a2 = area_2_m2(theta, esp, rel)
            self.assertGreaterEqual(a1, 0.0)
            self.assertGreaterEqual(a2, 0.0)
            d_ext = theta + 2 * esp
            area_tubo = math.pi * (d_ext / 2) ** 2
            den = int(rel.split(":")[1])
            self.assertAlmostEqual(a2, area_tubo * (1 - 1 / den), places=9)


class TestCarteraAmbosModos(unittest.TestCase):
    def test_alcantarilla_alturas_y_geotextil(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas("ALCANTARILLA"),
        )
        tot = r["cartera"]["totales"]
        self.assertEqual(tot["n_filas"], 4)
        self.assertAlmostEqual(tot["longitud_m"], 30.0, places=4)
        self.assertIsNotNone(tot["prom_altura_excavacion"])
        self.assertIsNotNone(tot["prom_ancho_geotextil"])
        for f in r["cartera"]["filas"]:
            if f.get("vacio") or f.get("altura_excavacion") is None:
                continue
            self.assertAlmostEqual(
                f["ancho_geotextil"], 1.5 + 2 * f["altura_excavacion"], places=4
            )

    def test_filtro_geotextil_distinto(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.6, espesor_m=0.03,
            ancho_excavacion_m=1.2, relacion_atraque="1:2",
            filas_campo=_filas_sinteticas("FILTRO"),
        )
        self.assertEqual(r["seccion"]["tipo"], "FILTRO")
        for f in r["cartera"]["filas"]:
            if f.get("vacio") or f.get("altura_excavacion") is None:
                continue
            extra = (f["altura_triturado"] or 0) + max(f["altura_relleno"] or 0, 0)
            self.assertAlmostEqual(f["ancho_geotextil"], 1.2 + 2 * extra, places=4)

    def test_promedios_ignoran_filas_vacias(self):
        filas = _filas_sinteticas()
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.5, espesor_m=0.02,
            ancho_excavacion_m=1.0, relacion_atraque="1:1",
            filas_campo=filas,
        )
        vacias = [f for f in r["cartera"]["filas"] if f.get("vacio")]
        self.assertGreaterEqual(len(vacias), 1)
        self.assertEqual(r["cartera"]["totales"]["n_filas"], len(filas) - len(vacias))


class TestCantidadesDescuentos(unittest.TestCase):
    def test_vinculo_por_codigo_no_por_posicion(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas(),
            descuentos_manuales=[{"codigo": "DESC_POZO", "cantidad": 2.5}],
        )
        by_cod = {d["codigo"]: d for d in r["descuentos"]}
        self.assertEqual(by_cod["DESC_TUB"]["item_cant_codigo"], "REL")
        self.assertEqual(by_cod["DESC_POZO"]["item_cant_codigo"], "EXC")
        self.assertAlmostEqual(by_cod["DESC_POZO"]["cantidad"], 2.5)
        netos = {n["codigo"]: n for n in r["netos"]}
        self.assertAlmostEqual(netos["EXC"]["descuentos"], 2.5)
        self.assertAlmostEqual(netos["EXC"]["neto"], netos["EXC"]["bruto"] - 2.5)

    def test_filtro_descuento_catalogo(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.6, espesor_m=0.03,
            ancho_excavacion_m=1.2, relacion_atraque="1:4",
            filas_campo=_filas_sinteticas("FILTRO"),
        )
        cods = {d["codigo"] for d in r["descuentos"]}
        self.assertIn("DESC_FILT", cods)
        self.assertNotIn("DESC_POZO", cods)


class TestValidacionYConsolidado(unittest.TestCase):
    def test_validacion_restrictiva_cfe_sobre_tn(self):
        filas = [{
            "orden": 1, "abscisa": 10, "terreno_natural": 100,
            "subrasante_via": 99, "cota_fondo_excavacion": 101,
        }]
        v = validar_cartera_campo(filas, "ALCANTARILLA")
        self.assertFalse(v["ok"])
        self.assertTrue(any(e["campo"] == "cota_fondo_excavacion" for e in v["errores"]))

    def test_consolidado_22_columnas(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas(),
        )
        fila = construir_fila_consolidado(
            {"id": "p1", "pk_id": "PK-1", "nombre": "T1", "costado": "Izq",
             "norte_ref": 1, "este_ref": 2, "estado": "cerrado", "contrato_id": 9},
            r,
        )
        keys = [k for k in fila if k.startswith("c")]
        self.assertEqual(len(keys), 22)
        self.assertEqual(fila["c02_tipo"], "ALCANTARILLA")
        self.assertEqual(fila["c22_contrato_id"], 9)


class TestSeccionParams(unittest.TestCase):
    def test_tipos_planilla(self):
        self.assertEqual(set(TIPOS_PLANILLA), {"ALCANTARILLA", "FILTRO"})

    def test_seccion_rechaza_negativos(self):
        with self.assertRaises(ValueError):
            calcular_seccion(
                tipo="ALCANTARILLA", diametro_m=-1, espesor_m=0,
                ancho_excavacion_m=1, relacion_atraque="1:3",
            )


class TestFlujoE2ESintetico(unittest.TestCase):
    """Flujo completo sintético ALCANTARILLA y FILTRO: cartera → calc → consolidado."""

    def _assert_flujo(self, tipo: str):
        filas = _filas_sinteticas(tipo)
        v = validar_cartera_campo(
            [f for f in filas if f.get("abscisa") is not None], tipo
        )
        self.assertTrue(v["ok"], msg=v.get("errores"))
        r = calcular_planilla_completa(
            tipo=tipo, diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=filas,
            descuentos_manuales=(
                [{"codigo": "DESC_POZO", "cantidad": 1.0}] if tipo == "ALCANTARILLA"
                else [{"codigo": "DESC_FILT", "cantidad": 0.5}]
            ),
        )
        self.assertEqual(r["seccion"]["tipo"], tipo)
        self.assertIn("seccion_tipica", r)
        self.assertIn("perfil", r)
        self.assertEqual(len(r["perfil"]["abscisas"]), r["cartera"]["totales"]["n_filas"])
        # Filas vacías no aportan abscisa al perfil
        self.assertTrue(all(a is not None for a in r["perfil"]["abscisas"]))
        netos = {n["codigo"]: n for n in r["netos"]}
        for cod in ("EXC", "TRI", "REL", "GEO", "TUB"):
            self.assertIn(cod, netos)
            self.assertAlmostEqual(netos[cod]["neto"], netos[cod]["bruto"] - netos[cod]["descuentos"], places=4)
        desc_codes = {d["codigo"] for d in r["descuentos"]}
        if tipo == "ALCANTARILLA":
            self.assertIn("DESC_POZO", desc_codes)
        else:
            self.assertIn("DESC_FILT", desc_codes)
        consol = construir_fila_consolidado(
            {
                "id": f"syn-{tipo.lower()}", "pk_id": "K0+100", "nombre": f"Tramo {tipo}",
                "costado": "Der", "norte_ref": 1100000.0, "este_ref": 1000000.0,
                "estado": "cerrado", "cerrado_at": "2026-01-01T00:00:00Z", "contrato_id": 42,
            },
            r,
        )
        self.assertEqual(len([k for k in consol if k.startswith("c")]), 22)
        self.assertEqual(consol["c02_tipo"], tipo)
        self.assertAlmostEqual(consol["c08_longitud_m"], 30.0, places=4)
        self.assertEqual(consol["c17_long_tuberia_m"], netos["TUB"]["neto"])
        self.assertEqual(consol["c13_vol_excavacion_m3"], netos["EXC"]["neto"])

    def test_e2e_alcantarilla(self):
        self._assert_flujo("ALCANTARILLA")

    def test_e2e_filtro(self):
        self._assert_flujo("FILTRO")


if __name__ == "__main__":
    unittest.main()
