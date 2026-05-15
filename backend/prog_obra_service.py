"""
Lógica de negocio Programación de obra (Fase 1).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from presupuesto_constants import PRESUPUESTO_TIPO_POLIGONO
from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles

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
    rows = (
        sb.table("prog_actividades")
        .select("capitulo,item")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .execute()
        .data
        or []
    )
    seen = set()
    for r in rows:
        if r.get("fecha_inicio") is None:
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
    items_total, _ = _ppto_items_por_pk(sb, contrato_id, pk_id)
    items_cf = _count_items_con_fecha(sb, version_id, pk_id)
    estado = _compute_estado_pk(items_total, items_cf)
    existing = (
        sb.table("prog_pk_estado")
        .select("id")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .limit(1)
        .execute()
        .data
    )
    payload = {
        "version_id": version_id,
        "contrato_id": contrato_id,
        "pk_id": pk_id,
        "estado_programacion": estado,
        "items_total": items_total,
        "items_con_fecha": min(items_cf, items_total) if items_total > 0 else 0,
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        sb.table("prog_pk_estado").update(payload).eq("id", existing[0]["id"]).execute()
    else:
        uid_row = sb.table("prog_pk_estado").insert(payload).execute().data
        if not uid_row:
            sb.table("prog_pk_estado").upsert(payload, on_conflict="version_id,pk_id").execute()


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
    return n


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
