"""Anchos de columna para tablas TipTap en PDF (xhtml2pdf)."""
from __future__ import annotations

import re

import pytest

from tema_table_pdf_widths import (
    blend_column_weights,
    format_width_pct_attr,
    plan_table_column_pcts,
)
from seguimiento_richtext import render_tema_html_for_pdf, sanitize_tema_html


def test_blend_favors_long_content_vs_short():
    pcts = blend_column_weights([100, 100, 100], [5, 5, 80])
    assert abs(sum(pcts) - 100.0) < 0.2
    assert pcts[2] > pcts[0] * 1.5  # columna larga claramente mayor
    assert pcts[2] > pcts[1]


def test_equal_editor_widths_ignored_for_content():
    """colwidth iguales (TipTap por defecto) no deben aplanar el plan."""
    pcts = blend_column_weights([150, 150, 150], [3, 8, 120])
    assert pcts[2] >= 50


def test_blend_preserves_editor_when_widths_differ_and_content_similar():
    pcts = blend_column_weights([300, 100], [20, 20], content_weight=0.5, editor_weight=0.5)
    assert pcts[0] > pcts[1]


def test_format_width_pct_attr_xhtml2pdf():
    assert format_width_pct_attr(21.0) == "21%"
    assert format_width_pct_attr(21.4) == "21%"
    assert format_width_pct_attr(21.6) == "22%"


def test_plan_from_html_short_and_long():
    html = (
        "<table><tr>"
        '<td colwidth="200">OK</td>'
        '<td colwidth="200">Este es un texto considerablemente más largo para la segunda columna</td>'
        "</tr></table>"
    )
    plans = plan_table_column_pcts(html)
    assert len(plans) == 1
    assert len(plans[0]) == 2
    assert plans[0][1] > plans[0][0]
    assert abs(sum(plans[0]) - 100.0) < 0.2


def test_render_pdf_emits_html_width_percent_attrs_without_colspan_1():
    """
    TipTap emite colspan=\"1\" en cada celda. xhtml2pdf IGNORA width= si hay
    cualquier atributo colspan (incluso 1). El HTML del PDF no debe llevarlo.
    """
    raw = (
        "<table><tr>"
        '<th colspan="1" colwidth="120">A</th>'
        '<th colspan="1" colwidth="120">B</th>'
        '<td colspan="1" colwidth="120">Columna con mucho más contenido textual que las anteriores y sigue</td>'
        "</tr></table>"
    )
    pdf = render_tema_html_for_pdf(raw)
    assert 'width="100%"' in pdf
    assert 'colspan="1"' not in pdf
    assert re.search(r'<th width="\d+%"', pdf)
    widths = [float(m) for m in re.findall(r'<(?:td|th)[^>]*\swidth="(\d+)%"', pdf)]
    assert len(widths) >= 3
    assert widths[-1] > widths[0]
    assert "width:120px" not in pdf
    assert 'colwidth="' not in pdf
    clean = sanitize_tema_html(raw)
    assert 'colwidth="120"' in clean  # sanitizado de pantalla sí conserva


def test_render_ignores_literal_editor_px_when_last_col_narrow():
    """Simula editor con última columna estrecha: el PDF debe ampliarla por contenido."""
    raw = (
        "<table><tbody><tr>"
        '<td colspan="1" colwidth="220"><p>1</p></td>'
        '<td colspan="1" colwidth="220"><p>Act</p></td>'
        '<td colspan="1" colwidth="60"><p>Descripción larga del avance de obra en el frente norte con detalle</p></td>'
        "</tr></tbody></table>"
    )
    pdf = render_tema_html_for_pdf(raw)
    assert 'colspan="1"' not in pdf
    widths = [float(m) for m in re.findall(r'<(?:td|th)[^>]*\swidth="(\d+)%"', pdf)]
    assert len(widths) == 3
    assert widths[2] > widths[0]
    assert widths[2] > 35


def test_xhtml2pdf_respects_width_only_without_colspan_1():
    """
    Verificación visual con el motor real: última columna más ancha que las
    primeras cuando el HTML del PDF omite colspan=\"1\".
    """
    pytest.importorskip("xhtml2pdf")
    pytest.importorskip("pdfminer")
    from io import BytesIO

    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer
    from xhtml2pdf import pisa

    raw = (
        "<table><tbody><tr>"
        '<th colspan="1" colwidth="150"><p>AAX</p></th>'
        '<th colspan="1" colwidth="150"><p>BBX</p></th>'
        '<th colspan="1" colwidth="150"><p>Vaciado de losa en el tramo PK 1+000 al PK 1+200 '
        "incluyendo curado y control de calidad en frente norte</p></th>"
        "</tr></tbody></table>"
    )
    fragment = render_tema_html_for_pdf(raw)
    assert 'colspan="1"' not in fragment
    doc = (
        "<!DOCTYPE html><html><body style=\"font-size:9pt;font-family:Helvetica;\">"
        f'<div style="width:360pt;">{fragment}</div></body></html>'
    )
    buf = BytesIO()
    status = pisa.CreatePDF(doc, dest=buf, encoding="utf-8")
    assert not status.err
    hits = {}
    for page in extract_pages(BytesIO(buf.getvalue())):
        for el in page:
            if not isinstance(el, LTTextContainer):
                continue
            t = el.get_text().strip().replace("\n", " ")
            for key in ("AAX", "BBX", "Vaciado"):
                if key in t[:40] and key not in hits:
                    hits[key] = (el.x0, el.width)
    assert "AAX" in hits and "BBX" in hits and "Vaciado" in hits
    # La columna de descripción debe empezar antes que en layout equitativo (~280+)
    # y ocupar más ancho horizontal.
    assert hits["BBX"][0] < 180, hits
    assert hits["Vaciado"][1] > 200, hits
