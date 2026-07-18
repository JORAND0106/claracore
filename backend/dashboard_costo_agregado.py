"""
Agregación monetaria del dashboard:
  1. Cantidad → round(, 2) decimales antes de cualquier cálculo.
  2. Costo directo → round(cantidad × V.U., 0) pesos enteros.

No modifica costo_directo por fila almacenado; solo totales agregados (ítem, capítulo, acta, contrato).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Tuple

ItemKey = Tuple[str, str]

CANTIDAD_DASHBOARD_DP = 2


def cantidad_dashboard(cant: float) -> float:
    """Cantidad normalizada para dashboard: redondeo a 2 decimales."""
    return float(round(float(cant or 0), CANTIDAD_DASHBOARD_DP))


def cantidad_dashboard_sum(rows: List[dict], *, field: str = "cant_total") -> float:
    """Σ round(cant_fila, 2) — cada fila a 2 dp antes de sumar."""
    total = sum(cantidad_dashboard(float(r.get(field) or 0)) for r in (rows or []))
    return cantidad_dashboard(total)


def listado_vu_for_cap_item(
    cap_key: str,
    item_key: str,
    *,
    cap_listado_by_item: Optional[Dict[str, dict]] = None,
    full_listado_by_cap_item: Optional[Dict[ItemKey, dict]] = None,
) -> Optional[float]:
    """V.U. vigente del Listado de Precios para la pareja (capítulo, ítem) — sin cruzar capítulos."""
    if cap_listado_by_item:
        row = cap_listado_by_item.get(item_key) or {}
        v = float(row.get("precio_unitario") or 0)
        if v > 0:
            return v
    if full_listado_by_cap_item:
        row = full_listado_by_cap_item.get((cap_key, item_key))
        if row:
            v = float(row.get("precio_unitario") or 0)
            if v > 0:
                return v
    return None


def listado_vu_from_index(
    cap_key: str,
    item_key: str,
    listado_idx: Optional[Dict[ItemKey, Any]],
) -> Optional[float]:
    """Atajo: índice (cap_norm, item_norm) → precio_unitario del listado."""
    if not listado_idx or not item_key:
        return None
    row = listado_idx.get((cap_key, item_key))
    if not row:
        return None
    v = float(row.get("precio_unitario") or 0)
    return v if v > 0 else None


def vu_item_rows(rows: List[dict], *, field: str = "vlr_unitario") -> float:
    """Valor unitario del ítem (V.U. explícito o implícito costo_directo/cantidad)."""
    for r in rows or []:
        v = float(r.get(field) or r.get("vlr_unitario") or 0)
        if v > 0:
            return v
    for r in rows or []:
        cq = float(r.get("cant_total") or 0)
        cd = float(r.get("costo_directo") or 0)
        if cq > 0 and cd > 0:
            return cd / cq
    return 0.0


def vu_aggregate_rows(rows: List[dict]) -> float:
    """V.U. implícito del ítem: Σ costo_directo / Σ cantidad (todas las filas)."""
    total_q = 0.0
    total_cd = 0.0
    for r in rows or []:
        cq = float(r.get("cant_total") or 0)
        cd = float(r.get("costo_directo") or 0)
        total_q += cq
        total_cd += cd
    if total_q > 0 and total_cd > 0:
        return total_cd / total_q
    return 0.0


def resolve_item_vu(
    rows: List[dict],
    *,
    listado_vu: Optional[float] = None,
    alt_rows: Optional[List[dict]] = None,
    listado_only: bool = False,
) -> float:
    """
    V.U. para costo agregado dashboard.
    Con listado_only=True (default en dashboard): solo Listado de Precios cap+ítem; si falta → 0.
    Sin listado_only: fallbacks históricos (registro / presupuesto / cd÷cant) para otros módulos.
    """
    if listado_vu is not None:
        v = float(listado_vu or 0)
        if v > 0:
            return v
        if listado_only:
            return 0.0
    if listado_only:
        return 0.0
    for r in rows or []:
        v = float(r.get("vlr_unitario") or 0)
        if v > 0:
            return v
    if alt_rows:
        for r in alt_rows:
            v = float(r.get("vlr_unitario") or 0)
            if v > 0:
                return v
        vu = vu_aggregate_rows(alt_rows)
        if vu > 0:
            return vu
    vu = vu_item_rows(rows)
    if vu > 0:
        return vu
    vu = vu_aggregate_rows(rows)
    if vu > 0:
        return vu
    return 0.0


def vu_explicit_in_rows(rows: List[dict]) -> bool:
    """True si alguna fila trae vlr_unitario > 0 (no inferido de costo_directo)."""
    for r in rows or []:
        if float(r.get("vlr_unitario") or 0) > 0:
            return True
    return False


def ppto_rows_with_resolved_vu(
    rows: List[dict],
    *,
    listado_vu: Optional[float] = None,
    alt_rows: Optional[List[dict]] = None,
    listado_only: bool = False,
) -> List[dict]:
    """Copia filas con vlr_unitario del listado inyectado para cálculo agregado."""
    vu = resolve_item_vu(
        rows, listado_vu=listado_vu, alt_rows=alt_rows, listado_only=listado_only
    )
    if vu <= 0:
        return rows
    return [{**r, "vlr_unitario": vu} for r in rows]


def costo_agregado_cant_vu(cant: float, vu: float) -> float:
    """round(cantidad_dashboard(cant) × V.U., 0) — cantidad a 2 dp, costo a 0 dp."""
    q = cantidad_dashboard(cant)
    if not q or not vu:
        return 0.0
    return float(round(q * float(vu), 0))


def drill_item_costo_total(
    cant: float,
    vu: float,
    *,
    stored: float = 0,
    allow_stored_fallback: bool = False,
) -> float:
    """Costo ítem drill: round(cantidad_2dp × V.U., 0). Nunca sumar costos por línea."""
    if vu > 0 and cant:
        return costo_agregado_cant_vu(cant, vu)
    if allow_stored_fallback:
        return float(round(float(stored or 0), 0))
    return 0.0


def ppto_costo_por_estado(
    rows_it: List[dict],
    rev_map_fn: Callable[[Any], str],
    *,
    vu_resolved: Optional[float] = None,
    listado_only: bool = False,
) -> Dict[str, Dict[str, float]]:
    """Cantidad y costo agregado por estado (NR|P|R|A) para un ítem de presupuesto."""
    est: Dict[str, Dict[str, float]] = {
        "NR": {"cant": 0.0, "costo": 0.0},
        "P": {"cant": 0.0, "costo": 0.0},
        "R": {"cant": 0.0, "costo": 0.0},
        "A": {"cant": 0.0, "costo": 0.0},
    }
    rev_to_key = {
        "No Revisado": "NR",
        "Pendiente": "P",
        "Rechazado": "R",
        "Aprobado": "A",
    }
    vu = float(vu_resolved or 0)
    if not vu and not listado_only:
        vu = vu_item_rows(rows_it) or vu_aggregate_rows(rows_it)
    costo_directo_por_est: Dict[str, float] = {k: 0.0 for k in est}
    for x in rows_it or []:
        k = rev_to_key.get(rev_map_fn(x.get("revisado")), "NR")
        est[k]["cant"] += cantidad_dashboard(float(x.get("cant_total") or 0))
        if not listado_only:
            costo_directo_por_est[k] += float(x.get("costo_directo") or 0)
    for k in est:
        est[k]["cant"] = cantidad_dashboard(est[k]["cant"])
        if vu > 0:
            est[k]["costo"] = costo_agregado_cant_vu(est[k]["cant"], vu)
        elif listado_only:
            est[k]["costo"] = 0.0
        else:
            est[k]["costo"] = float(round(costo_directo_por_est[k], 0))
    return est


def ppto_claracore_cant_costo(
    rows_it: List[dict],
    rev_map_fn: Callable[[Any], str],
    *,
    listado_vu: Optional[float] = None,
    alt_rows: Optional[List[dict]] = None,
    listado_only: bool = True,
) -> Tuple[float, float]:
    """Bolsa ClaraCore (Aprobado + No Revisado): cantidad sumada y costo agregado."""
    cant = 0.0
    for x in rows_it or []:
        rev = rev_map_fn(x.get("revisado"))
        if rev in ("Aprobado", "No Revisado"):
            cant += cantidad_dashboard(float(x.get("cant_total") or 0))
    cant = cantidad_dashboard(cant)
    vu = resolve_item_vu(
        rows_it, listado_vu=listado_vu, alt_rows=alt_rows, listado_only=listado_only
    )
    return cant, costo_agregado_cant_vu(cant, vu)


def ppto_item_cc_total(
    est: Dict[str, Dict[str, float]],
    *,
    vu: float,
    obra_ejecutada: bool,
) -> float:
    """Total ClaraCore del ítem: round(Σ cant × V.U., 0)."""
    return ppto_cc_total_from_est(est, float(vu or 0), obra_ejecutada=obra_ejecutada)


def rollup_ppto_por_capitulo(
    ppto_by_item: Dict[ItemKey, List[dict]],
    rev_map_fn: Callable[[Any], str],
    cap_display_fn: Callable[[Any], str],
    *,
    listado_idx: Optional[Dict[ItemKey, Any]] = None,
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    """Totales por capítulo a partir de ítems (costo = Σ round(cant_estado×VU listado))."""
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    for (ck, ik), rows in (ppto_by_item or {}).items():
        if not rows:
            continue
        cap_disp = cap_display_fn(rows[0].get("capitulo"))
        vu = listado_vu_from_index(ck, ik, listado_idx) or 0.0
        cant_ap = 0.0
        cant_nr = 0.0
        cant_tot = 0.0
        for r in rows:
            c = cantidad_dashboard(float(r.get("cant_total") or 0))
            cant_tot += c
            if rev_map_fn(r.get("revisado")) == "Aprobado":
                cant_ap += c
            else:
                cant_nr += c
        ppto_ap_c[cap_disp] += costo_agregado_cant_vu(cant_ap, vu)
        ppto_nr_c[cap_disp] += costo_agregado_cant_vu(cant_nr, vu)
        ppto_total_c[cap_disp] += costo_agregado_cant_vu(cant_tot, vu)
    return dict(ppto_ap_c), dict(ppto_nr_c), dict(ppto_total_c)


def ingest_ppto_resumen_row(
    agg: Dict[ItemKey, Dict[str, float]],
    r: dict,
    *,
    cap_key_fn: Callable[[Any], str],
    item_key_fn: Callable[[Any], str],
    rev_map_fn: Callable[[Any], str],
) -> None:
    """Acumula cantidades por (cap, ítem) para resumen sin cargar todas las filas."""
    ik = item_key_fn(r.get("item"))
    if not ik:
        return
    ck = cap_key_fn(r.get("capitulo"))
    k = (ck, ik)
    if k not in agg:
        agg[k] = {"cant_ap": 0.0, "cant_nr": 0.0, "cant_tot": 0.0, "vu": 0.0, "cap_disp": ""}
    d = agg[k]
    c = cantidad_dashboard(float(r.get("cant_total") or 0))
    d["cant_tot"] += c
    if rev_map_fn(r.get("revisado")) == "Aprobado":
        d["cant_ap"] += c
    else:
        d["cant_nr"] += c
    if not d["cap_disp"]:
        d["cap_disp"] = str(r.get("capitulo") or "").strip() or ck


def rollup_resumen_item_agg(
    agg: Dict[ItemKey, Dict[str, float]],
    *,
    listado_idx: Optional[Dict[ItemKey, Any]] = None,
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    for (ck, ik), d in agg.items():
        cap_disp = d.get("cap_disp") or ""
        if not cap_disp:
            continue
        vu = listado_vu_from_index(ck, ik, listado_idx) or 0.0
        ppto_ap_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_ap") or 0), vu)
        ppto_nr_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_nr") or 0), vu)
        ppto_total_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_tot") or 0), vu)
    return dict(ppto_ap_c), dict(ppto_nr_c), dict(ppto_total_c)


def sicoe_track_row(sg: Dict[str, Any], reg: dict, *, bucket: str) -> None:
    """Acumula cantidades SICOE en ap_q o nr_q; el costo se calcula al final con V.U. listado."""
    cq = cantidad_dashboard(float(reg.get("cantidad_total") or 0))
    qkey = f"{bucket}_q"
    sg[qkey] = float(sg.get(qkey) or 0) + cq


def sicoe_finalize_costs(sg: Dict[str, Any], *, listado_vu: Optional[float] = None) -> None:
    """Convierte cantidades acumuladas en costos agregados (round(cant×VU listado, 0))."""
    sg.pop("_vu", None)
    vu = float(listado_vu or 0)
    sg["item_vu"] = vu
    has_q = any(float(sg.get(f"{b}_q") or 0) for b in ("ap", "nr", "pe", "rej"))
    if vu > 0:
        sg["listado_vu_encontrado"] = True
        sg.pop("listado_vu_ausente", None)
    elif has_q:
        sg["listado_vu_ausente"] = True
    for bucket in ("ap", "nr", "pe", "rej"):
        q = cantidad_dashboard(float(sg.get(f"{bucket}_q") or 0))
        sg[f"{bucket}_q"] = q
        sg[f"{bucket}_c"] = costo_agregado_cant_vu(q, vu)


def gerencial_ppto_ingest_row(
    agg: Dict[ItemKey, Dict[str, Any]],
    r: dict,
    *,
    rev_map_fn: Callable[[Any], str],
    cap_key_fn: Callable[[Any], str],
    item_key_fn: Callable[[Any], str],
    cap_display_fn: Callable[[Any], str],
) -> None:
    ck = cap_key_fn(r.get("capitulo"))
    ik = item_key_fn(r.get("item"))
    if not ik:
        return
    k = (ck, ik)
    if k not in agg:
        agg[k] = {
            "cap_display": cap_display_fn(r.get("capitulo")),
            "ap_q": 0.0,
            "pe_q": 0.0,
            "re_q": 0.0,
            "nr_q": 0.0,
            "_vu": 0.0,
        }
    d = agg[k]
    c = cantidad_dashboard(float(r.get("cant_total") or 0))
    rev = rev_map_fn(r.get("revisado"))
    if rev == "Aprobado":
        d["ap_q"] += c
    elif rev == "Pendiente":
        d["pe_q"] += c
    elif rev == "Rechazado":
        d["re_q"] += c
    else:
        d["nr_q"] += c


def gerencial_ppto_cc_cant(d: Dict[str, Any], *, obra_ejecutada: bool) -> float:
    """Cantidad total de la bolsa ClaraCore (normalizada a 2 decimales)."""
    ap_q = cantidad_dashboard(float(d.get("ap_q") or 0))
    nr_q = cantidad_dashboard(float(d.get("nr_q") or 0))
    if obra_ejecutada:
        return cantidad_dashboard(
            ap_q + cantidad_dashboard(float(d.get("pe_q") or 0))
            + cantidad_dashboard(float(d.get("re_q") or 0))
            + nr_q
        )
    return cantidad_dashboard(ap_q + nr_q)


def gerencial_ppto_finalize_item(
    d: Dict[str, Any],
    *,
    obra_ejecutada: bool = True,
    listado_vu: Optional[float] = None,
) -> Dict[str, float]:
    d.pop("_vu", None)
    vu = float(listado_vu or 0)
    cc_q = gerencial_ppto_cc_cant(d, obra_ejecutada=obra_ejecutada)
    return {
        "cap_display": d.get("cap_display") or "",
        "ap": costo_agregado_cant_vu(float(d.get("ap_q") or 0), vu),
        "pe": costo_agregado_cant_vu(float(d.get("pe_q") or 0), vu),
        "re": costo_agregado_cant_vu(float(d.get("re_q") or 0), vu),
        "nr": costo_agregado_cant_vu(float(d.get("nr_q") or 0), vu),
        "cc_total": costo_agregado_cant_vu(cc_q, vu),
    }


def gerencial_item_claracore_costo(p: Dict[str, Any], *, obra_ejecutada: bool) -> float:
    """Total ClaraCore del ítem: cc_total (round(Σcant×VU,0)). No sumar buckets redondeados."""
    _ = obra_ejecutada  # reservado; cc_total ya refleja la bolsa correcta por vista
    return float(p.get("cc_total") or 0)


def ppto_cc_total_from_est(
    est: Dict[str, Dict[str, float]],
    vu: float,
    *,
    obra_ejecutada: bool,
) -> float:
    """Costo ClaraCore agregado: Σ cantidades × V.U., un solo redondeo."""
    if obra_ejecutada:
        cant = cantidad_dashboard(sum(float(est[k]["cant"]) for k in est))
    else:
        cant = cantidad_dashboard(float(est["A"]["cant"]) + float(est["NR"]["cant"]))
    if vu > 0:
        return costo_agregado_cant_vu(cant, vu)
    if obra_ejecutada:
        return float(round(sum(float(est[k]["costo"]) for k in est), 0))
    return float(round(float(est["A"]["costo"]) + float(est["NR"]["costo"]), 0))


def rollup_gerencial_ppto_por_capitulo(
    items: Dict[ItemKey, Dict[str, Any]],
    *,
    obra_ejecutada: bool = True,
) -> Tuple[Dict[str, Dict[str, Any]], set]:
    """Totales por capítulo a partir de ítems con costos ya agregados (cant×VU)."""
    agg: Dict[str, Dict[str, Any]] = {}
    allowed: set = set()
    for k, raw in (items or {}).items():
        allowed.add(k)
        fin = gerencial_ppto_finalize_item(dict(raw), obra_ejecutada=obra_ejecutada)
        ck = k[0]
        d = agg.get(ck)
        if d is None:
            d = {
                "display": fin["cap_display"],
                "ap": 0.0,
                "pe": 0.0,
                "re": 0.0,
                "nr": 0.0,
                "cc_total": 0.0,
            }
            agg[ck] = d
        if fin["cap_display"]:
            d["display"] = fin["cap_display"]
        d["ap"] += fin["ap"]
        d["pe"] += fin["pe"]
        d["re"] += fin["re"]
        d["nr"] += fin["nr"]
        d["cc_total"] += fin["cc_total"]
    return agg, allowed
