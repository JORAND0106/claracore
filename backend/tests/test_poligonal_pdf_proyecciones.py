"""
Cartera PDF de poligonal: proyecciones ΔN/ΔE y correcciones Bowditch.

Ejecutar:
  cd backend && python3 -m unittest tests.test_poligonal_pdf_proyecciones -v
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.test_poligonal_cierre_lineal_bowditch import _cuadrado  # noqa: E402
from topografia_utils import (  # noqa: E402
    ajustar_poligonal_armadas,
    fusionar_estaciones_vista,
    html_tabla_poligonal_pdf,
    radiar_armadas,
    _correcciones_tramo_pdf,
    _proyecciones_tramo_pdf,
)


def _celdas_primera_fila(html: str) -> list[str]:
    rows = re.findall(r"<tr>(.*?)</tr>", html, re.S)
    # fila 0 = header; fila 1 = primera estación
    assert len(rows) >= 2, "se esperaba encabezado + al menos una fila"
    return re.findall(r"<td[^>]*>(.*?)</td>", rows[1], re.S)


class TestPoligonalPdfProyecciones(unittest.TestCase):
    def test_headers_incluyen_dn_de_y_corr(self):
        html = html_tabla_poligonal_pdf([], {"nombre": "x"})
        self.assertIn("ΔN", html)
        self.assertIn("ΔE", html)
        self.assertIn("Corr.N", html)
        self.assertIn("Corr.E", html)
        self.assertNotIn(">cN<", html)
        self.assertNotIn(">cE<", html)

    def test_sin_ajuste_proyecciones_desde_azimut_correcciones_guion(self):
        armadas, estaciones, amarres, pi = _cuadrado([100, 100, 100, 100.5])
        arms, _, flat = radiar_armadas(armadas, estaciones, amarres)
        vista = fusionar_estaciones_vista(estaciones, flat)
        # Sin delta persistido: se calcula desde azimut×dist
        e0 = vista[0]
        self.assertIsNone(e0.get("delta_norte"))
        dn, de, _dz = _proyecciones_tramo_pdf(e0)
        self.assertAlmostEqual(dn, 100.0, places=3)
        self.assertAlmostEqual(de, 0.0, places=3)
        cn, ce = _correcciones_tramo_pdf(e0, ajustada=False)
        self.assertIsNone(cn)
        self.assertIsNone(ce)

        html = html_tabla_poligonal_pdf(vista, {"nombre": "demo", "ajustada_at": None})
        cells = _celdas_primera_fila(html)
        # Índices: 0#,1Arm,2Pto,3obs,4cor,5vert,6Dist,7Az,8ΔN,9ΔE,10ΔZ,11Corr.N,12Corr.E
        self.assertEqual(cells[8], "100.000")
        self.assertEqual(cells[9], "0.000")
        self.assertEqual(cells[11], "—")
        self.assertEqual(cells[12], "—")

    def test_ajustada_coincide_con_bowditch(self):
        armadas, estaciones, amarres, pi = _cuadrado([100, 100, 100, 100.5])
        pol = {
            "sentido": "antihorario",
            "tolerancia_relativa": 500,
            "tolerancia_cota_mm_km": 12,
            "precision_angular_seg": 10,
            "tipo": "cerrada",
            "ajustada_at": "2026-09-13T00:00:00Z",
        }
        adj = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, pi)
        by_id = {u["id"]: u for u in adj["updates"] if u.get("id")}
        for e in estaciones:
            u = by_id.get(e["id"])
            if not u:
                continue
            for k, v in u.items():
                if k != "id":
                    e[k] = v
        arms, _, flat = radiar_armadas(armadas, estaciones, amarres)
        vista = fusionar_estaciones_vista(estaciones, flat)

        html = html_tabla_poligonal_pdf(vista, pol)
        cells = _celdas_primera_fila(html)
        u0 = by_id[vista[0]["id"]]
        self.assertEqual(cells[8], f"{float(u0['delta_norte']):.3f}")
        self.assertEqual(cells[9], f"{float(u0['delta_este']):.3f}")
        self.assertEqual(cells[11], f"{float(u0['correccion_norte']):.3f}")
        self.assertEqual(cells[12], f"{float(u0['correccion_este']):.3f}")
        # Segunda estación (az 270°): ΔE negativo / corrección Este
        cells2 = re.findall(
            r"<td[^>]*>(.*?)</td>",
            re.findall(r"<tr>(.*?)</tr>", html, re.S)[2],
            re.S,
        )
        u1 = by_id[vista[1]["id"]]
        self.assertEqual(cells2[8], f"{float(u1['delta_norte']):.3f}")
        self.assertEqual(cells2[9], f"{float(u1['delta_este']):.3f}")
        self.assertEqual(cells2[12], f"{float(u1['correccion_este']):.3f}")


if __name__ == "__main__":
    unittest.main()
