"""Anchos de columna para tablas TipTap en PDF (xhtml2pdf)."""
from __future__ import annotations

import re

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
    assert format_width_pct_attr(21.4).endswith("%")


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


def test_render_pdf_emits_html_width_percent_attrs():
    """
    Causa del fix previo sin efecto: xhtml2pdf ignora style width:%;
    debe salir width="N%" como atributo HTML (igual que _mini_table).
    """
    raw = (
        "<table><tr>"
        '<th colwidth="120">A</th>'
        '<th colwidth="120">B</th>'
        '<td colwidth="120">Columna con mucho más contenido textual que las anteriores y sigue</td>'
        "</tr></table>"
    )
    pdf = render_tema_html_for_pdf(raw)
    assert 'width="100%"' in pdf
    # Atributos HTML en celdas / col
    assert re.search(r'<col width="\d+(\.\d+)?%"', pdf)
    widths = [float(m) for m in re.findall(r'<(?:td|th)[^>]*\swidth="(\d+(?:\.\d+)?)%"', pdf)]
    assert len(widths) >= 3
    assert max(widths) == widths[-1] or widths[-1] >= max(widths) * 0.9
    assert widths[-1] > widths[0]
    # No reexportar px literales del editor
    assert "width:120px" not in pdf
    assert 'colwidth="' not in pdf
    clean = sanitize_tema_html(raw)
    assert 'colwidth="120"' in clean  # sanitizado de pantalla sí conserva


def test_render_ignores_literal_editor_px_when_last_col_narrow():
    """Simula editor con última columna estrecha: el PDF debe ampliarla por contenido."""
    raw = (
        "<table><tbody><tr>"
        '<td colwidth="220"><p>1</p></td>'
        '<td colwidth="220"><p>Act</p></td>'
        '<td colwidth="60"><p>Descripción larga del avance de obra en el frente norte con detalle</p></td>'
        "</tr></tbody></table>"
    )
    pdf = render_tema_html_for_pdf(raw)
    widths = [float(m) for m in re.findall(r'<(?:td|th)[^>]*\swidth="(\d+(?:\.\d+)?)%"', pdf)]
    assert len(widths) == 3
    assert widths[2] > widths[0]
    assert widths[2] > 35
