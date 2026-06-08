"""
Fase 4 — Curva S: inversión acumulada baseline / vigente / ejecutado.
"""
from __future__ import annotations

import html
import re
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from prog_obra_compare import fetch_compare_nodes
from prog_obra_costos_presupuesto import (
    apply_ppto_cost_overlay,
    build_cost_overlay_maps,
    fetch_ppto_borrador_version_id,
)
from prog_obra_pk_filter import filter_nodes_by_pk, parse_pk_ids_param
from prog_obra_service import fetch_baseline_version_id, fetch_vigente_meta


def _parse_d(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()[:10]
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_label(key: str) -> str:
    y, m = key.split("-")
    meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    return f"{meses[int(m) - 1]} {y}"


def _linear_monthly_distribution(fi: date, ff: date, costo: float) -> Dict[str, float]:
    """Distribuye costo linealmente por mes entre fi y ff (inclusive)."""
    if costo <= 0 or not fi or not ff or ff < fi:
        return {}
    total_days = (ff - fi).days + 1
    if total_days <= 0:
        return {}
    out: Dict[str, float] = defaultdict(float)
    cur = fi
    while cur <= ff:
        mk = _month_key(cur)
        month_end = date(cur.year, cur.month, monthrange(cur.year, cur.month)[1])
        seg_end = min(ff, month_end)
        days = (seg_end - cur).days + 1
        out[mk] += costo * (days / total_days)
        cur = seg_end + timedelta(days=1)
    return dict(out)


def _nodes_with_ppto_costs(
    sb,
    version_id: str,
    contrato_id: int,
    version_ppto_id: Optional[str],
) -> Dict[str, dict]:
    nodes = fetch_compare_nodes(sb, version_id, contrato_id)
    if not version_ppto_id:
        return nodes
    ag_costs, item_costs = build_cost_overlay_maps(sb, contrato_id, str(version_ppto_id))
    return apply_ppto_cost_overlay(nodes, ag_costs, item_costs)


def _aggregate_version_monthly(
    sb,
    version_id: str,
    contrato_id: int,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[str, float], float]:
    nodes = _nodes_with_ppto_costs(sb, version_id, contrato_id, version_ppto_id)
    nodes = filter_nodes_by_pk(nodes, pk_ids)
    monthly: Dict[str, float] = defaultdict(float)
    total = 0.0
    for n in nodes.values():
        costo = float(n.get("costo_programado") or 0)
        if costo <= 0:
            continue
        fi = n.get("fecha_inicio")
        ff = n.get("fecha_fin")
        if not fi or not ff:
            continue
        total += costo
        for mk, part in _linear_monthly_distribution(fi, ff, costo).items():
            monthly[mk] += part
    return dict(monthly), total


def _registro_aprobado(row: dict) -> bool:
    for n in (6, 5, 4, 3, 2, 1):
        st = (row.get(f"nivel{n}_estado") or "").strip().lower()
        if st in ("aprobado", "validación aprobada", "validacion aprobada"):
            return True
    return False


def _fecha_aprobacion(row: dict) -> Optional[date]:
    for n in (6, 5, 4, 3, 2, 1):
        st = (row.get(f"nivel{n}_estado") or "").strip().lower()
        if st in ("aprobado", "validación aprobada", "validacion aprobada"):
            return _parse_d(row.get(f"nivel{n}_fecha"))
    return None


def _fetch_ejecutado_mensual(sb, contrato_id: int) -> Tuple[Dict[str, float], float]:
    """Ejecutado real desde so_registros aprobados, agrupado por mes de aprobación."""
    monthly: Dict[str, float] = defaultdict(float)
    total = 0.0
    off = 0
    cols = (
        "costo_directo,cantidad_total,vlr_unitario,"
        "nivel1_estado,nivel1_fecha,nivel2_estado,nivel2_fecha,"
        "nivel3_estado,nivel3_fecha,nivel4_estado,nivel4_fecha,"
        "nivel5_estado,nivel5_fecha,nivel6_estado,nivel6_fecha"
    )
    while True:
        batch = (
            sb.table("so_registros")
            .select(cols)
            .eq("contrato_id", int(contrato_id))
            .range(off, off + 999)
            .execute()
            .data
            or []
        )
        for r in batch:
            if not _registro_aprobado(r):
                continue
            costo = float(r.get("costo_directo") or 0)
            if costo <= 0:
                cant = float(r.get("cantidad_total") or 0)
                vlr = float(r.get("vlr_unitario") or 0)
                costo = cant * vlr
            if costo <= 0:
                continue
            fd = _fecha_aprobacion(r)
            if not fd:
                continue
            mk = _month_key(fd)
            monthly[mk] += costo
            total += costo
        if len(batch) < 1000:
            break
        off += 1000
    return dict(monthly), total


def _detalle_pk_mensual(
    sb,
    version_id: str,
    contrato_id: int,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
) -> List[dict]:
    nodes = _nodes_with_ppto_costs(sb, version_id, contrato_id, version_ppto_id)
    nodes = filter_nodes_by_pk(nodes, pk_ids)
    out: List[dict] = []
    for n in nodes.values():
        costo = float(n.get("costo_programado") or 0)
        fi = n.get("fecha_inicio")
        ff = n.get("fecha_fin")
        if costo <= 0 or not fi or not ff:
            continue
        dist = _linear_monthly_distribution(fi, ff, costo)
        out.append(
            {
                "pk_id": n.get("pk_id"),
                "capitulo": n.get("capitulo"),
                "agrupador_id": n.get("agrupador_id"),
                "label": n.get("label"),
                "costo_total": round(costo, 2),
                "distribucion_mensual": {k: round(v, 2) for k, v in dist.items()},
            }
        )
    return out


def _resolve_version_ppto_id(sb, contrato_id: int, version_ppto_id: Optional[str]) -> Optional[str]:
    vid = (version_ppto_id or "").strip()
    if vid:
        return vid
    return fetch_ppto_borrador_version_id(sb, contrato_id)


def build_curva_s(
    sb,
    contrato_id: int,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[str] = None,
) -> dict:
    pk_set = parse_pk_ids_param(pk_ids)
    bid = (baseline_id or fetch_baseline_version_id(sb, contrato_id) or "").strip() or None
    tid = (target_id or "").strip()
    if not tid:
        vid, _ = fetch_vigente_meta(sb, contrato_id)
        tid = str(vid) if vid else ""
    tid = tid.strip() or None
    if not tid and not bid:
        raise ValueError("No hay versión de programación para la curva S")

    ppto_id = _resolve_version_ppto_id(sb, contrato_id, version_ppto_id)

    if bid:
        base_m, base_total = _aggregate_version_monthly(
            sb, str(bid), contrato_id, ppto_id, pk_ids=pk_set
        )
    else:
        base_m, base_total = {}, 0.0

    if tid:
        tgt_m, tgt_total = _aggregate_version_monthly(
            sb, str(tid), contrato_id, ppto_id, pk_ids=pk_set
        )
        if bid and str(tid) == str(bid):
            tgt_m, tgt_total = base_m, base_total
    elif bid:
        tgt_m, tgt_total = base_m, base_total
        tid = bid
    else:
        tgt_m, tgt_total = {}, 0.0

    ej_m, ej_total = _fetch_ejecutado_mensual(sb, contrato_id)

    all_months = sorted(set(base_m.keys()) | set(tgt_m.keys()) | set(ej_m.keys()))
    if not all_months:
        all_months = [_month_key(date.today())]

    rows: List[dict] = []
    acc_b = acc_t = acc_e = 0.0
    hoy = date.today()
    hoy_key = _month_key(hoy)

    for mk in all_months:
        acc_b += float(base_m.get(mk, 0))
        acc_t += float(tgt_m.get(mk, 0))
        acc_e += float(ej_m.get(mk, 0))
        delta_v = ((acc_t - acc_b) / acc_b * 100) if acc_b > 0 else 0.0
        delta_e = ((acc_e - acc_b) / acc_b * 100) if acc_b > 0 else 0.0
        rows.append(
            {
                "mes": mk,
                "mes_label": _month_label(mk),
                "baseline_mes": round(float(base_m.get(mk, 0)), 2),
                "vigente_mes": round(float(tgt_m.get(mk, 0)), 2),
                "ejecutado_mes": round(float(ej_m.get(mk, 0)), 2),
                "baseline_acum": round(acc_b, 2),
                "vigente_acum": round(acc_t, 2),
                "ejecutado_acum": round(acc_e, 2),
                "delta_vigente_pct": round(delta_v, 1),
                "delta_ejecutado_pct": round(delta_e, 1),
            }
        )

    prog_a_fecha = acc_t if hoy_key in base_m or hoy_key in tgt_m else acc_t
    ej_a_fecha = acc_e
    presupuesto_total = max(base_total, tgt_total)
    pct_prog = (prog_a_fecha / presupuesto_total * 100) if presupuesto_total > 0 else 0.0
    pct_ej = (ej_a_fecha / presupuesto_total * 100) if presupuesto_total > 0 else 0.0
    desv = ej_a_fecha - prog_a_fecha
    desv_pct = (desv / prog_a_fecha * 100) if prog_a_fecha > 0 else 0.0

    detalle_baseline = (
        _detalle_pk_mensual(sb, str(bid), contrato_id, ppto_id, pk_ids=pk_set) if bid else []
    )
    detalle_vigente = (
        _detalle_pk_mensual(sb, str(tid), contrato_id, ppto_id, pk_ids=pk_set)
        if tid and (not bid or str(tid) != str(bid))
        else detalle_baseline
    )

    return {
        "baseline_id": str(bid) if bid else None,
        "target_id": str(tid) if tid else None,
        "version_ppto_id": ppto_id,
        "indicadores": {
            "presupuesto_total": round(presupuesto_total, 2),
            "programado_a_fecha": round(prog_a_fecha, 2),
            "programado_pct": round(pct_prog, 1),
            "ejecutado_a_fecha": round(ej_a_fecha, 2),
            "ejecutado_pct": round(pct_ej, 1),
            "desviacion_valor": round(desv, 2),
            "desviacion_pct": round(desv_pct, 1),
        },
        "meses": rows,
        "detalle_pk": {
            "baseline": detalle_baseline,
            "vigente": detalle_vigente,
        },
    }


MAX_ESCENARIOS_CURVA_S = 5


def build_curva_s_escenarios(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_ids: List[str],
) -> dict:
    """Comparación de flujo de inversión con el mismo cronograma y distintos presupuestos."""
    if not version_ppto_ids:
        raise ValueError("version_ppto_ids requerido")
    if len(version_ppto_ids) > MAX_ESCENARIOS_CURVA_S:
        raise ValueError(f"Máximo {MAX_ESCENARIOS_CURVA_S} versiones de presupuesto por comparación")

    from prog_obra_costos_presupuesto import assert_ppto_version_contrato

    series: List[dict] = []
    all_months: set = set()
    for ppto_id in version_ppto_ids:
        vrow = assert_ppto_version_contrato(sb, contrato_id, str(ppto_id))
        monthly, total = _aggregate_version_monthly(
            sb, str(version_prog_id), contrato_id, str(ppto_id)
        )
        all_months.update(monthly.keys())
        series.append(
            {
                "version_ppto_id": str(ppto_id),
                "numero_version": int(vrow.get("numero_version") or 0),
                "etiqueta": (vrow.get("etiqueta") or "").strip(),
                "es_vigente_aprobada": bool(vrow.get("es_vigente_aprobada")),
                "es_vigente": bool(vrow.get("es_vigente")),
                "costo_total": round(total, 2),
                "distribucion_mensual": {k: round(v, 2) for k, v in monthly.items()},
            }
        )

    if not all_months:
        all_months = {_month_key(date.today())}

    meses_sorted = sorted(all_months)
    acc_by_ppto: Dict[str, float] = {s["version_ppto_id"]: 0.0 for s in series}
    filas: List[dict] = []
    for mk in meses_sorted:
        row: dict = {"mes": mk, "mes_label": _month_label(mk), "series": {}}
        for s in series:
            pid = s["version_ppto_id"]
            acc_by_ppto[pid] += float(s["distribucion_mensual"].get(mk, 0))
            row["series"][pid] = round(acc_by_ppto[pid], 2)
        filas.append(row)

    return {
        "version_prog_id": str(version_prog_id),
        "escenarios": series,
        "meses": filas,
    }


def _cap_sort_key(c: str) -> tuple:
    s = (c or "").strip()
    m = re.match(r"^(\d+)", s)
    if m:
        return (0, int(m.group(1)), s)
    return (1, 0, s)


def _h(val: Any) -> str:
    return html.escape(str(val if val is not None else ""))


def _fmt_duracion(val: Any) -> str:
    if val is None or val == "":
        return "—"
    try:
        return str(int(val))
    except (TypeError, ValueError):
        return "—"


def fetch_cronograma_pdf_tree(
    sb,
    version_id: str,
    contrato_id: int,
    pk_ids: Optional[Set[str]] = None,
) -> List[dict]:
    """Árbol PK → capítulo → agrupador WBS → ítems para PDF cronograma."""
    from prog_obra_costos_presupuesto import _fetch_agrupadores_meta
    from prog_obra_service import _listado_agrupador_por_item

    vid = (version_id or "").strip()
    if not vid:
        return []

    act_rows = (
        sb.table("prog_actividades")
        .select(
            "pk_id,capitulo,item,fecha_inicio,fecha_fin_calculada,duracion_dias_habiles,"
            "agrupador_id,codigo_wbs"
        )
        .eq("version_id", vid)
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )

    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)
    _, desc_lp = _listado_agrupador_por_item(sb, contrato_id)

    headers: Dict[Tuple[str, str, int], dict] = {}
    items_map: Dict[Tuple[str, str, int], List[dict]] = defaultdict(list)

    for r in act_rows:
        pk = str(r.get("pk_id") or "").strip()
        if pk_ids and pk not in pk_ids:
            continue
        cap = str(r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        if not pk or not cap or ag_raw is None:
            continue
        fi = r.get("fecha_inicio")
        if not fi:
            continue
        ag_id = int(ag_raw)
        key = (pk, cap, ag_id)
        meta = ag_meta.get(ag_id) or {}
        wbs = str(r.get("codigo_wbs") or meta.get("codigo_wbs") or f"AG{ag_id}").strip()
        item = str(r.get("item") or "").strip()
        row_base = {
            "item": item,
            "descripcion": (desc_lp.get((cap, item)) or "").strip(),
            "fecha_inicio": str(fi)[:10],
            "fecha_fin": str(r.get("fecha_fin_calculada") or "")[:10] or "—",
            "duracion_dias_habiles": r.get("duracion_dias_habiles"),
        }
        if item == wbs or item.replace(" ", "") == wbs.replace(" ", ""):
            headers[key] = {
                **row_base,
                "codigo_wbs": wbs,
                "nombre": (meta.get("nombre") or wbs).strip(),
                "agrupador_id": ag_id,
                "orden": meta.get("orden") or 0,
            }
        else:
            items_map[key].append(row_base)

    if not headers:
        return []

    by_pk: Dict[str, Dict[str, List[dict]]] = defaultdict(lambda: defaultdict(list))
    for (pk, cap, ag_id), hdr in headers.items():
        hijos = sorted(
            items_map.get((pk, cap, ag_id), []),
            key=lambda x: (_cap_sort_key(x["item"]), x["item"]),
        )
        by_pk[pk][cap].append({**hdr, "items": hijos})

    tree: List[dict] = []
    for pk in sorted(by_pk.keys(), key=lambda x: (len(x), x)):
        cap_list = []
        for cap in sorted(by_pk[pk].keys(), key=_cap_sort_key):
            ags = sorted(
                by_pk[pk][cap],
                key=lambda a: (a.get("orden") or 0, a.get("codigo_wbs") or ""),
            )
            cap_list.append({"capitulo": cap, "agrupadores": ags})
        tree.append({"pk_id": pk, "capitulos": cap_list})
    return tree


CRONO_ROWS_PER_PAGE = 30

# Paleta PDF alineada al sistema (grises, azules y celestes pastel)
PDF_CLR = {
    "title": "#1e40af",
    "text": "#334155",
    "muted": "#64748b",
    "border": "#cbd5e1",
    "border_light": "#e2e8f0",
    "bg_page": "#f8fafc",
    "bg_kpi": "#eff6ff",
    "bg_header": "#dbeafe",
    "header_text": "#1e3a8a",
    "row_pk": "#e2e8f0",
    "row_cap": "#f1f5f9",
    "row_ag": "#e0f2fe",
    "accent": "#2563eb",
    "accent_soft": "#93c5fd",
    "negative": "#b91c1c",
    "line_baseline": "#1e40af",
    "line_vigente": "#38bdf8",
    "line_ejecutado": "#64748b",
}


def _pdf_th_style(extra: str = "") -> str:
    return (
        f"background:{PDF_CLR['bg_header']};color:{PDF_CLR['header_text']};"
        f"padding:4px 5px;font-size:6.5pt;font-weight:bold;border-bottom:1px solid {PDF_CLR['border']};{extra}"
    )


def _fmt_axis_money(v: float) -> str:
    if v >= 1e9:
        return f"${v / 1e9:.1f}B"
    if v >= 1e6:
        return f"${v / 1e6:.1f}M"
    return f"${v:,.0f}"


def _build_curva_s_chart_svg(meses: List[dict], width: int = 920, height: int = 240) -> str:
    """Curva S en SVG generado en código a partir de meses (baseline/vigente/ejecutado acum.)."""
    c = PDF_CLR
    if not meses:
        return (
            f'<div style="height:100px;text-align:center;color:{c["muted"]};font-size:8pt;padding-top:40px;">'
            "Sin datos para el gráfico"
            "</div>"
        )

    ml, mr, mt, mb = 58, 20, 22, 36
    pw = width - ml - mr
    ph = height - mt - mb
    series = [
        ("Baseline", "baseline_acum", c["line_baseline"], 2.5),
        ("Vigente", "vigente_acum", c["line_vigente"], 2.0),
        ("Ejecutado", "ejecutado_acum", c["line_ejecutado"], 2.0),
    ]

    vals: List[float] = []
    for r in meses:
        for _, key, _, _ in series:
            try:
                vals.append(float(r.get(key) or 0))
            except (TypeError, ValueError):
                vals.append(0.0)
    max_y = max(vals) if vals else 1.0
    if max_y <= 0:
        max_y = 1.0
    max_y *= 1.08

    n = len(meses)

    def x_at(i: int) -> float:
        if n <= 1:
            return ml + pw / 2
        return ml + (i / (n - 1)) * pw

    def y_at(v: float) -> float:
        return mt + ph - (float(v) / max_y) * ph

    parts: List[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    ]

    # Leyenda
    lx = ml
    for label, _, color, _ in series:
        parts.append(f'<line x1="{lx}" y1="10" x2="{lx + 16}" y2="10" stroke="{color}" stroke-width="2.5"/>')
        parts.append(
            f'<text x="{lx + 20}" y="13" font-size="8" fill="{c["text"]}" font-family="Helvetica,Arial,sans-serif">'
            f"{_h(label)}</text>"
        )
        lx += 110

    # Cuadrícula Y y eje
    parts.append(
        f'<line x1="{ml}" y1="{mt}" x2="{ml}" y2="{mt + ph:.1f}" stroke="{c["border"]}" stroke-width="0.8"/>'
    )
    parts.append(
        f'<line x1="{ml}" y1="{mt + ph:.1f}" x2="{ml + pw:.1f}" y2="{mt + ph:.1f}" '
        f'stroke="{c["border"]}" stroke-width="0.8"/>'
    )

    for t in range(6):
        y = mt + ph - (t / 5) * ph
        val = max_y * t / 5
        parts.append(
            f'<line x1="{ml}" y1="{y:.1f}" x2="{ml + pw:.1f}" y2="{y:.1f}" '
            f'stroke="{c["border_light"]}" stroke-width="0.8" stroke-dasharray="4,3"/>'
        )
        parts.append(
            f'<text x="{ml - 5}" y="{y + 3:.1f}" text-anchor="end" font-size="7.5" '
            f'fill="{c["muted"]}" font-family="Helvetica,Arial,sans-serif">'
            f"{_h(_fmt_axis_money(val))}</text>"
        )

    parts.append(
        f'<rect x="{ml}" y="{mt}" width="{pw:.1f}" height="{ph:.1f}" fill="{c["bg_page"]}" '
        f'stroke="none"/>'
    )

    for i, r in enumerate(meses):
        x = x_at(i)
        lbl = str(r.get("mes_label") or "")[:10]
        parts.append(
            f'<text x="{x:.1f}" y="{height - 8}" text-anchor="middle" font-size="7.5" '
            f'fill="{c["muted"]}" font-family="Helvetica,Arial,sans-serif">'
            f"{_h(lbl)}</text>"
        )

    for _, key, color, sw in series:
        pts: List[str] = []
        for i, r in enumerate(meses):
            try:
                v = float(r.get(key) or 0)
            except (TypeError, ValueError):
                v = 0.0
            pts.append(f"{x_at(i):.1f},{y_at(v):.1f}")
        if pts:
            parts.append(
                f'<polyline fill="none" stroke="{color}" stroke-width="{sw}" '
                f'stroke-linejoin="round" stroke-linecap="round" '
                f'points="{" ".join(pts)}"/>'
            )

    parts.append("</svg>")
    return "".join(parts)


def _build_curva_s_chart_block(meses: List[dict]) -> str:
    """Contenedor del gráfico SVG incrustado en página 1 del PDF."""
    c = PDF_CLR
    svg = _build_curva_s_chart_svg(meses)
    return (
        f'<div style="width:920px;height:240px;margin:4px 0 8px;overflow:hidden;'
        f'background:{c["bg_page"]};border:1px solid {c["border_light"]};">{svg}</div>'
    )


def _flatten_cronograma_rows(tree: List[dict]) -> List[dict]:
    flat: List[dict] = []
    for pk_node in tree:
        flat.append({"kind": "pk", "pk_id": pk_node["pk_id"]})
        for cap_node in pk_node.get("capitulos") or []:
            flat.append({"kind": "cap", "capitulo": cap_node["capitulo"]})
            for ag in cap_node.get("agrupadores") or []:
                flat.append({"kind": "ag", **ag})
                for it in ag.get("items") or []:
                    flat.append({"kind": "item", **it})
    return flat


def _chunk_cronograma_rows(flat: List[dict], per_page: int = CRONO_ROWS_PER_PAGE) -> List[List[dict]]:
    """Pagina cronograma: cada PK inicia en página nueva; el overflow del mismo PK continúa."""
    if not flat:
        return [[]]

    chunks: List[List[dict]] = []
    i = 0
    while i < len(flat):
        if flat[i].get("kind") != "pk":
            i += 1
            continue
        pk_block: List[dict] = []
        while i < len(flat):
            pk_block.append(flat[i])
            i += 1
            if i < len(flat) and flat[i].get("kind") == "pk":
                break
        start = 0
        while start < len(pk_block):
            chunks.append(pk_block[start : start + per_page])
            start += per_page
    return chunks if chunks else [[]]


def _html_footer_logo_contratista(contrato: dict) -> str:
    from informes import _html_logo_contratista

    return _html_logo_contratista(contrato, compact=True, compact_box_height="0.48cm")


def _ppto_version_label(ppto_meta: Optional[dict]) -> str:
    if not ppto_meta:
        return "—"
    n = ppto_meta.get("numero_version")
    et = (ppto_meta.get("etiqueta") or "").strip()
    if n is not None and et:
        return f"v{int(n)} · {et}"
    if et:
        return et
    if n is not None:
        return f"Versión {int(n)}"
    return "—"


def _prog_version_label(prog_meta: Optional[dict]) -> str:
    if not prog_meta:
        return "—"
    n = prog_meta.get("numero_version")
    tipo = (prog_meta.get("tipo") or "").strip()
    if n is not None and tipo:
        return f"v{int(n)} ({tipo})"
    if n is not None:
        return f"v{int(n)}"
    return tipo or "—"


def _render_cronograma_body_rows(rows: List[dict]) -> str:
    if not rows:
        return (
            '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;font-size:8pt;">'
            "Sin actividades programadas en esta versión."
            "</td></tr>"
        )
    out: List[str] = []
    c = PDF_CLR
    for r in rows:
        kind = r.get("kind")
        if kind == "pk":
            out.append(
                f'<tr style="background:{c["row_pk"]};">'
                f'<td colspan="5" style="padding:4px 6px;font-size:8pt;font-weight:bold;color:{c["text"]};">'
                f"PK {_h(r.get('pk_id'))}</td></tr>"
            )
        elif kind == "cap":
            out.append(
                f'<tr style="background:{c["row_cap"]};">'
                f'<td colspan="5" style="padding:3px 6px;font-size:7.5pt;font-weight:bold;color:{c["text"]};">'
                f"Capítulo {_h(r.get('capitulo'))}</td></tr>"
            )
        elif kind == "ag":
            nombre = f"{r.get('codigo_wbs') or ''} · {r.get('nombre') or ''}".strip(" ·")
            out.append(
                f"<tr style=\"background:{c['row_ag']};\">"
                f"<td style=\"padding:3px 6px;font-size:7.5pt;font-weight:bold;color:{c['text']};\">{_h(nombre)}</td>"
                f"<td style=\"padding:3px 6px;font-size:7.5pt;\">{_h(r.get('fecha_inicio'))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7.5pt;\">{_h(r.get('fecha_fin'))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7.5pt;text-align:center;\">{_h(_fmt_duracion(r.get('duracion_dias_habiles')))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7pt;color:{c['muted']};\">Agrupador WBS</td>"
                f"</tr>"
            )
        elif kind == "item":
            desc = (r.get("descripcion") or "").strip()
            label = f"{r.get('item') or ''}"
            if desc:
                label = f"{label} · {desc}"
            out.append(
                f"<tr>"
                f"<td style=\"padding:3px 6px 3px 18px;font-size:7pt;\">{_h(label)}</td>"
                f"<td style=\"padding:3px 6px;font-size:7pt;\">{_h(r.get('fecha_inicio'))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7pt;\">{_h(r.get('fecha_fin'))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7pt;text-align:center;\">{_h(_fmt_duracion(r.get('duracion_dias_habiles')))}</td>"
                f"<td style=\"padding:3px 6px;font-size:7pt;color:#94a3b8;\">Ítem</td>"
                f"</tr>"
            )
    return "".join(out)


def _render_cronograma_page(
    contrato: dict,
    body_rows: List[dict],
    prog_meta: Optional[dict],
    fecha_gen: str,
    *,
    page_num: int,
    total_pages: int,
) -> str:
    from informes import _html_logo_contratista

    logo_html = _html_logo_contratista(contrato, compact=True, compact_box_height="0.85cm")
    prog_lbl = _prog_version_label(prog_meta)
    numero = _h(contrato.get("numero") or contrato.get("id") or "")
    objeto = _h(contrato.get("objeto") or "—")
    tbody = _render_cronograma_body_rows(body_rows)
    pag = f"Página {page_num} de {total_pages}" if total_pages > 1 else ""
    c = PDF_CLR
    th = _pdf_th_style

    return f"""
<div class="page-cronograma">
  <div class="frame-double-outer">
    <div class="frame-double-inner">
      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:14%;vertical-align:middle;text-align:center;border:0.5px solid {c['border']};padding:2px;">
            {logo_html}
          </td>
          <td style="width:62%;vertical-align:middle;text-align:center;border:0.5px solid {c['border']};padding:4px 6px;">
            <div style="font-size:11pt;font-weight:bold;color:{c['text']};text-transform:uppercase;line-height:1.15;">
              Cronograma de Programación de Obra
            </div>
          </td>
          <td style="width:24%;vertical-align:middle;text-align:center;border:0.5px solid {c['border']};padding:4px;">
            <div style="font-size:6pt;color:{c['muted']};text-transform:uppercase;font-weight:bold;">Versión programación</div>
            <div style="font-size:9pt;font-weight:bold;color:{c['accent']};margin-top:2px;">{_h(prog_lbl)}</div>
          </td>
        </tr>
      </table>
      <div style="font-size:7pt;color:{c['text']};margin-bottom:6px;padding:0 2px;line-height:1.35;">
        <strong>Contrato:</strong> {numero} · <strong>Objeto:</strong> {objeto}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Generado:</strong> {_h(fecha_gen)}
        {f'&nbsp;&nbsp;|&nbsp;&nbsp;<span style="color:{c["muted"]};">{_h(pag)}</span>' if pag else ''}
      </div>
      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="{th('text-align:left;width:46%;')}">Actividad / WBS</th>
            <th style="{th('text-align:left;width:14%;')}">Inicio</th>
            <th style="{th('text-align:left;width:14%;')}">Fin</th>
            <th style="{th('text-align:center;width:12%;')}">Días háb.</th>
            <th style="{th('text-align:left;width:14%;')}">Tipo</th>
          </tr>
        </thead>
        <tbody>{tbody}</tbody>
      </table>
    </div>
  </div>
</div>
"""


def build_curva_s_pdf_html(
    contrato: dict,
    data: dict,
    *,
    cronograma: Optional[List[dict]] = None,
    prog_meta: Optional[dict] = None,
    ppto_meta: Optional[dict] = None,
    fecha_generacion: Optional[str] = None,
) -> str:
    """HTML multipágina: curva S (pág. 1) + cronograma WBS (pág. 2+)."""
    from informes import _fmt_informe_fecha_generacion

    ind = data.get("indicadores") or {}
    meses = data.get("meses") or []
    fecha_gen = (fecha_generacion or "").strip() or _fmt_informe_fecha_generacion()
    titulo = f"Curva S — Contrato {_h(contrato.get('numero') or contrato.get('id') or '')}"
    contratista = _h(contrato.get("contratista") or "—")
    interventoria = _h(contrato.get("interventoria") or "—")
    numero_cto = _h(contrato.get("numero") or contrato.get("id") or "—")
    objeto_cto = _h(contrato.get("objeto") or "—")
    ppto_lbl = _h(_ppto_version_label(ppto_meta))

    rows_html = ""
    for r in meses:
        rows_html += (
            f"<tr>"
            f"<td>{_h(r.get('mes_label'))}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('baseline_mes') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('baseline_acum') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('vigente_mes') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('vigente_acum') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('ejecutado_mes') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">${float(r.get('ejecutado_acum') or 0):,.0f}</td>"
            f"<td style=\"text-align:right;\">{_h(r.get('delta_vigente_pct'))}%</td>"
            f"<td style=\"text-align:right;\">{_h(r.get('delta_ejecutado_pct'))}%</td>"
            f"</tr>"
        )

    desv_val = float(ind.get("desviacion_valor") or 0)
    desv_color = PDF_CLR["negative"] if desv_val < 0 else PDF_CLR["accent"]
    chart_block = _build_curva_s_chart_block(meses)

    c = PDF_CLR
    lbl = f"font-size:5.5pt;font-weight:bold;color:{c['muted']};text-transform:uppercase;letter-spacing:0.2px;"
    val = f"font-size:7pt;color:{c['text']};margin-top:1px;line-height:1.15;"
    logo_contratista = _html_footer_logo_contratista(contrato)

    footer_html = f"""
<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:8px;border-top:1px solid {c['border']};">
  <tr>
    <td style="width:18%;vertical-align:middle;padding:3px 4px 2px 0;border-right:1px solid {c['border_light']};">
      <div style="{lbl}">Logo contratista</div>
      <div style="{val}">{logo_contratista}</div>
    </td>
    <td style="width:32%;vertical-align:top;padding:3px 4px 2px 6px;border-right:1px solid {c['border_light']};">
      <div style="{lbl}">Contratista · Interventoría</div>
      <div style="{val}"><strong>{contratista}</strong><br/>Interventoría: {interventoria}</div>
    </td>
    <td style="width:50%;vertical-align:top;padding:3px 0 2px 6px;">
      <div style="{lbl}">Contrato · Objeto</div>
      <div style="{val}"><strong>Nº {numero_cto}</strong> · {objeto_cto}</div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="vertical-align:top;padding:3px 4px 2px 0;border-right:1px solid {c['border_light']};border-top:1px solid {c['border_light']};">
      <div style="{lbl}">Versión presupuesto activa</div>
      <div style="{val}">{ppto_lbl}</div>
    </td>
    <td style="vertical-align:top;padding:3px 0 2px 6px;border-top:1px solid {c['border_light']};">
      <div style="{lbl}">Fecha y hora de generación</div>
      <div style="{val}">{_h(fecha_gen)}</div>
    </td>
  </tr>
</table>
"""

    flat_crono = _flatten_cronograma_rows(cronograma or [])
    crono_chunks = _chunk_cronograma_rows(flat_crono)
    crono_pages_html = ""
    total_crono = len(crono_chunks)
    for idx, chunk in enumerate(crono_chunks, start=1):
        crono_pages_html += _render_cronograma_page(
            contrato,
            chunk,
            prog_meta,
            fecha_gen,
            page_num=idx,
            total_pages=total_crono,
        )

    th = _pdf_th_style
    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/>
<style>
@page {{ size: A4 landscape; margin: 0.9cm; }}
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: {c['text']}; margin: 0; padding: 0; }}
.page-curva {{ page-break-after: always; }}
.page-cronograma {{ page-break-after: always; }}
.page-cronograma:last-child {{ page-break-after: auto; }}
.frame-thin {{ border: 1px solid #000; padding: 10px 12px; box-sizing: border-box; }}
.frame-double-outer {{ border: 2px solid #000; padding: 3px; min-height: 17.5cm; box-sizing: border-box; }}
.frame-double-inner {{ border: 1px solid #000; padding: 8px 10px; min-height: calc(17.5cm - 12px); box-sizing: border-box; }}
.title {{ color: {c['title']}; font-size: 14pt; font-weight: bold; margin: 0 0 2px; }}
.sub {{ color: {c['muted']}; font-size: 8pt; margin-bottom: 8px; }}
table.data {{ width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }}
table.data th {{ {_pdf_th_style('text-align:left;font-size:6pt;')} }}
table.data td {{ border-bottom: 1px solid {c['border_light']}; padding: 3px 4px; font-size: 6.5pt; }}
</style></head><body>
<div class="page-curva">
  <div class="frame-thin">
    <div class="title">{titulo}</div>
    <div class="sub">{objeto_cto} · {contratista} · Interventoría: {interventoria}</div>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:{c['bg_kpi']};margin-bottom:8px;border:1px solid {c['border_light']};">
      <tr>
        <td style="padding:5px 8px;font-size:8pt;white-space:nowrap;color:{c['text']};">
          Presupuesto total: <strong style="color:{c['accent']};">${float(ind.get('presupuesto_total') or 0):,.0f}</strong>
          &nbsp;&nbsp;&nbsp;Programado a la fecha: <strong style="color:{c['accent']};">${float(ind.get('programado_a_fecha') or 0):,.0f} ({ind.get('programado_pct')}%)</strong>
          &nbsp;&nbsp;&nbsp;Ejecutado a la fecha: <strong style="color:{c['accent']};">${float(ind.get('ejecutado_a_fecha') or 0):,.0f} ({ind.get('ejecutado_pct')}%)</strong>
          &nbsp;&nbsp;&nbsp;Desviación: <strong style="color:{desv_color};">${desv_val:,.0f} ({ind.get('desviacion_pct')}%)</strong>
        </td>
      </tr>
    </table>
    {chart_block}
    <table class="data">
      <thead><tr>
        <th style="{th('width:8%;')}">Mes</th>
        <th style="{th('text-align:right;width:10%;')}">Base. mes</th>
        <th style="{th('text-align:right;width:10%;')}">Base. acum.</th>
        <th style="{th('text-align:right;width:10%;')}">Vig. mes</th>
        <th style="{th('text-align:right;width:10%;')}">Vig. acum.</th>
        <th style="{th('text-align:right;width:10%;')}">Ejec. mes</th>
        <th style="{th('text-align:right;width:10%;')}">Ejec. acum.</th>
        <th style="{th('text-align:right;width:8%;')}">Δ Vig.</th>
        <th style="{th('text-align:right;width:8%;')}">Δ Ejec.</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    {footer_html}
  </div>
</div>
{crono_pages_html}
</body></html>"""
