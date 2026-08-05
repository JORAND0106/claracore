"""Sanitizado y render PDF de HTML de temas (TipTap) — stdlib only."""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from typing import List, Optional, Tuple


_ALLOWED_TAGS = frozenset({
    "p", "br", "strong", "b", "em", "i", "u",
    "ul", "ol", "li",
})
_VOID = frozenset({"br"})


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self._stack: List[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
            if tag not in _VOID:
                self._skip += 1
            return
        if self._skip:
            return
        if tag in _VOID:
            self.out.append(f"<{tag}>")
            return
        self._stack.append(tag)
        self.out.append(f"<{tag}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS or tag in _VOID:
            if self._skip and tag not in _VOID:
                self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag in self._stack:
            while self._stack:
                top = self._stack.pop()
                self.out.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if data:
            self.out.append(html.escape(data, quote=False))

    def handle_entityref(self, name: str) -> None:
        self.out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.out.append(f"&#{name};")

    def close(self) -> str:
        while self._stack:
            self.out.append(f"</{self._stack.pop()}>")
        super().close()
        return "".join(self.out)


def sanitize_tema_html(raw: Optional[str]) -> str:
    """Whitelist de etiquetas TipTap usadas en temas."""
    s = (raw or "").strip()
    if not s:
        return ""
    if not re.search(r"</?[a-zA-Z]", s):
        return f"<p>{html.escape(s)}</p>".replace("\n", "<br>")
    parser = _Sanitizer()
    try:
        parser.feed(s)
        return parser.close()
    except Exception:
        return f"<p>{html.escape(s)}</p>"


def html_to_plain_text(raw: Optional[str]) -> str:
    s = sanitize_tema_html(raw)
    if not s:
        return ""
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p\s*>", "\n", s)
    s = re.sub(r"(?i)</li\s*>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def looks_like_html(raw: Optional[str]) -> bool:
    return bool(re.search(r"</?[a-zA-Z]", str(raw or "")))


class _ListNumberer(HTMLParser):
    """Inyecta numeración jerárquica 1. / 1.1. / 1.1.1. (xhtml2pdf no usa CSS counters)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self._ol_stack: List[List[int]] = []  # cada nivel: contador actual
        self._ul_depth = 0
        self._li_pending_marker: Optional[str] = None

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "ol":
            self._ol_stack.append([0])
            self.out.append('<ol style="margin:2pt 0 2pt 14pt;padding:0;list-style:none;">')
            return
        if tag == "ul":
            self._ul_depth += 1
            self.out.append('<ul style="margin:2pt 0 2pt 14pt;padding-left:14pt;">')
            return
        if tag == "li":
            if self._ol_stack:
                self._ol_stack[-1][0] += 1
                nums = [str(level[0]) for level in self._ol_stack]
                self._li_pending_marker = ".".join(nums) + "."
            else:
                self._li_pending_marker = None
            self.out.append('<li style="margin:1pt 0;">')
            if self._li_pending_marker:
                self.out.append(
                    f'<span style="font-weight:700;">{html.escape(self._li_pending_marker)} </span>'
                )
            return
        if tag == "br":
            self.out.append("<br/>")
            return
        if tag in _ALLOWED_TAGS:
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "ol":
            if self._ol_stack:
                self._ol_stack.pop()
            self.out.append("</ol>")
            return
        if tag == "ul":
            self._ul_depth = max(0, self._ul_depth - 1)
            self.out.append("</ul>")
            return
        if tag == "li":
            self.out.append("</li>")
            self._li_pending_marker = None
            return
        if tag in _ALLOWED_TAGS and tag not in _VOID:
            self.out.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if data:
            self.out.append(html.escape(data, quote=False))

    def close(self) -> str:
        super().close()
        return "".join(self.out)


def render_tema_html_for_pdf(raw: Optional[str]) -> str:
    """
    HTML seguro para xhtml2pdf: negrita/cursiva/subrayado + listas.
    Las ol anidadas llevan marcadores explícitos 1. / 1.1. / 1.1.1.
    """
    clean = sanitize_tema_html(raw)
    if not clean:
        return "<div style='color:#94a3b8;'>—</div>"
    parser = _ListNumberer()
    try:
        parser.feed(clean)
        body = parser.close()
    except Exception:
        body = f"<div style='white-space:pre-wrap;'>{html.escape(html_to_plain_text(raw))}</div>"
    return (
        "<div style='font-size:9pt;' class='tema-rich'>"
        f"{body}"
        "</div>"
    )
