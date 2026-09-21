"""Tests del motor — Planillas de Tubería (fórmulas alineadas al XLSM)."""
from __future__ import annotations

import math
import unittest

from topografia_planilla_tuberia import (
    filtrar_descuentos_manuales_por_tipo,
    migrar_filas_campo_al_cambiar_tipo,
    RELACIONES_ATRAQUE,
    TIPOS_PLANILLA,
    altura_relleno_atraque_m,
    area_1_m2,
    area_2_m2,
    area_tuberia_m2,
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
    def test_formula_round3_todas_relaciones(self):
        theta, esp = 0.9, 0.05
        for rel in RELACIONES_ATRAQUE:
            den = int(rel.split(":")[1])
            esperado = round(2.0 * (theta / 2.0 + esp) / den, 3)
            self.assertAlmostEqual(altura_relleno_atraque_m(theta, esp, rel), esperado, places=12)

    def test_ejemplo_un_tercio(self):
        self.assertAlmostEqual(altura_relleno_atraque_m(0.6, 0.0, "1:3"), 0.2, places=12)
        self.assertAlmostEqual(altura_relleno_atraque_m(0.9, 0.05, "1:3"), 0.333, places=12)


class TestAreasSegmentoCircular(unittest.TestCase):
    def test_area_tuberia_k13(self):
        self.assertAlmostEqual(
            area_tuberia_m2(0.8, 0.04), round(math.pi * (0.4 + 0.04) ** 2, 3), places=12
        )

    def test_area1_segmento_y_area2_resto(self):
        theta, esp, b, rel = 0.8, 0.04, 1.4, "1:3"
        a_tub = area_tuberia_m2(theta, esp)
        a1 = area_1_m2(theta, esp, b, rel)
        a2 = area_2_m2(theta, esp, rel)
        self.assertGreater(a1, 0.0)
        self.assertGreater(a2, 0.0)
        self.assertAlmostEqual(a1 + a2, a_tub, places=3)
        den = 3
        self.assertNotAlmostEqual(a2, a_tub * (1 - 1 / den), places=3)


class TestCarteraXlsm(unittest.TestCase):
    def test_alcantarilla_h_trit_es_e15_mas_f15(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas("ALCANTARILLA"),
            cama_triturado_m=0.10,
        )
        h_esperada = round(altura_relleno_atraque_m(0.9, 0.05, "1:3") + 0.10, 4)
        tot = r["cartera"]["totales"]
        self.assertEqual(tot["n_filas"], 4)
        self.assertAlmostEqual(tot["longitud_m"], 30.0, places=4)
        self.assertIsNone(tot["prom_ancho_geotextil"])
        for f in r["cartera"]["filas"]:
            if f.get("vacio") or f.get("altura_excavacion") is None:
                continue
            self.assertAlmostEqual(f["altura_triturado"], h_esperada, places=4)
            self.assertIsNone(f["ancho_geotextil"])
            self.assertAlmostEqual(
                f["altura_relleno"],
                round(f["altura_excavacion"] - h_esperada, 4),
                places=4,
            )

    def test_filtro_h_trit_y_geotextil_movil(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.6, espesor_m=0.03,
            ancho_excavacion_m=1.2, relacion_atraque="1:2",
            filas_campo=_filas_sinteticas("FILTRO"),
        )
        self.assertEqual(r["seccion"]["tipo"], "FILTRO")
        activas = [f for f in r["cartera"]["filas"] if not f.get("vacio")]
        self.assertIsNone(activas[0]["ancho_geotextil"])
        for i in range(1, len(activas)):
            prev_h = activas[i - 1]["altura_triturado"]
            cur_h = activas[i]["altura_triturado"]
            esperado = ((prev_h + cur_h) / 2.0) * 2.0 + 1.2 * 2.0
            self.assertAlmostEqual(activas[i]["ancho_geotextil"], esperado, places=4)
            self.assertAlmostEqual(
                activas[i]["altura_triturado"],
                activas[i]["terminado_filtro"] - activas[i]["cota_fondo_excavacion"],
                places=4,
            )
            self.assertEqual(activas[i]["altura_relleno"], 0.0)

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


class TestCantidadesDescuentosXlsm(unittest.TestCase):
    def test_alcantarilla_desc_area1_sobre_triturado(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas(),
            cama_triturado_m=0.1,
            descuentos_manuales=[{"codigo": "DESC_OTROS", "cantidad": 2.5}],
        )
        by_cod = {d["codigo"]: d for d in r["descuentos"]}
        self.assertEqual(by_cod["DESC_A1"]["item_cant_codigo"], "TRI")
        self.assertEqual(by_cod["DESC_A2"]["item_cant_codigo"], "REL")
        self.assertAlmostEqual(by_cod["DESC_OTROS"]["cantidad"], 2.5)
        netos = {n["codigo"]: n for n in r["netos"]}
        self.assertAlmostEqual(
            netos["TRI"]["neto"], netos["TRI"]["bruto"] - by_cod["DESC_A1"]["cantidad"], places=2
        )
        self.assertAlmostEqual(netos["REL"]["neto"], netos["REL"]["bruto"], places=2)
        self.assertAlmostEqual(netos["EXC"]["neto"], netos["EXC"]["bruto"] - 2.5, places=2)
        self.assertIn("EXC_ROC", netos)

    def test_filtro_descuento_catalogo(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.6, espesor_m=0.03,
            ancho_excavacion_m=1.2, relacion_atraque="1:4",
            filas_campo=_filas_sinteticas("FILTRO"),
        )
        cods = {d["codigo"] for d in r["descuentos"]}
        self.assertIn("DESC_TUB_FILT", cods)
        self.assertIn("DESC_OTROS", cods)
        self.assertNotIn("DESC_A1", cods)


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

    def test_seccion_incluye_cama_y_area_tuberia(self):
        s = calcular_seccion(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3", cama_triturado_m=0.3,
        )
        self.assertEqual(s["etiqueta_cama"], "Cama Triturado")
        self.assertAlmostEqual(s["cama_triturado_m"], 0.3)
        self.assertAlmostEqual(s["area_tuberia_m2"], area_tuberia_m2(0.9, 0.05))


class TestFlujoE2ESintetico(unittest.TestCase):
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
            cama_triturado_m=0.1 if tipo == "ALCANTARILLA" else 0.0,
            descuentos_manuales=[{"codigo": "DESC_OTROS", "cantidad": 1.0}],
        )
        self.assertEqual(r["seccion"]["tipo"], tipo)
        self.assertIn("seccion_tipica", r)
        self.assertIn("perfil", r)
        self.assertEqual(len(r["perfil"]["abscisas"]), r["cartera"]["totales"]["n_filas"])
        netos = {n["codigo"]: n for n in r["netos"]}
        for cod in ("EXC", "EXC_ROC", "TRI", "REL", "GEO", "TUB"):
            self.assertIn(cod, netos)
        desc_codes = {d["codigo"] for d in r["descuentos"]}
        if tipo == "ALCANTARILLA":
            self.assertTrue({"DESC_A1", "DESC_A2", "DESC_OTROS"} <= desc_codes)
        else:
            self.assertIn("DESC_TUB_FILT", desc_codes)
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

    def test_e2e_alcantarilla(self):
        self._assert_flujo("ALCANTARILLA")

    def test_e2e_filtro(self):
        self._assert_flujo("FILTRO")





class TestDescuentosPorTipoXlsm(unittest.TestCase):
    """Descuentos Específicos: Area1/Area2 (ALC) vs Tubería Filtro (FIL)."""

    def test_alcantarilla_long_espesor_area1_area2(self):
        r = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=_filas_sinteticas("ALCANTARILLA"),
            cama_triturado_m=0.1,
        )
        by = {d["codigo"]: d for d in r["descuentos"]}
        self.assertIn("DESC_A1", by)
        self.assertIn("DESC_A2", by)
        self.assertNotIn("DESC_TUB_FILT", by)
        L = r["cartera"]["totales"]["longitud_m"]
        a1 = r["seccion"]["area_1_m2"]
        a2 = r["seccion"]["area_2_m2"]
        # N46 = PRODUCT(Long, Ancho vacío, Espesor=Area1) → L·Area1
        self.assertAlmostEqual(by["DESC_A1"]["long"], L, places=4)
        self.assertIsNone(by["DESC_A1"]["ancho"])
        self.assertAlmostEqual(by["DESC_A1"]["espesor"], a1, places=3)
        self.assertAlmostEqual(by["DESC_A1"]["cantidad"], round(L * a1, 2), places=2)
        self.assertAlmostEqual(by["DESC_A2"]["cantidad"], round(L * a2, 2), places=2)
        netos = {n["codigo"]: n for n in r["netos"]}
        # G48 = N46 restado de TRI; G49 = N47 mostrado en REL sin restar
        self.assertAlmostEqual(netos["TRI"]["descuentos"], by["DESC_A1"]["cantidad"], places=2)
        self.assertAlmostEqual(netos["REL"]["descuentos"], by["DESC_A2"]["cantidad"], places=2)
        self.assertAlmostEqual(netos["REL"]["neto"], netos["REL"]["bruto"], places=2)

    def test_filtro_tub_filtro_no_areas(self):
        r = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.6, espesor_m=0.03,
            ancho_excavacion_m=1.2, relacion_atraque="1:4",
            filas_campo=_filas_sinteticas("FILTRO"),
        )
        by = {d["codigo"]: d for d in r["descuentos"]}
        self.assertIn("DESC_TUB_FILT", by)
        self.assertNotIn("DESC_A1", by)
        self.assertNotIn("DESC_A2", by)
        L = r["cartera"]["totales"]["longitud_m"]
        a_tub = r["seccion"]["area_tuberia_m2"]
        self.assertAlmostEqual(by["DESC_TUB_FILT"]["long"], L, places=4)
        self.assertIsNone(by["DESC_TUB_FILT"]["ancho"])
        self.assertAlmostEqual(by["DESC_TUB_FILT"]["espesor"], a_tub, places=3)
        self.assertAlmostEqual(by["DESC_TUB_FILT"]["cantidad"], round(L * a_tub, 2), places=2)
        netos = {n["codigo"]: n for n in r["netos"]}
        self.assertAlmostEqual(netos["TRI"]["descuentos"], by["DESC_TUB_FILT"]["cantidad"], places=2)
        self.assertAlmostEqual(netos["REL"]["descuentos"], 0.0, places=2)


class TestCambioTipoDescuentos(unittest.TestCase):
    def test_mismo_dato_catalogo_y_valores_cambian(self):
        filas_alc = _filas_sinteticas("ALCANTARILLA")
        r_alc = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=filas_alc, cama_triturado_m=0.1,
        )
        # Migrar nivel ALC→FIL y recalcular
        filas_fil = migrar_filas_campo_al_cambiar_tipo(filas_alc, "FILTRO")
        for f in filas_fil:
            if f.get("subrasante_via") is not None:
                self.assertEqual(f.get("terminado_filtro"), f.get("subrasante_via"))
        r_fil = calcular_planilla_completa(
            tipo="FILTRO", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=filas_fil,
        )
        cods_alc = {d["codigo"] for d in r_alc["descuentos"]}
        cods_fil = {d["codigo"] for d in r_fil["descuentos"]}
        self.assertTrue({"DESC_A1", "DESC_A2"} <= cods_alc)
        self.assertIn("DESC_TUB_FILT", cods_fil)
        self.assertNotIn("DESC_A1", cods_fil)
        tri_alc = next(n for n in r_alc["netos"] if n["codigo"] == "TRI")["descuentos"]
        tri_fil = next(n for n in r_fil["netos"] if n["codigo"] == "TRI")["descuentos"]
        self.assertNotAlmostEqual(tri_alc, tri_fil, places=2)
        # FIL → ALC
        filas_back = migrar_filas_campo_al_cambiar_tipo(filas_fil, "ALCANTARILLA")
        r_back = calcular_planilla_completa(
            tipo="ALCANTARILLA", diametro_m=0.9, espesor_m=0.05,
            ancho_excavacion_m=1.5, relacion_atraque="1:3",
            filas_campo=filas_back, cama_triturado_m=0.1,
        )
        self.assertIn("DESC_A1", {d["codigo"] for d in r_back["descuentos"]})
        self.assertNotIn("DESC_TUB_FILT", {d["codigo"] for d in r_back["descuentos"]})

    def test_filtro_manual_descarta_area1(self):
        kept = filtrar_descuentos_manuales_por_tipo(
            "FILTRO",
            [
                {"codigo": "DESC_A1", "cantidad": 9},
                {"codigo": "DESC_OTROS", "cantidad": 1.5},
                {"codigo": "DESC_TUB", "cantidad": 3},  # legacy → DESC_TUB_FILT
            ],
        )
        cods = {d["codigo"] for d in kept}
        self.assertNotIn("DESC_A1", cods)
        self.assertIn("DESC_OTROS", cods)
        self.assertIn("DESC_TUB_FILT", cods)

if __name__ == "__main__":
    unittest.main()
