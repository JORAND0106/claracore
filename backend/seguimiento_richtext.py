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
    """Inyecta numeración jerárquica 1. / 1.1. / 1.1.1. (xhtml2pdf no usa CSS counters).
    Aplica anchos de columna en % según plan (contenido + proporción editor).
    """

    def __init__(self, table_plans: Optional[List[List[float]]] = None) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self._ol_stack: List[List[int]] = []
        self._ul_depth = 0
        self._li_pending_marker: Optional[str] = None
        self._table_plans = list(table_plans or [])
        self._table_idx = -1
        self._col_idx = 0
        self._in_table_depth = 0
        self._pending_colgroup = False
        self._skip_colgroup = 0

    def _current_plan(self) -> Optional[List[float]]:
        if 0 <= self._table_idx < len(self._table_plans):
            return self._table_plans[self._table_idx]
        return None

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
            self._in_table_depth += 1
            if self._in_table_depth == 1:
                self._table_idx += 1
                self._col_idx = 0
                self._pending_colgroup = True
            filtered = [
                (k, v) for k, v in _filter_attrs(tag, attrs)
                if k not in ("border", "cellpadding", "cellspacing")
            ]
            # Siempre 100% del ancho disponible; los % de columna viven en col/td.
            style = "border-collapse:collapse;width:100%;font-size:9pt;margin:4pt 0;table-layout:fixed;"
            filtered = [(a, b) for a, b in filtered if a != "style"]
            self.out.append(
                f'<table border="1" cellpadding="4" cellspacing="0"'
                f'{_attrs_html(filtered)} style="{style}">'
            )
            plan = self._current_plan()
            if self._pending_colgroup and plan:
                cols = "".join(
                    f'<col style="width:{pct}%;"/>' for pct in plan
                )
                self.out.append(f"<colgroup>{cols}</colgroup>")
                self._pending_colgroup = False
            return
        if tag in ("thead", "tbody", "colgroup"):
            # Ignorar colgroup original del editor: ya inyectamos el planificado.
            if tag == "colgroup":
                self._skip_colgroup = getattr(self, "_skip_colgroup", 0) + 1
                return
            self.out.append(f"<{tag}>")
            return
        if tag == "col":
            if getattr(self, "_skip_colgroup", 0):
                return
            self.out.append("<col>")
            return
        if tag == "tr":
            self._col_idx = 0
            self.out.append("<tr>")
            return
        if tag in ("td", "th"):
            filtered = _filter_attrs(tag, attrs)
            # Quitar width px absolutos; usar % del plan.
            filtered = [(a, b) for a, b in filtered if a != "style" and a != "colwidth"]
            style_bits = [
                "border:0.4pt solid #94a3b8",
                "padding:3pt 4pt",
                "vertical-align:top",
                "word-wrap:break-word",
            ]
            plan = self._current_plan() if self._in_table_depth == 1 else None
            colspan = 1
            for k, v in filtered:
                if k == "colspan" and str(v).isdigit():
                    colspan = max(1, int(v))
            if plan and self._col_idx < len(plan):
                # Suma de % cubiertos por colspan
                span_pct = sum(plan[self._col_idx:self._col_idx + colspan])
                style_bits.insert(0, f"width:{round(span_pct, 1)}%")
            if tag == "th":
                style_bits.append("font-weight:700")
                style_bits.append("background:#f1f5f9")
            self.out.append(f'<{tag}{_attrs_html(filtered)} style="{";".join(style_bits)}">')
            self._col_idx += colspan
            return
        if tag in _ALLOWED_TAGS:
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "colgroup":
            if getattr(self, "_skip_colgroup", 0):
                self._skip_colgroup = max(0, self._skip_colgroup - 1)
            return
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
        if tag == "table":
            self.out.append("</table>")
            self._in_table_depth = max(0, self._in_table_depth - 1)
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
    Tablas: anchos en % según contenido + proporción relativa del editor.
    """
    from tema_table_pdf_widths import plan_table_column_pcts

    clean = sanitize_tema_html(raw)
    if not clean:
        return "<div style='color:#94a3b8;'>—</div>"
    plans = plan_table_column_pcts(clean)
    parser = _ListNumberer(table_plans=plans)
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
