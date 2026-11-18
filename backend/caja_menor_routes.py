"""
Rutas HTTP — Caja Menor.
Prefijo: /caja-menor/{contrato_id}

Módulo independiente de Contabilidad.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from caja_menor_ocr import analyze_recibo_bytes
from caja_menor_service import DuplicadoCajaMenor, mensaje_falla_datos
from main import _require_contract_access, get_current_user

_log = logging.getLogger("claracore.caja_menor.routes")

router = APIRouter(prefix="/caja-menor", tags=["caja-menor"])


def _contrato(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, int(contrato_id))


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, DuplicadoCajaMenor):
        return HTTPException(
            status_code=409,
            detail={"alerta_duplicado": True, "mensaje": str(exc)},
        )
    if isinstance(exc, ValueError):
        msg = str(exc).strip() or "No se pudo completar la operación."
        code = 404 if "no encontrad" in msg.lower() else 400
        return HTTPException(status_code=code, detail=msg)
    _log.exception("caja menor: %s", exc)
    return HTTPException(status_code=400, detail=mensaje_falla_datos(exc))


def _svc():
    import caja_menor_service as svc

    return svc


async def _file(upload: Optional[UploadFile]):
    if upload is None:
        return None
    data = await upload.read()
    if not data:
        return None
    return data, upload.content_type, upload.filename


class CajaBody(BaseModel):
    responsable_id: int


class MetaBody(BaseModel):
    observaciones: Optional[str] = None
    control: Optional[str] = None
    firma_elaboro: Optional[str] = None
    firma_reviso: Optional[str] = None
    firma_aprobo: Optional[str] = None


class ValidarBody(BaseModel):
    decision: str = Field(..., max_length=20)
    observacion: Optional[str] = ""


@router.get("/{contrato_id}/cajas")
def listar(contrato_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().listar_cajas(supabase, current_user, contrato_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/responsables")
def responsables(contrato_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().listar_responsables(supabase, current_user, contrato_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/terceros")
def terceros(contrato_id: int, documento: str = "", current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().buscar_tercero(supabase, current_user, contrato_id, documento)
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/cajas/{caja_id}")
def detalle(contrato_id: int, caja_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().obtener_caja(supabase, current_user, contrato_id, caja_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/cajas")
def crear(contrato_id: int, body: CajaBody, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().crear_caja(supabase, current_user, contrato_id, body.responsable_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/{contrato_id}/cajas/{caja_id}")
def meta(contrato_id: int, caja_id: int, body: MetaBody, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        campos = body.model_dump(exclude_unset=True)
        return _svc().actualizar_caja(supabase, current_user, contrato_id, caja_id, campos)
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/cajas/{caja_id}/cierre")
def cierre(contrato_id: int, caja_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().solicitar_cierre(supabase, current_user, contrato_id, caja_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/{contrato_id}/cajas/{caja_id}")
def eliminar(contrato_id: int, caja_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().eliminar_caja(supabase, current_user, contrato_id, caja_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/cajas/{caja_id}/ingresos")
async def crear_ingreso(
    contrato_id: int,
    caja_id: int,
    fecha: str = Form(...),
    valor: str = Form(...),
    soporte: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().crear_ingreso(
            supabase, current_user, contrato_id, caja_id, fecha, valor, await _file(soporte),
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/{contrato_id}/cajas/{caja_id}/ingresos/{ingreso_id}")
def eliminar_ingreso(
    contrato_id: int, caja_id: int, ingreso_id: int, current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().eliminar_ingreso(supabase, current_user, contrato_id, caja_id, ingreso_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/ocr")
async def ocr(
    contrato_id: int,
    soporte: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from caja_menor_permissions import require_permiso_caja_menor

        require_permiso_caja_menor(current_user, "crear", contrato_id)
        archivo = await _file(soporte)
        if not archivo:
            raise ValueError("Falta la imagen del soporte.")
        data, mime, _nombre = archivo
        return analyze_recibo_bytes(data, mime or "image/jpeg")
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/cajas/{caja_id}/gastos")
async def crear_gasto(
    contrato_id: int,
    caja_id: int,
    fecha: str = Form(...),
    tercero_razon_social: str = Form(...),
    tercero_documento: str = Form(...),
    descripcion: str = Form(...),
    documento_no: str = Form(""),
    centro_costos: str = Form(""),
    valor_bruto: str = Form(...),
    iva: str = Form("0"),
    retenciones: str = Form("0"),
    impuesto_consumo: str = Form("0"),
    otros_deducibles: str = Form("0"),
    observaciones: str = Form(""),
    confirmar_duplicado: str = Form("0"),
    soporte: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        campos = {
            "fecha": fecha,
            "tercero_razon_social": tercero_razon_social,
            "tercero_documento": tercero_documento,
            "descripcion": descripcion,
            "documento_no": documento_no,
            "centro_costos": centro_costos,
            "valor_bruto": valor_bruto,
            "iva": iva,
            "retenciones": retenciones,
            "impuesto_consumo": impuesto_consumo,
            "otros_deducibles": otros_deducibles,
            "observaciones": observaciones,
        }
        return _svc().crear_gasto(
            supabase,
            current_user,
            contrato_id,
            caja_id,
            campos,
            await _file(soporte),
            confirmar_duplicado=str(confirmar_duplicado).lower() in ("1", "true", "si", "sí"),
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/{contrato_id}/cajas/{caja_id}/gastos/{gasto_id}")
async def editar_gasto(
    contrato_id: int,
    caja_id: int,
    gasto_id: int,
    fecha: Optional[str] = Form(None),
    tercero_razon_social: Optional[str] = Form(None),
    tercero_documento: Optional[str] = Form(None),
    descripcion: Optional[str] = Form(None),
    documento_no: Optional[str] = Form(None),
    centro_costos: Optional[str] = Form(None),
    valor_bruto: Optional[str] = Form(None),
    iva: Optional[str] = Form(None),
    retenciones: Optional[str] = Form(None),
    impuesto_consumo: Optional[str] = Form(None),
    otros_deducibles: Optional[str] = Form(None),
    observaciones: Optional[str] = Form(None),
    confirmar_duplicado: str = Form("0"),
    soporte: Optional[UploadFile] = File(None),
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        campos = {
            k: v for k, v in {
                "fecha": fecha,
                "tercero_razon_social": tercero_razon_social,
                "tercero_documento": tercero_documento,
                "descripcion": descripcion,
                "documento_no": documento_no,
                "centro_costos": centro_costos,
                "valor_bruto": valor_bruto,
                "iva": iva,
                "retenciones": retenciones,
                "impuesto_consumo": impuesto_consumo,
                "otros_deducibles": otros_deducibles,
                "observaciones": observaciones,
            }.items() if v is not None
        }
        return _svc().actualizar_gasto(
            supabase,
            current_user,
            contrato_id,
            caja_id,
            gasto_id,
            campos,
            await _file(soporte),
            confirmar_duplicado=str(confirmar_duplicado).lower() in ("1", "true", "si", "sí"),
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/{contrato_id}/cajas/{caja_id}/gastos/{gasto_id}")
def eliminar_gasto(
    contrato_id: int, caja_id: int, gasto_id: int, current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().eliminar_gasto(supabase, current_user, contrato_id, caja_id, gasto_id)
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/{contrato_id}/cajas/{caja_id}/gastos/{gasto_id}/validar")
def validar(
    contrato_id: int,
    caja_id: int,
    gasto_id: int,
    body: ValidarBody,
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        return _svc().validar_gasto(
            supabase,
            current_user,
            contrato_id,
            caja_id,
            gasto_id,
            body.decision,
            body.observacion or "",
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/cajas/{caja_id}/export.xlsx")
def excel(contrato_id: int, caja_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        data, nombre = _svc().exportar_excel(supabase, current_user, contrato_id, caja_id)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/cajas/{caja_id}/recibos.pdf")
def pdf(contrato_id: int, caja_id: int, current_user=Depends(get_current_user)):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        data, nombre = _svc().exportar_pdf(supabase, current_user, contrato_id, caja_id)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/{contrato_id}/cajas/{caja_id}/soportes/{kind}/{item_id}")
def soporte(
    contrato_id: int,
    caja_id: int,
    kind: str,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _contrato(current_user, contrato_id)
    try:
        from main import supabase

        data, mime, nombre = _svc().leer_soporte(
            supabase, current_user, contrato_id, caja_id, kind, item_id,
        )
        return Response(
            content=data,
            media_type=mime,
            headers={"Content-Disposition": f'inline; filename="{nombre}"'},
        )
    except Exception as exc:
        raise _http(exc) from exc
