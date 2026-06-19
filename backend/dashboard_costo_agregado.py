"""
Agregación monetaria del dashboard: Σ cantidades × V.U., un solo redondeo a 0 decimales.

No modifica costo_directo por fila almacenado; solo totales agregados (ítem, capítulo, acta, contrato).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Tuple

ItemKey = Tuple[str, str]


def vu_item_rows(rows: List[dict], *, field: str = "vlr_unitario") -> float:
    """Valor unitario del ítem (primer V.U. positivo en las filas del grupo)."""
    for r in rows or []:
        v = float(r.get(field) or r.get("vlr_unitario") or 0)
        if v > 0:
            return v
    return 0.0


def costo_agregado_cant_vu(cant: float, vu: float) -> float:
    """round(Σcant × V.U., 0) — redondeo único al final."""
    if not cant or not vu:
        return 0.0
    return float(round(float(cant) * float(vu), 0))


def ppto_costo_por_estado(rows_it: List[dict], rev_map_fn: Callable[[Any], str]) -> Dict[str, Dict[str, float]]:
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
    vu = vu_item_rows(rows_it)
    for x in rows_it or []:
        k = rev_to_key.get(rev_map_fn(x.get("revisado")), "NR")
        est[k]["cant"] += float(x.get("cant_total") or 0)
    for k in est:
        est[k]["costo"] = costo_agregado_cant_vu(est[k]["cant"], vu)
    return est


def ppto_claracore_cant_costo(rows_it: List[dict], rev_map_fn: Callable[[Any], str]) -> Tuple[float, float]:
    """Bolsa ClaraCore (Aprobado + No Revisado): cantidad sumada y costo agregado."""
    cant = 0.0
    for x in rows_it or []:
        rev = rev_map_fn(x.get("revisado"))
        if rev in ("Aprobado", "No Revisado"):
            cant += float(x.get("cant_total") or 0)
    vu = vu_item_rows(rows_it)
    return cant, costo_agregado_cant_vu(cant, vu)


def rollup_ppto_por_capitulo(
    ppto_by_item: Dict[ItemKey, List[dict]],
    rev_map_fn: Callable[[Any], str],
    cap_display_fn: Callable[[Any], str],
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    """Totales por capítulo a partir de ítems (costo = Σ round(cant_estado×VU))."""
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    for (_ck, _ik), rows in (ppto_by_item or {}).items():
        if not rows:
            continue
        cap_disp = cap_display_fn(rows[0].get("capitulo"))
        vu = vu_item_rows(rows)
        cant_ap = 0.0
        cant_nr = 0.0
        cant_tot = 0.0
        for r in rows:
            c = float(r.get("cant_total") or 0)
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
    c = float(r.get("cant_total") or 0)
    d["cant_tot"] += c
    if rev_map_fn(r.get("revisado")) == "Aprobado":
        d["cant_ap"] += c
    else:
        d["cant_nr"] += c
    v = float(r.get("vlr_unitario") or 0)
    if v > d["vu"]:
        d["vu"] = v
    if not d["cap_disp"]:
        d["cap_disp"] = str(r.get("capitulo") or "").strip() or ck


def rollup_resumen_item_agg(
    agg: Dict[ItemKey, Dict[str, float]],
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    for d in agg.values():
        cap_disp = d.get("cap_disp") or ""
        if not cap_disp:
            continue
        vu = float(d.get("vu") or 0)
        ppto_ap_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_ap") or 0), vu)
        ppto_nr_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_nr") or 0), vu)
        ppto_total_c[cap_disp] += costo_agregado_cant_vu(float(d.get("cant_tot") or 0), vu)
    return dict(ppto_ap_c), dict(ppto_nr_c), dict(ppto_total_c)


def sicoe_track_row(sg: Dict[str, Any], reg: dict, *, bucket: str) -> None:
    """Acumula cantidades SICOE en ap_q o nr_q; el costo se calcula al final con V.U."""
    cq = float(reg.get("cantidad_total") or 0)
    vu = float(reg.get("vlr_unitario") or 0)
    if vu > float(sg.get("_vu") or 0):
        sg["_vu"] = vu
    qkey = f"{bucket}_q"
    sg[qkey] = float(sg.get(qkey) or 0) + cq


def sicoe_finalize_costs(sg: Dict[str, Any]) -> None:
    """Convierte cantidades acumuladas en costos agregados (round(cant×VU, 0))."""
    vu = float(sg.pop("_vu", 0) or 0)
    for bucket in ("ap", "nr", "pe", "rej"):
        q = float(sg.get(f"{bucket}_q") or 0)
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
    c = float(r.get("cant_total") or 0)
    vu = float(r.get("vlr_unitario") or 0)
    if vu > float(d.get("_vu") or 0):
        d["_vu"] = vu
    rev = rev_map_fn(r.get("revisado"))
    if rev == "Aprobado":
        d["ap_q"] += c
    elif rev == "Pendiente":
        d["pe_q"] += c
    elif rev == "Rechazado":
        d["re_q"] += c
    else:
        d["nr_q"] += c


def gerencial_ppto_finalize_item(d: Dict[str, Any]) -> Dict[str, float]:
    vu = float(d.pop("_vu", 0) or 0)
    return {
        "cap_display": d.get("cap_display") or "",
        "ap": costo_agregado_cant_vu(float(d.get("ap_q") or 0), vu),
        "pe": costo_agregado_cant_vu(float(d.get("pe_q") or 0), vu),
        "re": costo_agregado_cant_vu(float(d.get("re_q") or 0), vu),
        "nr": costo_agregado_cant_vu(float(d.get("nr_q") or 0), vu),
    }


def rollup_gerencial_ppto_por_capitulo(
    items: Dict[ItemKey, Dict[str, Any]],
) -> Tuple[Dict[str, Dict[str, Any]], set]:
    """Totales por capítulo a partir de ítems con costos ya agregados (cant×VU)."""
    agg: Dict[str, Dict[str, Any]] = {}
    allowed: set = set()
    for k, raw in (items or {}).items():
        allowed.add(k)
        fin = gerencial_ppto_finalize_item(dict(raw))
        ck = k[0]
        d = agg.get(ck)
        if d is None:
            d = {"display": fin["cap_display"], "ap": 0.0, "pe": 0.0, "re": 0.0, "nr": 0.0}
            agg[ck] = d
        if fin["cap_display"]:
            d["display"] = fin["cap_display"]
        d["ap"] += fin["ap"]
        d["pe"] += fin["pe"]
        d["re"] += fin["re"]
        d["nr"] += fin["nr"]
    return agg, allowed
