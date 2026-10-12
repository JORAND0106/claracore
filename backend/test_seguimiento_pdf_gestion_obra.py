"""PDF del acta incluye sección Gestión de obra."""
from __future__ import annotations

import unittest

from seguimiento_pdf import _gestion_obra_pdf_html, contenido_hash_acta, generar_pdf_acta


class TestPdfGestionObra(unittest.TestCase):
    def test_html_vacio(self):
        html = _gestion_obra_pdf_html({})
        self.assertIn("Sin consolidado", html)

    def test_html_con_secciones(self):
        acta = {
            "gestion_obra": {
                "fecha_desde": "2026-10-05",
                "fecha_hasta": "2026-10-11",
                "datos": {
                    "personal_jornada": {
                        "disponible": True,
                        "personal": {"filas": [{"empresa": "ACME", "cargo": "Oficial", "cantidad": 2}]},
                        "maquinaria": {"filas": []},
                        "ausentismo": {"disponible": False, "mensaje": "Sin ausentismo"},
                        "jornada": {"disponible": False, "mensaje": "Sin jornada"},
                    },
                    "cantidades_obra": {
                        "disponible": True,
                        "filas": [{"tramo": "T1", "item": "Exc", "unidad": "m3", "cantidad": 10}],
                    },
                    "actividades": {"disponible": False, "mensaje": "Sin actividades"},
                    "almacen": {"disponible": False, "mensaje": "Sin almacén"},
                    "programacion": {
                        "disponible": False,
                        "mensaje": "Este contrato no tiene Programación de obra cargada.",
                    },
                },
                "observaciones": {
                    "personal_jornada": "<p><b>OK</b></p>",
                    "cantidades_obra": "",
                    "actividades": "",
                    "almacen": "",
                    "programacion": "",
                },
            }
        }
        html = _gestion_obra_pdf_html(acta)
        self.assertIn("Personal y jornada", html)
        self.assertIn("ACME", html)
        self.assertIn("Cantidades de obra", html)
        self.assertIn("Programación de obra", html)
        self.assertIn("no tiene Programación", html)

    def test_hash_incluye_gestion_obra(self):
        a1 = {"consecutivo": 1, "gestion_obra": {"fecha_desde": "2026-10-01", "datos": {"x": 1}}}
        a2 = {"consecutivo": 1, "gestion_obra": {"fecha_desde": "2026-10-02", "datos": {"x": 1}}}
        h1 = contenido_hash_acta(a1, [], [], [])
        h2 = contenido_hash_acta(a2, [], [], [])
        self.assertNotEqual(h1, h2)

    def test_pdf_bytes_con_gestion_obra(self):
        acta = {
            "consecutivo": 9,
            "fecha_reunion": "2026-10-12",
            "ubicacion": "Obra",
            "tipo_acta": "interna",
            "orden_del_dia": [{"texto": "Punto 1", "hecho": False}],
            "gestion_obra": {
                "fecha_desde": "2026-10-05",
                "fecha_hasta": "2026-10-11",
                "datos": {
                    "personal_jornada": {"disponible": False, "mensaje": "Sin bitácora"},
                    "cantidades_obra": {"disponible": False, "mensaje": "Sin SICOE"},
                    "actividades": {"disponible": False, "mensaje": "Sin actividades"},
                    "almacen": {"disponible": False, "mensaje": "Sin almacén"},
                    "programacion": {
                        "disponible": False,
                        "mensaje": "Este contrato no tiene Programación de obra cargada.",
                    },
                },
                "observaciones": {},
            },
        }
        pdf = generar_pdf_acta({"id": 1, "nombre": "C1"}, acta, [], [], [])
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 800)


if __name__ == "__main__":
    unittest.main()
