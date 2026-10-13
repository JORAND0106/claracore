"""PDF del acta incluye sección Gestión de obra (consolidado por día)."""
from __future__ import annotations

import unittest

from seguimiento_pdf import _gestion_obra_pdf_html, contenido_hash_acta, generar_pdf_acta


class TestPdfGestionObra(unittest.TestCase):
    def test_html_vacio(self):
        html = _gestion_obra_pdf_html({})
        self.assertIn("Sin consolidado", html)

    def test_html_con_secciones_por_dia(self):
        acta = {
            "gestion_obra": {
                "fecha_desde": "2026-10-05",
                "fecha_hasta": "2026-10-06",
                "datos": {
                    "personal_jornada": {
                        "disponible": True,
                        "dias": ["2026-10-05", "2026-10-06"],
                        "personal": {
                            "empresas": [{
                                "empresa": "ACME",
                                "max_diario": 2,
                                "total": 2,
                                "filas": [{
                                    "cargo": "Oficial",
                                    "por_dia": {"2026-10-05": 2, "2026-10-06": 1},
                                    "max_diario": 2,
                                    "ausencias_por_dia": {"2026-10-06": 1},
                                    "total": 2,
                                }],
                            }],
                        },
                        "maquinaria": {"filas": []},
                        "ausentismo": {"disponible": True, "ausentes": 1, "total": 1},
                        "convencion_ausentismo": "Celdas sombreadas: hubo ausencias",
                        "jornada": {"disponible": False, "mensaje": "Sin jornada"},
                    },
                    "cantidades_obra": {
                        "disponible": True,
                        "tramos": [{
                            "tramo": "T1",
                            "capitulos": [{
                                "capitulo": "1",
                                "items": [{
                                    "item_numero": "1.1",
                                    "item_descripcion": "Exc",
                                    "unidad": "m3",
                                    "cantidad": 10,
                                }],
                            }],
                        }],
                    },
                    "actividades": {"disponible": False, "mensaje": "Sin actividades"},
                    "almacen": {
                        "disponible": True,
                        "solicitudes": [{
                            "fecha": "2026-10-05",
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
        self.assertIn("máx. diario", html)
        self.assertIn("Oficial", html)
        self.assertIn("Celdas sombreadas", html)
        self.assertIn("Cantidades de obra", html)
        self.assertIn("1.1", html)
        self.assertIn("Pedro", html)
        # Sin ver_valores: no mostrar cifra cruda de almacén
        self.assertNotIn("999999", html)
        self.assertIn("no tiene Programación", html)

    def test_hash_incluye_gestion_obra(self):
        a1 = {"consecutivo": 1, "gestion_obra": {"fecha_desde": "2026-10-01", "datos": {"x": 1}}}
        a2 = {"consecutivo": 1, "gestion_obra": {"fecha_desde": "2026-10-02", "datos": {"x": 1}}}
        self.assertNotEqual(contenido_hash_acta(a1, [], [], []), contenido_hash_acta(a2, [], [], []))

    def test_pdf_bytes(self):
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


if __name__ == "__main__":
    unittest.main()
