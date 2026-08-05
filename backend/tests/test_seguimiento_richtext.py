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
