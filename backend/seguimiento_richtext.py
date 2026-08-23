"""Sanitizado y render PDF de HTML de temas (TipTap) — stdlib only."""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple


_ALLOWED_TAGS = frozenset({
    "p", "br", "strong", "b", "em", "i", "u",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "colgroup", "col",
})
_VOID = frozenset({"br", "col"})
_ATTR_TAGS = frozenset({"td", "th", "col", "table", "colgroup"})


def _safe_style_width(style: str) -> Optional[str]:
    """Solo conserva width en px/% (ajuste de columnas TipTap / esquemas)."""
    if not style:
        return None
    parts = []
    for chunk in str(style).split(";"):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        prop, val = chunk.split(":", 1)
        prop = prop.strip().lower()
        val = val.strip().lower()
        if prop != "width":
            continue
        if re.fullmatch(r"\d{1,4}(\.\d+)?(px|%)?", val):
            if not val.endswith("px") and not val.endswith("%"):
                val = f"{val}px"
            parts.append(f"width:{val}")
    return ";".join(parts) if parts else None


def _filter_attrs(tag: str, attrs) -> List[Tuple[str, str]]:
    if tag not in _ATTR_TAGS:
        return []
    out: List[Tuple[str, str]] = []
    raw: Dict[str, str] = {}
    for k, v in attrs or []:
        if k is None or v is None:
            continue
        raw[str(k).lower()] = str(v)
    if tag in ("td", "th"):
        for key in ("colspan", "rowspan"):
            if key in raw and re.fullmatch(r"\d{1,2}", raw[key].strip()):
                out.append((key, raw[key].strip()))
        if "colwidth" in raw:
            nums = []
            for part in raw["colwidth"].split(","):
                part = part.strip()
                if re.fullmatch(r"\d{1,4}", part):
                    nums.append(part)
            if nums:
                out.append(("colwidth", ",".join(nums)))
                # Espejo en style width para xhtml2pdf / vista previa
                out.append(("style", f"width:{nums[0]}px"))
        elif "style" in raw:
            sw = _safe_style_width(raw["style"])
            if sw:
                out.append(("style", sw))
    elif tag == "col":
        if "span" in raw and re.fullmatch(r"\d{1,2}", raw["span"].strip()):
            out.append(("span", raw["span"].strip()))
        if "style" in raw:
            sw = _safe_style_width(raw["style"])
            if sw:
                out.append(("style", sw))
        elif "width" in raw and re.fullmatch(r"\d{1,4}(px|%)?", raw["width"].strip().lower()):
            w = raw["width"].strip().lower()
            if not w.endswith("px") and not w.endswith("%"):
                w = f"{w}px"
            out.append(("style", f"width:{w}"))
    elif tag == "table":
        if "style" in raw:
            sw = _safe_style_width(raw["style"])
            if sw:
                out.append(("style", sw))
        out.append(("border", "1"))
        out.append(("cellpadding", "4"))
        out.append(("cellspacing", "0"))
    return out


def _attrs_html(attrs: List[Tuple[str, str]]) -> str:
    if not attrs:
        return ""
    parts = []
    for k, v in attrs:
        parts.append(f' {k}="{html.escape(v, quote=True)}"')
    return "".join(parts)


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
        filtered = _filter_attrs(tag, attrs)
        if tag in _VOID:
            self.out.append(f"<{tag}{_attrs_html(filtered)}>")
            return
        self._stack.append(tag)
        self.out.append(f"<{tag}{_attrs_html(filtered)}>")

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
    """Whitelist de etiquetas TipTap usadas en temas (incluye tablas)."""
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
    s = re.sub(r"(?i)</tr\s*>", "\n", s)
    s = re.sub(r"(?i)</t[dh]\s*>", "\t", s)
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
        self._ol_stack: List[List[int]] = []
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
        if tag == "table":
            filtered = [(k, v) for k, v in _filter_attrs(tag, attrs) if k not in ("border", "cellpadding", "cellspacing")]
            style = "border-collapse:collapse;width:100%;font-size:9pt;margin:4pt 0;"
            for k, v in list(filtered):
                if k == "style" and v.startswith("width:"):
                    style = f"{v};border-collapse:collapse;font-size:9pt;margin:4pt 0;"
                    filtered = [(a, b) for a, b in filtered if a != "style"]
                    break
            self.out.append(
                f'<table border="1" cellpadding="4" cellspacing="0"'
                f'{_attrs_html(filtered)} style="{style}">'
            )
            return
        if tag in ("thead", "tbody", "tr", "colgroup"):
            self.out.append(f"<{tag}>")
            return
        if tag in ("td", "th", "col"):
            filtered = _filter_attrs(tag, attrs)
            # Si ya hay style width, combinar
            style_bits = ['border:0.4pt solid #94a3b8', 'padding:3pt 4pt', 'vertical-align:top']
            for k, v in list(filtered):
                if k == "style" and v.startswith("width:"):
                    style_bits.insert(0, v)
                    filtered = [(a, b) for a, b in filtered if a != "style"]
                    break
            if tag == "th":
                style_bits.append("font-weight:700")
                style_bits.append("background:#f1f5f9")
            if tag != "col":
                self.out.append(f'<{tag}{_attrs_html(filtered)} style="{";".join(style_bits)}">')
            else:
                self.out.append(f"<{tag}{_attrs_html(filtered)}>")
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
        if tag in _VOID:
            return
        if tag in _ALLOWED_TAGS:
            self.out.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if data:
            self.out.append(html.escape(data, quote=False))

    def close(self) -> str:
        super().close()
        return "".join(self.out)


def render_tema_html_for_pdf(raw: Optional[str]) -> str:
    """
    HTML seguro para xhtml2pdf: negrita/cursiva/subrayado + listas + tablas.
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
