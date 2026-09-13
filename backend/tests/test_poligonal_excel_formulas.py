"""
Exportación Excel de poligonal con fórmulas vivas.

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_excel_formulas -v
"""
from __future__ import annotations

import io
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl import load_workbook  # noqa: E402

from tests.test_poligonal_cierre_lineal_bowditch import _cuadrado  # noqa: E402
from topografia_poligonal_xlsx import build_poligonal_xlsx_bytes  # noqa: E402
from topografia_utils import (  # noqa: E402
    ajustar_poligonal_armadas,
    calcular_cierre_poligonal,
    radiar_armadas,
)


def _mod360(x: float) -> float:
    return float(x) % 360.0


def _simular_cartera_excel(
    *,
    azimuts: list[float],
    distancias: list[float],
    base_az: float,
    norte0: float,
    este0: float,
    cota0: float | None,
    antihorario: bool = True,
    hi: float = 1.5,
    ht: float = 0.0,
    ang_v: float = 90.0,
):
    """Replica las fórmulas de la hoja Cartera (modo azimut directo)."""
    n = len(azimuts)
    assert n == len(distancias)
    ang_deriv = []
    for i, az in enumerate(azimuts):
        if i == 0:
            ang_deriv.append(_mod360(az - base_az))
        else:
            ang_deriv.append(_mod360(az - azimuts[i - 1] - 180.0))
    teorico = ((n - 2) if antihorario else (n + 2)) * 180.0
    diff = sum(ang_deriv) - teorico
    ang_corr = [a - diff / n for a in ang_deriv]
    az_corr = []
    for i, az in enumerate(azimuts):
        if i == 0:
            az_corr.append(_mod360(az))
        else:
            az_corr.append(_mod360(az_corr[i - 1] + 180.0 + ang_corr[i]))
    dn = [d * math.cos(math.radians(a)) for d, a in zip(distancias, az_corr)]
    de = [d * math.sin(math.radians(a)) for d, a in zip(distancias, az_corr)]
    sin_v = math.sin(math.radians(ang_v))
    dz = [
        0.0 if abs(sin_v) < 1e-9 else hi + d * math.cos(math.radians(ang_v)) / sin_v - ht
        for d in distancias
    ]
    err_n, err_e, err_z = sum(dn), sum(de), sum(dz)
    peri = sum(distancias)
    cn = [0.0 if peri <= 0 else -err_n * d / peri for d in distancias]
    ce = [0.0 if peri <= 0 else -err_e * d / peri for d in distancias]
    cz = [0.0 if peri <= 0 else -err_z * d / peri for d in distancias]
    nortes, estes, cotas = [], [], []
    nn, ee, zz = norte0, este0, cota0
    for i in range(n):
        nn = nn + dn[i] + cn[i]
        ee = ee + de[i] + ce[i]
        if zz is not None:
            zz = zz + dz[i] + cz[i]
        nortes.append(nn)
        estes.append(ee)
        cotas.append(zz)
    return {
        "ang_deriv": ang_deriv,
        "diff": diff,
        "ang_corr": ang_corr,
        "az_corr": az_corr,
        "err_n": err_n,
        "err_e": err_e,
        "peri": peri,
        "error_lineal": math.hypot(err_n, err_e),
        "nortes": nortes,
        "estes": estes,
        "cotas": cotas,
        "cn": cn,
        "ce": ce,
    }


class TestPoligonalExcelFormulas(unittest.TestCase):
    def _build_square(self, dists=None):
        dists = dists or [100.0, 100.0, 100.0, 100.5]
        armadas, estaciones, amarres, pi = _cuadrado(dists)
        arms, _, flat = radiar_armadas(armadas, estaciones, amarres)
        cierre = calcular_cierre_poligonal(
            arms, pi, tipo_pol="cerrada", tol_relativa=500, precision_angular_seg=10.0
        )
        raw = build_poligonal_xlsx_bytes(
            contrato={"numero": "C-1", "objeto": "Demo", "contratista": "A", "interventoria": "B"},
            pol={
                "nombre": "Cuadrado demo",
                "tipo": "cerrada",
                "sentido": "antihorario",
                "tolerancia_relativa": 500,
                "precision_angular_seg": 10,
                "equipo_marca": "Leica",
                "operador": "Topo",
                "fecha_campo": "2026-09-13",
            },
            estaciones=flat,
            punto_inicial=pi,
            cierre=cierre,
            armadas=arms,
        )
        return raw, arms, flat, pi, cierre, armadas, estaciones, amarres

    def test_xlsx_magic_y_hojas(self):
        raw, *_ = self._build_square()
        self.assertEqual(raw[:2], b"PK")
        wb = load_workbook(io.BytesIO(raw))
        self.assertIn("Cartera", wb.sheetnames)
        self.assertIn("Esquema", wb.sheetnames)
        ws = wb["Cartera"]
        self.assertEqual(ws["D18"].value, "Az campo °")
        self.assertTrue(str(ws["I20"].value).startswith("="))
        self.assertTrue(str(ws["J20"].value).startswith("="))
        self.assertTrue(str(ws["K20"].value).startswith("="))
        self.assertTrue(str(ws["L20"].value).startswith("="))
        self.assertTrue(str(ws["O20"].value).startswith("="))
        self.assertTrue(str(ws["R20"].value).startswith("="))
        self.assertTrue(str(ws["W19"].value).startswith("="))
        self.assertTrue(str(ws["AB23"].value).startswith("="))
        self.assertTrue(str(ws["Z25"].value).startswith("="))
        # Entradas amarillas (valores, no fórmulas)
        self.assertIsInstance(ws["D20"].value, (int, float))
        self.assertIsInstance(ws["E20"].value, (int, float))
        # Esquema referencia Cartera
        ws2 = wb["Esquema"]
        self.assertIn("Cartera!", str(ws2["C5"].value))
        self.assertTrue(len(ws2._charts) >= 1)

    def test_base_azimut_desde_primera_armada(self):
        raw, arms, *_ = self._build_square()
        wb = load_workbook(io.BytesIO(raw))
        self.assertAlmostEqual(float(wb["Cartera"]["B14"].value), float(arms[0]["base_azimut"]), places=4)
        self.assertEqual(int(wb["Cartera"]["B16"].value), 1)

    def test_cascada_coincide_con_plataforma(self):
        raw, arms, flat, pi, cierre, armadas, estaciones, amarres = self._build_square()
        wb = load_workbook(io.BytesIO(raw))
        ws = wb["Cartera"]
        base = float(ws["B14"].value)
        azs, dists = [], []
        for r in range(20, 24):
            azs.append(float(ws[f"D{r}"].value))
            dists.append(float(ws[f"E{r}"].value))

        sim = _simular_cartera_excel(
            azimuts=azs,
            distancias=dists,
            base_az=base,
            norte0=float(pi["norte"]),
            este0=float(pi["este"]),
            cota0=float(pi["cota"]),
        )
        # Cierre angular / lineal de campo (antes de editar)
        self.assertAlmostEqual(sim["diff"], float(cierre["error_angular"] or 0), places=4)
        self.assertAlmostEqual(sim["error_lineal"], float(cierre["error_lineal"]), places=3)
        self.assertAlmostEqual(-sim["err_e"], float(cierre["delta_este"]), places=3)

        pol = {
            "sentido": "antihorario",
            "tolerancia_relativa": 500,
            "tolerancia_cota_mm_km": 12,
            "precision_angular_seg": 10,
            "tipo": "cerrada",
        }
        adj = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, pi)
        updates = {u["id"]: u for u in adj["updates"] if u.get("norte_ajustado") is not None}
        # Orden de legs flat
        legs = [e for e in flat if float(e.get("distancia") or 0) > 0]
        for i, e in enumerate(legs):
            u = updates[e["id"]]
            self.assertAlmostEqual(sim["nortes"][i], float(u["norte_ajustado"]), places=3)
            self.assertAlmostEqual(sim["estes"][i], float(u["este_ajustado"]), places=3)
            self.assertAlmostEqual(sim["az_corr"][i], float(u["azimut"]), places=4)

    def test_editar_distancia_recalcula_en_cascada(self):
        """Si cambia una distancia, el error lineal y coords finales cambian (simulación)."""
        _, arms, flat, pi, *_rest = self._build_square([100, 100, 100, 100])
        base = float(arms[0]["base_azimut"])
        azs = [float(e["azimut"]) for e in flat if float(e.get("distancia") or 0) > 0]
        dists0 = [100.0, 100.0, 100.0, 100.0]
        ok = _simular_cartera_excel(
            azimuts=azs,
            distancias=dists0,
            base_az=base,
            norte0=pi["norte"],
            este0=pi["este"],
            cota0=pi["cota"],
        )
        self.assertAlmostEqual(ok["error_lineal"], 0.0, places=4)

        dists1 = [100.0, 100.0, 100.0, 100.8]
        edited = _simular_cartera_excel(
            azimuts=azs,
            distancias=dists1,
            base_az=base,
            norte0=pi["norte"],
            este0=pi["este"],
            cota0=pi["cota"],
        )
        self.assertGreater(edited["error_lineal"], 0.5)
        # Tras Bowditch, el último punto debe volver cerca del arranque
        self.assertAlmostEqual(edited["nortes"][-1], pi["norte"], places=3)
        self.assertAlmostEqual(edited["estes"][-1], pi["este"], places=3)


if __name__ == "__main__":
    unittest.main()
