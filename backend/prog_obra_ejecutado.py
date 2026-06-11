"""
Ejecutado real en programación de obra — fuente SICOE (so_registros), aprobación nivel 1.

Regla de negocio: un registro cuenta como ejecutado cuando nivel1_estado está aprobado
(inspector). La fecha de imputación mensual es nivel1_fecha.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from prog_obra_costos_presupuesto import (
    _line_costo,
    fetch_ppto_items_version,
    ppto_scope_direct_total,
    resolve_ppto_vigente_version_id,
)

_PAGE = 1000


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


def _estado_nivel1_aprobado(estado: Any) -> bool:
    s = (estado or "").strip().lower()
    return s in ("aprobado", "validación aprobada", "validacion aprobada")


def _linea_costo_registro(row: dict) -> float:
    cd = float(row.get("costo_directo") or 0)
    if cd > 0:
        return cd
    cant = float(row.get("cantidad_total") or 0)
    vlr = float(row.get("vlr_unitario") or 0)
    return cant * vlr if cant > 0 and vlr > 0 else 0.0


def _norm_capitulo_key(capitulo: Any) -> str:
    s = str(capitulo or "").strip()
    if not s:
        return ""
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"^(\d+\.)\s+", r"\1", s)
    return s


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
    return ""


def fetch_ejecutado_nivel1_mensual(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[str, float], float]:
    """Costo ejecutado por mes (nivel 1 aprobado), agrupado por mes de nivel1_fecha."""
    pk_filter = {str(p).strip() for p in (pk_ids or set()) if str(p).strip()} or None
    monthly: Dict[str, float] = defaultdict(float)
    total = 0.0
    off = 0
    cols = (
        "costo_directo,cantidad_total,vlr_unitario,"
        "nivel1_estado,nivel1_fecha,"
        "pk_ids(pk_id)"
    )
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
        for r in batch:
            if not _estado_nivel1_aprobado(r.get("nivel1_estado")):
                continue
            pk = _pk_from_registro(r)
            if pk_filter is not None and pk not in pk_filter:
                continue
            costo = _linea_costo_registro(r)
            if costo <= 0:
                continue
            fd = _parse_d(r.get("nivel1_fecha"))
            if not fd:
                continue
            monthly[_month_key(fd)] += costo
            total += costo
        if len(batch) < _PAGE:
            break
        off += _PAGE
    return dict(monthly), total


def _aggregate_ejecutado_por_capitulo(
    sb,
    contrato_id: int,
    *,
    pk_ids: Optional[Set[str]] = None,
) -> Dict[str, float]:
    pk_filter = {str(p).strip() for p in (pk_ids or set()) if str(p).strip()} or None
    out: Dict[str, float] = defaultdict(float)
    off = 0
    cols = "costo_directo,cantidad_total,vlr_unitario,capitulo,nivel1_estado,pk_ids(pk_id)"
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
        for r in batch:
            if not _estado_nivel1_aprobado(r.get("nivel1_estado")):
                continue
            pk = _pk_from_registro(r)
            if pk_filter is not None and pk not in pk_filter:
                continue
            costo = _linea_costo_registro(r)
            if costo <= 0:
                continue
            cap = _norm_capitulo_key(r.get("capitulo"))
            if cap:
                out[cap] += costo
        if len(batch) < _PAGE:
            break
        off += _PAGE
    return dict(out)


def _aggregate_presupuesto_por_capitulo(
    sb,
    contrato_id: int,
    version_ppto_id: str,
    *,
    pk_ids: Optional[Set[str]] = None,
    tramos: Optional[List[str]] = None,
) -> Dict[str, float]:
    rows = fetch_ppto_items_version(
        sb,
        contrato_id,
        version_ppto_id,
        pk_ids=pk_ids,
        tramos=tramos,
    )
    out: Dict[str, float] = defaultdict(float)
    for r in rows:
        cap = _norm_capitulo_key(r.get("capitulo"))
        if not cap:
            continue
        out[cap] += _line_costo(r)
    return dict(out)


def _aggregate_ejecutado_por_pk(
    sb,
    contrato_id: int,
) -> Dict[str, float]:
    """Costo ejecutado (N1 aprobado) agrupado por PK."""
    out: Dict[str, float] = defaultdict(float)
    off = 0
    cols = "costo_directo,cantidad_total,vlr_unitario,nivel1_estado,pk_ids(pk_id)"
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
        for r in batch:
            if not _estado_nivel1_aprobado(r.get("nivel1_estado")):
                continue
            pk = _pk_from_registro(r)
            if not pk:
                continue
            costo = _linea_costo_registro(r)
            if costo <= 0:
                continue
            out[pk] += costo
        if len(batch) < _PAGE:
            break
        off += _PAGE
    return dict(out)


def _aggregate_presupuesto_por_pk(
    sb,
    contrato_id: int,
    version_ppto_id: str,
) -> Dict[str, float]:
    rows = fetch_ppto_items_version(sb, contrato_id, version_ppto_id)
    out: Dict[str, float] = defaultdict(float)
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        if not pk:
            continue
        out[pk] += _line_costo(r)
    return dict(out)


def _ejecutado_pct(presupuesto: float, ejecutado: float) -> float:
    if presupuesto > 0:
        return round(ejecutado / presupuesto * 100, 1)
    return 100.0 if ejecutado > 0 else 0.0


def fetch_prog_pk_ejecutado_map(sb, contrato_id: int) -> Dict[str, dict]:
    rows = (
        sb.table("prog_pk_ejecutado")
        .select("pk_id,presupuesto_directo,ejecutado,ejecutado_pct,actualizado_en")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return {str(r.get("pk_id") or "").strip(): r for r in rows if str(r.get("pk_id") or "").strip()}


def enrich_mapa_rows_with_ejecutado(rows: List[dict], ej_map: Dict[str, dict]) -> List[dict]:
    out: List[dict] = []
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        e = ej_map.get(pk) or {}
        out.append(
            {
                **r,
                "presupuesto_directo": round(float(e.get("presupuesto_directo") or 0), 2),
                "ejecutado": round(float(e.get("ejecutado") or 0), 2),
                "ejecutado_pct": round(float(e.get("ejecutado_pct") or 0), 1),
            }
        )
    return out


def refresh_prog_pk_ejecutado(sb, contrato_id: int) -> dict:
    """
    Recalcula y persiste agregados ejecutado/presupuesto por PK (lote).
    Escanea SICOE una vez por contrato; lecturas posteriores desde prog_pk_ejecutado.
    """
    vid = resolve_ppto_vigente_version_id(sb, contrato_id, None, force_vigente=True)
    ppto_by_pk: Dict[str, float] = _aggregate_presupuesto_por_pk(sb, contrato_id, vid) if vid else {}
    ej_by_pk = _aggregate_ejecutado_por_pk(sb, contrato_id)

    pk_rows = (
        sb.table("pk_ids")
        .select("pk_id")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    all_pks: Set[str] = set(ppto_by_pk.keys()) | set(ej_by_pk.keys())
    for pr in pk_rows:
        pk = str(pr.get("pk_id") or "").strip()
        if pk:
            all_pks.add(pk)

    now = datetime.now(timezone.utc).isoformat()
    upsert_rows: List[dict] = []
    for pk in sorted(all_pks, key=lambda x: (len(x), x)):
        ppto = round(float(ppto_by_pk.get(pk, 0)), 2)
        ej = round(float(ej_by_pk.get(pk, 0)), 2)
        upsert_rows.append(
            {
                "contrato_id": int(contrato_id),
                "pk_id": pk,
                "presupuesto_directo": ppto,
                "ejecutado": ej,
                "ejecutado_pct": _ejecutado_pct(ppto, ej),
                "actualizado_en": now,
            }
        )

    chunk = 200
    for i in range(0, len(upsert_rows), chunk):
        sb.table("prog_pk_ejecutado").upsert(
            upsert_rows[i : i + chunk],
            on_conflict="contrato_id,pk_id",
        ).execute()

    return {
        "ok": True,
        "pk_count": len(upsert_rows),
        "actualizado_en": now,
    }


def build_ejecucion_resumen(
    sb,
    contrato_id: int,
    *,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
    tramos: Optional[List[str]] = None,
) -> dict:
    """
    Resumen programado vs ejecutado (costo directo).
    Ejecutado = SICOE con nivel 1 aprobado.
    """
    vid = resolve_ppto_vigente_version_id(sb, contrato_id, version_ppto_id, force_vigente=True)
    presupuesto_total = 0.0
    if vid:
        presupuesto_total = ppto_scope_direct_total(
            sb,
            contrato_id,
            vid,
            tramos=tramos,
            pk_ids=pk_ids,
        )
    _, ejecutado_total = fetch_ejecutado_nivel1_mensual(sb, contrato_id, pk_ids=pk_ids)

    pct = round(ejecutado_total / presupuesto_total * 100, 1) if presupuesto_total > 0 else 0.0

    ppto_by_cap: Dict[str, float] = {}
    ej_by_cap: Dict[str, float] = {}
    if vid:
        ppto_by_cap = _aggregate_presupuesto_por_capitulo(
            sb, contrato_id, vid, pk_ids=pk_ids, tramos=tramos,
        )
    ej_by_cap = _aggregate_ejecutado_por_capitulo(sb, contrato_id, pk_ids=pk_ids)

    caps = sorted(set(ppto_by_cap.keys()) | set(ej_by_cap.keys()), key=lambda x: (len(x), x))
    por_capitulo: List[dict] = []
    for cap in caps:
        ppto = round(float(ppto_by_cap.get(cap, 0)), 2)
        ej = round(float(ej_by_cap.get(cap, 0)), 2)
        cap_pct = round(ej / ppto * 100, 1) if ppto > 0 else (100.0 if ej > 0 else 0.0)
        por_capitulo.append(
            {
                "capitulo": cap,
                "presupuesto": ppto,
                "ejecutado": ej,
                "ejecutado_pct": cap_pct,
            }
        )

    return {
        "presupuesto_total": round(presupuesto_total, 2),
        "ejecutado_total": round(ejecutado_total, 2),
        "ejecutado_pct": pct,
        "regla": "Registros SICOE con nivel 1 (inspector) aprobado",
        "por_capitulo": por_capitulo,
    }
