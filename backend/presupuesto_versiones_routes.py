"""
Rutas HTTP — versionador de presupuesto.
Prefijo: /presupuesto/{contrato_id}/versiones
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from presupuesto_versiones_service import (
    assert_version_del_contrato,
    crear_version,
    eliminar_version,
    enviar_a_interventoria,
    estado_revision,
    items_lista_version,
    listar_versiones,
    rechazar_version,
    resumen_capitulos_version,
    resumen_ejecutivo,
    restaurar_version,
    sellar_version,
)

from presupuesto_version_biblioteca import (
    bulk_insert_biblioteca,
    bulk_patch_biblioteca_ids,
    conteo_biblioteca,
    dar_baja_biblioteca_item,
    fetch_panel_validacion_biblioteca,
    get_biblioteca_item,
    materializar_biblioteca_version,
    restaurar_biblioteca_item,
    update_biblioteca_item,
)

from presupuesto_panel_validacion import presupuesto_filtros_a_jsonb

from presupuesto_helpers import (
    _es_rol_interventoria_ppto,
    _presupuesto_aplica_filtro_interventoria,
    _presupuesto_coerce_multi_list,
    _presupuesto_q_filtros_ubicacion,
)

from main import (
    _es_admin_o_desarrollador,
    _es_rol_contratista_ppto,
    _require_contract_access,
    get_current_user,
    registrar_log,
    supabase,
    PresupuestoBulkEstado,
    PresupuestoBulkObservacion,
    PresupuestoBulkPreInterv,
    PresupuestoBulkRecalc,
    PresupuestoBulkTipoEjecucion,
    PresupuestoRow,
    PresupuestoUpdate,
)

from dashboard_presupuesto_vista import invalidate_scan_presupuesto_cache


def _invalidar_cache_dashboard(contrato_id: int) -> None:
    """El sello/creación/rechazo cambia la fuente oficial → refrescar dashboard."""
    try:
        invalidate_scan_presupuesto_cache(contrato_id)
    except Exception:
        pass


def _assert_rol_contratista(current_user):
    if _es_admin_o_desarrollador(current_user):
        return
    if not _es_rol_contratista_ppto(current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo el contratista puede enviar la versión a interventoría.",
        )


def _assert_rol_interventoria(current_user):
    if _es_admin_o_desarrollador(current_user):
        return
    if not _es_rol_interventoria_ppto(current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo la interventoría puede aprobar/sellar o rechazar la versión.",
        )

router = APIRouter(tags=["presupuesto-versiones"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


class CrearPresupuestoVersionBody(BaseModel):
    etiqueta: str = Field(..., min_length=1)
    justificacion_tecnica: Optional[str] = None
    aiu_porcentaje: Optional[float] = Field(None, ge=0)


class ObservacionesVersionBody(BaseModel):
    observaciones: Optional[str] = None


@router.get("/presupuesto/{contrato_id}/versiones")
def get_presupuesto_versiones(contrato_id: int, current_user=Depends(get_current_user)):
    """Lista versiones del contrato con conteo de ítems y costo directo total."""
    _require_contract_access(current_user, contrato_id)
    return listar_versiones(supabase, contrato_id)


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/items")
def get_presupuesto_version_items(
    contrato_id: int,
    version_id: str,
    biblioteca: bool = Query(False, description="Modo biblioteca paralela: siempre presupuesto_version_items"),
    capitulo: Optional[str] = None,
    capitulos: Optional[List[str]] = Query(None),
    item: Optional[str] = None,
    items: Optional[List[str]] = Query(None),
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = Query(None),
    calzada: Optional[str] = None,
    calzadas: Optional[List[str]] = Query(None),
    competencia: Optional[str] = None,
    competencias: Optional[List[str]] = Query(None),
    und: Optional[str] = None,
    unds: Optional[List[str]] = Query(None),
    nodo_inicio: Optional[str] = None,
    nodo_final: Optional[str] = None,
    buscar: Optional[str] = None,
    id_pol: Optional[str] = None,
    pk_criterio: Optional[str] = None,
    texto: Optional[str] = None,
    abs_desde: Optional[float] = None,
    abs_hasta: Optional[float] = None,
    revisado: Optional[str] = None,
    pre_interv_estado: Optional[str] = None,
    sellado: Optional[bool] = None,
    vlr_unitario_desde: Optional[float] = None,
    vlr_unitario_hasta: Optional[float] = None,
    cant_total_desde: Optional[float] = None,
    cant_total_hasta: Optional[float] = None,
    costo_directo_desde: Optional[float] = None,
    costo_directo_hasta: Optional[float] = None,
    tipo_ejecucion: Optional[str] = None,
    papelera: bool = False,
    limit: Optional[int] = Query(None, ge=1, le=20000),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    """Ítems de una versión. biblioteca=1 → presupuesto_version_items (biblioteca paralela editable).
    Sin biblioteca: la versión vigente lee del presupuesto VIVO; las congeladas, de su snapshot."""
    _require_contract_access(current_user, contrato_id)
    version_row = assert_version_del_contrato(supabase, contrato_id, version_id)
    es_vigente = bool(version_row.get("es_vigente"))
    use_biblioteca = biblioteca or not es_vigente

    def _q_base():
        if use_biblioteca:
            q = (
                supabase.table("presupuesto_version_items")
                .select("*")
                .eq("contrato_id", contrato_id)
                .eq("version_id", version_id)
            )
        else:
            q = (
                supabase.table("presupuesto")
                .select("*")
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", "Presupuesto de Obra")
            )
        if papelera:
            q = q.eq("dado_de_baja", True)
        else:
            q = q.eq("dado_de_baja", False)
        caps_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(capitulos) if str(x).strip()]
        if len(caps_in) > 1:
            q = q.in_("capitulo", caps_in)
        elif len(caps_in) == 1:
            q = q.eq("capitulo", caps_in[0])
        elif capitulo:
            q = q.eq("capitulo", capitulo)
        ins = [str(x).strip() for x in _presupuesto_coerce_multi_list(items) if str(x).strip()]
        if len(ins) > 1:
            if len(ins) > 200:
                raise HTTPException(status_code=422, detail="Máximo 200 ítems en lista items")
            q = q.in_("item", ins)
        elif len(ins) == 1:
            q = q.eq("item", ins[0])
        elif item:
            q = q.eq("item", item)
        tr_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(tramos) if str(x).strip()]
        if len(tr_in) > 1:
            q = q.in_("tramo", tr_in)
        elif len(tr_in) == 1:
            q = q.eq("tramo", tr_in[0])
        elif tramo:
            q = q.eq("tramo", tramo)
        cal_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(calzadas) if str(x).strip()]
        if len(cal_in) > 1:
            q = q.in_("calzada", cal_in)
        elif len(cal_in) == 1:
            q = q.eq("calzada", cal_in[0])
        elif calzada:
            q = q.eq("calzada", calzada)
        comp_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(competencias) if str(x).strip()]
        if len(comp_in) > 1:
            q = q.in_("competencia", comp_in)
        elif len(comp_in) == 1:
            q = q.eq("competencia", comp_in[0])
        elif competencia:
            q = q.eq("competencia", competencia)
        und_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(unds) if str(x).strip()]
        if len(und_in) > 1:
            q = q.in_("und", und_in)
        elif len(und_in) == 1:
            q = q.eq("und", und_in[0])
        elif und:
            q = q.eq("und", und)
        q = _presupuesto_q_filtros_ubicacion(
            q,
            nodo_inicio=nodo_inicio,
            nodo_final=nodo_final,
            buscar=buscar,
            id_pol=id_pol,
            pk_criterio=pk_criterio,
            texto=texto,
            abs_desde=abs_desde,
            abs_hasta=abs_hasta,
            revisado=revisado,
            pre_interv_estado=pre_interv_estado,
            sellado=sellado,
            vlr_unitario_desde=vlr_unitario_desde,
            vlr_unitario_hasta=vlr_unitario_hasta,
            cant_total_desde=cant_total_desde,
            cant_total_hasta=cant_total_hasta,
            costo_directo_desde=costo_directo_desde,
            costo_directo_hasta=costo_directo_hasta,
        )
        if _presupuesto_aplica_filtro_interventoria(current_user):
            q = q.or_("pre_interv_estado.is.null,pre_interv_estado.eq.Aprobado")
        return q.order("capitulo").order("item").order("pk_id")

    if limit is not None:
        return _q_base().range(offset, offset + limit - 1).execute().data

    PAGE = 1000
    all_rows = []
    off = 0
    while True:
        batch = _q_base().range(off, off + PAGE - 1).execute().data
        all_rows.extend(batch or [])
        if not batch or len(batch) < PAGE:
            break
        off += PAGE
    return all_rows


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/capitulos-lista")
def get_presupuesto_version_capitulos_lista(
    contrato_id: int,
    version_id: str,
    tramo: Optional[str] = None,
    biblioteca: bool = Query(False),
    current_user=Depends(get_current_user),
):
    """Resumen por capítulo de un snapshot de versión."""
    _require_contract_access(current_user, contrato_id)
    return resumen_capitulos_version(
        supabase, contrato_id, version_id, tramo=tramo, forzar_biblioteca=biblioteca
    )


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/items-lista")
def get_presupuesto_version_items_lista(
    contrato_id: int,
    version_id: str,
    capitulo: str,
    tramo: Optional[str] = None,
    biblioteca: bool = Query(False),
    current_user=Depends(get_current_user),
):
    """Ítems agregados de un capítulo en snapshot (misma forma que GET /presupuesto/.../items-lista)."""
    _require_contract_access(current_user, contrato_id)
    return items_lista_version(
        supabase, contrato_id, version_id, capitulo, tramo=tramo, forzar_biblioteca=biblioteca
    )


@router.post("/presupuesto/{contrato_id}/versiones/crear")
def post_presupuesto_version_crear(
    contrato_id: int,
    body: CrearPresupuestoVersionBody,
    current_user=Depends(get_current_user),
):
    """Crea snapshot del presupuesto de obra activo y lo marca como vigente."""
    _require_contract_access(current_user, contrato_id)
    result = crear_version(
        supabase,
        contrato_id,
        _uid(current_user),
        body.etiqueta,
        body.justificacion_tecnica,
        body.aiu_porcentaje,
    )
    _invalidar_cache_dashboard(contrato_id)
    try:
        registrar_log(
            current_user,
            "CREAR",
            "PRESUPUESTO",
            "presupuesto_version",
            str(result.get("id") or ""),
            {
                "contrato_id": contrato_id,
                "numero_version": result.get("numero_version"),
                "etiqueta": result.get("etiqueta"),
                "items_copiados": result.get("items_copiados"),
            },
            severidad="AUDIT",
        )
    except Exception:
        pass
    return result


@router.get("/presupuesto/{contrato_id}/versiones/estado-revision")
def get_presupuesto_versiones_estado_revision(
    contrato_id: int, current_user=Depends(get_current_user)
):
    """Conteo de revisión del presupuesto vivo (para el aviso de 100% aprobado)."""
    _require_contract_access(current_user, contrato_id)
    return estado_revision(supabase, contrato_id)


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/resumen-ejecutivo")
def get_presupuesto_version_resumen_ejecutivo(
    contrato_id: int, version_id: str, current_user=Depends(get_current_user)
):
    """Resumen ejecutivo (capítulos + costo directo + conteo + revisión) de la versión."""
    _require_contract_access(current_user, contrato_id)
    return resumen_ejecutivo(supabase, contrato_id, version_id)


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/enviar-interventoria")
def post_presupuesto_version_enviar_interventoria(
    contrato_id: int, version_id: str, current_user=Depends(get_current_user)
):
    """Llave 1 (contratista): envía la versión borrador a interventoría."""
    _require_contract_access(current_user, contrato_id)
    _assert_rol_contratista(current_user)
    result = enviar_a_interventoria(supabase, contrato_id, version_id, _uid(current_user))
    try:
        registrar_log(
            current_user, "EDITAR", "PRESUPUESTO", "presupuesto_version", str(version_id),
            {"contrato_id": contrato_id, "accion": "enviar_interventoria"}, severidad="AUDIT",
        )
    except Exception:
        pass
    return result


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/aprobar-sellar")
def post_presupuesto_version_aprobar_sellar(
    contrato_id: int, version_id: str, body: ObservacionesVersionBody = ObservacionesVersionBody(),
    current_user=Depends(get_current_user),
):
    """Llave 2 (interventoría): aprueba y sella la versión (congela snapshot, vigente aprobada)."""
    _require_contract_access(current_user, contrato_id)
    _assert_rol_interventoria(current_user)
    result = sellar_version(supabase, contrato_id, version_id, _uid(current_user), body.observaciones)
    _invalidar_cache_dashboard(contrato_id)
    try:
        registrar_log(
            current_user, "EDITAR", "PRESUPUESTO", "presupuesto_version", str(version_id),
            {"contrato_id": contrato_id, "accion": "aprobar_sellar",
             "items_sellados": result.get("items_sellados")}, severidad="AUDIT",
        )
    except Exception:
        pass
    return result


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/rechazar")
def post_presupuesto_version_rechazar(
    contrato_id: int, version_id: str, body: ObservacionesVersionBody = ObservacionesVersionBody(),
    current_user=Depends(get_current_user),
):
    """Interventoría devuelve la versión a borrador editable con observaciones."""
    _require_contract_access(current_user, contrato_id)
    _assert_rol_interventoria(current_user)
    result = rechazar_version(supabase, contrato_id, version_id, _uid(current_user), body.observaciones)
    try:
        registrar_log(
            current_user, "EDITAR", "PRESUPUESTO", "presupuesto_version", str(version_id),
            {"contrato_id": contrato_id, "accion": "rechazar"}, severidad="AUDIT",
        )
    except Exception:
        pass
    return result


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/restaurar")
def put_presupuesto_version_restaurar(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    """Marca la versión indicada como vigente (metadato histórico)."""
    _require_contract_access(current_user, contrato_id)
    result = restaurar_version(supabase, contrato_id, version_id)
    try:
        registrar_log(
            current_user,
            "EDITAR",
            "PRESUPUESTO",
            "presupuesto_version",
            str(version_id),
            {"contrato_id": contrato_id, "accion": "restaurar"},
            severidad="AUDIT",
        )
    except Exception:
        pass
    return result


# ── Biblioteca paralela editable (presupuesto_version_items) ─────────────────

@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/biblioteca/materializar")
def post_presupuesto_version_biblioteca_materializar(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    """Copia el presupuesto vivo a la biblioteca si aún no tiene ítems."""
    _require_contract_access(current_user, contrato_id)
    return materializar_biblioteca_version(supabase, contrato_id, version_id)


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/conteo")
def get_presupuesto_version_conteo(
    contrato_id: int,
    version_id: str,
    biblioteca: bool = Query(True),
    capitulo: Optional[str] = None,
    capitulos: Optional[List[str]] = Query(None),
    item: Optional[str] = None,
    items: Optional[List[str]] = Query(None),
    tramo: Optional[str] = None,
    calzada: Optional[str] = None,
    revisado: Optional[str] = None,
    pre_interv_estado: Optional[str] = None,
    papelera: bool = False,
    current_user=Depends(get_current_user),
):
    """Conteo de registros en biblioteca de versión (mismos filtros que GET .../items)."""
    _require_contract_access(current_user, contrato_id)
    version_row = assert_version_del_contrato(supabase, contrato_id, version_id)
    es_vigente = bool(version_row.get("es_vigente"))
    use_biblioteca = biblioteca or not es_vigente

    def _q_base():
        if use_biblioteca:
            q = (
                supabase.table("presupuesto_version_items")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("version_id", version_id)
            )
        else:
            q = (
                supabase.table("presupuesto")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", "Presupuesto de Obra")
            )
        if papelera:
            q = q.eq("dado_de_baja", True)
        else:
            q = q.eq("dado_de_baja", False)
        caps_in = [str(x).strip() for x in _presupuesto_coerce_multi_list(capitulos) if str(x).strip()]
        if len(caps_in) > 1:
            q = q.in_("capitulo", caps_in)
        elif len(caps_in) == 1:
            q = q.eq("capitulo", caps_in[0])
        elif capitulo:
            q = q.eq("capitulo", capitulo)
        ins = [str(x).strip() for x in _presupuesto_coerce_multi_list(items) if str(x).strip()]
        if len(ins) > 1:
            if len(ins) > 200:
                raise HTTPException(status_code=422, detail="Máximo 200 ítems en lista items")
            q = q.in_("item", ins)
        elif len(ins) == 1:
            q = q.eq("item", ins[0])
        elif item:
            q = q.eq("item", item)
        if tramo:
            q = q.eq("tramo", tramo)
        if calzada:
            q = q.eq("calzada", calzada)
        if revisado:
            q = q.eq("revisado", revisado)
        if pre_interv_estado:
            q = q.eq("pre_interv_estado", pre_interv_estado)
        if _presupuesto_aplica_filtro_interventoria(current_user):
            q = q.or_("pre_interv_estado.is.null,pre_interv_estado.eq.Aprobado")
        return q.order("id")

    total = conteo_biblioteca(supabase, contrato_id, version_id, _q_base)
    return {"total": total}


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/panel-validacion-interv")
def get_presupuesto_version_panel_validacion(
    contrato_id: int,
    version_id: str,
    nivel: str = Query("capitulo"),
    capitulo: Optional[str] = None,
    capitulos: Optional[List[str]] = Query(None),
    item: Optional[str] = None,
    items: Optional[List[str]] = Query(None),
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = Query(None),
    calzada: Optional[str] = None,
    calzadas: Optional[List[str]] = Query(None),
    competencia: Optional[str] = None,
    competencias: Optional[List[str]] = Query(None),
    und: Optional[str] = None,
    unds: Optional[List[str]] = Query(None),
    nodo_inicio: Optional[str] = None,
    nodo_final: Optional[str] = None,
    buscar: Optional[str] = None,
    id_pol: Optional[str] = None,
    pk_criterio: Optional[str] = None,
    texto: Optional[str] = None,
    abs_desde: Optional[float] = None,
    abs_hasta: Optional[float] = None,
    revisado: Optional[str] = None,
    pre_interv_estado: Optional[str] = None,
    sellado: Optional[bool] = None,
    vlr_unitario_desde: Optional[float] = None,
    vlr_unitario_hasta: Optional[float] = None,
    cant_total_desde: Optional[float] = None,
    cant_total_hasta: Optional[float] = None,
    costo_directo_desde: Optional[float] = None,
    costo_directo_hasta: Optional[float] = None,
    current_user=Depends(get_current_user),
):
    """Panel de validación sobre biblioteca de versión (presupuesto_version_items)."""
    _require_contract_access(current_user, contrato_id)
    nv = (nivel or "capitulo").strip().lower()
    if nv not in ("capitulo", "item"):
        raise HTTPException(status_code=422, detail="nivel debe ser capitulo o item")
    cap_drill = (capitulo or "").strip() or None
    if nv == "item" and not cap_drill:
        raise HTTPException(status_code=422, detail="capitulo requerido cuando nivel=item")
    filtros = presupuesto_filtros_a_jsonb(
        capitulo=capitulo,
        capitulos=capitulos,
        item=item,
        items=items,
        tramo=tramo,
        tramos=tramos,
        calzada=calzada,
        calzadas=calzadas,
        competencia=competencia,
        competencias=competencias,
        und=und,
        unds=unds,
        nodo_inicio=nodo_inicio,
        nodo_final=nodo_final,
        buscar=buscar,
        id_pol=id_pol,
        pk_criterio=pk_criterio,
        texto=texto,
        abs_desde=abs_desde,
        abs_hasta=abs_hasta,
        revisado=revisado,
        pre_interv_estado=pre_interv_estado,
        sellado=sellado,
        vlr_unitario_desde=vlr_unitario_desde,
        vlr_unitario_hasta=vlr_unitario_hasta,
        cant_total_desde=cant_total_desde,
        cant_total_hasta=cant_total_hasta,
        costo_directo_desde=costo_directo_desde,
        costo_directo_hasta=costo_directo_hasta,
    )
    return fetch_panel_validacion_biblioteca(
        supabase,
        contrato_id,
        version_id,
        current_user,
        nivel=nv,
        capitulo=cap_drill,
        filtros=filtros,
    )


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/item/{item_id}")
def get_presupuesto_version_biblioteca_item(
    contrato_id: int,
    version_id: str,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    return get_biblioteca_item(supabase, contrato_id, version_id, item_id)


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/item/{item_id}")
def put_presupuesto_version_biblioteca_item(
    contrato_id: int,
    version_id: str,
    item_id: int,
    body: PresupuestoUpdate,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    data = body.dict(exclude_unset=True)
    for k in ("motivo_edicion_tras_sellado", "motivo_edicion_con_estado_interv"):
        data.pop(k, None)
    label = current_user.get("nombre") or current_user.get("email") or "Usuario"
    return update_biblioteca_item(supabase, contrato_id, version_id, item_id, data, calculo_por=label)


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/item/{item_id}/dar-baja")
def put_presupuesto_version_biblioteca_dar_baja(
    contrato_id: int,
    version_id: str,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    return dar_baja_biblioteca_item(supabase, contrato_id, version_id, item_id)


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/item/{item_id}/restaurar")
def put_presupuesto_version_biblioteca_restaurar(
    contrato_id: int,
    version_id: str,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    return restaurar_biblioteca_item(supabase, contrato_id, version_id, item_id)


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/bulk")
def post_presupuesto_version_biblioteca_bulk(
    contrato_id: int,
    version_id: str,
    items: List[PresupuestoRow],
    mode: str = "append",
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    rows = [{k: v for k, v in it.dict().items() if v is not None} for it in items]
    return bulk_insert_biblioteca(supabase, contrato_id, version_id, rows, mode=mode)


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/bulk-estado")
def put_presupuesto_version_biblioteca_bulk_estado(
    contrato_id: int,
    version_id: str,
    body: PresupuestoBulkEstado,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    label = current_user.get("nombre") or current_user.get("email") or "Usuario"
    patch: dict = {"revisado": body.revisado}
    if body.revisado == "Aprobado":
        patch["validado_por"] = label
        patch["validado_en"] = datetime.utcnow().isoformat()
    else:
        patch["validado_por"] = None
        patch["validado_en"] = None
    return bulk_patch_biblioteca_ids(
        supabase, contrato_id, version_id, body.ids, patch
    )


@router.put("/presupuesto/{contrato_id}/versiones/{version_id}/bulk-pre-interv")
def put_presupuesto_version_biblioteca_bulk_pre_interv(
    contrato_id: int,
    version_id: str,
    body: PresupuestoBulkPreInterv,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    label = current_user.get("nombre") or current_user.get("email") or "Usuario"
    patch: dict = {"pre_interv_estado": body.estado}
    if body.estado == "Aprobado":
        patch["pre_interv_por"] = label
        patch["pre_interv_en"] = datetime.utcnow().isoformat()
    else:
        patch["pre_interv_por"] = None
        patch["pre_interv_en"] = None
    return bulk_patch_biblioteca_ids(
        supabase, contrato_id, version_id, body.ids, patch
    )


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/bulk-tipo-ejecucion")
def post_presupuesto_version_biblioteca_bulk_tipo(
    contrato_id: int,
    version_id: str,
    body: PresupuestoBulkTipoEjecucion,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    return bulk_patch_biblioteca_ids(
        supabase, contrato_id, version_id, body.ids, {"tipo_ejecucion": body.tipo_ejecucion}
    )


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/bulk-observacion")
def post_presupuesto_version_biblioteca_bulk_obs(
    contrato_id: int,
    version_id: str,
    body: PresupuestoBulkObservacion,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    return bulk_patch_biblioteca_ids(
        supabase, contrato_id, version_id, body.ids, {"observacion_externa": body.observacion_externa}
    )


@router.post("/presupuesto/{contrato_id}/versiones/{version_id}/bulk-recalcular")
def post_presupuesto_version_biblioteca_bulk_recalc(
    contrato_id: int,
    version_id: str,
    body: PresupuestoBulkRecalc,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    patch_base = {}
    if body.capitulo is not None:
        patch_base["capitulo"] = body.capitulo
    if body.item is not None:
        patch_base["item"] = body.item
    if body.descripcion is not None:
        patch_base["descripcion"] = body.descripcion
    if body.vlr_unitario is not None:
        patch_base["vlr_unitario"] = body.vlr_unitario
    actualizados = 0
    if patch_base and body.ids:
        bulk_patch_biblioteca_ids(supabase, contrato_id, version_id, body.ids, patch_base)
        actualizados += len(body.ids)
    if body.dims:
        for d in body.dims:
            dim_patch = {k: getattr(d, k) for k in ("ancho", "espesor", "area_long_nod", "capitulo", "item") if getattr(d, k, None) is not None}
            if dim_patch:
                update_biblioteca_item(supabase, contrato_id, version_id, d.id, dim_patch)
                actualizados += 1
    return {"actualizados": actualizados}


@router.delete("/presupuesto/{contrato_id}/versiones/{version_id}")
def delete_presupuesto_version(
    contrato_id: int,
    version_id: str,
    current_user=Depends(get_current_user),
):
    """Elimina físicamente una versión no vigente y sus ítems."""
    _require_contract_access(current_user, contrato_id)
    result = eliminar_version(supabase, contrato_id, version_id)
    try:
        registrar_log(
            current_user,
            "ELIMINAR",
            "PRESUPUESTO",
            "presupuesto_version",
            str(version_id),
            {"contrato_id": contrato_id},
            severidad="AUDIT",
        )
    except Exception:
        pass
    return result
