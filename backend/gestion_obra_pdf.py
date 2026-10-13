"""HTML de la sección Gestión de obra para el PDF del acta.

Criterios de legibilidad (NTC 1486 adaptada al marco del acta):
- Cuerpo del informe ≥ 11 pt; tablas ≥ 9 pt.
- Tablas y figuras a ancho útil completo (márgenes del acta sin cambiar).
- Anchos de columna explícitos (xhtml2pdf no estira tablas sin ellos).
- Tablas/figuras numeradas + línea de fuente.
- Subtotales como filas de la tabla de cantidades.
"""
from __future__ import annotations

import base64
import html
import io
from typing import Any, Dict, List, Optional, Tuple

_COLOR = "#0f172a"
_BORDE = "#334155"
_BORDE_SUAVE = "#94a3b8"
_BG_H = "#1e293b"
_FG_H = "#ffffff"
_AUSENCIA_BG = "#fde68a"

# NTC 1486: cuerpo ≥ 11 pt; tablas = cuerpo − 2 pt → 9 pt.
_FS_BODY = "11pt"
_FS_TABLE = "9pt"
_FS_CAPTION = "9pt"
_FS_SOURCE = "9pt"
_FS_TITLE = "12pt"
_FS_SEC = "11pt"

_CHART_COLORS = [
    "#2563eb", "#0f766e", "#b45309", "#7c3aed",
    "#be123c", "#0369a1", "#15803d", "#a16207",
]
_MESES = (
    "ene.", "feb.", "mar.", "abr.", "may.", "jun.",
    "jul.", "ago.", "sept.", "oct.", "nov.", "dic.",
)


def _esc(v: Any) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _parse_ymd(raw) -> Optional[Tuple[int, int, int]]:
    s = str(raw or "")[:10]
    if len(s) < 10 or s[4] != "-" or s[7] != "-":
        return None
    try:
        return int(s[0:4]), int(s[5:7]), int(s[8:10])
    except ValueError:
        return None


def _dia_mes(raw) -> str:
    p = _parse_ymd(raw)
    if not p:
        s = str(raw or "")
        return s[5:] if len(s) >= 10 else s
    y, m, d = p
    return f"{d} {_MESES[m - 1]}"


def _money(n) -> str:
    try:
        from contrato_numero_letras import formato_pesos_cop
        return f"$ {formato_pesos_cop(n)}"
    except Exception:
        try:
            return f"$ {int(round(float(n))):,}".replace(",", ".")
        except (TypeError, ValueError):
            return "—"


def _truncate(text: str, max_chars: int = 140) -> str:
    t = " ".join(str(text or "").split())
    if len(t) <= max_chars:
        return t
    cut = t[: max_chars - 1].rsplit(" ", 1)[0]
    return (cut or t[: max_chars - 1]).rstrip(",.;:") + "…"


def _fuente(modulo: str, d0: str, d1: str) -> str:
    return (
        f"<div style='font-size:{_FS_SOURCE};color:#64748b;font-style:italic;"
        f"margin:1pt 0 8pt;'>Fuente: ClaraCore, módulo { _esc(modulo) }, "
        f"semana del {_esc(d0)} al {_esc(d1)}.</div>"
    )


def _caption(kind: str, n: int, title: str) -> str:
    # Sin page-break-after:avoid: con figuras grandes xhtml2pdf deja el título
    # solo al pie de página y mueve la imagen (franja en blanco).
    return (
        f"<div style='font-size:{_FS_CAPTION};font-weight:700;color:{_COLOR};"
        f"margin:6pt 0 3pt;'>"
        f"{_esc(kind)} {n}. {_esc(title)}</div>"
    )


def _obs_block(obs_html: str, render_rich) -> str:
    if not (obs_html or "").strip():
        return ""
    return (
        f"<div style='margin:4pt 0 8pt;padding:5pt 7pt;border:0.5pt dashed {_BORDE_SUAVE};"
        f"font-size:{_FS_TABLE};'>"
        f"<b>Observaciones:</b> {render_rich(obs_html)}</div>"
    )


def _bar_chart_png(
    categories: List[str],
    series: List[Dict[str, Any]],
    *,
    width_px: int = 900,
    height_px: int = 220,
) -> Optional[str]:
    """Barras agrupadas → PNG data-URI. ``series``: [{name, values, color?}]."""
    if not categories or not series:
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return None

    n_cat = len(categories)
    n_ser = len(series)
    vals: List[List[float]] = []
    for s in series:
        row = []
        for v in (s.get("values") or []):
            try:
                row.append(float(v or 0))
            except (TypeError, ValueError):
                row.append(0.0)
        while len(row) < n_cat:
            row.append(0.0)
        vals.append(row[:n_cat])
    ymax = max((max(r) if r else 0) for r in vals) if vals else 0
    if ymax <= 0:
        return None

    left, right, top, bottom = 48, 16, 12, 52
    img = Image.new("RGB", (width_px, height_px), "#ffffff")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    plot_w = width_px - left - right
    plot_h = height_px - top - bottom
    # Eje Y
    draw.line([(left, top), (left, top + plot_h), (left + plot_w, top + plot_h)], fill="#94a3b8", width=1)
    for tick in range(5):
        yv = ymax * tick / 4
        yy = top + plot_h - (plot_h * tick / 4)
        draw.line([(left - 3, yy), (left + plot_w, yy)], fill="#e2e8f0", width=1)
        label = str(int(round(yv))) if abs(yv - round(yv)) < 1e-6 else f"{yv:.1f}"
        draw.text((4, yy - 6), label, fill="#64748b", font=font)

    group_w = plot_w / max(n_cat, 1)
    bar_w = max(4, int(group_w * 0.7 / max(n_ser, 1)))
    gap = max(1, int(bar_w * 0.15))

    for ci, cat in enumerate(categories):
        gx = left + ci * group_w
        for si, s in enumerate(series):
            v = vals[si][ci]
            bh = int(plot_h * (v / ymax)) if ymax else 0
            x0 = int(gx + group_w * 0.15 + si * (bar_w + gap))
            y0 = top + plot_h - bh
            color = s.get("color") or _CHART_COLORS[si % len(_CHART_COLORS)]
            draw.rectangle([x0, y0, x0 + bar_w, top + plot_h], fill=color)
        # etiqueta categoría
        lab = str(cat)[:10]
        tw = draw.textlength(lab, font=font) if hasattr(draw, "textlength") else len(lab) * 6
        draw.text(
            (gx + group_w / 2 - tw / 2, top + plot_h + 4),
            lab, fill="#334155", font=font,
        )

    # Leyenda
    lx = left
    ly = height_px - 18
    for si, s in enumerate(series):
        color = s.get("color") or _CHART_COLORS[si % len(_CHART_COLORS)]
        draw.rectangle([lx, ly, lx + 10, ly + 10], fill=color)
        name = str(s.get("name") or "")[:18]
        draw.text((lx + 14, ly - 1), name, fill="#334155", font=font)
        lx += 14 + (len(name) * 6) + 16
        if lx > width_px - 80:
            break

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _simple_bars_png(items: List[Dict[str, Any]], *, width_px: int = 780, height_px: int = 180) -> Optional[str]:
    """Barras simples: items [{nombre, valor}]."""
    data = [x for x in items if x and float(x.get("valor") or 0) > 0][:12]
    if not data:
        return None
    cats = [str(x.get("nombre") or "")[:14] for x in data]
    vals = [float(x.get("valor") or 0) for x in data]
    return _bar_chart_png(
        cats,
        [{"name": "Valor", "values": vals, "color": _CHART_COLORS[0]}],
        width_px=width_px,
        height_px=height_px,
    )


def _fig_html(uri: Optional[str], caption: str, fuente_html: str) -> str:
    if not uri:
        return ""
    # Imagen primero; título y fuente debajo (NTC: pie de figura).
    # Sin envolver en tabla: evita KeepTogether/escalado de xhtml2pdf.
    return (
        f"<div style='margin:6pt 0 0;text-align:center;'>"
        f"<img src=\"{uri}\" width=\"540\" height=\"138\" "
        f"style=\"width:540pt;height:138pt;\"/>"
        f"</div>"
        f"<div style='text-align:left;'>{caption}{fuente_html}</div>"
    )


def _matrix_table(
    label_col: str,
    dias: List[str],
    rows: List[dict],
    *,
    last_col: str = "Máximo diario",
    shade_ausencias: bool = False,
) -> str:
    if not rows:
        return ""
    n_dias = max(len(dias), 1)
    # Anchos explícitos: etiqueta 24 %, días reparten 60 %, máximo 16 %.
    w_label = 24.0
    w_last = 16.0
    w_day = round((100.0 - w_label - w_last) / n_dias, 2)

    th_cells = (
        f"<th width='{w_label}%' style='padding:4pt 5pt;border:0.5pt solid {_BORDE_SUAVE};"
        f"background:{_BG_H};color:{_FG_H};font-size:{_FS_TABLE};text-align:left;'>"
        f"{_esc(label_col)}</th>"
    )
    for d in dias:
        th_cells += (
            f"<th width='{w_day}%' style='padding:4pt 3pt;border:0.5pt solid {_BORDE_SUAVE};"
            f"background:{_BG_H};color:{_FG_H};font-size:{_FS_TABLE};text-align:center;'>"
            f"{_esc(_dia_mes(d))}</th>"
        )
    th_cells += (
        f"<th width='{w_last}%' style='padding:4pt 5pt;border:0.5pt solid {_BORDE_SUAVE};"
        f"background:{_BG_H};color:{_FG_H};font-size:{_FS_TABLE};text-align:right;'>"
        f"{_esc(last_col)}</th>"
    )

    body = ""
    for r in rows[:50]:
        por = r.get("por_dia") or {}
        aus = r.get("ausencias_por_dia") or {}
        max_d = r.get("max_diario")
        if max_d is None:
            max_d = r.get("total")
        bold = "font-weight:700;" if r.get("es_total_dia") else ""
        tds = (
            f"<td width='{w_label}%' style='padding:3pt 5pt;border:0.5pt solid #e2e8f0;"
            f"font-size:{_FS_TABLE};text-align:left;{bold}'>"
            f"{_esc(r.get('label')) or '—'}</td>"
        )
        for d in dias:
            v = por.get(d)
            n_aus = 0
            if shade_ausencias:
                try:
                    n_aus = int(aus.get(d) or 0)
                except (TypeError, ValueError):
                    n_aus = 0
            bg = f"background:{_AUSENCIA_BG};" if n_aus > 0 else ""
            cell = "" if v in (None, 0, 0.0) else str(v)
            tds += (
                f"<td width='{w_day}%' style='padding:3pt 3pt;border:0.5pt solid #e2e8f0;"
                f"font-size:{_FS_TABLE};text-align:right;{bg}'>"
                f"{_esc(cell) or '—'}</td>"
            )
        tds += (
            f"<td width='{w_last}%' style='padding:3pt 5pt;border:0.5pt solid #e2e8f0;"
            f"font-size:{_FS_TABLE};text-align:right;font-weight:700;'>"
            f"{_esc(max_d) if max_d is not None else '—'}</td>"
        )
        body += f"<tr>{tds}</tr>"

    colgroup = (
        f"<colgroup><col width='{w_label}%'/>"
        + "".join(f"<col width='{w_day}%'/>" for _ in dias)
        + f"<col width='{w_last}%'/></colgroup>"
    )
    return (
        f"<table width='100%' cellspacing='0' cellpadding='0' "
        f"style='width:100%;margin:0 0 2pt;'>"
        f"{colgroup}<thead><tr>{th_cells}</tr></thead><tbody>{body}</tbody></table>"
    )


def _data_table(
    headers: List[Tuple[str, str, str]],
    rows: List[dict],
    *,
    max_rows: int = 80,
) -> str:
    """headers: (key, label, align) con anchos opcionales en key via 'key|pct'."""
    if not rows:
        return ""
    parsed = []
    for h in headers:
        key, lab, align = h[0], h[1], h[2]
        pct = None
        if "|" in key:
            key, pct_s = key.split("|", 1)
            try:
                pct = float(pct_s)
            except ValueError:
                pct = None
        parsed.append((key, lab, align, pct))
    # Si faltan %, repartir
    known = sum(p[3] or 0 for p in parsed)
    missing = [i for i, p in enumerate(parsed) if p[3] is None]
    rem = max(0.0, 100.0 - known)
    each = rem / len(missing) if missing else 0
    widths = []
    for i, p in enumerate(parsed):
        widths.append(p[3] if p[3] is not None else each)

    th = ""
    for i, (key, lab, align, _p) in enumerate(parsed):
        th += (
            f"<th width='{widths[i]}%' style='padding:4pt 5pt;border:0.5pt solid {_BORDE_SUAVE};"
            f"background:{_BG_H};color:{_FG_H};font-size:{_FS_TABLE};text-align:{align};'>"
            f"{_esc(lab)}</th>"
        )
    body = ""
    for r in rows[:max_rows]:
        if r.get("_is_subtotal") or r.get("_is_total"):
            bg = "background:#f1f5f9;"
            fw = "font-weight:700;"
        else:
            bg = ""
            fw = ""
        tds = ""
        for i, (key, lab, align, _p) in enumerate(parsed):
            val = r.get(key)
            if val is None or val == "":
                cell = "" if (r.get("_is_subtotal") or r.get("_is_total")) else "—"
            else:
                cell = _esc(val)
            tds += (
                f"<td width='{widths[i]}%' style='padding:3pt 5pt;border:0.5pt solid #e2e8f0;"
                f"font-size:{_FS_TABLE};text-align:{align};{bg}{fw}'>"
                f"{cell}</td>"
            )
        body += f"<tr>{tds}</tr>"
    colgroup = "<colgroup>" + "".join(
        f"<col width='{w}%'/>" for w in widths
    ) + "</colgroup>"
    return (
        f"<table width='100%' cellspacing='0' cellpadding='0' "
        f"style='width:100%;margin:0 0 2pt;'>"
        f"{colgroup}<thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>"
    )


def render_gestion_obra_pdf_html(acta: dict, *, render_rich) -> str:
    """Cuerpo HTML de Gestión de obra (sin el marco de sección del acta)."""
    go = acta.get("gestion_obra") if isinstance(acta.get("gestion_obra"), dict) else None
    if not go or not isinstance(go.get("datos"), dict):
        return (
            f"<div style='color:#94a3b8;font-size:{_FS_BODY};'>"
            "Sin consolidado de Gestión de obra para este acta."
            "</div>"
        )

    datos = go.get("datos") or {}
    obs = go.get("observaciones") if isinstance(go.get("observaciones"), dict) else {}
    d0_raw = str(go.get("fecha_desde") or "")[:10]
    d1_raw = str(go.get("fecha_hasta") or "")[:10]
    d0 = _esc(d0_raw)
    d1 = _esc(d1_raw)

    informe = go.get("informe") if isinstance(go.get("informe"), dict) else None
    if not informe:
        try:
            from gestion_obra_service import build_informe_redactado
            informe = build_informe_redactado(
                datos, d0_raw, d1_raw,
                ver_valores_cantidades=bool(go.get("ver_valores_cantidades")),
                ver_valores_almacen=bool(go.get("ver_valores_almacen")),
            )
        except Exception:
            informe = None

    n_tabla = 0
    n_figura = 0
    parts: List[str] = []

    # Encabezado de período (el título de sección lo pone _section)
    parts.append(
        f"<div style='font-size:{_FS_BODY};margin:0 0 8pt;color:#334155;'>"
        f"<b>Período:</b> {d0} — {d1}"
        f"</div>"
    )

    if informe:
        tit = _esc(informe.get("titulo") or "Informe de gestión de obra")
        parts.append(
            f"<div style='margin:0 0 10pt;padding:8pt 10pt;border:0.6pt solid {_BORDE_SUAVE};"
            f"background:#f8fafc;'>"
            f"<div style='font-size:{_FS_TITLE};font-weight:700;margin:0 0 6pt;color:{_COLOR};'>"
            f"{tit}</div>"
        )
        for p in informe.get("parrafos") or []:
            if not isinstance(p, dict):
                continue
            parts.append(
                f"<div style='margin:0 0 7pt;'>"
                f"<div style='font-size:{_FS_BODY};font-weight:700;color:#334155;margin:0 0 2pt;'>"
                f"{_esc(p.get('titulo') or '')}</div>"
                f"<div style='font-size:{_FS_BODY};color:{_COLOR};line-height:1.35;"
                f"text-align:justify;'>{_esc(p.get('texto') or '')}</div></div>"
            )
        parts.append("</div>")

    # ——— 1. Personal y jornada ———
    parts.append(
        f"<div style='font-size:{_FS_SEC};font-weight:700;margin:10pt 0 4pt;color:{_COLOR};'>"
        f"1. Personal y jornada</div>"
    )
    pj = datos.get("personal_jornada") or {}
    if not pj.get("disponible"):
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#64748b;margin:0 0 8pt;'>"
            f"{_esc(pj.get('mensaje') or 'Sin datos.')}</div>"
        )
    else:
        dias = pj.get("dias") or []
        series_p = (pj.get("personal") or {}).get("series") or []
        uri_p = _simple_bars_png(series_p)
        if uri_p:
            n_figura += 1
            parts.append(_fig_html(
                uri_p,
                _caption("Figura", n_figura, "Personal por empresa (máximo de personas en un día)"),
                _fuente("Bitácora", d0_raw, d1_raw),
            ))

        for emp in (pj.get("personal") or {}).get("empresas") or []:
            n_tabla += 1
            emp_name = emp.get("empresa") or "Empresa"
            mx = emp.get("max_diario")
            if mx is None:
                mx = emp.get("total")
            parts.append(_caption(
                "Tabla", n_tabla,
                f"Personal por cargo y día — {emp_name} (máximo diario {mx})",
            ))
            parts.append(_matrix_table(
                "Cargo",
                dias,
                [
                    {
                        "label": f.get("cargo"),
                        "por_dia": f.get("por_dia"),
                        "max_diario": f.get("max_diario", f.get("total")),
                        "ausencias_por_dia": f.get("ausencias_por_dia"),
                        "es_total_dia": f.get("es_total_dia"),
                    }
                    for f in (emp.get("filas") or [])
                ],
                shade_ausencias=True,
            ))
            parts.append(_fuente("Bitácora", d0_raw, d1_raw))

        if pj.get("convencion_ausentismo"):
            parts.append(
                f"<div style='font-size:{_FS_TABLE};color:#475569;margin:0 0 6pt;'>"
                f"<span style='background:{_AUSENCIA_BG};padding:0 5pt;'>[x]</span> "
                f"{_esc(pj.get('convencion_ausentismo'))}</div>"
            )
        aus = pj.get("ausentismo") or {}
        jor = pj.get("jornada") or {}
        extra = []
        if aus.get("disponible"):
            extra.append(f"Ausentismo: {aus.get('ausentes') or 0} ausencia(s) en el rango.")
        else:
            extra.append(aus.get("mensaje") or "Ausentismo: no registrado.")
        if jor.get("disponible"):
            extra.append(
                f"Jornada: promedio {jor.get('promedio_horas')} h "
                f"({jor.get('registros') or 0} registro(s))."
            )
        else:
            extra.append(jor.get("mensaje") or "Jornada: no registrada.")
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#334155;margin:0 0 6pt;'>"
            + " ".join(_esc(x) for x in extra)
            + "</div>"
        )

        maq = pj.get("maquinaria") or {}
        series_m = maq.get("series") or []
        uri_m = _simple_bars_png(series_m)
        if uri_m:
            n_figura += 1
            parts.append(_fig_html(
                uri_m,
                _caption("Figura", n_figura, "Maquinaria por equipo (máximo en un día)"),
                _fuente("Bitácora", d0_raw, d1_raw),
            ))
        maq_filas = maq.get("filas") or []
        if maq_filas and isinstance(maq_filas[0], dict) and "por_dia" in maq_filas[0]:
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, "Maquinaria por equipo y día"))
            parts.append(_matrix_table(
                "Equipo",
                dias,
                [
                    {
                        "label": f.get("equipo"),
                        "por_dia": f.get("por_dia"),
                        "max_diario": f.get("max_diario", f.get("total")),
                    }
                    for f in maq_filas
                ],
            ))
            parts.append(_fuente("Bitácora", d0_raw, d1_raw))

    parts.append(_obs_block(obs.get("personal_jornada") or "", render_rich))

    # ——— 2. Cantidades ———
    parts.append(
        f"<div style='font-size:{_FS_SEC};font-weight:700;margin:10pt 0 4pt;color:{_COLOR};'>"
        f"2. Cantidades de obra</div>"
    )
    co = datos.get("cantidades_obra") or {}
    ver_cant = bool(co.get("ver_valores") if "ver_valores" in co else go.get("ver_valores_cantidades"))
    if not co.get("disponible"):
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#64748b;margin:0 0 8pt;'>"
            f"{_esc(co.get('mensaje') or 'Sin cantidades.')}</div>"
        )
    else:
        for tr in co.get("tramos") or []:
            parts.append(
                f"<div style='font-size:{_FS_BODY};font-weight:700;margin:6pt 0 3pt;'>"
                f"Tramo: {_esc(tr.get('tramo'))}</div>"
            )
            for cap in tr.get("capitulos") or []:
                n_tabla += 1
                parts.append(_caption(
                    "Tabla", n_tabla,
                    f"Cantidades — capítulo {cap.get('capitulo') or ''}",
                ))
                rows = []
                for it in cap.get("items") or []:
                    row = {
                        "item_numero": it.get("item_numero"),
                        "item_descripcion": _truncate(it.get("item_descripcion") or "", 95),
                        "unidad": it.get("unidad"),
                        "cantidad": it.get("cantidad"),
                    }
                    if ver_cant:
                        row["vlr_unitario"] = (
                            _money(it.get("vlr_unitario"))
                            if it.get("vlr_unitario") is not None else "—"
                        )
                        row["valor_total"] = (
                            _money(it.get("valor_total"))
                            if it.get("valor_total") is not None else "—"
                        )
                    rows.append(row)
                if ver_cant and cap.get("subtotal_valor") is not None:
                    rows.append({
                        "_is_subtotal": True,
                        "item_numero": "",
                        "item_descripcion": "Subtotal capítulo",
                        "unidad": "",
                        "cantidad": "",
                        "vlr_unitario": "",
                        "valor_total": _money(cap.get("subtotal_valor")),
                    })
                    # Celdas vacías del subtotal: espacio, no guión.
                if ver_cant:
                    headers = [
                        ("item_numero|8", "Ítem", "left"),
                        ("item_descripcion|44", "Descripción", "left"),
                        ("unidad|7", "Unidad", "center"),
                        ("cantidad|11", "Cantidad", "right"),
                        ("vlr_unitario|15", "Valor unitario", "right"),
                        ("valor_total|15", "Valor total", "right"),
                    ]
                else:
                    headers = [
                        ("item_numero|10", "Ítem", "left"),
                        ("item_descripcion|58", "Descripción", "left"),
                        ("unidad|10", "Unidad", "center"),
                        ("cantidad|22", "Cantidad", "right"),
                    ]
                parts.append(_data_table(headers, rows))
                parts.append(_fuente("SICOE Obra", d0_raw, d1_raw))

        if ver_cant and co.get("total_general_valor") is not None:
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, "Total general de cantidades del período"))
            parts.append(_data_table(
                [
                    ("concepto|70", "Concepto", "left"),
                    ("valor_total|30", "Valor total", "right"),
                ],
                [{
                    "_is_total": True,
                    "concepto": "Total general de la semana",
                    "valor_total": _money(co.get("total_general_valor")),
                }],
            ))
            parts.append(_fuente("SICOE Obra", d0_raw, d1_raw))
        if co.get("registros_sin_item"):
            parts.append(
                f"<div style='font-size:{_FS_TABLE};color:#64748b;margin:0 0 6pt;'>"
                f"{_esc(co.get('registros_sin_item'))} registro(s) sin ítem asignado; "
                "no se valoran.</div>"
            )

    parts.append(_obs_block(obs.get("cantidades_obra") or "", render_rich))

    # ——— 3. Actividades ———
    parts.append(
        f"<div style='font-size:{_FS_SEC};font-weight:700;margin:10pt 0 4pt;color:{_COLOR};'>"
        f"3. Actividades adicionales</div>"
    )
    ac = datos.get("actividades") or {}
    if not ac.get("disponible"):
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#64748b;margin:0 0 8pt;'>"
            f"{_esc(ac.get('mensaje') or 'Sin actividades.')}</div>"
        )
    else:
        series_a = [
            {"nombre": _dia_mes(s.get("nombre")), "valor": s.get("valor")}
            for s in (ac.get("series") or [])
            if isinstance(s, dict)
        ]
        uri_a = _simple_bars_png(series_a)
        if uri_a:
            n_figura += 1
            parts.append(_fig_html(
                uri_a,
                _caption("Figura", n_figura, "Actividades adicionales por día"),
                _fuente("Bitácora", d0_raw, d1_raw),
            ))
        filas_a = []
        for f in ac.get("filas") or []:
            filas_a.append({
                "fecha": f.get("fecha"),
                "tramo": f.get("tramo"),
                "actividad": _truncate(f.get("actividad") or "", 80),
                "detalle": _truncate(f.get("detalle") or "", 100),
            })
        if filas_a:
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, "Actividades adicionales reportadas"))
            parts.append(_data_table(
                [
                    ("fecha|14", "Fecha", "left"),
                    ("tramo|16", "Tramo", "left"),
                    ("actividad|30", "Actividad", "left"),
                    ("detalle|40", "Detalle", "left"),
                ],
                filas_a,
            ))
            parts.append(_fuente("Bitácora", d0_raw, d1_raw))

    parts.append(_obs_block(obs.get("actividades") or "", render_rich))

    # ——— 4. Almacén ———
    parts.append(
        f"<div style='font-size:{_FS_SEC};font-weight:700;margin:10pt 0 4pt;color:{_COLOR};'>"
        f"4. Almacén</div>"
    )
    al = datos.get("almacen") or {}
    ver_alm = bool(al.get("ver_valores") if "ver_valores" in al else go.get("ver_valores_almacen"))
    if not al.get("disponible"):
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#64748b;margin:0 0 8pt;'>"
            f"{_esc(al.get('mensaje') or 'Sin almacén.')}</div>"
        )
    else:
        spd = al.get("series_por_dia") or []
        if spd:
            cats = [_dia_mes(x.get("fecha")) for x in spd]
            uri_al = _bar_chart_png(
                cats,
                [
                    {"name": "Creadas", "values": [x.get("creadas") or 0 for x in spd], "color": _CHART_COLORS[0]},
                    {"name": "Gestionadas", "values": [x.get("gestionadas") or 0 for x in spd], "color": _CHART_COLORS[1]},
                    {"name": "Aprobadas", "values": [x.get("aprobadas") or 0 for x in spd], "color": _CHART_COLORS[2]},
                    {"name": "Pendientes", "values": [x.get("pendientes") or 0 for x in spd], "color": _CHART_COLORS[4]},
                ],
            )
            if uri_al:
                n_figura += 1
                parts.append(_fig_html(
                    uri_al,
                    _caption("Figura", n_figura, "Solicitudes de almacén por día"),
                    _fuente("Almacén", d0_raw, d1_raw),
                ))

        sols = []
        for s in al.get("solicitudes") or []:
            if not isinstance(s, dict):
                continue
            row = {
                "fecha": s.get("fecha"),
                "solicitante": _truncate(s.get("solicitante") or "", 40),
                "insumos_resumen": _truncate(s.get("insumos_resumen") or "", 60),
                "estado": s.get("estado"),
            }
            if ver_alm:
                row["valor"] = _money(s.get("valor")) if s.get("valor") is not None else "—"
            sols.append(row)
        if sols:
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, "Solicitudes de almacén"))
            if ver_alm:
                parts.append(_data_table(
                    [
                        ("fecha|12", "Fecha", "left"),
                        ("solicitante|24", "Solicitante", "left"),
                        ("insumos_resumen|28", "Insumos", "left"),
                        ("valor|18", "Valor", "right"),
                        ("estado|18", "Estado", "left"),
                    ],
                    sols,
                ))
            else:
                parts.append(_data_table(
                    [
                        ("fecha|14", "Fecha", "left"),
                        ("solicitante|28", "Solicitante", "left"),
                        ("insumos_resumen|36", "Insumos", "left"),
                        ("estado|22", "Estado", "left"),
                    ],
                    sols,
                ))
            parts.append(_fuente("Almacén", d0_raw, d1_raw))

        for titulo, key in (("Entradas", "entradas"), ("Salidas", "salidas")):
            rows_es = al.get(key) or []
            if not rows_es:
                continue
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, titulo))
            parts.append(_data_table(
                [
                    ("fecha|30", "Fecha", "left"),
                    ("estado|35", "Estado", "left"),
                    ("ref|35", "Referencia", "left"),
                ],
                rows_es,
            ))
            parts.append(_fuente("Almacén", d0_raw, d1_raw))

    parts.append(_obs_block(obs.get("almacen") or "", render_rich))

    # ——— 5. Programación ———
    parts.append(
        f"<div style='font-size:{_FS_SEC};font-weight:700;margin:10pt 0 4pt;color:{_COLOR};'>"
        f"5. Programación de obra</div>"
    )
    pr = datos.get("programacion") or {}
    if not pr.get("disponible"):
        parts.append(
            f"<div style='font-size:{_FS_BODY};color:#334155;margin:0 0 8pt;'>"
            f"{_esc(pr.get('mensaje') or 'Sin programación.')}</div>"
        )
    else:
        parts.append(
            f"<div style='font-size:{_FS_BODY};margin:0 0 4pt;'>Programación cargada.</div>"
        )
        if pr.get("versiones"):
            n_tabla += 1
            parts.append(_caption("Tabla", n_tabla, "Versiones de programación"))
            parts.append(_data_table(
                [
                    ("numero|20", "Número", "left"),
                    ("tipo|40", "Tipo", "left"),
                    ("estado|40", "Estado", "left"),
                ],
                pr.get("versiones") or [],
            ))
            parts.append(_fuente("Programación de obra", d0_raw, d1_raw))
        alertas = pr.get("alertas") or []
        if alertas:
            parts.append("<ul style='margin:4pt 0 8pt;padding-left:16pt;"
                         f"font-size:{_FS_BODY};'>")
            for a in alertas[:15]:
                parts.append(f"<li>{_esc(a)}</li>")
            parts.append("</ul>")

    parts.append(_obs_block(obs.get("programacion") or "", render_rich))

    return "".join(parts)
