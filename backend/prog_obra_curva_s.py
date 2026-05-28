"""
Fase 4 — Curva S: inversión acumulada baseline / vigente / ejecutado.
"""
from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from prog_obra_compare import fetch_compare_nodes
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


def _aggregate_version_monthly(sb, version_id: str, contrato_id: int) -> Tuple[Dict[str, float], float]:
    nodes = fetch_compare_nodes(sb, version_id, contrato_id)
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


def _detalle_pk_mensual(sb, version_id: str, contrato_id: int) -> List[dict]:
    nodes = fetch_compare_nodes(sb, version_id, contrato_id)
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


def build_curva_s(
    sb,
    contrato_id: int,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
) -> dict:
    bid = baseline_id or fetch_baseline_version_id(sb, contrato_id)
    tid = target_id
    if not tid:
        vid, _ = fetch_vigente_meta(sb, contrato_id)
        tid = vid
    if not bid:
        raise ValueError("No hay baseline sellada para la curva S")

    base_m, base_total = _aggregate_version_monthly(sb, str(bid), contrato_id)
    tgt_m, tgt_total = ({}, 0.0)
    if tid and str(tid) != str(bid):
        tgt_m, tgt_total = _aggregate_version_monthly(sb, str(tid), contrato_id)
    else:
        tgt_m, tgt_total = base_m, base_total

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

    detalle_baseline = _detalle_pk_mensual(sb, str(bid), contrato_id)
    detalle_vigente = _detalle_pk_mensual(sb, str(tid), contrato_id) if tid and str(tid) != str(bid) else detalle_baseline

    return {
        "baseline_id": str(bid),
        "target_id": str(tid) if tid else None,
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


def build_curva_s_pdf_html(contrato: dict, data: dict) -> str:
    """HTML para PDF horizontal de curva S."""
    ind = data.get("indicadores") or {}
    meses = data.get("meses") or []
    titulo = f"Curva S — Contrato {contrato.get('numero') or contrato.get('id') or ''}"
    rows_html = ""
    for r in meses:
        rows_html += (
            f"<tr>"
            f"<td>{r.get('mes_label')}</td>"
            f"<td>${float(r.get('baseline_acum') or 0):,.0f}</td>"
            f"<td>${float(r.get('vigente_acum') or 0):,.0f}</td>"
            f"<td>${float(r.get('ejecutado_acum') or 0):,.0f}</td>"
            f"<td>{r.get('delta_vigente_pct')}%</td>"
            f"<td>{r.get('delta_ejecutado_pct')}%</td>"
            f"</tr>"
        )
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
@page {{ size: A4 landscape; margin: 1.2cm; }}
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #1e293b; }}
h1 {{ color: #0f766e; font-size: 16pt; margin: 0 0 4px; }}
.sub {{ color: #64748b; font-size: 9pt; margin-bottom: 12px; }}
.kpi {{ display: inline-block; margin-right: 24px; margin-bottom: 8px; }}
.kpi strong {{ display: block; font-size: 11pt; color: #0f766e; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
th {{ background: #0f766e; color: #fff; padding: 6px 8px; text-align: left; font-size: 8pt; }}
td {{ border-bottom: 1px solid #e2e8f0; padding: 5px 8px; font-size: 8pt; }}
.footer {{ margin-top: 16px; font-size: 7pt; color: #94a3b8; text-align: center; }}
.legend span {{ margin-right: 16px; }}
.legend .b {{ color: #1e3a8a; font-weight: bold; }}
.legend .v {{ color: #38bdf8; font-weight: bold; }}
.legend .e {{ color: #16a34a; font-weight: bold; }}
</style></head><body>
<h1>{titulo}</h1>
<div class="sub">{contrato.get('objeto') or ''} · {contrato.get('contratista') or ''} · Interventoría: {contrato.get('interventoria') or '—'}</div>
<div class="legend"><span class="b">■ Baseline</span><span class="v">■ Vigente</span><span class="e">■ Ejecutado</span></div>
<div style="margin-top:10px">
  <div class="kpi"><span>Presupuesto total</span><strong>${float(ind.get('presupuesto_total') or 0):,.0f}</strong></div>
  <div class="kpi"><span>Programado a la fecha</span><strong>${float(ind.get('programado_a_fecha') or 0):,.0f} ({ind.get('programado_pct')}%)</strong></div>
  <div class="kpi"><span>Ejecutado a la fecha</span><strong>${float(ind.get('ejecutado_a_fecha') or 0):,.0f} ({ind.get('ejecutado_pct')}%)</strong></div>
  <div class="kpi"><span>Desviación</span><strong>${float(ind.get('desviacion_valor') or 0):,.0f} ({ind.get('desviacion_pct')}%)</strong></div>
</div>
<table>
<thead><tr><th>Mes</th><th>Baseline acum.</th><th>Vigente acum.</th><th>Ejecutado acum.</th><th>Δ Vigente</th><th>Δ Ejecutado</th></tr></thead>
<tbody>{rows_html}</tbody>
</table>
<div class="footer">ClaraCore · Documento confidencial · Generado automáticamente</div>
</body></html>"""
