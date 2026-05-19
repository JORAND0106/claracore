"""
Rutas HTTP Programación de obra — montadas en main con prefijo `/prog-obra`.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles
from prog_obra_permissions import require_permiso_programacion_obra, tiene_permiso_programacion_obra
from prog_obra_service import (
    BusinessRuleError,
    aplicar_herencia_capitulo,
    assert_version_borrador,
    create_version,
    fetch_borrador_activo,
    fetch_mapa_rows_for_version,
    fetch_mapa_rows_rpc,
    fetch_vigente_meta,
    make_prog_calendar_loader,
    process_validation_decision,
    recalc_fin_actividad,
    seed_festivos_colombia_globales,
    submit_to_validation,
    batch_upsert_actividades,
    ensure_prog_pk_estado_all,
    sync_capitulo_desde_items,
    upsert_prog_pk_estado,
    validate_segment_quantities,
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


class ActividadesBatchBody(BaseModel):
    pk_id: str
    actividades: List[ActividadBatchItemBody] = Field(..., min_length=1)


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


@router.get("/{contrato_id}/mapa")
def prog_mapa(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "ver")
    _require_contract_access(current_user, contrato_id)
    t0 = time.perf_counter()
    borrador = fetch_borrador_activo(supabase, contrato_id)
    if borrador and borrador.get("id"):
        rows = fetch_mapa_rows_for_version(supabase, contrato_id, str(borrador["id"]))
    else:
        rows = fetch_mapa_rows_rpc(supabase, contrato_id)
    vid, num = fetch_vigente_meta(supabase, contrato_id)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "pk": rows,
        "meta": {
            "version_vigente_id": vid,
            "version_vigente_numero": num,
            "borrador": borrador,
        },
        "tiempo_ms": ms,
    }


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
    return (
        supabase.table("prog_versiones")
        .select("id,numero_version,tipo,estado,creado_en,sellado_en,motivo_reprogramacion")
        .eq("contrato_id", contrato_id)
        .order("numero_version", desc=True)
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/versiones")
def prog_post_version(contrato_id: int, body: VersionCreateBody, current_user=Depends(get_current_user)):
    require_permiso_programacion_obra(current_user, "crear")
    _require_contract_access(current_user, contrato_id)
    try:
        row = create_version(supabase, contrato_id, _uid(current_user), body.tipo, body.motivo_reprogramacion)
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
    """Recalcula prog_pk_estado para todos los PK del contrato (tras guardado masivo)."""
    require_permiso_programacion_obra(current_user, "editar")
    _require_contract_access(current_user, contrato_id)
    v = assert_version_borrador(supabase, version_id)
    if int(v.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    ensure_prog_pk_estado_all(supabase, version_id, contrato_id)
    _log_prog(
        current_user,
        "PROG_SINCRONIZAR_ESTADOS_PK",
        "prog_version",
        version_id,
        {"contrato_id": contrato_id},
    )
    return {"ok": True}


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
                        "asunto": "Programación de obra — rechazo en validación",
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
    try:
        require_permiso_programacion_obra(current_user, "editar")
        _require_contract_access(current_user, contrato_id)
        v = assert_version_borrador(supabase, version_id)
        if int(v.get("contrato_id") or 0) != int(contrato_id):
            raise HTTPException(status_code=404, detail="Versión no pertenece al contrato")
        cache = _cache(contrato_id)
        items_raw = []
        for it in body.actividades:
            if it.tipo_distribucion not in ("lineal", "manual"):
                raise HTTPException(status_code=400, detail="tipo_distribucion inválido")
            items_raw.append(
                {
                    "capitulo": it.capitulo.strip(),
                    "item": it.item.strip(),
                    "segmento": int(it.segmento),
                    "fecha_inicio": it.fecha_inicio,
                    "duracion_dias_habiles": it.duracion_dias_habiles,
                    "cantidad_programada": float(it.cantidad_programada),
                    "unidad": it.unidad,
                    "costo_unitario": float(it.costo_unitario),
                    "tipo_distribucion": it.tipo_distribucion,
                    "override_manual": it.override_manual,
                    "heredado_de_capitulo": it.heredado_de_capitulo,
                }
            )
        try:
            results = batch_upsert_actividades(
                supabase,
                version_id,
                contrato_id,
                body.pk_id.strip(),
                items_raw,
                _uid(current_user),
                cache,
            )
        except BusinessRuleError as e:
            raise HTTPException(status_code=400, detail=e.message)
        _log_prog(
            current_user,
            "PROG_ACTIVIDADES_BATCH",
            "prog_version",
            version_id,
            {"pk_id": body.pk_id, "count": len(results)},
        )
        return {"ok": True, "actividades": results}
    except HTTPException:
        raise
    except Exception as _e:
        _trace = _tb.format_exc()
        _logger.error("ERROR BATCH actividades-batch: %s", _trace)
        raise HTTPException(
            status_code=500,
            detail=f"Error en batch: {str(_e)} | {_trace[-600:]}",
        )


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
    if body.fecha_inicio and body.duracion_dias_habiles:
        sync_capitulo_desde_items(
            supabase,
            body.version_id,
            contrato_id,
            body.pk_id.strip(),
            body.capitulo.strip(),
            cache,
            _uid(current_user),
        )
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
