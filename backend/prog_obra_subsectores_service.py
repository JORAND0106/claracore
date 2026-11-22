"""
Persistencia y orquestación de subsectores PK (Programación de obra).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from prog_obra_costos_presupuesto import (
    fetch_ppto_rows_programacion,
    resolve_ppto_vigente_version_id,
)
from prog_obra_lineas_agrupador import linea_key_from_row
from prog_obra_service import (
    BusinessRuleError,
    assert_version_borrador,
    mark_cpm_dirty,
    upsert_prog_pk_estado,
)
from prog_obra_subsectores import (
    SubsectorError,
    absorber_redondeo_ultimo_subsector,
    calcular_cantidades_subsector,
    clip_pk_polygon_entre_abscisas,
    display_label_subsector,
    fetch_pk_abs_range,
    fetch_subsector_lineas,
    fetch_subsector_lineas_pk,
    format_abscisa_label,
    label_rango_subsector,
    lineas_sin_abscisado,
    list_subsectores,
    parse_abscisa_label,
    pendiente_por_linea,
    round_abscisa_decena_m,
    validar_cobertura_cantidades,
    validar_rango_dentro_pk,
    validar_sin_solape,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(s: Any) -> str:
    return str(s or "").strip()


def _tables_ok(sb) -> bool:
    try:
        sb.table("prog_pk_subsectores").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def _ppto_lineas_pk(sb, contrato_id: int, pk_id: str, version_ppto_id: Optional[str] = None) -> List[dict]:
    vid = version_ppto_id or resolve_ppto_vigente_version_id(sb, contrato_id)
    rows = fetch_ppto_rows_programacion(
        sb,
        contrato_id,
        pk_id=_norm(pk_id),
        version_ppto_id=vid,
        force_vigente=not bool(version_ppto_id),
    )
    # Asegurar clave estable
    for r in rows:
        if not r.get("_linea_key"):
            r["_linea_key"] = linea_key_from_row(r)
    return rows


def precheck_subdividir(sb, contrato_id: int, pk_id: str, version_ppto_id: Optional[str] = None) -> dict:
    rows = _ppto_lineas_pk(sb, contrato_id, pk_id, version_ppto_id)
    sin = lineas_sin_abscisado(rows)
    pk_lo, pk_hi = fetch_pk_abs_range(sb, contrato_id, pk_id)
    return {
        "ok": len(sin) == 0 and len(rows) > 0,
        "puede_subdividir": len(sin) == 0 and len(rows) > 0,
        "lineas_sin_abscisado": sin,
        "lineas_total": len(rows),
        "pk_abs_inicio_m": pk_lo,
        "pk_abs_final_m": pk_hi,
        "pk_abs_inicio_label": format_abscisa_label(pk_lo) if pk_lo is not None else None,
        "pk_abs_final_label": format_abscisa_label(pk_hi) if pk_hi is not None else None,
    }


def preview_subsector(
    sb,
    contrato_id: int,
    version_id: str,
    pk_id: str,
    *,
    abs_inicio: Any,
    abs_final: Any,
    modo: str = "automatico",
    manual: Optional[Dict[str, float]] = None,
    plano_fc: Optional[dict] = None,
    pk_geom: Optional[dict] = None,
    version_ppto_id: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> dict:
    if not _tables_ok(sb):
        raise BusinessRuleError("Tablas de subsectores no disponibles. Aplique la migración.")

    abs_ini = parse_abscisa_label(abs_inicio)
    abs_fin = parse_abscisa_label(abs_final)
    if abs_ini is None or abs_fin is None:
        raise SubsectorError("Abscisas inválidas.")
    if abs_ini > abs_fin:
        abs_ini, abs_fin = abs_fin, abs_ini

    pk_lo, pk_hi = fetch_pk_abs_range(sb, contrato_id, pk_id)
    validar_rango_dentro_pk(abs_ini, abs_fin, pk_lo, pk_hi)

    existentes = list_subsectores(sb, version_id, pk_id)
    validar_sin_solape(abs_ini, abs_fin, existentes, exclude_id=exclude_id)

    rows = _ppto_lineas_pk(sb, contrato_id, pk_id, version_ppto_id)
    sin = lineas_sin_abscisado(rows)
    if sin:
        raise SubsectorError(
            "Hay líneas sin abscisado; no se puede subdividir.",
            code="sin_abscisado",
        )

    asignaciones, cruzan = calcular_cantidades_subsector(
        rows,
        abs_ini,
        abs_fin,
        modo=modo,
        manual=manual,
        dibujando=True,
    )

    geo = None
    if pk_geom is not None:
        geo = clip_pk_polygon_entre_abscisas(pk_geom, plano_fc, abs_ini, abs_fin)

    # Pendiente estimada incluyendo este preview + existentes
    otras = []
    for s in existentes:
        if exclude_id and str(s.get("id")) == str(exclude_id):
            continue
        otras.append(
            [
                {
                    "linea_key": L.get("presupuesto_linea_key") or "",
                    "capitulo": L.get("capitulo"),
                    "item": L.get("item"),
                    "cantidad": L.get("cantidad"),
                }
                for L in fetch_subsector_lineas(sb, str(s["id"]))
            ]
        )
    otras.append(asignaciones)
    pend = pendiente_por_linea(rows, otras)
    errs = validar_cobertura_cantidades(rows, otras)

    return {
        "abs_inicio_m": abs_ini,
        "abs_final_m": abs_fin,
        "abs_inicio_label": format_abscisa_label(abs_ini),
        "abs_final_label": format_abscisa_label(abs_fin),
        "label": display_label_subsector(pk_id, abs_ini, abs_fin),
        "geojson": geo,
        "asignaciones": asignaciones,
        "cruzan": cruzan,
        "requiere_decision_cruzan": len(cruzan) > 0 and (modo or "").lower() != "automatico",
        "pendiente": pend,
        "inconsistencias": errs,
        "modo": modo,
    }


def crear_subsector(
    sb,
    contrato_id: int,
    version_id: str,
    pk_id: str,
    usuario_id: int,
    *,
    abs_inicio: Any,
    abs_final: Any,
    modo: str = "automatico",
    manual: Optional[Dict[str, float]] = None,
    geojson: Optional[dict] = None,
    plano_fc: Optional[dict] = None,
    pk_geom: Optional[dict] = None,
    version_ppto_id: Optional[str] = None,
) -> dict:
    assert_version_borrador(sb, version_id)
    if not _tables_ok(sb):
        raise BusinessRuleError("Tablas de subsectores no disponibles. Aplique la migración.")

    preview = preview_subsector(
        sb,
        contrato_id,
        version_id,
        pk_id,
        abs_inicio=abs_inicio,
        abs_final=abs_final,
        modo=modo,
        manual=manual,
        plano_fc=plano_fc,
        pk_geom=pk_geom,
        version_ppto_id=version_ppto_id,
    )
    if preview.get("cruzan") and (modo or "").lower() == "manual" and not manual:
        raise SubsectorError("Hay líneas que cruzan el límite; indique Manual o Automático.")

    if preview.get("inconsistencias"):
        msgs = "; ".join(e["mensaje"] for e in preview["inconsistencias"][:5])
        raise SubsectorError(f"No cuadra la cobertura: {msgs}")

    geo = geojson or preview.get("geojson")
    existentes = list_subsectores(sb, version_id, pk_id)
    orden = (max((int(s.get("orden") or 0) for s in existentes), default=0) + 1)

    modo_eff = (modo or "automatico").lower()
    if preview["asignaciones"]:
        modos = {a.get("modo") for a in preview["asignaciones"] if a.get("modo") in ("manual", "automatico")}
        if "manual" in modos and "automatico" in modos:
            modo_eff = "mixto"
        elif "manual" in modos:
            modo_eff = "manual"
        elif "automatico" in modos:
            modo_eff = "automatico"

    row = {
        "version_id": version_id,
        "contrato_id": int(contrato_id),
        "pk_id": _norm(pk_id),
        "orden": orden,
        "abs_inicio_m": preview["abs_inicio_m"],
        "abs_final_m": preview["abs_final_m"],
        "abs_inicio_label": preview["abs_inicio_label"],
        "abs_final_label": preview["abs_final_label"],
        "geojson": geo,
        "modo_reparto": modo_eff if modo_eff in ("manual", "automatico", "mixto") else "automatico",
        "creado_por": int(usuario_id),
        "creado_en": _now(),
        "actualizado_en": _now(),
    }
    ins = sb.table("prog_pk_subsectores").insert(row).execute().data or []
    if not ins:
        raise BusinessRuleError("No se pudo crear el subsector.")
    sub = ins[0]
    sid = str(sub["id"])

    lineas_payload = []
    for a in preview["asignaciones"]:
        if float(a.get("cantidad") or 0) <= 0:
            continue
        lineas_payload.append(
            {
                "subsector_id": sid,
                "version_id": version_id,
                "contrato_id": int(contrato_id),
                "pk_id": _norm(pk_id),
                "capitulo": a["capitulo"],
                "item": a["item"],
                "presupuesto_linea_key": a.get("linea_key") or "",
                "cantidad": a["cantidad"],
                "cantidad_total_linea": a.get("cantidad_total_linea"),
                "modo": a.get("modo") or "automatico",
                "creado_en": _now(),
                "actualizado_en": _now(),
            }
        )
    if lineas_payload:
        sb.table("prog_pk_subsector_lineas").insert(lineas_payload).execute()

    # Absorber redondeo entre todos los subsectores del PK
    _rebalance_redondeo_pk(sb, contrato_id, version_id, pk_id, version_ppto_id)

    mark_cpm_dirty(sb, version_id)
    upsert_prog_pk_estado(sb, version_id, contrato_id, _norm(pk_id))

    return get_subsector_detail(sb, sid)


def _rebalance_redondeo_pk(sb, contrato_id, version_id, pk_id, version_ppto_id=None):
    rows = _ppto_lineas_pk(sb, contrato_id, pk_id, version_ppto_id)
    subs = list_subsectores(sb, version_id, pk_id)
    if len(subs) < 2:
        return
    asigns = []
    for s in subs:
        asigns.append(
            [
                {
                    "id": L.get("id"),
                    "linea_key": L.get("presupuesto_linea_key") or "",
                    "capitulo": L.get("capitulo"),
                    "item": L.get("item"),
                    "cantidad": L.get("cantidad"),
                }
                for L in fetch_subsector_lineas(sb, str(s["id"]))
            ]
        )
    adjusted = absorber_redondeo_ultimo_subsector(rows, asigns)
    # Persistir deltas del último subsector
    last = adjusted[-1] if adjusted else []
    for a in last:
        if a.get("id"):
            sb.table("prog_pk_subsector_lineas").update(
                {"cantidad": a["cantidad"], "actualizado_en": _now()}
            ).eq("id", a["id"]).execute()


def actualizar_subsector(
    sb,
    contrato_id: int,
    version_id: str,
    subsector_id: str,
    usuario_id: int,
    *,
    abs_inicio: Any = None,
    abs_final: Any = None,
    modo: Optional[str] = None,
    manual: Optional[Dict[str, float]] = None,
    geojson: Optional[dict] = None,
    plano_fc: Optional[dict] = None,
    pk_geom: Optional[dict] = None,
    version_ppto_id: Optional[str] = None,
) -> dict:
    assert_version_borrador(sb, version_id)
    cur = (
        sb.table("prog_pk_subsectores")
        .select("*")
        .eq("id", subsector_id)
        .eq("version_id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not cur:
        raise BusinessRuleError("Subsector no encontrado.")
    sub = cur[0]
    pk_id = _norm(sub["pk_id"])

    a0 = abs_inicio if abs_inicio is not None else sub["abs_inicio_m"]
    a1 = abs_final if abs_final is not None else sub["abs_final_m"]
    modo_eff = modo or sub.get("modo_reparto") or "automatico"

    preview = preview_subsector(
        sb,
        contrato_id,
        version_id,
        pk_id,
        abs_inicio=a0,
        abs_final=a1,
        modo=modo_eff,
        manual=manual,
        plano_fc=plano_fc,
        pk_geom=pk_geom,
        version_ppto_id=version_ppto_id,
        exclude_id=subsector_id,
    )
    if preview.get("inconsistencias"):
        msgs = "; ".join(e["mensaje"] for e in preview["inconsistencias"][:5])
        raise SubsectorError(f"No cuadra la cobertura: {msgs}")

    geo = geojson if geojson is not None else (preview.get("geojson") or sub.get("geojson"))
    sb.table("prog_pk_subsectores").update(
        {
            "abs_inicio_m": preview["abs_inicio_m"],
            "abs_final_m": preview["abs_final_m"],
            "abs_inicio_label": preview["abs_inicio_label"],
            "abs_final_label": preview["abs_final_label"],
            "geojson": geo,
            "modo_reparto": modo_eff if modo_eff in ("manual", "automatico", "mixto") else "automatico",
            "actualizado_en": _now(),
        }
    ).eq("id", subsector_id).execute()

    # Reemplazar líneas
    sb.table("prog_pk_subsector_lineas").delete().eq("subsector_id", subsector_id).execute()
    lineas_payload = []
    for a in preview["asignaciones"]:
        if float(a.get("cantidad") or 0) <= 0:
            continue
        lineas_payload.append(
            {
                "subsector_id": subsector_id,
                "version_id": version_id,
                "contrato_id": int(contrato_id),
                "pk_id": pk_id,
                "capitulo": a["capitulo"],
                "item": a["item"],
                "presupuesto_linea_key": a.get("linea_key") or "",
                "cantidad": a["cantidad"],
                "cantidad_total_linea": a.get("cantidad_total_linea"),
                "modo": a.get("modo") or "automatico",
                "creado_en": _now(),
                "actualizado_en": _now(),
            }
        )
    if lineas_payload:
        sb.table("prog_pk_subsector_lineas").insert(lineas_payload).execute()

    # Retirar programación del subsector (cantidades cambiaron)
    try:
        sb.table("prog_actividades").delete().eq("version_id", version_id).eq(
            "subsector_id", subsector_id
        ).execute()
    except Exception:
        sb.table("prog_actividades").update({"subsector_id": None}).eq(
            "subsector_id", subsector_id
        ).execute()

    _rebalance_redondeo_pk(sb, contrato_id, version_id, pk_id, version_ppto_id)
    mark_cpm_dirty(sb, version_id)
    upsert_prog_pk_estado(sb, version_id, contrato_id, pk_id)
    return get_subsector_detail(sb, subsector_id)


def eliminar_subsector(
    sb,
    contrato_id: int,
    version_id: str,
    subsector_id: str,
) -> dict:
    assert_version_borrador(sb, version_id)
    cur = (
        sb.table("prog_pk_subsectores")
        .select("*")
        .eq("id", subsector_id)
        .eq("version_id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not cur:
        raise BusinessRuleError("Subsector no encontrado.")
    sub = cur[0]
    pk_id = _norm(sub["pk_id"])
    lineas_antes = fetch_subsector_lineas(sb, subsector_id)

    # Retirar programación ligada
    sb.table("prog_actividades").delete().eq("version_id", version_id).eq("subsector_id", subsector_id).execute()
    sb.table("prog_pk_subsector_lineas").delete().eq("subsector_id", subsector_id).execute()
    sb.table("prog_pk_subsectores").delete().eq("id", subsector_id).execute()

    mark_cpm_dirty(sb, version_id)
    upsert_prog_pk_estado(sb, version_id, contrato_id, pk_id)
    return {
        "ok": True,
        "pk_id": pk_id,
        "subsector_id": subsector_id,
        "lineas_liberadas": lineas_antes,
        "label": display_label_subsector(pk_id, sub.get("abs_inicio_m"), sub.get("abs_final_m")),
    }


def get_subsector_detail(sb, subsector_id: str) -> dict:
    rows = (
        sb.table("prog_pk_subsectores").select("*").eq("id", subsector_id).limit(1).execute().data or []
    )
    if not rows:
        raise BusinessRuleError("Subsector no encontrado.")
    sub = rows[0]
    lineas = fetch_subsector_lineas(sb, subsector_id)
    sub["lineas"] = lineas
    sub["label"] = display_label_subsector(sub.get("pk_id"), sub.get("abs_inicio_m"), sub.get("abs_final_m"))
    sub["rango_label"] = label_rango_subsector(sub.get("abs_inicio_m"), sub.get("abs_final_m"))
    return sub


def list_subsectores_pk_enriched(
    sb,
    contrato_id: int,
    version_id: str,
    pk_id: str,
    version_ppto_id: Optional[str] = None,
) -> dict:
    if not _tables_ok(sb):
        return {"pk_id": _norm(pk_id), "subsectores": [], "pendiente": [], "puede_subdividir": False}
    pre = precheck_subdividir(sb, contrato_id, pk_id, version_ppto_id)
    subs = list_subsectores(sb, version_id, pk_id)
    enriched = []
    asigns_all = []
    for s in subs:
        detail = get_subsector_detail(sb, str(s["id"]))
        enriched.append(detail)
        asigns_all.append(
            [
                {
                    "linea_key": L.get("presupuesto_linea_key") or "",
                    "capitulo": L.get("capitulo"),
                    "item": L.get("item"),
                    "cantidad": L.get("cantidad"),
                }
                for L in detail.get("lineas") or []
            ]
        )
    rows = _ppto_lineas_pk(sb, contrato_id, pk_id, version_ppto_id) if pre["lineas_total"] else []
    pend = pendiente_por_linea(rows, asigns_all) if rows else []
    return {
        "pk_id": _norm(pk_id),
        "subsectores": enriched,
        "pendiente": pend,
        "puede_subdividir": pre["puede_subdividir"],
        "lineas_sin_abscisado": pre["lineas_sin_abscisado"],
        "pk_abs_inicio_m": pre["pk_abs_inicio_m"],
        "pk_abs_final_m": pre["pk_abs_final_m"],
        "pk_abs_inicio_label": pre["pk_abs_inicio_label"],
        "pk_abs_final_label": pre["pk_abs_final_label"],
    }


def audit_detalle_subsector(
    accion: str,
    sub: dict,
    *,
    lineas_antes: Optional[Sequence[dict]] = None,
    lineas_despues: Optional[Sequence[dict]] = None,
    modo: Optional[str] = None,
) -> dict:
    """Detalle para registrar_log (módulo Logs)."""
    antes_map = {
        f"{_norm(L.get('capitulo'))}|{_norm(L.get('item'))}|{_norm(L.get('presupuesto_linea_key'))}": L
        for L in (lineas_antes or [])
    }
    desp_map = {
        f"{_norm(L.get('capitulo'))}|{_norm(L.get('item'))}|{_norm(L.get('presupuesto_linea_key') or L.get('linea_key'))}": L
        for L in (lineas_despues or sub.get("lineas") or [])
    }
    keys = sorted(set(antes_map) | set(desp_map))
    cambios = []
    for k in keys:
        a = antes_map.get(k)
        d = desp_map.get(k)
        cambios.append(
            {
                "capitulo": (d or a or {}).get("capitulo"),
                "item": (d or a or {}).get("item"),
                "antes": None if a is None else float(a.get("cantidad") or 0),
                "despues": None if d is None else float(d.get("cantidad") or 0),
            }
        )
    return {
        "accion": accion,
        "pk_id": sub.get("pk_id"),
        "subsector_id": sub.get("id"),
        "abs_inicio": sub.get("abs_inicio_label") or format_abscisa_label(sub.get("abs_inicio_m")),
        "abs_final": sub.get("abs_final_label") or format_abscisa_label(sub.get("abs_final_m")),
        "modo": modo or sub.get("modo_reparto"),
        "label": display_label_subsector(sub.get("pk_id"), sub.get("abs_inicio_m"), sub.get("abs_final_m")),
        "lineas": cambios,
        "tz": "America/Bogota",
    }
