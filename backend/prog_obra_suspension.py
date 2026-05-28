"""
Fase 3C-2 — Suspensión contractual: preview e impacto en calendario y fechas.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles, count_dias_habiles_entre, es_dia_habil
from prog_obra_service import (
    BusinessRuleError,
    assert_version_borrador,
    create_version,
    ejecutar_cpm_version,
    ensure_prog_pk_estado_all,
    fetch_vigente_meta,
    make_prog_calendar_loader,
    recalc_fin_actividad,
    upsert_prog_pk_estado,
)

CAUSAS_LEGALES = frozenset({"fuerza_mayor", "caso_fortuito", "mutuo_acuerdo", "orden_administrativa", "otra"})
RESPONSABLES = frozenset({"contratista", "entidad", "causa_externa"})


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


def validate_suspension_metadata(meta: dict, motivo: str) -> dict:
    m = dict(meta or {})
    acta = str(m.get("acta_numero") or "").strip()
    if not acta:
        raise BusinessRuleError("Acta de suspensión Nº es obligatoria")
    f_acta = _parse_d(m.get("acta_fecha"))
    f_ini = _parse_d(m.get("fecha_inicio_suspension"))
    f_fin = _parse_d(m.get("fecha_fin_suspension"))
    if not f_acta or not f_ini or not f_fin:
        raise BusinessRuleError("Fechas del acta y de la suspensión son obligatorias")
    if f_fin < f_ini:
        raise BusinessRuleError("La fecha fin de suspensión debe ser posterior al inicio")
    mot = (motivo or m.get("motivo") or "").strip()
    if len(mot) < 50:
        raise BusinessRuleError("El motivo debe tener al menos 50 caracteres")
    causa = str(m.get("causa_legal") or "").strip().lower()
    if causa not in CAUSAS_LEGALES:
        raise BusinessRuleError("Seleccione una causa legal válida")
    if causa == "otra" and not str(m.get("causa_otra") or "").strip():
        raise BusinessRuleError("Indique la causa legal en «Otra»")
    resp = str(m.get("responsable") or "").strip().lower()
    if resp not in RESPONSABLES:
        raise BusinessRuleError("Seleccione el responsable de la suspensión")
    out = {
        **m,
        "acta_numero": acta,
        "acta_fecha": f_acta.isoformat(),
        "fecha_inicio_suspension": f_ini.isoformat(),
        "fecha_fin_suspension": f_fin.isoformat(),
        "causa_legal": causa,
        "responsable": resp,
        "motivo": mot,
        "tipo_evento": "suspension_contractual",
    }
    return out


def _iter_dates(d0: date, d1: date) -> List[date]:
    out: List[date] = []
    cur = d0
    while cur <= d1:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def _insert_suspension_calendar(
    sb, contrato_id: int, f_ini: date, f_fin: date, descripcion: str
) -> int:
    n = 0
    for d in _iter_dates(f_ini, f_fin):
        iso = d.isoformat()
        exists = (
            sb.table("prog_calendario_no_habiles")
            .select("id")
            .eq("contrato_id", contrato_id)
            .eq("fecha", iso)
            .limit(1)
            .execute()
            .data
        )
        if exists:
            continue
        sb.table("prog_calendario_no_habiles").insert(
            {
                "contrato_id": contrato_id,
                "fecha": iso,
                "tipo": "suspension_contractual",
                "descripcion": (descripcion or "Suspensión contractual")[:200],
            }
        ).execute()
        n += 1
    return n


def _project_end(nodes: List[dict]) -> Optional[date]:
    max_ff: Optional[date] = None
    for r in nodes:
        ff = _parse_d(r.get("fecha_fin_calculada"))
        if ff and (max_ff is None or ff > max_ff):
            max_ff = ff
    return max_ff


def preview_suspension_impact(
    sb,
    contrato_id: int,
    version_id: str,
    f_ini: date,
    f_fin: date,
) -> dict:
    """Preview sin persistir calendario."""
    cache = CalendarioNoHabilesCache(make_prog_calendar_loader(sb))
    dias_cal = (f_fin - f_ini).days + 1
    dias_hab = count_dias_habiles_entre(contrato_id, f_ini, f_fin, cache)

    acts = (
        sb.table("prog_actividades")
        .select(
            "id,pk_id,capitulo,item,agrupador_id,codigo_wbs,fecha_inicio,fecha_fin_calculada,duracion_dias_habiles"
        )
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    afectadas = [a for a in acts if _parse_d(a.get("fecha_inicio")) and _parse_d(a["fecha_inicio"]) >= f_ini]
    pks_afectados = sorted({str(a.get("pk_id") or "").strip() for a in afectadas if a.get("pk_id")})

    fin_antes = _project_end(acts)
    # Simular: actividades con inicio >= f_ini se desplazan al primer hábil después de f_fin
    sim = []
    for a in acts:
        fi = _parse_d(a.get("fecha_inicio"))
        if not fi or fi < f_ini:
            sim.append(dict(a))
            continue
        du = int(a.get("duracion_dias_habiles") or 1)
        nuevo_ini = f_fin + timedelta(days=1)
        while not es_dia_habil(contrato_id, nuevo_ini, cache):
            nuevo_ini += timedelta(days=1)
        nuevo_fin = add_dias_habiles(contrato_id, nuevo_ini, du, cache)
        row = dict(a)
        row["fecha_inicio"] = nuevo_ini.isoformat()
        row["fecha_fin_calculada"] = nuevo_fin.isoformat() if nuevo_fin else None
        sim.append(row)
    fin_despues = _project_end(sim)

    preview_rows: List[dict] = []
    for a in afectadas[:40]:
        fi = _parse_d(a.get("fecha_inicio"))
        ff = _parse_d(a.get("fecha_fin_calculada"))
        sim_a = next((x for x in sim if x.get("id") == a.get("id")), a)
        nfi = _parse_d(sim_a.get("fecha_inicio"))
        nff = _parse_d(sim_a.get("fecha_fin_calculada"))
        delta = (nff - ff).days if ff and nff else None
        lbl = a.get("codigo_wbs") or a.get("item") or "—"
        preview_rows.append(
            {
                "pk_id": a.get("pk_id"),
                "label": lbl,
                "fecha_inicio_antes": fi.isoformat() if fi else None,
                "fecha_fin_antes": ff.isoformat() if ff else None,
                "fecha_inicio_despues": nfi.isoformat() if nfi else None,
                "fecha_fin_despues": nff.isoformat() if nff else None,
                "delta_dias_calendario": delta,
            }
        )

    return {
        "dias_calendario_suspendidos": dias_cal,
        "dias_habiles_suspendidos": dias_hab,
        "actividades_total": len(acts),
        "actividades_afectadas": len(afectadas),
        "pks_total": len({str(a.get("pk_id") or "").strip() for a in acts if a.get("pk_id")}),
        "pks_afectados": len(pks_afectados),
        "fecha_fin_antes": fin_antes.isoformat() if fin_antes else None,
        "fecha_fin_despues": fin_despues.isoformat() if fin_despues else None,
        "delta_fin_calendario": (fin_despues - fin_antes).days if fin_antes and fin_despues else None,
        "preview": preview_rows,
    }


def _shift_activities_after_suspension(
    sb, contrato_id: int, version_id: str, f_ini: date, f_fin: date, cache: CalendarioNoHabilesCache
) -> int:
    acts = (
        sb.table("prog_actividades")
        .select("id,fecha_inicio,duracion_dias_habiles")
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    n = 0
    for a in acts:
        fi = _parse_d(a.get("fecha_inicio"))
        if not fi or fi < f_ini:
            continue
        du = int(a.get("duracion_dias_habiles") or 1)
        nuevo_ini = f_fin + timedelta(days=1)
        while not es_dia_habil(contrato_id, nuevo_ini, cache):
            nuevo_ini += timedelta(days=1)
        sb.table("prog_actividades").update(
            {
                "fecha_inicio": nuevo_ini.isoformat(),
                "override_manual": True,
                "actualizado_en": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", a["id"]).execute()
        recalc_fin_actividad(sb, contrato_id, str(a["id"]), cache)
        n += 1
    return n


def apply_suspension_to_version(
    sb,
    contrato_id: int,
    version_id: str,
    usuario_id: int,
    metadata: dict,
    motivo: str,
) -> dict:
    """Aplica suspensión a versión borrador tipo suspension."""
    assert_version_borrador(sb, version_id)
    meta = validate_suspension_metadata(metadata, motivo)
    f_ini = _parse_d(meta["fecha_inicio_suspension"])
    f_fin = _parse_d(meta["fecha_fin_suspension"])
    assert f_ini and f_fin

    desc = f"Suspensión acta {meta.get('acta_numero')}"
    dias_insertados = _insert_suspension_calendar(sb, contrato_id, f_ini, f_fin, desc)

    cache = CalendarioNoHabilesCache(make_prog_calendar_loader(sb))
    actividades_recalculadas = _shift_activities_after_suspension(
        sb, contrato_id, version_id, f_ini, f_fin, cache
    )

    # Recalcular fin de actividades no desplazadas (calendario ampliado)
    restantes = (
        sb.table("prog_actividades")
        .select("id")
        .eq("version_id", version_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    for r in restantes:
        recalc_fin_actividad(sb, contrato_id, str(r["id"]), cache)

    cpm = ejecutar_cpm_version(sb, version_id, contrato_id, cache)
    pks = (
        sb.table("prog_pk_estado")
        .select("pk_id")
        .eq("version_id", version_id)
        .execute()
        .data
        or []
    )
    if not pks:
        ensure_prog_pk_estado_all(sb, version_id, contrato_id)
    else:
        for r in pks:
            pk = str(r.get("pk_id") or "").strip()
            if pk:
                upsert_prog_pk_estado(sb, version_id, contrato_id, pk)

    sb.table("prog_versiones").update(
        {
            "metadata": meta,
            "motivo_reprogramacion": meta.get("motivo"),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", version_id).execute()

    acts = (
        sb.table("prog_actividades")
        .select("fecha_fin_calculada")
        .eq("version_id", version_id)
        .not_.is_("fecha_fin_calculada", "null")
        .execute()
        .data
        or []
    )
    fin_nueva = _project_end(acts)

    return {
        "ok": True,
        "dias_calendario_insertados": dias_insertados,
        "actividades_recalculadas": actividades_recalculadas,
        "cpm_nodos": len(cpm.nodos if hasattr(cpm, "nodos") else []),
        "fecha_fin_nueva": fin_nueva.isoformat() if fin_nueva else None,
        "metadata": meta,
    }


def create_and_apply_suspension(
    sb,
    contrato_id: int,
    usuario_id: int,
    motivo: str,
    metadata: dict,
) -> dict:
    meta = validate_suspension_metadata(metadata, motivo)
    row = create_version(
        sb,
        contrato_id,
        usuario_id,
        "suspension",
        motivo=meta.get("motivo"),
        metadata=meta,
        clonar=True,
    )
    vid = str(row.get("id"))
    result = apply_suspension_to_version(sb, contrato_id, vid, usuario_id, meta, meta.get("motivo") or motivo)
    result["version"] = row
    return result
