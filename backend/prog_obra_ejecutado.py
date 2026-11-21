"""
Ejecutado real en programación de obra — fuente SicoeObra (so_registros).

Regla de negocio (coherente con SicoeObra reportado):
  - Cuenta todo registro con ítem de cobro asignado (item_numero no vacío).
  - Independiente del estado de validación, salvo rechazados (no cuentan).
  - Sin ítem → no cuenta.
  - Mes = mes de la fecha del reporte (fecha / fecha_reporte).
  - Dinero = regla única listado: ROUND0(ROUND(Σcant,2)×VU_listado) por (cap, ítem[, pk]).
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from prog_obra_costos_presupuesto import (
    fetch_ppto_items_version,
    resolve_ppto_vigente_version_id,
    _load_listado_vu_map,
)
from sicoe_valor_canonico import (
    cap_item_key,
    load_listado_vu_by_cap_item,
    round_cant,
    valor_cant_vu,
    vu_listado_para_registro,
)

_PAGE = 1000


def _parse_d(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
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


def _norm_estado(v: Any) -> str:
    s = str(v or "").strip().lower()
    if not s:
        return ""
    if "rechaz" in s:
        return "rechazado"
    if s == "aprobado" or "aprob" in s:
        return "aprobado"
    return s


def _registro_rechazado(row: dict) -> bool:
    """True si algún nivel activo marca rechazado."""
    for i in range(1, 7):
        if _norm_estado(row.get(f"nivel{i}_estado")) == "rechazado":
            return True
    est = _norm_estado(row.get("estado") or row.get("estado_validacion"))
    return est == "rechazado"


def _tiene_item_cobro(row: dict) -> bool:
    return bool(str(row.get("item_numero") or "").strip())


def _fecha_reporte(row: dict) -> Optional[date]:
    for key in ("fecha", "fecha_reporte", "fecha_obra", "created_at"):
        d = _parse_d(row.get(key))
        if d:
            return d
    return None


def _pk_from_registro(row: dict) -> str:
    nested = row.get("pk_ids")
    if isinstance(nested, dict):
        pk = str(nested.get("pk_id") or "").strip()
        if pk:
            return pk
    if isinstance(nested, list) and nested:
        first = nested[0]
        if isinstance(first, dict):
            pk = str(first.get("pk_id") or "").strip()
            if pk:
                return pk
    return str(row.get("pk_id") or "").strip()


def _fetch_so_registros_ejecucion(sb, contrato_id: int) -> List[dict]:
    cols = (
        "id,capitulo,item_numero,cantidad_total,vlr_unitario,costo_directo,"
        "fecha,estado,"
        "nivel1_estado,nivel2_estado,nivel3_estado,nivel4_estado,nivel5_estado,nivel6_estado,"
        "pk_ids(pk_id)"
    )
    rows: List[dict] = []
    off = 0
    while True:
        batch = (
            sb.table("so_registros")
            .select(cols)
            .eq("contrato_id", int(contrato_id))
            .range(off, off + _PAGE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        off += _PAGE
    return rows


def _registros_ejecutables(rows: List[dict]) -> List[dict]:
    out = []
    for r in rows:
        if not _tiene_item_cobro(r):
            continue
        if _registro_rechazado(r):
            continue
        out.append(r)
    return out


def fetch_ejecutado_nivel1_mensual(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[str, float], float]:
    """
    Compat API: ejecutado mensual con la regla nueva (ítem asignado, no rechazado).
    Nombre histórico conservado para no romper imports.
    """
    return fetch_ejecutado_mensual(sb, contrato_id, pk_ids=pk_ids)


def fetch_ejecutado_mensual(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[str, float], float]:
    """Costo ejecutado por mes (fecha de reporte), regla listado."""
    pk_filter = {str(p).strip() for p in (pk_ids or set()) if str(p).strip()} or None
    listado_idx = load_listado_vu_by_cap_item(sb, int(contrato_id))

    # Acumular cantidades por (mes, cap, item)
    qty: Dict[Tuple[str, str, str], float] = defaultdict(float)
    for r in _registros_ejecutables(_fetch_so_registros_ejecucion(sb, contrato_id)):
        pk = _pk_from_registro(r)
        if pk_filter is not None and pk not in pk_filter:
            continue
        fd = _fecha_reporte(r)
        if not fd:
            continue
        mk = _month_key(fd)
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[0] or not k[1]:
            continue
        try:
            cant = float(r.get("cantidad_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        qty[(mk, k[0], k[1])] += cant

    monthly: Dict[str, float] = defaultdict(float)
    for (mk, cap, it), cant_raw in qty.items():
        meta = listado_idx.get((cap, it)) or {}
        vu = float(meta.get("vlr_unitario") or meta.get("precio_unitario") or 0)
        monthly[mk] += float(valor_cant_vu(round_cant(cant_raw), vu))

    total = float(sum(monthly.values()))
    return dict(monthly), total


def _aggregate_ejecutado_por_pk(sb, contrato_id: int) -> Dict[str, float]:
    listado_idx = load_listado_vu_by_cap_item(sb, int(contrato_id))
    qty: Dict[Tuple[str, str, str], float] = defaultdict(float)
    for r in _registros_ejecutables(_fetch_so_registros_ejecucion(sb, contrato_id)):
        pk = _pk_from_registro(r)
        if not pk:
            continue
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[0] or not k[1]:
            continue
        try:
            cant = float(r.get("cantidad_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        qty[(pk, k[0], k[1])] += cant

    out: Dict[str, float] = defaultdict(float)
    for (pk, cap, it), cant_raw in qty.items():
        meta = listado_idx.get((cap, it)) or {}
        vu = float(meta.get("vlr_unitario") or meta.get("precio_unitario") or 0)
        out[pk] += float(valor_cant_vu(round_cant(cant_raw), vu))
    return dict(out)


def _aggregate_ejecutado_por_capitulo(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> Dict[str, float]:
    pk_filter = {str(p).strip() for p in (pk_ids or set()) if str(p).strip()} or None
    listado_idx = load_listado_vu_by_cap_item(sb, int(contrato_id))
    qty: Dict[Tuple[str, str], float] = defaultdict(float)
    for r in _registros_ejecutables(_fetch_so_registros_ejecucion(sb, contrato_id)):
        pk = _pk_from_registro(r)
        if pk_filter is not None and pk not in pk_filter:
            continue
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[0] or not k[1]:
            continue
        try:
            cant = float(r.get("cantidad_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        qty[k] += cant

    by_cap: Dict[str, float] = defaultdict(float)
    for (cap, it), cant_raw in qty.items():
        meta = listado_idx.get((cap, it)) or {}
        vu = float(meta.get("vlr_unitario") or meta.get("precio_unitario") or 0)
        by_cap[cap] += float(valor_cant_vu(round_cant(cant_raw), vu))
    return dict(by_cap)


def _aggregate_presupuesto_por_pk(sb, contrato_id: int, version_ppto_id: str) -> Dict[str, float]:
    from sicoe_valor_canonico import valor_cant_vu, round_cant, cap_item_key

    rows = fetch_ppto_items_version(sb, contrato_id, version_ppto_id)
    vu_map = _load_listado_vu_map(sb, contrato_id)
    qty: Dict[Tuple[str, str, str], float] = defaultdict(float)
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        k = cap_item_key(r.get("capitulo"), r.get("item"))
        if not pk or not k[0] or not k[1]:
            continue
        try:
            qty[(pk, k[0], k[1])] += float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            pass
    out: Dict[str, float] = defaultdict(float)
    for (pk, cap, it), cant_raw in qty.items():
        vu = float(vu_map.get((cap, it)) or 0)
        out[pk] += float(valor_cant_vu(round_cant(cant_raw), vu))
    return dict(out)


def _norm_capitulo_key(v: Any) -> str:
    return str(v or "").strip().upper()


def _ejecutado_pct(presupuesto: float, ejecutado: float) -> float:
    p = float(presupuesto or 0)
    e = float(ejecutado or 0)
    if p > 0:
        return round(e / p * 100, 2)
    return 100.0 if e > 0 else 0.0


def enrich_mapa_rows_with_ejecutado(rows: List[dict], ej_map: Dict[str, dict]) -> List[dict]:
    """Enriquece filas del mapa con presupuesto/ejecutado/% (modo ejecutado)."""
    out = []
    for r in rows or []:
        row = dict(r)
        pk = str(row.get("pk_id") or "").strip()
        meta = ej_map.get(pk) or {}
        ppto = float(
            meta.get("presupuesto_costo")
            or meta.get("presupuesto_directo")
            or meta.get("presupuesto")
            or 0
        )
        ej = float(
            meta.get("ejecutado_costo")
            or meta.get("ejecutado")
            or 0
        )
        pct = meta.get("porcentaje_ejecutado")
        if pct is None:
            pct = meta.get("ejecutado_pct")
        if pct is None:
            pct = _ejecutado_pct(ppto, ej)
        row["presupuesto_directo"] = ppto
        row["ejecutado"] = ej
        row["ejecutado_pct"] = float(pct) if pct is not None else 0.0
        out.append(row)
    return out


def build_ejecucion_resumen(
    sb,
    contrato_id: int,
    *,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
    tramos: Optional[List[str]] = None,
) -> dict:
    """Compat: alias de fetch_ejecutado_resumen + forma esperada por UI antigua."""
    base = fetch_ejecutado_resumen(
        sb, contrato_id, version_ppto_id=version_ppto_id, pk_ids=pk_ids, tramos=tramos,
    )
    por_cap = base.get("por_capitulo") or {}
    cap_list = []
    ppto_total = float(base.get("presupuesto_total") or 0)
    for cap, ej in sorted(por_cap.items(), key=lambda x: x[0]):
        ej_f = float(ej or 0)
        cap_list.append({
            "capitulo": cap,
            "ejecutado": ej_f,
            "ejecutado_pct": round((ej_f / ppto_total * 100), 2) if ppto_total > 0 else 0.0,
        })
    return {
        **base,
        "ejecutado_pct": base.get("porcentaje"),
        "por_capitulo": cap_list,
    }


def fetch_prog_pk_ejecutado_map(sb, contrato_id: int) -> Dict[str, dict]:
    rows = (
        sb.table("prog_pk_ejecutado")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return {str(r.get("pk_id") or "").strip(): r for r in rows if r.get("pk_id")}


def refresh_prog_pk_ejecutado(sb, contrato_id: int) -> dict:
    vid = resolve_ppto_vigente_version_id(sb, contrato_id, None, force_vigente=True)
    ppto_by_pk: Dict[str, float] = _aggregate_presupuesto_por_pk(sb, contrato_id, vid) if vid else {}
    ej_by_pk = _aggregate_ejecutado_por_pk(sb, contrato_id)

    existing = (
        sb.table("prog_pk_ejecutado")
        .select("pk_id")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    all_pks = sorted(set(ppto_by_pk) | set(ej_by_pk) | {
        str(r.get("pk_id") or "").strip() for r in existing if r.get("pk_id")
    })
    now = datetime.now(timezone.utc).isoformat()
    payload = []
    for pk in all_pks:
        if not pk:
            continue
        ppto = float(ppto_by_pk.get(pk) or 0)
        ej = float(ej_by_pk.get(pk) or 0)
        pct = round((ej / ppto * 100), 2) if ppto > 0 else None
        payload.append({
            "contrato_id": int(contrato_id),
            "pk_id": pk,
            "presupuesto_costo": ppto,
            "ejecutado_costo": ej,
            "porcentaje_ejecutado": pct,
            "actualizado_en": now,
        })
    if payload:
        sb.table("prog_pk_ejecutado").upsert(
            payload,
            on_conflict="contrato_id,pk_id",
        ).execute()
    return {"ok": True, "pks": len(payload), "actualizado_en": now}


def fetch_ejecutado_resumen(
    sb,
    contrato_id: int,
    *,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
    tramos: Optional[List[str]] = None,
) -> dict:
    from prog_obra_costos_presupuesto import ppto_scope_direct_total

    vid = resolve_ppto_vigente_version_id(sb, contrato_id, version_ppto_id, force_vigente=False)
    monthly, ejecutado_total = fetch_ejecutado_mensual(sb, contrato_id, pk_ids=pk_ids)
    presupuesto_total = 0.0
    if vid:
        tramo_one = tramos[0] if tramos and len(tramos) == 1 else None
        presupuesto_total = ppto_scope_direct_total(
            sb, contrato_id, vid, tramo=tramo_one, tramos=tramos, pk_ids=pk_ids,
        )
    ej_by_cap = _aggregate_ejecutado_por_capitulo(sb, contrato_id, pk_ids=pk_ids)
    return {
        "presupuesto_total": presupuesto_total,
        "ejecutado_total": ejecutado_total,
        "porcentaje": round((ejecutado_total / presupuesto_total * 100), 2) if presupuesto_total > 0 else 0.0,
        "mensual": monthly,
        "por_capitulo": ej_by_cap,
        "criterio": "item_asignado_no_rechazado",
    }


def fetch_ejecutado_detalle_por_pk_item(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> List[dict]:
    """Presupuesto vs ejecutado por PK + capítulo + ítem (conector PK)."""
    from prog_obra_costos_presupuesto import fetch_ppto_borrador_version_id

    pk_filter = {str(p).strip() for p in (pk_ids or set()) if str(p).strip()} or None
    vid = fetch_ppto_borrador_version_id(sb, contrato_id)
    vu_map = _load_listado_vu_map(sb, contrato_id)

    ppto_qty: Dict[Tuple[str, str, str], float] = defaultdict(float)
    if vid:
        for r in fetch_ppto_items_version(sb, contrato_id, vid):
            pk = str(r.get("pk_id") or "").strip()
            k = cap_item_key(r.get("capitulo"), r.get("item"))
            if not pk or not k[0] or not k[1]:
                continue
            if pk_filter is not None and pk not in pk_filter:
                continue
            try:
                ppto_qty[(pk, k[0], k[1])] += float(r.get("cant_total") or 0)
            except (TypeError, ValueError):
                pass

    ej_qty: Dict[Tuple[str, str, str], float] = defaultdict(float)
    for r in _registros_ejecutables(_fetch_so_registros_ejecucion(sb, contrato_id)):
        pk = _pk_from_registro(r)
        if not pk:
            continue
        if pk_filter is not None and pk not in pk_filter:
            continue
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[0] or not k[1]:
            continue
        try:
            ej_qty[(pk, k[0], k[1])] += float(r.get("cantidad_total") or 0)
        except (TypeError, ValueError):
            pass

    keys = sorted(set(ppto_qty) | set(ej_qty))
    out = []
    for pk, cap, it in keys:
        cant_p = round_cant(ppto_qty.get((pk, cap, it), 0))
        cant_e = round_cant(ej_qty.get((pk, cap, it), 0))
        vu = float(vu_map.get((cap, it)) or 0)
        ppto_v = float(valor_cant_vu(cant_p, vu))
        ej_v = float(valor_cant_vu(cant_e, vu))
        out.append({
            "pk_id": pk,
            "capitulo": cap,
            "item": it,
            "presupuesto": ppto_v,
            "ejecutado": ej_v,
            "diferencia": round(ppto_v - ej_v, 0),
            "cantidad_presupuesto": cant_p,
            "cantidad_ejecutada": cant_e,
            "vlr_unitario_listado": vu,
        })
    return out
