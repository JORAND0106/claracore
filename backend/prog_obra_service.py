"""
Logica de negocio Programacion de obra (Fase 1).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

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
    filas de presupuesto (PRESUPUESTO_TIPO_POLIGONO) por capitulo+item.
    """
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
        key = (cap, it)
        ag_map[key] = r.get("agrupador_id")
        if r.get("descripcion"):
            desc_map[key] = str(r["descripcion"]).strip()
    return ag_map, desc_map


def fetch_estructura_programacion_pk(sb, contrato_id: int, pk_id: str) -> dict:
    """
    items de presupuesto del PK agrupados por capitulo y agrupador WBS.
    JOIN logico con listado_precios -> listado_precios_agrupadores.
    """
    pk = (pk_id or "").strip()
    ppto_rows = (
        sb.table("presupuesto")
        .select("capitulo, item, cant_total, und, vlr_unitario, costo_directo, descripcion")
        .eq("contrato_id", contrato_id)
        .eq("pk_id", pk)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
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
        ag_id = ag_by_item.get((cap, it))
        item_obj = {
            "item": it,
            "descripcion": v["descripcion"] or desc_lp.get((cap, it), ""),
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
        ag_id = ag_by_item.get((cap, it))
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
) -> int:
    """Replica fechas del agrupador a ítems hijo: 1 UPDATE masivo + 1 INSERT masivo (si faltan filas)."""
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

    sb.table("prog_actividades").update(update_fields).eq("version_id", version_id).eq(
        "pk_id", pk
    ).eq("capitulo", cap).eq("segmento", 1).eq("override_manual", False).in_(
        "item", ag_items_list
    ).execute()

    missing = [(p_cap, it, cant, und, vlr) for p_cap, it, cant, und, vlr in hijo_ppto if it not in existing_items]
    if missing:
        sb.table("prog_actividades").insert(
            [
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
        .select("capitulo,item,fecha_inicio,agrupador_id")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    direct_with_fecha: set = set()
    agrupadores_con_fecha: set = set()
    for r in rows:
        fi = r.get("fecha_inicio")
        if fi is None or str(fi).strip() == "":
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
        ag_id = ag_by_item.get((cap, it))
        if ag_id is not None:
            try:
                if (cap, int(ag_id)) in agrupadores_con_fecha:
                    seen.add((cap, it))
            except (TypeError, ValueError):
                pass
    return len(seen)


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
        ag_id = ag_by_item.get((cap, it))
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


def _sync_actividades_pk_desde_presupuesto(
    sb, version_id: str, contrato_id: int, pk_id: str
) -> int:
    """Actualiza cantidad/unidad/costo en actividades existentes según presupuesto vivo del PK."""
    _, items = _ppto_items_por_pk(sb, contrato_id, pk_id)
    ppto_map: Dict[Tuple[str, str], Tuple[Decimal, str, Decimal]] = {
        (cap, it): (cant, und, vlr) for cap, it, cant, und, vlr in items
    }
    acts = (
        sb.table("prog_actividades")
        .select("id,capitulo,item,segmento,cantidad_programada,agrupador_id")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .execute()
        .data
        or []
    )
    by_item: Dict[Tuple[str, str], List[dict]] = {}
    for a in acts:
        if a.get("agrupador_id") is not None:
            continue
        cap = (a.get("capitulo") or "").strip()
        it = (a.get("item") or "").strip()
        if not cap or not it:
            continue
        key = (cap, it)
        by_item.setdefault(key, []).append(a)

    now = datetime.now(timezone.utc).isoformat()
    n_updated = 0
    for key, segs in by_item.items():
        if key not in ppto_map:
            continue
        cant_ppto, und, vlr = ppto_map[key]
        cant_ppto_f = float(cant_ppto)
        vlr_f = float(vlr)
        und_s = (und or "?")[:20]
        segs_sorted = sorted(segs, key=lambda x: int(x.get("segmento") or 1))
        if len(segs_sorted) == 1:
            sb.table("prog_actividades").update(
                {
                    "cantidad_programada": cant_ppto_f,
                    "unidad": und_s,
                    "costo_unitario": vlr_f,
                    "actualizado_en": now,
                }
            ).eq("id", segs_sorted[0]["id"]).execute()
            n_updated += 1
            continue
        old_total = sum(float(s.get("cantidad_programada") or 0) for s in segs_sorted)
        for s in segs_sorted:
            old_c = float(s.get("cantidad_programada") or 0)
            if old_total > 0:
                new_c = cant_ppto_f * (old_c / old_total)
            else:
                new_c = cant_ppto_f / len(segs_sorted)
            sb.table("prog_actividades").update(
                {
                    "cantidad_programada": new_c,
                    "unidad": und_s,
                    "costo_unitario": vlr_f,
                    "actualizado_en": now,
                }
            ).eq("id", s["id"]).execute()
            n_updated += 1
    return n_updated


def sync_presupuesto_version(sb, version_id: str, contrato_id: int) -> dict:
    """
    Sincroniza actividades y prog_pk_estado de todos los PK del contrato
    contra el presupuesto poligonal vigente.
    """
    pks = _all_pks_contrato(sb, contrato_id)
    act_updates = 0
    for pk in pks:
        act_updates += _sync_actividades_pk_desde_presupuesto(sb, version_id, contrato_id, pk)
        upsert_prog_pk_estado(sb, version_id, contrato_id, pk)
    return {
        "ok": True,
        "pks_actualizados": len(pks),
        "actividades_actualizadas": act_updates,
    }


def validate_segment_quantities(
    sb, version_id: str, contrato_id: int, pk_id: str, capitulo: str, item: str
) -> None:
    ppto_qty = Decimal(0)
    rows = (
        sb.table("presupuesto")
        .select("cant_total")
        .eq("contrato_id", contrato_id)
        .eq("pk_id", pk_id)
        .eq("capitulo", capitulo)
        .eq("item", item)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    for r in rows:
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
    """Una sola consulta a presupuesto: cuenta items distintos (capitulo+item) por PK."""
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
            "version_origen_id,superseded_by_id,metadata,creado_por,sellado_por"
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
    return str(rows[0]["id"]) if rows else None


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


def _construir_dependencias_cpm(sb, version_id: str, nodos: list) -> list:
    """Combina dependencias especificas con globales expandidas por PK."""
    specific = listar_dependencias(sb, version_id)
    global_deps = listar_dependencias_globales(sb, version_id)

    nodos_set = {n.key for n in nodos}
    pks = {n.pk_id for n in nodos}

    specific_intra_pairs = {
        (d["pk_id_origen"], d["capitulo_origen"], d.get("agrupador_id_origen") or "", d["capitulo_destino"], d.get("agrupador_id_destino") or "")
        for d in specific
        if d["pk_id_origen"] == d["pk_id_destino"]
    }

    deps = [
        DependenciaCPM(
            pk_id_origen=d["pk_id_origen"],
            capitulo_origen=d["capitulo_origen"],
            pk_id_destino=d["pk_id_destino"],
            capitulo_destino=d["capitulo_destino"],
            tipo=d["tipo"],
            lag_dias=int(d.get("lag_dias") or 0),
            agrupador_id_origen=str(d.get("agrupador_id_origen") or ""),
            agrupador_id_destino=str(d.get("agrupador_id_destino") or ""),
        )
        for d in specific
    ]

    for g in global_deps:
        cap_o = str(g["capitulo_origen"]).strip()
        cap_d = str(g["capitulo_destino"]).strip()
        tipo = g["tipo"]
        lag = int(g.get("lag_dias") or 0)
        for pk in pks:
            if (pk, cap_o, "") not in nodos_set or (pk, cap_d, "") not in nodos_set:
                continue
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


def ejecutar_cpm_version(sb, version_id, contrato_id, cache) -> "ResultadoCPM":
    raw_caps = (
        sb.rpc("prog_get_capitulos_con_fechas", {"p_version_id": version_id})
        .execute()
        .data
        or []
    )
    nodos = []
    seen_ag = set()
    raw_ags = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,agrupador_id,fecha_inicio,fecha_fin_calculada,duracion_dias_habiles")
        .eq("version_id", version_id)
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )
    caps_con_agrupador: set[tuple[str, str]] = set()
    for r in raw_ags:
        ag_id = str(r.get("agrupador_id") or "").strip()
        if not ag_id:
            continue
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        key = (pk, cap, ag_id)
        if key in seen_ag:
            continue
        fi = _parse_date_cpm(r.get("fecha_inicio"))
        ff = _parse_date_cpm(r.get("fecha_fin_calculada"))
        dur = int(r.get("duracion_dias_habiles") or 1)
        if fi and ff:
            nodos.append(NodoCPM(
                pk_id=pk,
                capitulo=cap,
                duracion=max(1, dur),
                fecha_inicio_base=fi,
                fecha_fin_base=ff,
                agrupador_id=ag_id,
            ))
            seen_ag.add(key)
            caps_con_agrupador.add((pk, cap))

    for r in raw_caps:
        pk = str(r["pk_id"]).strip()
        cap = str(r["capitulo"]).strip()
        if (pk, cap) in caps_con_agrupador:
            continue
        fi = _parse_date_cpm(r.get("fecha_inicio"))
        ff = _parse_date_cpm(r.get("fecha_fin"))
        dur = int(r.get("duracion_dias_hab") or 1)
        if fi and ff:
            nodos.append(NodoCPM(
                pk_id=pk,
                capitulo=cap,
                duracion=max(1, dur),
                fecha_inicio_base=fi,
                fecha_fin_base=ff,
            ))

    if not nodos:
        return ResultadoCPM(ok=True)

    # Pre-cargar calendario del contrato para todo el horizonte del CPM (evita recargas en cascada).
    d0 = min(n.fecha_inicio_base for n in nodos)
    d1 = max(n.fecha_fin_base for n in nodos)
    cache.fechas_extra(contrato_id, d0 - timedelta(days=120), d1 + timedelta(days=120))

    dependencias = _construir_dependencias_cpm(sb, version_id, nodos)

    resultado = calcular_cpm(nodos, dependencias, contrato_id, cache)
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

    for n in resultado.nodos:
        if n.agrupador_id:
            continue
        if not n.fecha_inicio_temprana or n.fecha_inicio_temprana == n.fecha_inicio_base:
            continue
        sb.table("prog_actividades_capitulo").update({
            "fecha_inicio_sugerida": n.fecha_inicio_temprana.isoformat(),
            "duracion_dias_habiles": n.duracion,
        }).eq("version_id", version_id).eq("pk_id", n.pk_id).eq("capitulo", n.capitulo).execute()
        _recalc_items_heredados_cpm(sb, version_id, n.pk_id, n.capitulo, n.fecha_inicio_temprana, contrato_id, cache)

    changed = [n.key for n in resultado.nodos if n.fecha_inicio_temprana != n.fecha_inicio_base]
    resultado.nodos_afectados_cascada = nodos_afectados_por(changed, dependencias)

    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {"cpm_dirty": False, "cpm_calculado_en": now, "actualizado_en": now}
    ).eq("id", version_id).execute()

    return resultado


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
        sb.table("prog_actividades").upsert(updates, on_conflict="id").execute()


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
