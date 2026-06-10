"""
Logica de negocio Programacion de obra (Fase 1).
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from presupuesto_constants import PRESUPUESTO_TIPO_POLIGONO
from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles, count_dias_habiles_entre

_FUNC_LOG = "Programacion obra"
_logger = logging.getLogger(__name__)


class BusinessRuleError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def make_prog_calendar_loader(sb):
    def load(contrato_id: int, desde: date, hasta: date) -> List[dict]:
        cid = int(contrato_id)
        d0, d1 = desde.isoformat(), hasta.isoformat()
        try:
            q = (
                sb.table("prog_calendario_no_habiles")
                .select("fecha,tipo,contrato_id")
                .gte("fecha", d0)
                .lte("fecha", d1)
                .or_(f"contrato_id.eq.{cid},contrato_id.is.null")
            )
            return q.execute().data or []
        except Exception:
            return []

    return load


def _niveles_prog_desde_contrato(sb, contrato_id: int) -> List[int]:
    row = (
        sb.table("contrato_niveles_validacion")
        .select("niveles_activos")
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    na = (row[0].get("niveles_activos") if row else None) or [1, 2, 3]
    if not isinstance(na, (list, tuple)):
        na = [1, 2, 3]
    out: List[int] = []
    for x in na:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if 2 <= n <= 12:
            out.append(n)
    return out if out else [2, 3]


def _ppto_items_por_pk(sb, contrato_id: int, pk_id: str) -> Tuple[int, List[Tuple[str, str, Decimal, str, Decimal]]]:
    """
    Devuelve (n_items_distintos, filas (capitulo, item, cant_total, und, vlr_unitario)) agregando
    filas del presupuesto vigente (es_vigente) por capitulo+item.
    """
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    rows = fetch_ppto_rows_programacion(
        sb, contrato_id, pk_id=(pk_id or "").strip(), force_vigente=True,
    )
    if not rows:
        rows = (
            sb.table("presupuesto")
            .select("capitulo,item,cant_total,und,vlr_unitario")
            .eq("contrato_id", contrato_id)
            .eq("pk_id", pk_id)
            .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
            .eq("dado_de_baja", False)
            .execute()
            .data
            or []
        )
    agg: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in rows:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not cap or not it:
            continue
        key = (cap, it)
        ct = Decimal(str(r.get("cant_total") or 0))
        if key not in agg:
            agg[key] = {
                "cant": Decimal(0),
                "und": (r.get("und") or "")[:20],
                "vlr": Decimal(str(r.get("vlr_unitario") or 0)),
            }
        agg[key]["cant"] += ct
    items: List[Tuple[str, str, Decimal, str, Decimal]] = []
    for (cap, it), v in sorted(agg.items(), key=lambda x: (x[0][0], x[0][1])):
        items.append((cap, it, v["cant"], v["und"][:20], v["vlr"]))
    return len(items), items


def _tramo_sort_key(tramo: str) -> Tuple[int, int, str]:
    s = (tramo or "").strip().upper()
    m = re.search(r"(\d+)", s)
    if m:
        return (0, int(m.group(1)), s)
    return (1, 0, s)


def group_tramos_from_presupuesto_rows(rows: List[dict]) -> List[dict]:
    """Agrupa filas presupuesto (pk_id, tramo) en lista ordenada de tramos con pk_ids únicos."""
    by_tramo: Dict[str, set] = {}
    for r in rows or []:
        tramo = (r.get("tramo") or "").strip()
        if not tramo:
            continue
        pk = str(r.get("pk_id") or "").strip()
        if not pk:
            continue
        by_tramo.setdefault(tramo, set()).add(pk)
    out: List[dict] = []
    for tramo in sorted(by_tramo.keys(), key=_tramo_sort_key):
        pks = sorted(by_tramo[tramo], key=lambda x: (len(x), x))
        out.append({"tramo": tramo, "pk_ids": pks})
    return out


def fetch_tramos_contrato(sb, contrato_id: int) -> List[dict]:
    """Tramos del contrato con PKs distintos (presupuesto poligonal activo)."""
    rows = (
        sb.table("presupuesto")
        .select("pk_id, tramo")
        .eq("contrato_id", contrato_id)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    return group_tramos_from_presupuesto_rows(rows)


def _norm_prog_item_key(item: Optional[str]) -> str:
    """Alinea presupuesto.item ↔ listado_precios.item_numero (p. ej. '3.1.' → '3.1')."""
    if item is None:
        return ""
    t = str(item).strip()
    if not t:
        return ""
    return re.sub(r"\.+$", "", t)


def _register_listado_item_key(
    target: Dict[Tuple[str, str], Any],
    cap: str,
    it: str,
    value: Any,
) -> None:
    """Registra clave exacta y normalizada para lookup cruzado presupuesto/listado."""
    if not cap or not it:
        return
    target[(cap, it)] = value
    it_norm = _norm_prog_item_key(it)
    if it_norm and it_norm != it:
        target.setdefault((cap, it_norm), value)


def _listado_agrupador_por_item(sb, contrato_id: int) -> Tuple[Dict[Tuple[str, str], Optional[int]], Dict[Tuple[str, str], str]]:
    """Mapa (capitulo, item_numero) -> agrupador_id y descripcion desde listado_precios."""
    rows = (
        sb.table("listado_precios")
        .select("capitulo,item_numero,agrupador_id,descripcion")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    ag_map: Dict[Tuple[str, str], Optional[int]] = {}
    desc_map: Dict[Tuple[str, str], str] = {}
    for r in rows:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item_numero") or "").strip()
        if not cap or not it:
            continue
        _register_listado_item_key(ag_map, cap, it, r.get("agrupador_id"))
        if r.get("descripcion"):
            _register_listado_item_key(desc_map, cap, it, str(r["descripcion"]).strip())
    return ag_map, desc_map


def _fetch_ppto_rows_para_estructura(
    sb,
    contrato_id: int,
    *,
    pk_id: Optional[str] = None,
    pk_ids: Optional[List[str]] = None,
    tramo: Optional[str] = None,
    version_ppto_id: Optional[str] = None,
    force_vigente: bool = True,
) -> List[dict]:
    """Ítems de presupuesto para armar WBS (versión vigente por defecto)."""
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    pk_set = None
    if pk_ids:
        pk_set = {str(p).strip() for p in pk_ids if str(p).strip()}
    pk_one = (pk_id or "").strip()
    # Alcance por PK(s): el tramo ya está definido por pk_ids; filtrar además por columna tramo
    # suele vaciar la estructura (ítems con pk del tramo pero tramo distinto o vacío en presupuesto).
    tramo_filter = (tramo or "").strip() or None
    if pk_one or pk_set:
        tramo_filter = None
    rows = fetch_ppto_rows_programacion(
        sb,
        contrato_id,
        pk_id=pk_one or None,
        pk_ids=pk_set,
        tramo=tramo_filter,
        version_ppto_id=version_ppto_id,
        force_vigente=force_vigente,
    )
    if rows:
        return rows

    q = (
        sb.table("presupuesto")
        .select("pk_id, capitulo, item, cant_total, und, vlr_unitario, costo_directo, descripcion")
        .eq("contrato_id", contrato_id)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
    )
    if pk_one:
        q = q.eq("pk_id", pk_one)
    elif pk_ids:
        ids = [str(p).strip() for p in pk_ids if str(p).strip()]
        if ids:
            q = q.in_("pk_id", ids)
    elif tramo_filter:
        q = q.eq("tramo", tramo_filter)
    return q.execute().data or []


def fetch_estructura_programacion_pk(
    sb,
    contrato_id: int,
    pk_id: str,
    version_ppto_id: Optional[str] = None,
) -> dict:
    """
    items de presupuesto del PK agrupados por capitulo y agrupador WBS.
    JOIN logico con listado_precios -> listado_precios_agrupadores.
    """
    pk = (pk_id or "").strip()
    ppto_rows = _fetch_ppto_rows_para_estructura(
        sb,
        contrato_id,
        pk_id=pk,
        version_ppto_id=version_ppto_id,
    )
    item_agg: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in ppto_rows:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not cap or not it:
            continue
        key = (cap, it)
        ct = Decimal(str(r.get("cant_total") or 0))
        cd = Decimal(str(r.get("costo_directo") or 0))
        vlr = Decimal(str(r.get("vlr_unitario") or 0))
        line_cd = cd if cd > 0 else ct * vlr
        desc = (r.get("descripcion") or "").strip()
        if key not in item_agg:
            item_agg[key] = {
                "cant": Decimal(0),
                "costo": Decimal(0),
                "und": (r.get("und") or "")[:20],
                "vlr": vlr,
                "descripcion": desc,
            }
        cur = item_agg[key]
        cur["cant"] += ct
        cur["costo"] += line_cd
        if not cur["descripcion"] and desc:
            cur["descripcion"] = desc

    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    agr_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,codigo_wbs,nombre,orden")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    agr_meta: Dict[int, dict] = {}
    for a in agr_rows:
        aid = a.get("id")
        if aid is not None:
            agr_meta[int(aid)] = a

    cap_map: Dict[str, Dict[str, Any]] = {}
    for (cap, it), v in sorted(item_agg.items(), key=lambda x: (x[0][0], x[0][1])):
        if cap not in cap_map:
            cap_map[cap] = {"agrupadores": {}, "sin_agrupador": []}
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        item_obj = {
            "item": it,
            "descripcion": v["descripcion"] or _resolve_listado_descripcion(desc_lp, cap, it),
            "cant_total": float(v["cant"]),
            "und": v["und"] or "?",
            "vlr_unitario": float(v["vlr"]),
            "costo_directo": float(v["costo"]),
        }
        if ag_id is not None and int(ag_id) in agr_meta:
            ag_id_int = int(ag_id)
            ag_bucket = cap_map[cap]["agrupadores"]
            if ag_id_int not in ag_bucket:
                meta = agr_meta[ag_id_int]
                ag_bucket[ag_id_int] = {
                    "agrupador_id": ag_id_int,
                    "agrupador_nombre": (meta.get("nombre") or "").strip(),
                    "codigo_wbs": (meta.get("codigo_wbs") or "").strip(),
                    "orden": int(meta.get("orden") or 0),
                    "items": [],
                    "cant_total": 0.0,
                    "costo_directo": 0.0,
                }
            ag = ag_bucket[ag_id_int]
            ag["items"].append(item_obj)
            ag["cant_total"] += item_obj["cant_total"]
            ag["costo_directo"] += item_obj["costo_directo"]
        else:
            cap_map[cap]["sin_agrupador"].append(item_obj)

    capitulos: List[dict] = []
    for cap in sorted(cap_map.keys()):
        block = cap_map[cap]
        agrupadores = sorted(
            block["agrupadores"].values(),
            key=lambda a: (a.get("orden") or 0, a.get("codigo_wbs") or "", a.get("agrupador_nombre") or ""),
        )
        for ag in agrupadores:
            ag["items"].sort(key=lambda x: x.get("item") or "")
        sin = sorted(block["sin_agrupador"], key=lambda x: x.get("item") or "")
        capitulos.append({
            "capitulo": cap,
            "agrupadores": agrupadores,
            "sin_agrupador": sin,
        })
    total_sin = sum(len(c.get("sin_agrupador") or []) for c in capitulos)
    return {"capitulos": capitulos, "total_sin_agrupador": total_sin}


def _aggregate_ppto_rows_tramo(
    ppto_rows: List[dict],
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
    agr_meta: Dict[int, dict],
    desc_lp: Optional[Dict[Tuple[str, str], str]] = None,
) -> Dict[str, Dict[int, dict]]:
    """
    Agrega filas presupuesto multi-PK por (capitulo, agrupador_id) e ítems hijos.
    Excluye ítems sin agrupador WBS válido.
    """
    cap_map: Dict[str, Dict[int, dict]] = {}
    for r in ppto_rows or []:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        pk = str(r.get("pk_id") or "").strip()
        if not cap or not it or not pk:
            continue
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        if ag_id is None or int(ag_id) not in agr_meta:
            continue
        ag_id_int = int(ag_id)
        ct = Decimal(str(r.get("cant_total") or 0))
        cd = Decimal(str(r.get("costo_directo") or 0))
        vlr = Decimal(str(r.get("vlr_unitario") or 0))
        line_cd = cd if cd > 0 else ct * vlr
        und = (r.get("und") or "?")[:20]
        desc = (r.get("descripcion") or "").strip() or _resolve_listado_descripcion(desc_lp or {}, cap, it)
        if cap not in cap_map:
            cap_map[cap] = {}
        ag_bucket = cap_map[cap]
        if ag_id_int not in ag_bucket:
            meta = agr_meta[ag_id_int]
            ag_bucket[ag_id_int] = {
                "agrupador_id": ag_id_int,
                "agrupador_nombre": (meta.get("nombre") or "").strip(),
                "codigo_wbs": (meta.get("codigo_wbs") or "").strip(),
                "orden": int(meta.get("orden") or 0),
                "cant_total": Decimal(0),
                "costo_directo": Decimal(0),
                "und": und,
                "pk_ids": set(),
                "items": {},
            }
        ag = ag_bucket[ag_id_int]
        ag["cant_total"] += ct
        ag["costo_directo"] += line_cd
        ag["pk_ids"].add(pk)
        if und and und != "?" and ag.get("und") in ("?", "", None):
            ag["und"] = und
        item_bucket = ag.setdefault("items", {})
        if it not in item_bucket:
            item_bucket[it] = {
                "item": it,
                "descripcion": desc,
                "cant_total": Decimal(0),
                "costo_directo": Decimal(0),
                "und": und,
                "vlr_unitario": vlr,
            }
        item_row = item_bucket[it]
        item_row["cant_total"] += ct
        item_row["costo_directo"] += line_cd
        if not item_row.get("descripcion") and desc:
            item_row["descripcion"] = desc
        if und and und != "?" and item_row.get("und") in ("?", "", None):
            item_row["und"] = und
    return cap_map


def _capitulo_cpm_match_key(capitulo: str) -> str:
    """Clave de comparación para alinear capítulos (p. ej. '4' vs '4. ESTRUCTURA')."""
    s = str(capitulo or "").strip()
    m = re.match(r"^(\d+)", s)
    if m:
        return m.group(1)
    return s.casefold()


def _resolve_listado_agrupador_id(
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
    capitulo: str,
    item: str,
) -> Optional[int]:
    """
    Resuelve agrupador WBS desde listado_precios para una fila de presupuesto.
    Tolera diferencias de formato en item (3.1 vs 3.1.) y capítulo (prefijo numérico).
    """
    cap = (capitulo or "").strip()
    it = (item or "").strip()
    if not cap or not it:
        return None
    it_norm = _norm_prog_item_key(it)
    for it_try in (it, it_norm):
        if not it_try:
            continue
        ag = ag_by_item.get((cap, it_try))
        if ag is not None:
            return ag
    cap_key = _capitulo_cpm_match_key(cap)
    matches: List[Optional[int]] = []
    for (c, i), ag in ag_by_item.items():
        if ag is None:
            continue
        if _norm_prog_item_key(i) != it_norm:
            continue
        if _capitulo_cpm_match_key(c) == cap_key:
            matches.append(ag)
    uniq = set(matches)
    if len(uniq) == 1:
        return matches[0]
    return None


def _resolve_listado_descripcion(
    desc_lp: Dict[Tuple[str, str], str],
    capitulo: str,
    item: str,
) -> str:
    cap = (capitulo or "").strip()
    it = (item or "").strip()
    if not cap or not it:
        return ""
    it_norm = _norm_prog_item_key(it)
    for it_try in (it, it_norm):
        desc = desc_lp.get((cap, it_try))
        if desc:
            return desc
    cap_key = _capitulo_cpm_match_key(cap)
    for (c, i), desc in desc_lp.items():
        if not desc:
            continue
        if _norm_prog_item_key(i) == it_norm and _capitulo_cpm_match_key(c) == cap_key:
            return desc
    return ""


def _ppto_item_in_listado_set(item: str, listado_items: set) -> bool:
    """True si el ítem presupuesto coincide con algún item_numero del listado (± punto final)."""
    it_n = _norm_prog_item_key(item)
    if not it_n:
        return False
    for lp_it in listado_items:
        if lp_it == item or _norm_prog_item_key(lp_it) == it_n:
            return True
    return False


def _stored_duracion_agrupador(
    actividades: List[dict],
    capitulo: str,
    agrupador_id: int,
    pk_ids: Optional[List[str]] = None,
) -> Optional[int]:
    """Duración manual almacenada (máx. entre PKs); independiente de fechas CPM."""
    cap_key = _capitulo_cpm_match_key(capitulo)
    ag_id = int(agrupador_id)
    pk_set = {str(p).strip() for p in (pk_ids or []) if str(p).strip()} if pk_ids else None
    durs: List[int] = []
    for a in actividades or []:
        if _capitulo_cpm_match_key(a.get("capitulo") or "") != cap_key:
            continue
        if a.get("agrupador_id") is None or int(a.get("agrupador_id")) != ag_id:
            continue
        pk = str(a.get("pk_id") or "").strip()
        if pk_set is not None and pk not in pk_set:
            continue
        raw = a.get("duracion_dias_habiles")
        if raw is None or str(raw).strip() == "":
            continue
        try:
            parsed = int(raw)
            if parsed > 0:
                durs.append(parsed)
        except (TypeError, ValueError):
            continue
    if durs:
        return max(durs)
    if pk_set is not None:
        return _stored_duracion_agrupador(actividades, capitulo, agrupador_id, pk_ids=None)
    return None


def _is_agrupador_header_row(row: dict) -> bool:
    item = (row.get("item") or "").strip()
    cw = (row.get("codigo_wbs") or item or "").strip()
    return bool(cw and item == cw)


def _consolidar_fila_agrupador_cpm(rows: List[dict]) -> dict:
    """Fila representativa: cabecera WBS + duración manual; fechas CPM no pisan duración."""
    if not rows:
        return {}
    header = next((dict(r) for r in rows if _is_agrupador_header_row(r)), None)
    best_dur = 0
    best_dur_val = None
    for r in rows:
        raw = r.get("duracion_dias_habiles")
        if raw is None or str(raw).strip() == "":
            continue
        try:
            parsed = int(raw)
        except (TypeError, ValueError):
            continue
        if parsed > best_dur:
            best_dur = parsed
            best_dur_val = parsed
    out = dict(header or rows[0])
    if best_dur_val is not None:
        out["duracion_dias_habiles"] = best_dur_val
    return out


def _es_ancla_manual_cpm(row: dict) -> bool:
    """Ancla explícita del usuario — única fuente de fechas prog_actividades para el motor."""
    if not bool(row.get("override_manual")):
        return False
    return _parse_date_cpm(row.get("fecha_inicio")) is not None


def _consolidar_fila_agrupador_cpm_entrada(rows: List[dict]) -> dict:
    """
    Fila de entrada al motor CPM: duración consolidada; fechas solo si ancla manual.
    Fechas de write-back CPM previo nunca alimentan el forward pass.
    """
    out = _consolidar_fila_agrupador_cpm(rows)
    if not _es_ancla_manual_cpm(out):
        out["fecha_inicio"] = None
        out["fecha_fin_calculada"] = None
    return out


def _schedule_key(act: dict) -> Optional[Tuple[Optional[str], Optional[int], Optional[str]]]:
    fi = act.get("fecha_inicio")
    fi_s: Optional[str] = None
    if fi is not None and str(fi).strip():
        fi_s = str(fi).strip()[:10]
    du = act.get("duracion_dias_habiles")
    du_i: Optional[int] = None
    if du is not None and str(du).strip() != "":
        try:
            parsed = int(du)
            if parsed > 0:
                du_i = parsed
        except (TypeError, ValueError):
            du_i = None
    fin = act.get("fecha_fin_calculada")
    fin_s = str(fin).strip() if fin is not None and str(fin).strip() else None
    if fi_s is None and du_i is None:
        return None
    return (fi_s, du_i, fin_s)


def _merge_programacion_agrupador(
    actividades: List[dict],
    capitulo: str,
    agrupador_id: int,
    pk_ids: List[str],
    contrato_id: Optional[int] = None,
    cache: Optional[CalendarioNoHabilesCache] = None,
) -> dict:
    """Unifica fechas del agrupador entre PKs; envolvente si hay conflicto o cobertura parcial."""
    cap_key = _capitulo_cpm_match_key(capitulo)
    ag_id = int(agrupador_id)
    pk_set = {str(p).strip() for p in pk_ids if str(p).strip()}
    by_pk: Dict[str, dict] = {}
    for a in actividades or []:
        if _capitulo_cpm_match_key(a.get("capitulo") or "") != cap_key:
            continue
        if a.get("agrupador_id") is None or int(a.get("agrupador_id")) != ag_id:
            continue
        pk = str(a.get("pk_id") or "").strip()
        if not pk or pk not in pk_set:
            continue
        sk = _schedule_key(a)
        if sk is None:
            continue
        by_pk[pk] = {
            "fecha_inicio": sk[0],
            "duracion_dias_habiles": sk[1],
            "fecha_fin_calculada": sk[2],
            "override_manual": bool(a.get("override_manual")),
        }

    empty = {
        "fecha_inicio": None,
        "duracion_dias_habiles": None,
        "fecha_fin_calculada": None,
        "consistente": True,
        "override_manual": False,
        "pk_ids_programados": [],
    }
    if not by_pk:
        return empty

    pk_programados = sorted(by_pk.keys())

    schedules = list(by_pk.values())
    first = schedules[0]
    all_same = all(
        s.get("fecha_inicio") == first.get("fecha_inicio")
        and s.get("duracion_dias_habiles") == first.get("duracion_dias_habiles")
        for s in schedules[1:]
    )
    full_coverage = len(by_pk) >= len(pk_set)

    if all_same and full_coverage:
        dur_same = _stored_duracion_agrupador(actividades, capitulo, ag_id, list(pk_set))
        return {
            "fecha_inicio": first.get("fecha_inicio"),
            "duracion_dias_habiles": dur_same if dur_same is not None else first.get("duracion_dias_habiles"),
            "fecha_fin_calculada": first.get("fecha_fin_calculada"),
            "consistente": True,
            "override_manual": any(s.get("override_manual") for s in by_pk.values()),
            "pk_ids_programados": pk_programados,
        }

    min_fi: Optional[str] = None
    max_ff: Optional[str] = None
    for s in by_pk.values():
        fi = s.get("fecha_inicio")
        ff = s.get("fecha_fin_calculada")
        if fi and (min_fi is None or fi < min_fi):
            min_fi = fi
        if ff and (max_ff is None or ff > max_ff):
            max_ff = ff

    stored_durs: List[int] = []
    for s in by_pk.values():
        du = s.get("duracion_dias_habiles")
        if du is None or str(du).strip() == "":
            continue
        try:
            stored_durs.append(max(1, int(du)))
        except (TypeError, ValueError):
            continue
    dur_i: Optional[int] = _stored_duracion_agrupador(
        actividades, capitulo, ag_id, list(pk_set),
    )
    if dur_i is None:
        dur_i = max(stored_durs) if stored_durs else None
    if dur_i is None and min_fi and max_ff and contrato_id is not None and cache is not None:
        try:
            d0 = date.fromisoformat(min_fi[:10])
            d1 = date.fromisoformat(max_ff[:10])
            dur_i = count_dias_habiles_entre(int(contrato_id), d0, d1, cache)
        except (ValueError, TypeError):
            dur_i = None

    return {
        "fecha_inicio": min_fi,
        "duracion_dias_habiles": dur_i,
        "fecha_fin_calculada": max_ff,
        "consistente": False,
        "override_manual": any(s.get("override_manual") for s in by_pk.values()),
        "pk_ids_programados": pk_programados,
    }


def build_estructura_tramo_response(
    tramo: str,
    pk_ids: List[str],
    cap_map: Dict[str, Dict[int, dict]],
    actividades: List[dict],
    contrato_id: Optional[int] = None,
    cache: Optional[CalendarioNoHabilesCache] = None,
) -> dict:
    """Arma respuesta JSON de estructura consolidada por tramo."""
    capitulos: List[dict] = []
    for cap in sorted(cap_map.keys()):
        ag_bucket = cap_map[cap]
        agrupadores = []
        for ag_id in sorted(
            ag_bucket.keys(),
            key=lambda aid: (
                ag_bucket[aid].get("orden") or 0,
                ag_bucket[aid].get("codigo_wbs") or "",
                ag_bucket[aid].get("agrupador_nombre") or "",
            ),
        ):
            ag = ag_bucket[ag_id]
            pk_list = sorted(ag["pk_ids"], key=lambda x: (len(x), x))
            programacion = _merge_programacion_agrupador(
                actividades, cap, ag_id, pk_list, contrato_id=contrato_id, cache=cache,
            )
            items_out = []
            for it_code in sorted(
                (ag.get("items") or {}).keys(),
                key=lambda x: (len(x), x),
            ):
                it_row = ag["items"][it_code]
                items_out.append({
                    "item": it_row["item"],
                    "descripcion": it_row.get("descripcion") or "",
                    "cant_total": float(it_row["cant_total"]),
                    "costo_directo": float(it_row["costo_directo"]),
                    "und": it_row.get("und") or "?",
                    "vlr_unitario": float(it_row.get("vlr_unitario") or 0),
                })
            agrupadores.append({
                "agrupador_id": ag_id,
                "agrupador_nombre": ag.get("agrupador_nombre") or "",
                "codigo_wbs": ag.get("codigo_wbs") or "",
                "orden": int(ag.get("orden") or 0),
                "cant_total": float(ag["cant_total"]),
                "costo_directo": float(ag["costo_directo"]),
                "und": ag.get("und") or "?",
                "pk_ids": pk_list,
                "programacion": programacion,
                "items": items_out,
            })
        if agrupadores:
            capitulos.append({"capitulo": cap, "agrupadores": agrupadores})
    return {
        "tramo": tramo,
        "pk_ids": list(pk_ids),
        "capitulos": capitulos,
    }


def fetch_estructura_tramo(
    sb,
    contrato_id: int,
    tramo: str,
    version_id: str,
    pk_ids_filter: Optional[List[str]] = None,
    version_ppto_id: Optional[str] = None,
) -> dict:
    """
    Estructura consolidada WBS de un tramo: cantidades/costos sumados por agrupador.
    Incluye programación unificada por agrupador (version_id).
    """
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise BusinessRuleError("tramo requerido")
    vid = (version_id or "").strip()
    if not vid:
        raise BusinessRuleError("version_id requerido")

    tramos = fetch_tramos_contrato(sb, contrato_id)
    match = next((t for t in tramos if (t.get("tramo") or "").strip() == tramo_s), None)
    if not match:
        raise BusinessRuleError(f"Tramo no encontrado: {tramo_s}")

    pk_ids = [str(p).strip() for p in (match.get("pk_ids") or []) if str(p).strip()]
    if pk_ids_filter:
        allowed = {str(p).strip() for p in pk_ids_filter if str(p).strip()}
        pk_ids = [p for p in pk_ids if p in allowed]
    if not pk_ids:
        return build_estructura_tramo_response(tramo_s, [], {}, [], contrato_id, None)

    cache = CalendarioNoHabilesCache(make_prog_calendar_loader(sb))

    ppto_rows = _fetch_ppto_rows_para_estructura(
        sb,
        contrato_id,
        pk_ids=pk_ids,
        version_ppto_id=version_ppto_id,
    )

    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    agr_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,codigo_wbs,nombre,orden")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    agr_meta: Dict[int, dict] = {}
    for a in agr_rows:
        aid = a.get("id")
        if aid is not None:
            agr_meta[int(aid)] = a

    cap_map = _aggregate_ppto_rows_tramo(ppto_rows, ag_by_item, agr_meta, desc_lp)

    actividades = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,item,agrupador_id,fecha_inicio,duracion_dias_habiles,fecha_fin_calculada,override_manual")
        .eq("version_id", vid)
        .eq("contrato_id", contrato_id)
        .in_("pk_id", pk_ids)
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )

    return build_estructura_tramo_response(tramo_s, pk_ids, cap_map, actividades, contrato_id, cache)


def _build_agrupador_pk_metrics(
    ppto_rows: List[dict],
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
    agr_meta: Dict[int, dict],
) -> Dict[Tuple[str, int, str], dict]:
    """Métricas por (capitulo, agrupador_id, pk_id) para guardado batch tramo."""
    out: Dict[Tuple[str, int, str], dict] = {}
    for r in ppto_rows or []:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        pk = str(r.get("pk_id") or "").strip()
        if not cap or not it or not pk:
            continue
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        if ag_id is None or int(ag_id) not in agr_meta:
            continue
        ag_id_int = int(ag_id)
        key = (cap, ag_id_int, pk)
        ct = Decimal(str(r.get("cant_total") or 0))
        cd = Decimal(str(r.get("costo_directo") or 0))
        vlr = Decimal(str(r.get("vlr_unitario") or 0))
        line_cd = cd if cd > 0 else ct * vlr
        und = (r.get("und") or "?")[:20]
        if key not in out:
            out[key] = {
                "cant_total": Decimal(0),
                "costo_directo": Decimal(0),
                "und": und,
            }
        cur = out[key]
        cur["cant_total"] += ct
        cur["costo_directo"] += line_cd
        if und and und != "?" and cur.get("und") in ("?", ""):
            cur["und"] = und
    for key, v in out.items():
        cant = v["cant_total"]
        costo = v["costo_directo"]
        v["cant_total"] = float(cant)
        v["costo_directo"] = float(costo)
        v["vlr_unitario"] = float(costo / cant) if cant > 0 else 0.0
    return out


def expand_tramo_batch_by_pk(
    actividades: List[dict],
    cap_map: Dict[str, Dict[int, dict]],
    metrics: Dict[Tuple[str, int, str], dict],
    skip_scheduled: Optional[set] = None,
) -> Dict[str, List[dict]]:
    """
    Expande actividades de tramo a filas RPC por pk_id.
    skip_scheduled: set de (capitulo, agrupador_id, pk_id) con fecha manual ya programada (override_manual).
    """
    by_pk: Dict[str, List[dict]] = {}
    for it in actividades or []:
        cap = (it.get("capitulo") or "").strip()
        ag_id = it.get("agrupador_id")
        if not cap or ag_id is None:
            continue
        ag_id_int = int(ag_id)
        ag_bucket = cap_map.get(cap, {})
        ag = ag_bucket.get(ag_id_int)
        if not ag:
            continue
        pk_ids = sorted(ag.get("pk_ids") or set(), key=lambda x: (len(x), x))
        fi = it.get("fecha_inicio")
        fi_d = fi if isinstance(fi, date) else None
        if fi_d is None and fi is not None and str(fi).strip():
            try:
                fi_d = date.fromisoformat(str(fi).strip()[:10])
            except ValueError:
                fi_d = None
        du_raw = it.get("duracion_dias_habiles")
        du_i = int(du_raw) if du_raw is not None and str(du_raw).strip() and int(du_raw) > 0 else None
        item_code = (it.get("codigo_wbs") or it.get("item") or "").strip()
        for pk in pk_ids:
            if skip_scheduled and (cap, ag_id_int, pk) in skip_scheduled:
                continue
            m = metrics.get((cap, ag_id_int, pk))
            if not m:
                continue
            cant = float(m.get("cant_total") or 0)
            if cant <= 0:
                cant = 1.0
            row = {
                "capitulo": cap,
                "item": item_code or str(ag_id_int),
                "segmento": int(it.get("segmento") or 1),
                "fecha_inicio": fi_d.isoformat() if fi_d else None,
                "duracion_dias_habiles": du_i,
                "fecha_fin_calculada": None,
                "clear_schedule": fi_d is None and du_i is None,
                "cantidad_programada": cant,
                "unidad": (m.get("und") or "?")[:20],
                "costo_unitario": float(m.get("vlr_unitario") or 0),
                "tipo_distribucion": it.get("tipo_distribucion") or "lineal",
                "override_manual": (
            False if (fi_d is None and du_i is None)
            else bool(it.get("override_manual", False))
        ),
                "heredado_de_capitulo": bool(it.get("heredado_de_capitulo", False)),
                "agrupador_id": ag_id_int,
                "codigo_wbs": item_code[:50] if item_code else None,
                "_propagate": {
                    "capitulo": cap,
                    "agrupador_id": ag_id_int,
                    "codigo_wbs": item_code,
                    "item": item_code,
                    "fecha_inicio": fi_d,
                    "duracion_dias_habiles": du_i,
                },
            }
            by_pk.setdefault(pk, []).append(row)
    return by_pk


def upsert_actividades_batch_pk(
    sb,
    contrato_id: int,
    version_id: str,
    pk_id: str,
    actividades: List[dict],
    uid: int,
    cache: CalendarioNoHabilesCache,
    skip_propagation: bool = False,
) -> dict:
    """RPC batch + propagación WBS + prog_pk_estado para un PK."""
    from prog_obra_calendar import add_dias_habiles

    pk = (pk_id or "").strip()
    rpc_rows = []
    propagation_items = []
    explicit_clears = []
    for raw in actividades or []:
        row = dict(raw)
        prop = row.pop("_propagate", None)
        clearing = bool(row.pop("clear_schedule", False))
        fi_s = row.get("fecha_inicio")
        fi_d = date.fromisoformat(fi_s[:10]) if fi_s else None
        du_i = row.get("duracion_dias_habiles")
        du_i = int(du_i) if du_i is not None and int(du_i) > 0 else None
        if not clearing and fi_d is None and du_i is None:
            clearing = True
        if clearing:
            row["clear_schedule"] = True
            cap = (row.get("capitulo") or "").strip()
            ag_raw = row.get("agrupador_id")
            item_code = (row.get("item") or "").strip()
            if ag_raw is not None:
                explicit_clears.append((cap, int(ag_raw), item_code))
            elif cap and item_code:
                explicit_clears.append((cap, None, item_code))
        fin = add_dias_habiles(contrato_id, fi_d, du_i, cache) if fi_d and du_i else None
        row["fecha_fin_calculada"] = fin.isoformat() if fin else None
        rpc_rows.append(row)
        if prop and prop.get("agrupador_id") is not None:
            propagation_items.append({**prop, "fecha_inicio": fi_d, "duracion_dias_habiles": du_i})

    if not rpc_rows and not explicit_clears:
        return {"ok": True, "actividades": [], "propagaciones": 0}

    payload = {"ok": True, "actividades": []}
    if rpc_rows:
        res = sb.rpc(
            "prog_batch_upsert_actividades",
            {
                "p_version_id": version_id,
                "p_contrato_id": contrato_id,
                "p_pk_id": pk,
                "p_usuario_id": uid,
                "p_actividades": rpc_rows,
            },
        ).execute()
        payload = res.data or {"ok": True, "actividades": []}

    for cap, ag_id, item_code in explicit_clears:
        if ag_id is not None:
            _clear_prog_agrupador_fechas(sb, version_id, pk, cap, ag_id)
        elif cap and item_code:
            _clear_prog_item_fechas(sb, version_id, pk, cap, item_code)

    propagaciones = 0
    limpiezas_ag = 0
    if propagation_items:
        _, ppto_items_pk = _ppto_items_por_pk(sb, contrato_id, pk)
        seen_ag = set()
        seen_clear = set()
        for prop in propagation_items:
            fi_d = prop.get("fecha_inicio")
            du_i = prop.get("duracion_dias_habiles")
            du_i = int(du_i) if du_i is not None and int(du_i) > 0 else None
            ag_key = (prop["capitulo"].strip(), int(prop["agrupador_id"]))
            if fi_d and du_i:
                if skip_propagation or ag_key in seen_ag:
                    continue
                seen_ag.add(ag_key)
                fin_d = add_dias_habiles(contrato_id, fi_d, du_i, cache)
                propagar_fechas_agrupador_a_hijos(
                    sb,
                    version_id,
                    contrato_id,
                    pk,
                    prop["capitulo"].strip(),
                    int(prop["agrupador_id"]),
                    (prop.get("codigo_wbs") or prop.get("item") or "").strip(),
                    fi_d,
                    du_i,
                    fin_d,
                    uid,
                    cache,
                    ppto_items=ppto_items_pk,
                )
                propagaciones += 1
            elif fi_d is None and du_i is None and ag_key not in seen_clear:
                seen_clear.add(ag_key)
                _clear_prog_agrupador_fechas(
                    sb, version_id, pk, prop["capitulo"].strip(), int(prop["agrupador_id"]),
                )
                limpiar_fechas_agrupador_hijos(
                    sb,
                    version_id,
                    contrato_id,
                    pk,
                    prop["capitulo"].strip(),
                    int(prop["agrupador_id"]),
                    ppto_items=ppto_items_pk,
                )
                limpiezas_ag += 1
        if not skip_propagation:
            upsert_prog_pk_estado(sb, version_id, contrato_id, pk)
    elif explicit_clears and not skip_propagation:
        upsert_prog_pk_estado(sb, version_id, contrato_id, pk)

    if isinstance(payload, dict):
        payload["propagaciones"] = propagaciones
        payload["limpiezas_ag"] = limpiezas_ag
    return payload


def _actividad_batch_es_borrado(it: dict) -> bool:
    """Borrado explícito o fila vacía (sin fecha ni duración)."""
    if it.get("clear_schedule"):
        return True
    if it.get("solo_duracion") or it.get("duracion_only"):
        return False
    fi = it.get("fecha_inicio")
    fi_empty = fi is None or str(fi).strip() == ""
    du_raw = it.get("duracion_dias_habiles")
    try:
        du_i = int(du_raw) if du_raw is not None and str(du_raw).strip() else None
    except (TypeError, ValueError):
        du_i = None
    if fi_empty and du_i is not None and du_i > 0:
        return False
    return fi_empty


def _actividad_batch_es_solo_duracion(it: dict) -> bool:
    """Persistir duración WBS sin tocar fechas (p. ej. antes de CPM)."""
    if _actividad_batch_es_borrado(it):
        return False
    if it.get("solo_duracion") or it.get("duracion_only"):
        return True
    fi = it.get("fecha_inicio")
    fi_empty = fi is None or str(fi).strip() == ""
    du_raw = it.get("duracion_dias_habiles")
    try:
        du_i = int(du_raw) if du_raw is not None and str(du_raw).strip() else None
    except (TypeError, ValueError):
        du_i = None
    return fi_empty and du_i is not None and du_i > 0


def apply_tramo_duraciones_bulk(
    sb,
    contrato_id: int,
    version_id: str,
    tramo: str,
    actividades: List[dict],
    uid: int,
    cache: CalendarioNoHabilesCache,
    pk_ids_filter: Optional[List[str]] = None,
) -> dict:
    """Persiste duracion_dias_habiles en agrupadores WBS (insert/update, sin fechas)."""
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise BusinessRuleError("tramo requerido")

    tramos = fetch_tramos_contrato(sb, contrato_id)
    match = next((t for t in tramos if (t.get("tramo") or "").strip() == tramo_s), None)
    if not match:
        raise BusinessRuleError(f"Tramo no encontrado: {tramo_s}")

    pk_ids = [str(p).strip() for p in (match.get("pk_ids") or []) if str(p).strip()]
    if pk_ids_filter:
        allowed = {str(p).strip() for p in pk_ids_filter if str(p).strip()}
        pk_ids = [p for p in pk_ids if p in allowed]
    if not pk_ids:
        raise BusinessRuleError("No hay PKs en el tramo")

    ppto_rows = (
        sb.table("presupuesto")
        .select("pk_id, capitulo, item, cant_total, und, vlr_unitario, costo_directo")
        .eq("contrato_id", contrato_id)
        .in_("pk_id", pk_ids)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    agr_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,codigo_wbs,nombre,orden")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    agr_meta: Dict[int, dict] = {}
    for a in agr_rows:
        aid = a.get("id")
        if aid is not None:
            agr_meta[int(aid)] = a

    cap_map = _aggregate_ppto_rows_tramo(ppto_rows, ag_by_item, agr_meta)
    metrics = _build_agrupador_pk_metrics(ppto_rows, ag_by_item, agr_meta)
    by_pk = expand_tramo_batch_by_pk(actividades, cap_map, metrics)
    if not by_pk:
        return {"ok": True, "pk_ids": pk_ids, "agrupadores": 0, "filas": 0}

    total_rows = 0
    ag_count = len({
        ((it.get("capitulo") or "").strip(), int(it.get("agrupador_id")))
        for it in (actividades or [])
        if (it.get("capitulo") or "").strip() and it.get("agrupador_id") is not None
    })
    for pk, rows in sorted(by_pk.items(), key=lambda x: x[0]):
        batch = [{**r, "_propagate": dict(r["_propagate"])} for r in rows]
        upsert_actividades_batch_pk(
            sb,
            contrato_id,
            version_id,
            pk,
            batch,
            uid,
            cache,
            skip_propagation=True,
        )
        total_rows += len(rows)

    return {"ok": True, "pk_ids": pk_ids, "agrupadores": ag_count, "filas": total_rows}


def apply_tramo_clear_schedule_bulk(
    sb,
    contrato_id: int,
    version_id: str,
    tramo: str,
    actividades: List[dict],
    uid: int,
    pk_ids_filter: Optional[List[str]] = None,
    skip_scheduled: Optional[set] = None,
) -> dict:
    """Borra fechas de agrupadores WBS en todos los PKs del tramo con pocas queries."""
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise BusinessRuleError("tramo requerido")

    tramos = fetch_tramos_contrato(sb, contrato_id)
    match = next((t for t in tramos if (t.get("tramo") or "").strip() == tramo_s), None)
    if not match:
        raise BusinessRuleError(f"Tramo no encontrado: {tramo_s}")

    pk_ids = [str(p).strip() for p in (match.get("pk_ids") or []) if str(p).strip()]
    if pk_ids_filter:
        allowed = {str(p).strip() for p in pk_ids_filter if str(p).strip()}
        pk_ids = [p for p in pk_ids if p in allowed]
    if not pk_ids:
        raise BusinessRuleError("No hay PKs en el tramo")

    ag_keys: set = set()
    for it in actividades or []:
        cap = (it.get("capitulo") or "").strip()
        ag = it.get("agrupador_id")
        if cap and ag is not None:
            ag_keys.add((cap, int(ag)))
    if not ag_keys:
        return {"ok": True, "pk_ids": [], "agrupadores": 0}

    ag_ids = sorted({k[1] for k in ag_keys})
    skip = skip_scheduled if skip_scheduled is not None else set()
    now = datetime.now(timezone.utc).isoformat()
    clear_payload = {
        "fecha_inicio": None,
        "duracion_dias_habiles": None,
        "fecha_fin_calculada": None,
        "fecha_inicio_temprana": None,
        "fecha_fin_temprana": None,
        "heredado_de_capitulo": False,
        "override_manual": False,
        "actualizado_en": now,
    }

    for cap, ag_id in ag_keys:
        pks_hit = [p for p in pk_ids if (cap, ag_id, p) not in skip]
        if not pks_hit:
            continue
        (
            sb.table("prog_actividades")
            .update(clear_payload)
            .eq("version_id", version_id)
            .eq("contrato_id", contrato_id)
            .in_("pk_id", pks_hit)
            .eq("capitulo", cap)
            .eq("agrupador_id", ag_id)
            .execute()
        )
    lp_rows = (
        sb.table("listado_precios")
        .select("capitulo,item_numero,agrupador_id")
        .eq("contrato_id", contrato_id)
        .in_("agrupador_id", ag_ids)
        .execute()
        .data
        or []
    )
    items_by_cap: Dict[str, set] = {}
    for r in lp_rows:
        cap = (r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        if ag_raw is None:
            continue
        if (cap, int(ag_raw)) not in ag_keys:
            continue
        it = (r.get("item_numero") or "").strip()
        if cap and it:
            items_by_cap.setdefault(cap, set()).add(it)
    hijo_payload = {
        "fecha_inicio": None,
        "duracion_dias_habiles": None,
        "fecha_fin_calculada": None,
        "heredado_de_capitulo": False,
        "actualizado_en": now,
    }
    for cap, items in items_by_cap.items():
        pks_hit = sorted({
            p for p in pk_ids
            for ag_id in ag_ids
            if (cap, ag_id) in ag_keys and (cap, ag_id, p) not in skip
        })
        if not pks_hit or not items:
            continue
        (
            sb.table("prog_actividades")
            .update(hijo_payload)
            .eq("version_id", version_id)
            .in_("pk_id", pks_hit)
            .eq("capitulo", cap)
            .eq("segmento", 1)
            .eq("override_manual", False)
            .in_("item", list(items))
            .execute()
        )

    (
        sb.table("prog_actividades_capitulo")
        .delete()
        .eq("version_id", version_id)
        .in_("pk_id", pk_ids)
        .execute()
    )
    _reset_prog_pk_estado_tramo(sb, version_id, contrato_id, pk_ids)

    return {"ok": True, "pk_ids": pk_ids, "agrupadores": len(ag_keys)}


def apply_actividades_batch_tramo(
    sb,
    contrato_id: int,
    version_id: str,
    tramo: str,
    actividades: List[dict],
    uid: int,
    cache: CalendarioNoHabilesCache,
    pk_ids_filter: Optional[List[str]] = None,
    allow_overwrite: bool = False,
    preserve_cpm_sync: bool = False,
) -> dict:
    """Guarda fechas de agrupadores en todos los PKs del tramo que los contienen."""
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise BusinessRuleError("tramo requerido")

    clear_items = [it for it in (actividades or []) if _actividad_batch_es_borrado(it)]
    dur_only_items = [it for it in (actividades or []) if _actividad_batch_es_solo_duracion(it)]
    set_items = [
        it for it in (actividades or [])
        if not _actividad_batch_es_borrado(it) and not _actividad_batch_es_solo_duracion(it)
    ]

    tramos = fetch_tramos_contrato(sb, contrato_id)
    match = next((t for t in tramos if (t.get("tramo") or "").strip() == tramo_s), None)
    if not match:
        raise BusinessRuleError(f"Tramo no encontrado: {tramo_s}")

    pk_ids = [str(p).strip() for p in (match.get("pk_ids") or []) if str(p).strip()]
    if pk_ids_filter:
        allowed = {str(p).strip() for p in pk_ids_filter if str(p).strip()}
        pk_ids = [p for p in pk_ids if p in allowed]
    if not pk_ids:
        raise BusinessRuleError("No hay PKs en el tramo")

    if not clear_items and not set_items and not dur_only_items:
        raise BusinessRuleError("Sin actividades para guardar")

    if dur_only_items and not clear_items and not set_items:
        dr = apply_tramo_duraciones_bulk(
            sb, contrato_id, version_id, tramo_s, dur_only_items, uid, cache,
            pk_ids_filter=pk_ids_filter,
        )
        if preserve_cpm_sync:
            mark_cpm_synced(sb, version_id)
        else:
            mark_cpm_dirty(sb, version_id)
        return {
            "ok": True,
            "tramo": tramo_s,
            "pk_ids": list(dr.get("pk_ids") or []),
            "actividades_enviadas": len(dur_only_items),
            "propagaciones": 0,
            "omitidos_pk_con_fecha": 0,
            "cpm_dirty": not preserve_cpm_sync,
            "bulk_duraciones": int(dr.get("agrupadores") or 0),
        }

    if dur_only_items:
        apply_tramo_duraciones_bulk(
            sb, contrato_id, version_id, tramo_s, dur_only_items, uid, cache,
            pk_ids_filter=pk_ids_filter,
        )

    if not set_items and clear_items:
        skip_scheduled_only: set = set()
        if not allow_overwrite:
            existing_clear = (
                sb.table("prog_actividades")
                .select("pk_id,capitulo,agrupador_id,fecha_inicio,override_manual")
                .eq("version_id", version_id)
                .eq("contrato_id", contrato_id)
                .in_("pk_id", pk_ids)
                .not_.is_("agrupador_id", "null")
                .execute()
                .data
                or []
            )
            for a in existing_clear:
                fi = a.get("fecha_inicio")
                if fi is None or str(fi).strip() == "":
                    continue
                if not a.get("override_manual"):
                    continue
                cap_e = (a.get("capitulo") or "").strip()
                pk_e = str(a.get("pk_id") or "").strip()
                ag_e = a.get("agrupador_id")
                if cap_e and pk_e and ag_e is not None:
                    skip_scheduled_only.add((cap_e, int(ag_e), pk_e))
        cr = apply_tramo_clear_schedule_bulk(
            sb,
            contrato_id,
            version_id,
            tramo_s,
            clear_items,
            uid,
            pk_ids_filter=pk_ids_filter,
            skip_scheduled=skip_scheduled_only if not allow_overwrite else None,
        )
        if preserve_cpm_sync:
            mark_cpm_synced(sb, version_id)
        else:
            mark_cpm_dirty(sb, version_id)
        return {
            "ok": True,
            "tramo": tramo_s,
            "pk_ids": list(cr.get("pk_ids") or []),
            "actividades_enviadas": 0,
            "propagaciones": 0,
            "omitidos_pk_con_fecha": 0,
            "cpm_dirty": not preserve_cpm_sync,
            "bulk_cleared": int(cr.get("agrupadores") or 0),
        }

    ppto_rows = (
        sb.table("presupuesto")
        .select("pk_id, capitulo, item, cant_total, und, vlr_unitario, costo_directo")
        .eq("contrato_id", contrato_id)
        .in_("pk_id", pk_ids)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    agr_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,codigo_wbs,nombre,orden")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    agr_meta: Dict[int, dict] = {}
    for a in agr_rows:
        aid = a.get("id")
        if aid is not None:
            agr_meta[int(aid)] = a

    cap_map = _aggregate_ppto_rows_tramo(ppto_rows, ag_by_item, agr_meta)
    metrics = _build_agrupador_pk_metrics(ppto_rows, ag_by_item, agr_meta)

    existing = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,agrupador_id,fecha_inicio,duracion_dias_habiles,fecha_fin_calculada,override_manual")
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .in_("pk_id", pk_ids)
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )
    skip_scheduled: set = set()
    if not allow_overwrite:
        for a in existing:
            fi = a.get("fecha_inicio")
            if fi is None or str(fi).strip() == "":
                continue
            if not a.get("override_manual"):
                continue
            cap_e = (a.get("capitulo") or "").strip()
            pk_e = str(a.get("pk_id") or "").strip()
            ag_e = a.get("agrupador_id")
            if cap_e and pk_e and ag_e is not None:
                skip_scheduled.add((cap_e, int(ag_e), pk_e))

    bulk_cleared = 0
    pks_from_clear: List[str] = []
    if clear_items:
        cr = apply_tramo_clear_schedule_bulk(
            sb,
            contrato_id,
            version_id,
            tramo_s,
            clear_items,
            uid,
            pk_ids_filter=pk_ids_filter,
            skip_scheduled=skip_scheduled if not allow_overwrite else None,
        )
        bulk_cleared = int(cr.get("agrupadores") or 0)
        pks_from_clear = list(cr.get("pk_ids") or [])

    omitidos = 0
    for it in set_items or []:
        cap_it = (it.get("capitulo") or "").strip()
        ag_it = it.get("agrupador_id")
        if not cap_it or ag_it is None:
            continue
        ag_id_it = int(ag_it)
        ag = cap_map.get(cap_it, {}).get(ag_id_it)
        if not ag:
            continue
        for pk in ag.get("pk_ids") or []:
            if (cap_it, ag_id_it, str(pk).strip()) in skip_scheduled:
                omitidos += 1

    by_pk = expand_tramo_batch_by_pk(set_items, cap_map, metrics, skip_scheduled=skip_scheduled)

    if not by_pk and not clear_items:
        raise BusinessRuleError(
            "Ningún PK pendiente de programación para los agrupadores indicados "
            "(los PKs que ya tenían fecha se conservan sin cambios)."
        )

    total_rows = 0
    total_prop = 0
    pks_affected = list(pks_from_clear)
    if by_pk:
        for pk, rows in sorted(by_pk.items(), key=lambda x: x[0]):
            batch = [{**r, "_propagate": dict(r["_propagate"])} for r in rows]
            result = upsert_actividades_batch_pk(
                sb,
                contrato_id,
                version_id,
                pk,
                batch,
                uid,
                cache,
                skip_propagation=allow_overwrite,
            )
            total_rows += len(rows)
            total_prop += int(result.get("propagaciones") or 0)
            if pk not in pks_affected:
                pks_affected.append(pk)

    if preserve_cpm_sync:
        mark_cpm_synced(sb, version_id)
    else:
        mark_cpm_dirty(sb, version_id)
    return {
        "ok": True,
        "tramo": tramo_s,
        "pk_ids": pks_affected,
        "actividades_enviadas": total_rows,
        "propagaciones": total_prop,
        "omitidos_pk_con_fecha": omitidos,
        "cpm_dirty": not preserve_cpm_sync,
        "bulk_cleared": bulk_cleared,
    }


def fetch_sin_agrupador_count_by_pk(sb, contrato_id: int) -> Dict[str, int]:
    """Cuenta ítems de presupuesto poligonal sin agrupador WBS válido, por PK."""
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    agr_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    agr_validos: set = set()
    for a in agr_rows:
        aid = a.get("id")
        if aid is not None:
            try:
                agr_validos.add(int(aid))
            except (TypeError, ValueError):
                pass

    rows = (
        sb.table("presupuesto")
        .select("pk_id,capitulo,item,cant_total")
        .eq("contrato_id", contrato_id)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    agg: Dict[Tuple[str, str, str], float] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        it = str(r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        try:
            ct = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            ct = 0.0
        key = (pk, cap, it)
        agg[key] = agg.get(key, 0.0) + ct

    counts: Dict[str, int] = {}
    for (pk, cap, it), cant in agg.items():
        if cant <= 0:
            continue
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        sin = False
        if ag_id is None:
            sin = True
        else:
            try:
                sin = int(ag_id) not in agr_validos
            except (TypeError, ValueError):
                sin = True
        if sin:
            counts[pk] = counts.get(pk, 0) + 1
    return counts


def enrich_mapa_rows_sin_agrupador(rows: List[dict], counts_by_pk: Dict[str, int]) -> List[dict]:
    out: List[dict] = []
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        out.append({**r, "items_sin_agrupador": int(counts_by_pk.get(pk, 0))})
    return out


def propagar_fechas_agrupador_a_hijos(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    codigo_wbs: str,
    fecha_inicio: date,
    duracion_dias_habiles: int,
    fecha_fin_calculada: Optional[date],
    usuario_id: int,
    cache: CalendarioNoHabilesCache,
    ppto_items: Optional[List[Tuple[str, str, Decimal, str, Decimal]]] = None,
    ag_by_item: Optional[Dict[Tuple[str, str], Optional[int]]] = None,
    insert_missing: bool = True,
) -> int:
    """Replica fechas del agrupador a ítems hijo: UPDATE masivo; INSERT opcional si faltan filas."""
    cap = capitulo.strip()
    pk = pk_id.strip()
    if ppto_items is None:
        _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk)
    if ag_by_item is None:
        ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)

    hijo_ppto = [
        (p_cap, it, cant, und, vlr)
        for p_cap, it, cant, und, vlr in ppto_items
        if p_cap == cap and _resolve_listado_agrupador_id(ag_by_item, p_cap, it) == agrupador_id
    ]
    if not hijo_ppto:
        ag_items_list = [
            (r.get("item_numero") or "").strip()
            for r in (
                sb.table("listado_precios")
                .select("item_numero")
                .eq("contrato_id", contrato_id)
                .eq("capitulo", cap)
                .eq("agrupador_id", agrupador_id)
                .execute()
                .data
                or []
            )
            if (r.get("item_numero") or "").strip()
        ]
        if not ag_items_list:
            return 0
        ag_items_set = set(ag_items_list)
        hijo_ppto = [
            (p_cap, it, cant, und, vlr)
            for p_cap, it, cant, und, vlr in ppto_items
            if p_cap == cap and _ppto_item_in_listado_set(it, ag_items_set)
        ]
        if not hijo_ppto:
            return 0

    ag_items_list = [it for _, it, _, _, _ in hijo_ppto]

    fin_iso = fecha_fin_calculada.isoformat() if fecha_fin_calculada else None
    fi_iso = fecha_inicio.isoformat()
    now = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "fecha_inicio": fi_iso,
        "duracion_dias_habiles": int(duracion_dias_habiles),
        "fecha_fin_calculada": fin_iso,
        "heredado_de_capitulo": True,
        "override_manual": False,
        "agrupador_id": agrupador_id,
        "codigo_wbs": codigo_wbs or None,
        "actualizado_en": now,
    }

    existing_rows = (
        sb.table("prog_actividades")
        .select("item")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .eq("capitulo", cap)
        .eq("segmento", 1)
        .in_("item", ag_items_list)
        .execute()
        .data
        or []
    )
    existing_items = {(r.get("item") or "").strip() for r in existing_rows if (r.get("item") or "").strip()}
    items_to_update = sorted(i for i in ag_items_list if i.strip() in existing_items)
    if items_to_update:
        sb.table("prog_actividades").update(update_fields).eq("version_id", version_id).eq(
            "pk_id", pk
        ).eq("capitulo", cap).eq("segmento", 1).eq("override_manual", False).in_(
            "item", items_to_update
        ).execute()

    if not insert_missing:
        return len(items_to_update)

    missing = [
        (p_cap, it, cant, und, vlr)
        for p_cap, it, cant, und, vlr in hijo_ppto
        if (it or "").strip() not in existing_items
    ]
    if missing:
        upsert_rows = [
            {
                "version_id": version_id,
                "contrato_id": contrato_id,
                "pk_id": pk,
                "capitulo": p_cap,
                "item": it,
                "segmento": 1,
                "fecha_inicio": fi_iso,
                "duracion_dias_habiles": int(duracion_dias_habiles),
                "fecha_fin_calculada": fin_iso,
                "cantidad_programada": float(cant),
                "unidad": und or "?",
                "costo_unitario": float(vlr),
                "tipo_distribucion": "lineal",
                "heredado_de_capitulo": True,
                "override_manual": False,
                "agrupador_id": agrupador_id,
                "codigo_wbs": codigo_wbs or None,
                "creado_por": usuario_id,
                "actualizado_en": now,
            }
            for p_cap, it, cant, und, vlr in missing
        ]
        sb.table("prog_actividades").upsert(
            upsert_rows,
            on_conflict="version_id,pk_id,capitulo,item,segmento",
        ).execute()

    return len(hijo_ppto)


def limpiar_fechas_agrupador_hijos(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    ppto_items: Optional[List[Tuple[str, str, Decimal, str, Decimal]]] = None,
) -> int:
    """Quita fechas heredadas del agrupador en ítems hijo (override_manual=false)."""
    cap = capitulo.strip()
    pk = pk_id.strip()
    ag_items_list = [
        (r.get("item_numero") or "").strip()
        for r in (
            sb.table("listado_precios")
            .select("item_numero")
            .eq("contrato_id", contrato_id)
            .eq("capitulo", cap)
            .eq("agrupador_id", agrupador_id)
            .execute()
            .data
            or []
        )
        if (r.get("item_numero") or "").strip()
    ]
    if not ag_items_list:
        return 0
    ag_items_set = set(ag_items_list)
    if ppto_items is None:
        _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk)
    hijo_ppto = [
        (p_cap, it, cant, und, vlr)
        for p_cap, it, cant, und, vlr in ppto_items
        if p_cap == cap and it in ag_items_set
    ]
    if not hijo_ppto:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_actividades").update(
        {
            "fecha_inicio": None,
            "duracion_dias_habiles": None,
            "fecha_fin_calculada": None,
            "heredado_de_capitulo": False,
            "actualizado_en": now,
        }
    ).eq("version_id", version_id).eq("pk_id", pk).eq("capitulo", cap).eq("segmento", 1).eq(
        "override_manual", False
    ).in_("item", ag_items_list).execute()
    return len(hijo_ppto)


def _clear_prog_agrupador_fechas(
    sb,
    version_id: str,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
) -> None:
    """Borra fechas manual y CPM write-back de todas las filas WBS del agrupador en un PK."""
    cap = capitulo.strip()
    pk = pk_id.strip()
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "fecha_inicio": None,
        "duracion_dias_habiles": None,
        "fecha_fin_calculada": None,
        "fecha_inicio_temprana": None,
        "fecha_fin_temprana": None,
        "heredado_de_capitulo": False,
        "override_manual": False,
        "actualizado_en": now,
    }
    (
        sb.table("prog_actividades")
        .update(payload)
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .eq("capitulo", cap)
        .eq("agrupador_id", int(agrupador_id))
        .execute()
    )


def _clear_prog_item_fechas(
    sb,
    version_id: str,
    pk_id: str,
    capitulo: str,
    item: str,
    segmento: int = 1,
) -> None:
    """Borra fechas de un ítem suelto (sin agrupador WBS)."""
    now = datetime.now(timezone.utc).isoformat()
    (
        sb.table("prog_actividades")
        .update({
            "fecha_inicio": None,
            "duracion_dias_habiles": None,
            "fecha_fin_calculada": None,
            "fecha_inicio_temprana": None,
            "fecha_fin_temprana": None,
            "heredado_de_capitulo": False,
            "override_manual": False,
            "actualizado_en": now,
        })
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .eq("capitulo", capitulo.strip())
        .eq("item", item.strip())
        .eq("segmento", int(segmento or 1))
        .execute()
    )


def _actividad_tiene_fecha_programacion(row: dict) -> bool:
    """Fecha efectiva para color de polígono: manual (fecha_inicio) o write-back CPM (temprana)."""
    for key in ("fecha_inicio", "fecha_inicio_temprana"):
        val = row.get(key)
        if val is not None and str(val).strip() != "":
            return True
    return False


def _count_items_con_fecha(sb, version_id: str, pk_id: str, contrato_id: int) -> int:
    """
    Ítems de presupuesto del PK con programación efectiva.
    Cuenta fecha directa en el ítem o herencia vía agrupador WBS con fecha (prog_actividades.agrupador_id).
    """
    pk = (pk_id or "").strip()
    _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk)
    if not ppto_items:
        return 0
    ppto_keys = {(cap, it) for cap, it, _, _, _ in ppto_items}
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,item,fecha_inicio,fecha_inicio_temprana,agrupador_id")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
        .data
        or []
    )
    direct_with_fecha: set = set()
    agrupadores_con_fecha: set = set()
    for r in rows:
        if not _actividad_tiene_fecha_programacion(r):
            continue
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        ag_id = r.get("agrupador_id")
        if ag_id is not None:
            try:
                agrupadores_con_fecha.add((cap, int(ag_id)))
            except (TypeError, ValueError):
                pass
        if cap and it and (cap, it) in ppto_keys:
            direct_with_fecha.add((cap, it))

    seen: set = set()
    for cap, it in ppto_keys:
        if (cap, it) in direct_with_fecha:
            seen.add((cap, it))
            continue
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        if ag_id is not None:
            try:
                if (cap, int(ag_id)) in agrupadores_con_fecha:
                    seen.add((cap, it))
            except (TypeError, ValueError):
                pass
    return len(seen)


def _count_ppto_items_fecha_inicio_directo(
    sb, version_id: str, contrato_id: int, pk_id: str
) -> int:
    """Ítems de presupuesto del PK con fecha_inicio explícita en prog_actividades (sin herencia WBS)."""
    pk = (pk_id or "").strip()
    _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk)
    ppto_keys = {(cap, it) for cap, it, _, _, _ in ppto_items}
    if not ppto_keys:
        return 0
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,item,fecha_inicio")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
        .data
        or []
    )
    direct: set = set()
    for r in rows:
        fi = r.get("fecha_inicio")
        if fi is None or str(fi).strip() == "":
            continue
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if cap and it and (cap, it) in ppto_keys:
            direct.add((cap, it))
    return len(direct)


def _snapshot_cpm_writeback_fechas_pk(
    sb, version_id: str, contrato_id: int, pk_id: str
) -> dict:
    """Conteos de fechas por PK para diagnóstico post-CPM."""
    pk = (pk_id or "").strip()
    items_total, _ = _ppto_items_por_pk(sb, contrato_id, pk)
    return {
        "items_total": items_total,
        "fecha_inicio_directo": _count_ppto_items_fecha_inicio_directo(sb, version_id, contrato_id, pk),
        "conteo_efectivo": _count_items_con_fecha(sb, version_id, pk, contrato_id),
        "sin_agrupador": _count_items_sin_agrupador(sb, contrato_id, pk),
    }


def _log_cpm_writeback_fechas_pks(
    sb,
    version_id: str,
    contrato_id: int,
    pk_ids: List[str],
    before: Dict[str, dict],
    after: Dict[str, dict],
) -> None:
    for pk in sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()}):
        b = before.get(pk) or {}
        a = after.get(pk) or {}
        _logger.info(
            "CPM write-back visible PK=%s: fecha_inicio directo %d→%d, conteo efectivo %d→%d "
            "(items_total=%d, sin_agrupador=%d→%d)",
            pk,
            int(b.get("fecha_inicio_directo") or 0),
            int(a.get("fecha_inicio_directo") or 0),
            int(b.get("conteo_efectivo") or 0),
            int(a.get("conteo_efectivo") or 0),
            int(a.get("items_total") or b.get("items_total") or 0),
            int(b.get("sin_agrupador") or 0),
            int(a.get("sin_agrupador") or 0),
        )
        if int(a.get("fecha_inicio_directo") or 0) < int(a.get("items_total") or 0):
            faltantes = _ppto_items_sin_fecha_inicio_directo(sb, version_id, contrato_id, pk, limit=5)
            if faltantes:
                _logger.warning(
                    "CPM write-back visible PK=%s: %d ítems ppto aún sin fecha_inicio. Ej: %s",
                    pk,
                    int(a.get("items_total") or 0) - int(a.get("fecha_inicio_directo") or 0),
                    ", ".join(faltantes),
                )


def _ppto_items_sin_fecha_inicio_directo(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    limit: int = 5,
) -> List[str]:
    pk = (pk_id or "").strip()
    _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk)
    if not ppto_items:
        return []
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,item,fecha_inicio")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
        .data
        or []
    )
    with_fi = {
        ((r.get("capitulo") or "").strip(), (r.get("item") or "").strip())
        for r in rows
        if r.get("fecha_inicio") is not None and str(r.get("fecha_inicio")).strip() != ""
    }
    out: List[str] = []
    for cap, it, _, _, _ in ppto_items:
        if (cap, it) in with_fi:
            continue
        out.append(f"{cap}/{it}")
        if len(out) >= limit:
            break
    return out


def _prog_actividades_agrupador_index(
    sb, version_id: str, pk_ids: List[str]
) -> Tuple[Dict[tuple, List[str]], Dict[tuple, List[dict]]]:
    """Índice (pk, cap, ag_id) → ids de cabecera WBS y filas del agrupador."""
    ids_by_key: Dict[tuple, List[str]] = {}
    rows_by_key: Dict[tuple, List[dict]] = {}
    pks = sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()})
    if not pks:
        return ids_by_key, rows_by_key
    existing = (
        sb.table("prog_actividades")
        .select("id,pk_id,capitulo,agrupador_id,item,codigo_wbs")
        .eq("version_id", version_id)
        .in_("pk_id", pks)
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )
    for row in existing:
        pk = str(row.get("pk_id") or "").strip()
        cap = str(row.get("capitulo") or "").strip()
        ag_raw = row.get("agrupador_id")
        if not pk or not cap or ag_raw is None:
            continue
        try:
            ag_id = int(ag_raw)
        except (TypeError, ValueError):
            continue
        sig = (pk, cap, ag_id)
        rows_by_key.setdefault(sig, []).append(row)
    for sig, rows in rows_by_key.items():
        header = next((r for r in rows if _is_agrupador_header_row(r)), None)
        pick = header or (rows[0] if rows else None)
        rid = str((pick or {}).get("id") or "").strip()
        if rid:
            ids_by_key[sig] = [rid]
    return ids_by_key, rows_by_key


def _agrupadores_validos_por_contrato(sb, contrato_id: int) -> set:
    rows = (
        sb.table("listado_precios_agrupadores")
        .select("id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    out: set = set()
    for r in rows:
        aid = r.get("id")
        if aid is not None:
            try:
                out.add(int(aid))
            except (TypeError, ValueError):
                pass
    return out


def _count_items_sin_agrupador(sb, contrato_id: int, pk_id: str) -> int:
    """
    Ítems de presupuesto del PK sin agrupador WBS asignado (no programables en modal WBS).
    Misma regla que fetch_estructura_programacion_pk → sin_agrupador.
    """
    _, ppto_items = _ppto_items_por_pk(sb, contrato_id, pk_id)
    if not ppto_items:
        return 0
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    agr_validos = _agrupadores_validos_por_contrato(sb, contrato_id)
    n = 0
    for cap, it, _, _, _ in ppto_items:
        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        if ag_id is None:
            n += 1
            continue
        try:
            if int(ag_id) not in agr_validos:
                n += 1
        except (TypeError, ValueError):
            n += 1
    return n


def _compute_estado_pk(items_total: int, items_con_fecha: int, items_sin_agrupador: int = 0) -> str:
    if items_total <= 0:
        return "sin_cantidad"
    if items_con_fecha <= 0:
        return "sin_iniciar"
    if items_con_fecha >= items_total:
        if items_sin_agrupador > 0:
            return "en_progreso"
        return "completa"
    return "en_progreso"


def _items_total_por_pks(sb, contrato_id: int, pk_ids: List[str]) -> Dict[str, int]:
    """Cuenta ítems distintos del presupuesto vigente por PK."""
    pks = [str(p).strip() for p in (pk_ids or []) if str(p).strip()]
    if not pks:
        return {}
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    rows = fetch_ppto_rows_programacion(
        sb, contrato_id, pk_ids=set(pks), force_vigente=True,
    )
    if not rows:
        rows = (
            sb.table("presupuesto")
            .select("pk_id,capitulo,item")
            .eq("contrato_id", contrato_id)
            .in_("pk_id", pks)
            .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
            .eq("dado_de_baja", False)
            .execute()
            .data
            or []
        )
    seen: Dict[str, set] = {}
    counts: Dict[str, int] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        key = (cap, it)
        bucket = seen.setdefault(pk, set())
        if key in bucket:
            continue
        bucket.add(key)
        counts[pk] = counts.get(pk, 0) + 1
    return counts


def _reset_prog_pk_estado_tramo(
    sb,
    version_id: str,
    contrato_id: int,
    pk_ids: List[str],
) -> None:
    """Recalcula prog_pk_estado tras borrar programación del tramo (sin escanear actividades)."""
    totals = _items_total_por_pks(sb, contrato_id, pk_ids)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for pk in pk_ids:
        pk_s = str(pk).strip()
        if not pk_s:
            continue
        total = int(totals.get(pk_s, 0))
        rows.append({
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id": pk_s,
            "estado_programacion": "sin_iniciar" if total > 0 else "sin_cantidad",
            "items_total": total,
            "items_con_fecha": 0,
            "actualizado_en": now,
        })
    if rows:
        sb.table("prog_pk_estado").upsert(rows, on_conflict="version_id,pk_id").execute()


def _ppto_keys_por_pks(sb, contrato_id: int, pk_ids: List[str]) -> Dict[str, set]:
    """Claves (capitulo, item) del presupuesto vigente por PK."""
    pks = sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()})
    if not pks:
        return {}
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    rows = fetch_ppto_rows_programacion(
        sb, contrato_id, pk_ids=set(pks), force_vigente=True,
    )
    if not rows:
        rows = (
            sb.table("presupuesto")
            .select("pk_id,capitulo,item")
            .eq("contrato_id", contrato_id)
            .in_("pk_id", pks)
            .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
            .eq("dado_de_baja", False)
            .execute()
            .data
            or []
        )
    out: Dict[str, set] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if pk and cap and it:
            out.setdefault(pk, set()).add((cap, it))
    return out


def _count_items_con_fecha_bulk(
    sb,
    version_id: str,
    contrato_id: int,
    pk_ids: List[str],
    ppto_keys_by_pk: Optional[Dict[str, set]] = None,
    ag_by_item: Optional[Dict[Tuple[str, str], Optional[int]]] = None,
) -> Dict[str, int]:
    """Ítems con programación efectiva por PK (2 consultas + memoria)."""
    pks = sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()})
    if not pks:
        return {}
    if ppto_keys_by_pk is None:
        ppto_keys_by_pk = _ppto_keys_por_pks(sb, contrato_id, pks)
    if ag_by_item is None:
        ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)

    rows = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,item,fecha_inicio,fecha_inicio_temprana,agrupador_id")
        .eq("version_id", version_id)
        .in_("pk_id", pks)
        .execute()
        .data
        or []
    )
    direct_by_pk: Dict[str, set] = {pk: set() for pk in pks}
    agr_fecha_by_pk: Dict[str, set] = {pk: set() for pk in pks}
    for r in rows:
        if not _actividad_tiene_fecha_programacion(r):
            continue
        pk = str(r.get("pk_id") or "").strip()
        if pk not in direct_by_pk:
            continue
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        ag_id = r.get("agrupador_id")
        if ag_id is not None:
            try:
                agr_fecha_by_pk[pk].add((cap, int(ag_id)))
            except (TypeError, ValueError):
                pass
        ppto_keys = ppto_keys_by_pk.get(pk) or set()
        if cap and it and (cap, it) in ppto_keys:
            direct_by_pk[pk].add((cap, it))

    counts: Dict[str, int] = {}
    for pk in pks:
        ppto_keys = ppto_keys_by_pk.get(pk) or set()
        seen: set = set()
        for cap, it in ppto_keys:
            if (cap, it) in direct_by_pk.get(pk, set()):
                seen.add((cap, it))
                continue
            ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
            if ag_id is not None:
                try:
                    if (cap, int(ag_id)) in agr_fecha_by_pk.get(pk, set()):
                        seen.add((cap, it))
                except (TypeError, ValueError):
                    pass
        counts[pk] = len(seen)
    return counts


def upsert_prog_pk_estado_bulk(
    sb, version_id: str, contrato_id: int, pk_ids: List[str]
) -> None:
    """Actualiza prog_pk_estado para N PKs en pocas consultas."""
    pks = sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()})
    if not pks:
        return
    totals = _items_total_por_pks(sb, contrato_id, pks)
    ppto_keys_by_pk = _ppto_keys_por_pks(sb, contrato_id, pks)
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    cf_by_pk = _count_items_con_fecha_bulk(
        sb, version_id, contrato_id, pks, ppto_keys_by_pk, ag_by_item,
    )
    sin_ag_all = fetch_sin_agrupador_count_by_pk(sb, contrato_id)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for pk in pks:
        total = int(totals.get(pk, 0))
        cf = int(cf_by_pk.get(pk, 0))
        sin_ag = int(sin_ag_all.get(pk, 0))
        rows.append({
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id": pk,
            "estado_programacion": _compute_estado_pk(total, cf, sin_ag),
            "items_total": total,
            "items_con_fecha": min(cf, total) if total > 0 else 0,
            "actualizado_en": now,
        })
    if rows:
        sb.table("prog_pk_estado").upsert(rows, on_conflict="version_id,pk_id").execute()


def upsert_prog_pk_estado(sb, version_id: str, contrato_id: int, pk_id: str) -> None:
    pk = (pk_id or "").strip()
    items_total, _ = _ppto_items_por_pk(sb, contrato_id, pk)   # query 1
    items_cf = _count_items_con_fecha(sb, version_id, pk, contrato_id)       # query 2
    items_sin_ag = _count_items_sin_agrupador(sb, contrato_id, pk)           # query 3
    estado = _compute_estado_pk(items_total, items_cf, items_sin_ag)
    sb.table("prog_pk_estado").upsert(                          # query 3 (antes: 4)
        {
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id": pk,
            "estado_programacion": estado,
            "items_total": items_total,
            "items_con_fecha": min(items_cf, items_total) if items_total > 0 else 0,
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="version_id,pk_id",
    ).execute()


def ensure_prog_pk_estado_all(sb, version_id: str, contrato_id: int) -> None:
    for pk in _all_pks_contrato(sb, contrato_id):
        upsert_prog_pk_estado(sb, version_id, contrato_id, pk)


def _all_pks_contrato(sb, contrato_id: int) -> List[str]:
    """PKs del contrato: unión de pk_ids y presupuesto poligonal activo."""
    pks: set = set()
    for r in sb.table("pk_ids").select("pk_id").eq("contrato_id", contrato_id).execute().data or []:
        pk = str(r.get("pk_id") or "").strip()
        if pk:
            pks.add(pk)
    rows = (
        sb.table("presupuesto")
        .select("pk_id")
        .eq("contrato_id", contrato_id)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        if pk:
            pks.add(pk)
    return sorted(pks)


_SYNC_PAGE = 1000
_SYNC_PK_ESTADO_CHUNK = 150


def _fetch_actividades_version_all(sb, version_id: str, contrato_id: int) -> List[dict]:
    """Todas las actividades de una versión (paginado)."""
    out: List[dict] = []
    off = 0
    cols = "id,pk_id,capitulo,item,segmento,cantidad_programada"
    while True:
        batch = (
            sb.table("prog_actividades")
            .select(cols)
            .eq("version_id", version_id)
            .eq("contrato_id", int(contrato_id))
            .range(off, off + _SYNC_PAGE - 1)
            .execute()
            .data
            or []
        )
        out.extend(batch)
        if len(batch) < _SYNC_PAGE:
            break
        off += _SYNC_PAGE
    return out


def _build_ppto_item_map_contrato(
    sb, contrato_id: int,
) -> Dict[str, Dict[Tuple[str, str], Tuple[Decimal, str, Decimal]]]:
    """Mapa pk → (capitulo, item) → (cant_total, und, vlr) desde presupuesto vigente."""
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    rows = fetch_ppto_rows_programacion(sb, contrato_id, force_vigente=True)
    agg: Dict[str, Dict[Tuple[str, str], Dict[str, Any]]] = defaultdict(dict)
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        key = (cap, it)
        ct = Decimal(str(r.get("cant_total") or 0))
        cur = agg[pk].get(key)
        if cur is None:
            agg[pk][key] = {
                "cant": ct,
                "und": (r.get("und") or "?")[:20],
                "vlr": Decimal(str(r.get("vlr_unitario") or 0)),
            }
        else:
            cur["cant"] += ct
    out: Dict[str, Dict[Tuple[str, str], Tuple[Decimal, str, Decimal]]] = {}
    for pk, items in agg.items():
        out[pk] = {
            k: (v["cant"], v["und"], v["vlr"])
            for k, v in items.items()
        }
    return out


def _patches_costos_actividades_existentes(
    actividades: List[dict],
    ppto_by_pk: Dict[str, Dict[Tuple[str, str], Tuple[Decimal, str, Decimal]]],
    now: str,
) -> List[dict]:
    """Parches de cantidad/unidad/costo solo para filas ya programadas (no inserta)."""
    groups: Dict[Tuple[str, str, str], List[dict]] = defaultdict(list)
    for a in actividades:
        pk = str(a.get("pk_id") or "").strip()
        cap = (a.get("capitulo") or "").strip()
        it = (a.get("item") or "").strip()
        if pk and cap and it:
            groups[(pk, cap, it)].append(a)

    patches: List[dict] = []
    for (pk, cap, it), segs in groups.items():
        ppto = (ppto_by_pk.get(pk) or {}).get((cap, it))
        if not ppto:
            continue
        cant_ppto, und, vlr = ppto
        cant_ppto_f = float(cant_ppto)
        vlr_f = float(vlr)
        und_s = (und or "?")[:20]
        segs_sorted = sorted(segs, key=lambda x: int(x.get("segmento") or 1))
        if len(segs_sorted) == 1:
            patches.append(
                {
                    "id": segs_sorted[0]["id"],
                    "cantidad_programada": cant_ppto_f,
                    "unidad": und_s,
                    "costo_unitario": vlr_f,
                    "actualizado_en": now,
                }
            )
            continue
        old_total = sum(float(s.get("cantidad_programada") or 0) for s in segs_sorted)
        for s in segs_sorted:
            old_c = float(s.get("cantidad_programada") or 0)
            if old_total > 0:
                new_c = cant_ppto_f * (old_c / old_total)
            else:
                new_c = cant_ppto_f / len(segs_sorted)
            patches.append(
                {
                    "id": s["id"],
                    "cantidad_programada": new_c,
                    "unidad": und_s,
                    "costo_unitario": vlr_f,
                    "actualizado_en": now,
                }
            )
    return patches


def sync_presupuesto_version(sb, version_id: str, contrato_id: int) -> dict:
    """
    Actualiza cantidades/costos de actividades ya existentes y recalcula prog_pk_estado.
    No crea actividades nuevas: los ítems del presupuesto se programan en el flujo WBS.
    """
    now = datetime.now(timezone.utc).isoformat()
    ppto_by_pk = _build_ppto_item_map_contrato(sb, contrato_id)
    actividades = _fetch_actividades_version_all(sb, version_id, contrato_id)
    patches = _patches_costos_actividades_existentes(actividades, ppto_by_pk, now)
    _bulk_patch_prog_actividades_by_id(sb, patches)

    pks: Set[str] = set(ppto_by_pk.keys())
    for a in actividades:
        pk = str(a.get("pk_id") or "").strip()
        if pk:
            pks.add(pk)
    pk_list = sorted(pks)
    if pk_list:
        ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
        ppto_keys_by_pk = {pk: set((ppto_by_pk.get(pk) or {}).keys()) for pk in pk_list}
        totals = {pk: len(ppto_by_pk.get(pk) or {}) for pk in pk_list}
        cf_by_pk = _count_items_con_fecha_bulk(
            sb, version_id, contrato_id, pk_list, ppto_keys_by_pk, ag_by_item,
        )
        sin_ag_all = fetch_sin_agrupador_count_by_pk(sb, contrato_id)
        estado_rows = []
        for pk in pk_list:
            total = int(totals.get(pk, 0))
            cf = int(cf_by_pk.get(pk, 0))
            sin_ag = int(sin_ag_all.get(pk, 0))
            estado_rows.append({
                "version_id": version_id,
                "contrato_id": contrato_id,
                "pk_id": pk,
                "estado_programacion": _compute_estado_pk(total, cf, sin_ag),
                "items_total": total,
                "items_con_fecha": min(cf, total) if total > 0 else 0,
                "actualizado_en": now,
            })
        for i in range(0, len(estado_rows), _SYNC_PK_ESTADO_CHUNK):
            sb.table("prog_pk_estado").upsert(
                estado_rows[i : i + _SYNC_PK_ESTADO_CHUNK],
                on_conflict="version_id,pk_id",
            ).execute()

    return {
        "ok": True,
        "pks_actualizados": len(pk_list),
        "actividades_actualizadas": len(patches),
        "actividades_insertadas": 0,
    }


def validate_segment_quantities(
    sb, version_id: str, contrato_id: int, pk_id: str, capitulo: str, item: str
) -> None:
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    ppto_qty = Decimal(0)
    rows = fetch_ppto_rows_programacion(
        sb, contrato_id, pk_id=pk_id.strip(), force_vigente=True,
    )
    for r in rows:
        if (r.get("capitulo") or "").strip() != capitulo.strip():
            continue
        if (r.get("item") or "").strip() != item.strip():
            continue
        ppto_qty += Decimal(str(r.get("cant_total") or 0))
    act_rows = (
        sb.table("prog_actividades")
        .select("segmento,cantidad_programada")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .eq("capitulo", capitulo)
        .eq("item", item)
        .execute()
        .data
        or []
    )
    total_seg = sum(Decimal(str(r.get("cantidad_programada") or 0)) for r in act_rows)
    if act_rows and total_seg != ppto_qty:
        delta = total_seg - ppto_qty
        raise BusinessRuleError(
            f"Suma de segmentos ({total_seg}) ? cantidad presupuesto ({ppto_qty}) para {capitulo}/{item}; delta {delta:+}"
        )


def fetch_mapa_rows_rpc(sb, contrato_id: int) -> List[dict]:
    try:
        res = sb.rpc("prog_mapa_pk_estados", {"p_contrato_id": int(contrato_id)}).execute()
        return res.data or []
    except Exception:
        return []


def _ppto_distinct_item_counts_by_pk(sb, contrato_id: int) -> Dict[str, int]:
    """Cuenta items distintos (capitulo+item) por PK desde presupuesto vigente."""
    from prog_obra_costos_presupuesto import fetch_ppto_rows_programacion

    rows = fetch_ppto_rows_programacion(sb, contrato_id, force_vigente=True)
    if not rows:
        rows = (
            sb.table("presupuesto")
            .select("pk_id,capitulo,item")
            .eq("contrato_id", contrato_id)
            .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
            .eq("dado_de_baja", False)
            .execute()
            .data
            or []
        )
    seen: Dict[str, set] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        if pk not in seen:
            seen[pk] = set()
        seen[pk].add((cap, it))
    return {pk: len(s) for pk, s in seen.items()}


def fetch_mapa_rows_for_version(sb, contrato_id: int, version_id: str) -> List[dict]:
    """Estados de PK para una version concreta (p. ej. borrador en edicion)."""
    pk_rows = (
        sb.table("pk_ids")
        .select("pk_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    est_rows = (
        sb.table("prog_pk_estado")
        .select("pk_id,estado_programacion,items_total,items_con_fecha,porcentaje_programado")
        .eq("contrato_id", contrato_id)
        .eq("version_id", version_id)
        .execute()
        .data
        or []
    )
    est_map = {str(r.get("pk_id") or "").strip(): r for r in est_rows}
    ppto_counts = _ppto_distinct_item_counts_by_pk(sb, contrato_id)
    out: List[dict] = []
    seen = set()
    for pr in pk_rows:
        pk = str(pr.get("pk_id") or "").strip()
        if not pk or pk in seen:
            continue
        seen.add(pk)
        e = est_map.get(pk)
        if e:
            out.append(
                {
                    "pk_id": pk,
                    "estado_programacion": e.get("estado_programacion"),
                    "items_total": int(e.get("items_total") or 0),
                    "items_con_fecha": int(e.get("items_con_fecha") or 0),
                    "porcentaje_programado": e.get("porcentaje_programado"),
                }
            )
            continue
        items_total = int(ppto_counts.get(pk, 0))
        if items_total <= 0:
            estado = "sin_cantidad"
        else:
            estado = "sin_iniciar"
        out.append(
            {
                "pk_id": pk,
                "estado_programacion": estado,
                "items_total": items_total,
                "items_con_fecha": 0,
                "porcentaje_programado": 0 if items_total > 0 else None,
            }
        )
    return out


def fetch_pks_con_ruta_critica(sb, version_id: Optional[str]) -> set[str]:
    """PKs con al menos un nodo en ruta crítica (prog_cpm_resultados.es_ruta_critica)."""
    if not version_id:
        return set()
    rows = (
        sb.table("prog_cpm_resultados")
        .select("pk_id")
        .eq("version_id", version_id)
        .eq("es_ruta_critica", True)
        .execute()
        .data
        or []
    )
    return {str(r.get("pk_id") or "").strip() for r in rows if r.get("pk_id")}


def enrich_mapa_rows_with_ruta_critica(rows: List[dict], critico_pks: set[str]) -> List[dict]:
    out: List[dict] = []
    for r in rows or []:
        pk = str(r.get("pk_id") or "").strip()
        out.append({**r, "tiene_ruta_critica": pk in critico_pks})
    return out


def mark_cpm_dirty(sb, version_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update({"cpm_dirty": True, "actualizado_en": now}).eq("id", version_id).execute()


def mark_cpm_synced(sb, version_id: str) -> None:
    """Marca la versión alineada con la tabla tras guardar fechas del CPM."""
    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {"cpm_dirty": False, "cpm_calculado_en": now, "actualizado_en": now}
    ).eq("id", version_id).execute()


def fetch_borrador_activo(sb, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("prog_versiones")
        .select("id,numero_version,estado,creado_en")
        .eq("contrato_id", contrato_id)
        .eq("estado", "borrador")
        .order("creado_en", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def fetch_vigente_meta(sb, contrato_id: int) -> Tuple[Optional[str], Optional[int]]:
    c = sb.table("contratos").select("prog_version_vigente_id").eq("id", contrato_id).limit(1).execute().data
    if not c:
        return None, None
    vid = c[0].get("prog_version_vigente_id")
    if not vid:
        return None, None
    v = sb.table("prog_versiones").select("numero_version").eq("id", str(vid)).limit(1).execute().data
    num = v[0].get("numero_version") if v else None
    return str(vid) if vid else None, int(num) if num is not None else None


def _format_usuario_nombre(row: Optional[dict]) -> Optional[str]:
    if not row:
        return None
    nombre = (row.get("nombre") or "").strip()
    apellidos = (row.get("apellidos") or "").strip()
    full = f"{nombre} {apellidos}".strip()
    return full or None


def list_versiones_enriched(sb, contrato_id: int) -> dict:
    """Lista versiones del contrato con es_vigente, baseline_id y nombres de trazabilidad."""
    crows = (
        sb.table("contratos")
        .select("prog_version_vigente_id,prog_version_baseline_id")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    vid_vigente = crows[0].get("prog_version_vigente_id") if crows else None
    vid_baseline = crows[0].get("prog_version_baseline_id") if crows else None
    if not vid_baseline:
        vid_baseline = fetch_baseline_version_id(sb, contrato_id)

    rows = (
        sb.table("prog_versiones")
        .select(
            "id,numero_version,tipo,estado,creado_en,sellado_en,motivo_reprogramacion,"
            "version_origen_id,superseded_by_id,metadata,creado_por,sellado_por,"
            "fecha_inicio,fecha_fin"
        )
        .eq("contrato_id", contrato_id)
        .order("numero_version", desc=True)
        .execute()
        .data
        or []
    )

    user_ids: set = set()
    for r in rows:
        for key in ("creado_por", "sellado_por"):
            uid = r.get(key)
            if uid is not None:
                try:
                    user_ids.add(int(uid))
                except (TypeError, ValueError):
                    pass

    users_by_id: Dict[int, dict] = {}
    if user_ids:
        urows = (
            sb.table("usuarios")
            .select("id,nombre,apellidos")
            .in_("id", list(user_ids))
            .execute()
            .data
            or []
        )
        for u in urows:
            try:
                users_by_id[int(u["id"])] = u
            except (TypeError, ValueError, KeyError):
                continue

    num_by_id = {str(r.get("id")): int(r.get("numero_version") or 0) for r in rows if r.get("id")}

    enriched: List[dict] = []
    vigente_str = str(vid_vigente) if vid_vigente else None
    for r in rows:
        out = dict(r)
        rid = str(r.get("id") or "")
        out["es_vigente"] = bool(vigente_str and rid == vigente_str)
        cp = r.get("creado_por")
        sp = r.get("sellado_por")
        out["creado_por_nombre"] = (
            _format_usuario_nombre(users_by_id.get(int(cp))) if cp is not None else None
        )
        out["sellado_por_nombre"] = (
            _format_usuario_nombre(users_by_id.get(int(sp))) if sp is not None else None
        )
        oid = r.get("version_origen_id")
        if oid:
            out["version_origen_numero"] = num_by_id.get(str(oid))
        enriched.append(out)

    return {
        "version_vigente_id": vigente_str,
        "version_baseline_id": str(vid_baseline) if vid_baseline else None,
        "versiones": enriched,
    }


def fetch_baseline_version_id(sb, contrato_id: int) -> Optional[str]:
    c = (
        sb.table("contratos")
        .select("prog_version_baseline_id")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    if c and c[0].get("prog_version_baseline_id"):
        return str(c[0]["prog_version_baseline_id"])
    rows = (
        sb.table("prog_versiones")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("tipo", "baseline")
        .eq("estado", "sellada")
        .order("sellado_en", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return str(rows[0]["id"])
    # Baseline contractual aún en borrador (V0 / nº1) — Curva S y comparación la usan igual.
    open_bl = (
        sb.table("prog_versiones")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("tipo", "baseline")
        .order("numero_version")
        .limit(1)
        .execute()
        .data
        or []
    )
    return str(open_bl[0]["id"]) if open_bl else None


def _assert_no_version_abierta(sb, contrato_id: int) -> None:
    open_rows = (
        sb.table("prog_versiones")
        .select("id,estado,numero_version")
        .eq("contrato_id", contrato_id)
        .in_("estado", ["borrador", "en_validacion"])
        .execute()
        .data
        or []
    )
    if open_rows:
        r = open_rows[0]
        raise BusinessRuleError(
            f"Ya existe la version nº{r.get('numero_version')} en estado {r.get('estado')}. "
            "Debe sellarla o eliminar el borrador antes de crear otra."
        )


def _resolve_version_origen_id(
    sb,
    contrato_id: int,
    version_origen_id: Optional[str],
) -> Optional[str]:
    if version_origen_id:
        vid = str(version_origen_id).strip()
        row = (
            sb.table("prog_versiones")
            .select("id,estado,contrato_id")
            .eq("id", vid)
            .limit(1)
            .execute()
            .data
        )
        if not row or int(row[0].get("contrato_id") or 0) != int(contrato_id):
            raise BusinessRuleError("version_origen_id no pertenece al contrato")
        if (row[0].get("estado") or "") not in ("sellada", "archivada"):
            raise BusinessRuleError("version_origen_id debe ser una version sellada o archivada")
        return vid
    vid, _ = fetch_vigente_meta(sb, contrato_id)
    if not vid:
        raise BusinessRuleError(
            "No hay version vigente sellada para clonar. Cree y selle la baseline primero."
        )
    return vid


def clone_version_data(
    sb,
    origen_id: str,
    destino_id: str,
    contrato_id: int,
    usuario_id: int,
) -> dict:
    res = sb.rpc(
        "prog_clone_version",
        {
            "p_origen_id": str(origen_id),
            "p_destino_id": str(destino_id),
            "p_contrato_id": int(contrato_id),
            "p_usuario_id": int(usuario_id),
        },
    ).execute()
    data = res.data if res else {}
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict) or not data.get("ok"):
        raise BusinessRuleError("No se pudo clonar la version origen")
    ensure_prog_pk_estado_all(sb, str(destino_id), contrato_id)
    return data


def snapshot_presupuesto_version(sb, version_id: str, contrato_id: int) -> dict:
    res = sb.rpc(
        "prog_snapshot_presupuesto",
        {
            "p_version_id": str(version_id),
            "p_contrato_id": int(contrato_id),
        },
    ).execute()
    data = res.data if res else {}
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict) or not data.get("ok"):
        raise BusinessRuleError("No se pudo generar snapshot de presupuesto")
    return data


def create_version(
    sb,
    contrato_id: int,
    usuario_id: int,
    tipo: str,
    motivo: Optional[str],
    version_origen_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    clonar: bool = True,
) -> dict:
    tipo = (tipo or "").strip().lower()
    if tipo not in ("baseline", "reprogramacion", "suspension"):
        raise BusinessRuleError("tipo invalido")
    if tipo != "baseline" and not (motivo and motivo.strip()):
        raise BusinessRuleError("motivo_reprogramacion obligatorio para tipo distinto de baseline")
    _assert_no_version_abierta(sb, contrato_id)
    if tipo == "baseline":
        bl = (
            sb.table("prog_versiones")
            .select("id,estado")
            .eq("contrato_id", contrato_id)
            .eq("tipo", "baseline")
            .execute()
            .data
            or []
        )
        if any((r.get("estado") or "") not in ("archivada", "rechazada") for r in bl):
            raise BusinessRuleError("Ya existe una version baseline activa para el contrato")
    origen_id: Optional[str] = None
    if tipo != "baseline":
        if clonar:
            origen_id = _resolve_version_origen_id(sb, contrato_id, version_origen_id)
        elif version_origen_id:
            origen_id = _resolve_version_origen_id(sb, contrato_id, version_origen_id)
    nums = (
        sb.table("prog_versiones")
        .select("numero_version")
        .eq("contrato_id", contrato_id)
        .order("numero_version", desc=True)
        .limit(1)
        .execute()
        .data
    )
    nnext = int(nums[0]["numero_version"]) + 1 if nums else 1
    meta = metadata if isinstance(metadata, dict) else {}
    row = {
        "contrato_id": contrato_id,
        "numero_version": nnext,
        "tipo": tipo,
        "estado": "borrador",
        "motivo_reprogramacion": motivo.strip() if motivo else None,
        "version_origen_id": origen_id,
        "metadata": meta,
        "creado_por": usuario_id,
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }
    ins = sb.table("prog_versiones").insert(row).execute().data
    if not ins:
        raise BusinessRuleError("No se pudo crear la version")
    vid = str(ins[0]["id"])
    if tipo == "baseline" or not clonar or not origen_id:
        ensure_prog_pk_estado_all(sb, vid, contrato_id)
    else:
        clone_stats = clone_version_data(sb, origen_id, vid, contrato_id, usuario_id)
        ins[0]["clone_stats"] = clone_stats

    if tipo != "baseline" and origen_id:
        from prog_obra_presupuesto_bridge import (
            build_delta_presupuesto,
            persist_delta_metadata,
        )

        delta = build_delta_presupuesto(sb, contrato_id, vid, origen_id, tipo)
        persist_delta_metadata(sb, vid, ins[0].get("metadata") or meta, delta)
        ins[0]["delta_presupuesto"] = delta
        # Reflejar metadata persistida en respuesta
        meta_rows = (
            sb.table("prog_versiones").select("metadata").eq("id", vid).limit(1).execute().data or []
        )
        if meta_rows:
            ins[0]["metadata"] = meta_rows[0].get("metadata") or {}

    return ins[0]


def assert_version_editable(sb, version_id: str) -> dict:
    v = sb.table("prog_versiones").select("*").eq("id", version_id).limit(1).execute().data
    if not v:
        raise HTTPException(status_code=404, detail="Version no encontrada")
    row = v[0]
    if row.get("estado") == "sellada":
        raise HTTPException(status_code=400, detail="La version esta sellada y no admite cambios")
    return row


def assert_version_borrador(sb, version_id: str) -> dict:
    v = assert_version_editable(sb, version_id)
    if (v.get("estado") or "") != "borrador":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede editar el cronograma en estado borrador (retire de validacion o espere rechazo).",
        )
    return v


def clear_version_programacion(sb, version_id: str, contrato_id: int) -> dict:
    """Elimina toda la programación (fechas, CPM, estados PK) de una versión borrador."""
    v = assert_version_borrador(sb, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")

    def _count(table: str) -> int:
        r = sb.table(table).select("id", count="exact").eq("version_id", version_id).execute()
        return int(r.count or 0)

    counts = {
        "prog_actividades": _count("prog_actividades"),
        "prog_actividades_capitulo": _count("prog_actividades_capitulo"),
        "prog_cpm_resultados": _count("prog_cpm_resultados"),
        "prog_pk_estado": _count("prog_pk_estado"),
    }

    sb.table("prog_actividades").delete().eq("version_id", version_id).execute()
    sb.table("prog_actividades_capitulo").delete().eq("version_id", version_id).execute()
    sb.table("prog_cpm_resultados").delete().eq("version_id", version_id).execute()
    sb.table("prog_pk_estado").delete().eq("version_id", version_id).execute()

    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {"cpm_dirty": True, "cpm_calculado_en": None, "actualizado_en": now}
    ).eq("id", version_id).execute()

    return {
        "ok": True,
        "version_id": version_id,
        "numero_version": v.get("numero_version"),
        "tipo": v.get("tipo"),
        "eliminados": counts,
    }


def clear_pk_programacion(sb, version_id: str, contrato_id: int, pk_id: str) -> dict:
    """Elimina toda la programación de un PK en una versión borrador y recalcula prog_pk_estado."""
    v = assert_version_borrador(sb, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    pk = (pk_id or "").strip()
    if not pk:
        raise HTTPException(status_code=400, detail="pk_id requerido")
    r = (
        sb.table("prog_actividades")
        .select("id", count="exact")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
    )
    eliminados = int(r.count or 0)
    sb.table("prog_actividades").delete().eq("version_id", version_id).eq("pk_id", pk).execute()
    upsert_prog_pk_estado(sb, version_id, contrato_id, pk)
    mark_cpm_dirty(sb, version_id)
    return {"ok": True, "version_id": version_id, "pk_id": pk, "eliminados": eliminados}


def clear_tramo_programacion(
    sb,
    version_id: str,
    contrato_id: int,
    tramo: str,
    pk_ids: Optional[List[str]] = None,
) -> dict:
    """Elimina actividades de todos los PKs de un tramo en borrador y recalcula prog_pk_estado."""
    v = assert_version_borrador(sb, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise HTTPException(status_code=400, detail="tramo requerido")

    tramos = fetch_tramos_contrato(sb, contrato_id)
    match = next((t for t in tramos if (t.get("tramo") or "").strip() == tramo_s), None)
    if not match:
        raise BusinessRuleError(f"Tramo no encontrado: {tramo_s}")

    all_pks = [str(p).strip() for p in (match.get("pk_ids") or []) if str(p).strip()]
    if pk_ids:
        pk_set = {str(p).strip() for p in pk_ids if str(p).strip()}
        pks = [p for p in all_pks if p in pk_set]
    else:
        pks = all_pks
    if not pks:
        raise BusinessRuleError("No hay PKs en el tramo")

    r = (
        sb.table("prog_actividades")
        .select("id", count="exact")
        .eq("version_id", version_id)
        .in_("pk_id", pks)
        .execute()
    )
    eliminados = int(r.count or 0)
    sb.table("prog_actividades").delete().eq("version_id", version_id).in_("pk_id", pks).execute()
    sb.table("prog_cpm_resultados").delete().eq("version_id", version_id).in_("pk_id", pks).execute()
    _reset_prog_pk_estado_tramo(sb, version_id, contrato_id, pks)
    mark_cpm_dirty(sb, version_id)
    return {
        "ok": True,
        "version_id": version_id,
        "tramo": tramo_s,
        "pk_ids": pks,
        "pk_count": len(pks),
        "eliminados": eliminados,
    }


def submit_to_validation(sb, version_id: str, contrato_id: int) -> List[dict]:
    assert_version_editable(sb, version_id)
    from prog_obra_presupuesto_bridge import presupuesto_aprobacion_estado

    ppto_est = presupuesto_aprobacion_estado(sb, contrato_id)
    pend = int(ppto_est.get("items_pendientes") or 0)
    if pend > 0:
        raise BusinessRuleError(
            f"No se puede enviar a validación. El presupuesto del contrato tiene "
            f"{pend} ítems pendientes de aprobación por interventoría. "
            f"Aprueba el presupuesto completo antes de enviar la programación a validación."
        )
    if int(ppto_est.get("items_total") or 0) <= 0:
        raise BusinessRuleError(
            "No se puede enviar a validación: el contrato no tiene ítems de presupuesto poligonal activos."
        )
    niveles = _niveles_prog_desde_contrato(sb, contrato_id)
    if not niveles:
        raise BusinessRuleError("El contrato no tiene niveles de validacion >= 2 configurados")
    sb.table("prog_versiones").update(
        {"estado": "en_validacion", "actualizado_en": datetime.now(timezone.utc).isoformat()}
    ).eq("id", version_id).execute()
    sb.table("prog_validaciones").delete().eq("version_id", version_id).execute()
    rows = []
    for i, nv in enumerate(niveles):
        r = {
            "version_id": version_id,
            "orden": i,
            "nivel": nv,
            "estado": "pendiente",
            "observacion": None,
            "validado_por": None,
            "validado_en": None,
        }
        ins = sb.table("prog_validaciones").insert(r).execute().data
        if ins:
            rows.append(ins[0])
    return rows


def _all_validaciones_aprobado(sb, version_id: str) -> bool:
    rows = sb.table("prog_validaciones").select("estado").eq("version_id", version_id).execute().data or []
    return bool(rows) and all((r.get("estado") == "aprobado") for r in rows)


def _archive_previous_vigente(
    sb,
    previous_version_id: str,
    new_version_id: str,
    now: str,
) -> None:
    sb.table("prog_versiones").update(
        {
            "estado": "archivada",
            "superseded_by_id": new_version_id,
            "actualizado_en": now,
        }
    ).eq("id", previous_version_id).execute()


def seal_version(sb, version_id: str, contrato_id: int, usuario_id: int) -> None:
    vrows = (
        sb.table("prog_versiones")
        .select("id,tipo,estado")
        .eq("id", version_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    if not vrows:
        raise BusinessRuleError("Version no encontrada para sellar")
    vrow = vrows[0]
    if (vrow.get("estado") or "") != "en_validacion":
        raise BusinessRuleError("Solo se sella una version en validacion")

    crows = (
        sb.table("contratos")
        .select("prog_version_vigente_id,prog_version_baseline_id")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    prev_vigente_id = crows[0].get("prog_version_vigente_id") if crows else None
    baseline_id = crows[0].get("prog_version_baseline_id") if crows else None

    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {
            "estado": "sellada",
            "sellado_por": usuario_id,
            "sellado_en": now,
            "actualizado_en": now,
        }
    ).eq("id", version_id).execute()

    if prev_vigente_id and str(prev_vigente_id) != str(version_id):
        _archive_previous_vigente(sb, str(prev_vigente_id), str(version_id), now)

    contrato_patch: dict = {"prog_version_vigente_id": version_id}
    if (vrow.get("tipo") or "") == "baseline" and not baseline_id:
        contrato_patch["prog_version_baseline_id"] = version_id
    sb.table("contratos").update(contrato_patch).eq("id", contrato_id).execute()

    snapshot_presupuesto_version(sb, str(version_id), contrato_id)

    from presupuesto_helpers import presupuesto_oficial_version_id
    from prog_obra_costos_presupuesto import assert_ppto_version_contrato, costo_total_programado_version

    ppto_sellado_id = presupuesto_oficial_version_id(sb, contrato_id)
    if not ppto_sellado_id:
        from prog_obra_costos_presupuesto import fetch_ppto_borrador_version_id

        ppto_sellado_id = fetch_ppto_borrador_version_id(sb, contrato_id)
    ppto_meta: dict = {}
    costo_sellado = 0.0
    if ppto_sellado_id:
        try:
            prow = assert_ppto_version_contrato(sb, contrato_id, str(ppto_sellado_id))
            ppto_meta = {
                "version_presupuesto_sellado_id": str(ppto_sellado_id),
                "version_presupuesto_sellado_numero": int(prow.get("numero_version") or 0),
            }
            costo_sellado = costo_total_programado_version(
                sb, contrato_id, str(version_id), str(ppto_sellado_id)
            )
            ppto_meta["costo_total_al_sellar"] = round(costo_sellado, 2)
        except Exception:
            pass
    if ppto_meta:
        meta_rows = (
            sb.table("prog_versiones")
            .select("metadata")
            .eq("id", version_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        existing = meta_rows[0].get("metadata") if meta_rows else {}
        merged = {**(existing if isinstance(existing, dict) else {}), **ppto_meta}
        sb.table("prog_versiones").update({"metadata": merged, "actualizado_en": now}).eq(
            "id", version_id
        ).execute()


def process_validation_decision(
    sb,
    version_id: str,
    contrato_id: int,
    nivel: int,
    usuario_id: int,
    aprobar: bool,
    observacion: Optional[str],
) -> dict:
    assert_version_editable(sb, version_id)
    vrow = sb.table("prog_versiones").select("estado").eq("id", version_id).single().execute().data
    if vrow.get("estado") != "en_validacion":
        raise BusinessRuleError("La version no esta en validacion")
    pv = (
        sb.table("prog_validaciones")
        .select("*")
        .eq("version_id", version_id)
        .eq("nivel", nivel)
        .limit(1)
        .execute()
        .data
    )
    if not pv:
        raise BusinessRuleError("No hay fila de validacion para ese nivel")
    val = pv[0]
    if val.get("estado") != "pendiente":
        raise BusinessRuleError("Ese nivel ya fue procesado")
    rows_n = (
        sb.table("prog_validaciones")
        .select("nivel,orden")
        .eq("version_id", version_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    ordered = [int(r["nivel"]) for r in rows_n]
    try:
        idx = ordered.index(int(nivel))
    except ValueError:
        raise BusinessRuleError("Nivel no pertenece a esta version")
    if idx > 0:
        prev_n = ordered[idx - 1]
        pr = (
            sb.table("prog_validaciones")
            .select("estado")
            .eq("version_id", version_id)
            .eq("nivel", prev_n)
            .limit(1)
            .execute()
            .data
        )
        if not pr or pr[0].get("estado") != "aprobado":
            raise BusinessRuleError("Aun no se aprueba el nivel previo")
    now = datetime.now(timezone.utc).isoformat()
    if not aprobar:
        if not (observacion and observacion.strip()):
            raise BusinessRuleError("Observacion obligatoria al rechazar")
        sb.table("prog_validaciones").update(
            {
                "estado": "rechazado",
                "observacion": observacion.strip(),
                "validado_por": usuario_id,
                "validado_en": now,
            }
        ).eq("id", val["id"]).execute()
        sb.table("prog_versiones").update(
            {"estado": "borrador", "actualizado_en": now}
        ).eq("id", version_id).execute()
        return {"resultado": "rechazado", "version_estado": "borrador"}
    sb.table("prog_validaciones").update(
        {
            "estado": "aprobado",
            "observacion": observacion.strip() if observacion else None,
            "validado_por": usuario_id,
            "validado_en": now,
        }
    ).eq("id", val["id"]).execute()
    if _all_validaciones_aprobado(sb, version_id):
        if int(nivel) == ordered[-1]:
            seal_version(sb, version_id, contrato_id, usuario_id)
            return {"resultado": "sellada", "version_estado": "sellada"}
    return {"resultado": "aprobado", "version_estado": "en_validacion"}


def aplicar_herencia_capitulo(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    usuario_id: int,
    cache: CalendarioNoHabilesCache,
) -> int:
    assert_version_borrador(sb, version_id)
    cap_row = (
        sb.table("prog_actividades_capitulo")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .eq("capitulo", capitulo)
        .limit(1)
        .execute()
        .data
    )
    if not cap_row:
        raise BusinessRuleError("No hay programacion de capitulo; guarde fecha y duracion primero")
    cr = cap_row[0]
    fi = cr.get("fecha_inicio_sugerida")
    du = cr.get("duracion_dias_habiles")
    if not fi or not du:
        raise BusinessRuleError("Capitulo sin fecha_inicio_sugerida o duracion")
    if isinstance(fi, str):
        y, m, d = fi[:10].split("-")
        fi_d = date(int(y), int(m), int(d))
    else:
        fi_d = fi
    sb.table("prog_actividades_capitulo").update(
        {"aplica_herencia": True, "actualizado_en": datetime.now(timezone.utc).isoformat()}
    ).eq("id", cr["id"]).execute()
    _, items = _ppto_items_por_pk(sb, contrato_id, pk_id)
    n = 0
    for cap, it, cant, und, vlr in items:
        if cap != capitulo:
            continue
        existing = (
            sb.table("prog_actividades")
            .select("id,fecha_inicio,override_manual")
            .eq("version_id", version_id)
            .eq("pk_id", pk_id)
            .eq("capitulo", cap)
            .eq("item", it)
            .eq("segmento", 1)
            .limit(1)
            .execute()
            .data
        )
        if existing:
            ex = existing[0]
            if ex.get("fecha_inicio") and ex.get("override_manual"):
                continue
            if ex.get("fecha_inicio"):
                continue
        fin = add_dias_habiles(contrato_id, fi_d, int(du), cache)
        payload = {
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id": pk_id,
            "capitulo": cap,
            "item": it,
            "fecha_inicio": fi_d.isoformat(),
            "duracion_dias_habiles": int(du),
            "fecha_fin_calculada": fin.isoformat() if fin else None,
            "cantidad_programada": float(cant),
            "unidad": und or "?",
            "costo_unitario": float(vlr),
            "tipo_distribucion": "lineal",
            "heredado_de_capitulo": True,
            "override_manual": False,
            "segmento": 1,
            "creado_por": usuario_id,
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }
        if existing:
            sb.table("prog_actividades").update(payload).eq("id", existing[0]["id"]).execute()
        else:
            sb.table("prog_actividades").insert(payload).execute()
        n += 1
    upsert_prog_pk_estado(sb, version_id, contrato_id, pk_id)
    sync_capitulo_desde_items(sb, version_id, contrato_id, pk_id, capitulo, cache, usuario_id)
    return n


def _parse_date_field(val) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, str) and len(val) >= 10:
        y, m, d = val[:10].split("-")
        return date(int(y), int(m), int(d))
    return None


def sync_capitulo_desde_items(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    cache: CalendarioNoHabilesCache,
    usuario_id: Optional[int] = None,
) -> None:
    """Deriva fecha_inicio_sugerida y duracion_dias_habiles del capitulo desde items programados."""
    rows = (
        sb.table("prog_actividades")
        .select("fecha_inicio,fecha_fin_calculada")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .eq("capitulo", capitulo.strip())
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    min_fi: Optional[date] = None
    max_ff: Optional[date] = None
    for r in rows:
        fi = _parse_date_field(r.get("fecha_inicio"))
        ff = _parse_date_field(r.get("fecha_fin_calculada"))
        if fi and (min_fi is None or fi < min_fi):
            min_fi = fi
        if ff and (max_ff is None or ff > max_ff):
            max_ff = ff
        elif fi and not ff:
            if min_fi is None or fi < min_fi:
                min_fi = fi
    if not min_fi or not max_ff:
        return
    dias = count_dias_habiles_entre(contrato_id, min_fi, max_ff, cache)
    if dias <= 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "version_id": version_id,
        "contrato_id": contrato_id,
        "pk_id": pk_id.strip(),
        "capitulo": capitulo.strip(),
        "fecha_inicio_sugerida": min_fi.isoformat(),
        "duracion_dias_habiles": dias,
        "aplica_herencia": False,
        "actualizado_en": now,
    }
    ex = (
        sb.table("prog_actividades_capitulo")
        .select("id")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .eq("capitulo", capitulo.strip())
        .limit(1)
        .execute()
        .data
    )
    if ex:
        sup = {k: v for k, v in payload.items() if k != "creado_por"}
        sb.table("prog_actividades_capitulo").update(sup).eq("id", ex[0]["id"]).execute()
    elif usuario_id is not None:
        payload["creado_por"] = usuario_id
        sb.table("prog_actividades_capitulo").insert(payload).execute()


def _sync_capitulos_bulk(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulos: set,
    cache: CalendarioNoHabilesCache,
    usuario_id: int,
) -> None:
    """Sincroniza prog_actividades_capitulo para N capitulos en 2 queries (antes era 3xN)."""
    if not capitulos:
        return
    pk = pk_id.strip()
    cap_list = list(capitulos)

    # Query 1: leer todos los items con fecha de todos los capitulos de una vez
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,fecha_inicio,fecha_fin_calculada")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .in_("capitulo", cap_list)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )

    # Calcular min(fecha_inicio) y max(fecha_fin) por capitulo, en memoria
    cap_dates: Dict[str, Dict] = {}
    for r in rows:
        cap = str(r.get("capitulo") or "").strip()
        fi = _parse_date_field(r.get("fecha_inicio"))
        ff = _parse_date_field(r.get("fecha_fin_calculada"))
        if not fi:
            continue
        if cap not in cap_dates:
            cap_dates[cap] = {"min_fi": fi, "max_ff": ff}
        else:
            d = cap_dates[cap]
            if fi < d["min_fi"]:
                d["min_fi"] = fi
            if ff and (d["max_ff"] is None or ff > d["max_ff"]):
                d["max_ff"] = ff

    now = datetime.now(timezone.utc).isoformat()
    payloads = []
    for cap in cap_list:
        d = cap_dates.get(cap)
        if not d or not d["min_fi"] or not d["max_ff"]:
            continue
        dias = count_dias_habiles_entre(contrato_id, d["min_fi"], d["max_ff"], cache)
        if dias <= 0:
            continue
        payloads.append(
            {
                "version_id": version_id,
                "contrato_id": contrato_id,
                "pk_id": pk,
                "capitulo": cap,
                "fecha_inicio_sugerida": d["min_fi"].isoformat(),
                "duracion_dias_habiles": dias,
                "aplica_herencia": False,
                "creado_por": usuario_id,
                "actualizado_en": now,
            }
        )

    if not payloads:
        return

    # Query 2: upsert masivo - sin loop, sin select previo
    sb.table("prog_actividades_capitulo").upsert(
        payloads, on_conflict="version_id,pk_id,capitulo"
    ).execute()


def batch_upsert_actividades(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    items: List[dict],
    usuario_id: int,
    cache: CalendarioNoHabilesCache,
) -> List[dict]:
    """Persiste actividades en lote (upsert) y devuelve resultados con fecha_fin_calculada."""
    assert_version_borrador(sb, version_id)
    pk = pk_id.strip()
    now = datetime.now(timezone.utc).isoformat()
    existing_rows = (
        sb.table("prog_actividades")
        .select("id,capitulo,item,segmento,creado_por")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
        .data
        or []
    )
    ex_map = {
        (str(r.get("capitulo") or "").strip(), str(r.get("item") or "").strip(), int(r.get("segmento") or 1)): r
        for r in existing_rows
    }
    payloads: List[dict] = []
    meta: List[dict] = []
    capitulos_touched: set = set()
    for raw in items:
        cap = str(raw.get("capitulo") or "").strip()
        it = str(raw.get("item") or "").strip()
        seg = int(raw.get("segmento") or 1)
        fi = raw.get("fecha_inicio")
        if isinstance(fi, str):
            fi_d = _parse_date_field(fi)
        elif isinstance(fi, date):
            fi_d = fi
        else:
            fi_d = None
        du = raw.get("duracion_dias_habiles")
        du_i = int(du) if du is not None and int(du) > 0 else None
        fin = add_dias_habiles(contrato_id, fi_d, du_i, cache) if fi_d and du_i else None
        row = {
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id": pk,
            "capitulo": cap,
            "item": it,
            "segmento": seg,
            "fecha_inicio": fi_d.isoformat() if fi_d else None,
            "duracion_dias_habiles": du_i,
            "fecha_fin_calculada": fin.isoformat() if fin else None,
            "cantidad_programada": float(raw.get("cantidad_programada") or 0),
            "unidad": (str(raw.get("unidad") or "?"))[:20],
            "costo_unitario": float(raw.get("costo_unitario") or 0),
            "tipo_distribucion": str(raw.get("tipo_distribucion") or "lineal"),
            "heredado_de_capitulo": bool(raw.get("heredado_de_capitulo")),
            "override_manual": bool(raw.get("override_manual")),
            "actualizado_en": now,
        }
        ag_id = raw.get("agrupador_id")
        if ag_id is not None:
            row["agrupador_id"] = int(ag_id)
        cw = raw.get("codigo_wbs")
        if cw:
            row["codigo_wbs"] = str(cw).strip()[:50]
        key = (cap, it, seg)
        existing = ex_map.get(key)
        row["creado_por"] = (existing.get("creado_por") or usuario_id) if existing else usuario_id
        payloads.append(row)
        meta.append({"capitulo": cap, "item": it, "segmento": seg, "fecha_fin_calculada": fin.isoformat() if fin else None})
        if cap:
            capitulos_touched.add(cap)
    if not payloads:
        return []
    sb.table("prog_actividades").upsert(
        payloads, on_conflict="version_id,pk_id,capitulo,item,segmento"
    ).execute()
    upsert_prog_pk_estado(sb, version_id, contrato_id, pk)
    _sync_capitulos_bulk(sb, version_id, contrato_id, pk, capitulos_touched, cache, usuario_id)
  # fetch ids for response
    refreshed = (
        sb.table("prog_actividades")
        .select("id,capitulo,item,segmento,fecha_fin_calculada")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .execute()
        .data
        or []
    )
    ref_map = {
        (str(r.get("capitulo") or "").strip(), str(r.get("item") or "").strip(), int(r.get("segmento") or 1)): r
        for r in refreshed
    }
    out: List[dict] = []
    for m in meta:
        k = (m["capitulo"], m["item"], m["segmento"])
        r = ref_map.get(k, {})
        out.append(
            {
                "capitulo": m["capitulo"],
                "item": m["item"],
                "segmento": m["segmento"],
                "id": r.get("id"),
                "fecha_fin_calculada": r.get("fecha_fin_calculada") or m.get("fecha_fin_calculada"),
            }
        )
    return out


def recalc_fin_actividad(sb, contrato_id: int, act_id: str, cache: CalendarioNoHabilesCache) -> Optional[str]:
    row = sb.table("prog_actividades").select("*").eq("id", act_id).limit(1).execute().data
    if not row:
        return None
    r = row[0]
    fi = r.get("fecha_inicio")
    du = r.get("duracion_dias_habiles")
    if not fi or not du:
        sb.table("prog_actividades").update({"fecha_fin_calculada": None}).eq("id", act_id).execute()
        return None
    if isinstance(fi, str):
        y, m, d = fi[:10].split("-")
        fi_d = date(int(y), int(m), int(d))
    else:
        fi_d = fi
    fin = add_dias_habiles(contrato_id, fi_d, int(du), cache)
    iso = fin.isoformat() if fin else None
    sb.table("prog_actividades").update(
        {"fecha_fin_calculada": iso, "actualizado_en": datetime.now(timezone.utc).isoformat()}
    ).eq("id", act_id).execute()
    return iso


def seed_festivos_colombia_globales(sb, y0: int, y1: int) -> int:
    """Inserta festivos CO en prog_calendario_no_habiles (contrato_id NULL). Idempotente por fecha."""
    import holidays as hd

    n = 0
    for y in range(y0, y1 + 1):
        for d, name in sorted(hd.country_holidays("CO", years=[y]).items()):
            exists = (
                sb.table("prog_calendario_no_habiles")
                .select("id")
                .is_("contrato_id", "null")
                .eq("fecha", d.isoformat())
                .limit(1)
                .execute()
                .data
            )
            if exists:
                continue
            sb.table("prog_calendario_no_habiles").insert(
                {
                    "contrato_id": None,
                    "fecha": d.isoformat(),
                    "tipo": "festivo_nacional",
                    "descripcion": (str(name) or "Festivo")[:200],
                }
            ).execute()
            n += 1
    return n


# -----------------------------------------------------------------------------
# FASE 2 - CPM: Dependencias + Calculo
# -----------------------------------------------------------------------------

from prog_obra_cpm import (
    DependenciaCPM,
    NodoCPM,
    ResultadoCPM,
    calcular_cpm,
    nodos_afectados_por,
)


def listar_dependencias(sb, version_id: str) -> list:
    return (
        sb.table("prog_dependencias")
        .select("*")
        .eq("version_id", version_id)
        .order("creado_en")
        .execute()
        .data
        or []
    )


def crear_dependencia(
    sb, version_id, contrato_id, pk_id_origen, capitulo_origen,
    pk_id_destino, capitulo_destino, tipo, lag_dias, usuario_id,
    agrupador_id_origen=None, agrupador_id_destino=None,
) -> dict:
    ag_o = str(agrupador_id_origen).strip() if agrupador_id_origen else None
    ag_d = str(agrupador_id_destino).strip() if agrupador_id_destino else None

    def _node(pk, cap, ag):
        return (str(pk).strip(), str(cap).strip(), ag or "")

    if _node(pk_id_origen, capitulo_origen, ag_o) == _node(pk_id_destino, capitulo_destino, ag_d):
        raise BusinessRuleError("Un nodo no puede depender de si mismo.")

    existing = listar_dependencias(sb, version_id)
    import networkx as nx
    G = nx.DiGraph()
    for d in existing:
        G.add_edge(
            _node(d["pk_id_origen"], d["capitulo_origen"], d.get("agrupador_id_origen")),
            _node(d["pk_id_destino"], d["capitulo_destino"], d.get("agrupador_id_destino")),
        )
    G.add_edge(
        _node(pk_id_origen, capitulo_origen, ag_o),
        _node(pk_id_destino, capitulo_destino, ag_d),
    )
    if not nx.is_directed_acyclic_graph(G):
        cycles = list(nx.simple_cycles(G))
        cycle_str = " -> ".join(f"{pk}/{cap}{('/' + ag) if ag else ''}" for pk, cap, ag in cycles[0])
        raise BusinessRuleError(f"La dependencia crea un ciclo: {cycle_str}")
    row_data = {
        "version_id": version_id,
        "contrato_id": contrato_id,
        "pk_id_origen": pk_id_origen,
        "capitulo_origen": capitulo_origen,
        "pk_id_destino": pk_id_destino,
        "capitulo_destino": capitulo_destino,
        "tipo": tipo,
        "lag_dias": lag_dias,
        "creado_por": usuario_id,
    }
    if ag_o:
        row_data["agrupador_id_origen"] = int(ag_o)
    if ag_d:
        row_data["agrupador_id_destino"] = int(ag_d)
    row = (
        sb.table("prog_dependencias")
        .insert(row_data)
        .execute()
        .data
    )
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()
    return (row or [{}])[0]


def eliminar_dependencia(sb, dep_id: str, version_id: str) -> None:
    sb.table("prog_dependencias").delete().eq("id", dep_id).execute()
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()


def actualizar_dependencia(
    sb,
    dep_id: str,
    version_id: str,
    *,
    tipo: Optional[str] = None,
    lag_dias: Optional[int] = None,
) -> dict:
    """Actualiza tipo y/o lag de una dependencia existente (sin cambiar origen/destino)."""
    rows = (
        sb.table("prog_dependencias")
        .select("*")
        .eq("id", dep_id)
        .eq("version_id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise BusinessRuleError("Dependencia no encontrada")
    current = rows[0]
    upd: dict = {}
    if tipo is not None:
        tipo_s = str(tipo).strip().upper()
        if tipo_s not in ("FS", "SS", "FF", "SF"):
            raise BusinessRuleError("Tipo de dependencia inválido")
        upd["tipo"] = tipo_s
    if lag_dias is not None:
        try:
            upd["lag_dias"] = int(lag_dias)
        except (TypeError, ValueError):
            raise BusinessRuleError("Lag de días inválido")
    if not upd:
        return current
    row = (
        sb.table("prog_dependencias")
        .update(upd)
        .eq("id", dep_id)
        .eq("version_id", version_id)
        .execute()
        .data
        or [current]
    )[0]
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()
    return row

def listar_dependencias_globales(sb, version_id: str) -> list:
    return (
        sb.table("prog_dependencias_globales")
        .select("*")
        .eq("version_id", version_id)
        .order("creado_en")
        .execute()
        .data
        or []
    )


def crear_dependencia_global(
    sb, version_id, contrato_id, capitulo_origen, capitulo_destino, tipo, lag_dias, usuario_id,
) -> dict:
    if capitulo_origen.strip() == capitulo_destino.strip():
        raise BusinessRuleError("El capitulo origen y destino deben ser distintos.")
    existing = listar_dependencias_globales(sb, version_id)
    import networkx as nx
    G = nx.DiGraph()
    for d in existing:
        G.add_edge(d["capitulo_origen"], d["capitulo_destino"])
    G.add_edge(capitulo_origen, capitulo_destino)
    if not nx.is_directed_acyclic_graph(G):
        cycles = list(nx.simple_cycles(G))
        cycle_str = " -> ".join(cycles[0])
        raise BusinessRuleError(f"La dependencia global crea un ciclo: {cycle_str}")
    row = (
        sb.table("prog_dependencias_globales")
        .insert({
            "version_id": version_id,
            "contrato_id": contrato_id,
            "capitulo_origen": capitulo_origen,
            "capitulo_destino": capitulo_destino,
            "tipo": tipo,
            "lag_dias": lag_dias,
            "creado_por": usuario_id,
        })
        .execute()
        .data
    )
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()
    return (row or [{}])[0]


def eliminar_dependencia_global(sb, dep_id: str, version_id: str) -> None:
    sb.table("prog_dependencias_globales").delete().eq("id", dep_id).execute()
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()


def _construir_dependencias_cpm(
    sb, version_id: str, nodos: list, deps_specific: Optional[List[dict]] = None
) -> list:
    """Combina dependencias especificas con globales; agrupadores se replican por PK del tramo."""
    from prog_obra_cpm import cpm_agrupador_key, cpm_node_key

    specific = deps_specific if deps_specific is not None else listar_dependencias(sb, version_id)
    global_deps = listar_dependencias_globales(sb, version_id)

    resolve_cap = _build_capitulo_resolver(nodos)
    nodos_set = {n.key for n in nodos}
    pks = sorted({n.pk_id for n in nodos})

    specific_intra_pairs = {
        (d["pk_id_origen"], d["capitulo_origen"], d.get("agrupador_id_origen") or "", d["capitulo_destino"], d.get("agrupador_id_destino") or "")
        for d in specific
        if d["pk_id_origen"] == d["pk_id_destino"]
    }

    deps: list = []
    ag_edge_sigs: set = set()

    for d in specific:
        ag_o_raw = d.get("agrupador_id_origen")
        ag_d_raw = d.get("agrupador_id_destino")
        ag_o = cpm_agrupador_key(ag_o_raw)
        ag_d = cpm_agrupador_key(ag_d_raw)
        cap_o_raw = str(d.get("capitulo_origen") or "").strip()
        cap_d_raw = str(d.get("capitulo_destino") or "").strip()
        pk_o = str(d.get("pk_id_origen") or "").strip()
        pk_d = str(d.get("pk_id_destino") or "").strip()
        cap_o = resolve_cap(pk_o, cap_o_raw) if pk_o else cap_o_raw
        cap_d = resolve_cap(pk_d, cap_d_raw) if pk_d else cap_d_raw
        tipo = str(d.get("tipo") or "FS").upper()
        lag = int(d.get("lag_dias") or 0)

        if ag_o and ag_d and cap_o and cap_d:
            if (cap_o_raw != cap_o) or (cap_d_raw != cap_d):
                _logger.info(
                    "CPM dep agrupador alineada caps: %s/%s→%s/%s (orig=%r→%r dest=%r→%r ag=%s→%s tipo=%s lag=%d)",
                    pk_o, cap_o_raw, pk_d, cap_d_raw,
                    cap_o_raw, cap_o, cap_d_raw, cap_d, ag_o, ag_d, tipo, lag,
                )
            if pk_o and pk_d and pk_o != pk_d:
                deps.append(
                    DependenciaCPM(
                        pk_id_origen=pk_o,
                        capitulo_origen=cap_o,
                        pk_id_destino=pk_d,
                        capitulo_destino=cap_d,
                        tipo=tipo,
                        lag_dias=lag,
                        agrupador_id_origen=ag_o,
                        agrupador_id_destino=ag_d,
                    )
                )
            ag_edge_sigs.add((cap_o, ag_o, cap_d, ag_d, tipo, lag))
            continue

        deps.append(
            DependenciaCPM(
                pk_id_origen=d["pk_id_origen"],
                capitulo_origen=cap_o,
                pk_id_destino=d["pk_id_destino"],
                capitulo_destino=cap_d,
                tipo=tipo,
                lag_dias=lag,
                agrupador_id_origen=ag_o,
                agrupador_id_destino=ag_d,
            )
        )

    seen_ag: set = set()
    for cap_o, ag_o, cap_d, ag_d, tipo, lag in sorted(ag_edge_sigs):
        for pk in pks:
            orig = cpm_node_key(pk, cap_o, ag_o)
            dest = cpm_node_key(pk, cap_d, ag_d)
            if orig not in nodos_set or dest not in nodos_set:
                _logger.warning(
                    "CPM dep agrupador omitida pk=%s %s/%s → %s/%s "
                    "(nodo_orig=%s nodo_dest=%s; caps_nodo=%s)",
                    pk, cap_o, ag_o, cap_d, ag_d,
                    orig in nodos_set, dest in nodos_set,
                    sorted({n.capitulo for n in nodos if n.pk_id == pk}),
                )
                continue
            sig = (orig, dest, tipo, lag)
            if sig in seen_ag:
                continue
            seen_ag.add(sig)
            deps.append(
                DependenciaCPM(
                    pk_id_origen=pk,
                    capitulo_origen=cap_o,
                    pk_id_destino=pk,
                    capitulo_destino=cap_d,
                    tipo=tipo,
                    lag_dias=lag,
                    agrupador_id_origen=ag_o,
                    agrupador_id_destino=ag_d,
                )
            )

    for g in global_deps:
        cap_o = resolve_cap("", str(g["capitulo_origen"]).strip())
        cap_d = resolve_cap("", str(g["capitulo_destino"]).strip())
        tipo = g["tipo"]
        lag = int(g.get("lag_dias") or 0)
        for pk in pks:
            cap_o_pk = resolve_cap(pk, str(g["capitulo_origen"]).strip())
            cap_d_pk = resolve_cap(pk, str(g["capitulo_destino"]).strip())
            if cpm_node_key(pk, cap_o_pk, "") not in nodos_set or cpm_node_key(pk, cap_d_pk, "") not in nodos_set:
                continue
            cap_o, cap_d = cap_o_pk, cap_d_pk
            if (pk, cap_o, "", cap_d, "") in specific_intra_pairs:
                continue
            deps.append(DependenciaCPM(
                pk_id_origen=pk,
                capitulo_origen=cap_o,
                pk_id_destino=pk,
                capitulo_destino=cap_d,
                tipo=tipo,
                lag_dias=lag,
            ))

    return deps


def _expand_dependencias_agrupador_por_pk(deps: list, nodos: list) -> list:
    """
    Replica dependencias entre agrupadores a cada PK que tenga ambos extremos.
    Las dependencias de tramo suelen definirse sobre un PK representativo;
    el CPM debe aplicar la misma cadena en todos los PKs del tramo.
    """
    from prog_obra_cpm import DependenciaCPM, cpm_agrupador_key, cpm_node_key

    if not deps or not nodos:
        return deps

    nodos_set = {n.key for n in nodos}
    pks = sorted({n.pk_id for n in nodos})
    ag_edges: dict = {}
    for d in deps:
        ag_o = cpm_agrupador_key(d.agrupador_id_origen)
        ag_d = cpm_agrupador_key(d.agrupador_id_destino)
        if not ag_o and not ag_d:
            continue
        cap_o = str(d.capitulo_origen or "").strip()
        cap_d = str(d.capitulo_destino or "").strip()
        if not cap_o or not cap_d:
            continue
        edge = (
            cap_o,
            ag_o,
            cap_d,
            ag_d,
            str(d.tipo or "FS").upper(),
            int(d.lag_dias or 0),
        )
        ag_edges[edge] = d

    out = list(deps)
    seen = {(d.origen, d.destino, d.tipo, d.lag_dias) for d in deps}
    for pk in pks:
        for (cap_o, ag_o, cap_d, ag_d, tipo, lag) in ag_edges:
            orig = cpm_node_key(pk, cap_o, ag_o)
            dest = cpm_node_key(pk, cap_d, ag_d)
            if orig not in nodos_set or dest not in nodos_set:
                continue
            nd = DependenciaCPM(
                pk_id_origen=pk,
                capitulo_origen=cap_o,
                pk_id_destino=pk,
                capitulo_destino=cap_d,
                tipo=tipo,
                lag_dias=lag,
                agrupador_id_origen=ag_o,
                agrupador_id_destino=ag_d,
            )
            sig = (nd.origen, nd.destino, nd.tipo, nd.lag_dias)
            if sig in seen:
                continue
            seen.add(sig)
            out.append(nd)
    return out


def _parse_date_cpm(v):
    if v is None:
        return None
    from datetime import date as _date
    if isinstance(v, _date):
        return v
    try:
        p = str(v)[:10].split("-")
        return _date(int(p[0]), int(p[1]), int(p[2]))
    except Exception:
        return None


def update_version_horizonte(
    sb,
    version_id: str,
    contrato_id: int,
    fecha_inicio=None,
    fecha_fin=None,
) -> dict:
    """Actualiza fecha inicio/fin del cronograma de una versión borrador."""
    vrows = (
        sb.table("prog_versiones")
        .select("id,estado,contrato_id")
        .eq("id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not vrows or int(vrows[0].get("contrato_id") or 0) != int(contrato_id):
        raise BusinessRuleError("Versión no encontrada")
    if (vrows[0].get("estado") or "") != "borrador":
        raise BusinessRuleError("Solo versiones en borrador permiten editar el horizonte del cronograma")
    fi = _parse_date_cpm(fecha_inicio) if fecha_inicio not in (None, "") else None
    ff = _parse_date_cpm(fecha_fin) if fecha_fin not in (None, "") else None
    if fi and ff and ff < fi:
        raise BusinessRuleError("La fecha fin debe ser posterior o igual a la fecha inicio")
    now = datetime.now(timezone.utc).isoformat()
    upd: dict = {"actualizado_en": now, "cpm_dirty": True}
    if fecha_inicio is not None:
        upd["fecha_inicio"] = fi.isoformat() if fi else None
    if fecha_fin is not None:
        upd["fecha_fin"] = ff.isoformat() if ff else None
    sb.table("prog_versiones").update(upd).eq("id", version_id).execute()
    row = (
        sb.table("prog_versiones")
        .select("id,fecha_inicio,fecha_fin,cpm_dirty")
        .eq("id", version_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )[0]
    return row


def _duracion_cpm_agrupador(row: dict, default: int = 1) -> int:
    raw = row.get("duracion_dias_habiles")
    if raw is None or str(raw).strip() == "":
        return max(1, default)
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return max(1, default)


def _build_capitulo_resolver(nodos: list):
    """Mapea capitulo de dependencia al string canónico del nodo en el mismo PK."""
    caps_by_pk: Dict[str, Dict[str, str]] = {}
    for n in nodos:
        pk = str(n.pk_id).strip()
        cap = str(n.capitulo).strip()
        if not pk or not cap:
            continue
        caps_by_pk.setdefault(pk, {})[_capitulo_cpm_match_key(cap)] = cap

    def resolve(pk: str, capitulo: str) -> str:
        cap = str(capitulo or "").strip()
        pk_s = str(pk or "").strip()
        if not cap:
            return cap
        bucket = caps_by_pk.get(pk_s, {})
        if cap in bucket.values():
            return cap
        mk = _capitulo_cpm_match_key(cap)
        resolved = bucket.get(mk)
        if resolved and resolved != cap:
            _logger.info(
                "CPM capitulo alineado dep=%r → nodo=%r (pk=%s)",
                cap, resolved, pk_s,
            )
            return resolved
        return cap

    return resolve


def _resolve_duracion_cpm_nodo(
    row: dict,
    all_actividades: List[dict],
    cap: str,
    ag_id: int,
    pk: str,
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    *,
    for_cpm: bool = False,
) -> int:
    """
    Duración efectiva para CPM — misma prioridad que estructura-tramo:
    fila consolidada → máx. almacenada (PK / versión) → span fechas hábiles → 1.
    """
    raw = row.get("duracion_dias_habiles")
    if raw is not None and str(raw).strip() != "":
        try:
            parsed = int(raw)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass

    stored_pk = _stored_duracion_agrupador(all_actividades, cap, ag_id, pk_ids=[pk])
    if stored_pk is not None:
        return stored_pk

    stored_all = _stored_duracion_agrupador(all_actividades, cap, ag_id, pk_ids=None)
    if stored_all is not None:
        return stored_all

    fi = _parse_date_cpm(row.get("fecha_inicio"))
    ff = _parse_date_cpm(row.get("fecha_fin_calculada"))
    if not for_cpm and fi and ff and ff >= fi:
        try:
            span = count_dias_habiles_entre(int(contrato_id), fi, ff, cache)
            if span > 0:
                return span
        except (TypeError, ValueError):
            pass

    return 1


def _cpm_paso0_limpiar_resultados_previos(sb, version_id: str) -> None:
    """Elimina resultados CPM de ejecuciones anteriores (no toca prog_actividades)."""
    sb.table("prog_cpm_resultados").delete().eq("version_id", version_id).execute()


def _fetch_prog_actividades_agrupador_cpm(sb, version_id: str) -> list:
    """Lee prog_actividades con agrupador para armar el grafo CPM (estado actual en BD)."""
    return (
        sb.table("prog_actividades")
        .select(
            "id,pk_id,capitulo,item,codigo_wbs,agrupador_id,fecha_inicio,fecha_fin_calculada,"
            "duracion_dias_habiles,override_manual"
        )
        .eq("version_id", version_id)
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )


def _cpm_liberar_agrupadores_para_calculo(sb, version_id: str) -> None:
    """
    Agrupadores WBS: el CPM calcula fechas vía dependencias + días hábiles.
    Quita anclas de guardado batch previo (override_manual) que bloqueaban el forward pass.
    """
    sb.table("prog_actividades").update({
        "override_manual": False,
    }).eq("version_id", version_id).not_.is_("agrupador_id", "null").execute()


def _cpm_limpiar_actividades_no_manuales(sb, version_id: str) -> None:
    """
    Borra fechas de programación/CPM en agrupadores no anclados.
    Debe ejecutarse tras construir el grafo y antes del forward pass.
    """
    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_actividades").update({
        "fecha_inicio": None,
        "fecha_fin_calculada": None,
        "fecha_inicio_temprana": None,
        "fecha_fin_temprana": None,
        "actualizado_en": now,
    }).eq("version_id", version_id).eq("override_manual", False).not_.is_(
        "agrupador_id", "null"
    ).execute()


def _cpm_limpiar_fechas_nodos_forward(
    nodos: list,
    fecha_inicio_ver: Optional[date],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    add_dh,
) -> None:
    """
    Reset in-memory de nodos no ancla: ES inicial = inicio versión + duración.
    El forward pass aplicará dependencias sobre estas fechas base.
    """
    if not fecha_inicio_ver:
        return
    for n in nodos:
        if n.es_ancla:
            continue
        dur = max(1, int(n.duracion or 1))
        n.fecha_inicio_base = fecha_inicio_ver
        ff = add_dh(contrato_id, fecha_inicio_ver, dur, cache)
        if ff:
            n.fecha_fin_base = ff


def _cpm_paso1_limpiar_entrada(sb, version_id: str) -> None:
    """Compat tests: paso0 + limpieza BD (pipeline completo pre-forward)."""
    _cpm_paso0_limpiar_resultados_previos(sb, version_id)
    _cpm_limpiar_actividades_no_manuales(sb, version_id)


# Alias usado en tests y código legado
_reset_cpm_entrada_version = _cpm_paso1_limpiar_entrada


def _duraciones_agrupador_para_cpm(raw_ags: List[dict]) -> Dict[tuple, int]:
    """Duración por (pk, cap, ag_id) solo desde duracion_dias_habiles almacenada (sin fechas CPM)."""
    if not raw_ags:
        return {}

    by_ag: Dict[tuple, set] = {}
    cap_canon: Dict[tuple, str] = {}
    for r in raw_ags:
        ag_raw = r.get("agrupador_id")
        if ag_raw is None:
            continue
        try:
            ag_int = int(ag_raw)
        except (TypeError, ValueError):
            continue
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        if not pk or not cap:
            continue
        sig = (_capitulo_cpm_match_key(cap), ag_int)
        by_ag.setdefault(sig, set()).add(pk)
        cap_canon.setdefault(sig, cap)

    out: Dict[tuple, int] = {}
    for sig, pk_set in by_ag.items():
        _, ag_int = sig
        cap = cap_canon[sig]
        pk_list = sorted(pk_set)
        dur_i = _stored_duracion_agrupador(raw_ags, cap, ag_int, pk_list)
        if dur_i is None or dur_i <= 0:
            continue
        for pk in pk_list:
            out[(pk, cap, str(ag_int))] = dur_i
    return out


def _cpm_debug_watch_keys(
    nodos: list,
    agr_codigo_by_id: Dict[int, str],
    watch_codigos: Tuple[str, ...] = ("4.D", "1.A"),
) -> Tuple[Set[tuple], Dict[tuple, str]]:
    """Nodos CPM a instrumentar en el forward pass (por codigo_wbs)."""
    watch: Set[tuple] = set()
    labels: Dict[tuple, str] = {}
    targets = {c.strip().upper() for c in watch_codigos if c.strip()}
    for n in nodos:
        ag_raw = str(n.agrupador_id or "").strip()
        if not ag_raw:
            continue
        try:
            ag_int = int(ag_raw)
        except (TypeError, ValueError):
            continue
        cod = str(agr_codigo_by_id.get(ag_int) or "").strip()
        if not cod:
            continue
        cod_u = cod.upper()
        if cod_u not in targets and not any(cod_u.endswith(f".{t}") or cod_u == t for t in targets):
            continue
        watch.add(n.key)
        labels[n.key] = f"{cod} pk={n.pk_id} cap={n.capitulo} ag_id={ag_int}"
    return watch, labels


def _log_cpm_grafo_diagnostico(
    nodos: list,
    deps_built: list,
    deps_raw: list,
    agr_codigo_by_id: Dict[int, str],
    debug_watch: Set[tuple],
) -> None:
    """Compara prog_dependencias vs aristas efectivas del grafo para nodos vigilados."""
    if not debug_watch:
        return

    nodos_set = {n.key for n in nodos}

    def _codigo(ag_raw) -> str:
        if ag_raw in (None, ""):
            return ""
        try:
            return str(agr_codigo_by_id.get(int(ag_raw)) or ag_raw)
        except (TypeError, ValueError):
            return str(ag_raw)

    for d in deps_raw or []:
        ag_o = d.get("agrupador_id_origen")
        ag_d = d.get("agrupador_id_destino")
        cod_o, cod_d = _codigo(ag_o), _codigo(ag_d)
        if cod_d.upper() != "4.D" and cod_o.upper() != "1.A":
            if not (cod_o.upper().endswith(".1.A") or cod_d.upper().endswith(".4.D")):
                continue
        _logger.info(
            "CPM dep BD: %s/%s(%s) → %s/%s(%s) tipo=%s lag=%s caps_raw=(%r,%r) ag_ids=(%s,%s)",
            d.get("pk_id_origen"), d.get("capitulo_origen"), cod_o,
            d.get("pk_id_destino"), d.get("capitulo_destino"), cod_d,
            d.get("tipo"), d.get("lag_dias"),
            d.get("capitulo_origen"), d.get("capitulo_destino"),
            ag_o, ag_d,
        )
        for pk in sorted({n.pk_id for n in nodos}):
            ag_o_s = str(ag_o).strip() if ag_o not in (None, "") else ""
            ag_d_s = str(ag_d).strip() if ag_d not in (None, "") else ""
            if not ag_o_s or not ag_d_s:
                continue
            resolve = _build_capitulo_resolver(nodos)
            cap_o = resolve(pk, str(d.get("capitulo_origen") or "").strip())
            cap_d = resolve(pk, str(d.get("capitulo_destino") or "").strip())
            orig = (pk, cap_o, ag_o_s)
            dest = (pk, cap_d, ag_d_s)
            in_graph = orig in nodos_set and dest in nodos_set
            _logger.info(
                "CPM dep réplica pk=%s: %s → %s en_grafo=%s (nodos=%s,%s)",
                pk, orig, dest, in_graph, orig in nodos_set, dest in nodos_set,
            )

    for key in sorted(debug_watch):
        label = key
        incoming = [dep for dep in deps_built if dep.destino == key]
        _logger.info(
            "CPM nodo vigilado %s: %d arista(s) entrante(s) en grafo",
            label, len(incoming),
        )
        for dep in incoming:
            _logger.info(
                "  ← orig=%s tipo=%s lag=%d (orig_en_grafo=%s)",
                dep.origen, dep.tipo, dep.lag_dias, dep.origen in nodos_set,
            )


def _sync_duraciones_merge_tramo_antes_cpm(
    raw_ags: List[dict],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
) -> Dict[tuple, int]:
    """
    Duración por (pk, cap, ag_id) usando _merge_programacion_agrupador (misma fuente que UI tramo).
    """
    if not raw_ags:
        return {}

    by_ag: Dict[tuple, set] = {}
    cap_canon: Dict[tuple, str] = {}
    for r in raw_ags:
        ag_raw = r.get("agrupador_id")
        if ag_raw is None:
            continue
        try:
            ag_int = int(ag_raw)
        except (TypeError, ValueError):
            continue
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        if not pk or not cap:
            continue
        sig = (_capitulo_cpm_match_key(cap), ag_int)
        by_ag.setdefault(sig, set()).add(pk)
        cap_canon.setdefault(sig, cap)

    out: Dict[tuple, int] = {}
    for sig, pk_set in by_ag.items():
        cap_key, ag_int = sig
        cap = cap_canon[sig]
        pk_list = sorted(pk_set)
        merge = _merge_programacion_agrupador(
            raw_ags, cap, ag_int, pk_list, contrato_id=contrato_id, cache=cache,
        )
        raw_dur = merge.get("duracion_dias_habiles")
        if raw_dur is None:
            continue
        try:
            dur_i = int(raw_dur)
        except (TypeError, ValueError):
            continue
        if dur_i <= 0:
            continue
        for pk in pk_list:
            out[(pk, cap, str(ag_int))] = dur_i
    return out


def _persist_duraciones_agrupador_antes_cpm(
    sb,
    version_id: str,
    raw_ags: List[dict],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
) -> int:
    """Escribe duracion_dias_habiles faltante en cabecera WBS antes del forward pass."""
    if not raw_ags:
        return 0

    merge_dur = _duraciones_agrupador_para_cpm(raw_ags)

    ag_rows_by_key: Dict[tuple, List[dict]] = {}
    for r in raw_ags:
        ag_id = str(r.get("agrupador_id") or "").strip()
        if not ag_id:
            continue
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        ag_rows_by_key.setdefault((pk, cap, ag_id), []).append(dict(r))

    now = datetime.now(timezone.utc).isoformat()
    updates: List[dict] = []
    for (pk, cap, ag_id), rows in ag_rows_by_key.items():
        consolidated = _consolidar_fila_agrupador_cpm(rows)
        try:
            ag_int = int(ag_id)
        except (TypeError, ValueError):
            continue
        resolved = _resolve_duracion_cpm_nodo(
            consolidated, raw_ags, cap, ag_int, pk, contrato_id, cache, for_cpm=True,
        )
        merge_val = merge_dur.get((pk, cap, ag_id))
        if merge_val is not None and merge_val > resolved:
            resolved = merge_val
        header = next((r for r in rows if _is_agrupador_header_row(r)), None)
        target = header or consolidated
        current = target.get("duracion_dias_habiles")
        current_i: Optional[int] = None
        if current is not None and str(current).strip() != "":
            try:
                current_i = int(current)
            except (TypeError, ValueError):
                current_i = None
        needs_write = current_i is None or (current_i <= 1 and resolved > 1)
        if not needs_write:
            for r in rows:
                if r.get("duracion_dias_habiles") is None or (
                    int(r.get("duracion_dias_habiles") or 0) <= 1 and resolved > 1
                ):
                    r["duracion_dias_habiles"] = resolved
            continue
        rid = str(target.get("id") or "").strip()
        if not rid:
            for r in rows:
                r["duracion_dias_habiles"] = resolved
            continue
        updates.append({
            "id": rid,
            "duracion_dias_habiles": resolved,
            "actualizado_en": now,
        })
        for r in rows:
            r["duracion_dias_habiles"] = resolved

    if updates:
        _bulk_patch_prog_actividades_by_id(sb, updates)
    return len(updates)


def _nodo_cpm_desde_agrupador(
    row: dict,
    fecha_inicio_ver: Optional[date],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    add_dh,
    *,
    duracion_resuelta: Optional[int] = None,
) -> Optional["NodoCPM"]:
    """
    Nodo CPM de agrupador.

    Regla de entrada (forward pass):
      - No ancla: solo fecha_inicio de versión + duracion_dias_habiles (fin = inicio + dur).
      - Ancla manual (override_manual + fecha_inicio): fechas explícitas del usuario.
      - Nunca usar fechas prog_actividades de un cálculo CPM anterior.
    """
    from prog_obra_cpm import NodoCPM

    ag_id = str(row.get("agrupador_id") or "").strip()
    pk = str(row.get("pk_id") or "").strip()
    cap = str(row.get("capitulo") or "").strip()
    if not ag_id or not pk or not cap:
        return None

    es_ancla = _es_ancla_manual_cpm(row)
    dur = duracion_resuelta if duracion_resuelta is not None else _duracion_cpm_agrupador(row)
    dur = max(1, int(dur or 1))

    if es_ancla:
        fi = _parse_date_cpm(row.get("fecha_inicio"))
        ff_manual = _parse_date_cpm(row.get("fecha_fin_calculada"))
        ff = ff_manual if ff_manual else add_dh(contrato_id, fi, dur, cache)
    else:
        fi = fecha_inicio_ver
        ff = add_dh(contrato_id, fi, dur, cache) if fi else None

    if not fi or not ff:
        return None

    return NodoCPM(
        pk_id=pk,
        capitulo=cap,
        duracion=dur,
        fecha_inicio_base=fi,
        fecha_fin_base=ff,
        agrupador_id=ag_id,
        es_ancla=es_ancla,
    )


def _resolve_duracion_stub_cpm_nodo(
    pk: str,
    cap: str,
    ag_s: str,
    dur_by_key: dict,
    merge_dur_by_ag: Dict[tuple, int],
    raw_ags: List[dict],
) -> int:
    """
    Duración para nodos stub creados desde dependencias cuando el PK no tiene fila WBS.
    Hereda la duración almacenada de otros PKs del mismo capítulo/agrupador (tramo).
    """
    from prog_obra_cpm import cpm_node_key

    key = cpm_node_key(pk, cap, ag_s)
    if key in dur_by_key:
        return max(1, int(dur_by_key[key]))

    cap_key = _capitulo_cpm_match_key(cap)
    cross = [
        int(v)
        for (p, c, ag), v in (merge_dur_by_ag or {}).items()
        if str(ag) == str(ag_s) and _capitulo_cpm_match_key(c) == cap_key and int(v) > 0
    ]
    if cross:
        return max(cross)

    try:
        ag_int = int(ag_s)
    except (TypeError, ValueError):
        ag_int = 0
    stored = _stored_duracion_agrupador(raw_ags, cap, ag_int, pk_ids=None)
    if stored is not None and stored > 0:
        return stored

    return 1


def _completar_nodos_cpm_desde_dependencias(
    sb,
    version_id: str,
    nodos: list,
    seen_ag: set,
    caps_con_agrupador: set,
    fecha_inicio_ver: Optional[date],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    add_dh,
    dur_lookup: Optional[dict] = None,
    merge_dur_by_ag: Optional[Dict[tuple, int]] = None,
    raw_ags: Optional[List[dict]] = None,
    deps: Optional[List[dict]] = None,
) -> None:
    """Añade nodos stub para extremos de dependencias que aún no están en el grafo."""
    from prog_obra_cpm import NodoCPM

    if not fecha_inicio_ver:
        return

    from prog_obra_cpm import cpm_agrupador_key, cpm_node_key

    resolve_cap = _build_capitulo_resolver(nodos)
    node_keys = {n.key for n in nodos}
    dur_by_key = dict(dur_lookup or {})
    merge_map = dict(merge_dur_by_ag or {})
    acts = list(raw_ags or [])
    for n in nodos:
        dur_by_key[n.key] = max(1, int(n.duracion or 1))

    for d in (deps if deps is not None else listar_dependencias(sb, version_id)):
        for pk, cap, ag_raw in (
            (d.get("pk_id_origen"), d.get("capitulo_origen"), d.get("agrupador_id_origen")),
            (d.get("pk_id_destino"), d.get("capitulo_destino"), d.get("agrupador_id_destino")),
        ):
            pk_s = str(pk or "").strip()
            cap_raw = str(cap or "").strip()
            cap_s = resolve_cap(pk_s, cap_raw) if cap_raw else cap_raw
            ag_s = cpm_agrupador_key(ag_raw)
            if not pk_s or not cap_s or not ag_s:
                continue
            key = cpm_node_key(pk_s, cap_s, ag_s)
            if key in node_keys:
                continue
            dur = _resolve_duracion_stub_cpm_nodo(pk_s, cap_s, ag_s, dur_by_key, merge_map, acts)
            dur_by_key[key] = dur
            fi = fecha_inicio_ver
            ff = add_dh(contrato_id, fi, dur, cache)
            if not ff:
                continue
            nodos.append(NodoCPM(
                pk_id=pk_s,
                capitulo=cap_s,
                duracion=dur,
                fecha_inicio_base=fi,
                fecha_fin_base=ff,
                agrupador_id=ag_s,
                es_ancla=False,
            ))
            node_keys.add(key)
            if ag_s:
                seen_ag.add(key)
                caps_con_agrupador.add((pk_s, cap_s))


def _cpm_expand_stub_nodos_todos_pks(
    nodos: list,
    deps: Optional[List[dict]],
    raw_ags: Optional[List[dict]],
    fecha_inicio_ver: Optional[date],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    add_dh,
    dur_lookup: Optional[dict] = None,
    merge_dur_by_ag: Optional[Dict[tuple, int]] = None,
) -> None:
    """
    Réplica nodos stub de dependencias a todos los PK con actividades en la versión.
    Sin esto, solo el PK de la dependencia (p. ej. 120367) recibe la cadena CPM completa.
    """
    from prog_obra_cpm import NodoCPM, cpm_agrupador_key, cpm_node_key

    if not fecha_inicio_ver or not deps:
        return

    resolve_cap = _build_capitulo_resolver(nodos)
    all_pks = sorted(
        {str(n.pk_id).strip() for n in nodos if str(n.pk_id or "").strip()}
        | {str(r.get("pk_id") or "").strip() for r in (raw_ags or []) if r.get("pk_id")}
    )
    ag_points: set[tuple[str, str]] = set()
    for d in deps:
        for cap_key, ag_key in (
            (d.get("capitulo_origen"), d.get("agrupador_id_origen")),
            (d.get("capitulo_destino"), d.get("agrupador_id_destino")),
        ):
            cap_raw = str(cap_key or "").strip()
            ag_s = cpm_agrupador_key(ag_key)
            if cap_raw and ag_s:
                ag_points.add((cap_raw, ag_s))
    for n in nodos:
        if n.agrupador_id:
            ag_points.add((str(n.capitulo).strip(), str(n.agrupador_id).strip()))

    node_keys = {n.key for n in nodos}
    dur_by_key = dict(dur_lookup or {})
    acts = list(raw_ags or [])
    for n in nodos:
        dur_by_key[n.key] = max(1, int(n.duracion or 1))

    for pk_s in all_pks:
        for cap_raw, ag_s in sorted(ag_points):
            cap_s = resolve_cap(pk_s, cap_raw)
            key = cpm_node_key(pk_s, cap_s, ag_s)
            if key in node_keys:
                continue
            dur = _resolve_duracion_stub_cpm_nodo(pk_s, cap_s, ag_s, dur_by_key, merge_dur_by_ag or {}, acts)
            dur_by_key[key] = dur
            ff = add_dh(contrato_id, fecha_inicio_ver, dur, cache)
            if not ff:
                continue
            nodos.append(NodoCPM(
                pk_id=pk_s,
                capitulo=cap_s,
                duracion=dur,
                fecha_inicio_base=fecha_inicio_ver,
                fecha_fin_base=ff,
                agrupador_id=ag_s,
                es_ancla=False,
            ))
            node_keys.add(key)


def ejecutar_cpm_version(sb, version_id, contrato_id, cache) -> "ResultadoCPM":
    """
    Pipeline CPM (orden inviolable en cada ejecución):
      0. Limpiar prog_cpm_resultados de la versión
      A. Reconstruir grafo (nodos + dependencias) desde prog_actividades actual
      B. Limpiar fechas previas en nodos no ancla (memoria + prog_actividades)
      C. Forward/backward pass y write-back (prog_cpm_resultados + fecha_*_temprana)
    """
    from prog_obra_cpm import NodoCPM, ResultadoCPM
    from prog_obra_calendar import add_dias_habiles as _add_dh

    ver_rows = (
        sb.table("prog_versiones")
        .select("fecha_inicio,fecha_fin")
        .eq("id", version_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )
    ver = ver_rows[0]
    fecha_inicio_ver = _parse_date_cpm(ver.get("fecha_inicio"))
    fecha_fin_ver = _parse_date_cpm(ver.get("fecha_fin"))

    # ── 0: borrar resultados previos antes de leer actividades o armar el grafo ──
    _cpm_paso0_limpiar_resultados_previos(sb, version_id)
    _cpm_liberar_agrupadores_para_calculo(sb, version_id)
    deps_raw = listar_dependencias(sb, version_id)

    # ── A: construir nodos y dependencias desde prog_actividades actual ─────────
    raw_caps = (
        sb.rpc("prog_get_capitulos_con_fechas", {"p_version_id": version_id})
        .execute()
        .data
        or []
    )
    nodos = []
    seen_ag = set()
    raw_ags = _fetch_prog_actividades_agrupador_cpm(sb, version_id)
    n_persisted = _persist_duraciones_agrupador_antes_cpm(
        sb, version_id, raw_ags, contrato_id, cache,
    )
    if n_persisted:
        _logger.info("CPM: persistidas %d duracion(es) en cabecera WBS antes del cálculo", n_persisted)
        raw_ags = _fetch_prog_actividades_agrupador_cpm(sb, version_id)

    merge_dur_by_ag = _duraciones_agrupador_para_cpm(raw_ags)

    agr_codigo_by_id: Dict[int, str] = {}
    agr_rows_meta = (
        sb.table("listado_precios_agrupadores")
        .select("id,codigo_wbs")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    for a in agr_rows_meta:
        aid = a.get("id")
        cw = str(a.get("codigo_wbs") or "").strip()
        if aid is not None and cw:
            agr_codigo_by_id[int(aid)] = cw

    caps_con_agrupador: set[tuple[str, str]] = set()
    dur_lookup: dict = {}
    ag_rows_by_key: dict = {}
    for r in raw_ags:
        ag_id = str(r.get("agrupador_id") or "").strip()
        if not ag_id:
            continue
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        key = (pk, cap, ag_id)
        ag_rows_by_key.setdefault(key, []).append(dict(r))

    for key, rows in ag_rows_by_key.items():
        pk, cap, ag_id = key
        r = _consolidar_fila_agrupador_cpm_entrada(rows)
        r["pk_id"] = pk
        r["capitulo"] = cap
        r["agrupador_id"] = ag_id
        try:
            ag_int = int(ag_id)
        except (TypeError, ValueError):
            ag_int = 0
        dur_res = _resolve_duracion_cpm_nodo(
            r, raw_ags, cap, ag_int, pk, contrato_id, cache, for_cpm=True,
        )
        merge_val = merge_dur_by_ag.get((pk, cap, ag_id))
        if merge_val is not None and merge_val > dur_res:
            dur_res = merge_val
        dur_lookup[key] = dur_res
        nodo = _nodo_cpm_desde_agrupador(
            r, fecha_inicio_ver, contrato_id, cache, _add_dh, duracion_resuelta=dur_res,
        )
        if not nodo:
            continue
        nodos.append(nodo)
        seen_ag.add(key)
        caps_con_agrupador.add((pk, cap))

    _completar_nodos_cpm_desde_dependencias(
        sb,
        version_id,
        nodos,
        seen_ag,
        caps_con_agrupador,
        fecha_inicio_ver,
        contrato_id,
        cache,
        _add_dh,
        dur_lookup=dur_lookup,
        merge_dur_by_ag=merge_dur_by_ag,
        raw_ags=raw_ags,
        deps=deps_raw,
    )
    _cpm_expand_stub_nodos_todos_pks(
        nodos,
        deps_raw,
        raw_ags,
        fecha_inicio_ver,
        contrato_id,
        cache,
        _add_dh,
        dur_lookup=dur_lookup,
        merge_dur_by_ag=merge_dur_by_ag,
    )

    if not nodos and (raw_ags or deps_raw):
        if not fecha_inicio_ver:
            return ResultadoCPM(
                ok=False,
                error=(
                    "Defina la fecha de inicio de la versión en el horizonte del cronograma "
                    "para calcular CPM sin fechas manuales en los agrupadores."
                ),
            )

    for r in raw_caps:
        pk = str(r["pk_id"]).strip()
        cap = str(r["capitulo"]).strip()
        if (pk, cap) in caps_con_agrupador:
            continue
        dur = max(1, int(r.get("duracion_dias_hab") or 1))
        fi = fecha_inicio_ver
        if not fi:
            continue
        ff = _add_dh(contrato_id, fi, dur, cache)
        if not ff:
            continue
        nodos.append(NodoCPM(
            pk_id=pk,
            capitulo=cap,
            duracion=dur,
            fecha_inicio_base=fi,
            fecha_fin_base=ff,
        ))

    if not nodos:
        return ResultadoCPM(ok=True)

    d0 = min(n.fecha_inicio_base for n in nodos)
    d1 = max(n.fecha_fin_base for n in nodos)
    if fecha_inicio_ver and fecha_inicio_ver < d0:
        d0 = fecha_inicio_ver
    if fecha_fin_ver and fecha_fin_ver > d1:
        d1 = fecha_fin_ver
    cache.fechas_extra(contrato_id, d0 - timedelta(days=120), d1 + timedelta(days=120))

    dependencias = _construir_dependencias_cpm(sb, version_id, nodos, deps_specific=deps_raw)

    nodos_set = {n.key for n in nodos}
    deps_efectivas = [
        d for d in dependencias
        if d.origen in nodos_set and d.destino in nodos_set
    ]
    _logger.info(
        "CPM grafo: %d nodos, %d dependencias (%d emparejan nodos del grafo)",
        len(nodos), len(dependencias), len(deps_efectivas),
    )
    if deps_raw and not deps_efectivas:
        _logger.warning(
            "CPM: hay dependencias en BD pero ninguna empareja nodos del grafo; "
            "revisar capitulo/agrupador_id. Nodos=%s",
            sorted({(n.pk_id, n.capitulo, n.agrupador_id) for n in nodos})[:20],
        )

    debug_watch, debug_labels = _cpm_debug_watch_keys(nodos, agr_codigo_by_id)
    _log_cpm_grafo_diagnostico(nodos, dependencias, deps_raw, agr_codigo_by_id, debug_watch)

    # ── B: limpiar fechas previas antes del forward pass ─────────────────────
    _cpm_limpiar_fechas_nodos_forward(nodos, fecha_inicio_ver, contrato_id, cache, _add_dh)
    _cpm_limpiar_actividades_no_manuales(sb, version_id)

    # ── C: calcular y escribir resultados ────────────────────────────────────
    resultado = calcular_cpm(
        nodos,
        dependencias,
        contrato_id,
        cache,
        fecha_inicio_proyecto=fecha_inicio_ver,
        fecha_fin_proyecto=fecha_fin_ver,
        debug_watch=debug_watch,
        debug_labels=debug_labels,
    )
    if not resultado.ok:
        return resultado

    payload = []
    for n in resultado.nodos:
        row = {
            "pk_id": n.pk_id,
            "capitulo": n.capitulo,
            "fecha_inicio_temprana": n.fecha_inicio_temprana.isoformat() if n.fecha_inicio_temprana else None,
            "fecha_fin_temprana": n.fecha_fin_temprana.isoformat() if n.fecha_fin_temprana else None,
            "fecha_inicio_tardia": n.fecha_inicio_tardia.isoformat() if n.fecha_inicio_tardia else None,
            "fecha_fin_tardia": n.fecha_fin_tardia.isoformat() if n.fecha_fin_tardia else None,
            "holgura_total": n.holgura_total,
            "holgura_libre": n.holgura_libre,
            "es_ruta_critica": n.es_ruta_critica,
            "tiene_sucesores": n.tiene_sucesores,
            "es_actividad_final_tramo": n.es_actividad_final_tramo,
        }
        if n.agrupador_id:
            try:
                row["agrupador_id"] = int(n.agrupador_id)
            except (TypeError, ValueError):
                row["agrupador_id"] = n.agrupador_id
        payload.append(row)
    sb.rpc("prog_upsert_cpm_resultados", {
        "p_version_id": version_id,
        "p_contrato_id": contrato_id,
        "p_resultados": payload,
    }).execute()

    ag_writeback = [n for n in resultado.nodos if n.agrupador_id and not n.es_ancla and n.fecha_inicio_temprana]
    pks_touched = sorted({str(n.pk_id).strip() for n in resultado.nodos if str(n.pk_id or "").strip()})
    _apply_cpm_writeback_unified(sb, version_id, contrato_id, ag_writeback)

    cap_heredado_updates: List[dict] = []
    for n in resultado.nodos:
        if n.agrupador_id:
            continue
        if n.es_ancla or not n.fecha_inicio_temprana:
            continue
        sb.table("prog_actividades_capitulo").update({
            "fecha_inicio_sugerida": n.fecha_inicio_temprana.isoformat(),
        }).eq("version_id", version_id).eq("pk_id", n.pk_id).eq("capitulo", n.capitulo).execute()
        cap_heredado_updates.append(n)

    for n in cap_heredado_updates:
        _recalc_items_heredados_cpm(
            sb, version_id, n.pk_id, n.capitulo, n.fecha_inicio_temprana, contrato_id, cache,
        )

    changed = [
        n.key for n in resultado.nodos
        if not n.es_ancla and n.fecha_inicio_temprana and n.fecha_inicio_temprana != n.fecha_inicio_base
    ]
    resultado.nodos_afectados_cascada = nodos_afectados_por(changed, dependencias)

    upsert_prog_pk_estado_bulk(sb, version_id, contrato_id, pks_touched)

    mark_cpm_synced(sb, version_id)

    return resultado


def _bulk_patch_prog_actividades_by_id(sb, rows: List[dict]) -> None:
    """Actualiza filas existentes de prog_actividades por id (nunca inserta)."""
    if not rows:
        return
    grouped: Dict[tuple, List[str]] = {}
    for row in rows:
        rid = str(row.get("id") or "").strip()
        if not rid:
            continue
        payload = {k: v for k, v in row.items() if k != "id"}
        if not payload:
            continue
        grouped.setdefault(tuple(sorted(payload.items())), []).append(rid)
    chunk = 200
    for key, ids in grouped.items():
        payload = dict(key)
        for i in range(0, len(ids), chunk):
            sb.table("prog_actividades").update(payload).in_("id", ids[i:i + chunk]).execute()


def _listado_items_por_agrupador(sb, contrato_id: int) -> Dict[Tuple[str, int], set]:
    """Ítems de listado_precios agrupados por (capitulo, agrupador_id)."""
    rows = (
        sb.table("listado_precios")
        .select("capitulo,agrupador_id,item_numero")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    out: Dict[Tuple[str, int], set] = {}
    for r in rows:
        cap = (r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        it = (r.get("item_numero") or "").strip()
        if not cap or ag_raw is None or not it:
            continue
        try:
            out.setdefault((cap, int(ag_raw)), set()).add(it)
        except (TypeError, ValueError):
            continue
    return out


def _hijos_ppto_agrupador_en_memoria(
    pk: str,
    cap: str,
    ag_id: int,
    ppto_keys: set,
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
    listado_items: Dict[Tuple[str, int], set],
) -> List[Tuple[str, str]]:
    """Ítems hijo del agrupador sin consultas extra."""
    out: List[Tuple[str, str]] = []
    for p_cap, it in ppto_keys:
        if p_cap != cap:
            continue
        if _resolve_listado_agrupador_id(ag_by_item, p_cap, it) == ag_id:
            out.append((p_cap, it))
    if out:
        return out
    for lp_it in listado_items.get((cap, ag_id), set()):
        for p_cap, p_it in ppto_keys:
            if p_cap != cap:
                continue
            if _norm_prog_item_key(p_it) == _norm_prog_item_key(lp_it):
                out.append((p_cap, p_it))
                break
    return out


def _apply_cpm_writeback_unified(
    sb,
    version_id: str,
    contrato_id: int,
    nodos: list,
) -> int:
    """Write-back CPM: tempranas + programación visible en un solo batch por id."""
    if not nodos:
        return 0

    pk_ids = sorted({str(n.pk_id).strip() for n in nodos if str(n.pk_id or "").strip()})
    ids_by_key, rows_by_key = _prog_actividades_agrupador_index(sb, version_id, pk_ids)
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    ppto_keys_by_pk = _ppto_keys_por_pks(sb, contrato_id, pk_ids)
    listado_items = _listado_items_por_agrupador(sb, contrato_id)
    items_index = _fetch_prog_actividades_items_index(sb, version_id, pk_ids)

    now = datetime.now(timezone.utc).isoformat()
    patch_by_id: Dict[str, dict] = {}
    header_fallback_sigs: List[tuple] = []
    seen_sig: set = set()

    for n in nodos:
        if not n.agrupador_id or n.es_ancla:
            continue
        if not n.fecha_inicio_temprana or not n.fecha_fin_temprana:
            continue
        pk = str(n.pk_id).strip()
        cap = str(n.capitulo).strip()
        try:
            ag_id = int(str(n.agrupador_id).strip())
        except (TypeError, ValueError):
            continue
        sig = (pk, cap, ag_id)
        if sig in seen_sig:
            continue
        seen_sig.add(sig)

        dur = max(1, int(n.duracion or 1))
        fi_iso = n.fecha_inicio_temprana.isoformat()
        ff_iso = n.fecha_fin_temprana.isoformat()
        header_patch = {
            "fecha_inicio_temprana": fi_iso,
            "fecha_fin_temprana": ff_iso,
            "fecha_inicio": fi_iso,
            "fecha_fin_calculada": ff_iso,
            "duracion_dias_habiles": dur,
            "override_manual": False,
            "actualizado_en": now,
        }

        row_ids = ids_by_key.get(sig) or []
        if row_ids:
            for rid in row_ids:
                patch_by_id[rid] = {**header_patch, "id": rid}
        else:
            header_fallback_sigs.append((pk, cap, ag_id, fi_iso, ff_iso, dur))

        ag_rows = rows_by_key.get(sig) or []
        codigo_wbs = ""
        for r in ag_rows:
            if _is_agrupador_header_row(r):
                codigo_wbs = str(r.get("codigo_wbs") or r.get("item") or "").strip()
                break
        if not codigo_wbs:
            for r in ag_rows:
                cw = str(r.get("codigo_wbs") or r.get("item") or "").strip()
                if cw:
                    codigo_wbs = cw
                    break

        ppto_keys = ppto_keys_by_pk.get(pk) or set()
        for p_cap, it in _hijos_ppto_agrupador_en_memoria(
            pk, cap, ag_id, ppto_keys, ag_by_item, listado_items,
        ):
            row = items_index.get((pk, p_cap, it))
            if not row or row.get("override_manual"):
                continue
            rid = str(row["id"])
            patch_by_id[rid] = {
                "id": rid,
                "fecha_inicio_temprana": fi_iso,
                "fecha_fin_temprana": ff_iso,
                "fecha_inicio": fi_iso,
                "fecha_fin_calculada": ff_iso,
                "duracion_dias_habiles": dur,
                "heredado_de_capitulo": True,
                "override_manual": False,
                "agrupador_id": ag_id,
                "codigo_wbs": codigo_wbs or None,
                "actualizado_en": now,
            }

    _bulk_patch_prog_actividades_by_id(sb, list(patch_by_id.values()))

    for pk, cap, ag_id, fi_iso, ff_iso, dur in header_fallback_sigs:
        sb.table("prog_actividades").update({
            "fecha_inicio_temprana": fi_iso,
            "fecha_fin_temprana": ff_iso,
            "fecha_inicio": fi_iso,
            "fecha_fin_calculada": ff_iso,
            "duracion_dias_habiles": dur,
            "override_manual": False,
            "actualizado_en": now,
        }).eq("version_id", version_id).eq("pk_id", pk).eq("capitulo", cap).eq(
            "agrupador_id", ag_id
        ).execute()

    return len(seen_sig)


def _apply_cpm_fechas_bulk(sb, version_id: str, nodos: list) -> int:
    """Write-back masivo: solo fecha_inicio_temprana / fecha_fin_temprana (nunca fecha_inicio)."""
    if not nodos:
        return 0

    pk_ids = sorted({str(n.pk_id).strip() for n in nodos if str(n.pk_id or "").strip()})
    ids_by_key, rows_by_key = _prog_actividades_agrupador_index(sb, version_id, pk_ids)

    now = datetime.now(timezone.utc).isoformat()
    updates: List[dict] = []
    seen_keys: set = set()
    for n in nodos:
        if not n.fecha_inicio_temprana or not n.fecha_fin_temprana:
            continue
        try:
            ag_id = int(str(n.agrupador_id).strip())
        except (TypeError, ValueError):
            continue
        pk = str(n.pk_id).strip()
        cap = str(n.capitulo).strip()
        sig = (pk, cap, ag_id)
        if sig in seen_keys:
            continue
        seen_keys.add(sig)
        fi_iso = n.fecha_inicio_temprana.isoformat()
        ff_iso = n.fecha_fin_temprana.isoformat()
        row_ids = ids_by_key.get(sig)
        if row_ids:
            for rid in row_ids:
                updates.append({
                    "id": rid,
                    "fecha_inicio_temprana": fi_iso,
                    "fecha_fin_temprana": ff_iso,
                    "actualizado_en": now,
                })
        else:
            sb.table("prog_actividades").update({
                "fecha_inicio_temprana": fi_iso,
                "fecha_fin_temprana": ff_iso,
                "actualizado_en": now,
            }).eq("version_id", version_id).eq("pk_id", pk).eq(
                "capitulo", cap
            ).eq("agrupador_id", ag_id).execute()

    _bulk_patch_prog_actividades_by_id(sb, updates)
    return len(seen_keys)


def _hijo_ppto_for_agrupador(
    sb,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    ppto_items: List[Tuple[str, str, Decimal, str, Decimal]],
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
) -> List[Tuple[str, str, Decimal, str, Decimal]]:
    """Ítems de presupuesto del PK asignados al agrupador WBS."""
    cap = capitulo.strip()
    hijo_ppto = [
        (p_cap, it, cant, und, vlr)
        for p_cap, it, cant, und, vlr in ppto_items
        if p_cap == cap and _resolve_listado_agrupador_id(ag_by_item, p_cap, it) == agrupador_id
    ]
    if hijo_ppto:
        return hijo_ppto
    ag_items_list = [
        (r.get("item_numero") or "").strip()
        for r in (
            sb.table("listado_precios")
            .select("item_numero")
            .eq("contrato_id", contrato_id)
            .eq("capitulo", cap)
            .eq("agrupador_id", agrupador_id)
            .execute()
            .data
            or []
        )
        if (r.get("item_numero") or "").strip()
    ]
    if not ag_items_list:
        return []
    ag_items_set = set(ag_items_list)
    return [
        (p_cap, it, cant, und, vlr)
        for p_cap, it, cant, und, vlr in ppto_items
        if p_cap == cap and _ppto_item_in_listado_set(it, ag_items_set)
    ]


def _fetch_prog_actividades_items_index(
    sb, version_id: str, pk_ids: List[str]
) -> Dict[Tuple[str, str, str], dict]:
    """Mapa (pk, capitulo, item) → fila prog_actividades segmento 1."""
    pks = sorted({str(p).strip() for p in (pk_ids or []) if str(p).strip()})
    if not pks:
        return {}
    rows = (
        sb.table("prog_actividades")
        .select("id,pk_id,capitulo,item,override_manual")
        .eq("version_id", version_id)
        .in_("pk_id", pks)
        .eq("segmento", 1)
        .execute()
        .data
        or []
    )
    out: Dict[Tuple[str, str, str], dict] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if pk and cap and it:
            out[(pk, cap, it)] = r
    return out


def _apply_cpm_programacion_visible(
    sb,
    version_id: str,
    contrato_id: int,
    cache,
    nodos: list,
    usuario_id: int = 0,
) -> int:
    """
    Propaga fechas tempranas CPM a fecha_inicio/fecha_fin_calculada en cabeceras WBS e ítems hijo.
    Un solo batch UPDATE por id (sin INSERT; el CPM solo actualiza filas existentes).
    """
    if not nodos:
        return 0

    pk_ids = sorted({str(n.pk_id).strip() for n in nodos if str(n.pk_id or "").strip()})
    ids_by_key, rows_by_key = _prog_actividades_agrupador_index(sb, version_id, pk_ids)
    ag_by_item, _ = _listado_agrupador_por_item(sb, contrato_id)
    ppto_cache: Dict[str, List[Tuple[str, str, Decimal, str, Decimal]]] = {}
    items_index = _fetch_prog_actividades_items_index(sb, version_id, pk_ids)

    now = datetime.now(timezone.utc).isoformat()
    patch_rows: List[dict] = []
    header_fallback_sigs: List[tuple] = []
    seen_sig: set = set()
    for n in nodos:
        if not n.agrupador_id or n.es_ancla:
            continue
        if not n.fecha_inicio_temprana or not n.fecha_fin_temprana:
            continue
        pk = str(n.pk_id).strip()
        cap = str(n.capitulo).strip()
        try:
            ag_id = int(str(n.agrupador_id).strip())
        except (TypeError, ValueError):
            continue
        sig = (pk, cap, ag_id)
        if sig in seen_sig:
            continue
        seen_sig.add(sig)

        dur = max(1, int(n.duracion or 1))
        fi = n.fecha_inicio_temprana
        ff = n.fecha_fin_temprana
        fi_iso = fi.isoformat()
        ff_iso = ff.isoformat()

        row_ids = ids_by_key.get(sig) or []
        if row_ids:
            for rid in row_ids:
                patch_rows.append({
                    "id": rid,
                    "fecha_inicio": fi_iso,
                    "fecha_fin_calculada": ff_iso,
                    "duracion_dias_habiles": dur,
                    "actualizado_en": now,
                })
        else:
            header_fallback_sigs.append((pk, cap, ag_id, fi_iso, ff_iso, dur))

        ag_rows = rows_by_key.get(sig) or []
        codigo_wbs = ""
        for r in ag_rows:
            if _is_agrupador_header_row(r):
                codigo_wbs = str(r.get("codigo_wbs") or r.get("item") or "").strip()
                break
        if not codigo_wbs:
            for r in ag_rows:
                cw = str(r.get("codigo_wbs") or r.get("item") or "").strip()
                if cw:
                    codigo_wbs = cw
                    break

        if pk not in ppto_cache:
            _, ppto_cache[pk] = _ppto_items_por_pk(sb, contrato_id, pk)

        for p_cap, it, _, _, _ in _hijo_ppto_for_agrupador(
            sb, contrato_id, pk, cap, ag_id, ppto_cache[pk], ag_by_item
        ):
            row = items_index.get((pk, p_cap, it))
            if not row or row.get("override_manual"):
                continue
            patch_rows.append({
                "id": str(row["id"]),
                "fecha_inicio": fi_iso,
                "fecha_fin_calculada": ff_iso,
                "duracion_dias_habiles": dur,
                "heredado_de_capitulo": True,
                "override_manual": False,
                "agrupador_id": ag_id,
                "codigo_wbs": codigo_wbs or None,
                "actualizado_en": now,
            })

    _bulk_patch_prog_actividades_by_id(sb, patch_rows)

    for pk, cap, ag_id, fi_iso, ff_iso, dur in header_fallback_sigs:
        sb.table("prog_actividades").update({
            "fecha_inicio": fi_iso,
            "fecha_fin_calculada": ff_iso,
            "duracion_dias_habiles": dur,
            "actualizado_en": now,
        }).eq("version_id", version_id).eq("pk_id", pk).eq("capitulo", cap).eq(
            "agrupador_id", ag_id
        ).execute()

    return len(patch_rows)


def _apply_cpm_fechas_agrupador(sb, version_id, contrato_id, cache, n: "NodoCPM") -> None:
    """Propaga fecha_inicio_temprana / fecha_fin_temprana al agrupador (no fecha_inicio)."""
    if not n.fecha_inicio_temprana or not n.fecha_fin_temprana:
        return

    ag_id = int(str(n.agrupador_id).strip())
    ag_rows = (
        sb.table("prog_actividades")
        .select("item,codigo_wbs")
        .eq("version_id", version_id)
        .eq("pk_id", n.pk_id)
        .eq("capitulo", n.capitulo)
        .eq("agrupador_id", ag_id)
        .execute()
        .data
        or []
    )
    ag_row = next(
        (
            r for r in ag_rows
            if (r.get("codigo_wbs") or r.get("item") or "").strip()
            and (r.get("item") or "").strip() == (r.get("codigo_wbs") or r.get("item") or "").strip()
        ),
        ag_rows[0] if ag_rows else None,
    )
    fi_iso = n.fecha_inicio_temprana.isoformat()
    ff_iso = n.fecha_fin_temprana.isoformat()
    now = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "fecha_inicio_temprana": fi_iso,
        "fecha_fin_temprana": ff_iso,
        "actualizado_en": now,
    }
    sb.table("prog_actividades").update(update_fields).eq("version_id", version_id).eq(
        "pk_id", n.pk_id
    ).eq("capitulo", n.capitulo).eq("agrupador_id", ag_id).execute()
    codigo_wbs = (ag_row.get("codigo_wbs") if ag_row else None) or (ag_row.get("item") if ag_row else None) or ""
    hijo_items = (
        sb.table("listado_precios")
        .select("item_numero")
        .eq("contrato_id", contrato_id)
        .eq("capitulo", n.capitulo.strip())
        .eq("agrupador_id", ag_id)
        .execute()
        .data
        or []
    )
    hijo_nums = [(r.get("item_numero") or "").strip() for r in hijo_items if (r.get("item_numero") or "").strip()]
    if not hijo_nums:
        return
    hijo_update = {
        **update_fields,
        "heredado_de_capitulo": True,
        "override_manual": False,
        "agrupador_id": ag_id,
        "codigo_wbs": codigo_wbs or None,
    }
    sb.table("prog_actividades").update(hijo_update).eq("version_id", version_id).eq(
        "pk_id", n.pk_id
    ).eq("capitulo", n.capitulo).eq("segmento", 1).in_(
        "item", hijo_nums
    ).execute()


def _recalc_items_heredados_cpm(sb, version_id, pk_id, capitulo, nueva_fi, contrato_id, cache):
    from prog_obra_calendar import add_dias_habiles as _add_dh
    items = (
        sb.table("prog_actividades")
        .select("id,duracion_dias_habiles")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .eq("capitulo", capitulo)
        .eq("heredado_de_capitulo", True)
        .eq("override_manual", False)
        .execute()
        .data
        or []
    )
    if not items:
        return
    updates = []
    for it in items:
        dur = it.get("duracion_dias_habiles")
        if not dur or int(dur) <= 0:
            continue
        ff = _add_dh(contrato_id, nueva_fi, int(dur), cache)
        updates.append({
            "id": it["id"],
            "fecha_inicio": nueva_fi.isoformat(),
            "fecha_fin_calculada": ff.isoformat() if ff else None,
        })
    if updates:
        _bulk_patch_prog_actividades_by_id(sb, updates)


def _cpm_estado_label(row: dict) -> str:
    if row.get("es_ruta_critica"):
        return "Ruta crítica"
    if row.get("es_actividad_final_tramo"):
        return "Actividad final tramo"
    holgura = int(row.get("holgura_total") or 0)
    if holgura <= 0 and not row.get("tiene_sucesores"):
        return "Actividad final tramo"
    if holgura <= 0:
        return "Ruta crítica"
    return "Con holgura"


def _dep_nodo_label(d: dict, side: str, ag_meta: dict) -> str:
    prefix = "origen" if side == "orig" else "destino"
    pk = str(d.get(f"pk_id_{prefix}") or "").strip()
    cap = str(d.get(f"capitulo_{prefix}") or "").strip()
    ag_raw = d.get(f"agrupador_id_{prefix}")
    if ag_raw is not None and str(ag_raw).strip() != "":
        try:
            meta = ag_meta.get(int(ag_raw)) or {}
        except (TypeError, ValueError):
            meta = {}
        wbs = (meta.get("codigo_wbs") or "").strip()
        nombre = (meta.get("nombre") or wbs or str(ag_raw)).strip()
        ag_lbl = f"{wbs} · {nombre}".strip(" ·") if wbs else nombre
        return f"PK {pk} · Cap {cap} · {ag_lbl}"
    return f"PK {pk} · Cap {cap}"


def build_cpm_export_data(
    sb,
    version_id: str,
    contrato_id: int,
    pk_ids: Optional[Set[str]] = None,
) -> dict:
    """Resultados CPM y dependencias para exportación PDF/Excel."""
    from prog_obra_costos_presupuesto import _fetch_agrupadores_meta

    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)
    rows = [
        r for r in obtener_cpm_resultados(sb, version_id)
        if r.get("agrupador_id") is not None
    ]
    if pk_ids:
        rows = [r for r in rows if str(r.get("pk_id") or "").strip() in pk_ids]

    resultados: List[dict] = []
    for r in rows:
        ag_id = r.get("agrupador_id")
        try:
            meta = ag_meta.get(int(ag_id)) or {}
        except (TypeError, ValueError):
            meta = {}
        wbs = (meta.get("codigo_wbs") or "").strip()
        nombre = (meta.get("nombre") or wbs or str(ag_id)).strip()
        row = {
            **r,
            "agrupador_label": f"{wbs} · {nombre}".strip(" ·") if wbs else nombre,
            "holgura_total": int(r.get("holgura_total") or 0),
            "holgura_libre": int(r.get("holgura_libre") or 0),
            "es_ruta_critica": bool(r.get("es_ruta_critica")),
            "es_actividad_final_tramo": bool(r.get("es_actividad_final_tramo")),
            "tiene_sucesores": bool(r.get("tiene_sucesores")),
        }
        row["estado_cpm"] = _cpm_estado_label(row)
        resultados.append(row)
    resultados.sort(
        key=lambda x: (
            str(x.get("pk_id") or ""),
            str(x.get("capitulo") or ""),
            str(x.get("agrupador_label") or ""),
        ),
    )

    deps = listar_dependencias(sb, version_id)
    if pk_ids:
        deps = [
            d for d in deps
            if str(d.get("pk_id_origen") or "").strip() in pk_ids
            or str(d.get("pk_id_destino") or "").strip() in pk_ids
        ]
    dependencias = []
    for d in deps:
        dependencias.append({
            **d,
            "origen_label": _dep_nodo_label(d, "orig", ag_meta),
            "destino_label": _dep_nodo_label(d, "dest", ag_meta),
            "tipo": (d.get("tipo") or "FS").strip().upper(),
            "lag_dias": int(d.get("lag_dias") or 0),
        })
    dependencias.sort(
        key=lambda x: (
            str(x.get("pk_id_origen") or ""),
            str(x.get("capitulo_origen") or ""),
            str(x.get("origen_label") or ""),
        ),
    )
    return {"resultados": resultados, "dependencias": dependencias}


def obtener_cpm_resultados(sb, version_id: str) -> list:
    return (
        sb.table("prog_cpm_resultados")
        .select("*")
        .eq("version_id", version_id)
        .order("pk_id,capitulo")
        .execute()
        .data
        or []
    )


def obtener_ruta_critica(sb, version_id: str) -> list:
    return (
        sb.table("prog_cpm_resultados")
        .select("*")
        .eq("version_id", version_id)
        .eq("es_ruta_critica", True)
        .order("fecha_inicio_temprana")
        .execute()
        .data
        or []
    )
