"""
Rutas experimentales: SST documental, Ensayos PIP, integración nube (Drive/OneDrive), Auditor IA.
Importado desde main.py (evita inflar main.py).
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from supabase import create_client

from main import _require_contract_access, get_current_user

_log = logging.getLogger("uvicorn.error")

_sb = create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", ""))

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

router = APIRouter(tags=["experimentales-sst-ensayos"])

# Mensaje si PostgREST no ve tablas SST (migración no aplicada o caché sin refrescar).
_MSG_TABLAS_SST = (
    "Las tablas del módulo SST/Auditor no están en tu base de datos (o PostgREST aún no las ve). "
    "En Supabase: SQL Editor → abre y ejecuta el archivo backend/sql/modulos_sst_ensayos_nube_auditor.sql. "
    "Luego espera unos segundos o ejecuta: NOTIFY pgrst, 'reload schema';"
)


def _rethrow_if_supabase_missing_table(exc: BaseException) -> None:
    s = str(exc)
    low = s.lower()
    if "pgrst205" in low or ("could not find the table" in low and "sst_" in s):
        raise HTTPException(status_code=503, detail=_MSG_TABLAS_SST) from exc


def _uid(user: dict) -> int:
    try:
        return int(str(user.get("sub") or user.get("id") or "0"))
    except (TypeError, ValueError):
        return 0


def _cargo_norm(user: dict) -> str:
    return (user.get("cargo_nombre") or "").strip().lower()


def _cargar_permisos_por_sub(uid: int) -> List[dict]:
    if not uid:
        return []
    try:
        urows = (_sb.table("usuarios").select("cargo_id, subcontratista_id").eq("id", uid).limit(1).execute().data or [])
    except Exception as e:
        _log.debug("exp perms usuario: %s", e)
        return []
    if not urows:
        return []
    urow = urows[0]
    cargo_id = urow.get("cargo_id")
    if not cargo_id:
        return []
    cargo_nombre = ""
    try:
        c = _sb.table("cargos").select("nombre").eq("id", int(cargo_id)).limit(1).execute().data
        if c:
            cargo_nombre = (c[0].get("nombre") or "").strip().lower()
    except Exception:
        pass
    if cargo_nombre == "subcontratista" and not urow.get("subcontratista_id"):
        return []
    try:
        permisos_raw = _sb.table("permisos").select("*").eq("cargo_id", cargo_id).execute().data or []
        funciones_rows = _sb.table("funciones").select("id, nombre").execute().data or []
    except Exception as e:
        _log.debug("exp perms matriz: %s", e)
        return []
    fmap = {f["id"]: f["nombre"] for f in funciones_rows}
    out = [{**p, "funcion_nombre": fmap.get(p.get("funcion_id"), "")} for p in permisos_raw]
    if cargo_nombre == "desarrollador":
        out = [{**p, "exportar": True, "ver": True} for p in (out or [])]
    return out or []


def _perms_resolve(user: dict) -> List[dict]:
    pl = user.get("permisos")
    if isinstance(pl, list) and len(pl) > 0:
        return pl
    uid = _uid(user)
    if uid:
        user = {**user, "permisos": _cargar_permisos_por_sub(uid)}
    return user.get("permisos") or []


def _perm_funcion(user: dict, nombre: str, accion: str) -> bool:
    # Solo Desarrollador tiene bypass; Administrador debe tener la función marcada en Control de accesos.
    if _cargo_norm(user) == "desarrollador":
        return True
    n = nombre.strip().lower()
    for p in _perms_resolve(user):
        if (p.get("funcion_nombre") or "").strip().lower() != n:
            continue
        if accion == "ver" and p.get("ver"):
            return True
        if accion == "crear" and p.get("crear"):
            return True
        if accion == "editar" and p.get("editar"):
            return True
        if accion == "validar" and p.get("validar"):
            return True
    return False


def _require_perm(user: dict, nombre: str, accion: str):
    if not _perm_funcion(user, nombre, accion):
        raise HTTPException(403, f"Sin permiso ({nombre} · {accion})")


def _contrato_nombre_carpeta(contrato_id: int) -> str:
    r = _sb.table("contratos").select("numero, objeto").eq("id", contrato_id).limit(1).execute().data
    if not r:
        raise HTTPException(404, "Contrato no encontrado")
    num = (r[0].get("numero") or f"contrato-{contrato_id}") or f"contrato-{contrato_id}"
    return re.sub(r'[\\\\/:*?"<>|]+', "-", str(num).strip())[:180]


def _drive_mkdir(name: str, parent_id: str, access_token: str) -> str:
    body: Dict[str, Any] = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "id"},
            json=body,
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Google Drive: {r.status_code} {r.text[:400]}")
        return r.json().get("id") or ""


def _drive_upload(name: str, parent_id: str, content: bytes, mime: str, access_token: str) -> dict:
    boundary = f"batch_{uuid.uuid4().hex}"
    meta = json.dumps({"name": name, "parents": [parent_id]})
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{meta}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    with httpx.Client(timeout=120.0) as client:
        r = client.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "multipart", "fields": "id,webViewLink,mimeType"},
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": f"multipart/related; boundary={boundary}"},
            content=body,
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Google subida: {r.status_code} {r.text[:400]}")
        return r.json()


def _google_refresh_token(refresh_token: str) -> dict:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el servidor")
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Google token: {r.text[:300]}")
        return r.json()


def _graph_mkdir(name: str, parent_id: Optional[str], access_token: str) -> str:
    url = "https://graph.microsoft.com/v1.0/me/drive/root/children"
    if parent_id:
        url = f"https://graph.microsoft.com/v1.0/me/drive/items/{parent_id}/children"
    body = {"name": name, "folder": {}, "@microsoft.graph.conflictBehavior": "rename"}
    with httpx.Client(timeout=60.0) as client:
        r = client.post(url, headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}, json=body)
        if r.status_code >= 400:
            raise HTTPException(502, f"OneDrive carpeta: {r.status_code} {r.text[:400]}")
        return (r.json() or {}).get("id") or ""


def _graph_upload_small(name: str, parent_id: str, content: bytes, access_token: str) -> dict:
    url = f"https://graph.microsoft.com/v1.0/me/drive/items/{parent_id}:/{name}:/content"
    with httpx.Client(timeout=120.0) as client:
        r = client.put(url, headers={"Authorization": f"Bearer {access_token}"}, content=content)
        if r.status_code >= 400:
            raise HTTPException(502, f"OneDrive archivo: {r.status_code} {r.text[:400]}")
        return r.json()


def _get_integracion(contrato_id: int) -> Optional[dict]:
    rows = (
        _sb.table("integraciones_nube")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _ensure_access_token(integ: dict) -> str:
    prov = (integ.get("proveedor") or "").lower()
    tok = integ.get("access_token") or ""
    exp = integ.get("token_expiry")
    needs = False
    if exp:
        try:
            if isinstance(exp, str):
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            else:
                exp_dt = exp
            needs = datetime.now(timezone.utc) >= exp_dt - timedelta(minutes=2)
        except Exception:
            needs = True
    else:
        needs = not tok
    if not needs and tok:
        return tok
    refresh = integ.get("refresh_token") or ""
    if prov == "google" and refresh:
        data = _google_refresh_token(refresh)
        new_tok = data.get("access_token") or ""
        exp_in = int(data.get("expires_in") or 3600)
        new_exp = (datetime.now(timezone.utc) + timedelta(seconds=exp_in - 60)).isoformat()
        _sb.table("integraciones_nube").update({"access_token": new_tok, "token_expiry": new_exp}).eq("id", integ["id"]).execute()
        return new_tok
    raise HTTPException(400, "Token de nube expirado o inválido; reconecta la integración.")


# ── Nube ─────────────────────────────────────────────────────────────────────


class NubeConectarBody(BaseModel):
    proveedor: str = Field(..., description="google | onedrive")
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None


@router.get("/nube/{contrato_id}/estado")
def nube_estado(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "integración nube claracore", "ver")
    row = _get_integracion(contrato_id)
    if not row:
        return {"conectado": False, "proveedor": None, "carpetas": None}
    return {
        "conectado": True,
        "proveedor": row.get("proveedor"),
        "carpetas": {
            "folder_id_raiz": row.get("folder_id_raiz"),
            "folder_id_sst": row.get("folder_id_sst"),
            "folder_id_sst_personal_contratista": row.get("folder_id_sst_personal_contratista"),
            "folder_id_sst_personal_subcontratista": row.get("folder_id_sst_personal_subcontratista"),
            "folder_id_sst_maquinaria_contratista": row.get("folder_id_sst_maquinaria_contratista"),
            "folder_id_sst_maquinaria_subcontratista": row.get("folder_id_sst_maquinaria_subcontratista"),
            "folder_id_ensayos": row.get("folder_id_ensayos"),
        },
    }


@router.post("/nube/{contrato_id}/conectar-google")
def nube_conectar_google(contrato_id: int, body: NubeConectarBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "integración nube claracore", "editar")
    if body.proveedor.lower() != "google":
        raise HTTPException(422, "use proveedor google")
    access = body.access_token
    cn = _contrato_nombre_carpeta(contrato_id)
    root = _drive_mkdir("ClaraCore", "", access)
    cfolder = _drive_mkdir(cn, root, access)
    sst = _drive_mkdir("SST", cfolder, access)
    p_c = _drive_mkdir("Personal", sst, access)
    p_con = _drive_mkdir("Contratista", p_c, access)
    p_sub = _drive_mkdir("Subcontratista", p_c, access)
    m = _drive_mkdir("Maquinaria", sst, access)
    m_con = _drive_mkdir("Contratista", m, access)
    m_sub = _drive_mkdir("Subcontratista", m, access)
    ens = _drive_mkdir("Ensayos", cfolder, access)

    exp_iso = None
    if body.expires_in and body.expires_in > 0:
        exp_iso = (datetime.now(timezone.utc) + timedelta(seconds=body.expires_in - 60)).isoformat()

    row = {
        "contrato_id": contrato_id,
        "proveedor": "google",
        "access_token": access,
        "refresh_token": body.refresh_token,
        "token_expiry": exp_iso,
        "folder_id_raiz": cfolder,
        "folder_id_sst": sst,
        "folder_id_sst_personal_contratista": p_con,
        "folder_id_sst_personal_subcontratista": p_sub,
        "folder_id_sst_maquinaria_contratista": m_con,
        "folder_id_sst_maquinaria_subcontratista": m_sub,
        "folder_id_ensayos": ens,
        "activo": True,
    }
    _sb.table("integraciones_nube").upsert(row, on_conflict="contrato_id,proveedor").execute()
    return {"ok": True, "carpetas": {k: row[k] for k in row if k.startswith("folder_id")}}


@router.post("/nube/{contrato_id}/conectar-onedrive")
def nube_conectar_onedrive(contrato_id: int, body: NubeConectarBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "integración nube claracore", "editar")
    if body.proveedor.lower() != "onedrive":
        raise HTTPException(422, "use proveedor onedrive")
    access = body.access_token
    cn = _contrato_nombre_carpeta(contrato_id)
    root = _graph_mkdir("ClaraCore", None, access)
    cfolder = _graph_mkdir(cn, root, access)
    sst = _graph_mkdir("SST", cfolder, access)
    p_c = _graph_mkdir("Personal", sst, access)
    p_con = _graph_mkdir("Contratista", p_c, access)
    p_sub = _graph_mkdir("Subcontratista", p_c, access)
    m = _graph_mkdir("Maquinaria", sst, access)
    m_con = _graph_mkdir("Contratista", m, access)
    m_sub = _graph_mkdir("Subcontratista", m, access)
    ens = _graph_mkdir("Ensayos", cfolder, access)

    exp_iso = None
    if body.expires_in and body.expires_in > 0:
        exp_iso = (datetime.now(timezone.utc) + timedelta(seconds=body.expires_in - 60)).isoformat()

    row = {
        "contrato_id": contrato_id,
        "proveedor": "onedrive",
        "access_token": access,
        "refresh_token": body.refresh_token,
        "token_expiry": exp_iso,
        "folder_id_raiz": cfolder,
        "folder_id_sst": sst,
        "folder_id_sst_personal_contratista": p_con,
        "folder_id_sst_personal_subcontratista": p_sub,
        "folder_id_sst_maquinaria_contratista": m_con,
        "folder_id_sst_maquinaria_subcontratista": m_sub,
        "folder_id_ensayos": ens,
        "activo": True,
    }
    _sb.table("integraciones_nube").upsert(row, on_conflict="contrato_id,proveedor").execute()
    return {"ok": True, "carpetas": {k: row[k] for k in row if k.startswith("folder_id")}}


@router.post("/nube/{contrato_id}/desconectar")
def nube_desconectar(contrato_id: int, proveedor: str = "google", current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "integración nube claracore", "editar")
    _sb.table("integraciones_nube").update(
        {"activo": False, "access_token": None, "refresh_token": None}
    ).eq("contrato_id", contrato_id).eq("proveedor", proveedor).execute()
    return {"ok": True}


@router.post("/nube/subir-archivo")
async def nube_subir_archivo(
    contrato_id: int = Form(...),
    parent_folder_id: str = Form(...),
    nombre_archivo: str = Form(...),
    proveedor_override: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    integ = _get_integracion(contrato_id)
    if not integ:
        raise HTTPException(400, "No hay integración de nube activa")
    prov = (proveedor_override or integ.get("proveedor") or "").lower()
    access = _ensure_access_token(integ)
    raw = await file.read()
    mime = file.content_type or "application/octet-stream"

    if prov == "google":
        info = _drive_upload(nombre_archivo, parent_folder_id, raw, mime, access)
        return {"id": info.get("id"), "url": info.get("webViewLink"), "proveedor": "google"}
    if prov == "onedrive":
        info = _graph_upload_small(nombre_archivo, parent_folder_id, raw, access)
        return {"id": info.get("id"), "url": (info.get("webUrl")), "proveedor": "onedrive"}
    raise HTTPException(400, "Proveedor no soportado")


# ── SST plantillas / personal / maquinaria ───────────────────────────────────


@router.get("/sst/{contrato_id}/plantillas")
def sst_list_plantillas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    return (
        _sb.table("sst_plantillas_documentos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("orden")
        .execute()
        .data
        or []
    )


class SstPlantillaCreate(BaseModel):
    tipo: str
    nombre: str
    descripcion: Optional[str] = None
    tiene_vencimiento: bool = False
    dias_vigencia: Optional[int] = None
    obligatorio: bool = True
    orden: int = 0


@router.post("/sst/{contrato_id}/plantillas")
def sst_create_plantilla(contrato_id: int, body: SstPlantillaCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "crear")
    row = {**body.model_dump(), "contrato_id": contrato_id}
    r = _sb.table("sst_plantillas_documentos").insert(row).execute().data
    return r[0] if r else row


@router.put("/sst/{contrato_id}/plantillas/{plantilla_id}")
def sst_put_plantilla(contrato_id: int, plantilla_id: int, body: SstPlantillaCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    _sb.table("sst_plantillas_documentos").update(body.model_dump()).eq("id", plantilla_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.delete("/sst/{contrato_id}/plantillas/{plantilla_id}")
def sst_del_plantilla(contrato_id: int, plantilla_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    _sb.table("sst_plantillas_documentos").update({"activo": False}).eq("id", plantilla_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/sst/{contrato_id}/personal")
def sst_list_personal(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    return _sb.table("sst_personal").select("*").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []


class SstPersonalCreate(BaseModel):
    nombre: str
    cedula: str
    cargo: Optional[str] = None
    empresa_tipo: str
    subcontratista_id: Optional[int] = None
    fecha_ingreso: Optional[str] = None


@router.post("/sst/{contrato_id}/personal")
def sst_create_personal(contrato_id: int, body: SstPersonalCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "crear")
    row = {**body.model_dump(), "contrato_id": contrato_id}
    if row.get("fecha_ingreso"):
        row["fecha_ingreso"] = row["fecha_ingreso"][:10]
    r = _sb.table("sst_personal").insert(row).execute().data
    return r[0] if r else row


@router.put("/sst/{contrato_id}/personal/{pid}")
def sst_put_personal(contrato_id: int, pid: int, body: SstPersonalCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    d = body.model_dump()
    if d.get("fecha_ingreso"):
        d["fecha_ingreso"] = d["fecha_ingreso"][:10]
    _sb.table("sst_personal").update(d).eq("id", pid).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.delete("/sst/{contrato_id}/personal/{pid}")
def sst_del_personal(contrato_id: int, pid: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    _sb.table("sst_personal").update({"activo": False}).eq("id", pid).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/sst/{contrato_id}/maquinaria")
def sst_list_maquinaria(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    return _sb.table("sst_maquinaria").select("*").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []


class SstMaquinariaCreate(BaseModel):
    placa_serial: str
    tipo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    propietario: Optional[str] = None
    empresa_tipo: str
    subcontratista_id: Optional[int] = None


@router.post("/sst/{contrato_id}/maquinaria")
def sst_create_maquinaria(contrato_id: int, body: SstMaquinariaCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "crear")
    row = {**body.model_dump(), "contrato_id": contrato_id}
    r = _sb.table("sst_maquinaria").insert(row).execute().data
    return r[0] if r else row


@router.put("/sst/{contrato_id}/maquinaria/{mid}")
def sst_put_maquinaria(contrato_id: int, mid: int, body: SstMaquinariaCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    _sb.table("sst_maquinaria").update(body.model_dump()).eq("id", mid).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.delete("/sst/{contrato_id}/maquinaria/{mid}")
def sst_del_maquinaria(contrato_id: int, mid: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "editar")
    _sb.table("sst_maquinaria").update({"activo": False}).eq("id", mid).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


def _sst_folder_base(integ: dict, empresa_tipo: str, entidad: str) -> str:
    et = (empresa_tipo or "").strip().lower()
    if entidad == "personal":
        if et == "contratista":
            return integ.get("folder_id_sst_personal_contratista") or ""
        return integ.get("folder_id_sst_personal_subcontratista") or ""
    if et == "contratista":
        return integ.get("folder_id_sst_maquinaria_contratista") or ""
    return integ.get("folder_id_sst_maquinaria_subcontratista") or ""


def _ensure_child_folder(integ: dict, parent_id: str, name: str, cache: Dict[str, str]) -> str:
    key = f"{parent_id}/{name}"
    if key in cache:
        return cache[key]
    prov = (integ.get("proveedor") or "").lower()
    access = _ensure_access_token(integ)
    if prov == "google":
        fid = _drive_mkdir(name, parent_id, access)
        cache[key] = fid
        return fid
    if prov == "onedrive":
        fid = _graph_mkdir(name, parent_id, access)
        cache[key] = fid
        return fid
    raise HTTPException(400, "Proveedor nube desconocido")


@router.post("/sst/{contrato_id}/documentos")
async def sst_post_documento(
    contrato_id: int,
    plantilla_id: int = Form(...),
    entidad_tipo: str = Form(...),
    entidad_id: int = Form(...),
    mes_vigencia: str = Form(...),
    fecha_vigencia: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "crear")
    integ = _get_integracion(contrato_id)
    if not integ:
        raise HTTPException(400, "Integración de nube pendiente: conecta Google Drive u OneDrive para subir archivos.")

    tpl = (
        _sb.table("sst_plantillas_documentos")
        .select("nombre")
        .eq("id", plantilla_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not tpl:
        raise HTTPException(404, "Plantilla no encontrada")
    nombre_tpl = (tpl[0].get("nombre") or "doc").replace(" ", "_")[:80]

    if entidad_tipo == "personal":
        ent = (
            _sb.table("sst_personal")
            .select("nombre, empresa_tipo")
            .eq("id", entidad_id)
            .eq("contrato_id", contrato_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    else:
        ent = (
            _sb.table("sst_maquinaria")
            .select("placa_serial, empresa_tipo")
            .eq("id", entidad_id)
            .eq("contrato_id", contrato_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not ent:
        raise HTTPException(404, "Entidad no encontrada")
    empresa_tipo = ent[0].get("empresa_tipo") or "Contratista"
    slug = (ent[0].get("nombre") or ent[0].get("placa_serial") or "x").replace("/", "-")[:120]

    base = _sst_folder_base(integ, empresa_tipo, entidad_tipo)
    if not base:
        raise HTTPException(500, "Falta folder_id en integración")

    cache: Dict[str, str] = {}
    mes_f = _ensure_child_folder(integ, base, mes_vigencia, cache)
    ent_f = _ensure_child_folder(integ, mes_f, slug, cache)

    ext = os.path.splitext(file.filename or "")[1] or ".pdf"
    nom = f"{nombre_tpl}_{slug}_{mes_vigencia}{ext}"
    raw = await file.read()
    mime = file.content_type or "application/pdf"

    prov = (integ.get("proveedor") or "").lower()
    access = _ensure_access_token(integ)
    url = None
    folder_id_ent = ent_f
    if prov == "google":
        info = _drive_upload(nom, ent_f, raw, mime, access)
        url = info.get("webViewLink") or f"https://drive.google.com/file/d/{info.get('id')}/view"
    elif prov == "onedrive":
        info = _graph_upload_small(nom, ent_f, raw, access)
        url = info.get("webUrl")

    fv = None
    if fecha_vigencia:
        try:
            fv = fecha_vigencia[:10]
        except Exception:
            fv = None

    row = {
        "contrato_id": contrato_id,
        "plantilla_id": plantilla_id,
        "entidad_tipo": entidad_tipo,
        "entidad_id": entidad_id,
        "nombre_archivo": nom,
        "url_nube": url,
        "folder_id_mes": mes_f,
        "folder_id_entidad": folder_id_ent,
        "fecha_subida": datetime.now(timezone.utc).isoformat(),
        "fecha_vigencia": fv,
        "mes_vigencia": mes_vigencia,
        "estado": "Cargado",
    }
    ins = _sb.table("sst_documentos").insert(row).execute().data
    return ins[0] if ins else row


class SstRevisarBody(BaseModel):
    estado: str
    comentario: Optional[str] = None


@router.put("/sst/{contrato_id}/documentos/{doc_id}/revisar")
def sst_revisar_documento(contrato_id: int, doc_id: int, body: SstRevisarBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "validar")
    uid = _uid(current_user)
    _sb.table("sst_documentos").update(
        {
            "estado": body.estado,
            "comentario_revision": body.comentario,
            "revisor_id": uid,
            "fecha_revision": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", doc_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/sst/{contrato_id}/checklist/{tipo}/{entidad_id}")
def sst_checklist(contrato_id: int, tipo: str, entidad_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    plantillas = (
        _sb.table("sst_plantillas_documentos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .eq("tipo", tipo)
        .execute()
        .data
        or []
    )
    docs = (
        _sb.table("sst_documentos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("entidad_tipo", tipo)
        .eq("entidad_id", entidad_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    by_tpl: Dict[int, dict] = {}
    for d in docs:
        tid = d.get("plantilla_id")
        if tid and tid not in by_tpl:
            by_tpl[tid] = d
    today = date.today()
    items = []
    ok_all = True
    warn = False
    danger = False
    for p in plantillas:
        tid = p["id"]
        d = by_tpl.get(tid)
        sem = "rojo"
        if d:
            st = (d.get("estado") or "").lower()
            fv = d.get("fecha_vigencia")
            if st == "aprobado" and fv:
                try:
                    fd = date.fromisoformat(str(fv)[:10])
                    if fd < today:
                        sem = "rojo"
                        danger = True
                        ok_all = False
                    elif (fd - today).days <= 30:
                        sem = "amarillo"
                        warn = True
                    else:
                        sem = "verde"
                except Exception:
                    sem = "verde" if st == "aprobado" else "amarillo"
            elif st == "aprobado":
                sem = "verde"
            elif st in ("rechazado", "pendiente"):
                sem = "rojo"
                ok_all = False
            else:
                sem = "amarillo"
                warn = True
        else:
            if p.get("obligatorio"):
                ok_all = False
                danger = True
        items.append({"plantilla": p, "documento": d, "semaforo": sem})
    global_sem = "verde" if ok_all and not warn else ("amarillo" if not danger else "rojo")
    return {"items": items, "semaforo_global": global_sem}


def html_esc(s) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


@router.get("/sst/{contrato_id}/informe/{tipo}/{entidad_id}", response_class=HTMLResponse)
def sst_informe(contrato_id: int, tipo: str, entidad_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    docs = (
        _sb.table("sst_documentos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("entidad_tipo", tipo)
        .eq("entidad_id", entidad_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    rows = "".join(
        f"<tr><td>{html_esc(d.get('nombre_archivo'))}</td><td>{html_esc(d.get('estado'))}</td>"
        f"<td><a href=\"{html_esc(d.get('url_nube') or '#')}\" target=\"_blank\" rel=\"noopener\">Abrir</a></td></tr>"
        for d in docs
    )
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe SST</title></head><body>
    <h1>Informe documental SST</h1><p>Contrato {contrato_id} · {html_esc(tipo)} #{entidad_id}</p>
    <table border="1" cellpadding="6"><thead><tr><th>Archivo</th><th>Estado</th><th>Enlace</th></tr></thead><tbody>{rows}</tbody></table>
    </body></html>"""
    return HTMLResponse(html)


@router.get("/sst/{contrato_id}/alertas")
def sst_alertas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    docs = (
        _sb.table("sst_documentos")
        .select("id, fecha_vigencia, nombre_archivo, estado, plantilla_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    today = date.today()
    out = []
    for d in docs:
        fv = d.get("fecha_vigencia")
        if not fv:
            continue
        try:
            fd = date.fromisoformat(str(fv)[:10])
        except Exception:
            continue
        delta = (fd - today).days
        if 0 <= delta <= 30:
            out.append({"tipo": "vencimiento", "referencia_id": d["id"], "mensaje": f"Vence en {delta} días: {d.get('nombre_archivo')}", "severidad": "alta" if delta <= 5 else "media"})
        if delta < 0:
            out.append({"tipo": "vencido", "referencia_id": d["id"], "mensaje": f"Vencido ({-delta} días): {d.get('nombre_archivo')}", "severidad": "critica"})
    return {"alertas": out}


@router.get("/sst/{contrato_id}/documentos")
def sst_list_documentos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "sst documental", "ver")
    return _sb.table("sst_documentos").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


# ── Ensayos ─────────────────────────────────────────────────────────────────


@router.get("/ensayos/{contrato_id}/pip")
def ensayos_list_pip(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "ver")
    return _sb.table("ensayos_pip").select("*").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []


class EnsayoPipCreate(BaseModel):
    nombre_ensayo: str
    norma_tecnica: Optional[str] = None
    item_presupuesto: Optional[str] = None
    frecuencia_tipo: Optional[str] = None
    frecuencia_valor: Optional[float] = None
    frecuencia_unidad: Optional[str] = None
    cantidad_minima: int = 1


@router.post("/ensayos/{contrato_id}/pip")
def ensayos_create_pip(contrato_id: int, body: EnsayoPipCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "crear")
    row = {**body.model_dump(), "contrato_id": contrato_id}
    integ = _get_integracion(contrato_id)
    if integ:
        try:
            access = _ensure_access_token(integ)
            ens_root = integ.get("folder_id_ensayos") or ""
            prov = (integ.get("proveedor") or "").lower()
            safe = re.sub(r'[\\\\/:*?"<>|]+', "-", body.nombre_ensayo)[:120]
            if prov == "google":
                fid = _drive_mkdir(safe, ens_root, access)
            else:
                fid = _graph_mkdir(safe, ens_root, access)
            row["folder_id_nube"] = fid
        except Exception as e:
            _log.warning("PIP folder nube: %s", e)
    r = _sb.table("ensayos_pip").insert(row).execute().data
    return r[0] if r else row


@router.put("/ensayos/{contrato_id}/pip/{pip_id}")
def ensayos_put_pip(contrato_id: int, pip_id: int, body: EnsayoPipCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "editar")
    _sb.table("ensayos_pip").update(body.model_dump()).eq("id", pip_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.delete("/ensayos/{contrato_id}/pip/{pip_id}")
def ensayos_del_pip(contrato_id: int, pip_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "editar")
    _sb.table("ensayos_pip").update({"activo": False}).eq("id", pip_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/ensayos/{contrato_id}/registros")
def ensayos_list_reg(contrato_id: int, pip_id: Optional[int] = None, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "ver")
    q = _sb.table("ensayos_registros").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True)
    if pip_id is not None:
        q = q.eq("pip_id", pip_id)
    return q.execute().data or []


@router.post("/ensayos/{contrato_id}/registros")
async def ensayos_post_reg(
    contrato_id: int,
    pip_id: int = Form(...),
    nombre_ensayo: Optional[str] = Form(None),
    fecha_muestra: str = Form(...),
    laboratorio: Optional[str] = Form(None),
    resultado_tipo: Optional[str] = Form(None),
    resultado_valor: Optional[float] = Form(None),
    mes_registro: str = Form(...),
    nombre_muestra: str = Form("Muestra"),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "crear")
    pip = (
        _sb.table("ensayos_pip")
        .select("*")
        .eq("id", pip_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not pip:
        raise HTTPException(404, "PIP no encontrado")
    pip = pip[0]
    integ = _get_integracion(contrato_id)
    if not integ:
        raise HTTPException(400, "Integración de nube requerida para registrar ensayos con archivo.")

    parent_pip = pip.get("folder_id_nube") or integ.get("folder_id_ensayos")
    cache: Dict[str, str] = {}
    mes_f = _ensure_child_folder(integ, parent_pip or "", mes_registro, cache)
    muestra_f = _ensure_child_folder(integ, mes_f, nombre_muestra[:80], cache)

    ext = os.path.splitext(file.filename or "")[1] or ".pdf"
    nom = f"{(nombre_ensayo or pip.get('nombre_ensayo') or 'ensayo').replace(' ', '_')[:60]}_{mes_registro}{ext}"
    raw = await file.read()
    mime = file.content_type or "application/pdf"
    prov = (integ.get("proveedor") or "").lower()
    access = _ensure_access_token(integ)
    url = None
    if prov == "google":
        info = _drive_upload(nom, muestra_f, raw, mime, access)
        url = info.get("webViewLink") or f"https://drive.google.com/file/d/{info.get('id')}/view"
    else:
        info = _graph_upload_small(nom, muestra_f, raw, access)
        url = info.get("webUrl")

    row = {
        "contrato_id": contrato_id,
        "pip_id": pip_id,
        "nombre_ensayo": nombre_ensayo or pip.get("nombre_ensayo"),
        "fecha_muestra": fecha_muestra[:10],
        "laboratorio": laboratorio,
        "resultado_tipo": resultado_tipo,
        "resultado_valor": resultado_valor,
        "nombre_archivo": nom,
        "url_nube": url,
        "folder_id_mes": mes_f,
        "folder_id_ensayo": muestra_f,
        "mes_registro": mes_registro,
        "estado": "Cargado",
    }
    ins = _sb.table("ensayos_registros").insert(row).execute().data
    return ins[0] if ins else row


class EnsayoRevisarBody(BaseModel):
    estado: str
    comentario: Optional[str] = None


@router.put("/ensayos/{contrato_id}/registros/{reg_id}/revisar")
def ensayos_revisar(contrato_id: int, reg_id: int, body: EnsayoRevisarBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "validar")
    uid = _uid(current_user)
    _sb.table("ensayos_registros").update(
        {
            "estado": body.estado,
            "comentario_revision": body.comentario,
            "revisor_id": uid,
            "fecha_revision": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", reg_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/ensayos/{contrato_id}/cumplimiento")
def ensayos_cumplimiento(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "ver")
    pips = _sb.table("ensayos_pip").select("id, nombre_ensayo, cantidad_minima").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []
    regs = (
        _sb.table("ensayos_registros")
        .select("pip_id, estado, resultado_tipo")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    by_pip: Dict[int, dict] = {p["id"]: {"total": 0, "aprobados": 0, "fallas": 0} for p in pips}
    for r in regs:
        pid = r.get("pip_id")
        if pid not in by_pip:
            continue
        by_pip[pid]["total"] += 1
        if (r.get("estado") or "").lower() == "aprobado":
            by_pip[pid]["aprobados"] += 1
        if (r.get("resultado_tipo") or "").lower() == "falla":
            by_pip[pid]["fallas"] += 1
    out = []
    for p in pips:
        pid = p["id"]
        st = by_pip.get(pid, {})
        minimo = int(p.get("cantidad_minima") or 1)
        out.append(
            {
                "pip_id": pid,
                "nombre_ensayo": p.get("nombre_ensayo"),
                "registros_total": st.get("total", 0),
                "registros_aprobados": st.get("aprobados", 0),
                "fallas": st.get("fallas", 0),
                "minimo_requerido": minimo,
                "cumple_minimo": st.get("total", 0) >= minimo,
            }
        )
    return {"items": out}


@router.get("/ensayos/{contrato_id}/alertas")
def ensayos_alertas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "ensayos pip", "ver")
    regs = (
        _sb.table("ensayos_registros")
        .select("id, resultado_tipo, estado, nombre_archivo, fecha_muestra")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    alertas = []
    for r in regs:
        if (r.get("resultado_tipo") or "").lower() == "falla" and (r.get("estado") or "").lower() != "aprobado":
            alertas.append({"tipo": "falla_sin_cierre", "referencia_id": r["id"], "mensaje": f"Falla sin resolución: {r.get('nombre_archivo')}"})
    return {"alertas": alertas}


# ── Auditor SST (IA) ─────────────────────────────────────────────────────────


def _calc_costo_anthropic(inp: int, out: int) -> float:
    return round((inp / 1_000_000.0) * 3.0 + (out / 1_000_000.0) * 15.0, 6)


@router.get("/sst/{contrato_id}/personal-auditoria")
def auditor_personal_fuente(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "auditor sst (ia)", "ver")
    try:
        res = _sb.table("sst_personal").select("id, nombre, cedula, cargo, empresa_tipo, fecha_ingreso").eq("contrato_id", contrato_id).eq("activo", True).execute()
        if res.data:
            return {"fuente": "bd", "personal": res.data}
        res2 = _sb.table("sst_personal_importado").select("*").eq("contrato_id", contrato_id).execute()
        return {"fuente": "importado", "personal": res2.data or []}
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise


class ImportExcelBody(BaseModel):
    filas: List[dict]


@router.post("/sst/{contrato_id}/importar-excel")
def auditor_import_excel(contrato_id: int, body: ImportExcelBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "auditor sst (ia)", "crear")
    uid = _uid(current_user)
    if not body.filas:
        raise HTTPException(400, "No hay filas para importar")
    registros = []
    for f in body.filas:
        row = {"contrato_id": contrato_id, "importado_por": uid}
        for k, v in f.items():
            if v is not None and v != "" and v != "—":
                row[k] = v
        registros.append(row)
    try:
        _sb.table("sst_personal_importado").upsert(registros, on_conflict="contrato_id,cedula").execute()
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise
    return {"importados": len(registros), "mensaje": f"{len(registros)} colaboradores importados"}


@router.post("/sst/{contrato_id}/auditar")
async def auditor_ejecutar(
    contrato_id: int,
    current_user: dict = Depends(get_current_user),
    pdfs: List[UploadFile] = File(...),
    origen: str = Form("bd"),
    colaborador_id: Optional[str] = Form(None),
):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "auditor sst (ia)", "ver")
    cid_colab: Optional[int] = None
    if colaborador_id is not None and str(colaborador_id).strip() != "":
        try:
            cid_colab = int(str(colaborador_id).strip())
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="colaborador_id debe ser un número")
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY no configurada")
    try:
        import anthropic
    except ImportError:
        raise HTTPException(500, "Instale anthropic en el backend")

    if cid_colab is None:
        raise HTTPException(status_code=422, detail="Indica colaborador_id en modo individual")
    try:
        if origen == "bd":
            res = _sb.table("sst_personal").select("*").eq("id", cid_colab).eq("contrato_id", contrato_id).limit(1).execute().data
        else:
            res = _sb.table("sst_personal_importado").select("*").eq("id", cid_colab).eq("contrato_id", contrato_id).limit(1).execute().data
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise
    if not res:
        raise HTTPException(404, "Colaborador no encontrado")
    colaborador = res[0]

    imagenes_b64: List[Any] = []
    for pdf_file in pdfs:
        contenido = await pdf_file.read()
        try:
            from pdf2image import convert_from_bytes

            paginas = convert_from_bytes(contenido, dpi=120, fmt="jpeg")
            for pagina in paginas[:20]:
                buffer = BytesIO()
                pagina.save(buffer, format="JPEG", quality=82)
                imagenes_b64.append(base64.standard_b64encode(buffer.getvalue()).decode("utf-8"))
        except Exception:
            try:
                import pypdf

                reader = pypdf.PdfReader(BytesIO(contenido))
                texto_fallback = "\n".join((p.extract_text() or "") for p in reader.pages[:30])
                imagenes_b64.append({"tipo": "texto", "contenido": texto_fallback[:8000]})
            except Exception as e2:
                _log.warning("PDF parse: %s", e2)
                imagenes_b64.append({"tipo": "texto", "contenido": ""})

    datos_colaborador = json.dumps(colaborador, ensure_ascii=False, indent=2, default=str)
    system_prompt = """Eres auditor SST Colombia. Compara datos del colaborador con PDFs del expediente.
Responde SOLO JSON válido sin markdown:
{"colaborador_identificado":"","cedula_identificada":"","coincide_con_bd":true,"puntuacion":0,"resumen":"","documentos_encontrados":[],"documentos_faltantes":[],
"hallazgos":[{"campo":"","estado":"OK|DISCREPANCIA|NO ENCONTRADO","valor_bd":"","valor_pdf":null,"detalle":""}],
"alertas_criticas":[],"conclusion":""}"""

    contenido_mensaje: List[dict] = [
        {
            "type": "text",
            "text": f"DATOS SISTEMA:\n{datos_colaborador}\n\nAnaliza documentos ({len(pdfs)} PDFs).",
        }
    ]
    for img in imagenes_b64[:20]:
        if isinstance(img, dict) and img.get("tipo") == "texto":
            contenido_mensaje.append({"type": "text", "text": f"[TEXTO PDF]:\n{img.get('contenido','')}"})
        else:
            contenido_mensaje.append(
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}}
            )
    contenido_mensaje.append({"type": "text", "text": "Auditoría completa en JSON solicitado."})

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    respuesta = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        system=system_prompt,
        messages=[{"role": "user", "content": contenido_mensaje}],
    )
    raw = respuesta.content[0].text
    raw = re.sub(r"```json|```", "", raw).strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise HTTPException(500, "Claude no devolvió JSON válido")
    resultado = json.loads(match.group())
    hallazgos = resultado.get("hallazgos") or []

    tokens_in = respuesta.usage.input_tokens
    tokens_out = respuesta.usage.output_tokens
    costo = _calc_costo_anthropic(tokens_in, tokens_out)
    uid = _uid(current_user)
    try:
        _sb.table("sst_auditorias").insert(
            {
                "contrato_id": contrato_id,
                "usuario_id": uid,
                "colaborador_nombre": colaborador.get("nombre"),
                "colaborador_cedula": str(colaborador.get("cedula") or ""),
                "origen": origen,
                "total_pdfs": len(pdfs),
                "campos_ok": sum(1 for h in hallazgos if h.get("estado") == "OK"),
                "campos_discrepancia": sum(1 for h in hallazgos if h.get("estado") == "DISCREPANCIA"),
                "campos_no_encontrado": sum(1 for h in hallazgos if h.get("estado") == "NO ENCONTRADO"),
                "puntuacion": resultado.get("puntuacion") or 0,
                "tokens_usados": tokens_in + tokens_out,
                "costo_usd": costo,
            }
        ).execute()
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise

    return {
        "resultado": resultado,
        "meta": {
            "pdfs_procesados": len(pdfs),
            "paginas_analizadas": len(imagenes_b64),
            "tokens_usados": tokens_in + tokens_out,
            "costo_usd": costo,
            "costo_cop_aprox": round(costo * 4200, 0),
        },
    }


@router.get("/sst/{contrato_id}/auditorias-historial")
def auditor_historial(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "auditor sst (ia)", "ver")
    todos = []
    off = 0
    try:
        while True:
            chunk = (
                _sb.table("sst_auditorias")
                .select("*")
                .eq("contrato_id", contrato_id)
                .order("created_at", desc=True)
                .range(off, off + 999)
                .execute()
                .data
                or []
            )
            todos.extend(chunk)
            if len(chunk) < 1000:
                break
            off += 1000
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise
    total_costo = sum(float(r.get("costo_usd") or 0) for r in todos)
    total_tokens = sum(int(r.get("tokens_usados") or 0) for r in todos)
    return {
        "historial": todos,
        "totales": {
            "auditorias": len(todos),
            "costo_usd_total": round(total_costo, 4),
            "costo_cop_total": round(total_costo * 4200, 0),
            "tokens_total": total_tokens,
        },
    }


@router.post("/sst/{contrato_id}/auditar-lote")
async def auditor_lote(
    contrato_id: int,
    current_user: dict = Depends(get_current_user),
    pdfs: List[UploadFile] = File(...),
):
    _require_contract_access(current_user, contrato_id)
    _require_perm(current_user, "auditor sst (ia)", "ver")
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY no configurada")
    if len(pdfs) > 20:
        raise HTTPException(400, "Máximo 20 PDFs")
    try:
        import anthropic
    except ImportError:
        raise HTTPException(500, "Instale anthropic en el backend")

    try:
        res_bd = _sb.table("sst_personal").select("*").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []
        res_imp = _sb.table("sst_personal_importado").select("*").eq("contrato_id", contrato_id).execute().data or []
    except Exception as e:
        _rethrow_if_supabase_missing_table(e)
        raise
    todo = res_bd + res_imp
    lista_nombres = "\n".join(
        f"- {p.get('nombre','?')} | CC {p.get('cedula','?')} | Cargo: {p.get('cargo','?')} | Empresa: {p.get('empresa_tipo') or p.get('empresa','?')}"
        for p in todo
    )
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    resultados_lote = []

    for pdf_file in pdfs:
        contenido = await pdf_file.read()
        nombre_archivo = pdf_file.filename or "doc.pdf"
        imagenes_b64: List[Any] = []
        try:
            from pdf2image import convert_from_bytes

            paginas = convert_from_bytes(contenido, dpi=120, fmt="jpeg")
            for pagina in paginas[:12]:
                buffer = BytesIO()
                pagina.save(buffer, format="JPEG", quality=80)
                imagenes_b64.append(base64.standard_b64encode(buffer.getvalue()).decode("utf-8"))
        except Exception:
            try:
                import pypdf

                reader = pypdf.PdfReader(BytesIO(contenido))
                texto = "\n".join((p.extract_text() or "") for p in reader.pages)
                imagenes_b64 = [{"tipo": "texto", "contenido": texto[:8000]}]
            except Exception:
                imagenes_b64 = [{"tipo": "texto", "contenido": ""}]

        contenido_msg: List[dict] = [
            {
                "type": "text",
                "text": f"Archivo: {nombre_archivo}\nPERSONAL:\n{lista_nombres}\nIdentifica colaborador, compara con lista, responde JSON igual que en auditoría individual.",
            }
        ]
        for img in imagenes_b64:
            if isinstance(img, dict):
                contenido_msg.append({"type": "text", "text": f"[TEXTO]:\n{img.get('contenido','')}"})
            else:
                contenido_msg.append(
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}}
                )
        contenido_msg.append({"type": "text", "text": "Solo JSON válido."})
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2500,
            messages=[{"role": "user", "content": contenido_msg}],
        )
        raw = resp.content[0].text
        raw = re.sub(r"```json|```", "", raw).strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        costo = _calc_costo_anthropic(resp.usage.input_tokens, resp.usage.output_tokens)
        if not match:
            resultados_lote.append({"archivo": nombre_archivo, "error": "Sin JSON", "costo_usd": costo})
            continue
        resultado = json.loads(match.group())
        hallazgos = resultado.get("hallazgos") or []
        uid = _uid(current_user)
        try:
            _sb.table("sst_auditorias").insert(
                {
                    "contrato_id": contrato_id,
                    "usuario_id": uid,
                    "colaborador_nombre": resultado.get("colaborador_identificado"),
                    "colaborador_cedula": str(resultado.get("cedula_identificada") or ""),
                    "origen": "lote",
                    "total_pdfs": 1,
                    "campos_ok": sum(1 for h in hallazgos if h.get("estado") == "OK"),
                    "campos_discrepancia": sum(1 for h in hallazgos if h.get("estado") == "DISCREPANCIA"),
                    "campos_no_encontrado": sum(1 for h in hallazgos if h.get("estado") == "NO ENCONTRADO"),
                    "puntuacion": resultado.get("puntuacion") or 0,
                    "tokens_usados": resp.usage.input_tokens + resp.usage.output_tokens,
                    "costo_usd": costo,
                }
            ).execute()
        except Exception as e:
            _rethrow_if_supabase_missing_table(e)
            raise
        resultados_lote.append({**resultado, "archivo": nombre_archivo, "costo_usd": costo})

    costo_total = sum(float(r.get("costo_usd") or 0) for r in resultados_lote)

    def _n_disc(r):
        h = r.get("hallazgos") or []
        return sum(1 for x in h if x.get("estado") == "DISCREPANCIA")

    return {
        "resultados": resultados_lote,
        "resumen_lote": {
            "total_pdfs": len(pdfs),
            "procesados": len(resultados_lote),
            "con_discrepancias": sum(1 for r in resultados_lote if _n_disc(r) > 0),
            "no_identificados": sum(1 for r in resultados_lote if r.get("coincide_con_bd") is False),
            "costo_usd_total": round(costo_total, 4),
            "costo_cop_total": round(costo_total * 4200, 0),
        },
    }
