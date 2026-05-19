"""
Lógica de negocio Programación de obra (Fase 1).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from presupuesto_constants import PRESUPUESTO_TIPO_POLIGONO
from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles, count_dias_habiles_entre

_FUNC_LOG = "Programación obra"


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
    filas de presupuesto (PRESUPUESTO_TIPO_POLIGONO) por capítulo+ítem.
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


def _count_items_con_fecha(sb, version_id: str, pk_id: str) -> int:
    pk = (pk_id or "").strip()
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,item,fecha_inicio")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    seen = set()
    for r in rows:
        fi = r.get("fecha_inicio")
        if fi is None or str(fi).strip() == "":
            continue
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if cap and it:
            seen.add((cap, it))
    return len(seen)


def _compute_estado_pk(items_total: int, items_con_fecha: int) -> str:
    if items_total <= 0:
        return "sin_cantidad"
    if items_con_fecha <= 0:
        return "sin_iniciar"
    if items_con_fecha >= items_total:
        return "completa"
    return "en_progreso"


def upsert_prog_pk_estado(sb, version_id: str, contrato_id: int, pk_id: str) -> None:
    pk = (pk_id or "").strip()
    items_total, _ = _ppto_items_por_pk(sb, contrato_id, pk)   # query 1
    items_cf = _count_items_con_fecha(sb, version_id, pk)       # query 2
    estado = _compute_estado_pk(items_total, items_cf)
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
    pks = sb.table("pk_ids").select("pk_id").eq("contrato_id", contrato_id).execute().data or []
    for row in pks:
        pk = (row.get("pk_id") or "").strip()
        if pk:
            upsert_prog_pk_estado(sb, version_id, contrato_id, pk)


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
            f"Suma de segmentos ({total_seg}) ≠ cantidad presupuesto ({ppto_qty}) para {capitulo}/{item}; delta {delta:+}"
        )


def fetch_mapa_rows_rpc(sb, contrato_id: int) -> List[dict]:
    try:
        res = sb.rpc("prog_mapa_pk_estados", {"p_contrato_id": int(contrato_id)}).execute()
        return res.data or []
    except Exception:
        return []


def _ppto_distinct_item_counts_by_pk(sb, contrato_id: int) -> Dict[str, int]:
    """Una sola consulta a presupuesto: cuenta ítems distintos (capítulo+ítem) por PK."""
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
    """Estados de PK para una versión concreta (p. ej. borrador en edición)."""
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


def create_version(
    sb,
    contrato_id: int,
    usuario_id: int,
    tipo: str,
    motivo: Optional[str],
) -> dict:
    tipo = (tipo or "").strip().lower()
    if tipo not in ("baseline", "reprogramacion", "suspension"):
        raise BusinessRuleError("tipo inválido")
    if tipo != "baseline" and not (motivo and motivo.strip()):
        raise BusinessRuleError("motivo_reprogramacion obligatorio para tipo distinto de baseline")
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
            raise BusinessRuleError("Ya existe una versión baseline activa para el contrato")
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
    row = {
        "contrato_id": contrato_id,
        "numero_version": nnext,
        "tipo": tipo,
        "estado": "borrador",
        "motivo_reprogramacion": motivo.strip() if motivo else None,
        "creado_por": usuario_id,
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }
    ins = sb.table("prog_versiones").insert(row).execute().data
    if not ins:
        raise BusinessRuleError("No se pudo crear la versión")
    vid = ins[0]["id"]
    ensure_prog_pk_estado_all(sb, str(vid), contrato_id)
    return ins[0]


def assert_version_editable(sb, version_id: str) -> dict:
    v = sb.table("prog_versiones").select("*").eq("id", version_id).limit(1).execute().data
    if not v:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    row = v[0]
    if row.get("estado") == "sellada":
        raise HTTPException(status_code=400, detail="La versión está sellada y no admite cambios")
    return row


def assert_version_borrador(sb, version_id: str) -> dict:
    v = assert_version_editable(sb, version_id)
    if (v.get("estado") or "") != "borrador":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede editar el cronograma en estado borrador (retire de validación o espere rechazo).",
        )
    return v


def submit_to_validation(sb, version_id: str, contrato_id: int) -> List[dict]:
    assert_version_editable(sb, version_id)
    niveles = _niveles_prog_desde_contrato(sb, contrato_id)
    if not niveles:
        raise BusinessRuleError("El contrato no tiene niveles de validación >= 2 configurados")
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


def seal_version(sb, version_id: str, contrato_id: int, usuario_id: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.table("prog_versiones").update(
        {
            "estado": "sellada",
            "sellado_por": usuario_id,
            "sellado_en": now,
            "actualizado_en": now,
        }
    ).eq("id", version_id).execute()
    sb.table("contratos").update({"prog_version_vigente_id": version_id}).eq("id", contrato_id).execute()


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
        raise BusinessRuleError("La versión no está en validación")
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
        raise BusinessRuleError("No hay fila de validación para ese nivel")
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
        raise BusinessRuleError("Nivel no pertenece a esta versión")
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
            raise BusinessRuleError("Aún no se aprueba el nivel previo")
    now = datetime.now(timezone.utc).isoformat()
    if not aprobar:
        if not (observacion and observacion.strip()):
            raise BusinessRuleError("Observación obligatoria al rechazar")
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
        raise BusinessRuleError("No hay programación de capítulo; guarde fecha y duración primero")
    cr = cap_row[0]
    fi = cr.get("fecha_inicio_sugerida")
    du = cr.get("duracion_dias_habiles")
    if not fi or not du:
        raise BusinessRuleError("Capítulo sin fecha_inicio_sugerida o duración")
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
    """Deriva fecha_inicio_sugerida y duracion_dias_habiles del capítulo desde ítems programados."""
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
    """Sincroniza prog_actividades_capitulo para N capítulos en 2 queries (antes era 3×N)."""
    if not capitulos:
        return
    pk = pk_id.strip()
    cap_list = list(capitulos)

    # Query 1: leer todos los ítems con fecha de todos los capítulos de una vez
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

    # Calcular min(fecha_inicio) y max(fecha_fin) por capítulo, en memoria
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

    # Query 2: upsert masivo — sin loop, sin select previo
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
# FASE 2 � CPM: Dependencias + C�lculo
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
) -> dict:
    existing = listar_dependencias(sb, version_id)
    import networkx as nx
    G = nx.DiGraph()
    for d in existing:
        G.add_edge((d["pk_id_origen"], d["capitulo_origen"]), (d["pk_id_destino"], d["capitulo_destino"]))
    G.add_edge((pk_id_origen, capitulo_origen), (pk_id_destino, capitulo_destino))
    if not nx.is_directed_acyclic_graph(G):
        cycles = list(nx.simple_cycles(G))
        cycle_str = " -> ".join(f"{pk}/{cap}" for pk, cap in cycles[0])
        raise BusinessRuleError(f"La dependencia crea un ciclo: {cycle_str}")
    row = (
        sb.table("prog_dependencias")
        .insert({
            "version_id": version_id,
            "contrato_id": contrato_id,
            "pk_id_origen": pk_id_origen,
            "capitulo_origen": capitulo_origen,
            "pk_id_destino": pk_id_destino,
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


def eliminar_dependencia(sb, dep_id: str, version_id: str) -> None:
    sb.table("prog_dependencias").delete().eq("id", dep_id).execute()
    sb.table("prog_versiones").update({"cpm_dirty": True}).eq("id", version_id).execute()


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
    for r in raw_caps:
        fi = _parse_date_cpm(r.get("fecha_inicio"))
        ff = _parse_date_cpm(r.get("fecha_fin"))
        dur = int(r.get("duracion_dias_hab") or 1)
        if fi and ff:
            nodos.append(NodoCPM(
                pk_id=str(r["pk_id"]).strip(),
                capitulo=str(r["capitulo"]).strip(),
                duracion=max(1, dur),
                fecha_inicio_base=fi,
                fecha_fin_base=ff,
            ))

    if not nodos:
        return ResultadoCPM(ok=True)

    dependencias = [
        DependenciaCPM(
            pk_id_origen=d["pk_id_origen"],
            capitulo_origen=d["capitulo_origen"],
            pk_id_destino=d["pk_id_destino"],
            capitulo_destino=d["capitulo_destino"],
            tipo=d["tipo"],
            lag_dias=int(d.get("lag_dias") or 0),
        )
        for d in listar_dependencias(sb, version_id)
    ]

    resultado = calcular_cpm(nodos, dependencias, contrato_id, cache)
    if not resultado.ok:
        return resultado

    payload = [
        {
            "pk_id": n.pk_id,
            "capitulo": n.capitulo,
            "fecha_inicio_temprana": n.fecha_inicio_temprana.isoformat() if n.fecha_inicio_temprana else None,
            "fecha_fin_temprana": n.fecha_fin_temprana.isoformat() if n.fecha_fin_temprana else None,
            "fecha_inicio_tardia": n.fecha_inicio_tardia.isoformat() if n.fecha_inicio_tardia else None,
            "fecha_fin_tardia": n.fecha_fin_tardia.isoformat() if n.fecha_fin_tardia else None,
            "holgura_total": n.holgura_total,
            "holgura_libre": n.holgura_libre,
            "es_ruta_critica": n.es_ruta_critica,
        }
        for n in resultado.nodos
    ]
    sb.rpc("prog_upsert_cpm_resultados", {
        "p_version_id": version_id,
        "p_contrato_id": contrato_id,
        "p_resultados": payload,
    }).execute()

    for n in resultado.nodos:
        if not n.fecha_inicio_temprana or n.fecha_inicio_temprana == n.fecha_inicio_base:
            continue
        sb.table("prog_actividades_capitulo").update({
            "fecha_inicio_sugerida": n.fecha_inicio_temprana.isoformat(),
            "duracion_dias_habiles": n.duracion,
        }).eq("version_id", version_id).eq("pk_id", n.pk_id).eq("capitulo", n.capitulo).execute()
        _recalc_items_heredados_cpm(sb, version_id, n.pk_id, n.capitulo, n.fecha_inicio_temprana, contrato_id, cache)

    changed = [n.key for n in resultado.nodos if n.fecha_inicio_temprana != n.fecha_inicio_base]
    resultado.nodos_afectados_cascada = nodos_afectados_por(changed, dependencias)
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
