"""
Rutas HTTP Programación de obra ? montadas en main con prefijo `/prog-obra`.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles
from prog_obra_permissions import require_permiso_programacion_obra, tiene_permiso_programacion_obra
from prog_obra_service import (
    BusinessRuleError,
    aplicar_herencia_capitulo,
    assert_version_borrador,
    create_version,
    clear_version_programacion,
    clear_pk_programacion,
    clear_tramo_programacion,
    fetch_borrador_activo,
    fetch_estructura_programacion_pk,
    fetch_estructura_tramo,
    fetch_tramos_contrato,
    apply_actividades_batch_tramo,
    fetch_mapa_rows_for_version,
    fetch_mapa_rows_rpc,
    fetch_pks_con_ruta_critica,
    fetch_sin_agrupador_count_by_pk,
    enrich_mapa_rows_with_ruta_critica,
    enrich_mapa_rows_sin_agrupador,
    mark_cpm_dirty,
    fetch_vigente_meta,
    list_versiones_enriched,
    make_prog_calendar_loader,
    process_validation_decision,
    propagar_fechas_agrupador_a_hijos,
    limpiar_fechas_agrupador_hijos,
    recalc_fin_actividad,
    seed_festivos_colombia_globales,
    submit_to_validation,
    ensure_prog_pk_estado_all,
    sync_presupuesto_version,
    sync_capitulo_desde_items,
    upsert_prog_pk_estado,
    validate_segment_quantities,
    _ppto_items_por_pk,
    # Fase 2 ? CPM
    listar_dependencias,
    crear_dependencia,
    eliminar_dependencia,
    listar_dependencias_globales,
    crear_dependencia_global,
    eliminar_dependencia_global,
    ejecutar_cpm_version,
    obtener_cpm_resultados,
    obtener_ruta_critica,
)
from prog_obra_compare import (
    compare_versions,
    compute_desviaciones,
    enrich_mapa_rows_with_desviacion,
)
from prog_obra_suspension import (
    preview_suspension_impact,
    create_and_apply_suspension,
    apply_suspension_to_version,
    validate_suspension_metadata,
)
from prog_obra_curva_s import (
    build_curva_s,
    build_curva_s_escenarios,
    build_curva_s_pdf_html,
    fetch_cronograma_pdf_tree,
)
from prog_obra_pk_filter import parse_pk_ids_param
from prog_obra_auto_schedule import (
    check_auto_schedule_prereqs,
    preview_auto_schedule,
    apply_auto_schedule,
)
from prog_obra_costos_presupuesto import compute_costos_por_version
from prog_obra_export_project import build_project_xml, export_filename
from prog_obra_presupuesto_bridge import (
    build_delta_presupuesto,
    presupuesto_aprobacion_estado,
)

from main import (
    _es_desarrollador,
    _require_contract_access,
    get_current_user,
    registrar_log,
    require_solo_desarrollador,
    supabase,
)

import logging as _logging
import traceback as _tb

router = APIRouter(prefix="/prog-obra", tags=["programacion-obra"])
_logger = _logging.getLogger(__name__)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def _prog_nivel_usuario_puede(current_user, nivel: int) -> bool:
    if _es_desarrollador(current_user):
        return True
    from main import _sicoe_db_nivel_validacion_usuario

    n = _sicoe_db_nivel_validacion_usuario(_uid(current_user))
    return n is not None and int(n) == int(nivel)


def _log_prog(current_user, accion: str, entidad_tipo: str, entidad_id, detalle: dict) -> None:
    registrar_log(
        current_user,
        accion,
        "Programación obra",
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        detalle=detalle,
        resultado="ok",
    )


def _cache(contrato_id: int) -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=make_prog_calendar_loader(supabase))


class VersionCreateBody(BaseModel):
    tipo: str
    motivo_reprogramacion: Optional[str] = None
    version_origen_id: Optional[str] = None
    metadata: Optional[dict] = None
    clonar: bool = True


class SuspensionPreviewBody(BaseModel):
    version_id: str
    fecha_inicio_suspension: str
    fecha_fin_suspension: str


class SuspensionApplyBody(BaseModel):
    motivo: str
    metadata: dict


class AutoSchedulePreviewBody(BaseModel):
    version_id: str
    fecha_inicio: str
    fecha_fin: str
    estrategia: str = "equitativa"
    pk_order: Optional[List[str]] = None
    pk_parallel_groups: Optional[List[List[str]]] = None


class AutoScheduleApplyBody(BaseModel):
    propuesta: List[dict]


class CapituloUpsertBody(BaseModel):
    version_id: str
    pk_id: str
    capitulo: str
    fecha_inicio_sugerida: Optional[date] = None
    duracion_dias_habiles: Optional[int] = None


class ActividadUpsertBody(BaseModel):
    version_id: str
    pk_id: str
    capitulo: str
    item: str
    segmento: int = 1
    fecha_inicio: Optional[date] = None
    duracion_dias_habiles: Optional[int] = None
    cantidad_programada: float = Field(..., gt=0)
    unidad: str
    costo_unitario: float = Field(..., ge=0)
    tipo_distribucion: str = "lineal"
    override_manual: bool = False
    heredado_de_capitulo: bool = False
    agrupador_id: Optional[int] = None
    codigo_wbs: Optional[str] = None


class ValidarBody(BaseModel):
    nivel: int
    aprobar: bool
    observacion: Optional[str] = None


class HerenciaBody(BaseModel):
    version_id: str
    pk_id: str
    capitulo: str


class ActividadBatchItemBody(BaseModel):
    capitulo: str
    item: str
    segmento: int = 1
    fecha_inicio: Optional[date] = None
    duracion_dias_habiles: Optional[int] = None
    cantidad_programada: float = Field(..., gt=0)
    unidad: str
    costo_unitario: float = Field(..., ge=0)
    tipo_distribucion: str = "lineal"
    override_manual: bool = False
    heredado_de_capitulo: bool = False
    agrupador_id: Optional[int] = None
    codigo_wbs: Optional[str] = None


class ActividadesBatchBody(BaseModel):
    pk_id: str
    actividades: List[ActividadBatchItemBody] = Field(..., min_length=1)


class ActividadBatchTramoItemBody(BaseModel):
    capitulo: str
    item: str
    segmento: int = 1
    fecha_inicio: Optional[date] = None
    duracion_dias_habiles: Optional[int] = None
    agrupador_id: int
    codigo_wbs: Optional[str] = None
    tipo_distribucion: str = "lineal"


class ActividadesBatchTramoBody(BaseModel):
    tramo: str
    actividades: List[ActividadBatchTramoItemBody] = Field(..., min_length=1)
    pk_ids: Optional[List[str]] = None


class ValidarSegmentosBody(BaseModel):
    version_id: str
    pk_id: str
    capitulo: str
    item: str


@router.post("/{contrato_id}/validar-segmentos")
def prog_validar_segmentos(contrato_id: int, body: ValidarSegmentosBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, body.version_id)
    try:
        validate_segment_quantities(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            body.item.strip(),
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {"ok": True}


@router.get("/{contrato_id}/programacion-estructura")
def prog_programacion_estructura(
    contrato_id: int,
    pk_id: str = Query(...),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    pk = pk_id.strip()
    if not pk:
        raise HTTPException(status_code=400, detail="pk_id requerido")
    return fetch_estructura_programacion_pk(supabase, contrato_id, pk)


@router.get("/{contrato_id}/tramos")
def prog_tramos(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return fetch_tramos_contrato(supabase, contrato_id)


@router.get("/{contrato_id}/estructura-tramo")
def prog_estructura_tramo(
    contrato_id: int,
    tramo: str = Query(...),
    version_id: str = Query(...),
    pk_ids: Optional[List[str]] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    tramo_s = (tramo or "").strip()
    if not tramo_s:
        raise HTTPException(status_code=400, detail="tramo requerido")
    vid = (version_id or "").strip()
    if not vid:
        raise HTTPException(status_code=400, detail="version_id requerido")
    v = supabase.table("prog_versiones").select("contrato_id").eq("id", vid).limit(1).execute().data
    if not v or int(v[0]["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    try:
        return fetch_estructura_tramo(
            supabase,
            contrato_id,
            tramo_s,
            vid,
            pk_ids_filter=pk_ids,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.get("/{contrato_id}/mapa")
def prog_mapa(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    t0 = time.perf_counter()
    borrador = fetch_borrador_activo(supabase, contrato_id)
    vid, num = fetch_vigente_meta(supabase, contrato_id)
    version_mapa_id = str(borrador["id"]) if borrador and borrador.get("id") else (str(vid) if vid else None)
    # Borrador activo: colores del mapa desde prog_pk_estado de esa versión (no la vigente sellada).
    if borrador and borrador.get("id"):
        rows = fetch_mapa_rows_for_version(supabase, contrato_id, str(borrador["id"]))
    else:
        rows = fetch_mapa_rows_rpc(supabase, contrato_id)
        if not rows:
            rows = fetch_mapa_rows_for_version(supabase, contrato_id, vid) if vid else []
    critico_pks = fetch_pks_con_ruta_critica(supabase, version_mapa_id)
    rows = enrich_mapa_rows_with_ruta_critica(rows, critico_pks)
    sin_ag_by_pk = fetch_sin_agrupador_count_by_pk(supabase, contrato_id)
    rows = enrich_mapa_rows_sin_agrupador(rows, sin_ag_by_pk)
    desviacion_meta = None
    try:
        desv = compute_desviaciones(
            supabase,
            contrato_id,
            target_id=version_mapa_id,
        )
        rows = enrich_mapa_rows_with_desviacion(rows, desv.get("pks") or [])
        desviacion_meta = {
            "alerta": bool(desv.get("contrato", {}).get("alerta")),
            "label_fechas": desv.get("contrato", {}).get("label_fechas"),
            "baseline_id": desv.get("baseline_id"),
            "target_id": desv.get("target_id"),
            "contrato": desv.get("contrato"),
        }
    except HTTPException:
        desviacion_meta = None
    except BusinessRuleError:
        desviacion_meta = None
    ms = round((time.perf_counter() - t0) * 1000, 2)
    meta_out = {
        "version_vigente_id": vid,
        "version_vigente_numero": num,
        "borrador": borrador,
    }
    if desviacion_meta:
        meta_out["desviacion_contrato"] = desviacion_meta
    return {
        "pk": rows,
        "meta": meta_out,
        "tiempo_ms": ms,
    }


@router.get("/{contrato_id}/comparar")
def prog_comparar(
    contrato_id: int,
    baseline_id: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    pk_id: Optional[str] = Query(None),
    solo_cambios: bool = Query(False),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    try:
        return compare_versions(
            supabase,
            contrato_id,
            baseline_id=baseline_id,
            target_id=target_id,
            pk_id=pk_id,
            solo_cambios=solo_cambios,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.get("/{contrato_id}/desviaciones")
def prog_desviaciones(
    contrato_id: int,
    baseline_id: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    try:
        return compute_desviaciones(
            supabase,
            contrato_id,
            baseline_id=baseline_id,
            target_id=target_id,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/mantenimiento/seed-calendario-colombia")
def prog_seed_calendario(
    desde_anio: int = Query(2017, ge=1990, le=2100),
    hasta_anio: int = Query(2030, ge=1990, le=2100),
    current_user=Depends(require_solo_desarrollador),
):
    n = seed_festivos_colombia_globales(supabase, desde_anio, hasta_anio)
    return {"insertados": n, "desde_anio": desde_anio, "hasta_anio": hasta_anio}


@router.get("/{contrato_id}/versiones")
def prog_list_versiones(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return list_versiones_enriched(supabase, contrato_id)


@router.post("/{contrato_id}/versiones")
def prog_post_version(contrato_id: int, body: VersionCreateBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "crear")
    _require_contract_access(current_user, contrato_id)
    try:
        row = create_version(
            supabase,
            contrato_id,
            _uid(current_user),
            body.tipo,
            body.motivo_reprogramacion,
            version_origen_id=body.version_origen_id,
            metadata=body.metadata,
            clonar=body.clonar,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(current_user, "PROG_VERSION_CREADA", "prog_version", row.get("id"), {"contrato_id": contrato_id, "tipo": body.tipo})
    return row


@router.delete("/{contrato_id}/versiones/{version_id}")
def prog_delete_version(contrato_id: int, version_id: str, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "eliminar")
    _require_contract_access(current_user, contrato_id)
    v = supabase.table("prog_versiones").select("estado,contrato_id").eq("id", version_id).limit(1).execute().data
    if not v or int(v[0]["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    if v[0].get("estado") != "borrador":
        raise HTTPException(status_code=400, detail="Solo se eliminan versiones en borrador")
    supabase.table("prog_versiones").delete().eq("id", version_id).execute()
    _log_prog(current_user, "PROG_VERSION_ELIMINADA", "prog_version", version_id, {"contrato_id": contrato_id})
    return {"ok": True}


@router.delete("/{contrato_id}/versiones/{version_id}/programacion")
def prog_clear_version_programacion(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    """Elimina fechas, actividades, CPM y estados PK de una versión borrador (no toca presupuesto ni WBS)."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    try:
        result = clear_version_programacion(supabase, version_id, contrato_id)
    except HTTPException:
        raise
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_PROGRAMACION_ELIMINADA",
        "prog_version",
        version_id,
        {"contrato_id": contrato_id, "eliminados": result.get("eliminados")},
    )
    return result


@router.delete("/{contrato_id}/versiones/{version_id}/pk/{pk_id}/programacion")
def prog_clear_pk_programacion(
    contrato_id: int,
    version_id: str,
    pk_id: str,
    current_user=Depends(get_current_user),
):
    """Elimina todas las actividades de un PK en borrador y recalcula prog_pk_estado."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    try:
        result = clear_pk_programacion(supabase, version_id, contrato_id, pk_id)
    except HTTPException:
        raise
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_PK_PROGRAMACION_ELIMINADA",
        "prog_version",
        version_id,
        {"contrato_id": contrato_id, "pk_id": pk_id.strip(), "eliminados": result.get("eliminados")},
    )
    return result


@router.delete("/{contrato_id}/versiones/{version_id}/programacion-tramo")
def prog_clear_tramo_programacion(
    contrato_id: int,
    version_id: str,
    tramo: str = Query(..., min_length=1),
    pk_ids: Optional[List[str]] = Query(None),
    current_user=Depends(get_current_user),
):
    """Elimina actividades de todos los PKs de un tramo en borrador y recalcula prog_pk_estado."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    try:
        result = clear_tramo_programacion(
            supabase,
            version_id,
            contrato_id,
            tramo,
            pk_ids=pk_ids,
        )
    except HTTPException:
        raise
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_TRAMO_PROGRAMACION_ELIMINADA",
        "prog_version",
        version_id,
        {
            "contrato_id": contrato_id,
            "tramo": (tramo or "").strip(),
            "pk_count": result.get("pk_count"),
            "eliminados": result.get("eliminados"),
        },
    )
    return result


@router.get("/{contrato_id}/versiones/{version_id}/validaciones")
def prog_list_validaciones(contrato_id: int, version_id: str, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    v = supabase.table("prog_versiones").select("contrato_id").eq("id", version_id).limit(1).execute().data
    if not v or int(v[0]["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    return (
        supabase.table("prog_validaciones")
        .select("*")
        .eq("version_id", version_id)
        .order("orden")
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/versiones/{version_id}/sincronizar-estados-pk")
def prog_sincronizar_estados_pk(contrato_id: int, version_id: str, current_user=Depends(get_current_user)):
    """Recalcula prog_pk_estado y cantidades de actividades vs presupuesto actual."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    result = sync_presupuesto_version(supabase, version_id, contrato_id)
    _log_prog(
        current_user,
        "PROG_SINCRONIZAR_ESTADOS_PK",
        "prog_version",
        version_id,
        {"contrato_id": contrato_id, **result},
    )
    return result


@router.get("/{contrato_id}/presupuesto-aprobacion-estado")
def prog_presupuesto_aprobacion_estado(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return presupuesto_aprobacion_estado(supabase, contrato_id)


@router.get("/{contrato_id}/versiones/{version_id}/delta-presupuesto")
def prog_delta_presupuesto(contrato_id: int, version_id: str, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    v = supabase.table("prog_versiones").select("id,contrato_id,tipo,estado,version_origen_id").eq("id", version_id).limit(1).execute().data
    if not v or int(v[0].get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    row = v[0]
    if (row.get("estado") or "") not in ("borrador", "en_validacion"):
        raise HTTPException(status_code=400, detail="Delta presupuesto solo disponible en borrador o en validación")
    delta = build_delta_presupuesto(
        supabase,
        contrato_id,
        version_id,
        row.get("version_origen_id"),
        row.get("tipo") or "",
    )
    return delta


@router.post("/{contrato_id}/versiones/{version_id}/enviar-validacion")
def prog_enviar_validacion(contrato_id: int, version_id: str, current_user=Depends(get_current_user)):
    if not (
        tiene_permiso_programacion_obra(current_user, "editar")
        or tiene_permiso_programacion_obra(current_user, "validar")
    ):
        raise HTTPException(
            status_code=403,
            detail="No tiene permiso (Programación de obra · editar o validar) para enviar a validación.",
        )
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    try:
        rows = submit_to_validation(supabase, version_id, contrato_id)
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(current_user, "PROG_ENVIAR_VALIDACION", "prog_version", version_id, {"contrato_id": contrato_id})
    return rows


@router.post("/{contrato_id}/versiones/{version_id}/validar")
def prog_validar(contrato_id: int, version_id: str, body: ValidarBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "validar")
    _require_contract_access(current_user, contrato_id)
    if not _prog_nivel_usuario_puede(current_user, body.nivel):
        raise HTTPException(status_code=403, detail="Su perfil no corresponde a este nivel de validación")
    try:
        out = process_validation_decision(
            supabase,
            version_id,
            contrato_id,
            body.nivel,
            _uid(current_user),
            body.aprobar,
            body.observacion,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_VALIDACION",
        "prog_version",
        version_id,
        {"nivel": body.nivel, "aprobar": body.aprobar, "resultado": out.get("resultado")},
    )
    if out.get("resultado") == "rechazado":
        try:
            vrow = supabase.table("prog_versiones").select("creado_por").eq("id", version_id).single().execute().data
            creador = vrow.get("creado_por") if vrow else None
            if creador and int(creador) != _uid(current_user):
                supabase.table("notificaciones").insert(
                    {
                        "destinatario_id": int(creador),
                        "remitente_id": _uid(current_user),
                        "remitente_nombre": (current_user.get("nombre") or "")[:120],
                        "contrato_id": contrato_id,
                        "tipo": "validacion",
                        "modulo": "programacion_obra",
                        "entidad_tipo": "prog_version",
                        "entidad_id": str(version_id),
                        "asunto": "Programación de obra ? rechazo en validación",
                        "mensaje": (body.observacion or "")[:4000],
                        "leido": False,
                    }
                ).execute()
        except Exception:
            pass
    return out


@router.get("/{contrato_id}/calendario-no-habiles")
def prog_calendario_no_habiles(
    contrato_id: int,
    desde: date = Query(...),
    hasta: date = Query(...),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    if hasta < desde:
        raise HTTPException(status_code=400, detail="hasta debe ser >= desde")
    loader = make_prog_calendar_loader(supabase)
    rows = loader(int(contrato_id), desde, hasta)
    fechas = sorted({str(r.get("fecha") or "")[:10] for r in rows if r.get("fecha")})
    return {"fechas": fechas}


@router.get("/{contrato_id}/calcular-fin")
def prog_calcular_fin(
    contrato_id: int,
    fecha_inicio: date = Query(...),
    duracion_dias_habiles: int = Query(..., ge=1),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    fin = add_dias_habiles(contrato_id, fecha_inicio, duracion_dias_habiles, _cache(contrato_id))
    return {"fecha_fin_calculada": fin.isoformat() if fin else None}


@router.post("/{contrato_id}/capitulo")
def prog_upsert_capitulo(contrato_id: int, body: CapituloUpsertBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, body.version_id)
    v = supabase.table("prog_versiones").select("contrato_id").eq("id", body.version_id).single().execute().data
    if int(v["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no pertenece al contrato")
    payload = {
        "version_id": body.version_id,
        "contrato_id": contrato_id,
        "pk_id": body.pk_id.strip(),
        "capitulo": body.capitulo.strip(),
        "fecha_inicio_sugerida": body.fecha_inicio_sugerida.isoformat() if body.fecha_inicio_sugerida else None,
        "duracion_dias_habiles": body.duracion_dias_habiles,
        "aplica_herencia": False,
        "creado_por": _uid(current_user),
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }
    ex = (
        supabase.table("prog_actividades_capitulo")
        .select("id")
        .eq("version_id", body.version_id)
        .eq("pk_id", body.pk_id.strip())
        .eq("capitulo", body.capitulo.strip())
        .limit(1)
        .execute()
        .data
    )
    if ex:
        p2 = {k: v for k, v in payload.items() if k != "creado_por"}
        supabase.table("prog_actividades_capitulo").update(p2).eq("id", ex[0]["id"]).execute()
        rid = ex[0]["id"]
    else:
        ins = supabase.table("prog_actividades_capitulo").insert(payload).execute().data
        rid = ins[0]["id"] if ins else None
    _log_prog(
        current_user,
        "PROG_CAPITULO_GUARDADO",
        "prog_actividades_capitulo",
        rid,
        {"pk_id": body.pk_id, "capitulo": body.capitulo},
    )
    return {"id": rid}


@router.post("/{contrato_id}/versiones/{version_id}/actividades-batch")
def prog_actividades_batch(
    contrato_id: int,
    version_id: str,
    body: ActividadesBatchBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no pertenece al contrato")

    uid = _uid(current_user)
    cache = _cache(contrato_id)
    t0 = time.perf_counter()
    pk_id = body.pk_id.strip()

    # Calcular fecha_fin en Python (1 carga de calendario, luego todo en memoria)
    actividades = []
    has_agrupadores = False
    for it in body.actividades:
        if it.tipo_distribucion not in ("lineal", "manual"):
            raise HTTPException(status_code=400, detail="tipo_distribucion inválido")
        fi_d = it.fecha_inicio if isinstance(it.fecha_inicio, date) else None
        du_i = int(it.duracion_dias_habiles) if it.duracion_dias_habiles and int(it.duracion_dias_habiles) > 0 else None
        fin = add_dias_habiles(contrato_id, fi_d, du_i, cache) if fi_d and du_i else None
        if it.agrupador_id:
            has_agrupadores = True
        row = {
            "capitulo": it.capitulo.strip(),
            "item": it.item.strip(),
            "segmento": int(it.segmento),
            "fecha_inicio": fi_d.isoformat() if fi_d else None,
            "duracion_dias_habiles": du_i,
            "fecha_fin_calculada": fin.isoformat() if fin else None,
            "cantidad_programada": float(it.cantidad_programada),
            "unidad": (it.unidad or "?")[:20],
            "costo_unitario": float(it.costo_unitario),
            "tipo_distribucion": it.tipo_distribucion,
            "override_manual": bool(it.override_manual),
            "heredado_de_capitulo": bool(it.heredado_de_capitulo),
        }
        if it.agrupador_id is not None:
            row["agrupador_id"] = int(it.agrupador_id)
        if it.codigo_wbs:
            row["codigo_wbs"] = it.codigo_wbs.strip()[:50]
        actividades.append(row)

    try:
        res = supabase.rpc(
            "prog_batch_upsert_actividades",
            {
                "p_version_id": version_id,
                "p_contrato_id": contrato_id,
                "p_pk_id": pk_id,
                "p_usuario_id": uid,
                "p_actividades": actividades,
            },
        ).execute()
    except Exception:
        _trace = _tb.format_exc()
        _logger.error("ERROR RPC prog_batch_upsert_actividades: %s", _trace)
        raise HTTPException(status_code=500, detail=f"Error en batch RPC: {_trace[-600:]}")

    propagaciones = 0
    limpiezas_ag = 0
    if has_agrupadores:
        _, ppto_items_pk = _ppto_items_por_pk(supabase, contrato_id, pk_id)
        seen_ag = set()
        seen_clear = set()
        for it in body.actividades:
            fi_d = it.fecha_inicio if isinstance(it.fecha_inicio, date) else None
            du_i = int(it.duracion_dias_habiles) if it.duracion_dias_habiles and int(it.duracion_dias_habiles) > 0 else None
            if not it.agrupador_id:
                continue
            ag_key = (it.capitulo.strip(), int(it.agrupador_id))
            if fi_d and du_i:
                if ag_key in seen_ag:
                    continue
                seen_ag.add(ag_key)
                fin_d = add_dias_habiles(contrato_id, fi_d, du_i, cache)
                propagar_fechas_agrupador_a_hijos(
                    supabase,
                    version_id,
                    contrato_id,
                    pk_id,
                    it.capitulo.strip(),
                    int(it.agrupador_id),
                    (it.codigo_wbs or it.item or "").strip(),
                    fi_d,
                    du_i,
                    fin_d,
                    uid,
                    cache,
                    ppto_items=ppto_items_pk,
                )
                propagaciones += 1
            elif ag_key not in seen_clear:
                seen_clear.add(ag_key)
                limpiar_fechas_agrupador_hijos(
                    supabase,
                    version_id,
                    contrato_id,
                    pk_id,
                    it.capitulo.strip(),
                    int(it.agrupador_id),
                    ppto_items=ppto_items_pk,
                )
                limpiezas_ag += 1
        # Tras heredar o limpiar fechas en ítems hijo, recalcular prog_pk_estado (color del polígono)
        upsert_prog_pk_estado(supabase, version_id, contrato_id, pk_id)

    # Siempre aplicar lógica Python (WBS-aware) por si la RPC en BD no está actualizada
    if not has_agrupadores:
        upsert_prog_pk_estado(supabase, version_id, contrato_id, pk_id)

    mark_cpm_dirty(supabase, version_id)

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    if elapsed_ms > 5000:
        _logger.warning(
            "actividades-batch lento (RPC): %sms count=%d propagaciones=%d",
            elapsed_ms, len(actividades), propagaciones,
        )

    _log_prog(
        current_user,
        "PROG_ACTIVIDADES_BATCH",
        "prog_version",
        version_id,
        {
            "pk_id": body.pk_id,
            "count": len(actividades),
            "agrupadores": has_agrupadores,
            "propagaciones": propagaciones,
            "ms": elapsed_ms,
            "rpc": True,
        },
    )
    payload = res.data or {"ok": True, "actividades": []}
    if isinstance(payload, dict):
        payload["ms"] = elapsed_ms
        payload["rpc"] = True
    return payload


@router.post("/{contrato_id}/versiones/{version_id}/actividades-batch-tramo")
def prog_actividades_batch_tramo(
    contrato_id: int,
    version_id: str,
    body: ActividadesBatchTramoBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no pertenece al contrato")

    tramo_s = (body.tramo or "").strip()
    if not tramo_s:
        raise HTTPException(status_code=400, detail="tramo requerido")

    uid = _uid(current_user)
    cache = _cache(contrato_id)
    t0 = time.perf_counter()

    actividades = []
    for it in body.actividades:
        if it.tipo_distribucion not in ("lineal", "manual"):
            raise HTTPException(status_code=400, detail="tipo_distribucion inválido")
        actividades.append({
            "capitulo": it.capitulo.strip(),
            "item": it.item.strip(),
            "segmento": int(it.segmento),
            "fecha_inicio": it.fecha_inicio,
            "duracion_dias_habiles": it.duracion_dias_habiles,
            "agrupador_id": int(it.agrupador_id),
            "codigo_wbs": (it.codigo_wbs or it.item or "").strip(),
            "tipo_distribucion": it.tipo_distribucion,
            "override_manual": True,
            "heredado_de_capitulo": False,
        })

    try:
        result = apply_actividades_batch_tramo(
            supabase,
            contrato_id,
            version_id,
            tramo_s,
            actividades,
            uid,
            cache,
            pk_ids_filter=body.pk_ids,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except Exception:
        _trace = _tb.format_exc()
        _logger.error("ERROR actividades-batch-tramo: %s", _trace)
        raise HTTPException(status_code=500, detail=f"Error batch tramo: {_trace[-600:]}")

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    result["ms"] = elapsed_ms
    _log_prog(
        current_user,
        "PROG_ACTIVIDADES_BATCH_TRAMO",
        "prog_version",
        version_id,
        {
            "tramo": tramo_s,
            "count": len(actividades),
            "pk_ids": result.get("pk_ids"),
            "ms": elapsed_ms,
        },
    )
    return result


@router.post("/{contrato_id}/actividad")
def prog_upsert_actividad(contrato_id: int, body: ActividadUpsertBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, body.version_id)
    v = supabase.table("prog_versiones").select("contrato_id").eq("id", body.version_id).single().execute().data
    if int(v["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no pertenece al contrato")
    if body.tipo_distribucion not in ("lineal", "manual"):
        raise HTTPException(status_code=400, detail="tipo_distribucion inválido")
    cache = _cache(contrato_id)
    fin = None
    if body.fecha_inicio and body.duracion_dias_habiles:
        fin = add_dias_habiles(contrato_id, body.fecha_inicio, int(body.duracion_dias_habiles), cache)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "version_id": body.version_id,
        "contrato_id": contrato_id,
        "pk_id": body.pk_id.strip(),
        "capitulo": body.capitulo.strip(),
        "item": body.item.strip(),
        "segmento": int(body.segmento),
        "fecha_inicio": body.fecha_inicio.isoformat() if body.fecha_inicio else None,
        "duracion_dias_habiles": body.duracion_dias_habiles,
        "fecha_fin_calculada": fin.isoformat() if fin else None,
        "cantidad_programada": float(body.cantidad_programada),
        "unidad": (body.unidad or "")[:20],
        "costo_unitario": float(body.costo_unitario),
        "tipo_distribucion": body.tipo_distribucion,
        "heredado_de_capitulo": body.heredado_de_capitulo,
        "override_manual": body.override_manual,
        "creado_por": _uid(current_user),
        "actualizado_en": now,
    }
    if body.agrupador_id is not None:
        payload["agrupador_id"] = int(body.agrupador_id)
    if body.codigo_wbs:
        payload["codigo_wbs"] = body.codigo_wbs.strip()[:50]
    ex = (
        supabase.table("prog_actividades")
        .select("id")
        .eq("version_id", body.version_id)
        .eq("pk_id", body.pk_id.strip())
        .eq("capitulo", body.capitulo.strip())
        .eq("item", body.item.strip())
        .eq("segmento", int(body.segmento))
        .limit(1)
        .execute()
        .data
    )
    if ex:
        payload.pop("creado_por", None)
        supabase.table("prog_actividades").update(payload).eq("id", ex[0]["id"]).execute()
        aid = ex[0]["id"]
    else:
        ins = supabase.table("prog_actividades").insert(payload).execute().data
        aid = ins[0]["id"] if ins else None
    upsert_prog_pk_estado(supabase, body.version_id, contrato_id, body.pk_id.strip())
    if body.agrupador_id and body.fecha_inicio and body.duracion_dias_habiles:
        propagar_fechas_agrupador_a_hijos(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            int(body.agrupador_id),
            (body.codigo_wbs or body.item or "").strip(),
            body.fecha_inicio,
            int(body.duracion_dias_habiles),
            fin,
            _uid(current_user),
            cache,
        )
    elif body.agrupador_id and not (body.fecha_inicio and body.duracion_dias_habiles):
        limpiar_fechas_agrupador_hijos(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            int(body.agrupador_id),
        )
    elif body.fecha_inicio and body.duracion_dias_habiles:
        sync_capitulo_desde_items(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            cache,
            _uid(current_user),
        )
    mark_cpm_dirty(supabase, body.version_id)
    _log_prog(
        current_user,
        "PROG_ACTIVIDAD_GUARDADA",
        "prog_actividades",
        aid,
        {"pk_id": body.pk_id, "item": body.item, "segmento": body.segmento},
    )
    return {"id": aid, "fecha_fin_calculada": fin.isoformat() if fin else None}


@router.get("/{contrato_id}/actividades")
def prog_list_actividades(
    contrato_id: int,
    version_id: str = Query(...),
    pk_id: str = Query(...),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    v = supabase.table("prog_versiones").select("contrato_id").eq("id", version_id).limit(1).execute().data
    if not v or int(v[0]["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    acts = (
        supabase.table("prog_actividades")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .execute()
        .data
        or []
    )
    acts = sorted(
        acts,
        key=lambda r: (
            str(r.get("capitulo") or ""),
            str(r.get("item") or ""),
            int(r.get("segmento") or 0),
        ),
    )
    caps = (
        supabase.table("prog_actividades_capitulo")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .execute()
        .data
        or []
    )
    return {"capitulos": caps, "actividades": acts}


@router.post("/{contrato_id}/herencia")
def prog_herencia(contrato_id: int, body: HerenciaBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    try:
        n = aplicar_herencia_capitulo(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            _uid(current_user),
            _cache(contrato_id),
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_HERENCIA_APLICADA",
        "prog_version",
        body.version_id,
        {"pk_id": body.pk_id, "capitulo": body.capitulo, "items_afectados": n},
    )
    return {"items_afectados": n}


@router.post("/{contrato_id}/actividades/{actividad_id}/recalcular-fin")
def prog_recalc_fin(contrato_id: int, actividad_id: str, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    row = supabase.table("prog_actividades").select("contrato_id,version_id,pk_id").eq("id", actividad_id).limit(1).execute().data
    if not row or int(row[0]["contrato_id"]) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    assert_version_borrador(supabase, str(row[0]["version_id"]))
    fin = recalc_fin_actividad(supabase, contrato_id, actividad_id, _cache(contrato_id))
    upsert_prog_pk_estado(supabase, str(row[0]["version_id"]), contrato_id, str(row[0]["pk_id"]))
    return {"fecha_fin_calculada": fin}


# -----------------------------------------------------------------------------
# FASE 2 ? Endpoints CPM
# -----------------------------------------------------------------------------

class DependenciaBody(BaseModel):
    pk_id_origen: str
    capitulo_origen: str
    pk_id_destino: str
    capitulo_destino: str
    tipo: str = Field(..., pattern="^(FS|SS|FF|SF)$")
    lag_dias: int = Field(default=0)
    agrupador_id_origen: Optional[str] = None
    agrupador_id_destino: Optional[str] = None


class DependenciaGlobalBody(BaseModel):
    capitulo_origen: str
    capitulo_destino: str
    tipo: str = Field(..., pattern="^(FS|SS|FF|SF)$")
    lag_dias: int = Field(default=0)


@router.get("/{contrato_id}/versiones/{version_id}/capitulos-pk")
def prog_capitulos_pk(
    contrato_id: int,
    version_id: str,
    pk_id: str = Query(...),
    current_user=Depends(get_current_user),
):
    """Retorna capítulos con fechas de un PK específico (para selector de destino en dependencias)."""
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    rows = (
        supabase.table("prog_actividades_capitulo")
        .select("capitulo,fecha_inicio_sugerida,duracion_dias_habiles")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id.strip())
        .order("capitulo")
        .execute()
        .data
        or []
    )
    return {"capitulos": [r["capitulo"] for r in rows]}


@router.get("/{contrato_id}/versiones/{version_id}/dependencias")
def prog_listar_dependencias(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return listar_dependencias(supabase, version_id)


@router.post("/{contrato_id}/versiones/{version_id}/dependencias")
def prog_crear_dependencia(
    contrato_id: int,
    version_id: str,
    body: DependenciaBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Version no pertenece al contrato")
    try:
        dep = crear_dependencia(
            supabase, version_id, contrato_id,
            body.pk_id_origen.strip(), body.capitulo_origen.strip(),
            body.pk_id_destino.strip(), body.capitulo_destino.strip(),
            body.tipo, body.lag_dias,
            _uid(current_user),
            agrupador_id_origen=body.agrupador_id_origen,
            agrupador_id_destino=body.agrupador_id_destino,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(current_user, "PROG_DEPENDENCIA_CREADA", "prog_version", version_id,
              {"origen": f"{body.pk_id_origen}/{body.capitulo_origen}",
               "destino": f"{body.pk_id_destino}/{body.capitulo_destino}",
               "tipo": body.tipo, "lag": body.lag_dias})
    return dep


@router.delete("/{contrato_id}/versiones/{version_id}/dependencias/{dep_id}")
def prog_eliminar_dependencia(
    contrato_id: int,
    version_id: str,
    dep_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, version_id)
    eliminar_dependencia(supabase, dep_id, version_id)
    _log_prog(current_user, "PROG_DEPENDENCIA_ELIMINADA", "prog_version", version_id, {"dep_id": dep_id})
    return {"ok": True}


@router.get("/{contrato_id}/versiones/{version_id}/dependencias-globales")
def prog_listar_dependencias_globales(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return listar_dependencias_globales(supabase, version_id)


@router.post("/{contrato_id}/versiones/{version_id}/dependencias-globales")
def prog_crear_dependencia_global(
    contrato_id: int,
    version_id: str,
    body: DependenciaGlobalBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Version no pertenece al contrato")
    try:
        dep = crear_dependencia_global(
            supabase, version_id, contrato_id,
            body.capitulo_origen.strip(), body.capitulo_destino.strip(),
            body.tipo, body.lag_dias,
            _uid(current_user),
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(current_user, "PROG_DEP_GLOBAL_CREADA", "prog_version", version_id,
              {"origen": body.capitulo_origen, "destino": body.capitulo_destino,
               "tipo": body.tipo, "lag": body.lag_dias})
    return dep


@router.delete("/{contrato_id}/versiones/{version_id}/dependencias-globales/{dep_id}")
def prog_eliminar_dependencia_global(
    contrato_id: int,
    version_id: str,
    dep_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, version_id)
    eliminar_dependencia_global(supabase, dep_id, version_id)
    _log_prog(current_user, "PROG_DEP_GLOBAL_ELIMINADA", "prog_version", version_id, {"dep_id": dep_id})
    return {"ok": True}


@router.post("/{contrato_id}/versiones/{version_id}/calcular-cpm")
def prog_calcular_cpm(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    assert_version_borrador(supabase, version_id)
    import time as _time
    t0 = _time.perf_counter()
    try:
        resultado = ejecutar_cpm_version(
            supabase, version_id, contrato_id, _cache(contrato_id)
        )
    except Exception as _e:
        _trace = _tb.format_exc()
        _logger.error("ERROR CPM calcular-cpm: %s", _trace)
        raise HTTPException(status_code=500, detail=f"Error CPM: {str(_e)} | {_trace[-500:]}")

    ms = round((_time.perf_counter() - t0) * 1000, 1)
    if not resultado.ok:
        raise HTTPException(status_code=400, detail=resultado.error or "Error CPM")

    _log_prog(current_user, "PROG_CPM_CALCULADO", "prog_version", version_id,
              {"nodos": len(resultado.nodos), "criticos": len(resultado.ruta_critica), "ms": ms})

    def _node_key_dict(key: tuple) -> dict:
        pk, cap, agr = key[0], key[1], key[2] if len(key) > 2 else ""
        out = {"pk_id": pk, "capitulo": cap}
        if agr:
            out["agrupador_id"] = agr
        return out

    return {
        "ok": True,
        "nodos_calculados": len(resultado.nodos),
        "ruta_critica": [_node_key_dict(k) for k in resultado.ruta_critica],
        "cascada_afectados": [_node_key_dict(k) for k in resultado.nodos_afectados_cascada],
        "tiempo_ms": ms,
    }


@router.get("/{contrato_id}/versiones/{version_id}/cpm-resultados")
def prog_get_cpm_resultados(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    rows = obtener_cpm_resultados(supabase, version_id)
    # Incluir flag cpm_dirty desde prog_versiones
    ver = supabase.table("prog_versiones").select("cpm_dirty,cpm_calculado_en").eq("id", version_id).limit(1).execute().data or [{}]
    return {
        "cpm_dirty": ver[0].get("cpm_dirty", True),
        "cpm_calculado_en": ver[0].get("cpm_calculado_en"),
        "resultados": rows,
    }


@router.get("/{contrato_id}/versiones/{version_id}/ruta-critica")
def prog_get_ruta_critica(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return obtener_ruta_critica(supabase, version_id)


@router.post("/{contrato_id}/suspension/preview")
def prog_suspension_preview(
    contrato_id: int,
    body: SuspensionPreviewBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    try:
        f_ini = date.fromisoformat(str(body.fecha_inicio_suspension)[:10])
        f_fin = date.fromisoformat(str(body.fecha_fin_suspension)[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Fechas de suspensión inválidas")
    try:
        return preview_suspension_impact(supabase, contrato_id, body.version_id, f_ini, f_fin)
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/{contrato_id}/suspension/aplicar")
def prog_suspension_aplicar(
    contrato_id: int,
    body: SuspensionApplyBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "crear")
    _require_contract_access(current_user, contrato_id)
    try:
        result = create_and_apply_suspension(
            supabase,
            contrato_id,
            _uid(current_user),
            body.motivo,
            body.metadata,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_SUSPENSION_APLICADA",
        "prog_version",
        result.get("version", {}).get("id"),
        {"contrato_id": contrato_id, "actividades": result.get("actividades_recalculadas")},
    )
    return result


@router.post("/{contrato_id}/versiones/{version_id}/suspension/aplicar")
def prog_suspension_aplicar_version(
    contrato_id: int,
    version_id: str,
    body: SuspensionApplyBody,
    current_user=Depends(get_current_user),
):
    """Aplica suspensión a versión borrador existente tipo suspension."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    try:
        result = apply_suspension_to_version(
            supabase,
            contrato_id,
            version_id,
            _uid(current_user),
            body.metadata,
            body.motivo,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(current_user, "PROG_SUSPENSION_APLICADA", "prog_version", version_id, {"contrato_id": contrato_id})
    return result


@router.get("/{contrato_id}/costos-por-version-presupuesto")
def prog_costos_por_version_presupuesto(
    contrato_id: int,
    version_prog_id: str = Query(...),
    version_ppto_id: str = Query(...),
    pk_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return compute_costos_por_version(
        supabase,
        contrato_id,
        version_prog_id.strip(),
        version_ppto_id.strip(),
        pk_id=(pk_id or "").strip() or None,
        solo_programados=False,
    )


@router.get("/{contrato_id}/curva-s")
def prog_curva_s(
    contrato_id: int,
    baseline_id: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    version_ppto_id: Optional[str] = Query(None),
    pk_ids: Optional[str] = Query(None, description="PKs separados por coma (opcional)"),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    try:
        return build_curva_s(
            supabase,
            contrato_id,
            baseline_id=baseline_id,
            target_id=target_id,
            version_ppto_id=version_ppto_id,
            pk_ids=pk_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{contrato_id}/curva-s/escenarios")
def prog_curva_s_escenarios(
    contrato_id: int,
    version_prog_id: str = Query(...),
    version_ppto_ids: str = Query(..., description="UUIDs separados por coma (máx. 5)"),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    ids = [x.strip() for x in (version_ppto_ids or "").split(",") if x.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="version_ppto_ids requerido")
    try:
        return build_curva_s_escenarios(supabase, contrato_id, version_prog_id.strip(), ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{contrato_id}/curva-s/pdf")
def prog_curva_s_pdf(
    contrato_id: int,
    baseline_id: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    version_ppto_id: Optional[str] = Query(None),
    pk_ids: Optional[str] = Query(None, description="PKs separados por coma (opcional)"),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return _curva_s_pdf_response(
        contrato_id,
        baseline_id=baseline_id,
        target_id=target_id,
        version_ppto_id=version_ppto_id,
        pk_ids=pk_ids,
    )


def _curva_s_pdf_response(
    contrato_id: int,
    *,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
    version_ppto_id: Optional[str] = None,
    pk_ids: Optional[str] = None,
):
    try:
        data = build_curva_s(
            supabase,
            contrato_id,
            baseline_id=baseline_id,
            target_id=target_id,
            version_ppto_id=version_ppto_id,
            pk_ids=pk_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    crows = (
        supabase.table("contratos")
        .select("id,numero,objeto,contratista,interventoria,logo_contratista")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )
    contrato = crows[0]
    pk_set = parse_pk_ids_param(pk_ids)
    resolved_target = (data.get("target_id") or "").strip()
    prog_meta: dict = {}
    if resolved_target:
        prows = (
            supabase.table("prog_versiones")
            .select("numero_version,tipo,estado")
            .eq("id", resolved_target)
            .limit(1)
            .execute()
            .data
            or []
        )
        prog_meta = prows[0] if prows else {}
    ppto_meta: dict = {}
    ppto_id = (data.get("version_ppto_id") or "").strip()
    if ppto_id:
        from prog_obra_costos_presupuesto import assert_ppto_version_contrato

        ppto_meta = assert_ppto_version_contrato(supabase, contrato_id, ppto_id)
    cronograma = (
        fetch_cronograma_pdf_tree(supabase, resolved_target, contrato_id, pk_ids=pk_set)
        if resolved_target
        else []
    )
    html = build_curva_s_pdf_html(
        contrato,
        data,
        cronograma=cronograma,
        prog_meta=prog_meta,
        ppto_meta=ppto_meta,
    )
    try:
        from topografia_utils import to_pdf_bytes
        pdf = to_pdf_bytes(html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo generar PDF: {e}")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="curva-s-contrato-{contrato_id}.pdf"'},
    )


@router.get("/{contrato_id}/exportar-project-xml")
def prog_exportar_project_xml(
    contrato_id: int,
    version_id: str = Query(...),
    version_ppto_id: Optional[str] = Query(None),
    pk_ids: Optional[str] = Query(None, description="PKs separados por coma (opcional)"),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    vid = (version_id or "").strip()
    if not vid:
        raise HTTPException(status_code=400, detail="version_id requerido")
    crows = (
        supabase.table("contratos")
        .select("id,numero,objeto")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )
    c = crows[0]
    pname = f"Contrato {c.get('numero') or contrato_id}"
    if c.get("objeto"):
        pname = f"{pname} — {str(c['objeto'])[:80]}"
    try:
        xml_bytes = build_project_xml(
            supabase,
            contrato_id,
            vid,
            version_ppto_id=(version_ppto_id or "").strip() or None,
            project_name=pname,
            pk_ids=pk_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    fname = export_filename(contrato_id)
    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/auto-schedule/prereqs")
def prog_auto_schedule_prereqs(
    contrato_id: int,
    version_id: str = Query(...),
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    return check_auto_schedule_prereqs(supabase, contrato_id, version_id)


@router.post("/{contrato_id}/auto-schedule/preview")
def prog_auto_schedule_preview(
    contrato_id: int,
    body: AutoSchedulePreviewBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    try:
        f_ini = date.fromisoformat(str(body.fecha_inicio)[:10])
        f_fin = date.fromisoformat(str(body.fecha_fin)[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Fechas del contrato inválidas")
    try:
        return preview_auto_schedule(
            supabase,
            contrato_id,
            body.version_id,
            f_ini,
            f_fin,
            body.estrategia,
            pk_order=body.pk_order,
            pk_parallel_groups=body.pk_parallel_groups,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/{contrato_id}/versiones/{version_id}/auto-schedule/aplicar")
def prog_auto_schedule_aplicar(
    contrato_id: int,
    version_id: str,
    body: AutoScheduleApplyBody,
    current_user=Depends(get_current_user),
):
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    try:
        result = apply_auto_schedule(
            supabase,
            contrato_id,
            version_id,
            _uid(current_user),
            body.propuesta,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=400, detail=e.message)
    _log_prog(
        current_user,
        "PROG_AUTO_SCHEDULE_APLICADO",
        "prog_version",
        version_id,
        {"contrato_id": contrato_id, "actividades": result.get("actividades_aplicadas")},
    )
    return result
