"""Legibilidad PDF Gestión de obra (NTC 1486 adaptada)."""
from __future__ import annotations

import re
import unittest

from gestion_obra_pdf import _bar_chart_png, _matrix_table, render_gestion_obra_pdf_html
from seguimiento_pdf import _gestion_obra_pdf_html, generar_pdf_acta


def _rich(html: str) -> str:
    return html or ""


def _acta_fixture(*, ver_cant=True, ver_alm=False):
    return {
        "gestion_obra": {
            "fecha_desde": "2026-10-05",
            "fecha_hasta": "2026-10-12",
            "ver_valores_cantidades": ver_cant,
            "ver_valores_almacen": ver_alm,
            "datos": {
                "personal_jornada": {
                    "disponible": True,
                    "dias": ["2026-10-05", "2026-10-06", "2026-10-07"],
                    "personal": {
                        "series": [
                            {"nombre": "ACME", "valor": 4},
                            {"nombre": "BETA", "valor": 2},
                        ],
                        "empresas": [{
                            "empresa": "ACME",
                            "max_diario": 4,
                            "filas": [
                                {
                                    "cargo": "Oficial",
                                    "por_dia": {"2026-10-05": 2, "2026-10-06": 4, "2026-10-07": 3},
                                    "max_diario": 4,
                                    "ausencias_por_dia": {"2026-10-07": 1},
                                },
                                {
                                    "cargo": "Total del día",
                                    "es_total_dia": True,
                                    "por_dia": {"2026-10-05": 2, "2026-10-06": 4, "2026-10-07": 3},
                                    "max_diario": 4,
                                    "ausencias_por_dia": {},
                                },
                            ],
                        }],
                    },
                    "maquinaria": {
                        "series": [{"nombre": "Retroexcavadora", "valor": 1}],
                        "filas": [{
                            "equipo": "Retroexcavadora",
                            "por_dia": {"2026-10-05": 1, "2026-10-06": 1, "2026-10-07": 0},
                            "max_diario": 1,
                        }],
                    },
                    "ausentismo": {"disponible": True, "ausentes": 1},
                    "convencion_ausentismo": "Celdas sombreadas: hubo ausencias",
                    "jornada": {"disponible": True, "promedio_horas": 9, "registros": 10},
                },
                "cantidades_obra": {
                    "disponible": True,
                    "ver_valores": ver_cant,
                    "tramos": [{
                        "tramo": "TRAMO 1A",
                        "capitulos": [{
                            "capitulo": "1. Excavaciones",
                            "subtotal_valor": 1500000 if ver_cant else None,
                            "items": [{
                                "item_numero": "1.1",
                                "item_descripcion": (
                                    "EXCAVACIONES VARIAS SIN CLASIFICAR (INCLUYE RETIRO "
                                    "DE SOBRANTES A UNA DISTANCIA MENOR DE 5 KM)"
                                ),
                                "unidad": "m3",
                                "cantidad": 10,
                                "vlr_unitario": 150000 if ver_cant else None,
                                "valor_total": 1500000 if ver_cant else None,
                            }],
                        }],
                    }],
                    "total_general_valor": 1500000 if ver_cant else None,
                },
                "actividades": {
                    "disponible": True,
                    "series": [{"nombre": "2026-10-06", "valor": 2}],
                    "filas": [{
                        "fecha": "2026-10-06",
                        "tramo": "T1",
                        "actividad": "Ajuste",
                        "detalle": "Detalle corto",
                    }],
                },
                "almacen": {
                    "disponible": True,
                    "ver_valores": ver_alm,
                    "series_por_dia": [{
                        "fecha": "2026-10-06",
                        "creadas": 2, "gestionadas": 1, "aprobadas": 0, "pendientes": 2,
                    }],
                    "solicitudes": [{
                        "fecha": "2026-10-06",
                        "solicitante": "Pedro",
                        "insumos_resumen": "2 insumo(s)",
                        "estado": "enviada",
                        "valor": 999999,
                    }],
                    "entradas": [],
                    "salidas": [],
                },
                "programacion": {
                    "disponible": False,
                    "mensaje": "Este contrato no tiene Programación de obra cargada.",
                },
            },
            "observaciones": {
                "personal_jornada": "<p>Obs personal</p>",
                "cantidades_obra": "",
                "actividades": "",
                "almacen": "",
                "programacion": "",
            },
        }
    }


class TestGestionObraPdfLegible(unittest.TestCase):
    def test_anchos_y_tipografia(self):
        html = render_gestion_obra_pdf_html(_acta_fixture(), render_rich=_rich)
        self.assertIn("font-size:11pt", html)
        self.assertIn("font-size:9pt", html)
        # No tipografía diminuta en la sección
        self.assertNotRegex(html, r"font-size:7\.5pt")
        self.assertNotRegex(html, r"font-size:[0-8]pt")
        self.assertIn("width:100%", html)
        self.assertIn("width='100%'", html)
        self.assertIn("<colgroup>", html)
        self.assertIn("Máximo diario", html)
        self.assertIn("Valor unitario", html)
        self.assertIn("Unidad", html)

    def test_tablas_figuras_fuente(self):
        html = render_gestion_obra_pdf_html(_acta_fixture(), render_rich=_rich)
        self.assertIn("Tabla 1.", html)
        self.assertIn("Figura 1.", html)
        self.assertIn("Fuente: ClaraCore, módulo Bitácora", html)
        self.assertIn("data:image/png;base64,", html)

    def test_subtotal_dentro_tabla(self):
        html = render_gestion_obra_pdf_html(_acta_fixture(ver_cant=True), render_rich=_rich)
        self.assertIn("Subtotal capítulo", html)
        self.assertIn("Total general de la semana", html)
        # No debe quedar el patrón viejo suelto fuera
        self.assertNotIn("Subtotal capítulo: <b>", html)

    def test_sin_valores_almacen(self):
        html = _gestion_obra_pdf_html(_acta_fixture(ver_alm=False))
        self.assertNotIn("999999", html)
        self.assertIn("Pedro", html)

    def test_matrix_cols_suman_100(self):
        html = _matrix_table(
            "Cargo",
            ["2026-10-05", "2026-10-06"],
            [{"label": "Oficial", "por_dia": {"2026-10-05": 1}, "max_diario": 1}],
        )
        th_widths = [float(x) for x in re.findall(r"<th width='([0-9.]+)%'", html)]
        self.assertEqual(len(th_widths), 4)
        self.assertAlmostEqual(sum(th_widths), 100.0, places=1)
        self.assertIn("5 oct.", html)

    def test_chart_png(self):
        uri = _bar_chart_png(
            ["5 oct.", "6 oct."],
            [{"name": "ACME", "values": [2, 4]}],
        )
        self.assertTrue(uri and uri.startswith("data:image/png;base64,"))

    def test_pdf_bytes_con_figuras(self):
        acta = {"consecutivo": 1, "fecha_reunion": "2026-10-13", "tipo_acta": "interna"}
        acta.update(_acta_fixture())
        pdf = generar_pdf_acta(
            {"numero": "C-1", "nombre": "Obra"},
            acta,
            [],
            [],
            [],
        )
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 5000)

    def test_pdf_no_escala_tipografia_gestion(self):
        """Regresión: cuerpo en celda de ``_section`` hacía tipografía ~4 pt."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            self.skipTest("PyMuPDF no instalado")
        acta = {"consecutivo": 1, "fecha_reunion": "2026-10-13", "tipo_acta": "interna"}
        acta.update(_acta_fixture(ver_cant=True))
        pdf = generar_pdf_acta(
            {"numero": "C-1", "nombre": "Obra"},
            acta,
            [{"nombre": "A", "cargo": "B", "entidad": "C", "email": "a@b.co"}],
            [],
            [],
        )
        doc = fitz.open(stream=pdf, filetype="pdf")
        found_tabla = False
        for page in doc:
            text = page.get_text()
            # Páginas de detalle (tablas), no la portada del acta con tipografía del encabezado.
            if "Máximo diario" not in text:
                continue
            found_tabla = True
            sizes = {
                round(s["size"], 1)
                for b in page.get_text("dict")["blocks"] if b.get("type") == 0
                for line in b.get("lines", [])
                for s in line.get("spans", [])
            }
            self.assertFalse(
                any(s < 8.5 for s in sizes),
                f"Tipografía escalada en página con tablas de gestión: {sorted(sizes)}",
            )
        self.assertTrue(found_tabla)


if __name__ == "__main__":
    unittest.main()
