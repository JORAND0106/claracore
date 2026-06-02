"""
Rutas HTTP — versionador de presupuesto.
Prefijo: /presupuesto/{contrato_id}/versiones
"""
from __future__ import annotations

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

from presupuesto_helpers import (
    _presupuesto_aplica_filtro_interventoria,
    _presupuesto_q_filtros_ubicacion,
)

from main import (
    _es_admin_o_desarrollador,
    _es_rol_contratista_ppto,
    _require_contract_access,
    get_current_user,
    registrar_log,
    supabase,
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
    if not _presupuesto_aplica_filtro_interventoria(current_user):
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
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    items: Optional[List[str]] = Query(None),
    tramo: Optional[str] = None,
    calzada: Optional[str] = None,
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
    papelera: bool = False,
    limit: Optional[int] = Query(None, ge=1, le=20000),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    """Ítems de una versión con los mismos filtros que GET /presupuesto/{id}.

    La versión vigente lee del presupuesto VIVO; las congeladas, de su snapshot.
    """
    _require_contract_access(current_user, contrato_id)
    version_row = assert_version_del_contrato(supabase, contrato_id, version_id)
    es_vigente = bool(version_row.get("es_vigente"))

    def _q_base():
        if es_vigente:
            q = (
                supabase.table("presupuesto")
                .select("*")
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", "Presupuesto de Obra")
            )
        else:
            q = (
                supabase.table("presupuesto_version_items")
                .select("*")
                .eq("contrato_id", contrato_id)
                .eq("version_id", version_id)
            )
        if papelera:
            q = q.eq("dado_de_baja", True)
        else:
            q = q.eq("dado_de_baja", False)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        ins = [str(x).strip() for x in (items or []) if str(x).strip()]
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
    current_user=Depends(get_current_user),
):
    """Resumen por capítulo de un snapshot de versión."""
    _require_contract_access(current_user, contrato_id)
    return resumen_capitulos_version(supabase, contrato_id, version_id, tramo=tramo)


@router.get("/presupuesto/{contrato_id}/versiones/{version_id}/items-lista")
def get_presupuesto_version_items_lista(
    contrato_id: int,
    version_id: str,
    capitulo: str,
    tramo: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Ítems agregados de un capítulo en snapshot (misma forma que GET /presupuesto/.../items-lista)."""
    _require_contract_access(current_user, contrato_id)
    return items_lista_version(supabase, contrato_id, version_id, capitulo, tramo=tramo)


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
