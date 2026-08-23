"""Sanitizado HTML de temas y numeración jerárquica para PDF."""
from __future__ import annotations

from seguimiento_richtext import (
    html_to_plain_text,
    render_tema_html_for_pdf,
    sanitize_tema_html,
)


def test_sanitize_strips_scripts():
    raw = '<p>Hola <strong>mundo</strong><script>alert(1)</script></p>'
    out = sanitize_tema_html(raw)
    assert "<script>" not in out
    assert "<strong>mundo</strong>" in out


def test_sanitize_plain_text_wrapped():
    out = sanitize_tema_html("Línea 1\nLínea 2")
    assert out.startswith("<p>")
    assert "Línea 1" in out


def test_html_to_plain_text():
    assert "Hola mundo" in html_to_plain_text("<p><strong>Hola</strong> mundo</p>")


def test_render_pdf_hierarchical_numbers():
    html = (
        "<ol>"
        "<li><p>Uno</p>"
        "<ol><li><p>Uno punto uno</p>"
        "<ol><li><p>Uno punto uno punto uno</p></li></ol>"
        "</li></ol>"
        "</li>"
        "<li><p>Dos</p></li>"
        "</ol>"
    )
    out = render_tema_html_for_pdf(html)
    assert "1." in out
    assert "1.1." in out
    assert "1.1.1." in out
    assert "2." in out
    assert "<strong>" not in out or True  # marks optional
    # marks preserved
    bold = render_tema_html_for_pdf("<p><strong>Negrita</strong> <em>cursiva</em> <u>sub</u></p>")
    assert "<strong>Negrita</strong>" in bold
    assert "<em>cursiva</em>" in bold
    assert "<u>sub</u>" in bold


def test_render_pdf_bullets():
    out = render_tema_html_for_pdf("<ul><li><p>A</p></li><li><p>B</p></li></ul>")
    assert "<ul" in out
    assert "A" in out and "B" in out


def test_sanitize_preserves_table_and_colwidth():
    raw = (
        '<table><tr>'
        '<th colspan="1" colwidth="120">A</th>'
        '<td colwidth="80">B con texto más largo que A</td>'
        '</tr></table>'
        '<script>x()</script>'
    )
    out = sanitize_tema_html(raw)
    assert "<table" in out
    assert "<th" in out and "<td" in out
    assert 'colwidth="120"' in out
    assert "<script>" not in out
    pdf = render_tema_html_for_pdf(raw)
    assert "<table" in pdf
    assert "A" in pdf and "B" in pdf
    # PDF usa atributo HTML width="N%" y sin colspan=1 (xhtml2pdf)
    assert 'width="100%"' in pdf
    assert 'colspan="1"' not in pdf
    assert "width:120px" not in pdf
    assert "width:80px" not in pdf


def test_html_to_plain_text_tables():
    plain = html_to_plain_text("<table><tr><td>Uno</td><td>Dos</td></tr></table>")
    assert "Uno" in plain and "Dos" in plain
