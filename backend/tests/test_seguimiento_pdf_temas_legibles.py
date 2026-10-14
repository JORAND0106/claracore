"""Legibilidad PDF Temas tratados (misma norma NTC que Gestión de obra)."""
from __future__ import annotations

import re
import unittest

from seguimiento_pdf import (
    PDF_ACTA_TEMPLATE_VERSION,
    _ideas_body_html,
    _temas_section_html,
    generar_pdf_acta,
)
from seguimiento_richtext import render_tema_html_for_pdf


def _ol_tiptap(n: int) -> str:
    """Lista TipTap típica: <ol><li><p>…</p></li>…</ol>."""
    items = "".join(
        f"<li><p>Numeral de prueba número {i} con texto suficiente para envolver.</p></li>"
        for i in range(1, n + 1)
    )
    return f"<ol>{items}</ol>"


def _acta_con_tema_largo(*, n_numerales: int = 38) -> tuple:
    contrato = {"numero": "CT-18-2026", "nombre": "Obra", "objeto": "Objeto de prueba"}
    acta = {
        "consecutivo": 18,
        "fecha_reunion": "2026-10-13",
        "tipo_acta": "interna",
        "orden_del_dia": [{"texto": "Temas", "hecho": True}],
        "ubicacion": "Sala",
        "elaborador_nombre": "Ana",
    }
    ideas = [
        {
            "id": 1,
            "orden": 0,
            "titulo": "Seguimiento integral de obra",
            "quien_dijo": "Ing. Pérez",
            "texto": _ol_tiptap(n_numerales),
        }
    ]
    asis = [{"nombre": "A", "cargo": "B", "entidad": "C", "email": "a@b.co"}]
    return contrato, acta, asis, ideas


class TestTemasPdfLegible(unittest.TestCase):
    def test_template_version_bump(self):
        self.assertIn("temas", PDF_ACTA_TEMPLATE_VERSION.lower())

    def test_render_tema_cuerpo_11pt_tablas_9pt(self):
        html = render_tema_html_for_pdf(
            "<p>Párrafo</p>"
            "<ol><li><p>Uno</p></li></ol>"
            "<table><tr><td>A</td><td>B</td></tr></table>"
        )
        self.assertIn("font-size:11pt", html)
        self.assertIn("font-size:9pt", html)
        self.assertIn("tema-ol-item", html)
        # Número y texto en celdas hermanas (sangría francesa), no span suelto + <p>.
        self.assertIn(">1.</td>", html)
        self.assertNotIn("<ol ", html)
        self.assertNotIn("<li style", html)  # ol items son tablas, no <li>

    def test_render_tema_jerarquia_anidada(self):
        html = render_tema_html_for_pdf(
            "<ol>"
            "<li><p>Uno</p>"
            "<ol><li><p>Uno punto uno</p>"
            "<ol><li><p>Uno punto uno punto uno</p></li></ol>"
            "</li></ol>"
            "</li>"
            "<li><p>Dos</p></li>"
            "</ol>"
        )
        self.assertIn(">1.</td>", html)
        self.assertIn(">1.1.</td>", html)
        self.assertIn(">1.1.1.</td>", html)
        self.assertIn(">2.</td>", html)

    def test_ideas_body_jerarquia_ntc(self):
        body = _ideas_body_html(
            [
                {
                    "orden": 0,
                    "titulo": "Avance de excavaciones",
                    "quien_dijo": "María",
                    "texto": "<p>Contenido</p>",
                }
            ]
        )
        self.assertIn("Tema 1. Avance de excavaciones", body)
        self.assertIn("Interviniente: María", body)
        self.assertIn("font-size:11pt", body)

    def test_temas_section_fluye_fuera_de_celda(self):
        """Regresión: el cuerpo NO debe ir en la celda de ``_section``."""
        html = _temas_section_html(
            [{"orden": 0, "titulo": "T", "texto": _ol_tiptap(5)}],
            bordered=True,
        )
        self.assertIn("TEMAS TRATADOS EN PRESENTE ACTA", html)
        # Encabezado en tabla propia; cuerpo en div hermano (no <tr><td>…temas…).
        self.assertIn("</table>", html)
        self.assertIn('<div style="padding:', html)
        # No es la tabla sec de 2 filas con body en segunda celda
        self.assertNotIn('class="sec"', html)

    def test_pdf_no_escala_tipografia_temas(self):
        """Regresión: lista larga en celda de ``_section`` hacía tipografía ~4 pt."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            self.skipTest("PyMuPDF no instalado")

        contrato, acta, asis, ideas = _acta_con_tema_largo(n_numerales=38)
        pdf = generar_pdf_acta(contrato, acta, asis, ideas, [])
        self.assertTrue(pdf.startswith(b"%PDF"))
        doc = fitz.open(stream=pdf, filetype="pdf")
        found = False
        for page in doc:
            text = page.get_text()
            if "Tema 1." not in text and "Numeral de prueba" not in text:
                continue
            if "Numeral de prueba" not in text:
                continue
            found = True
            sizes = {
                round(s["size"], 1)
                for b in page.get_text("dict")["blocks"]
                if b.get("type") == 0
                for line in b.get("lines", [])
                for s in line.get("spans", [])
                if "Numeral" in s.get("text", "") or re.match(r"^\d+\.$", s.get("text", "").strip())
            }
            # Filtrar solo spans del cuerpo del tema (ignorar encabezado institucional).
            body_sizes = {
                round(s["size"], 1)
                for b in page.get_text("dict")["blocks"]
                if b.get("type") == 0
                for line in b.get("lines", [])
                for s in line.get("spans", [])
                if "Numeral de prueba" in (s.get("text") or "")
            }
            self.assertTrue(body_sizes, "se esperaban spans del texto de numerales")
            self.assertFalse(
                any(s < 10.0 for s in body_sizes),
                f"Tipografía escalada en temas: {sorted(body_sizes)} (marcadores {sorted(sizes)})",
            )
        self.assertTrue(found, "no se encontró página con numerales del tema")

    def test_pdf_numeral_y_texto_misma_linea(self):
        """Marcador y texto alineados en Y (sangría francesa); no apilados verticalmente."""
        try:
            import fitz
        except ImportError:
            self.skipTest("PyMuPDF no instalado")

        contrato, acta, asis, ideas = _acta_con_tema_largo(n_numerales=12)
        pdf = generar_pdf_acta(contrato, acta, asis, ideas, [])
        doc = fitz.open(stream=pdf, filetype="pdf")
        # En tablas 2-col, PyMuPDF puede reportar celdas como "líneas" distintas;
        # comprobamos alineación vertical (misma banda Y), no el join de texto.
        paired = 0
        stacked = 0
        for page in doc:
            markers = []
            bodies = []
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    text = "".join(s.get("text", "") for s in spans).strip()
                    if not spans:
                        continue
                    y0 = spans[0]["bbox"][1]
                    x0 = spans[0]["bbox"][0]
                    if re.fullmatch(r"\d+\.", text):
                        markers.append((x0, y0, text))
                    elif "Numeral de prueba" in text:
                        bodies.append((x0, y0, text))
            for mx, my, mt in markers:
                # Buscar cuerpo de numeral en la misma banda Y (±3 pt) y a la derecha.
                same_row = [
                    (bx, by, bt)
                    for bx, by, bt in bodies
                    if abs(by - my) <= 3.0 and bx > mx
                ]
                if same_row:
                    paired += 1
                else:
                    # ¿Hay cuerpo claramente debajo del marcador (layout partido)?
                    below = [
                        (bx, by, bt)
                        for bx, by, bt in bodies
                        if by > my + 6.0 and abs(bx - mx) < 40
                    ]
                    if below:
                        stacked += 1
        self.assertGreater(paired, 0, "ningún numeral alineado horizontalmente con su texto")
        self.assertEqual(
            stacked,
            0,
            f"numerales con texto apilado debajo del número: {stacked}",
        )

    def test_pdf_compromisos_tablas_min_9pt(self):
        html_probe = _ideas_body_html([])
        self.assertIn("11pt", html_probe)
        # Compromisos se validan vía generación: la plantilla usa _FS_TABLE.
        from seguimiento_pdf import _FS_TABLE, _ASIS_FS, _FS_BODY

        self.assertEqual(_FS_BODY, "11pt")
        self.assertEqual(_FS_TABLE, "9pt")
        self.assertEqual(_ASIS_FS, "9pt")


if __name__ == "__main__":
    unittest.main()
