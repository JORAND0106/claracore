"""Anchos de columna para tablas TipTap en PDF."""
from __future__ import annotations

from tema_table_pdf_widths import blend_column_weights, plan_table_column_pcts
from seguimiento_richtext import render_tema_html_for_pdf, sanitize_tema_html


def test_blend_favors_long_content_vs_short():
    pcts = blend_column_weights([100, 100, 100], [5, 5, 80])
    assert abs(sum(pcts) - 100.0) < 0.2
    assert pcts[2] > pcts[0]
    assert pcts[2] > pcts[1]


def test_blend_preserves_editor_proportion_signal():
    # Editor 3:1 vs contenido igual → la columna ancha del editor sigue mayor
    pcts = blend_column_weights([300, 100], [20, 20], content_weight=0.4, editor_weight=0.6)
    assert pcts[0] > pcts[1]


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


def test_render_pdf_uses_percent_widths_not_raw_px():
    raw = (
        "<table><tr>"
        '<th colwidth="80">A</th>'
        '<td colwidth="80">Columna con mucho más contenido textual que la anterior</td>'
        "</tr></table>"
    )
    pdf = render_tema_html_for_pdf(raw)
    assert "width:100%" in pdf
    assert "table-layout:fixed" in pdf
    assert "<colgroup>" in pdf
    assert "width:" in pdf and "%" in pdf
    # No debe quedar width:80px como ancho absoluto dominante
    assert "width:80px" not in pdf
    clean = sanitize_tema_html(raw)
    assert 'colwidth="80"' in clean
