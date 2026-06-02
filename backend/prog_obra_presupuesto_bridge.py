"""
Puente Programación de Obra ↔ Presupuesto poligonal.

- Delta presupuesto vivo vs prog_presupuesto_snapshot (reprogramación).
- Gate de aprobación interventoría al enviar a validación.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from presupuesto_constants import PRESUPUESTO_TIPO_POLIGONO
from presupuesto_helpers import presupuesto_oficial_version_id

ItemKey = Tuple[str, str, str]  # pk_id, capitulo, item


def _norm_revisado(v: Any) -> str:
    if v is None:
        return "No Revisado"
    s = str(v).strip()
    if not s:
        return "No Revisado"
    if s.lower() == "aprobado":
        return "Aprobado"
    return s


def _item_key(pk: Any, cap: Any, it: Any) -> Optional[ItemKey]:
    pk_s = str(pk or "").strip()
    cap_s = str(cap or "").strip()
    it_s = str(it or "").strip()
    if not pk_s or not cap_s or not it_s:
        return None
    return (pk_s, cap_s, it_s)


def _round_money(n: float) -> float:
    return round(float(n), 2)


def _round_pct(n: float) -> float:
    return round(float(n), 2)


@dataclass
class PresupuestoItemAgg:
    cantidad: float
    costo_unitario: float
    unidad: str
    descripcion: str

    @property
    def costo_total(self) -> float:
        return self.cantidad * self.costo_unitario


def _fetch_presupuesto_polygon_rows(sb, contrato_id: int) -> List[dict]:
    rows: List[dict] = []
    offset = 0
    page = 1000
    # Fuente OFICIAL: si hay versión sellada vigente, la programación se basa en su
    # snapshot inmutable; si no hay (None), fallback al presupuesto vivo (actual).
    oficial_vid = presupuesto_oficial_version_id(sb, contrato_id)
    while True:
        if oficial_vid:
            q = (
                sb.table("presupuesto_version_items")
                .select(
                    "pk_id,capitulo,item,cant_total,vlr_unitario,und,descripcion,revisado,dado_de_baja,tipo_ejecucion"
                )
                .eq("contrato_id", contrato_id)
                .eq("version_id", oficial_vid)
                .eq("dado_de_baja", False)
            )
        else:
            q = (
                sb.table("presupuesto")
                .select(
                    "pk_id,capitulo,item,cant_total,vlr_unitario,und,descripcion,revisado,dado_de_baja,tipo_ejecucion"
                )
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
                .eq("dado_de_baja", False)
            )
        chunk = (
            q
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += page
    return rows


def _fetch_descripciones_listado(sb, contrato_id: int) -> Dict[Tuple[str, str], str]:
    rows = (
        sb.table("listado_precios")
        .select("capitulo,item_numero,descripcion")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    out: Dict[Tuple[str, str], str] = {}
    for r in rows:
        cap = str(r.get("capitulo") or "").strip()
        it = str(r.get("item_numero") or "").strip()
        desc = str(r.get("descripcion") or "").strip()
        if cap and it and desc:
            out[(cap, it)] = desc
    return out


def aggregate_presupuesto_vivo(sb, contrato_id: int) -> Tuple[Dict[ItemKey, PresupuestoItemAgg], Dict[ItemKey, bool]]:
    """
    Agrega presupuesto poligonal vivo por (pk, cap, item).
    Retorna (agg, aprobado_por_item) donde aprobado=True si todas las filas del ítem están Aprobado.
    """
    desc_lp = _fetch_descripciones_listado(sb, contrato_id)
    raw: Dict[ItemKey, Dict[str, Any]] = {}
    for r in _fetch_presupuesto_polygon_rows(sb, contrato_id):
        key = _item_key(r.get("pk_id"), r.get("capitulo"), r.get("item"))
        if key is None:
            continue
        try:
            cant = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        try:
            cu = float(r.get("vlr_unitario") or 0)
        except (TypeError, ValueError):
            cu = 0.0
        und = str(r.get("und") or "").strip()[:20] or "?"
        desc = str(r.get("descripcion") or "").strip() or desc_lp.get((key[1], key[2]), "")
        rev = _norm_revisado(r.get("revisado"))
        if key not in raw:
            raw[key] = {
                "cant": 0.0,
                "cu": cu,
                "und": und,
                "desc": desc,
                "rows": 0,
                "pending": 0,
            }
        slot = raw[key]
        slot["cant"] += cant
        slot["cu"] = cu
        if not slot["desc"] and desc:
            slot["desc"] = desc
        slot["rows"] += 1
        if rev != "Aprobado":
            slot["pending"] += 1

    agg: Dict[ItemKey, PresupuestoItemAgg] = {}
    aprobado: Dict[ItemKey, bool] = {}
    for key, v in raw.items():
        if v["cant"] <= 0:
            continue
        agg[key] = PresupuestoItemAgg(
            cantidad=v["cant"],
            costo_unitario=v["cu"],
            unidad=v["und"],
            descripcion=v["desc"],
        )
        aprobado[key] = v["pending"] == 0
    return agg, aprobado


def aggregate_presupuesto_snapshot_with_meta(
    sb, version_id: str, contrato_id: int
) -> Dict[ItemKey, PresupuestoItemAgg]:
    rows = (
        sb.table("prog_presupuesto_snapshot")
        .select("pk_id,capitulo,item,cantidad,costo_unitario")
        .eq("version_id", version_id)
        .execute()
        .data
        or []
    )
    desc_lp = _fetch_descripciones_listado(sb, contrato_id)
    und_map = _fetch_unidades_presupuesto(sb, contrato_id)
    agg: Dict[ItemKey, PresupuestoItemAgg] = {}
    for r in rows:
        key = _item_key(r.get("pk_id"), r.get("capitulo"), r.get("item"))
        if key is None:
            continue
        try:
            cant = float(r.get("cantidad") or 0)
            cu = float(r.get("costo_unitario") or 0)
        except (TypeError, ValueError):
            continue
        if cant <= 0:
            continue
        agg[key] = PresupuestoItemAgg(
            cantidad=cant,
            costo_unitario=cu,
            unidad=und_map.get(key, "?"),
            descripcion=desc_lp.get((key[1], key[2]), ""),
        )
    return agg


def _fetch_unidades_presupuesto(sb, contrato_id: int) -> Dict[ItemKey, str]:
    out: Dict[ItemKey, str] = {}
    for r in _fetch_presupuesto_polygon_rows(sb, contrato_id):
        key = _item_key(r.get("pk_id"), r.get("capitulo"), r.get("item"))
        if key is None:
            continue
        und = str(r.get("und") or "").strip()[:20]
        if und and key not in out:
            out[key] = und
    return out


def _fetch_programmed_item_keys(sb, version_id: str) -> Set[ItemKey]:
    rows = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,item,fecha_inicio,agrupador_id")
        .eq("version_id", version_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    keys: Set[ItemKey] = set()
    for r in rows:
        if r.get("agrupador_id") is not None:
            continue
        key = _item_key(r.get("pk_id"), r.get("capitulo"), r.get("item"))
        if key:
            keys.add(key)
    return keys


def _impacto_costo_cambio(
    tipo: str,
    snap: Optional[PresupuestoItemAgg],
    live: Optional[PresupuestoItemAgg],
    programado: bool,
) -> float:
    if tipo == "nuevo":
        return 0.0
    if tipo == "baja":
        if snap and programado:
            return -_round_money(snap.costo_total)
        return 0.0
    if snap and live:
        if tipo == "cantidad":
            return _round_money((live.cantidad - snap.cantidad) * live.costo_unitario)
        if tipo == "costo_unitario":
            return _round_money(live.cantidad * (live.costo_unitario - snap.costo_unitario))
        if tipo == "cantidad_y_costo":
            return _round_money(live.costo_total - snap.costo_total)
    return 0.0


def _classify_change(
    snap: Optional[PresupuestoItemAgg],
    live: Optional[PresupuestoItemAgg],
) -> Optional[str]:
    if snap is None and live is not None:
        return "nuevo"
    if snap is not None and live is None:
        return "baja"
    if snap is None or live is None:
        return None
    cant_diff = abs(live.cantidad - snap.cantidad) > 0.0001
    cu_diff = abs(live.costo_unitario - snap.costo_unitario) > 0.005
    if cant_diff and cu_diff:
        return "cantidad_y_costo"
    if cant_diff:
        return "cantidad"
    if cu_diff:
        return "costo_unitario"
    return None


def compare_presupuesto_delta(
    snap_agg: Dict[ItemKey, PresupuestoItemAgg],
    live_agg: Dict[ItemKey, PresupuestoItemAgg],
    programados: Optional[Set[ItemKey]] = None,
) -> List[dict]:
    programados = programados or set()
    keys = sorted(set(snap_agg.keys()) | set(live_agg.keys()))
    cambios: List[dict] = []
    for key in keys:
        snap = snap_agg.get(key)
        live = live_agg.get(key)
        tipo = _classify_change(snap, live)
        if not tipo:
            continue
        pk, cap, it = key
        prog = key in programados
        impacto = _impacto_costo_cambio(tipo, snap, live, prog)
        row: Dict[str, Any] = {
            "tipo": tipo,
            "pk_id": pk,
            "capitulo": cap,
            "item": it,
            "descripcion": (live or snap).descripcion if (live or snap) else "",
            "unidad": (live or snap).unidad if (live or snap) else "?",
            "tiene_programacion": prog,
            "impacto_costo": impacto,
        }
        if snap:
            row["anterior"] = {
                "cantidad": snap.cantidad,
                "costo_unitario": snap.costo_unitario,
            }
        if live:
            row["actual"] = {
                "cantidad": live.cantidad,
                "costo_unitario": live.costo_unitario,
            }
        if tipo in ("cantidad", "cantidad_y_costo") and snap and live:
            row["delta_cantidad"] = _round_money(live.cantidad - snap.cantidad)
        cambios.append(row)
    cambios.sort(key=lambda c: (c["pk_id"], c["capitulo"], c["item"]))
    return cambios


def compute_programacion_costos(
    sb,
    version_id: str,
    snap_agg: Dict[ItemKey, PresupuestoItemAgg],
    live_agg: Dict[ItemKey, PresupuestoItemAgg],
) -> Tuple[float, float]:
    """Costo total programado usando CU del snapshot vs CU del presupuesto vivo."""
    rows = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,item,cantidad_programada,costo_unitario,fecha_inicio")
        .eq("version_id", version_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    anterior = 0.0
    actual = 0.0
    for r in rows:
        try:
            cant = float(r.get("cantidad_programada") or 0)
            cu_act = float(r.get("costo_unitario") or 0)
        except (TypeError, ValueError):
            continue
        if cant <= 0:
            continue
        key = _item_key(r.get("pk_id"), r.get("capitulo"), r.get("item"))
        cu_snap = snap_agg[key].costo_unitario if key and key in snap_agg else cu_act
        cu_live = live_agg[key].costo_unitario if key and key in live_agg else cu_act
        anterior += cant * cu_snap
        actual += cant * cu_live
    return _round_money(anterior), _round_money(actual)


def presupuesto_aprobacion_estado(sb, contrato_id: int) -> dict:
    _, aprobado_map = aggregate_presupuesto_vivo(sb, contrato_id)
    items_total = len(aprobado_map)
    items_pendientes = sum(1 for ok in aprobado_map.values() if not ok)
    items_aprobados = items_total - items_pendientes
    return {
        "aprobado_completo": items_pendientes == 0 and items_total > 0,
        "items_total": items_total,
        "items_aprobados": items_aprobados,
        "items_pendientes": items_pendientes,
        "puede_enviar_validacion": items_pendientes == 0 and items_total > 0,
    }


def _fetch_version_origen_meta(sb, version_origen_id: str, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("prog_versiones")
        .select("id,numero_version,tipo,estado,sellado_en")
        .eq("id", version_origen_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def build_delta_presupuesto(
    sb,
    contrato_id: int,
    version_id: str,
    version_origen_id: Optional[str],
    tipo: str,
) -> dict:
    tipo_l = (tipo or "").strip().lower()
    if tipo_l == "baseline" or not version_origen_id:
        return {
            "sin_cambios": True,
            "snapshot_ausente": False,
            "alerta": None,
            "total_cambios": 0,
            "cambios": [],
            "costo_programacion_anterior": 0.0,
            "costo_programacion_actualizado": 0.0,
            "variacion": 0.0,
            "pct_variacion": 0.0,
            "version_origen": None,
        }

    origen_meta = _fetch_version_origen_meta(sb, version_origen_id, contrato_id)
    snap_count = (
        sb.table("prog_presupuesto_snapshot")
        .select("id", count="exact")
        .eq("version_id", version_origen_id)
        .limit(1)
        .execute()
    )
    n_snap = int(getattr(snap_count, "count", None) or 0)

    live_agg, _ = aggregate_presupuesto_vivo(sb, contrato_id)

    if n_snap <= 0:
        costo_ant, costo_act = compute_programacion_costos(sb, version_id, {}, live_agg)
        variacion = _round_money(costo_act - costo_ant)
        pct = _round_pct((variacion / costo_ant * 100) if costo_ant > 0 else 0.0)
        return {
            "sin_cambios": True,
            "snapshot_ausente": True,
            "alerta": (
                "No hay snapshot de presupuesto para la versión origen "
                "(sellada antes de esta funcionalidad). Puede continuar; "
                "compare manualmente si lo requiere."
            ),
            "total_cambios": 0,
            "cambios": [],
            "costo_programacion_anterior": costo_ant,
            "costo_programacion_actualizado": costo_act,
            "variacion": variacion,
            "pct_variacion": pct,
            "version_origen": origen_meta,
        }

    snap_agg = aggregate_presupuesto_snapshot_with_meta(sb, version_origen_id, contrato_id)
    programados = _fetch_programmed_item_keys(sb, version_id)
    cambios = compare_presupuesto_delta(snap_agg, live_agg, programados)
    costo_ant, costo_act = compute_programacion_costos(sb, version_id, snap_agg, live_agg)
    variacion = _round_money(costo_act - costo_ant)
    pct = _round_pct((variacion / costo_ant * 100) if costo_ant > 0 else 0.0)

    return {
        "sin_cambios": len(cambios) == 0,
        "snapshot_ausente": False,
        "alerta": None,
        "total_cambios": len(cambios),
        "cambios": cambios,
        "costo_programacion_anterior": costo_ant,
        "costo_programacion_actualizado": costo_act,
        "variacion": variacion,
        "pct_variacion": pct,
        "version_origen": origen_meta,
    }


def metadata_resumen_delta(delta: dict) -> dict:
    return {
        "costo_anterior": delta.get("costo_programacion_anterior", 0),
        "costo_actual": delta.get("costo_programacion_actualizado", 0),
        "variacion": delta.get("variacion", 0),
        "pct_variacion": delta.get("pct_variacion", 0),
        "total_cambios": delta.get("total_cambios", 0),
        "sin_cambios": delta.get("sin_cambios", True),
        "snapshot_ausente": delta.get("snapshot_ausente", False),
    }


def persist_delta_metadata(sb, version_id: str, existing_metadata: Any, delta: dict) -> None:
    meta = dict(existing_metadata) if isinstance(existing_metadata, dict) else {}
    meta["delta_presupuesto_al_crear"] = metadata_resumen_delta(delta)
    meta["delta_presupuesto_en"] = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {"metadata": meta, "actualizado_en": datetime.now(timezone.utc).isoformat()}
    ).eq("id", version_id).execute()
