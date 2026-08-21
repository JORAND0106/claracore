"""
Rutas HTTP — módulo Seguimiento.
Prefijo: /seguimiento

Registrado en main.py vía include_router(seguimiento_router).
"""
from __future__ import annotations

import io
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from main import _require_contract_access, get_current_user, registrar_log, supabase
from seguimiento_permissions import require_permiso_seguimiento, tiene_permiso_seguimiento
from seguimiento_service import (
    ActaAccesoDenegado,
    MSG_ACTA_ACCESO_RESTRINGIDO,
    add_idea,
    actualizar_estado_asignado,
    actualizar_estado_gestion,
    actualizar_fecha_compromiso,
    adjuntar_imagen_idea_base64,
    adjuntar_imagen_tarea_base64,
    agregar_comentario,
    assert_puede_ver_acta,
    cargar_evidencia,
    compromisos_abiertos_contrato,
    create_acta,
    crear_compromiso_desde_idea,
    crear_compromiso_libre,
    crear_tarea,
    destinar_item,
    eliminar_acta,
    eliminar_item,
    generar_preview_pdf_acta,
    get_acta,
    get_item_detalle,
    list_actas,
    list_bandeja,
    list_usuarios_contrato_enriquecidos,
    procesar_vencimientos_y_llamados,
    proximo_consecutivo,
    redaccion_asistida_clara,
    registrar_firma_asistente,
    revertir_acta_a_borrador,
    revisar_justificacion,
    solicitar_justificacion,
    update_acta,
    update_idea,
    update_tarea,
)

_log = logging.getLogger("claracore.seguimiento.routes")

router = APIRouter(prefix="/seguimiento", tags=["seguimiento"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _http_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "no encontrad" in msg.lower():
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=400, detail=msg)


def _http_acta_acceso(exc: ActaAccesoDenegado) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail=getattr(exc, "detail", None) or MSG_ACTA_ACCESO_RESTRINGIDO,
    )


def _check_contrato(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, contrato_id)


def _cron_secret_ok(x_cron_secret: str | None) -> bool:
    expected = (os.getenv("CRON_SECRET") or os.getenv("INTERNAL_CRON_SECRET") or "").strip()
    if not expected:
        return False
    return (x_cron_secret or "").strip() == expected


# ── Bodies ───────────────────────────────────────────────────────────────────

class AsistenteBody(BaseModel):
    id: Optional[int] = None
    nombre: str = Field(..., min_length=1)
    cargo: Optional[str] = None
    entidad: Optional[str] = None
    email: Optional[str] = None
    usuario_id: Optional[int] = None
    orden: Optional[int] = None


class IdeaBody(BaseModel):
    id: Optional[int] = None
    texto: str = ""
    # Persistido como quien_dijo; "interviniente" es alias de API/UI.
    quien_dijo: Optional[str] = None
    interviniente: Optional[str] = None
    # Título institucional corto (Tema N: …), generado por Clara.
    titulo: Optional[str] = None
    orden: Optional[int] = None
    # Esquemas/gráficos ya persistidos (blob_path). Los pending se suben por /ideas/{id}/imagen.
    imagenes: Optional[List[Any]] = None


class ApartadoBody(BaseModel):
    id: Optional[int] = None
    titulo: Optional[str] = None
    contenido: Optional[str] = None
    orden: Optional[int] = None


class ActaCreateBody(BaseModel):
    fecha_reunion: str
    ubicacion: Optional[str] = None
    orden_del_dia: Optional[Any] = None  # texto legacy o checklist JSON
    elaborador_id: Optional[int] = None
    elaborador_nombre: Optional[str] = None
    tipo_acta: Optional[str] = "interna"
    asistentes: List[AsistenteBody] = Field(default_factory=list)
    ideas: List[IdeaBody] = Field(default_factory=list)
    apartados: List[ApartadoBody] = Field(default_factory=list)
    estado: Optional[str] = None
    proxima_fecha: Optional[str] = None
    proxima_hora: Optional[str] = None
    proxima_lugar: Optional[str] = None


class ActaUpdateBody(BaseModel):
    fecha_reunion: Optional[str] = None
    ubicacion: Optional[str] = None
    orden_del_dia: Optional[Any] = None
    elaborador_id: Optional[int] = None
    elaborador_nombre: Optional[str] = None
    tipo_acta: Optional[str] = None
    estado: Optional[str] = None
    asistentes: Optional[List[AsistenteBody]] = None
    ideas: Optional[List[IdeaBody]] = None
    apartados: Optional[List[ApartadoBody]] = None
    proxima_fecha: Optional[str] = None
    proxima_hora: Optional[str] = None
    proxima_lugar: Optional[str] = None


class IdeaTextoBody(BaseModel):
    texto: str = ""


class AsignadoCompromisoBody(BaseModel):
    asignado_a_id: Optional[int] = None
    asignado_a_nombre: Optional[str] = None
    asignado_externo_id: Optional[int] = None
    es_externo: Optional[bool] = None
    asignado_cargo: Optional[str] = None
    asignado_entidad: Optional[str] = None
    asignado_email: Optional[str] = None


class CompromisoCreateBody(BaseModel):
    solicitante_id: Optional[int] = None
    solicitante_nombre: Optional[str] = None
    asignado_a_id: Optional[int] = None
    asignado_a_nombre: Optional[str] = None
    asignado_externo_id: Optional[int] = None
    es_externo: Optional[bool] = None
    asignados: Optional[List[AsignadoCompromisoBody]] = None
    fecha_vencimiento: str
    hora_vencimiento: Optional[str] = None
    titulo: Optional[str] = None
    redaccion: Optional[str] = None
    descripcion: Optional[str] = None


class EstadoGestionBody(BaseModel):
    estado_gestion: str = Field(..., min_length=3)
    nueva_fecha_vencimiento: Optional[str] = None
    hora_vencimiento: Optional[str] = None


class DestinarBody(BaseModel):
    destinatario_id: int
    destinatario_nombre: Optional[str] = None
    relacion_destinatario: str = Field(..., description="asignacion | referencia")
    modo: Optional[str] = None


class AsignacionEstadoBody(BaseModel):
    estado_gestion: str = Field(..., min_length=3)
    checklist_id: Optional[str] = None


class DestinatarioTareaBody(BaseModel):
    id: Optional[int] = None
    usuario_id: Optional[int] = None
    nombre: Optional[str] = None
    asignado_a_id: Optional[int] = None
    asignado_a_nombre: Optional[str] = None


class TareaCreateBody(BaseModel):
    titulo: str = Field(..., min_length=1)
    descripcion: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    hora_vencimiento: Optional[str] = None
    estado_gestion: Optional[str] = "abierto"
    campos_libres: Optional[Dict[str, Any]] = None
    imagenes: Optional[List[Any]] = None
    asignado_a_id: Optional[int] = None
    asignado_a_nombre: Optional[str] = None
    destinatario_id: Optional[int] = None
    destinatario_ids: Optional[List[int]] = None
    destinatarios: Optional[List[DestinatarioTareaBody]] = None
    referido_a_id: Optional[int] = None
    referido_a_nombre: Optional[str] = None
    relacion_destinatario: Optional[str] = None
    contrato_id: Optional[int] = None


class TareaUpdateBody(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    hora_vencimiento: Optional[str] = None
    estado_gestion: Optional[str] = None
    campos_libres: Optional[Dict[str, Any]] = None
    imagenes: Optional[List[Any]] = None


class ImagenBase64Body(BaseModel):
    nombre: str = "imagen.png"
    data_base64: str = Field(..., min_length=8)
    mime_type: Optional[str] = "image/png"
    destino: Optional[str] = Field(
        "checklist",
        description="checklist (imagen soporte) | checklist_esquema (dibujo del sub-ítem)",
    )
    checklist_id: Optional[str] = None


class ComentarioBody(BaseModel):
    mensaje: str = Field(..., min_length=1)


class FechaCompromisoBody(BaseModel):
    fecha_vencimiento: str = Field(..., min_length=8)
    hora_vencimiento: Optional[str] = None


class JustificacionBody(BaseModel):
    motivo: str = Field(..., min_length=5)
    nueva_fecha_vencimiento: str


class RevisarJustificacionBody(BaseModel):
    aprobar: bool
    comentario: Optional[str] = None


class RedaccionClaraBody(BaseModel):
    texto: str = ""
    instruccion: Optional[str] = None
    historial: Optional[List[Dict[str, str]]] = None
    # "redaccion" (default) | "compromiso" | "titulo_tema" (título corto institucional)
    modo: Optional[str] = "redaccion"


class FirmaBody(BaseModel):
    asistente_id: int


# ── Bandeja (sin contrato obligatorio — tareas personales) ───────────────────

@router.get("/bandeja")
def route_bandeja(
    estado: Optional[str] = Query(None),
    responsable_id: Optional[int] = Query(None),
    contrato_id: Optional[int] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    origen: Optional[str] = Query(None),
    incluir_cerrados: bool = Query(False),
    q: Optional[str] = Query(None, description="Buscador de palabras clave"),
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "ver")
    if contrato_id is not None:
        _check_contrato(current_user, contrato_id)
    return list_bandeja(
        supabase,
        _uid(current_user),
        current_user,
        estado=estado,
        responsable_id=responsable_id,
        contrato_id=contrato_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        origen=origen,
        incluir_cerrados=incluir_cerrados,
        q=q,
    )


@router.get("/bandeja/widget")
def route_bandeja_widget(
    contrato_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    """Misma bandeja recortada para el widget de inicio (siempre filtrada por contrato)."""
    if not tiene_permiso_seguimiento(current_user, "ver"):
        return []
    if contrato_id is None:
        return []
    try:
        _check_contrato(current_user, contrato_id)
    except HTTPException:
        return []
    rows = list_bandeja(
        supabase,
        _uid(current_user),
        current_user,
        contrato_id=contrato_id,
        estado=None,
    )
    abiertos = [r for r in rows if r.get("estado_gestion") in ("abierto", "en_progreso", "parcial", "vencido", "reprogramado")]
    return abiertos[:20]


@router.get("/items/{item_id}")
def route_get_item(item_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "ver")
    try:
        return get_item_detalle(
            supabase,
            item_id,
            user_id=_uid(current_user),
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/items/{item_id}/estado")
def route_estado_item(item_id: int, body: EstadoGestionBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "editar")
    try:
        return actualizar_estado_gestion(
            supabase,
            item_id,
            body.estado_gestion,
            _uid(current_user),
            nueva_fecha_vencimiento=body.nueva_fecha_vencimiento,
            hora_vencimiento=body.hora_vencimiento,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/items/{item_id}/asignacion-estado")
def route_asignacion_estado(item_id: int, body: AsignacionEstadoBody, current_user=Depends(get_current_user)):
    """Cumplido / estado individual de un destinatario (tarea o sub-ítem)."""
    require_permiso_seguimiento(current_user, "editar")
    try:
        return actualizar_estado_asignado(
            supabase,
            item_id,
            _uid(current_user),
            body.estado_gestion,
            checklist_id=body.checklist_id,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/items/{item_id}/destinar")
def route_destinar_item(item_id: int, body: DestinarBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "editar")
    try:
        row = destinar_item(
            supabase,
            item_id,
            _uid(current_user),
            current_user,
            body.model_dump(),
        )
        registrar_log(current_user, "EDITAR", "SEGUIMIENTO", "seguimiento_item_destinar", str(item_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/items/{item_id}")
def route_eliminar_item(item_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "eliminar")
    try:
        row = eliminar_item(supabase, item_id, current_user)
        registrar_log(current_user, "ELIMINAR", "SEGUIMIENTO", "seguimiento_item", str(item_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/items/{item_id}/comentarios")
def route_comentario(item_id: int, body: ComentarioBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "ver")
    try:
        return agregar_comentario(
            supabase, item_id, body.mensaje, _uid(current_user), current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/items/{item_id}/fecha-compromiso")
def route_fecha_compromiso(
    item_id: int, body: FechaCompromisoBody, current_user=Depends(get_current_user)
):
    """Corrige fecha/hora de un compromiso de acta (solo elaborador)."""
    require_permiso_seguimiento(current_user, "editar")
    try:
        row = actualizar_fecha_compromiso(
            supabase,
            item_id,
            _uid(current_user),
            fecha_vencimiento=body.fecha_vencimiento,
            hora_vencimiento=body.hora_vencimiento,
            current_user=current_user,
        )
        registrar_log(current_user, "EDITAR", "SEGUIMIENTO", "seguimiento_compromiso_fecha", str(item_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/items/{item_id}/evidencia")
async def route_evidencia(
    item_id: int,
    archivo: UploadFile = File(...),
    notas: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "editar")
    content = await archivo.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    try:
        return cargar_evidencia(
            supabase,
            item_id,
            _uid(current_user),
            nombre_archivo=archivo.filename or "evidencia.bin",
            content=content,
            mime_type=archivo.content_type or "application/octet-stream",
            notas=notas,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/items/{item_id}/justificacion")
def route_solicitar_justificacion(
    item_id: int, body: JustificacionBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "editar")
    try:
        return solicitar_justificacion(
            supabase,
            item_id,
            _uid(current_user),
            body.motivo,
            body.nueva_fecha_vencimiento,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/justificaciones/{justificacion_id}/revisar")
def route_revisar_justificacion(
    justificacion_id: int, body: RevisarJustificacionBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "validar")
    try:
        return revisar_justificacion(
            supabase,
            justificacion_id,
            _uid(current_user),
            body.aprobar,
            body.comentario,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


# ── Tareas ───────────────────────────────────────────────────────────────────

@router.post("/tareas")
def route_crear_tarea(body: TareaCreateBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "crear")
    payload = body.model_dump()
    cid = payload.get("contrato_id")
    if cid is not None:
        _check_contrato(current_user, int(cid))
    try:
        row = crear_tarea(supabase, payload, _uid(current_user))
        registrar_log(current_user, "CREAR", "SEGUIMIENTO", "seguimiento_tarea", str(row["id"]), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/tareas/{item_id}")
def route_update_tarea(item_id: int, body: TareaUpdateBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "editar")
    try:
        return update_tarea(
            supabase,
            item_id,
            body.model_dump(exclude_unset=True),
            _uid(current_user),
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/tareas/{item_id}/imagen")
def route_tarea_imagen(item_id: int, body: ImagenBase64Body, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "editar")
    try:
        return adjuntar_imagen_tarea_base64(
            supabase,
            item_id,
            _uid(current_user),
            body.nombre,
            body.data_base64,
            body.mime_type or "image/png",
            destino=body.destino or "checklist",
            checklist_id=body.checklist_id,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/ideas/{idea_id}/imagen")
def route_idea_imagen(
    contrato_id: int,
    idea_id: int,
    body: ImagenBase64Body,
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        return adjuntar_imagen_idea_base64(
            supabase,
            contrato_id,
            idea_id,
            _uid(current_user),
            body.nombre,
            body.data_base64,
            body.mime_type or "image/png",
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


# ── Clara redacción ──────────────────────────────────────────────────────────

@router.post("/redaccion-clara")
async def route_redaccion_clara(body: RedaccionClaraBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "editar")
    modo = (body.modo or "redaccion").strip().lower()
    if modo in ("redaccion", "compromiso") and not (body.instruccion or "").strip():
        raise HTTPException(status_code=422, detail="instruccion es requerida para modo redaccion/compromiso")
    try:
        return await redaccion_asistida_clara(
            supabase,
            str(_uid(current_user)),
            body.texto,
            body.instruccion or "",
            body.historial,
            modo=modo,
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.exception("redaccion-clara: %s", exc)
        raise HTTPException(status_code=502, detail="Clara no está disponible en este momento.") from exc


# ── Cron vencimientos ──────────────────────────────────────────────────────

@router.post("/internal/cron/vencimientos")
def route_cron_vencimientos(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    if not _cron_secret_ok(x_cron_secret):
        raise HTTPException(status_code=401, detail="Cron secret inválido")
    return procesar_vencimientos_y_llamados(supabase)

# ── Actas ────────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/usuarios")
def route_usuarios_contrato(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return list_usuarios_contrato_enriquecidos(supabase, contrato_id)


@router.get("/{contrato_id}/actas")
def route_list_actas(
    contrato_id: int,
    estado: Optional[str] = Query(None),
    tipo_acta: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Buscador de palabras clave sobre contenido del acta"),
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return list_actas(
        supabase,
        contrato_id,
        estado=estado,
        tipo_acta=tipo_acta,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        q=q,
        user_id=_uid(current_user),
        current_user=current_user,
    )


@router.get("/{contrato_id}/actas/proximo-consecutivo")
def route_proximo_consecutivo(contrato_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return {"consecutivo": proximo_consecutivo(supabase, contrato_id)}


@router.get("/{contrato_id}/compromisos-abiertos")
def route_compromisos_abiertos(
    contrato_id: int,
    excluir_acta_id: Optional[int] = Query(None),
    tipo_acta: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return compromisos_abiertos_contrato(
        supabase,
        contrato_id,
        excluir_acta_id=excluir_acta_id,
        tipo_acta=tipo_acta,
    )


@router.post("/{contrato_id}/actas")
def route_create_acta(contrato_id: int, body: ActaCreateBody, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        row = create_acta(supabase, contrato_id, body.model_dump(), _uid(current_user))
        registrar_log(current_user, "CREAR", "SEGUIMIENTO", "seguimiento_acta", str(row["id"]), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/actas/{acta_id}")
def route_get_acta(contrato_id: int, acta_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    try:
        acta = get_acta(supabase, acta_id, contrato_id)
        assert_puede_ver_acta(supabase, acta, _uid(current_user), current_user)
        acta["puede_abrir"] = True
        acta["acceso_restringido"] = False
        return acta
    except ActaAccesoDenegado as exc:
        raise _http_acta_acceso(exc) from exc
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/actas/{acta_id}")
def route_update_acta(
    contrato_id: int, acta_id: int, body: ActaUpdateBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        row = update_acta(
            supabase,
            contrato_id,
            acta_id,
            body.model_dump(exclude_unset=True),
            _uid(current_user),
            current_user=current_user,
        )
        registrar_log(current_user, "EDITAR", "SEGUIMIENTO", "seguimiento_acta", str(acta_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/actas/{acta_id}/revertir")
def route_revertir_acta(contrato_id: int, acta_id: int, current_user=Depends(get_current_user)):
    """Desarrollador: desella el acta (realizada/firmada → borrador)."""
    require_permiso_seguimiento(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        row = revertir_acta_a_borrador(supabase, contrato_id, acta_id, current_user)
        registrar_log(current_user, "EDITAR", "SEGUIMIENTO", "seguimiento_acta_revertir", str(acta_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/actas/{acta_id}/ideas")
def route_add_idea(
    contrato_id: int, acta_id: int, body: IdeaTextoBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        return add_idea(
            supabase, contrato_id, acta_id, body.texto,
            user_id=_uid(current_user), current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/ideas/{idea_id}")
def route_update_idea(
    contrato_id: int, idea_id: int, body: IdeaTextoBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        return update_idea(
            supabase, contrato_id, idea_id, body.texto,
            user_id=_uid(current_user), current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/actas/{acta_id}/ideas/{idea_id}/compromiso")
def route_crear_compromiso(
    contrato_id: int,
    acta_id: int,
    idea_id: int,
    body: CompromisoCreateBody,
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        row = crear_compromiso_desde_idea(
            supabase,
            contrato_id,
            acta_id,
            idea_id,
            body.model_dump(),
            _uid(current_user),
            current_user=current_user,
        )
        log_id = str(row.get("id") or (row.get("items") or [{}])[0].get("id") or idea_id)
        registrar_log(current_user, "CREAR", "SEGUIMIENTO", "seguimiento_compromiso", log_id, {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/actas/{acta_id}/compromisos")
def route_crear_compromiso_libre(
    contrato_id: int,
    acta_id: int,
    body: CompromisoCreateBody,
    current_user=Depends(get_current_user),
):
    """Compromiso puntual del acta sin ligarlo a una idea/tema completo."""
    require_permiso_seguimiento(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        row = crear_compromiso_libre(
            supabase,
            contrato_id,
            acta_id,
            body.model_dump(),
            _uid(current_user),
            current_user=current_user,
        )
        log_id = str(row.get("id") or (row.get("items") or [{}])[0].get("id") or acta_id)
        registrar_log(current_user, "CREAR", "SEGUIMIENTO", "seguimiento_compromiso", log_id, {"libre": True})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/actas/{acta_id}")
def route_eliminar_acta(contrato_id: int, acta_id: int, current_user=Depends(get_current_user)):
    require_permiso_seguimiento(current_user, "eliminar")
    _check_contrato(current_user, contrato_id)
    try:
        row = eliminar_acta(supabase, contrato_id, acta_id, current_user)
        registrar_log(current_user, "ELIMINAR", "SEGUIMIENTO", "seguimiento_acta", str(acta_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/actas/{acta_id}/pdf")
def route_pdf_acta(
    contrato_id: int,
    acta_id: int,
    force: bool = Query(False, description="Ignorar caché Blob y regenerar el PDF"),
    current_user=Depends(get_current_user),
):
    require_permiso_seguimiento(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    try:
        pdf = generar_preview_pdf_acta(
            supabase,
            contrato_id,
            acta_id,
            force=force,
            user_id=_uid(current_user),
            current_user=current_user,
        )
    except ActaAccesoDenegado as exc:
        raise _http_acta_acceso(exc) from exc
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except Exception as exc:
        _log.exception("pdf acta %s: %s", acta_id, exc)
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    if not pdf:
        raise HTTPException(status_code=500, detail="El PDF generado está vacío")
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="acta_seguimiento_{acta_id}.pdf"',
            # Evita que el navegador/CDN reutilice un PDF generado con plantilla anterior.
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.post("/{contrato_id}/actas/{acta_id}/firmar")
def route_firmar_acta(
    contrato_id: int, acta_id: int, body: FirmaBody, current_user=Depends(get_current_user)
):
    require_permiso_seguimiento(current_user, "validar")
    _check_contrato(current_user, contrato_id)
    try:
        row = registrar_firma_asistente(supabase, contrato_id, acta_id, body.asistente_id, _uid(current_user))
        registrar_log(current_user, "FIRMAR", "SEGUIMIENTO", "seguimiento_acta", str(acta_id), {})
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


# ── Bitácora de Obra ──────────────────────────────────────────────────────────

from bitacora_permissions import require_permiso_bitacora  # noqa: E402
from bitacora_service import (  # noqa: E402
    adjuntar_imagen_entrada,
    cerrar_diarios_vencidos,
    cerrar_reporte_diario,
    crear_reporte_diario,
    crear_reporte_evento,
    eliminar_entrada,
    get_diario_por_fecha,
    get_entrada,
    list_entradas,
    list_equipos,
    list_galeria,
    revertir_cierre_diario,
    update_entrada,
    upsert_equipo,
)


class BitacoraDiarioBody(BaseModel):
    fecha: Optional[str] = None
    hora_inicio_labores: Optional[str] = None
    clima_codigo: Optional[int] = None
    clima_temp_c: Optional[float] = None
    clima_descripcion: Optional[str] = None
    clima_editado_manual: Optional[bool] = False
    personal: Optional[List[Dict[str, Any]]] = None
    equipos_uso: Optional[List[Dict[str, Any]]] = None
    cuerpo_html: Optional[str] = None


class BitacoraEventoBody(BaseModel):
    fecha: Optional[str] = None
    evento_tipo: str = Field(..., min_length=1)
    evento_detalle: Optional[Dict[str, Any]] = None
    cuerpo_html: Optional[str] = None
    imagenes: Optional[List[Dict[str, Any]]] = None


class BitacoraUpdateBody(BaseModel):
    hora_inicio_labores: Optional[str] = None
    clima_codigo: Optional[int] = None
    clima_temp_c: Optional[float] = None
    clima_descripcion: Optional[str] = None
    clima_editado_manual: Optional[bool] = None
    personal: Optional[List[Dict[str, Any]]] = None
    equipos_uso: Optional[List[Dict[str, Any]]] = None
    cuerpo_html: Optional[str] = None
    evento_tipo: Optional[str] = None
    evento_detalle: Optional[Dict[str, Any]] = None
    imagenes: Optional[List[Dict[str, Any]]] = None


class BitacoraEquipoBody(BaseModel):
    nombre: str = Field(..., min_length=1)
    tipo: Optional[str] = "equipo"


class BitacoraImagenBody(BaseModel):
    nombre: Optional[str] = "foto.png"
    data_base64: str = Field(..., min_length=1)
    mime_type: Optional[str] = "image/png"
    origen: Optional[str] = "archivo"


@router.get("/{contrato_id}/bitacora")
def route_list_bitacora(
    contrato_id: int,
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    try:
        return list_entradas(
            supabase,
            contrato_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            tipo=tipo,
            q=q,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/bitacora/diario")
def route_get_diario_fecha(
    contrato_id: int,
    fecha: str = Query(..., min_length=8),
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    try:
        row = get_diario_por_fecha(supabase, contrato_id, fecha)
        return row or {}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/bitacora/equipos")
def route_list_bitacora_equipos(
    contrato_id: int,
    q: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return list_equipos(supabase, contrato_id, q or "")


@router.post("/{contrato_id}/bitacora/equipos")
def route_upsert_bitacora_equipo(
    contrato_id: int,
    body: BitacoraEquipoBody,
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        return upsert_equipo(
            supabase,
            contrato_id,
            body.nombre,
            tipo=body.tipo or "equipo",
            user_id=_uid(current_user),
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/bitacora/galeria")
def route_bitacora_galeria(
    contrato_id: int,
    q: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    return list_galeria(supabase, contrato_id, q or "")


@router.post("/{contrato_id}/bitacora/diario")
def route_crear_diario(
    contrato_id: int,
    body: BitacoraDiarioBody,
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        row = crear_reporte_diario(
            supabase,
            contrato_id,
            body.model_dump(exclude_unset=True),
            _uid(current_user),
            current_user=current_user,
        )
        registrar_log(
            current_user, "CREAR", "BITACORA", "seguimiento_bitacora_entrada",
            str(row.get("id")), {"tipo": "diario", "fecha": row.get("fecha")},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/bitacora/evento")
def route_crear_evento(
    contrato_id: int,
    body: BitacoraEventoBody,
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "crear")
    _check_contrato(current_user, contrato_id)
    try:
        row = crear_reporte_evento(
            supabase,
            contrato_id,
            body.model_dump(exclude_unset=True),
            _uid(current_user),
            current_user=current_user,
        )
        registrar_log(
            current_user, "CREAR", "BITACORA", "seguimiento_bitacora_entrada",
            str(row.get("id")), {"tipo": "evento", "evento_tipo": row.get("evento_tipo")},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/bitacora/{entrada_id}")
def route_get_bitacora_entrada(
    contrato_id: int, entrada_id: int, current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "ver")
    _check_contrato(current_user, contrato_id)
    try:
        return get_entrada(supabase, contrato_id, entrada_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/bitacora/{entrada_id}")
def route_update_bitacora(
    contrato_id: int,
    entrada_id: int,
    body: BitacoraUpdateBody,
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        row = update_entrada(
            supabase,
            contrato_id,
            entrada_id,
            body.model_dump(exclude_unset=True),
            _uid(current_user),
            current_user=current_user,
        )
        registrar_log(
            current_user, "EDITAR", "BITACORA", "seguimiento_bitacora_entrada",
            str(entrada_id), {},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/bitacora/{entrada_id}/cerrar")
def route_cerrar_diario(
    contrato_id: int, entrada_id: int, current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        row = cerrar_reporte_diario(
            supabase, contrato_id, entrada_id, _uid(current_user), current_user=current_user,
        )
        registrar_log(
            current_user, "CERRAR", "BITACORA", "seguimiento_bitacora_entrada",
            str(entrada_id), {"motivo": "manual"},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/bitacora/{entrada_id}/revertir")
def route_revertir_diario(
    contrato_id: int, entrada_id: int, current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        row = revertir_cierre_diario(
            supabase, contrato_id, entrada_id, _uid(current_user), current_user=current_user,
        )
        registrar_log(
            current_user, "REVERTIR", "BITACORA", "seguimiento_bitacora_entrada",
            str(entrada_id), {},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/bitacora/{entrada_id}")
def route_eliminar_bitacora(
    contrato_id: int, entrada_id: int, current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "eliminar")
    _check_contrato(current_user, contrato_id)
    try:
        eliminar_entrada(supabase, contrato_id, entrada_id, current_user=current_user)
        registrar_log(
            current_user, "ELIMINAR", "BITACORA", "seguimiento_bitacora_entrada",
            str(entrada_id), {},
        )
        return {"ok": True}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/bitacora/{entrada_id}/imagen")
def route_bitacora_imagen(
    contrato_id: int,
    entrada_id: int,
    body: BitacoraImagenBody,
    current_user=Depends(get_current_user),
):
    require_permiso_bitacora(current_user, "editar")
    _check_contrato(current_user, contrato_id)
    try:
        return adjuntar_imagen_entrada(
            supabase,
            contrato_id,
            entrada_id,
            _uid(current_user),
            body.nombre or "foto.png",
            body.data_base64,
            body.mime_type or "image/png",
            origen=body.origen or "archivo",
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/internal/cron/bitacora-autocierre")
def route_cron_bitacora_autocierre(
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
    contrato_id: Optional[int] = Query(None),
):
    if not _cron_secret_ok(x_cron_secret):
        raise HTTPException(status_code=403, detail="Cron secret inválido")
    return cerrar_diarios_vencidos(supabase, contrato_id)
