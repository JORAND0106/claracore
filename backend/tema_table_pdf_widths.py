"""
Cálculo de anchos de columna para tablas TipTap en PDF.
Combina proporción del editor (colwidth) con longitud de contenido.
"""
from __future__ import annotations

import math
import re
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple


def _width_from_attrs(attrs) -> Optional[float]:
    raw: Dict[str, str] = {}
    for k, v in attrs or []:
        if k is None or v is None:
            continue
        raw[str(k).lower()] = str(v)
    if "colwidth" in raw:
        for part in raw["colwidth"].split(","):
            part = part.strip()
            if re.fullmatch(r"\d{1,4}", part):
                return float(part)
    style = raw.get("style") or ""
    m = re.search(r"width\s*:\s*(\d{1,4}(?:\.\d+)?)(px|%)?", style, re.I)
    if m:
        val = float(m.group(1))
        unit = (m.group(2) or "px").lower()
        if unit == "%":
            # Tratar % del editor como peso relativo (escala 0–100 → px-ish)
            return max(40.0, val * 4.0)
        return val
    return None


def blend_column_weights(
    editor_widths: List[float],
    content_chars: List[float],
    *,
    content_weight: float = 0.65,
    editor_weight: float = 0.35,
    min_pct: float = 6.0,
) -> List[float]:
    """
    Devuelve porcentajes (suma ≈ 100) a partir de anchos del editor y
    longitud de texto por columna.
    """
    n = max(len(editor_widths), len(content_chars), 1)
    ew = list(editor_widths) + [0.0] * max(0, n - len(editor_widths))
    cc = list(content_chars) + [1.0] * max(0, n - len(content_chars))
    ew = ew[:n]
    cc = cc[:n]

    if sum(ew) <= 0:
        ew = [max(1.0, c) for c in cc]
    else:
        for i in range(n):
            if ew[i] <= 0:
                ew[i] = max(40.0, cc[i] * 4.0)

    # sqrt suaviza columnas con un solo texto muy largo
    content_score = [max(1.0, math.sqrt(max(1.0, c))) for c in cc]

    def _norm(arr: List[float]) -> List[float]:
        s = sum(arr) or 1.0
        return [x / s for x in arr]

    e_n = _norm(ew)
    c_n = _norm(content_score)
    cw = max(0.0, min(1.0, content_weight))
    ewgt = max(0.0, min(1.0, editor_weight))
    if cw + ewgt <= 0:
        cw, ewgt = 0.65, 0.35
    scale = cw + ewgt
    cw, ewgt = cw / scale, ewgt / scale
    blended = [cw * c_n[i] + ewgt * e_n[i] for i in range(n)]
    blended = [max(min_pct / 100.0, b) for b in blended]
    blended = _norm(blended)
    pcts = [round(b * 100.0, 1) for b in blended]
    if pcts:
        pcts[-1] = round(100.0 - sum(pcts[:-1]), 1)
    return pcts


class _TablePlanCollector(HTMLParser):
    """Recorre HTML sanitizado y planifica % por columna de cada tabla."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.plans: List[List[float]] = []
        self._in_table = 0
        self._rows: List[List[dict]] = []
        self._row: Optional[List[dict]] = None
        self._cell: Optional[dict] = None
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "table":
            self._in_table += 1
            if self._in_table == 1:
                self._rows = []
                self._row = None
                self._cell = None
            return
        if self._in_table != 1:
            return
        if tag == "tr":
            self._row = []
            return
        if tag in ("td", "th") and self._row is not None:
            colspan = 1
            for k, v in attrs or []:
                if str(k).lower() == "colspan" and str(v).isdigit():
                    colspan = max(1, int(v))
            self._cell = {
                "width": _width_from_attrs(attrs),
                "text": "",
                "colspan": colspan,
            }
            return
        if tag in ("script", "style"):
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("script", "style") and self._skip_depth:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._in_table != 1 and tag != "table":
            if tag == "table" and self._in_table:
                self._in_table -= 1
            return
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            cell = self._cell
            self._cell = None
            # Expandir colspan: primer slot guarda width/text; resto vacíos
            self._row.append(cell)
            for _ in range(cell["colspan"] - 1):
                self._row.append({"width": None, "text": "", "colspan": 1})
            return
        if tag == "tr" and self._row is not None:
            self._rows.append(self._row)
            self._row = None
            return
        if tag == "table":
            if self._in_table == 1:
                self.plans.append(self._plan_from_rows(self._rows))
                self._rows = []
            self._in_table = max(0, self._in_table - 1)

    def handle_data(self, data: str) -> None:
        if self._skip_depth or self._cell is None:
            return
        if data:
            self._cell["text"] += data

    @staticmethod
    def _plan_from_rows(rows: List[List[dict]]) -> List[float]:
        if not rows:
            return [100.0]
        ncols = max((len(r) for r in rows), default=1)
        editor = [0.0] * ncols
        content = [1.0] * ncols
        for r in rows:
            for i, cell in enumerate(r):
                if i >= ncols:
                    break
                w = cell.get("width")
                if w:
                    editor[i] = max(editor[i], float(w))
                # Solo contar texto en la celda "principal" del colspan
                if cell.get("colspan", 1) >= 1:
                    content[i] = max(content[i], float(len(str(cell.get("text") or "").strip()) or 1))
        return blend_column_weights(editor, content)


def plan_table_column_pcts(html: str) -> List[List[float]]:
    """Lista de planes (porcentajes) en orden de aparición de <table>."""
    if not html or "<table" not in html.lower():
        return []
    p = _TablePlanCollector()
    try:
        p.feed(html)
        p.close()
    except Exception:
        return []
    return p.plans
