from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form, Query, Header
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse, JSONResponse
import io, csv, requests as req_http
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from supabase import create_client, ClientOptions
import httpx
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone, date
from dotenv import load_dotenv
import os
import base64
import logging
import traceback
import time
import uuid
import threading
import calendar
import re
import json
from concurrent.futures import ThreadPoolExecutor

# ── Sesiones DWG activas (en memoria) ─────────────────────────────────────────
_dwg_sessions: dict = {}
# Auditoría: última carga de cantidades desde SicoeCAD (cliente) → /presupuesto/.../bulk?source=sicoe_cad
# Notificación consumida vía GET .../sincro-sicoe-cad-auditoria; en un solo proceso de API (no multi-réplica).
_sicoe_cad_sincro_audit: dict = {}
# ── Jobs de exportación Excel en background ────────────────────────────────────
_export_jobs: dict = {}  # { job_id: { "estado": "procesando"|"listo"|"error", "buf": bytes, "filename": str } }
_DWG_TIMEOUT = 30  # segundos — margen para curl.exe
_MAINTENANCE_SECRET = os.getenv("MAINTENANCE_SECRET", "claracore_deploy_2026")
_MAINTENANCE_DEFAULT_SECONDS = int(os.getenv("MAINTENANCE_COUNTDOWN_SECONDS", "25"))
_maintenance_state = {
    "activo": False,
    "mensaje": "Actualización del sistema en curso. Por favor guarda tu trabajo antes de continuar.",
    "expires_at": None,
}

def _dwg_activo(contrato_id: int, usuario_id: int = None) -> bool:
    last = _dwg_sessions.get(contrato_id)
    return last is not None and (time.time() - last) < 10

load_dotenv()
_MAINTENANCE_SECRET = os.getenv("MAINTENANCE_SECRET", _MAINTENANCE_SECRET)
_MAINTENANCE_DEFAULT_SECONDS = int(os.getenv("MAINTENANCE_COUNTDOWN_SECONDS", str(_MAINTENANCE_DEFAULT_SECONDS)))

app = FastAPI(title="ClaraCore API")

# Orígenes permitidos (CORS). Incluye claracore.co y localhost; CORS_EXTRA_ORIGINS=url1,url2 añade más sin redeploy.
_cors_extra = [
    o.strip()
    for o in (os.getenv("CORS_EXTRA_ORIGINS") or "").split(",")
    if o.strip()
]
_cors_origins = [
    "https://claracore.co",
    "https://www.claracore.co",
    "https://app.claracore.co",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
] + _cors_extra

# CORSMiddleware se registra al final del archivo (tras los @app.middleware) para que sea la capa
# más externa y añada cabeceras CORS también cuando un middleware interno devuelve JSONResponse
# sin llamar a call_next (p. ej. políticas 403); si CORS va “dentro”, el navegador ve CORS bloqueado.

_log_api = logging.getLogger("uvicorn.error")

# Seguimiento en memoria para alertas (login fallido, 500 repetidos)
_login_fail_tracker: dict = {}
_endpoint_500_tracker: dict = {}

# Versión del texto de políticas mostrada al usuario (auditoría junto a politicas_version en BD)
POLITICAS_VERSION_DEFAULT = os.getenv("POLITICAS_VERSION", "1.0")

# Cache en memoria: evita 1 consulta a Supabase por cada request autenticado (reduce carga y latencia).
# Invalidación al aceptar políticas. TTL por defecto 120 s (ajustable con POLITICAS_CACHE_TTL_SECONDS).
_POLITICAS_CACHE_TTL = float(os.getenv("POLITICAS_CACHE_TTL_SECONDS", "120"))
_POLITICAS_CACHE_LOCK = threading.Lock()
# uid -> (exp_unix, "ok"|"pend"|"none")  ok=aceptó, pend=rechazó pendiente, none=usuario no existe en select
_politicas_cache: dict = {}


def _politicas_cache_get(uid: int) -> Optional[str]:
    with _POLITICAS_CACHE_LOCK:
        row = _politicas_cache.get(uid)
        if not row:
            return None
        exp, state = row
        if time.time() > exp:
            del _politicas_cache[uid]
            return None
        return state


def _politicas_cache_set(uid: int, state: str) -> None:
    """state: ok | pend | none"""
    with _POLITICAS_CACHE_LOCK:
        _politicas_cache[uid] = (time.time() + _POLITICAS_CACHE_TTL, state)
        if len(_politicas_cache) > 8000:
            now = time.time()
            dead = [k for k, (e, _) in _politicas_cache.items() if e < now]
            for k in dead[:4000]:
                _politicas_cache.pop(k, None)


def politicas_cache_invalidate(uid: int) -> None:
    with _POLITICAS_CACHE_LOCK:
        _politicas_cache.pop(uid, None)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()[:128]
    if request.client and request.client.host:
        return str(request.client.host)[:128]
    return ""


def _json_for_log(obj):
    """Serializa valores para columnas jsonb (evita tipos no JSON)."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): _json_for_log(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_for_log(x) for x in obj]
    return str(obj)


def _default_severidad(accion: str, modulo: str, resultado: str) -> str:
    if resultado and str(resultado).lower() not in ("ok", "success", "éxito"):
        return "ERROR" if "denegado" not in str(resultado).lower() else "WARNING"
    if modulo == "PERMISOS" or accion in (
        "ELIMINAR", "VALIDAR", "APROBAR", "RECHAZAR", "IMPORTAR_MASIVO",
    ):
        return "AUDIT"
    if accion in ("LOGIN_FAIL", "ACCESO_DENEGADO"):
        return "WARNING"
    return "INFO"


@app.exception_handler(Exception)
async def unhandled_exception_to_json(request: Request, exc: Exception):
    """Evita HTML genérico 'Internal Server Error'; el front puede mostrar `detail` en JSON."""
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    if isinstance(exc, RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})
    _log_api.exception("Error no manejado: %s %s", request.method, request.url.path)
    try:
        registrar_log_sistema(
            "ERROR",
            request.url.path,
            request.method,
            {"error": type(exc).__name__, "msg": str(exc)[:2000]},
            traceback.format_exc()[:12000],
            resultado="error",
            alerta_generada=False,
        )
        _track_500_endpoint_alert(request.url.path)
    except Exception:
        pass
    debug = os.getenv("CLARACORE_DEBUG", "").lower() in ("1", "true", "yes")
    detail = traceback.format_exc() if debug else f"{type(exc).__name__}: {exc}"
    return JSONResponse(status_code=500, content={"detail": detail})


_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_KEY = os.getenv("SUPABASE_KEY")
# PostgREST puede tardar bajo carga; el default de httpx (~5s) provoca ReadTimeout en /auth/refresh y otras rutas.
_SUPABASE_HTTP_TIMEOUT = httpx.Timeout(connect=20.0, read=120.0, write=90.0, pool=30.0)

def get_supabase():
    return create_client(
        _SUPABASE_URL,
        _SUPABASE_KEY,
        options=ClientOptions(
            httpx_client=httpx.Client(http2=False, timeout=_SUPABASE_HTTP_TIMEOUT)
        ),
    )

supabase = get_supabase()
security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES") or "10080")


@app.middleware("http")
async def exigir_politicas_confidencialidad(request: Request, call_next):
    """Bloquea el uso de la API con token si el usuario no ha aceptado las políticas (salvo rutas mínimas)."""
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    auth = request.headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        return await call_next(request)
    if (
        (request.method == "POST" and path == "/auth/refresh")
        or (request.method == "GET" and path == "/usuarios/me")
        or (request.method == "POST" and path == "/usuarios/me/politicas-aceptar")
    ):
        return await call_next(request)
    try:
        payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            return await call_next(request)
        uid = int(sub)
    except (JWTError, ValueError, TypeError):
        return await call_next(request)
    cached = _politicas_cache_get(uid)
    if cached == "ok":
        return await call_next(request)
    if cached == "pend":
        return JSONResponse(status_code=403, content={"detail": "politicas_pendientes"})
    if cached == "none":
        return JSONResponse(status_code=403, content={"detail": "politicas_pendientes"})
    try:
        r = supabase.table("usuarios").select("politicas_aceptadas").eq("id", uid).limit(1).execute()
        row = r.data[0] if r.data else None
        if row is None:
            _politicas_cache_set(uid, "none")
            return JSONResponse(status_code=403, content={"detail": "politicas_pendientes"})
        if row.get("politicas_aceptadas") is True:
            _politicas_cache_set(uid, "ok")
            return await call_next(request)
        _politicas_cache_set(uid, "pend")
        return JSONResponse(status_code=403, content={"detail": "politicas_pendientes"})
    except Exception:
        # Columna aún no migrada u otro error: no bloquear despliegue
        return await call_next(request)


# Cloudinary: claracore/{contrato_id}/fotos | graficos | Fotos de Perfil | Fotos de Firmas
CLOUDINARY_ROOT = "claracore"
CLOUDINARY_SUB_FOTOS = "fotos"
CLOUDINARY_SUB_GRAFICOS = "graficos"
CLOUDINARY_SUB_PERFIL = "Fotos de Perfil"
CLOUDINARY_SUB_FIRMAS = "Fotos de Firmas"
# PNG 1×1 px (marcador para crear carpetas al dar de alta un contrato)
_CLOUDINARY_SEED_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _cloudinary_config():
    import cloudinary
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )


def _cloudinary_folder_contrato(contrato_id: int, subcarpeta: str) -> str:
    return f"{CLOUDINARY_ROOT}/{contrato_id}/{subcarpeta}"


def _cloudinary_seed_carpetas_contrato(contrato_id: int) -> None:
    """Crea en Cloudinary las cuatro carpetas del contrato (un PNG mínimo por carpeta)."""
    if not os.getenv("CLOUDINARY_CLOUD_NAME"):
        return
    import cloudinary.uploader
    _cloudinary_config()
    seeds = [
        (CLOUDINARY_SUB_FOTOS, "_inicial_fotos"),
        (CLOUDINARY_SUB_GRAFICOS, "_inicial_graficos"),
        (CLOUDINARY_SUB_PERFIL, "_inicial_perfil"),
        (CLOUDINARY_SUB_FIRMAS, "_inicial_firmas"),
    ]
    for sub, public_id in seeds:
        try:
            cloudinary.uploader.upload(
                _CLOUDINARY_SEED_PNG,
                folder=_cloudinary_folder_contrato(contrato_id, sub),
                public_id=public_id,
                overwrite=True,
                resource_type="image",
            )
        except Exception as e:
            _log_api.warning("Cloudinary seed %s/%s: %s", contrato_id, sub, e)

# ─────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class UsuarioCreate(BaseModel):
    nombre: str
    email: str
    password: str
    cargo_id: int

class UsuarioRegistro(BaseModel):
    nombre: str
    apellidos: str
    email: str
    cargo_id: int
    contrato_id: Optional[int] = None
    password: str

class PerfilUpdate(BaseModel):
    """Actualización de perfil por el propio usuario (no modifica cargo, contrato ni email)."""
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    # Cadena vacía borra la fecha; YYYY-MM-DD la guarda; omitir no cambia.
    fecha_nacimiento: Optional[str] = None


class InicioNovedadCreate(BaseModel):
    titulo: str
    resumen: str = ""
    tipo: str = "actualización"
    fecha: Optional[str] = None
    autor: str = "Equipo ClaraCore"
    icono: str = "📢"
    color: str = "#00B4C6"
    imagen_url: Optional[str] = None


class InicioNovedadUpdate(BaseModel):
    titulo: Optional[str] = None
    resumen: Optional[str] = None
    tipo: Optional[str] = None
    fecha: Optional[str] = None
    autor: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    imagen_url: Optional[str] = None


class InicioNovedadMejorarTexto(BaseModel):
    texto: str = ""

class AprobarRequest(BaseModel):
    rol_id: int

class CargoCreate(BaseModel):
    nombre: str
    rol_id: Optional[int] = None
    categoria_id: Optional[int] = None

class ContratoCreate(BaseModel):
    numero: str
    objeto: Optional[str] = None
    contratista: Optional[str] = None
    nit: Optional[str] = None
    interventoria: Optional[str] = None
    entidad: Optional[str] = None
    entidad_otra: Optional[str] = None
    logo_entidad: Optional[str] = None
    plano_geojson: Optional[dict] = None
    centro_lat: Optional[float] = None
    centro_lng: Optional[float] = None
    logo_contratista: Optional[str] = None
    logo_interventoria: Optional[str] = None
    aiu: Optional[float] = None
    iva: Optional[float] = None

class PermisoUpdate(BaseModel):
    cargo_id: int
    funcion_id: int
    ver: bool = False
    crear: bool = False
    editar: bool = False
    eliminar: bool = False
    validar: bool = False
    exportar: bool = False

class UsuarioUpdate(BaseModel):
    cargo_id: Optional[int] = None
    rol_id: Optional[int] = None
    contrato_id: Optional[int] = None
    estado: Optional[str] = None
    subcontratista_id: Optional[int] = None
    politicas_aceptadas: Optional[bool] = None

class UsuarioContratoCreate(BaseModel):
    usuario_id: int
    contrato_id: int

class ContratoUpdate(BaseModel):
    numero: Optional[str] = None
    objeto: Optional[str] = None
    contratista: Optional[str] = None
    nit: Optional[str] = None
    interventoria: Optional[str] = None
    entidad: Optional[str] = None
    entidad_otra: Optional[str] = None
    logo_entidad: Optional[str] = None
    plano_geojson: Optional[dict] = None
    centro_lat: Optional[float] = None
    centro_lng: Optional[float] = None
    logo_contratista: Optional[str] = None
    logo_interventoria: Optional[str] = None
    fase: Optional[str] = None  # 'PRESUPUESTO' | 'LIQUIDACION'
    aiu: Optional[float] = None
    iva: Optional[float] = None

class ListadoPrecioItem(BaseModel):
    capitulo: Optional[str] = None
    competencia: Optional[str] = None
    item_numero: Optional[str] = None
    descripcion: Optional[str] = None
    unidad: Optional[str] = None
    precio_unitario: Optional[float] = None
    color_hex: Optional[str] = None
    tipo_precio: Optional[str] = None
    especificacion_tecnica: Optional[str] = None
    acta_fijacion: Optional[str] = None
    acta_modificatoria: Optional[str] = None
    observaciones: Optional[str] = None
    estado_precio: Optional[str] = None
    tipo_calculo:  Optional[str] = None

class PresupuestoRow(BaseModel):
    pk_id: Optional[str] = None
    capitulo: Optional[str] = None
    competencia: Optional[str] = None
    item: Optional[str] = None
    descripcion: Optional[str] = None
    und: Optional[str] = None
    calzada: Optional[str] = None
    tramo: Optional[str] = None
    abs_inicio: Optional[str] = None
    abs_final: Optional[str] = None
    vlr_unitario: Optional[float] = None
    no_inicio: Optional[str] = None
    no_final: Optional[str] = None
    area_long_nod: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    cant_total: Optional[float] = None
    costo_directo: Optional[float] = None
    tipo_ejecucion: Optional[str] = None
    tipo_entidad: Optional[str] = None
    id_pol: Optional[str] = None
    observacion: Optional[str] = None
    revisado: Optional[str] = None
    observacion_externa: Optional[str] = None
    ent_handle: Optional[str] = None
    txt_handle: Optional[str] = None
    layer_ent: Optional[str] = None
    layer_txt: Optional[str] = None
    color_hex: Optional[str] = None
    guid: Optional[str] = None
    x_label: Optional[float] = None
    y_label: Optional[float] = None

class PresupuestoUpdate(BaseModel):
    capitulo: Optional[str] = None
    competencia: Optional[str] = None
    item: Optional[str] = None
    descripcion: Optional[str] = None
    und: Optional[str] = None
    calzada: Optional[str] = None
    tramo: Optional[str] = None
    vlr_unitario: Optional[float] = None
    area_long_nod: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    cant_total: Optional[float] = None
    costo_directo: Optional[float] = None
    revisado: Optional[str] = None
    observacion_externa: Optional[str] = None

class DimOverride(BaseModel):
    id: int
    ancho: Optional[float] = None
    espesor: Optional[float] = None

class PresupuestoBulkRecalc(BaseModel):
    ids: List[int]
    capitulo: Optional[str] = None
    item: Optional[str] = None
    descripcion: Optional[str] = None
    vlr_unitario: Optional[float] = None
    dims: Optional[List[DimOverride]] = None  # cambios de dimensión por fila

class PresupuestoBulkEstado(BaseModel):
    ids: List[int]
    revisado: str


class PresupuestoBulkPreInterv(BaseModel):
    """Depuración contratista antes de que Interventoría revise (Residente de Costos u Obra)."""
    ids: List[int]
    estado: str

class ComentariosValidacionIds(BaseModel):
    """Lista de filas `presupuesto` para comentarios de validación; POST evita query strings gigantes (5xx en proxy)."""
    ids: List[int]

class AgregarCantidadBody(BaseModel):
    # Nuevo ítem
    item: str
    descripcion: str
    und: str
    vlr_unitario: float
    area_long_nod: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    # Heredado del clon base
    capitulo: str
    competencia: Optional[str] = None
    calzada: Optional[str] = None
    tramo: Optional[str] = None
    abs_inicio: Optional[str] = None
    abs_final: Optional[str] = None
    no_inicio: Optional[str] = None
    no_final: Optional[str] = None
    tipo_ejecucion: Optional[str] = None
    tipo_entidad: Optional[str] = None
    id_pol_base: Optional[str] = None
    layer_ent: Optional[str] = None
    layer_txt: Optional[str] = None
    x_label: Optional[float] = None
    y_label: Optional[float] = None

class CadQueueCreate(BaseModel):
    tipo: str        # cambiar_layer | insertar_bloque
    payload: dict

class CadQueueProcesado(BaseModel):
    rev_block_handle: Optional[str] = None   # solo para insertar_bloque
    presupuesto_id:   Optional[int] = None

class CobroRow(BaseModel):
    pk_id: Optional[str] = None
    acta: Optional[int] = None
    semana: Optional[str] = None
    fecha: Optional[str] = None
    capitulo: Optional[str] = None
    competencia: Optional[str] = None
    abs_inicial: Optional[str] = None
    abs_final: Optional[str] = None
    civ: Optional[str] = None
    item: Optional[str] = None
    descripcion: Optional[str] = None
    und: Optional[str] = None
    longitud: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    cantidad: Optional[float] = None
    valor_unitario: Optional[float] = None
    costo_directo: Optional[float] = None
    calzada: Optional[str] = None
    tramo_inicio: Optional[str] = None
    tramo_final: Optional[str] = None
    registro: Optional[str] = None
    tramo: Optional[str] = None
    observaciones: Optional[str] = None

class ResetSolicitud(BaseModel):
    email: str

class ResetAutorizar(BaseModel):
    contrasena_temporal: str

class CambiarPassword(BaseModel):
    email: str
    contrasena_temporal: str
    nueva_password: str

class MantenimientoRequest(BaseModel):
    secret: str
    activo: bool
    mensaje: Optional[str] = None
    segundos: Optional[int] = None

def _estado_mantenimiento():
    now = time.time()
    if _maintenance_state["activo"] and _maintenance_state["expires_at"] is not None and now >= _maintenance_state["expires_at"]:
        _maintenance_state["activo"] = False
        _maintenance_state["expires_at"] = None

    restantes = None
    if _maintenance_state["activo"] and _maintenance_state["expires_at"] is not None:
        restantes = max(0, int(_maintenance_state["expires_at"] - now))

    return {
        "activo": _maintenance_state["activo"],
        "mensaje": _maintenance_state["mensaje"],
        "segundos_restantes": restantes,
    }

# ─────────────────────────────────────────────
# HELPER SUPABASE CON REINTENTOS
# ─────────────────────────────────────────────
def supabase_execute(fn, retries=3, delay=0.5):
    import time
    global supabase
    last_err = None
    for i in range(retries):
        try:
            return fn()
        except Exception as e:
            last_err = e
            supabase = get_supabase()
            if i < retries - 1:
                time.sleep(delay)
    try:
        registrar_log_sistema(
            "ERROR",
            "supabase_execute",
            "RPC",
            {"error": type(last_err).__name__, "msg": str(last_err)[:2000], "reintentos": retries},
            traceback.format_exc()[:8000],
            resultado="error",
            alerta_generada=False,
        )
    except Exception:
        pass
    raise last_err

# ─────────────────────────────────────────────
# SISTEMA DE LOGS
# ─────────────────────────────────────────────
def registrar_log_sistema(
    severidad: str,
    endpoint: str,
    metodo_http: str,
    detalle: dict,
    stack_trace: Optional[str] = None,
    resultado: str = "error",
    alerta_generada: bool = False,
    duracion_ms: Optional[int] = None,
):
    """Errores y eventos técnicos (categoría sistema). No requiene usuario."""
    try:
        row = {
            "usuario_id":       None,
            "usuario_nombre":   "SISTEMA",
            "cargo_nombre":     "",
            "rol_nombre":       None,
            "contrato_id":      None,
            "contrato_numero":  None,
            "accion":           "ERROR_SISTEMA" if severidad == "ERROR" else "EVENTO_SISTEMA",
            "modulo":           "SISTEMA",
            "entidad_tipo":     "endpoint",
            "entidad_id":       None,
            "detalle":          _json_for_log(detalle) if detalle is not None else {},
            "resultado":        resultado,
            "categoria":        "sistema",
            "severidad":        severidad,
            "endpoint":         (endpoint or "")[:1024],
            "metodo_http":      (metodo_http or "")[:32],
            "stack_trace":      (stack_trace or "")[:12000] if stack_trace else None,
            "duracion_ms":      duracion_ms,
            "alerta_generada":  alerta_generada,
        }
        supabase.table("logs").insert(row).execute()
    except Exception:
        pass


def registrar_log(
    usuario,
    accion,
    modulo,
    entidad_tipo=None,
    entidad_id=None,
    detalle=None,
    resultado="ok",
    *,
    valor_anterior=None,
    valor_nuevo=None,
    ip=None,
    severidad=None,
    categoria="auditoria",
    rol_nombre=None,
    endpoint=None,
    metodo_http=None,
    stack_trace=None,
    duracion_ms=None,
    alerta_generada=None,
):
    try:
        uid = usuario.get("sub") or usuario.get("id")
        if severidad is None:
            severidad = _default_severidad(accion, modulo, resultado)
        row = {
            "usuario_id":       int(uid) if uid else None,
            "usuario_nombre":   usuario.get("nombre") or usuario.get("email", ""),
            "cargo_nombre":     usuario.get("cargo_nombre") or "",
            "rol_nombre":       rol_nombre if rol_nombre is not None else usuario.get("rol_nombre"),
            "contrato_id":      usuario.get("contrato_id"),
            "contrato_numero":  usuario.get("contrato_numero"),
            "accion":           accion,
            "modulo":           modulo,
            "entidad_tipo":     entidad_tipo,
            "entidad_id":       str(entidad_id) if entidad_id is not None else None,
            "detalle":          _json_for_log(detalle) if detalle is not None else {},
            "resultado":        resultado,
            "valor_anterior":   _json_for_log(valor_anterior),
            "valor_nuevo":      _json_for_log(valor_nuevo),
            "ip":               ip,
            "categoria":        categoria,
            "severidad":        severidad,
            "endpoint":         (endpoint or "")[:1024] if endpoint else None,
            "metodo_http":      (metodo_http or "")[:32] if metodo_http else None,
            "stack_trace":      (stack_trace or "")[:12000] if stack_trace else None,
            "duracion_ms":      duracion_ms,
            "alerta_generada":  alerta_generada if alerta_generada is not None else False,
        }
        supabase.table("logs").insert(row).execute()
    except Exception:
        pass


def _track_login_failure_alert(email: str, ip: str):
    import time
    now = time.time()
    key = (email.strip().lower(), ip or "")
    q = _login_fail_tracker.setdefault(key, [])
    q.append(now)
    cutoff = now - 900
    while q and q[0] < cutoff:
        q.pop(0)
    if len(q) >= 5:
        try:
            registrar_log_sistema(
                "WARNING",
                "/auth/login",
                "POST",
                {"email": email, "ip": ip, "ventana_seg": 900, "intentos": len(q)},
                None,
                resultado="alerta",
                alerta_generada=True,
            )
        except Exception:
            pass
        q.clear()


def _track_500_endpoint_alert(path: str):
    import time
    now = time.time()
    q = _endpoint_500_tracker.setdefault(path, [])
    q.append(now)
    cutoff = now - 300
    while q and q[0] < cutoff:
        q.pop(0)
    if len(q) >= 3:
        try:
            registrar_log_sistema(
                "ERROR",
                path,
                "—",
                {"tipo": "error_500_repetido", "ventana_seg": 300, "conteo": len(q)},
                None,
                resultado="alerta",
                alerta_generada=True,
            )
        except Exception:
            pass
        q.clear()


def _cargo_puede_auditar_logs(current_user) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        u = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = u[0] if u else None
        if not u or not u.get("cargo_id"):
            return False
        c = supabase.table("cargos").select("nombre").eq("id", u["cargo_id"]).limit(1).execute().data
        c = c[0] if c else None
        n = ((c or {}).get("nombre") or "").strip().lower()
        return n in ("desarrollador", "administrador")
    except Exception:
        return False


def _es_desarrollador(current_user) -> bool:
    """Solo el cargo Desarrollador (no Administrador): acciones destructivas de desarrollo."""
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        u = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = u[0] if u else None
        if not u or not u.get("cargo_id"):
            return False
        c = supabase.table("cargos").select("nombre").eq("id", u["cargo_id"]).limit(1).execute().data
        c = c[0] if c else None
        n = ((c or {}).get("nombre") or "").strip().lower()
        return n == "desarrollador"
    except Exception:
        return False


# ─────────────────────────────────────────────
# SEGURIDAD
# ─────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str):
    return pwd_context.verify(plain, hashed)

def create_token(data: dict):
    payload = data.copy()
    payload.update({"exp": datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")


def _calculo_usuario_label(current_user) -> str:
    """Etiqueta legible del usuario autenticado (JWT) para auditoría de recálculo."""
    if not current_user:
        return ""
    n = (current_user.get("nombre") or "").strip()
    if n:
        return n
    e = (current_user.get("email") or "").strip()
    if e:
        return e
    s = current_user.get("sub")
    return f"Usuario {s}" if s is not None else "—"


def require_logs_auditoria(current_user=Depends(get_current_user)):
    if not _cargo_puede_auditar_logs(current_user):
        raise HTTPException(status_code=403, detail="Solo Desarrollador y Administrador pueden acceder a la auditoría de logs")
    return current_user


def _caller_contract_scope(current_user):
    """Retorna (contrato_id, cargo_nombre) del usuario autenticado."""
    try:
        caller_id = int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")

    caller_data = supabase.table("usuarios").select("cargo_id, contrato_id").eq("id", caller_id).single().execute().data
    if not caller_data:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    cargo_nombre = ""
    cargo_id = caller_data.get("cargo_id")
    if cargo_id:
        c = supabase.table("cargos").select("nombre").eq("id", cargo_id).single().execute().data
        cargo_nombre = (c or {}).get("nombre", "")
    return caller_data.get("contrato_id"), (cargo_nombre or "").strip().lower()

def _require_contract_access(current_user, contrato_id: int):
    """Bloquea acceso si intenta consultar un contrato distinto al propio."""
    caller_contrato, _ = _caller_contract_scope(current_user)
    if caller_contrato and int(caller_contrato) != int(contrato_id):
        raise HTTPException(status_code=403, detail="No tienes acceso a información de otro contrato")

from informes import router as informes_router
app.include_router(informes_router, prefix="/informes")

# Vista previa JSON (CC-SUB-001 / CC-SUB-002): registrado aquí porque en algunos equipos el router
# importado desde informes.py no exponía estas rutas en OpenAPI (Not Found en el cliente).
from informes import _respuesta_json_corte, _respuesta_json_memoria


@app.get("/informes/{contrato_id}/datos/corte-subcontratista/{corte_id}")
def informes_datos_corte_sub(contrato_id: int, corte_id: int, current_user=Depends(get_current_user)):
    return _respuesta_json_corte(contrato_id, corte_id, current_user)


@app.get("/informes/{contrato_id}/vista-json/corte-sub/{corte_id}")
def informes_vista_json_corte_sub(contrato_id: int, corte_id: int, current_user=Depends(get_current_user)):
    return _respuesta_json_corte(contrato_id, corte_id, current_user)


@app.get("/informes/{contrato_id}/datos/memoria-item/{corte_id}")
def informes_datos_memoria_item(
    contrato_id: int,
    corte_id: int,
    item_numero: str = Query(...),
    current_user=Depends(get_current_user),
):
    return _respuesta_json_memoria(contrato_id, corte_id, item_numero, current_user)


@app.get("/informes/{contrato_id}/vista-json/memoria/{corte_id}")
def informes_vista_json_memoria(
    contrato_id: int,
    corte_id: int,
    item_numero: str = Query(...),
    current_user=Depends(get_current_user),
):
    return _respuesta_json_memoria(contrato_id, corte_id, item_numero, current_user)


# ── Mapa de cargo_id → campo de validación en so_registros ───────────────────
CARGO_ID_NIVEL_MAP = {
    54: 'nivel1_estado',   # Inspector de Obra
    44: 'nivel2_estado',   # Residente de Obra
    45: 'nivel2_estado',   # Cargo migrado Bubble (nivel 2)
    51: 'nivel2_estado',   # Cargo migrado Bubble (nivel 2)
    56: 'nivel2_estado',   # Director de Obra
    50: 'nivel3_estado',   # Residente de Interventoría
    58: 'nivel3_estado',   # Director de Interventoría
}

CARGO_NIVEL_PRERREQUISITO = {
    'nivel2_estado': ('nivel1_estado', 'Aprobado'),
    'nivel3_estado': ('nivel2_estado', 'Aprobado'),
}


def _estado_registro_eq_desde_filtro_ui(evp: str) -> str:
    """Alinea plural de la UI con el valor almacenado en so_registros."""
    p = (evp or "").strip()
    m = {
        "Aprobados": "Aprobado",
        "Pendientes": "Pendiente",
        "Rechazados": "Rechazado",
    }
    return m.get(p, p)


def _parse_validacion_capas_param(
    validacion_capas: Optional[str],
    cargo_id: Optional[int],
    estado_validacion: Optional[str],
) -> List[dict]:
    out: List[dict] = []
    if validacion_capas and str(validacion_capas).strip():
        try:
            raw = json.loads(validacion_capas)
            if isinstance(raw, list):
                for c in raw:
                    if not isinstance(c, dict) or c.get("cargo_id") is None:
                        continue
                    est = (c.get("estado") or "").strip()
                    if not est:
                        continue
                    out.append({"cargo_id": int(c["cargo_id"]), "estado": est})
        except (json.JSONDecodeError, TypeError, ValueError, KeyError):
            pass
    if not out and cargo_id is not None and (estado_validacion or "").strip():
        out = [{"cargo_id": int(cargo_id), "estado": str(estado_validacion).strip()}]
    return out


def _so_registros_q_y_capas_validacion(
    q,
    capas: List[dict],
    pk_id_val,
    tramo_v,
    costado_v,
    cap_v,
    sub_v,
    item_v,
):
    """AND en la misma fila de so_registros: todas las capas (cargo+estado) a la vez."""
    for capa in capas:
        cv = int(capa["cargo_id"])
        evp = (capa.get("estado") or "").strip()
        if not evp:
            continue
        fld = CARGO_ID_NIVEL_MAP.get(cv)
        if not fld:
            continue
        prereq = CARGO_NIVEL_PRERREQUISITO.get(fld)
        if prereq:
            q = q.eq(prereq[0], prereq[1])
        if evp in ("No Revisado", "No Revisados"):
            q = _so_reg_or_pendiente_nivel(q, fld)
        else:
            evq = _estado_registro_eq_desde_filtro_ui(evp)
            q = q.eq(fld, evq)
        if _es_validacion_avanzada(fld):
            q = _so_reg_item_asignado(q)
    if pk_id_val is not None:
        q = q.eq("pk_id_id", pk_id_val)
    if tramo_v:
        q = q.eq("tramo", tramo_v)
    if costado_v:
        q = _so_reg_filtro_costado(q, costado_v)
    if cap_v:
        q = q.eq("capitulo", cap_v)
    if sub_v is not None:
        q = q.eq("subcontratista_id", sub_v)
    if item_v:
        q = q.ilike("item_numero", f"%{item_v}%")
    return q


def _validacion_cualquier_nivel2_o_3(capas: List[dict]) -> bool:
    for c in capas:
        f = CARGO_ID_NIVEL_MAP.get(int(c.get("cargo_id", 0)))
        if f and _es_validacion_avanzada(f):
            return True
    return False

# Nivel 2/3: no listar cantidades en reportes borrador / sin ítem asignado a nivel reporte,
# ni registros sin item_numero (cola de validación solo sobre cantidades listas).
NIVEL_FIELD_VALIDACION_AVANZADA = ('nivel2_estado', 'nivel3_estado')
ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA = ('Borrador', 'Sin Asignar Ítem')


def _so_reportes_estado_valores_desde_filtro_ui(estado: Optional[str]) -> Optional[List[str]]:
    """La grilla filtra con etiquetas en plural (Aprobados, …); en BD puede haber plural o singular."""
    if estado is None or not str(estado).strip():
        return None
    s = str(estado).strip()
    plur_sing = {
        "Aprobados": ("Aprobados", "Aprobado"),
        "Pendientes": ("Pendientes", "Pendiente"),
        "Rechazados": ("Rechazados", "Rechazado"),
        "No Revisados": ("No Revisados", "No Revisado"),
    }
    if s in plur_sing:
        return list(plur_sing[s])
    sl = s.lower()
    if "sin asignar" in sl and "item" in sl.replace("í", "i"):
        return list({
            "Sin Asignar Ítem", "Sin Asignar Item", "sin asignar ítem", "SIN ASIGNAR ITEM",
        })
    return [s]


def _estado_filtro_omite_validacion_por_cargo(estado: Optional[str]) -> bool:
    """Borrador / Sin asignar ítem: cola distinta a validación N1–N3; no combinar con filtro por cargo."""
    if estado is None or not str(estado).strip():
        return False
    sl = str(estado).strip().lower()
    if sl == "borrador":
        return True
    if "sin asignar" in sl and "item" in sl.replace("í", "i"):
        return True
    return False


def _so_reportes_q_por_estado(q, estado: Optional[str]):
    """Aplica filtro por estado de cabecera (OR entre variantes plural/singular)."""
    evs = _so_reportes_estado_valores_desde_filtro_ui(estado)
    if not evs:
        return q
    if len(evs) == 1:
        return q.eq("estado", evs[0])
    return q.in_("estado", evs)


def _es_validacion_avanzada(nivel_field: Optional[str]) -> bool:
    return nivel_field in NIVEL_FIELD_VALIDACION_AVANZADA


def _so_reg_item_asignado(q):
    """Registro con ítem asignado (no null ni cadena vacía)."""
    return q.not_.is_("item_numero", "null").neq("item_numero", "")


def _filtrar_reporte_ids_excl_estados(contrato_id: int, reporte_ids: list, excluir: tuple) -> list:
    """Solo IDs de reportes cuyo estado en so_reportes no está en excluir."""
    if not reporte_ids:
        return []
    out: List[int] = []
    step = 200
    for i in range(0, len(reporte_ids), step):
        chunk = reporte_ids[i:i + step]

        def _page(c=chunk):
            return supabase.table("so_reportes").select("id, estado")\
                .eq("contrato_id", contrato_id).in_("id", c).execute().data
        for row in supabase_execute(_page):
            e = row.get("estado")
            if e not in excluir and row.get("id") is not None:
                out.append(row["id"])
    return out


def _so_reg_or_pendiente_nivel(q, nivel_field: str):
    """(campo IS NULL OR campo = 'No Revisado'). PostgREST exige comillas en valores con espacio."""
    return q.or_(f'{nivel_field}.is.null,{nivel_field}.eq."No Revisado"')


def _so_reg_filtro_costado(q, valor: Optional[str]):
    """Barra 'costado': opciones vienen de cabecera (calzada). En línea el valor suele estar en
    calzada (columna Excel CALZADA); datos antiguos pueden usar margen."""
    if valor is None:
        return q
    s = str(valor).strip()
    if not s:
        return q
    esc = s.replace('"', '""')
    return q.or_(f'calzada.eq."{esc}",margen.eq."{esc}"')


def _so_reg_filtro_abs_solape(q, abs_inicio: Optional[float], abs_final: Optional[float]):
    """Abscisa en línea: solape del tramo [abs_inicio, abs_final] del registro con el rango filtrado."""
    if abs_inicio is None and abs_final is None:
        return q
    q = q.not_.is_("abs_inicio", "null").not_.is_("abs_final", "null")
    if abs_inicio is not None:
        q = q.gte("abs_final", abs_inicio)
    if abs_final is not None:
        q = q.lte("abs_inicio", abs_final)
    return q


def _sicoe_parse_nodo_tokens(q: Optional[str]) -> list:
    if not q or not str(q).strip():
        return []
    return [t for t in re.split(r"[\s,;/]+", str(q).strip()) if t]


def _sicoe_norm_txt(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def _sicoe_row_match_nodo_tokens(tokens: list, *vals) -> bool:
    if not tokens:
        return True
    hay = " ".join(_sicoe_norm_txt(v) for v in vals)
    for tok in tokens:
        t = _sicoe_norm_txt(tok)
        if t and t not in hay:
            return False
    return True


def _sicoe_reporte_ids_coinciden_nodo(
    contrato_id: int,
    q_nodo: str,
    reporte_ids_prev: Optional[list],
) -> Optional[set]:
    """
    None = no aplicar filtro.
    set vacío = sin coincidencias.
    set no vacío = IDs de reporte que cumplen (cabecera nodo_ini/nodo_fin y/o líneas no_inicio/no_final).
    """
    if not q_nodo or not str(q_nodo).strip():
        return None
    tokens = _sicoe_parse_nodo_tokens(q_nodo)
    if not tokens:
        return None

    def _ids_para_token(tok: str) -> set:
        s_rep: set = set()
        pat = f"%{tok}%"
        if reporte_ids_prev is not None:
            if not reporte_ids_prev:
                return set()
            for i in range(0, len(reporte_ids_prev), 200):
                chunk = reporte_ids_prev[i : i + 200]

                def _qc(c=chunk):
                    try:
                        return supabase.table("so_reportes").select("id").eq("contrato_id", contrato_id).in_("id", c).or_(
                            f"nodo_ini.ilike.{pat},nodo_fin.ilike.{pat}"
                        ).limit(50000).execute().data
                    except Exception:
                        return []

                for row in supabase_execute(_qc):
                    if row.get("id"):
                        s_rep.add(row["id"])
        else:
            try:
                def _qa():
                    return supabase.table("so_reportes").select("id").eq("contrato_id", contrato_id).or_(
                        f"nodo_ini.ilike.{pat},nodo_fin.ilike.{pat}"
                    ).limit(50000).execute().data

                for row in supabase_execute(_qa):
                    if row.get("id"):
                        s_rep.add(row["id"])
            except Exception:
                pass
        s_reg: set = set()
        if reporte_ids_prev is not None:
            if not reporte_ids_prev:
                return set()
            for i in range(0, len(reporte_ids_prev), 200):
                chunk = reporte_ids_prev[i : i + 200]

                def _rc(c=chunk):
                    try:
                        return supabase.table("so_registros").select("reporte_id, no_inicio, no_final").eq("contrato_id", contrato_id).in_("reporte_id", c).execute().data
                    except Exception:
                        return []

                for row in supabase_execute(_rc):
                    if _sicoe_row_match_nodo_tokens([tok], row.get("no_inicio"), row.get("no_final")):
                        rid = row.get("reporte_id")
                        if rid:
                            s_reg.add(rid)
        else:
            off = 0
            while True:
                def _rb(o=off):
                    try:
                        return supabase.table("so_registros").select("reporte_id, no_inicio, no_final").eq("contrato_id", contrato_id).range(o, o + 999).execute().data
                    except Exception:
                        return []

                batch = supabase_execute(_rb)
                for row in batch:
                    if _sicoe_row_match_nodo_tokens([tok], row.get("no_inicio"), row.get("no_final")):
                        rid = row.get("reporte_id")
                        if rid:
                            s_reg.add(rid)
                if len(batch) < 1000:
                    break
                off += 1000
        return s_rep | s_reg

    out: Optional[set] = None
    for tok in tokens:
        s_tok = _ids_para_token(tok)
        if out is None:
            out = s_tok
        else:
            out &= s_tok
        if not out:
            return set()
    return out


def _sicoe_reporte_ids_abs_solapa_registros(
    contrato_id: int,
    q_abs0: Optional[float],
    q_abs1: Optional[float],
    reporte_ids_prev: Optional[list],
) -> Optional[set]:
    """
    Filtro tipo Excel sobre abscisas en líneas (so_registros).

    Un registro con tramo [a, b] se incluye si se solapa con el rango solicitado [q_abs0, q_abs1]:
    a <= q_abs1 y b >= q_abs0 (con ambos límites del query opcionales).

    None = no hay filtro de abscisa.
    set() = ningún reporte cumple.
    """
    if q_abs0 is None and q_abs1 is None:
        return None
    if reporte_ids_prev is not None and len(reporte_ids_prev) == 0:
        return set()

    out: set = set()
    CHUNK = 200

    def _apply_solape(q):
        q = q.not_.is_("abs_inicio", "null").not_.is_("abs_final", "null")
        if q_abs0 is not None:
            q = q.gte("abs_final", q_abs0)
        if q_abs1 is not None:
            q = q.lte("abs_inicio", q_abs1)
        return q

    if reporte_ids_prev is not None:
        for i in range(0, len(reporte_ids_prev), CHUNK):
            chunk = reporte_ids_prev[i : i + CHUNK]

            def _page(c=chunk):
                q = supabase.table("so_registros").select("reporte_id").eq("contrato_id", contrato_id).in_("reporte_id", c)
                return _apply_solape(q).limit(50000).execute().data

            for row in supabase_execute(_page):
                rid = row.get("reporte_id")
                if rid:
                    out.add(rid)
    else:
        off = 0
        while True:
            def _page(o=off):
                q = supabase.table("so_registros").select("reporte_id").eq("contrato_id", contrato_id)
                return _apply_solape(q).range(o, o + 999).execute().data

            batch = supabase_execute(_page)
            for row in batch:
                rid = row.get("reporte_id")
                if rid:
                    out.add(rid)
            if len(batch) < 1000:
                break
            off += 1000
    return out


def _sicoe_ocultar_costo_directo_reportes(current_user) -> bool:
    """Operativo Contratista / Interventoría no reciben montos en la grilla SICOE Obra."""
    rol = (current_user.get("rol_nombre") or "").strip().lower()
    return rol in ("operativo contratista", "operativo interventoria", "operativo interventoría")


def _filtrar_registros_validacion_sicoe(
    regs: list,
    cargo_id: Optional[int],
    estado_validacion: Optional[str],
    reporte_row: Optional[dict] = None,
) -> list:
    """Misma semántica que la búsqueda por cargo: nivel 2/3 solo si cumple prerrequisito del nivel previo."""
    if not regs or cargo_id is None or not (estado_validacion or "").strip():
        return regs
    fld = CARGO_ID_NIVEL_MAP.get(cargo_id)
    if not fld:
        return regs
    if _es_validacion_avanzada(fld) and reporte_row is not None:
        if reporte_row.get("estado") in ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA:
            return []
    prereq = CARGO_NIVEL_PRERREQUISITO.get(fld)
    ev = estado_validacion.strip()
    out: List[dict] = []
    for reg in regs:
        if _es_validacion_avanzada(fld):
            if not (reg.get("item_numero") or "").strip():
                continue
        if prereq and reg.get(prereq[0]) != prereq[1]:
            continue
        cur = reg.get(fld)
        if ev in ("No Revisado", "No Revisados"):
            if cur is None or str(cur).strip() in ("", "No Revisado"):
                out.append(reg)
        else:
            if cur == ev:
                out.append(reg)
    return out


def _filtrar_registros_validacion_capas_sicoe(
    regs: list,
    capas: List[dict],
    reporte_row: Optional[dict] = None,
) -> list:
    """Misma semántica AND que _so_registros_q_y_capas_validacion, en memoria (detalle de reporte)."""
    if not capas:
        return regs
    out = regs
    for c in capas:
        out = _filtrar_registros_validacion_sicoe(
            out, int(c["cargo_id"]), c.get("estado"), reporte_row
        )
    return out


# ─────────────────────────────────────────────
# RUTAS PÚBLICAS
# ─────────────────────────────────────────────

@app.post("/frase-del-dia")
def frase_del_dia(body: dict, current_user=Depends(get_current_user)):
    frases_fallback = [
        {"frase": "El avance de hoy construye el resultado de mañana.", "autor": "ClaraCore", "tipo": "motivadora"},
        {"frase": "La disciplina diaria convierte grandes obras en realidad.", "autor": "ClaraCore", "tipo": "reflexiva"},
        {"frase": "Todo tiene su tiempo, y todo lo que se quiere debajo del cielo tiene su hora.", "autor": "Eclesiastés 3:1", "tipo": "bíblica"},
        {"frase": "La calidad no se improvisa: se decide en cada detalle.", "autor": "ClaraCore", "tipo": "reflexiva"},
        {"frase": "Mantente firme: cada paso bien hecho cuenta.", "autor": "ClaraCore", "tipo": "motivadora"},
    ]
    def _fallback():
        idx = datetime.utcnow().toordinal() % len(frases_fallback)
        return frases_fallback[idx]

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback()
    nombre = body.get("nombre", "un profesional")
    turno  = body.get("turno", "día")
    dia    = body.get("dia", "hoy")
    try:
        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5",
                "max_tokens": 300,
                "messages": [{
                    "role": "user",
                    "content": f"Genera una frase inspiradora, reflexiva o bíblica para {nombre} que trabaja en construcción de obras públicas. Hoy es {dia}, en la {turno}. Responde SOLO en este formato JSON sin backticks ni texto adicional: {{\"frase\":\"texto\",\"autor\":\"fuente\",\"tipo\":\"reflexiva|motivadora|bíblica\"}}"
                }]
            },
            timeout=20.0
        )
        data = res.json()
        if "content" not in data:
            return _fallback()
        import json as _json
        texto = data["content"][0]["text"]
        try:
            parsed = _json.loads(texto.replace("```json","").replace("```","").strip())
        except Exception:
            return _fallback()
        if not isinstance(parsed, dict) or not parsed.get("frase"):
            return _fallback()
        parsed["autor"] = parsed.get("autor") or "ClaraCore"
        parsed["tipo"] = parsed.get("tipo") if parsed.get("tipo") in ["reflexiva", "motivadora", "bíblica"] else "reflexiva"
        return parsed
    except HTTPException:
        raise
    except Exception as e:
        print(f"WARNING /frase-del-dia fallback por error: {e}", flush=True)
        return _fallback()


_SLOW_REQUEST_MS = int(os.getenv("CLARACORE_SLOW_REQUEST_MS", "8000"))


@app.middleware("http")
async def registrar_respuesta_lenta(request: Request, call_next):
    import time
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = int((time.perf_counter() - t0) * 1000)
    if ms >= _SLOW_REQUEST_MS:
        try:
            registrar_log_sistema(
                "WARNING",
                request.url.path,
                request.method,
                {"tipo": "respuesta_lenta", "duracion_ms": ms},
                None,
                resultado="ok",
                duracion_ms=ms,
            )
        except Exception:
            pass
    return response


# Debe ir después de todos los @app.middleware("http") para quedar como capa externa y que
# todas las respuestas (incl. cortocircuitos 403) lleven cabeceras CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https://([a-z0-9-]+\.)*claracore\.co$|^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.get("/")
def root():
    return {"message": "ClaraCore API funcionando"}


@app.get("/healthz")
def healthz():
    """Sin Supabase ni lógica pesada — útil para keep-alive y comprobar que el worker responde (Azure cold start)."""
    return {"ok": True}

@app.get("/cargos")
def listar_cargos():
    return supabase.table("cargos").select("*").order("nombre").execute().data

@app.get("/roles")
def listar_roles():
    return supabase.table("roles").select("*").order("nombre").execute().data

@app.get("/contratos")
def listar_contratos():
    return supabase.table("contratos").select("id, numero, objeto, contratista, nit, interventoria, entidad, entidad_otra, logo_entidad, plano_geojson, centro_lat, centro_lng, logo_contratista, logo_interventoria, fase").order("numero").execute().data

@app.post("/auth/login")
def login(request: Request, body: LoginRequest):
    ip = _client_ip(request)
    result = supabase.table("usuarios").select("*").eq("email", body.email).execute()
    if not result.data:
        registrar_log(
            {"nombre": "", "email": body.email},
            "LOGIN_FAIL", "AUTH", None, None,
            {"motivo": "usuario_no_encontrado", "email": body.email},
            resultado="fallido",
            ip=ip,
            severidad="WARNING",
        )
        _track_login_failure_alert(body.email, ip)
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    usuario = result.data[0]
    if not verify_password(body.password, usuario["password_hash"]):
        registrar_log(
            {"sub": str(usuario["id"]), "nombre": usuario.get("nombre", ""), "email": body.email,
             "cargo_nombre": "", "contrato_id": usuario.get("contrato_id")},
            "LOGIN_FAIL", "AUTH", "usuario", str(usuario["id"]),
            {"motivo": "password_incorrecto"},
            resultado="fallido",
            ip=ip,
            severidad="WARNING",
        )
        _track_login_failure_alert(body.email, ip)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    if usuario.get("estado") == "pendiente":
        registrar_log(
            {"sub": str(usuario["id"]), "nombre": usuario.get("nombre", ""), "email": body.email,
             "contrato_id": usuario.get("contrato_id")},
            "LOGIN_FAIL", "AUTH", "usuario", str(usuario["id"]),
            {"motivo": "cuenta_pendiente"},
            resultado="denegado",
            ip=ip,
            severidad="WARNING",
        )
        raise HTTPException(status_code=403, detail="Tu cuenta está pendiente de aprobación")
    if usuario.get("estado") == "rechazado":
        registrar_log(
            {"sub": str(usuario["id"]), "nombre": usuario.get("nombre", ""), "email": body.email},
            "LOGIN_FAIL", "AUTH", "usuario", str(usuario["id"]),
            {"motivo": "cuenta_rechazada"},
            resultado="denegado",
            ip=ip,
            severidad="WARNING",
        )
        raise HTTPException(status_code=403, detail="Tu cuenta fue rechazada")

    cargo_nombre = None
    if usuario.get("cargo_id"):
        r = supabase.table("cargos").select("nombre").eq("id", usuario["cargo_id"]).execute()
        if r.data: cargo_nombre = r.data[0]["nombre"]

    rol_nombre = None
    if usuario.get("rol_id"):
        r = supabase.table("roles").select("nombre").eq("id", usuario["rol_id"]).execute()
        if r.data: rol_nombre = r.data[0]["nombre"]

    contrato_numero = None
    logo_contratista = None
    logo_interventoria = None
    if usuario.get("contrato_id"):
        r = supabase.table("contratos").select("numero, logo_contratista, logo_interventoria").eq("id", usuario["contrato_id"]).execute()
        if r.data:
            contrato_numero = r.data[0]["numero"]
            logo_contratista = r.data[0].get("logo_contratista")
            logo_interventoria = r.data[0].get("logo_interventoria")

    nombre_completo = f"{usuario.get('nombre','')} {usuario.get('apellidos','')}".strip()
    token = create_token({
        "sub": str(usuario["id"]),
        "email": usuario["email"],
        "nombre": nombre_completo or usuario.get("nombre") or "",
        "cargo_nombre": cargo_nombre or "",
        "rol_nombre": rol_nombre or "",
        "contrato_id": usuario.get("contrato_id"),
        "contrato_numero": contrato_numero or "",
    })

    # Cargar permisos del cargo para control de acceso en el panel
    permisos = []
    if usuario.get("cargo_id"):
        permisos_raw = supabase.table("permisos").select("*").eq("cargo_id", usuario["cargo_id"]).execute().data
        funciones_rows = supabase.table("funciones").select("id, nombre").execute().data
        funciones_map = {f["id"]: f["nombre"] for f in funciones_rows}
        permisos = [{**p, "funcion_nombre": funciones_map.get(p["funcion_id"], "")} for p in permisos_raw]
    # Hotfix: garantizar exportación para Desarrollador en cualquier contrato
    if cargo_nombre and cargo_nombre.strip().lower() == "desarrollador":
        permisos = [{**p, "exportar": True, "ver": True} for p in (permisos or [])]
        if not any((p.get("funcion_nombre") or "").strip().lower() == "reporte de cantidades" for p in permisos):
            funcion_id = None
            try:
                fr = supabase.table("funciones").select("id,nombre").ilike("nombre", "Reporte de Cantidades").limit(1).execute().data
                if fr:
                    funcion_id = fr[0].get("id")
            except Exception:
                funcion_id = None
            permisos.append({
                "id": None,
                "cargo_id": usuario.get("cargo_id"),
                "funcion_id": funcion_id,
                "funcion_nombre": "Reporte de Cantidades",
                "ver": True,
                "crear": True,
                "editar": True,
                "eliminar": True,
                "validar": True,
                "exportar": True,
            })
    # C3: Subcontratista sin subcontratista asignado → sin acceso
    if cargo_nombre and cargo_nombre.lower() == 'subcontratista' and not usuario.get('subcontratista_id'):
        permisos = []

    registrar_log(
        {"sub": str(usuario["id"]), "nombre": nombre_completo or usuario.get("nombre", ""),
         "cargo_nombre": cargo_nombre, "contrato_id": usuario.get("contrato_id"),
         "contrato_numero": contrato_numero, "rol_nombre": rol_nombre},
        "LOGIN", "AUTH", "usuario", str(usuario["id"]),
        {"email": usuario["email"], "cargo": cargo_nombre, "contrato": contrato_numero},
        ip=ip,
        rol_nombre=rol_nombre,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario["id"],
            "nombre": usuario["nombre"],
            "apellidos": usuario.get("apellidos"),
            "email": usuario["email"],
            "cargo_id": usuario.get("cargo_id"),
            "cargo_nombre": cargo_nombre,
            "rol_id": usuario.get("rol_id"),
            "rol_nombre": rol_nombre,
            "contrato_id": usuario.get("contrato_id"),
            "contrato_numero": contrato_numero,
            "logo_contratista": logo_contratista,
            "logo_interventoria": logo_interventoria,
            "estado": usuario.get("estado"),
            "activo": usuario.get("activo"),
            "subcontratista_id": usuario.get("subcontratista_id"),
            "permisos": permisos,
            "fecha_nacimiento": usuario.get("fecha_nacimiento"),
            "foto_perfil_url": usuario.get("foto_perfil_url"),
            "firma_imagen_url": usuario.get("firma_imagen_url"),
            "politicas_aceptadas": usuario.get("politicas_aceptadas") is True,
            "politicas_fecha": usuario.get("politicas_fecha"),
            "politicas_version": usuario.get("politicas_version"),
            "politicas_ip": usuario.get("politicas_ip"),
        }
    }

@app.post("/usuarios/registro")
def registro_usuario(usuario: UsuarioRegistro):
    existe = supabase.table("usuarios").select("id").eq("email", usuario.email).execute()
    if existe.data:
        raise HTTPException(status_code=400, detail="Este correo ya está registrado")
    hashed = hash_password(usuario.password)
    supabase.table("usuarios").insert({
        "nombre": usuario.nombre,
        "apellidos": usuario.apellidos,
        "email": usuario.email,
        "password_hash": hashed,
        "cargo_id": usuario.cargo_id,
        "contrato_id": usuario.contrato_id,
        "activo": False,
        "estado": "pendiente"
    }).execute()
    return {"mensaje": "Registro exitoso, pendiente de aprobación"}

# ─────────────────────────────────────────────
# RUTAS AUTENTICADAS
# ─────────────────────────────────────────────

@app.get("/usuarios/me")
def get_mi_usuario(current_user=Depends(get_current_user)):
    """Devuelve el perfil actualizado del usuario en sesión."""
    uid = int(current_user["sub"])
    sb = get_supabase()
    try:
        result = sb.table("usuarios").select("*").eq("id", uid).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u = result.data[0]
    cargo_nombre = None
    if u.get("cargo_id"):
        try:
            r = sb.table("cargos").select("nombre").eq("id", u["cargo_id"]).execute()
            if r.data: cargo_nombre = r.data[0]["nombre"]
        except Exception: pass
    rol_nombre = None
    if u.get("rol_id"):
        try:
            r = sb.table("roles").select("nombre").eq("id", u["rol_id"]).execute()
            if r.data: rol_nombre = r.data[0]["nombre"]
        except Exception: pass
    permisos = []
    if u.get("cargo_id"):
        try:
            permisos_raw = sb.table("permisos").select("*").eq("cargo_id", u["cargo_id"]).execute().data
            funciones_rows = sb.table("funciones").select("id, nombre").execute().data
            funciones_map = {f["id"]: f["nombre"] for f in funciones_rows}
            permisos = [{**p, "funcion_nombre": funciones_map.get(p["funcion_id"], "")} for p in permisos_raw]
        except Exception:
            permisos_raw = []
    # Hotfix: garantizar exportación para Desarrollador en cualquier contrato
    if cargo_nombre and cargo_nombre.strip().lower() == "desarrollador":
        permisos = [{**p, "exportar": True, "ver": True} for p in (permisos or [])]
        if not any((p.get("funcion_nombre") or "").strip().lower() == "reporte de cantidades" for p in permisos):
            funcion_id = None
            try:
                fr = sb.table("funciones").select("id,nombre").ilike("nombre", "Reporte de Cantidades").limit(1).execute().data
                if fr:
                    funcion_id = fr[0].get("id")
            except Exception:
                funcion_id = None
            permisos.append({
                "id": None,
                "cargo_id": u.get("cargo_id"),
                "funcion_id": funcion_id,
                "funcion_nombre": "Reporte de Cantidades",
                "ver": True,
                "crear": True,
                "editar": True,
                "eliminar": True,
                "validar": True,
                "exportar": True,
            })
    if cargo_nombre and cargo_nombre.lower() == 'subcontratista' and not u.get('subcontratista_id'):
        permisos = []
    return {
        "id": u["id"], "nombre": u["nombre"], "apellidos": u.get("apellidos"),
        "email": u["email"], "cargo_id": u.get("cargo_id"), "cargo_nombre": cargo_nombre,
        "rol_id": u.get("rol_id"), "rol_nombre": rol_nombre,
        "contrato_id": u.get("contrato_id"), "estado": u.get("estado"), "activo": u.get("activo"),
        "subcontratista_id": u.get("subcontratista_id"),
        "permisos": permisos,
        "fecha_nacimiento": u.get("fecha_nacimiento"),
        "foto_perfil_url": u.get("foto_perfil_url"),
        "firma_imagen_url": u.get("firma_imagen_url"),
        "politicas_aceptadas": u.get("politicas_aceptadas") is True,
        "politicas_fecha": u.get("politicas_fecha"),
        "politicas_version": u.get("politicas_version"),
        "politicas_ip": u.get("politicas_ip"),
    }

@app.post("/usuarios/me/politicas-aceptar")
def aceptar_politicas_confidencialidad(request: Request, current_user=Depends(get_current_user)):
    """Registra aceptación de políticas (versión, fecha UTC, IP). Permite usar el resto de la API."""
    uid = int(current_user["sub"])
    ip = _client_ip(request)
    ver = POLITICAS_VERSION_DEFAULT
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        sb = get_supabase()
        sb.table("usuarios").update({
            "politicas_aceptadas": True,
            "politicas_fecha": now_iso,
            "politicas_version": ver,
            "politicas_ip": ip or None,
        }).eq("id", uid).execute()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"No se pudo registrar la aceptación: {e}")
    politicas_cache_invalidate(uid)
    return {
        "politicas_aceptadas": True,
        "politicas_fecha": now_iso,
        "politicas_version": ver,
        "politicas_ip": ip or None,
    }

@app.put("/usuarios/me")
def actualizar_mi_perfil(body: PerfilUpdate, current_user=Depends(get_current_user)):
    """El usuario edita nombre, apellidos y fecha de cumpleaños."""
    uid = int(current_user["sub"])
    sb = get_supabase()
    data = {}
    if body.nombre is not None:
        data["nombre"] = (body.nombre or "").strip()
    if body.apellidos is not None:
        data["apellidos"] = (body.apellidos or "").strip()
    if body.fecha_nacimiento is not None:
        raw = (body.fecha_nacimiento or "").strip()
        if not raw:
            data["fecha_nacimiento"] = None
        else:
            data["fecha_nacimiento"] = raw[:10]
    if not data:
        return get_mi_usuario(current_user)
    try:
        sb.table("usuarios").update(data).eq("id", uid).execute()
    except Exception as e:
        _log_api.warning("PUT /usuarios/me: %s", e)
        raise HTTPException(
            status_code=503,
            detail="No se pudo guardar el perfil. Si acabas de desplegar, ejecuta backend/sql/usuario_perfil.sql en Supabase.",
        )
    return get_mi_usuario(current_user)


def _ext_desde_content_type(content_type: Optional[str]) -> str:
    c = (content_type or "image/jpeg").split(";")[0].strip().lower()
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(c, ".jpg")


def _usuario_contrato_id(sb, uid: int) -> Optional[int]:
    try:
        r = sb.table("usuarios").select("contrato_id").eq("id", uid).limit(1).execute()
        if r.data:
            cid = r.data[0].get("contrato_id")
            return int(cid) if cid is not None else None
    except Exception:
        pass
    return None


def _usuario_imagen_subir(
    contents: bytes,
    uid: int,
    asset: str,
    content_type: Optional[str],
    contrato_id: Optional[int] = None,
) -> str:
    """
    Sube foto de perfil o imagen de firma.
    Cloudinary: claracore/{contrato_id}/Fotos_de_perfil | Fotos_de_firmas (si no hay contrato: sin_contrato/{uid}/...).
    Supabase: contratos/{id}/perfil|firmas/... o usuarios/{id}/...
    """
    ext = _ext_desde_content_type(content_type)
    ct = (content_type or "image/jpeg").split(";")[0].strip()

    if os.getenv("CLOUDINARY_CLOUD_NAME"):
        import cloudinary.uploader
        _cloudinary_config()
        sub = CLOUDINARY_SUB_PERFIL if asset == "avatar" else CLOUDINARY_SUB_FIRMAS
        public_id = f"usuario_{uid}"
        if contrato_id:
            folder = _cloudinary_folder_contrato(int(contrato_id), sub)
        else:
            folder = f"{CLOUDINARY_ROOT}/sin_contrato/{uid}/{sub}"
        result = cloudinary.uploader.upload(
            contents,
            folder=folder,
            public_id=public_id,
            overwrite=True,
            resource_type="image",
        )
        return result["secure_url"]

    sb = get_supabase()
    bucket = os.getenv("SUPABASE_PERFIL_BUCKET", "claracore-perfiles")
    if contrato_id:
        sub = "perfil" if asset == "avatar" else "firmas"
        path = f"contratos/{contrato_id}/{sub}/u{uid}{ext}"
    else:
        path = f"usuarios/{uid}/{asset}{ext}"
    file_opts = {"content-type": ct, "upsert": "true"}

    def _do_upload():
        sb.storage.from_(bucket).upload(path, contents, file_options=file_opts)

    try:
        _do_upload()
    except Exception as e1:
        msg = str(e1).lower()
        # Bucket inexistente: intentar crear (requiere service_role) y reintentar una vez
        if "bucket" in msg or "not found" in msg or "not_found" in msg or "404" in msg:
            try:
                sb.storage.create_bucket(
                    bucket,
                    options={"public": True, "file_size_limit": 6 * 1024 * 1024},
                )
            except Exception as e_create:
                # Ya existe u otro error: seguimos e intentamos subir de nuevo
                _log_api.warning("create_bucket %s: %s", bucket, e_create)
            try:
                _do_upload()
            except Exception as e2:
                _log_api.warning("Supabase Storage upload %s: %s", path, e2)
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "No se pudo subir la imagen. Crea el bucket en Supabase Storage "
                        f"({bucket}, público) o configura Cloudinary (variables CLOUDINARY_*). "
                        "Puedes usar el script backend/sql/storage_perfil_bucket.sql"
                    ),
                )
        else:
            _log_api.warning("Supabase Storage upload %s: %s", path, e1)
            raise HTTPException(
                status_code=503,
                detail=(
                    "No se pudo subir la imagen a Supabase Storage. "
                    "Comprueba el bucket y la clave SUPABASE (service role recomendada para Storage)."
                ),
            )

    return sb.storage.from_(bucket).get_public_url(path)


def _inicio_novedad_subir_imagen(contents: bytes, content_type: Optional[str]) -> str:
    """Imagen de contexto para novedades de inicio (Cloudinary o Supabase Storage)."""
    if len(contents) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 6 MB.")
    ext = _ext_desde_content_type(content_type)
    ct = (content_type or "image/jpeg").split(";")[0].strip()
    if os.getenv("CLOUDINARY_CLOUD_NAME"):
        import cloudinary.uploader
        _cloudinary_config()
        uid_part = uuid.uuid4().hex[:16]
        result = cloudinary.uploader.upload(
            contents,
            folder=f"{CLOUDINARY_ROOT}/inicio-novedades",
            public_id=f"nov_{uid_part}",
            overwrite=False,
            resource_type="image",
        )
        return result["secure_url"]
    sb = get_supabase()
    bucket = os.getenv("SUPABASE_INICIO_BUCKET", os.getenv("SUPABASE_PERFIL_BUCKET", "claracore-perfiles"))
    path = f"inicio-novedades/{uuid.uuid4().hex}{ext}"
    file_opts = {"content-type": ct, "upsert": "true"}

    def _do_upload():
        sb.storage.from_(bucket).upload(path, contents, file_options=file_opts)

    try:
        _do_upload()
    except Exception as e1:
        msg = str(e1).lower()
        if "bucket" in msg or "not found" in msg or "not_found" in msg or "404" in msg:
            try:
                sb.storage.create_bucket(
                    bucket,
                    options={"public": True, "file_size_limit": 6 * 1024 * 1024},
                )
            except Exception as e_create:
                _log_api.warning("create_bucket inicio novedades %s: %s", bucket, e_create)
            try:
                _do_upload()
            except Exception as e2:
                _log_api.warning("Supabase Storage upload inicio %s: %s", path, e2)
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "No se pudo subir la imagen. Configura Cloudinary (CLOUDINARY_*) "
                        f"o el bucket público {bucket} en Supabase Storage."
                    ),
                )
        else:
            _log_api.warning("Supabase Storage upload inicio %s: %s", path, e1)
            raise HTTPException(status_code=503, detail="No se pudo subir la imagen a Supabase Storage.")
    return sb.storage.from_(bucket).get_public_url(path)


def _detalle_guardar_url_perfil(exc: Exception, campo: str) -> str:
    """Mensaje claro cuando falla el UPDATE (p. ej. columnas inexistentes en usuarios)."""
    raw = str(exc).lower()
    pg_undefined_column = "42703" in raw or "pgrst204" in raw  # Postgres / PostgREST
    if pg_undefined_column or ("column" in raw and ("does not exist" in raw or "undefined column" in raw)):
        return (
            f'La columna "{campo}" no existe en la tabla usuarios. '
            "Abre Supabase → SQL y ejecuta el archivo backend/sql/usuario_perfil.sql "
            "(añade foto_perfil_url, firma_imagen_url y fecha_nacimiento)."
        )
    return (
        "La imagen pudo subirse al almacenamiento, pero no se guardó la URL en usuarios. "
        "Lo más habitual es no haber ejecutado la migración: backend/sql/usuario_perfil.sql en Supabase. "
        f"Detalle: {exc!s}"
    )


@app.post("/usuarios/me/foto-perfil")
async def subir_foto_perfil(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    contents = await file.read()
    if len(contents) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 6 MB.")
    sb = get_supabase()
    cid = _usuario_contrato_id(sb, uid)
    url = _usuario_imagen_subir(contents, uid, "avatar", file.content_type, contrato_id=cid)
    try:
        sb.table("usuarios").update({"foto_perfil_url": url}).eq("id", uid).execute()
    except Exception as e:
        _log_api.warning("POST /usuarios/me/foto-perfil: %s", e)
        raise HTTPException(status_code=503, detail=_detalle_guardar_url_perfil(e, "foto_perfil_url"))
    return {"url": url}


@app.delete("/usuarios/me/foto-perfil")
def quitar_foto_perfil(current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    sb = get_supabase()
    try:
        sb.table("usuarios").update({"foto_perfil_url": None}).eq("id", uid).execute()
    except Exception as e:
        _log_api.warning("DELETE /usuarios/me/foto-perfil: %s", e)
        raise HTTPException(status_code=503, detail="No se pudo actualizar el perfil.")
    return {"ok": True}


@app.post("/usuarios/me/firma-imagen")
async def subir_firma_imagen(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    contents = await file.read()
    if len(contents) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 6 MB.")
    sb = get_supabase()
    cid = _usuario_contrato_id(sb, uid)
    url = _usuario_imagen_subir(contents, uid, "firma", file.content_type, contrato_id=cid)
    try:
        sb.table("usuarios").update({"firma_imagen_url": url}).eq("id", uid).execute()
    except Exception as e:
        _log_api.warning("POST /usuarios/me/firma-imagen: %s", e)
        raise HTTPException(status_code=503, detail=_detalle_guardar_url_perfil(e, "firma_imagen_url"))
    return {"url": url}


@app.delete("/usuarios/me/firma-imagen")
def quitar_firma_imagen(current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    sb = get_supabase()
    try:
        sb.table("usuarios").update({"firma_imagen_url": None}).eq("id", uid).execute()
    except Exception as e:
        _log_api.warning("DELETE /usuarios/me/firma-imagen: %s", e)
        raise HTTPException(status_code=503, detail="No se pudo actualizar el perfil.")
    return {"ok": True}

@app.get("/usuarios")
def listar_usuarios(current_user=Depends(get_current_user)):
    return supabase.table("usuarios").select(
        "id, nombre, apellidos, email, activo, cargo_id, rol_id, contrato_id, estado, created_at"
    ).execute().data

@app.post("/usuarios")
def crear_usuario(usuario: UsuarioCreate, current_user=Depends(get_current_user)):
    hashed = hash_password(usuario.password)
    return supabase.table("usuarios").insert({
        "nombre": usuario.nombre,
        "email": usuario.email,
        "password_hash": hashed,
        "cargo_id": usuario.cargo_id
    }).execute().data

@app.get("/categorias")
def listar_categorias(current_user=Depends(get_current_user)):
    return supabase.table("categorias").select("*").execute().data

@app.get("/funciones")
def listar_funciones(current_user=Depends(get_current_user)):
    funciones = supabase.table("funciones").select("*").order("nombre").execute().data or []
    existentes = {(f.get("nombre") or "").strip().lower() for f in funciones}
    codigos_existentes = {
        str((f.get("codigo") or "")).strip().upper()
        for f in funciones
        if f.get("codigo") is not None and str(f.get("codigo")).strip() != ""
    }
    # Asegurar filas base (Dashboard, Informes CCD). En producción el INSERT vía API a veces
    # falla por RLS o restricciones; en ese caso ejecutar backend/sql/funcion_informes_ccd.sql en Supabase.
    requeridas = [
        {"codigo": "DASHBOARD", "nombre": "Dashboard", "modulo": "Dashboard"},
        {"codigo": "INFCCD", "nombre": "Informes CCD", "modulo": "Informes"},
    ]
    for req in requeridas:
        nombre_funcion = req["nombre"]
        cod = str(req.get("codigo") or "").strip().upper()
        if nombre_funcion.lower() in existentes or (cod and cod in codigos_existentes):
            continue
        try:
            supabase.table("funciones").insert(req).execute()
            existentes.add(nombre_funcion.lower())
            if cod:
                codigos_existentes.add(cod)
        except Exception as e:
            try:
                supabase.table("funciones").upsert(req, on_conflict="codigo").execute()
                existentes.add(nombre_funcion.lower())
                if cod:
                    codigos_existentes.add(cod)
            except Exception as e2:
                _log_api.warning(
                    "/funciones: no se pudo insertar ni upsert '%s' (%s). "
                    "Si falta en el panel admin, ejecuta backend/sql/funcion_informes_ccd.sql en Supabase. "
                    "insert_err=%s | upsert_err=%s",
                    nombre_funcion,
                    req.get("codigo"),
                    e,
                    e2,
                )
    funciones = supabase.table("funciones").select("*").order("nombre").execute().data or []
    return funciones

@app.post("/contratos")
def crear_contrato(contrato: ContratoCreate, current_user=Depends(get_current_user)):
    existe = supabase.table("contratos").select("id").eq("numero", contrato.numero).execute()
    if existe.data:
        raise HTTPException(status_code=400, detail="Ya existe un contrato con ese número")
    result = supabase.table("contratos").insert({
        "numero": contrato.numero,
        "objeto": contrato.objeto,
        "contratista": contrato.contratista,
        "nit": contrato.nit,
        "interventoria": contrato.interventoria,
        "entidad": contrato.entidad,
        "entidad_otra": contrato.entidad_otra,
        "logo_entidad": contrato.logo_entidad,
        "plano_geojson": contrato.plano_geojson,
        "centro_lat": contrato.centro_lat,
        "centro_lng": contrato.centro_lng,
        "logo_contratista": contrato.logo_contratista,
        "logo_interventoria": contrato.logo_interventoria,
    }).execute()
    nuevo = result.data[0]
    try:
        _cloudinary_seed_carpetas_contrato(int(nuevo["id"]))
    except Exception as e:
        _log_api.warning("Tras crear contrato, seed Cloudinary: %s", e)
    return nuevo


@app.post("/contratos/{contrato_id}/cloudinary-sembrar-carpetas")
def contrato_sembrar_carpetas_cloudinary(contrato_id: int, current_user=Depends(get_current_user)):
    """
    Contratos ya existentes (antes de la semilla automática): crea en Cloudinary las cuatro carpetas
    (`fotos`, `graficos`, `Fotos de Perfil`, `Fotos de Firmas`) con un PNG mínimo por carpeta.
    Si no usas Cloudinary en el backend, esta ruta responde 400 explicando que las imágenes van a Supabase.
    """
    if not os.getenv("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Cloudinary no está configurado (variables CLOUDINARY_* en el servidor). "
                "Las fotos de perfil y firma se suben entonces a Supabase Storage: no aparecerán en Cloudinary "
                "y no hace falta crear carpetas allí."
            ),
        )
    ex = supabase.table("contratos").select("id").eq("id", contrato_id).limit(1).execute()
    if not ex.data:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    caller_contrato, cargo = _caller_contract_scope(current_user)
    priv = (cargo or "") in ("desarrollador", "administrador")
    if not priv and caller_contrato and int(caller_contrato) != int(contrato_id):
        raise HTTPException(status_code=403, detail="No tienes acceso a información de otro contrato")
    _cloudinary_seed_carpetas_contrato(contrato_id)
    return {
        "ok": True,
        "contrato_id": contrato_id,
        "mensaje": f"Carpetas iniciales en Cloudinary: {CLOUDINARY_ROOT}/{contrato_id}/(fotos|graficos|…)",
    }


@app.put("/contratos/{contrato_id}")
def actualizar_contrato(contrato_id: int, body: ContratoUpdate, current_user=Depends(get_current_user)):
    data = body.dict(exclude_unset=True)
    if not data:
        return {"mensaje": "Sin cambios"}
    supabase.table("contratos").update(data).eq("id", contrato_id).execute()
    return {"mensaje": "Contrato actualizado"}

@app.delete("/contratos/{contrato_id}")
def eliminar_contrato(contrato_id: int, current_user=Depends(get_current_user)):
    supabase.table("contratos").delete().eq("id", contrato_id).execute()
    return {"mensaje": "Contrato eliminado"}
# ─────────────────────────────────────────────
# RUTAS ADMIN
# ─────────────────────────────────────────────

@app.get("/admin/usuarios-pendientes")
def usuarios_pendientes(current_user=Depends(get_current_user)):
    result = supabase.table("usuarios").select(
        "id, nombre, apellidos, email, cargo_id, contrato_id, estado, created_at"
    ).eq("estado", "pendiente").execute()

    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    contratos = {c["id"]: c["numero"] for c in supabase.table("contratos").select("id, numero").execute().data}
    for u in result.data:
        u["cargo_nombre"] = cargos.get(u.get("cargo_id"), "Sin cargo")
        u["contrato_numero"] = contratos.get(u.get("contrato_id"), "Sin contrato")
    return result.data

@app.put("/admin/usuarios/{usuario_id}/aprobar")
def aprobar_usuario(usuario_id: int, body: AprobarRequest, current_user=Depends(get_current_user)):
    supabase.table("usuarios").update({
        "estado": "aprobado", "activo": True, "rol_id": body.rol_id
    }).eq("id", usuario_id).execute()
    rol_nombre = ""
    if body.rol_id:
        r = supabase.table("roles").select("nombre").eq("id", body.rol_id).execute()
        rol_nombre = r.data[0]["nombre"] if r.data else str(body.rol_id)
    registrar_log(current_user, "APROBAR", "USUARIOS", "usuario", str(usuario_id),
        {"estado": "aprobado", "rol": rol_nombre})
    return {"mensaje": "Usuario aprobado"}

@app.put("/admin/usuarios/{usuario_id}/rechazar")
def rechazar_usuario(usuario_id: int, current_user=Depends(get_current_user)):
    supabase.table("usuarios").update({
        "estado": "rechazado", "activo": False
    }).eq("id", usuario_id).execute()
    registrar_log(current_user, "RECHAZAR", "USUARIOS", "usuario", str(usuario_id),
        {"estado": "rechazado"})
    return {"mensaje": "Usuario rechazado"}

@app.post("/admin/cargos")
def crear_cargo(cargo: CargoCreate, current_user=Depends(get_current_user)):
    return supabase.table("cargos").insert({
        "nombre": cargo.nombre, "rol_id": cargo.rol_id, "categoria_id": cargo.categoria_id
    }).execute().data

@app.delete("/admin/cargos/{cargo_id}")
def eliminar_cargo(cargo_id: int, current_user=Depends(get_current_user)):
    supabase.table("cargos").delete().eq("id", cargo_id).execute()
    return {"mensaje": "Cargo eliminado"}

@app.get("/admin/permisos/{cargo_id}")
def obtener_permisos(cargo_id: int, current_user=Depends(get_current_user)):
    return supabase.table("permisos").select("*").eq("cargo_id", cargo_id).execute().data

@app.get("/admin/todos-usuarios")
def todos_usuarios(current_user=Depends(get_current_user)):
    result = supabase.table("usuarios").select(
        "id, nombre, apellidos, email, activo, cargo_id, rol_id, contrato_id, estado, created_at, politicas_aceptadas, politicas_fecha, politicas_version, politicas_ip"
    ).order("nombre").execute()
    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    roles = {r["id"]: r["nombre"] for r in supabase.table("roles").select("id, nombre").execute().data}
    contratos = {c["id"]: c["numero"] for c in supabase.table("contratos").select("id, numero").execute().data}
    caller_contrato, _ = _caller_contract_scope(current_user)
    for u in result.data:
        u["cargo_nombre"] = cargos.get(u.get("cargo_id"), "Sin cargo")
        u["rol_nombre"] = roles.get(u.get("rol_id"), "Sin rol")
        u["contrato_numero"] = contratos.get(u.get("contrato_id"), "Sin contrato")
    caller_id = int(current_user["sub"])
    # Privacidad estricta: cada sesión solo puede ver usuarios de su contrato.
    if caller_contrato:
        filtered = [u for u in result.data if u.get("contrato_id") == caller_contrato]
    else:
        filtered = list(result.data)
    filtered = [u for u in filtered if u.get("cargo_nombre", "").lower() != "desarrollador" or u["id"] == caller_id]
    return filtered

@app.put("/admin/usuarios/{usuario_id}")
def actualizar_usuario(usuario_id: int, body: UsuarioUpdate, current_user=Depends(get_current_user)):
    # Proteger: no se puede modificar un Desarrollador SALVO que sea él mismo editándose
    es_el_mismo = str(usuario_id) == str(current_user.get("sub"))
    if not es_el_mismo:
        target = supabase.table("usuarios").select("cargo_id").eq("id", usuario_id).execute()
        if target.data and target.data[0].get("cargo_id"):
            cargo_res = supabase.table("cargos").select("nombre").eq("id", target.data[0]["cargo_id"]).execute()
            if cargo_res.data and cargo_res.data[0]["nombre"].lower() == "desarrollador":
                raise HTTPException(status_code=403, detail="No se puede modificar un usuario Desarrollador")

    prev_snap = supabase.table("usuarios").select(
        "cargo_id, rol_id, contrato_id, estado, activo, subcontratista_id, nombre, apellidos, email"
    ).eq("id", usuario_id).limit(1).execute().data
    prev_snap = prev_snap[0] if prev_snap else {}

    # exclude_unset=True: campos no enviados no se tocan; null explícito sí borra el campo
    data = body.dict(exclude_unset=True)
    if body.estado == "aprobado":
        data["activo"] = True
    elif body.estado == "rechazado":
        data["activo"] = False
    if body.politicas_aceptadas is False:
        data["politicas_fecha"] = None
        data["politicas_ip"] = None
    supabase.table("usuarios").update(data).eq("id", usuario_id).execute()
    # Resetear contador de inactividad: insertar LOGIN sintético al reactivar un usuario
    if body.estado == "aprobado":
        try:
            u_data = supabase.table("usuarios").select("nombre, apellidos, cargo_id, contrato_id").eq("id", usuario_id).execute().data
            u_nombre = ""
            u_contrato_id = None
            if u_data:
                u = u_data[0]
                u_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip()
                u_contrato_id = u.get("contrato_id")
            supabase.table("logs").insert({
                "usuario_id":   usuario_id,
                "usuario_nombre": u_nombre,
                "cargo_nombre": "",
                "contrato_id":  u_contrato_id,
                "contrato_numero": None,
                "accion":       "LOGIN",
                "modulo":       "AUTH",
                "entidad_tipo": "usuario",
                "entidad_id":   str(usuario_id),
                "detalle":      {"origen": "Reactivación por administrador"},
                "resultado":    "ok",
            }).execute()
        except Exception:
            pass
    # Enriquecer detalle con nombres legibles
    detalle_log = dict(data)
    if "cargo_id" in detalle_log:
        r = supabase.table("cargos").select("nombre").eq("id", detalle_log["cargo_id"]).execute()
        detalle_log["cargo"] = r.data[0]["nombre"] if r.data else str(detalle_log["cargo_id"])
        del detalle_log["cargo_id"]
    if "rol_id" in detalle_log:
        r = supabase.table("roles").select("nombre").eq("id", detalle_log["rol_id"]).execute()
        detalle_log["rol"] = r.data[0]["nombre"] if r.data else str(detalle_log["rol_id"])
        del detalle_log["rol_id"]
    if "contrato_id" in detalle_log:
        r = supabase.table("contratos").select("numero").eq("id", detalle_log["contrato_id"]).execute()
        detalle_log["contrato"] = r.data[0]["numero"] if r.data else str(detalle_log["contrato_id"])
        del detalle_log["contrato_id"]

    def _usuario_audit_enriquecido(row: dict) -> dict:
        if not row:
            return {}
        o = dict(row)
        if row.get("cargo_id"):
            cr = supabase.table("cargos").select("nombre").eq("id", row["cargo_id"]).execute()
            o["cargo"] = cr.data[0]["nombre"] if cr.data else str(row["cargo_id"])
        if row.get("rol_id"):
            rr = supabase.table("roles").select("nombre").eq("id", row["rol_id"]).execute()
            o["rol"] = rr.data[0]["nombre"] if rr.data else str(row["rol_id"])
        if row.get("contrato_id"):
            ct = supabase.table("contratos").select("numero").eq("id", row["contrato_id"]).execute()
            o["contrato"] = ct.data[0]["numero"] if ct.data else str(row["contrato_id"])
        return o

    after_snap = supabase.table("usuarios").select(
        "cargo_id, rol_id, contrato_id, estado, activo, subcontratista_id, nombre, apellidos, email"
    ).eq("id", usuario_id).limit(1).execute().data
    after_snap = after_snap[0] if after_snap else {}

    registrar_log(
        current_user,
        "EDITAR",
        "USUARIOS",
        "usuario",
        str(usuario_id),
        detalle_log,
        valor_anterior=_usuario_audit_enriquecido(prev_snap),
        valor_nuevo=_usuario_audit_enriquecido(after_snap),
        severidad="AUDIT",
    )
    return {"mensaje": "Usuario actualizado"}

@app.post("/admin/verificar-inactividad")
def verificar_inactividad(current_user=Depends(get_current_user)):
    """Marca como pendiente a usuarios aprobados con >7 días sin iniciar sesión."""
    from datetime import datetime, timedelta, timezone
    CARGOS_EXCLUIDOS = {'director', 'gerencia', 'supervisor externo', 'desarrollador', 'administrador'}
    ahora = datetime.now(timezone.utc)
    limite = ahora - timedelta(days=7)
    usuarios_raw = supabase.table("usuarios").select("id, cargo_id, estado").eq("estado", "aprobado").execute().data
    if not usuarios_raw:
        return {"afectados": 0}
    cargos = {c["id"]: c["nombre"].lower() for c in supabase.table("cargos").select("id, nombre").execute().data}
    candidatos = [u for u in usuarios_raw if cargos.get(u.get("cargo_id"), "") not in CARGOS_EXCLUIDOS]
    if not candidatos:
        return {"afectados": 0}
    cand_ids = [u["id"] for u in candidatos]
    logs = supabase.table("logs").select("usuario_id, created_at").eq("accion", "LOGIN").in_("usuario_id", cand_ids).order("created_at", desc=True).execute().data
    last_login = {}
    for log in logs:
        uid = log["usuario_id"]
        if uid not in last_login:
            last_login[uid] = log["created_at"]
    afectados = 0
    for u in candidatos:
        uid = u["id"]
        last = last_login.get(uid)
        inactivo = False
        if last is None:
            inactivo = True
        else:
            try:
                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                if last_dt < limite:
                    inactivo = True
            except Exception:
                pass
        if inactivo:
            supabase.table("usuarios").update({"estado": "pendiente", "activo": False}).eq("id", uid).execute()
            afectados += 1
    registrar_log(current_user, "VERIFICAR_INACTIVIDAD", "USUARIOS", None, None, {"afectados": afectados})
    return {"afectados": afectados}

@app.get("/admin/usuario-contratos/{usuario_id}")
def get_usuario_contratos(usuario_id: int, current_user=Depends(get_current_user)):
    result = supabase.table("usuario_contratos").select("contrato_id").eq("usuario_id", usuario_id).execute()
    ids = [r["contrato_id"] for r in result.data]
    if not ids:
        return []
    contratos = supabase.table("contratos").select("id, numero, contratista, interventoria, entidad, entidad_otra, logo_entidad, plano_geojson, centro_lat, centro_lng, logo_contratista, logo_interventoria, fase").in_("id", ids).execute()
    return contratos.data

@app.post("/admin/usuario-contratos")
def agregar_usuario_contrato(body: UsuarioContratoCreate, current_user=Depends(get_current_user)):
    existe = supabase.table("usuario_contratos").select("id").eq("usuario_id", body.usuario_id).eq("contrato_id", body.contrato_id).execute()
    if existe.data:
        raise HTTPException(status_code=400, detail="El usuario ya tiene ese contrato asignado")
    supabase.table("usuario_contratos").insert({"usuario_id": body.usuario_id, "contrato_id": body.contrato_id}).execute()
    return {"mensaje": "Contrato asignado"}

@app.delete("/admin/usuario-contratos/{usuario_id}/{contrato_id}")
def quitar_usuario_contrato(usuario_id: int, contrato_id: int, current_user=Depends(get_current_user)):
    supabase.table("usuario_contratos").delete().eq("usuario_id", usuario_id).eq("contrato_id", contrato_id).execute()
    return {"mensaje": "Contrato removido"}

@app.get("/mantenimiento")
def get_mantenimiento():
    return _estado_mantenimiento()

@app.post("/mantenimiento")
def set_mantenimiento(body: MantenimientoRequest):
    if body.secret != _MAINTENANCE_SECRET:
        raise HTTPException(status_code=403, detail="Secret inválido")

    if body.activo:
        segundos = body.segundos if (body.segundos is not None and body.segundos > 0) else _MAINTENANCE_DEFAULT_SECONDS
        _maintenance_state["activo"] = True
        _maintenance_state["mensaje"] = body.mensaje or _maintenance_state["mensaje"]
        _maintenance_state["expires_at"] = time.time() + segundos
    else:
        _maintenance_state["activo"] = False
        _maintenance_state["expires_at"] = None
        if body.mensaje:
            _maintenance_state["mensaje"] = body.mensaje

    return _estado_mantenimiento()

@app.post("/auth/refresh")
def refresh_token(current_user=Depends(get_current_user)):
    """Renueva el token JWT del usuario activo."""
    uid = int(current_user.get("sub"))
    try:
        def _u():
            return supabase.table("usuarios").select("*").eq("id", uid).execute()
        result = supabase_execute(_u, retries=4, delay=0.6)
        if not result.data:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        usuario = result.data[0]
        cargo_nombre = None
        if usuario.get("cargo_id"):
            cid = usuario["cargo_id"]
            def _c():
                return supabase.table("cargos").select("nombre").eq("id", cid).execute()
            r = supabase_execute(_c, retries=3, delay=0.5)
            if r.data:
                cargo_nombre = r.data[0]["nombre"]
        rol_nombre = None
        if usuario.get("rol_id"):
            rid = usuario["rol_id"]
            def _r():
                return supabase.table("roles").select("nombre").eq("id", rid).execute()
            r = supabase_execute(_r, retries=3, delay=0.5)
            if r.data:
                rol_nombre = r.data[0]["nombre"]
        contrato_numero = None
        if usuario.get("contrato_id"):
            ctid = usuario["contrato_id"]
            def _ct():
                return supabase.table("contratos").select("numero").eq("id", ctid).execute()
            r = supabase_execute(_ct, retries=3, delay=0.5)
            if r.data:
                contrato_numero = r.data[0]["numero"]
        nombre_completo = f"{usuario.get('nombre','')} {usuario.get('apellidos','')}".strip()
        new_token = create_token({
            "sub": str(uid),
            "email": usuario["email"],
            "nombre": nombre_completo or usuario.get("nombre") or "",
            "cargo_nombre": cargo_nombre or "",
            "rol_nombre": rol_nombre or "",
            "contrato_id": usuario.get("contrato_id"),
            "contrato_numero": contrato_numero or "",
        })
        return {"access_token": new_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError, httpx.RemoteProtocolError) as e:
        raise HTTPException(
            status_code=503,
            detail="El servicio de datos no respondió a tiempo. Intente de nuevo en unos segundos.",
        ) from e


@app.post("/auth/logout")
def auth_logout(request: Request, current_user=Depends(get_current_user)):
    """Registra cierre de sesión (auditoría)."""
    ip = _client_ip(request)
    uid = current_user.get("sub")
    nombre = current_user.get("nombre") or current_user.get("email", "")
    registrar_log(
        {
            "sub": str(uid),
            "nombre": nombre,
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": current_user.get("contrato_id"),
            "contrato_numero": current_user.get("contrato_numero"),
        },
        "LOGOUT",
        "AUTH",
        "usuario",
        str(uid),
        {},
        ip=ip,
    )
    return {"ok": True}


@app.post("/auth/solicitar-reset")
def solicitar_reset(body: ResetSolicitud):
    usuario = supabase.table("usuarios").select("id, email, nombre").eq("email", body.email).execute()
    if not usuario.data:
        raise HTTPException(status_code=404, detail="Correo no registrado")
    u = usuario.data[0]
    pendiente = supabase.table("password_reset_requests").select("id").eq("usuario_id", u["id"]).eq("estado", "pendiente").execute()
    if pendiente.data:
        return {"mensaje": "Ya tienes una solicitud pendiente"}
    supabase.table("password_reset_requests").insert({"usuario_id": u["id"], "email": body.email, "estado": "pendiente"}).execute()
    return {"mensaje": "Solicitud enviada al administrador"}

@app.get("/auth/reset-autorizado")
def check_reset_autorizado(email: str):
    result = supabase.table("password_reset_requests").select("estado").eq("email", email).eq("estado", "autorizado").execute()
    return {"autorizado": len(result.data) > 0}

@app.post("/auth/cambiar-password-temporal")
def cambiar_password_temporal(body: CambiarPassword):
    solicitud = supabase.table("password_reset_requests").select("*").eq("email", body.email).eq("estado", "autorizado").order("id", desc=True).limit(1).execute()
    if not solicitud.data:
        raise HTTPException(status_code=403, detail="No tienes autorización para cambiar la contraseña")
    s = solicitud.data[0]
    if not verify_password(body.contrasena_temporal, s["contrasena_temporal"]):
        raise HTTPException(status_code=401, detail="Contraseña temporal incorrecta")
    nuevo_hash = hash_password(body.nueva_password)
    supabase.table("usuarios").update({"password_hash": nuevo_hash}).eq("email", body.email).execute()
    supabase.table("password_reset_requests").delete().eq("id", s["id"]).execute()
    return {"mensaje": "Contraseña actualizada correctamente"}

@app.get("/admin/reset-requests")
def listar_reset_requests(current_user=Depends(get_current_user)):
    return supabase.table("password_reset_requests").select("*").eq("estado", "pendiente").order("created_at", desc=True).execute().data

@app.put("/admin/reset-requests/{request_id}/autorizar")
def autorizar_reset(request_id: int, body: ResetAutorizar, current_user=Depends(get_current_user)):
    hashed_temp = hash_password(body.contrasena_temporal)
    supabase.table("password_reset_requests").update({"estado": "autorizado", "contrasena_temporal": hashed_temp}).eq("id", request_id).execute()
    return {"mensaje": "Reset autorizado"}

@app.post("/admin/permisos")
def guardar_permisos(permisos: List[PermisoUpdate], current_user=Depends(get_current_user)):
    cargo_ids = sorted({p.cargo_id for p in permisos})

    def _norm_perm_rows(rows):
        if not rows:
            return []

        def _key(r):
            return (r.get("cargo_id"), r.get("funcion_id"))

        out = []
        for r in sorted(rows, key=_key):
            out.append({
                "cargo_id": r.get("cargo_id"),
                "funcion_id": r.get("funcion_id"),
                "ver": r.get("ver"),
                "crear": r.get("crear"),
                "editar": r.get("editar"),
                "eliminar": r.get("eliminar"),
                "validar": r.get("validar"),
                "exportar": r.get("exportar"),
            })
        return out

    antes_por_cargo = {}
    for cid in cargo_ids:
        antes_por_cargo[cid] = _norm_perm_rows(
            supabase.table("permisos").select("*").eq("cargo_id", cid).execute().data or []
        )

    for permiso in permisos:
        existe = supabase.table("permisos").select("id") \
            .eq("cargo_id", permiso.cargo_id).eq("funcion_id", permiso.funcion_id).execute()
        data = permiso.dict()
        if existe.data:
            supabase.table("permisos").update(data) \
                .eq("cargo_id", permiso.cargo_id).eq("funcion_id", permiso.funcion_id).execute()
        else:
            supabase.table("permisos").insert(data).execute()

    for cid in cargo_ids:
        despues = _norm_perm_rows(
            supabase.table("permisos").select("*").eq("cargo_id", cid).execute().data or []
        )
        if despues == antes_por_cargo.get(cid, []):
            continue
        cargo_row = supabase.table("cargos").select("nombre").eq("id", cid).limit(1).execute().data
        cn = cargo_row[0]["nombre"] if cargo_row else str(cid)
        registrar_log(
            current_user,
            "EDITAR",
            "PERMISOS",
            "cargo",
            str(cid),
            {"cargo": cn, "cambio": "matriz_permisos"},
            valor_anterior=antes_por_cargo.get(cid, []),
            valor_nuevo=despues,
            severidad="AUDIT",
            alerta_generada=True,
        )
    return {"mensaje": f"{len(permisos)} permisos guardados"}

# ─────────────────────────────────────────────
# LISTADO DE PRECIOS
# ─────────────────────────────────────────────

@app.get("/listado-precios/{contrato_id}")
def get_listado_precios(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    all_rows = []
    offset = 0
    while True:
        batch = supabase.table("listado_precios").select("*").eq("contrato_id", contrato_id).order("item_numero").range(offset, offset + 999).execute().data
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_rows

@app.post("/listado-precios/{contrato_id}/bulk")
def bulk_precios(contrato_id: int, items: List[ListadoPrecioItem], current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    """Reemplaza todos los precios del contrato con los items del CSV."""
    supabase.table("listado_precios").delete().eq("contrato_id", contrato_id).execute()
    if items:
        rows = []
        for item in items:
            row = {"contrato_id": contrato_id, **{k: v for k, v in item.dict().items() if v is not None}}
            if row.get("tipo_precio") == "Precio Contractual":
                row["estado_precio"] = "Aprobado"
                row["acta_fijacion"] = "Contractual"
                row.pop("acta_modificatoria", None)
            elif row.get("tipo_precio") == "Precio No Previsto":
                try:
                    f_val = float(row.get("acta_fijacion") or 0)
                    m_val = float(row.get("acta_modificatoria") or 0)
                except (ValueError, TypeError):
                    f_val, m_val = 0, 0
                row["estado_precio"] = "Aprobado" if (f_val > 0 and m_val > 0) else "Pendiente"
            rows.append(row)
        supabase.table("listado_precios").insert(rows).execute()
    registrar_log(current_user, "IMPORTAR", "PRECIOS", "listado_precios", str(contrato_id),
                  {"cantidad": len(items)})
    return {"mensaje": f"{len(items)} items cargados"}

@app.put("/listado-precios/item/{item_id}")
def update_precio(item_id: int, body: ListadoPrecioItem, current_user=Depends(get_current_user)):
    data = body.dict(exclude_none=True)
    tipo = data.get("tipo_precio")
    if tipo == "Precio Contractual":
        data["estado_precio"] = "Aprobado"
        data["acta_fijacion"] = "Contractual"
        data.pop("acta_modificatoria", None)
    elif tipo == "Precio No Previsto":
        try:
            f_val = float(data.get("acta_fijacion") or 0)
            m_val = float(data.get("acta_modificatoria") or 0)
        except (ValueError, TypeError):
            f_val, m_val = 0, 0
        data["estado_precio"] = "Aprobado" if (f_val > 0 and m_val > 0) else "Pendiente"
    supabase.table("listado_precios").update(data).eq("id", item_id).execute()
    registrar_log(current_user, "EDITAR", "PRECIOS", "listado_precios", str(item_id),
                  {"tipo_precio": data.get("tipo_precio"), "estado_precio": data.get("estado_precio")})
    return {"ok": True}

@app.delete("/listado-precios/item/{item_id}")
def delete_precio(item_id: int, current_user=Depends(get_current_user)):
    supabase.table("listado_precios").delete().eq("id", item_id).execute()

@app.post("/listado-precios/{contrato_id}/item")
def crear_precio(contrato_id: int, body: ListadoPrecioItem, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    """Crea un ítem individual en el listado de precios con lógica de aprobación automática."""
    row = body.dict(exclude_none=True)
    row["contrato_id"] = contrato_id
    if body.tipo_precio == "Precio Contractual":
        row["estado_precio"] = "Aprobado"
        row["acta_fijacion"] = "Contractual"
        row.pop("acta_modificatoria", None)
    else:
        try:
            f_val = float(row.get("acta_fijacion") or 0)
            m_val = float(row.get("acta_modificatoria") or 0)
        except (ValueError, TypeError):
            f_val, m_val = 0, 0
        row["estado_precio"] = "Aprobado" if (f_val > 0 and m_val > 0) else "Pendiente"
    result = supabase.table("listado_precios").insert(row).execute()
    nuevo = result.data[0] if result.data else {}
    registrar_log(current_user, "CREAR", "PRECIOS", "listado_precios", str(nuevo.get("id", "")),
                  {"item_numero": row.get("item_numero"), "descripcion": row.get("descripcion"),
                   "tipo_precio": row.get("tipo_precio"), "estado_precio": row.get("estado_precio")})
    return nuevo if nuevo else {"ok": True}

@app.get("/listado-precios/item/{item_id}/stats")
def get_precio_stats(item_id: int, current_user=Depends(get_current_user)):
    """Retorna cantidades y costos presupuestados, cobrados y balance para un ítem del listado."""
    precio = supabase.table("listado_precios").select(
        "contrato_id, capitulo, competencia, item_numero, precio_unitario"
    ).eq("id", item_id).single().execute().data
    if not precio:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    contrato_id  = precio["contrato_id"]
    capitulo     = precio.get("capitulo") or ""
    competencia  = precio.get("competencia") or ""
    item_numero  = precio.get("item_numero") or ""
    vlr_unitario = float(precio.get("precio_unitario") or 0)
    ppto_q = supabase.table("presupuesto").select("cant_total").eq("contrato_id", contrato_id).eq("item", item_numero).eq("tipo_ejecucion", "Presupuesto de Obra").eq("dado_de_baja", False)
    if capitulo:
        ppto_q = ppto_q.eq("capitulo", capitulo)
    if competencia:
        ppto_q = ppto_q.eq("competencia", competencia)
    ppto_rows = ppto_q.execute().data or []
    cant_ppto = sum(float(r.get("cant_total") or 0) for r in ppto_rows)
    cobro_q = supabase.table("cobro").select("cantidad, costo_directo").eq("contrato_id", contrato_id).eq("item", item_numero)
    if capitulo:
        cobro_q = cobro_q.eq("capitulo", capitulo)
    if competencia:
        cobro_q = cobro_q.eq("competencia", competencia)
    cobro_rows = cobro_q.execute().data or []
    cant_cobro  = sum(float(r.get("cantidad") or 0) for r in cobro_rows)
    costo_cobro = sum(float(r.get("costo_directo") or 0) for r in cobro_rows)
    costo_ppto  = round(cant_ppto * vlr_unitario)
    liq_q = supabase.table("presupuesto").select("cant_total").eq("contrato_id", contrato_id).eq("item", item_numero).eq("tipo_ejecucion", "Obra Ejecutada").eq("dado_de_baja", False)
    if capitulo:
        liq_q = liq_q.eq("capitulo", capitulo)
    if competencia:
        liq_q = liq_q.eq("competencia", competencia)
    liq_rows = liq_q.execute().data or []
    cant_liq  = sum(float(r.get("cant_total") or 0) for r in liq_rows)
    costo_liq = round(cant_liq * vlr_unitario)
    return {
        "cant_presupuestada":  round(cant_ppto, 4),
        "costo_presupuestado": costo_ppto,
        "cant_cobrada":        round(cant_cobro, 4),
        "costo_cobrado":       round(costo_cobro),
        "balance_cant":        round(cant_ppto - cant_cobro, 4),
        "balance_costo":       round(costo_ppto - costo_cobro),
        "cant_liquidacion":    round(cant_liq, 4),
        "costo_liquidacion":   costo_liq,
        "balance_liq_cant":    round(cant_liq - cant_cobro, 4),
        "balance_liq_costo":   round(costo_liq - costo_cobro),
    }

@app.post("/listado-precios/item/{item_id}/recalcular")
def recalcular_cobros_precio(item_id: int, current_user=Depends(get_current_user)):
    """Actualiza de Pendiente → Aprobado todos los registros de cobro de este ítem de precio."""
    precio = supabase.table("listado_precios").select(
        "contrato_id, capitulo, competencia, item_numero, estado_precio"
    ).eq("id", item_id).single().execute().data
    if not precio:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    if precio.get("estado_precio") != "Aprobado":
        raise HTTPException(status_code=400, detail="El precio debe estar Aprobado antes de recalcular cobros")
    q = supabase.table("cobro").update({"precio_estado": "Aprobado"}).eq("contrato_id", precio["contrato_id"]).eq("item", precio["item_numero"]).eq("precio_estado", "Pendiente")
    if precio.get("capitulo"):
        q = q.eq("capitulo", precio["capitulo"])
    if precio.get("competencia"):
        q = q.eq("competencia", precio["competencia"])
    result = q.execute()
    return {"recalculados": len(result.data or [])}

@app.post("/listado-precios/{contrato_id}/log-exportar")
def log_exportar_precios(contrato_id: int, current_user=Depends(get_current_user)):
    """Registra en el log que el usuario exportó el listado de precios en XLSX."""
    _require_contract_access(current_user, contrato_id)
    registrar_log(current_user, "EXPORTAR", "PRECIOS", "listado_precios", str(contrato_id),
                  {"formato": "xlsx"})
    return {"ok": True}

# ─────────────────────────────────────────────
# PRESUPUESTO
# ─────────────────────────────────────────────

def _reject_if_presupuesto_sellado(supabase, item_ids: List[int]) -> None:
    """Registros sellados (aprobación Interventoría) no admiten modificaciones ni cambio de estado."""
    if not item_ids:
        return
    rows = supabase.table("presupuesto").select("id, sellado").in_("id", list(set(item_ids))).execute().data or []
    if any(r.get("sellado") for r in rows):
        raise HTTPException(
            status_code=403,
            detail="Registro sellado (aprobado por Interventoría): no puede modificarse.",
        )


def _pre_interv_liberado(row: dict) -> bool:
    """NULL/vacío = legado (antes de la columna); solo 'Aprobado' habilita a Interventoría."""
    v = row.get("pre_interv_estado")
    if v is None:
        return True
    if isinstance(v, str) and not v.strip():
        return True
    return str(v).strip() == "Aprobado"


def _cargo_puede_prevalidar_interventoria(cargo_nombre: str) -> bool:
    n = (cargo_nombre or "").lower()
    if "residente de interventoria" in n or "residente de interventoría" in n:
        return False
    if "residente de costos" in n:
        return True
    if "residente de obra" in n:
        return True
    return False


def _presupuesto_aplica_filtro_interventoria(current_user) -> bool:
    """Perfiles Interventoría solo ven cantidades ya depuradas por contratista (costos u obra)."""
    rol = (current_user.get("rol_nombre") or "").strip().lower()
    if rol in ("administrador", "desarrollador"):
        return False
    cargo = (current_user.get("cargo_nombre") or "").strip().lower()
    if cargo == "desarrollador":
        return False
    return rol in ("interventoría", "interventoria", "operativo interventoria")


def _presupuesto_q_filtros_ubicacion(
    q,
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
):
    """Filtros opcionales para GET /presupuesto (alineable con criterios tipo SICOE / dashboard)."""
    if nodo_inicio and str(nodo_inicio).strip():
        q = q.ilike("no_inicio", f"%{str(nodo_inicio).strip()}%")
    if nodo_final and str(nodo_final).strip():
        q = q.ilike("no_final", f"%{str(nodo_final).strip()}%")
    has_split = (id_pol and str(id_pol).strip()) or (pk_criterio and str(pk_criterio).strip()) or (texto and str(texto).strip())
    if not has_split and buscar and str(buscar).strip():
        b = str(buscar).strip()
        pat = f"%{b}%"
        # Legacy: un solo cuadro busca en cuatro columnas
        q = q.or_(f"id_pol.ilike.{pat},pk_id.ilike.{pat},registro.ilike.{pat},descripcion.ilike.{pat}")
    else:
        if id_pol and str(id_pol).strip():
            q = q.ilike("id_pol", f"%{str(id_pol).strip()}%")
        if pk_criterio and str(pk_criterio).strip():
            q = q.ilike("pk_id", f"%{str(pk_criterio).strip()}%")
        if texto and str(texto).strip():
            t = f"%{str(texto).strip()}%"
            q = q.or_(f"registro.ilike.{t},descripcion.ilike.{t}")
    if revisado and str(revisado).strip():
        q = q.eq("revisado", str(revisado).strip())
    if pre_interv_estado and str(pre_interv_estado).strip():
        pe = str(pre_interv_estado).strip()
        if str(pe).strip().lower() in ("no revisado", "—", "-"):
            q = q.is_("pre_interv_estado", "null")
        else:
            q = q.eq("pre_interv_estado", pe)
    q = _so_reg_filtro_abs_solape(q, abs_desde, abs_hasta)
    return q


def _orden_capitulo_presupuesto(c: Optional[str]) -> tuple:
    if not c:
        return (2, 0, c or "")
    m = re.match(r"^(\d+)", str(c).strip())
    if m:
        return (0, int(m.group(1)), c)
    return (1, 0, c)


@app.get("/presupuesto/{contrato_id}")
def get_presupuesto(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
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
    """
    Listado de presupuesto con filtros de servidor. Parámetros capitulo / item alinean con el drill del
    dashboard. id_pol, pk_criterio, texto: filtros separados (campos distintos). `buscar` mantiene
    compatibilidad: OR en id_pol, pk_id, registro, descripcion si no se usan esos tres.
    pre_interv_estado: filtro depuración (roles contratista / obra); revisado: Interventoría.
    `limit` + `offset`: una sola página (grilla) sin bajar 10k+ filas. Sin `limit`, comportamiento
    legado: acumulación por lotes de 1000.
    """
    def _q_base():
        q = supabase.table("presupuesto").select("*").eq("contrato_id", contrato_id)
        if papelera:
            q = q.eq("dado_de_baja", True)
        else:
            q = q.eq("dado_de_baja", False)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        if item:
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
        q = _q_base()
        return q.range(offset, offset + limit - 1).execute().data

    PAGE = 1000
    all_rows = []
    off = 0
    while True:
        batch = _q_base().range(off, off + PAGE - 1).execute().data
        all_rows.extend(batch)
        if len(batch) < PAGE:
            break
        off += PAGE
    return all_rows


@app.get("/presupuesto/{contrato_id}/conteo")
def get_presupuesto_conteo(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
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
    current_user=Depends(get_current_user),
):
    """
    Mismos query params que GET /presupuesto/{id}; respuesta mínima para dashboard y UI sin bajar filas.
    Fase C: pre-paginación y consistencia con el listado.
    """
    q = supabase.table("presupuesto").select("id", count="exact").eq("contrato_id", contrato_id)
    if papelera:
        q = q.eq("dado_de_baja", True)
    else:
        q = q.eq("dado_de_baja", False)
    if capitulo:
        q = q.eq("capitulo", capitulo)
    if item:
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
    result = q.execute()
    return {"total": int(result.count or 0)}


@app.get("/presupuesto/{contrato_id}/filtros")
def get_filtros_presupuesto(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    tramo: Optional[str] = None,
    calzada: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Devuelve valores únicos para filtros en cascada."""
    q = supabase.table("presupuesto").select("capitulo, item, tramo, calzada").eq("contrato_id", contrato_id)
    if capitulo:
        q = q.eq("capitulo", capitulo)
    if item:
        q = q.eq("item", item)
    if tramo:
        q = q.eq("tramo", tramo)
    if calzada:
        q = q.eq("calzada", calzada)
    if _presupuesto_aplica_filtro_interventoria(current_user):
        q = q.or_("pre_interv_estado.is.null,pre_interv_estado.eq.Aprobado")
    rows = q.execute().data
    caps    = sorted(set(r["capitulo"] for r in rows if r.get("capitulo")))
    items   = sorted(set(r["item"]     for r in rows if r.get("item")))
    tramos  = sorted(set(r["tramo"]    for r in rows if r.get("tramo")))
    calzadas= sorted(set(r["calzada"]  for r in rows if r.get("calzada")))
    return {"capitulos": caps, "items": items, "tramos": tramos, "calzadas": calzadas}

@app.get("/presupuesto/{contrato_id}/resumen")
def get_resumen_presupuesto(contrato_id: int, current_user=Depends(get_current_user)):
    try:
        res  = supabase.table("vista_ppto_resumen").select("*").eq("contrato_id", contrato_id).execute().data
    except Exception:
        res = []
    try:
        caps = supabase.table("vista_ppto_por_capitulo").select("*").eq("contrato_id", contrato_id).execute().data
    except Exception:
        caps = []
    total = res[0].get("total_ppto", 0) if res else 0
    regs  = res[0].get("total_registros", 0) if res else 0
    return {
        "total_registros": regs,
        "costo_total": total,
        "revisados": 0, "campo": 0, "pendientes": 0,
        "por_capitulo": [{"capitulo": r["capitulo"], "costo": r["presupuesto"], "registros": r["registros"]} for r in caps]
    }

@app.get("/presupuesto/{contrato_id}/capitulos-lista")
def get_capitulos_presupuesto(contrato_id: int, current_user=Depends(get_current_user)):
    """Devuelve capítulos con costo total y total de registros. Carga rápida sin traer filas individuales."""
    caps = supabase.table("vista_ppto_por_capitulo").select("*").eq("contrato_id", contrato_id).execute().data
    rows = [{"capitulo": r["capitulo"], "costo_total": r["presupuesto"], "total_registros": r["registros"]} for r in (caps or [])]
    return sorted(rows, key=lambda x: _orden_capitulo_presupuesto(x.get("capitulo")))


@app.get("/presupuesto/{contrato_id}/maestro-ubicacion-pk")
def get_maestro_ubicacion_pk_ids(contrato_id: int, current_user=Depends(get_current_user)):
    """Tramos y calzadas distintas desde el maestro pk_ids del contrato (SICOE)."""
    def _q():
        return supabase.table("pk_ids").select("tramo, calzada").eq("contrato_id", contrato_id).execute().data
    try:
        rows = supabase_execute(_q) or []
    except Exception:
        rows = []
    tramos = sorted({str(r["tramo"]).strip() for r in rows if r.get("tramo") and str(r.get("tramo", "")).strip()})
    calzadas = sorted({str(r["calzada"]).strip() for r in rows if r.get("calzada") and str(r.get("calzada", "")).strip()})
    return {"tramos": tramos, "calzadas": calzadas}

@app.get("/presupuesto/{contrato_id}/items-lista")
def get_items_presupuesto(contrato_id: int, capitulo: str, current_user=Depends(get_current_user)):
    """Devuelve ítems de un capítulo con costo y cantidad agregados — sin traer registros individuales."""
    rows = []
    offset = 0
    while True:
        q_it = supabase.table("presupuesto").select(
            "item, descripcion, und, vlr_unitario, cant_total, costo_directo, revisado"
        ).eq("contrato_id", contrato_id).eq("capitulo", capitulo).eq("dado_de_baja", False)
        if _presupuesto_aplica_filtro_interventoria(current_user):
            q_it = q_it.or_("pre_interv_estado.is.null,pre_interv_estado.eq.Aprobado")
        batch = q_it.range(offset, offset + 999).execute().data
        rows.extend(batch)
        if len(batch) < 1000: break 
        offset += 1000
    items = {}
    for r in rows:
        it = r.get("item") or ""
        if it not in items:
            items[it] = {
                "item": it,
                "descripcion": r.get("descripcion") or "",
                "und": r.get("und") or "",
                "vlr_unitario": r.get("vlr_unitario") or 0,
                "cant_total": 0,
                "costo_total": 0,
                "total_registros": 0,
                "revisados": []
            }
        items[it]["cant_total"]     += r.get("cant_total") or 0
        items[it]["costo_total"]    += r.get("costo_directo") or 0
        items[it]["total_registros"] += 1
        items[it]["revisados"].append(r.get("revisado") or "No Revisado")
    result = sorted(items.values(), key=lambda x: x["item"])
    return result

@app.get("/presupuesto/item/{item_id}")
def get_presupuesto_item(item_id: int, current_user=Depends(get_current_user)):
    """Trae un único registro de presupuesto por ID."""
    row = supabase.table("presupuesto").select("*").eq("id", item_id).single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return row

@app.put("/presupuesto/item/{item_id}")
def update_presupuesto_item(item_id: int, body: PresupuestoUpdate, current_user=Depends(get_current_user)):
    data = body.dict(exclude_unset=True)
    prev_row = supabase.table("presupuesto").select("*").eq("id", item_id).limit(1).execute().data
    prev_row = prev_row[0] if prev_row else {}
    if prev_row.get("sellado"):
        raise HTTPException(
            status_code=403,
            detail="Registro sellado (aprobado por Interventoría): no puede modificarse.",
        )
    dims = {k: data.get(k) for k in ["area_long_nod", "ancho", "espesor"]}
    toco_dimensiones = any(v is not None for v in dims.values())
    if toco_dimensiones:
        current = supabase.table("presupuesto").select("area_long_nod, ancho, espesor, vlr_unitario, cant_total").eq("id", item_id).execute().data
        if current:
            c = current[0]
            area  = float(data.get("area_long_nod", c.get("area_long_nod") or 0))
            ancho = float(data.get("ancho",         c.get("ancho")         or 0))
            esp   = float(data.get("espesor",        c.get("espesor")       or 0))
            vlr   = float(data.get("vlr_unitario",   c.get("vlr_unitario")  or 0))
            cant  = round(area * ancho * esp, 2) if (ancho or esp) else round(area, 2)
            data["cant_total"]    = cant
            data["costo_directo"] = round(cant * vlr, 0)
    if toco_dimensiones:
        data["calculo_por"] = _calculo_usuario_label(current_user)
        data["calculo_en"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = "now()"
    supabase.table("presupuesto").update(data).eq("id", item_id).execute()

    # ── Encolar cambio de layer en CAD si cambió ítem o capítulo ──────────────
    if "capitulo" in data or "item" in data:
        try:
            r = supabase.table("presupuesto").select(
                "contrato_id, ent_handle, txt_handle, layer_ent, layer_txt, color_hex, competencia, capitulo, item, id_pol"
            ).eq("id", item_id).execute().data
            if r:
                row = r[0]
                nuevo_cap  = data.get("capitulo") or row.get("capitulo") or ""
                nuevo_item = data.get("item")     or row.get("item")     or ""
                comp       = row.get("competencia") or ""
                cap6       = nuevo_cap.replace(".", "")[:5]
                new_layer_ent = f"{cap6}_{comp}_{nuevo_item}"
                new_layer_txt = f"txt_{cap6}_{comp}_{nuevo_item}"
                old_id_pol = row.get("id_pol") or ""
                if "._" in old_id_pol:
                    sufijo = old_id_pol[old_id_pol.index("._"):]
                else:
                    sufijo = f"._{item_id}"
                new_id_pol = f"{nuevo_item}{sufijo}"
                payload_cad = {
                    "ent_handle": row.get("ent_handle") or "",
                    "txt_handle": row.get("txt_handle") or "",
                    "layer_ent":  new_layer_ent,
                    "layer_txt":  new_layer_txt,
                    "color_hex":  row.get("color_hex") or "",
                    "new_text":   new_id_pol,
                }
                supabase.table("cad_queue").insert({
                    "contrato_id": row["contrato_id"],
                    "tipo": "cambiar_layer",
                    "estado": "pendiente",
                    "payload": payload_cad
                }).execute()
                # Actualizar layers en presupuesto también
                supabase.table("presupuesto").update({
                    "layer_ent": new_layer_ent,
                    "layer_txt": new_layer_txt,
                    "id_pol":    new_id_pol,
                }).eq("id", item_id).execute()
        except: pass

    updated = supabase.table("presupuesto").select("*").eq("id", item_id).execute().data
    row_after = updated[0] if updated else {}
    try:
        cinfo = None
        cid = row_after.get("contrato_id") or prev_row.get("contrato_id")
        if cid:
            cr = supabase.table("contratos").select("numero").eq("id", cid).limit(1).execute().data
            cinfo = cr[0].get("numero") if cr else None
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": cid,
            "contrato_numero": cinfo,
        }
        registrar_log(
            u_log,
            "EDITAR",
            "PRESUPUESTO",
            "presupuesto",
            str(item_id),
            {"id_pol": row_after.get("id_pol") or prev_row.get("id_pol"), "item": row_after.get("item")},
            valor_anterior=_json_for_log(prev_row),
            valor_nuevo=_json_for_log(row_after),
        )
    except Exception:
        pass
    return row_after if updated else {"mensaje": "Registro actualizado"}

@app.put("/presupuesto/item/{item_id}/dar-baja")
def dar_baja_presupuesto(item_id: int, current_user=Depends(get_current_user)):
    """Soft delete: marca el registro como dado de baja y renombra sus layers en CAD."""
    row = supabase.table("presupuesto").select(
        "layer_txt, layer_ent, x_label, y_label, contrato_id, ent_handle, txt_handle, rev_block_handle, sellado"
    ).eq("id", item_id).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    r = row[0]
    if r.get("sellado"):
        raise HTTPException(
            status_code=403,
            detail="Registro sellado (aprobado por Interventoría): no puede modificarse.",
        )
    supabase.table("presupuesto").update({
        "dado_de_baja": True,
        "updated_at": "now()"
    }).eq("id", item_id).execute()
    # Cola CAD: renombrar layers con prefijo del_
    if _dwg_activo(r.get("contrato_id")):
        old_lent = r.get("layer_ent") or ""
        old_ltxt = r.get("layer_txt") or ""
        if old_lent and not old_lent.startswith("del_"):
            supabase.table("cad_queue").insert({
                "contrato_id": r["contrato_id"],
                "tipo": "cambiar_layer",
                "estado": "pendiente",
                "payload": {
                    "ent_handle":  r.get("ent_handle") or "",
                    "txt_handle":  r.get("txt_handle") or "",
                    "layer_ent":   f"del_{old_lent}",
                    "layer_txt":   f"del_{old_ltxt}",
                    "color_hex":   "",
                    "rev_block_handle": r.get("rev_block_handle") or "",
                    "layoff": True
                }
            }).execute()
        # Actualizar layers en la tabla presupuesto también
        supabase.table("presupuesto").update({
            "layer_ent": f"del_{old_lent}" if old_lent and not old_lent.startswith("del_") else old_lent,
            "layer_txt": f"del_{old_ltxt}" if old_ltxt and not old_ltxt.startswith("del_") else old_ltxt,
        }).eq("id", item_id).execute()
    try:
        cid = r.get("contrato_id")
        cinfo = None
        if cid:
            cr = supabase.table("contratos").select("numero").eq("id", cid).limit(1).execute().data
            cinfo = cr[0].get("numero") if cr else None
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": cid,
            "contrato_numero": cinfo,
        }
        registrar_log(
            u_log,
            "ELIMINAR",
            "PRESUPUESTO",
            "presupuesto",
            str(item_id),
            {"accion": "dar_baja", "layer_ent": r.get("layer_ent")},
            severidad="AUDIT",
        )
    except Exception:
        pass
    return {"ok": True}

@app.put("/presupuesto/item/{item_id}/restaurar")
def restaurar_presupuesto(item_id: int, current_user=Depends(get_current_user)):
    """Restaura un registro dado de baja: quita del_ de layers y reactiva en CAD."""
    row = supabase.table("presupuesto").select(
        "layer_txt, layer_ent, x_label, y_label, contrato_id, ent_handle, txt_handle, color_hex, sellado"
    ).eq("id", item_id).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    r = row[0]
    if r.get("sellado"):
        raise HTTPException(
            status_code=403,
            detail="Registro sellado (aprobado por Interventoría): no puede modificarse.",
        )
    supabase.table("presupuesto").update({
        "dado_de_baja": False,
        "updated_at": "now()"
    }).eq("id", item_id).execute()
    # Cola CAD: restaurar layers quitando prefijo del_
    if _dwg_activo(r.get("contrato_id")):
        old_lent = r.get("layer_ent") or ""
        old_ltxt = r.get("layer_txt") or ""
        new_lent = old_lent[4:] if old_lent.startswith("del_") else old_lent
        new_ltxt = old_ltxt[4:] if old_ltxt.startswith("del_") else old_ltxt
        if new_lent:
            supabase.table("cad_queue").insert({
                "contrato_id": r["contrato_id"],
                "tipo": "cambiar_layer",
                "estado": "pendiente",
                "payload": {
                    "ent_handle": r.get("ent_handle") or "",
                    "txt_handle": r.get("txt_handle") or "",
                    "layer_ent":  new_lent,
                    "layer_txt":  new_ltxt,
                    "color_hex":  r.get("color_hex") or "",
                    "layoff": False
                }
            }).execute()
        supabase.table("presupuesto").update({
            "layer_ent": new_lent,
            "layer_txt": new_ltxt,
        }).eq("id", item_id).execute()
    try:
        cid = r.get("contrato_id")
        cinfo = None
        if cid:
            cr = supabase.table("contratos").select("numero").eq("id", cid).limit(1).execute().data
            cinfo = cr[0].get("numero") if cr else None
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": cid,
            "contrato_numero": cinfo,
        }
        registrar_log(
            u_log,
            "EDITAR",
            "PRESUPUESTO",
            "presupuesto",
            str(item_id),
            {"accion": "restaurar"},
            severidad="AUDIT",
        )
    except Exception:
        pass
    return {"ok": True}

@app.post("/presupuesto/{contrato_id}/agregar-cantidad")
def agregar_cantidad(contrato_id: int, body: AgregarCantidadBody, current_user=Depends(get_current_user)):
    """Inserta una nueva cantidad clonando la posición de un registro existente."""
    area  = float(body.area_long_nod or 0)
    ancho = float(body.ancho or 0)
    esp   = float(body.espesor or 0)
    vlr   = float(body.vlr_unitario or 0)
    cant  = round(area * ancho * esp, 2) if (ancho or esp) else round(area, 2)
    costo = round(cant * vlr, 0)

    # Construir nuevo id_pol: {nuevo_item}_{consecutivo}
    base = body.id_pol_base or ""
    if "._" in base:
        sufijo = base[base.index("._") + 2:]
    elif "_" in base:
        sufijo = base.rsplit("_", 1)[-1]
    else:
        sufijo = "1"
    new_id_pol = f"{body.item}_{sufijo}"

    row = {
        "contrato_id": contrato_id,
        "capitulo":      body.capitulo,
        "competencia":   body.competencia,
        "item":          body.item,
        "descripcion":   body.descripcion,
        "und":           body.und,
        "calzada":       body.calzada,
        "tramo":         body.tramo,
        "abs_inicio":    body.abs_inicio,
        "abs_final":     body.abs_final,
        "no_inicio":     body.no_inicio,
        "no_final":      body.no_final,
        "vlr_unitario":  vlr,
        "area_long_nod": body.area_long_nod,
        "ancho":         body.ancho,
        "espesor":       body.espesor,
        "cant_total":    cant,
        "costo_directo": costo,
        "tipo_ejecucion": body.tipo_ejecucion,
        "tipo_entidad":  body.tipo_entidad,
        "id_pol":        new_id_pol,
        "layer_ent":     body.layer_ent or "",
        "layer_txt":     body.layer_txt or "",
        "x_label":       body.x_label,
        "y_label":       body.y_label,
        "dado_de_baja":  False,
        "revisado":      "No Revisado",
        "pre_interv_estado": "No Revisado",
    }
    inserted = supabase.table("presupuesto").insert(row).execute().data
    if not inserted:
        raise HTTPException(status_code=500, detail="Error al insertar cantidad")
    new_row = inserted[0]

    # Encolar CAD: create_label
    try:
        supabase.table("cad_queue").insert({
            "contrato_id": contrato_id,
            "tipo":        "create_label",
            "estado":      "pendiente",
            "payload": {
                "id_pol":       new_id_pol,
                "layer_ent":    body.layer_ent or "",
                "layer_txt":    body.layer_txt or "",
                "x_label":      body.x_label,
                "y_label":      body.y_label,
                "descripcion":  body.descripcion,
                "unidad":       body.und,
                "cant_total":   cant,
                "costo_directo": costo,
            }
        }).execute()
    except Exception:
        pass

    return new_row

@app.post("/presupuesto/{contrato_id}/bulk")
def bulk_presupuesto(
    contrato_id: int,
    items: List[PresupuestoRow],
    mode: str = "append",
    source: Optional[str] = None,
    x_sicoe_cad_enviados: Optional[str] = Header(None, alias="X-SicoeCAD-Enviados"),
    current_user=Depends(get_current_user),
):
    """Importa registros de presupuesto. mode=replace elimina todo primero, mode=append agrega.
    Si el cliente es SicoeCAD, usar query source=sicoe_cad y opcional header X-SicoeCAD-Enviados
    (cantidad de registros leídos en el DWG) para la auditoría en la web."""
    if mode == "replace":
        supabase.table("presupuesto").delete().eq("contrato_id", contrato_id).execute()
    if not items:
        return {"insertados": 0}
    BATCH = 500
    rows = []
    for item in items:
        d = {k: v for k, v in item.dict().items() if v is not None}
        d["contrato_id"] = contrato_id
        rows.append(d)
    insertados = 0
    for i in range(0, len(rows), BATCH):
        try:
            supabase.table("presupuesto").insert(rows[i:i+BATCH]).execute()
            insertados += len(rows[i:i+BATCH])
        except Exception as e:
            for row in rows[i:i+BATCH]:
                try:
                    supabase.table("presupuesto").insert(row).execute()
                    insertados += 1
                except Exception:
                    pass
    registrar_log(current_user, "IMPORTAR", "PRESUPUESTO", "presupuesto_bulk", str(contrato_id),
        {"contrato_id": contrato_id, "mode": mode, "registros_insertados": insertados,
         "source": (source or "").lower() or None})
    if (source or "").strip().lower() == "sicoe_cad":
        enviados = None
        h = (x_sicoe_cad_enviados or "").strip()
        if h.isdigit():
            enviados = int(h)
        _sicoe_cad_sincro_audit[contrato_id] = {
            "insertados": insertados,
            "enviados": enviados,
            "ts": time.time(),
        }
    return {"insertados": insertados}


@app.get("/presupuesto/{contrato_id}/sincro-sicoe-cad-auditoria")
def presupuesto_sincro_sicoe_cad_pendiente(contrato_id: int, current_user=Depends(get_current_user)):
    """Aviso para la web: última importación de cantidades por SicoeCAD (sinc. con cola CAD / DWG)."""
    e = _sicoe_cad_sincro_audit.get(contrato_id)
    if not e:
        return {"pendiente": None}
    if time.time() - e["ts"] > 600:
        _sicoe_cad_sincro_audit.pop(contrato_id, None)
        return {"pendiente": None}
    return {"pendiente": e}


@app.post("/presupuesto/{contrato_id}/sincro-sicoe-cad-auditoria/ack")
def presupuesto_sincro_sicoe_cad_ack(contrato_id: int, current_user=Depends(get_current_user)):
    _sicoe_cad_sincro_audit.pop(contrato_id, None)
    return {"ok": True}

@app.put("/presupuesto/{contrato_id}/bulk-recalcular")
def bulk_recalcular(contrato_id: int, body: PresupuestoBulkRecalc, current_user=Depends(get_current_user)):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No hay registros seleccionados")
    _reject_if_presupuesto_sellado(supabase, body.ids)
    dims_map = {d.id: d for d in (body.dims or [])}
    # Traer también handles y layers para cad_queue
    rows = supabase.table("presupuesto").select(
        "id, area_long_nod, ancho, espesor, cant_total, vlr_unitario, ent_handle, txt_handle, layer_ent, layer_txt, color_hex, competencia"
    ).in_("id", body.ids).execute().data
    for r in rows:
        rid = r["id"]
        dim = dims_map.get(rid)
        ancho   = (dim.ancho   if dim and dim.ancho   is not None else None) or r.get("ancho")   or 1
        espesor = (dim.espesor if dim and dim.espesor is not None else None) or r.get("espesor") or 1
        area    = r.get("area_long_nod") or 0
        vlr     = body.vlr_unitario if body.vlr_unitario is not None else (r.get("vlr_unitario") or 0)
        # Recalcular cant_total con las nuevas dimensiones si hay dims
        if dim and (dim.ancho is not None or dim.espesor is not None):
            cant = round(float(area) * float(ancho) * float(espesor), 4)
            data_ancho   = {"ancho": ancho, "espesor": espesor}
        else:
            cant = r.get("cant_total") or 0
            data_ancho   = {}
        costo = round(float(cant) * float(vlr), 0)
        data  = {
            "cant_total": cant,
            "costo_directo": costo,
            "updated_at": "now()",
            "calculo_por": _calculo_usuario_label(current_user),
            "calculo_en": datetime.now(timezone.utc).isoformat(),
            **data_ancho,
        }
        if body.capitulo    is not None: data["capitulo"]    = body.capitulo
        if body.item        is not None: data["item"]        = body.item
        if body.descripcion is not None: data["descripcion"] = body.descripcion
        if body.vlr_unitario is not None: data["vlr_unitario"] = body.vlr_unitario
        # Reconstruir id_pol si cambia el ítem
        new_id_pol = None
        if body.item is not None:
            rows_idpol = supabase.table("presupuesto").select("id_pol").eq("id", rid).execute().data
            old_id_pol = (rows_idpol[0].get("id_pol") or "") if rows_idpol else ""
            # Extraer sufijo: todo lo que va después del 
            #  "._"
            if "._" in old_id_pol:
                sufijo = old_id_pol[old_id_pol.index("._"):]   # ej: "._1558"
            else:
                sufijo = f"._{rid}"
            new_id_pol = f"{body.item}{sufijo}"   # ej: "8.01._1558"
            data["id_pol"] = new_id_pol
        supabase.table("presupuesto").update(data).eq("id", rid).execute()
        # ── Encolar operación CAD si cambió ítem/capítulo ──────────────────
        if body.capitulo is not None or body.item is not None:
            nuevo_cap  = body.capitulo or ""
            nuevo_item = body.item     or ""
            comp       = r.get("competencia") or ""
            cap6       = nuevo_cap.replace(".", "")[:5]
            new_layer_ent = f"{cap6}_{comp}_{nuevo_item}"
            new_layer_txt = f"txt_{cap6}_{comp}_{nuevo_item}"
            payload_cad = {
                "ent_handle":  r.get("ent_handle") or "",
                "txt_handle":  r.get("txt_handle") or "",
                "layer_ent":   new_layer_ent,
                "layer_txt":   new_layer_txt,
                "color_hex":   r.get("color_hex") or "",
            }
            if new_id_pol:
                payload_cad["new_text"] = new_id_pol
            supabase.table("cad_queue").insert({
                "contrato_id": contrato_id,
                "tipo": "cambiar_layer",
                "estado": "pendiente",
                "payload": payload_cad
            }).execute()
    registrar_log(current_user, "RECALCULAR", "PRESUPUESTO", "presupuesto_bulk", str(contrato_id),
        {"contrato_id": contrato_id, "cantidad_registros": len(rows),
         "capitulo": body.capitulo, "item": body.item})
    return {"actualizados": len(rows)}

@app.put("/presupuesto/{contrato_id}/bulk-estado")
def bulk_estado(contrato_id: int, body: PresupuestoBulkEstado, current_user=Depends(get_current_user)):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No hay registros seleccionados")
    # Traer sellado, pre_interv y datos CAD
    rows_info = supabase.table("presupuesto").select(
        "id, x_label, y_label, layer_txt, rev_block_handle, sellado, pre_interv_estado"
    ).in_("id", body.ids).execute().data or []
    info_map = {r["id"]: r for r in rows_info}
    if any(r.get("sellado") for r in rows_info):
        raise HTTPException(
            status_code=403,
            detail="Registro sellado (aprobado por Interventoría): no puede modificarse.",
        )
    rol_l = (current_user.get("rol_nombre") or "").strip().lower()
    es_perfil_interventoria = rol_l in ("interventoría", "interventoria", "operativo interventoria")
    if es_perfil_interventoria:
        for rid in body.ids:
            row = info_map.get(rid) or {}
            if not _pre_interv_liberado(row):
                raise HTTPException(
                    status_code=403,
                    detail="El registro debe estar aprobado en depuración contratista (Residente de Costos u Obra) antes de la validación de Interventoría.",
                )
    es_interventoria_sellar = current_user.get("rol_nombre") == "Interventoría"
    sellar = body.revisado == "Aprobado" and es_interventoria_sellar
    nombre_usuario = current_user.get("nombre") or current_user.get("email") or "Usuario"
    for rid in body.ids:
        data_upd = {"revisado": body.revisado, "updated_at": "now()"}
        if sellar:
            data_upd["sellado"] = True
        if body.revisado == "Aprobado":
            data_upd["validado_por"] = nombre_usuario
            data_upd["validado_en"]  = datetime.utcnow().isoformat()
        elif body.revisado != "Aprobado":
            # Si cambia de Aprobado a otro estado, limpiar
            data_upd["validado_por"] = None
            data_upd["validado_en"]  = None
        supabase.table("presupuesto").update(data_upd).eq("id", rid).execute()
        
    registrar_log(current_user, "VALIDAR", "PRESUPUESTO", "presupuesto_bulk", str(contrato_id),
        {"contrato_id": contrato_id, "cantidad_registros": len(body.ids), "estado": body.revisado})            
    return {"actualizados": len(body.ids)}


@app.put("/presupuesto/{contrato_id}/bulk-pre-interv")
def bulk_pre_interv(contrato_id: int, body: PresupuestoBulkPreInterv, current_user=Depends(get_current_user)):
    """Depuración contratista: Residente de Costos u Obra aprueba antes de que Interventoría vea/valide."""
    if not body.ids:
        raise HTTPException(status_code=400, detail="No hay registros seleccionados")
    _reject_if_presupuesto_sellado(supabase, body.ids)
    ESTADOS_PRE = {"No Revisado", "Pendiente", "Rechazado", "Aprobado"}
    if body.estado not in ESTADOS_PRE:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Use: {ESTADOS_PRE}")
    rol = (current_user.get("rol_nombre") or "").strip().lower()
    cargo = (current_user.get("cargo_nombre") or "").strip().lower()
    es_dev = cargo == "desarrollador" or rol == "desarrollador"
    if not es_dev:
        if rol not in ("contratista", "operativo contratista"):
            raise HTTPException(status_code=403, detail="Solo el contratista puede gestionar la depuración previa.")
        if not _cargo_puede_prevalidar_interventoria(cargo):
            raise HTTPException(
                status_code=403,
                detail="Solo Residente de Costos u Residente de Obra puede validar esta etapa.",
            )
    nombre_usuario = current_user.get("nombre") or current_user.get("email") or "Usuario"
    for rid in body.ids:
        data_upd = {"pre_interv_estado": body.estado, "updated_at": "now()"}
        if body.estado == "Aprobado":
            data_upd["pre_interv_por"] = nombre_usuario
            data_upd["pre_interv_en"] = datetime.utcnow().isoformat()
        else:
            data_upd["pre_interv_por"] = None
            data_upd["pre_interv_en"] = None
        supabase.table("presupuesto").update(data_upd).eq("id", rid).execute()
    registrar_log(
        current_user, "VALIDAR", "PRESUPUESTO", "presupuesto_pre_interv", str(contrato_id),
        {"contrato_id": contrato_id, "cantidad_registros": len(body.ids), "estado": body.estado},
    )
    return {"actualizados": len(body.ids)}

# ─────────────────────────────────────────────
# CAD QUEUE
# ─────────────────────────────────────────────


@app.get("/exportar/estado/{job_id}")
def exportar_estado(job_id: str, current_user=Depends(get_current_user)):
    """Frontend consulta si el Excel ya está listo."""
    job = _export_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return {"estado": job["estado"], "filename": job.get("filename","")}


@app.get("/exportar/descargar/{job_id}")
def exportar_descargar(job_id: str, current_user=Depends(get_current_user)):
    """Descarga el Excel generado en background."""
    job = _export_jobs.get(job_id)
    if not job or job["estado"] != "listo":
        raise HTTPException(status_code=404, detail="Archivo no listo")
    buf = io.BytesIO(job["buf"])
    filename = job.get("filename", "ClaraCore.xlsx")
    # No eliminar aún — permite diagnóstico
    # del _export_jobs[job_id]
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.post("/cad-queue/{contrato_id}/heartbeat")
def cad_heartbeat(contrato_id: int, usuario_id: int = 0):
    """SicoeCAD llama esto cada 3s — sin auth, persiste en Supabase."""
    _dwg_sessions[contrato_id] = time.time()
    try:
        supabase.table("cad_sessions").upsert({
            "contrato_id": contrato_id,
            "usuario_id": usuario_id,
            "ultimo_heartbeat": datetime.utcnow().isoformat()
        }, on_conflict="contrato_id,usuario_id").execute()
    except: pass
    return {"ok": True}

@app.get("/cad-queue/{contrato_id}/debug")
def cad_debug(contrato_id: int, current_user=Depends(get_current_user)):
    """Diagnóstico temporal — muestra estado de sesiones DWG."""
    sessions_info = []
    for k, ts in _dwg_sessions.items():
        sessions_info.append({
            "key": str(k),
            "hace_segundos": round(time.time() - ts, 1),
            "activo": (time.time() - ts) < _DWG_TIMEOUT
        })
    db_sessions = []
    try:
        rows = supabase.table("cad_sessions").select("*").eq("contrato_id", contrato_id).execute().data
        db_sessions = rows
    except Exception as e:
        db_sessions = [{"error": str(e)}]
    return {
        "contrato_id": contrato_id,
        "memoria_sessions": sessions_info,
        "supabase_sessions": db_sessions,
        "dwg_activo": _dwg_activo(contrato_id)
    }

@app.get("/cad-queue/{contrato_id}/estado")
def cad_estado(contrato_id: int, current_user=Depends(get_current_user)):
    """ClaraCore web consulta si hay DWG enlazado."""
    # 1) Verificar memoria primero (más rápido)
    last = _dwg_sessions.get(contrato_id)
    if last is not None and (time.time() - last) < 30:
        return {"enlazado": True}
    # 2) Fallback Supabase — sobrevive reinicios de Azure
    try:
        from datetime import timezone
        rows = supabase.table("cad_sessions").select("ultimo_heartbeat") \
            .eq("contrato_id", contrato_id).execute().data
        if rows:
            ts = rows[0]["ultimo_heartbeat"].replace("Z", "+00:00")
            ultimo = datetime.fromisoformat(ts)
            if ultimo.tzinfo is None:
                ultimo = ultimo.replace(tzinfo=timezone.utc)
            diff = (datetime.now(timezone.utc) - ultimo).total_seconds()
            return {"enlazado": diff < 30}
    except: pass
    return {"enlazado": False}

@app.get("/cad-queue/{contrato_id}/pendientes")
def cad_pendientes(contrato_id: int, current_user=Depends(get_current_user)):
    """SicoeCAD descarga las operaciones pendientes."""
    try:
        rows = supabase.table("cad_queue").select("*") \
            .eq("contrato_id", contrato_id).eq("estado", "pendiente") \
            .order("id").limit(50).execute().data
    except Exception:
        return []
    return rows

@app.post("/cad-queue/{contrato_id}/highlight-registro")
def highlight_registro(contrato_id: int, body: dict, current_user=Depends(get_current_user)):
    """Encola highlight de entidad+texto de un registro de presupuesto."""
    presupuesto_id = body.get("presupuesto_id")
    if not presupuesto_id:
        raise HTTPException(status_code=400, detail="presupuesto_id requerido")
    row = supabase.table("presupuesto").select("ent_handle, txt_handle, x_label, y_label").eq("id", presupuesto_id).single().execute().data
    if not row or not row.get("ent_handle"):
        raise HTTPException(status_code=404, detail="Registro sin ent_handle")
    payload = {
        "ent_handle": row.get("ent_handle", ""),
        "txt_handle": row.get("txt_handle", ""),
        "x_label":    row.get("x_label", 0),
        "y_label":    row.get("y_label", 0),
    }
    usuario_id = current_user["id"] if isinstance(current_user, dict) else current_user.id
    supabase.table("cad_queue").insert({
        "contrato_id":  contrato_id,
        "tipo":         "highlight_registro",
        "payload":      payload,
        "usuario_id":   usuario_id,
        "procesado":    False,
    }).execute()
    return {"ok": True}

@app.post("/cad-queue/{contrato_id}/zoom-pkid")
def zoom_pkid(contrato_id: int, pk_id: str, current_user=Depends(get_current_user)):
    """Encola operación de zoom a un PK_ID en AutoCAD."""
    rows = supabase.table("presupuesto").select(
        "ent_handle, x_label, y_label"
    ).eq("contrato_id", contrato_id).eq("pk_id", pk_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="PK_ID no encontrado en presupuesto")
    r = rows[0]
    ent_handle = r.get("ent_handle") or ""
    x = r.get("x_label") or 0
    y = r.get("y_label") or 0
    if not ent_handle and (x == 0 and y == 0):
        raise HTTPException(status_code=404, detail="Sin coordenadas para este PK_ID")
    supabase.table("cad_queue").insert({
        "contrato_id": contrato_id,
        "tipo": "zoom_pkid",
        "estado": "pendiente",
        "payload": {
            "pk_id":      pk_id,
            "ent_handle": ent_handle,
            "x":          x,
            "y":          y,
            "radio":      30
        }
    }).execute()
    return {"ok": True, "pk_id": pk_id}

@app.put("/cad-queue/{op_id}/procesado")
def cad_procesado(op_id: int, body: CadQueueProcesado, current_user=Depends(get_current_user)):
    """SicoeCAD marca la operación como procesada."""
    supabase.table("cad_queue").update({
        "estado": "procesado",
        "processed_at": datetime.utcnow().isoformat()
    }).eq("id", op_id).execute()
    # Si la op era insertar_bloque, guardar el handle del bloque en presupuesto
    if body.presupuesto_id and body.rev_block_handle:
        supabase.table("presupuesto").update({
            "rev_block_handle": body.rev_block_handle
        }).eq("id", body.presupuesto_id).execute()
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════════════════════
# COMENTARIOS
# ═══════════════════════════════════════════════════════════════════════════════

class ComentarioBulk(BaseModel):
    presupuesto_ids: List[int]
    tipo: str        # dims | item_capitulo | validacion
    mensaje: str
    usuario_nombre: str

class RespuestaCreate(BaseModel):
    mensaje: str
    usuario_nombre: str

@app.post("/presupuesto/{contrato_id}/comentarios/bulk")
def crear_comentarios_bulk(contrato_id: int, body: ComentarioBulk, current_user=Depends(get_current_user)):
    rows = [{"presupuesto_id": pid, "tipo": body.tipo, "mensaje": body.mensaje,
             "usuario_nombre": body.usuario_nombre} for pid in body.presupuesto_ids]
    supabase.table("comentarios").insert(rows).execute()
    return {"creados": len(rows)}

@app.get("/presupuesto/{contrato_id}/comentarios-resumen")
def comentarios_resumen(contrato_id: int, ids: str, current_user=Depends(get_current_user)):
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return {}
    rows = supabase.table("comentarios").select(
        "id, presupuesto_id, tipo, parent_id"
    ).in_("presupuesto_id", id_list).execute().data
    id_to_tipo = {r["id"]: r["tipo"] for r in rows}
    result = {}
    for r in rows:
        pid = r["presupuesto_id"]
        if pid not in result:
            result[pid] = {
                "dims":          {"count": 0, "replies": False},
                "item_capitulo": {"count": 0, "replies": False},
                "validacion":    {"count": 0, "replies": False},
            }
        tipo = r["tipo"]
        if r["parent_id"] is None:
            result[pid][tipo]["count"] += 1
        else:
            result[pid][tipo]["replies"] = True
    return result

def _comentarios_validacion_por_ids(id_list: List[int]) -> dict:
    """Comentario de validación más reciente (raíz) por presupuesto_id. Chunking: PostgREST limita .in_() en la URL."""
    if not id_list:
        return {}
    _CHUNK = 200
    result: Dict[int, Any] = {}
    for i in range(0, len(id_list), _CHUNK):
        chunk = id_list[i : i + _CHUNK]
        rows = supabase.table("comentarios").select(
            "presupuesto_id, mensaje, usuario_nombre, created_at"
        ).in_("presupuesto_id", chunk).eq("tipo", "validacion").is_("parent_id", "null").order(
            "created_at", desc=True
        ).execute().data or []
        for r in rows:
            pid = r["presupuesto_id"]
            if pid not in result:
                result[pid] = {
                    "mensaje": r["mensaje"],
                    "usuario_nombre": r["usuario_nombre"],
                    "created_at": r["created_at"],
                }
    return result

def _comentarios_validacion_por_capitulo_contrato(contrato_id: int, capitulo: str) -> dict:
    """Misma salida que por IDs, pero una sola petición: join comentarios → presupuesto (sin N×chunk a Supabase)."""
    if not (capitulo or "").strip():
        return {}
    rows = (
        supabase.table("comentarios")
        .select("presupuesto_id, mensaje, usuario_nombre, created_at, presupuesto!inner(contrato_id, capitulo)")
        .eq("tipo", "validacion")
        .is_("parent_id", "null")
        .eq("presupuesto.contrato_id", contrato_id)
        .eq("presupuesto.capitulo", capitulo)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    result: Dict[int, Any] = {}
    for r in rows:
        pid = r["presupuesto_id"]
        if pid not in result:
            result[pid] = {
                "mensaje": r["mensaje"],
                "usuario_nombre": r["usuario_nombre"],
                "created_at": r["created_at"],
            }
    return result

@app.get("/presupuesto/{contrato_id}/comentarios-validacion-capitulo")
def comentarios_validacion_por_capitulo(
    contrato_id: int, capitulo: str, current_user=Depends(get_current_user)
):
    """Revisor por tramo: carga comentarios de validación de todo el capítulo en un solo ida-vuelta."""
    return _comentarios_validacion_por_capitulo_contrato(contrato_id, capitulo)

@app.get("/presupuesto/{contrato_id}/comentarios-validacion")
def comentarios_validacion_batch(contrato_id: int, ids: str, current_user=Depends(get_current_user)):
    """Devuelve el comentario de validacion más reciente (sin hijos) por cada presupuesto_id."""
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    return _comentarios_validacion_por_ids(id_list)

@app.post("/presupuesto/{contrato_id}/comentarios-validacion")
def comentarios_validacion_batch_post(
    contrato_id: int, body: ComentariosValidacionIds, current_user=Depends(get_current_user)
):
    """Igual que GET: lista de IDs en el cuerpo para capítulos muy grandes (evita URL > límite del proxy)."""
    id_list: List[int] = []
    seen: set = set()
    for x in body.ids:
        try:
            xi = int(x)
        except (TypeError, ValueError):
            continue
        if xi in seen:
            continue
        seen.add(xi)
        id_list.append(xi)
    return _comentarios_validacion_por_ids(id_list)

@app.get("/presupuesto/{presupuesto_id}/comentarios")
def get_comentarios(presupuesto_id: int, tipo: str, current_user=Depends(get_current_user)):
    rows = supabase.table("comentarios").select("*").eq(
        "presupuesto_id", presupuesto_id).eq("tipo", tipo).order("created_at").execute().data
    roots = [r for r in rows if r["parent_id"] is None]
    children = {}
    for r in rows:
        if r["parent_id"]:
            children.setdefault(r["parent_id"], []).append(r)
    for root in roots:
        root["respuestas"] = children.get(root["id"], [])
    return roots

@app.post("/comentarios/{comentario_id}/respuesta")
def responder_comentario(comentario_id: int, body: RespuestaCreate, current_user=Depends(get_current_user)):
    parent = supabase.table("comentarios").select("presupuesto_id, tipo").eq("id", comentario_id).execute().data
    if not parent:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    p = parent[0]
    supabase.table("comentarios").insert({
        "presupuesto_id": p["presupuesto_id"],
        "tipo":           p["tipo"],
        "mensaje":        body.mensaje,
        "usuario_nombre": body.usuario_nombre,
        "parent_id":      comentario_id
    }).execute()
    return {"ok": True}
# ─────────────────────────────────────────────
# LOGS
# ─────────────────────────────────────────────

def _logs_query_base(
    usuario_id: Optional[int] = None,
    modulo: Optional[str] = None,
    accion: Optional[str] = None,
    categoria: Optional[str] = None,
    severidad: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
):
    q = supabase.table("logs").select("*").order("created_at", desc=True)
    if usuario_id:
        q = q.eq("usuario_id", usuario_id)
    if modulo:
        q = q.eq("modulo", modulo)
    if accion:
        q = q.eq("accion", accion)
    if categoria:
        q = q.eq("categoria", categoria)
    if severidad:
        q = q.eq("severidad", severidad)
    if fecha_desde:
        q = q.gte("created_at", fecha_desde)
    if fecha_hasta:
        q = q.lte("created_at", fecha_hasta + "T23:59:59")
    return q


@app.get("/logs")
def get_logs(
    usuario_id:   Optional[int] = None,
    modulo:       Optional[str] = None,
    accion:       Optional[str] = None,
    categoria:    Optional[str] = None,
    severidad:    Optional[str] = None,
    fecha_desde:  Optional[str] = None,
    fecha_hasta:  Optional[str] = None,
    limit:        int = 100,
    offset:       int = 0,
    current_user=Depends(require_logs_auditoria),
):
    """Consulta logs con filtros. Solo Desarrollador y Administrador."""
    q = _logs_query_base(
        usuario_id=usuario_id,
        modulo=modulo,
        accion=accion,
        categoria=categoria,
        severidad=severidad,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    q = q.range(offset, offset + limit - 1)
    return q.execute().data


@app.get("/logs/alertas")
def get_logs_alertas(
    limit: int = 50,
    current_user=Depends(require_logs_auditoria),
):
    """Eventos marcados como alerta (login masivo, 500 repetidos, permisos, etc.)."""
    rows = (
        supabase.table("logs")
        .select("*")
        .eq("alerta_generada", True)
        .order("created_at", desc=True)
        .limit(min(limit, 200))
        .execute()
        .data
    )
    return rows


@app.get("/logs/export.csv")
def export_logs_csv(
    usuario_id:  Optional[int] = None,
    modulo:      Optional[str] = None,
    accion:      Optional[str] = None,
    categoria:   Optional[str] = None,
    severidad:   Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    max_rows:    int = 5000,
    current_user=Depends(require_logs_auditoria),
):
    """Exportación CSV para interventoría / auditoría externa."""
    cap = min(max(max_rows, 1), 20000)
    q = _logs_query_base(
        usuario_id=usuario_id,
        modulo=modulo,
        accion=accion,
        categoria=categoria,
        severidad=severidad,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    rows = q.limit(cap).execute().data or []
    import json as _json

    def _cell(v):
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return _json.dumps(v, ensure_ascii=False)
        return str(v)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "id", "created_at", "categoria", "severidad", "usuario_id", "usuario_nombre", "rol_nombre",
        "cargo_nombre", "contrato_id", "contrato_numero", "accion", "modulo",
        "entidad_tipo", "entidad_id", "resultado", "ip", "endpoint", "detalle",
        "valor_anterior", "valor_nuevo", "alerta_generada",
    ])
    for r in rows:
        w.writerow([
            r.get("id"), r.get("created_at"), r.get("categoria"), r.get("severidad"),
            r.get("usuario_id"), r.get("usuario_nombre"), r.get("rol_nombre"),
            r.get("cargo_nombre"), r.get("contrato_id"), r.get("contrato_numero"),
            r.get("accion"), r.get("modulo"), r.get("entidad_tipo"), r.get("entidad_id"),
            r.get("resultado"), r.get("ip"), r.get("endpoint"),
            _cell(r.get("detalle")), _cell(r.get("valor_anterior")), _cell(r.get("valor_nuevo")),
            r.get("alerta_generada"),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="claracore_logs.csv"'},
    )


@app.get("/logs/usuarios-lista")
def get_logs_usuarios(current_user=Depends(require_logs_auditoria)):
    """Lista de usuarios para el filtro (todos los visibles para el administrador, no solo quienes ya tienen log)."""
    result = supabase.table("usuarios").select(
        "id, nombre, apellidos, cargo_id, contrato_id"
    ).order("nombre").execute()
    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    caller_contrato, _ = _caller_contract_scope(current_user)
    caller_id = int(current_user["sub"])
    out = []
    for u in result.data or []:
        uid = u.get("id")
        cn = cargos.get(u.get("cargo_id"), "Sin cargo")
        if caller_contrato and u.get("contrato_id") != caller_contrato:
            continue
        if (cn or "").lower() == "desarrollador" and uid != caller_id:
            continue
        nombre = f"{u.get('nombre', '')} {u.get('apellidos', '')}".strip() or f"Usuario {uid}"
        out.append({"id": uid, "nombre": nombre, "cargo": cn})
    return out


@app.get("/logs/entidad/{entidad_tipo}/{entidad_id}")
def get_logs_entidad(
    entidad_tipo: str,
    entidad_id: str,
    current_user=Depends(get_current_user),
):
    """Historial de una entidad (usuarios autenticados: trazabilidad en pantallas operativas)."""
    return (
        supabase.table("logs")
        .select("*")
        .eq("entidad_tipo", entidad_tipo)
        .eq("entidad_id", entidad_id)
        .order("created_at", desc=False)
        .execute()
        .data
    )


@app.post("/admin/deploy-log")
def log_deploy_event(
    body: dict,
    current_user=Depends(require_logs_auditoria),
):
    """Registra un despliegue (versión, notas). Uso manual desde pipeline o consola."""
    ver = (body or {}).get("version") or ""
    notas = (body or {}).get("notas") or ""
    uid = int(current_user.get("sub"))
    nombre = current_user.get("nombre") or current_user.get("email", "")
    registrar_log(
        {
            "sub": str(uid),
            "nombre": nombre,
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": current_user.get("contrato_id"),
            "contrato_numero": current_user.get("contrato_numero"),
        },
        "DEPLOY",
        "SISTEMA",
        "deploy",
        ver or "sin_version",
        {"version": ver, "notas": notas},
        severidad="INFO",
        categoria="auditoria",
    )
    return {"ok": True}


@app.get("/inicio/novedades")
def inicio_novedades_public():
    """Novedades de la página de inicio (lectura pública para usuarios logueados en el front)."""
    rows = (
        supabase.table("inicio_novedades")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return rows or []


@app.get("/admin/inicio/novedades")
def admin_inicio_novedades_list(current_user=Depends(require_logs_auditoria)):
    """Misma lista que GET /inicio/novedades (requiere rol de auditoría de logs)."""
    return inicio_novedades_public()


@app.post("/admin/inicio/novedades")
def admin_inicio_novedades_create(
    body: InicioNovedadCreate,
    request: Request,
    current_user=Depends(require_logs_auditoria),
):
    row = body.model_dump()
    raw_fecha = (row.pop("fecha") or "").strip()
    if raw_fecha:
        row["fecha"] = raw_fecha[:10]
    else:
        row["fecha"] = datetime.now(timezone.utc).date().isoformat()
    try:
        # supabase-py 2.x: insert() devuelve SyncQueryRequestBuilder (no admite .select() encadenado).
        # returning=representation es el valor por defecto; execute() devuelve la fila insertada en data.
        res = supabase.table("inicio_novedades").insert(row).execute()
    except Exception as e:
        _log_api.warning("POST /admin/inicio/novedades insert: %s", e)
        raise HTTPException(
            status_code=503,
            detail=(
                "No se pudo guardar en la base de datos. Comprueba que exista la tabla "
                "`inicio_novedades` (ejecuta backend/sql/inicio_novedades.sql en Supabase) y que "
                "las columnas coincidan con el despliegue actual. "
                f"Detalle técnico: {e!s}"
            ),
        )
    data = res.data[0] if res.data else None
    if not data:
        raise HTTPException(
            status_code=503,
            detail="La inserción no devolvió fila (PostgREST). Revisa permisos RLS y la tabla inicio_novedades.",
        )
    u = dict(current_user)
    u["nombre"] = u.get("nombre") or u.get("email", "")
    registrar_log(
        u,
        "CREAR",
        "INICIO",
        "inicio_novedad",
        str(data.get("id")) if data else None,
        detalle={"titulo": row.get("titulo")},
        resultado="ok",
        valor_nuevo=data,
        ip=_client_ip(request),
    )
    return data


@app.patch("/admin/inicio/novedades/{novedad_id}")
def admin_inicio_novedades_update(
    novedad_id: int,
    body: InicioNovedadUpdate,
    request: Request,
    current_user=Depends(require_logs_auditoria),
):
    prev_rows = supabase.table("inicio_novedades").select("*").eq("id", novedad_id).limit(1).execute().data or []
    prev = prev_rows[0] if prev_rows else None
    if not prev:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "fecha" in patch and patch["fecha"] is not None:
        patch["fecha"] = str(patch["fecha"])[:10]
    if not patch:
        return prev
    try:
        res = supabase.table("inicio_novedades").update(patch).eq("id", novedad_id).execute()
    except Exception as e:
        _log_api.warning("PATCH /admin/inicio/novedades/%s: %s", novedad_id, e)
        raise HTTPException(status_code=503, detail=f"No se pudo actualizar: {e!s}")
    data = (res.data[0] if res.data else None) or {**prev, **patch}
    u = dict(current_user)
    u["nombre"] = u.get("nombre") or u.get("email", "")
    registrar_log(
        u,
        "EDITAR",
        "INICIO",
        "inicio_novedad",
        str(novedad_id),
        detalle=patch,
        resultado="ok",
        valor_anterior=prev,
        valor_nuevo=data,
        ip=_client_ip(request),
    )
    return data


@app.delete("/admin/inicio/novedades/{novedad_id}")
def admin_inicio_novedades_delete(
    novedad_id: int,
    request: Request,
    current_user=Depends(require_logs_auditoria),
):
    prev_rows = supabase.table("inicio_novedades").select("*").eq("id", novedad_id).limit(1).execute().data or []
    prev = prev_rows[0] if prev_rows else None
    if not prev:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")
    supabase.table("inicio_novedades").delete().eq("id", novedad_id).execute()
    u = dict(current_user)
    u["nombre"] = u.get("nombre") or u.get("email", "")
    registrar_log(
        u,
        "ELIMINAR",
        "INICIO",
        "inicio_novedad",
        str(novedad_id),
        detalle={"titulo": prev.get("titulo")},
        resultado="ok",
        valor_anterior=prev,
        ip=_client_ip(request),
    )
    return {"ok": True}


@app.post("/admin/inicio/novedades/imagen")
async def admin_inicio_novedad_imagen(
    file: UploadFile = File(...),
    current_user=Depends(require_logs_auditoria),
):
    contents = await file.read()
    url = _inicio_novedad_subir_imagen(contents, file.content_type)
    return {"url": url}


@app.post("/admin/inicio/novedades/mejorar-texto")
def admin_inicio_novedad_mejorar_texto(
    body: InicioNovedadMejorarTexto,
    current_user=Depends(require_logs_auditoria),
):
    """Mejora la redacción del resumen con el mismo modelo que /frase-del-dia (Anthropic)."""
    raw = (body.texto or "").strip()
    if len(raw) > 8000:
        raise HTTPException(status_code=400, detail="Texto demasiado largo (máx. 8000 caracteres).")
    if not raw:
        return {"texto": ""}
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return {"texto": raw, "sin_ia": True}
    try:
        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5",
                "max_tokens": 900,
                "messages": [{
                    "role": "user",
                    "content": (
                        "Eres editor en español para avisos de una plataforma de gestión de obra (ClaraCore). "
                        "Mejora la redacción del siguiente resumen de novedad: tono claro y profesional, "
                        "sin inventar datos ni añadir información que no aparezca en el original. "
                        "Conserva listas o viñetas si las hay. "
                        "Devuelve SOLO el texto mejorado, sin título, sin comillas envolventes ni frases como \"Aquí tienes\".\n\n"
                        + raw
                    ),
                }],
            },
            timeout=35.0,
        )
        data = res.json()
        if res.status_code >= 400:
            detail = data.get("error", {}).get("message") if isinstance(data.get("error"), dict) else data
            raise HTTPException(status_code=503, detail=str(detail or "Error del proveedor IA"))
        if "content" not in data or not data["content"]:
            return {"texto": raw, "sin_ia": True}
        texto = (data["content"][0].get("text") or "").strip()
        if not texto:
            return {"texto": raw, "sin_ia": True}
        return {"texto": texto}
    except HTTPException:
        raise
    except Exception as e:
        _log_api.warning("mejorar-texto novedad: %s", e)
        return {"texto": raw, "sin_ia": True}


# ─────────────────────────────────────────────
# NOTIFICACIONES
# ─────────────────────────────────────────────

class NotificacionCreate(BaseModel):
    destinatario_id: Optional[int] = None  # None = broadcast a todos
    asunto: str
    mensaje: str
    tipo: str = "MENSAJE_DIRECTO"  # MENSAJE_DIRECTO | BROADCAST | SISTEMA | SOPORTE
    modulo: Optional[str] = None
    contrato_id: Optional[int] = None
    entidad_tipo: Optional[str] = None
    entidad_id: Optional[str] = None
    padre_id: Optional[int] = None

@app.post("/notificaciones")
def crear_notificacion(body: NotificacionCreate, current_user=Depends(get_current_user)):
    """Envía una notificación. Si destinatario_id es None y tipo=BROADCAST, envía a todos."""
    uid = int(current_user.get("sub", 0))
    nombre = current_user.get("nombre") or current_user.get("email", "")

    if body.tipo == "BROADCAST":
        # Enviar a todos los usuarios activos excepto el remitente
        usuarios = supabase.table("usuarios").select("id").eq("activo", True).execute().data
        rows = []
        for u in usuarios:
            if u["id"] == uid:
                continue
            rows.append({
                "remitente_id":     uid,
                "remitente_nombre": nombre,
                "destinatario_id":  u["id"],
                "asunto":           body.asunto,
                "mensaje":          body.mensaje,
                "tipo":             body.tipo,
                "modulo":           body.modulo,
                "contrato_id":      body.contrato_id,
                "entidad_tipo":     body.entidad_tipo,
                "entidad_id":       body.entidad_id,
                "padre_id":         body.padre_id,
            })
        if rows:
            supabase.table("notificaciones").insert(rows).execute()
        registrar_log(current_user, "BROADCAST", "NOTIFICACIONES", "notificacion", None,
            {"asunto": body.asunto, "destinatarios": len(rows)})
        return {"enviados": len(rows)}
    else:
        row = {
            "remitente_id":     uid,
            "remitente_nombre": nombre,
            "destinatario_id":  body.destinatario_id,
            "asunto":           body.asunto,
            "mensaje":          body.mensaje,
            "tipo":             body.tipo,
            "modulo":           body.modulo,
            "contrato_id":      body.contrato_id,
            "entidad_tipo":     body.entidad_tipo,
            "entidad_id":       body.entidad_id,
            "padre_id":         body.padre_id,
        }
        result = supabase.table("notificaciones").insert(row).execute()

        # Si es respuesta, marcar el mensaje raíz como no leído para el destinatario
        if body.padre_id:
            try:
                supabase.table("notificaciones") \
                    .update({"leido": False}) \
                    .eq("id", body.padre_id) \
                    .execute()
            except: pass

        registrar_log(current_user, "ENVIAR", "NOTIFICACIONES", "notificacion",
            str(result.data[0]["id"]) if result.data else None,
            {"asunto": body.asunto, "destinatario_id": body.destinatario_id, "tipo": body.tipo})
        return result.data[0] if result.data else {}

@app.get("/notificaciones/recibidas")
def get_notificaciones_recibidas(
    solo_no_leidas: bool = False,
    limit: int = 50,
    offset: int = 0,
    contrato_id: Optional[int] = None,
    current_user=Depends(get_current_user)
):
    """Notificaciones recibidas por el usuario actual. Si se envía contrato_id, solo las de ese contrato."""
    uid = int(current_user.get("sub", 0))
    q = supabase.table("notificaciones").select("*") \
        .eq("destinatario_id", uid) \
        .order("created_at", desc=True)
    if contrato_id is not None:
        q = q.eq("contrato_id", contrato_id)
    if solo_no_leidas:
        q = q.eq("leido", False)
    q = q.range(offset, offset + limit - 1)
    return q.execute().data

@app.get("/notificaciones/enviadas")
def get_notificaciones_enviadas(
    limit: int = 50,
    offset: int = 0,
    contrato_id: Optional[int] = None,
    current_user=Depends(get_current_user)
):
    """Notificaciones enviadas por el usuario actual. Si se envía contrato_id, solo las de ese contrato."""
    uid = int(current_user.get("sub", 0))
    q = supabase.table("notificaciones").select("*") \
        .eq("remitente_id", uid) \
        .order("created_at", desc=True)
    if contrato_id is not None:
        q = q.eq("contrato_id", contrato_id)
    return q.range(offset, offset + limit - 1).execute().data

@app.get("/notificaciones/no-leidas-count")
def get_no_leidas_count(
    contrato_id: Optional[int] = None,
    current_user=Depends(get_current_user)
):
    """Conteo de notificaciones no leídas — solo mensajes raíz. Opcionalmente filtrado por contrato."""
    uid = int(current_user.get("sub", 0))
    try:
        q = supabase.table("notificaciones").select("id", count="exact") \
            .eq("destinatario_id", uid) \
            .eq("leido", False) \
            .is_("padre_id", "null")
        if contrato_id is not None:
            q = q.eq("contrato_id", contrato_id)
        result = q.execute()
        return {"count": result.count or 0}
    except Exception:
        return {"count": 0}

@app.get("/notificaciones/{notif_id}/hilo")
def get_hilo(notif_id: int, current_user=Depends(get_current_user)):
    """Devuelve el hilo completo de una notificación (padre + respuestas)."""
    # Primero encontrar el padre raíz
    notif = supabase.table("notificaciones").select("*").eq("id", notif_id).execute().data
    if not notif: raise HTTPException(status_code=404, detail="No encontrada")
    padre_id = notif[0].get("padre_id") or notif_id
    # Marcar como leída
    uid = int(current_user.get("sub", 0))
    supabase.table("notificaciones").update({"leido": True, "leido_at": datetime.utcnow().isoformat()}) \
        .eq("id", notif_id).eq("destinatario_id", uid).execute()
    # Traer padre + todas las respuestas
    padre = supabase.table("notificaciones").select("*").eq("id", padre_id).execute().data
    respuestas = supabase.table("notificaciones").select("*") \
        .eq("padre_id", padre_id).order("created_at").execute().data
    return {"hilo": padre + respuestas}

@app.put("/notificaciones/{notif_id}/leida")
def marcar_leida(notif_id: int, current_user=Depends(get_current_user)):
    uid = int(current_user.get("sub", 0))
    supabase.table("notificaciones").update({"leido": True, "leido_at": "now()"}) \
        .eq("id", notif_id).eq("destinatario_id", uid).execute()
    return {"ok": True}

@app.get("/notificaciones/usuarios-destinatarios")
def get_usuarios_destinatarios(current_user=Depends(get_current_user)):
    """Lista de usuarios activos para el selector de destinatario."""
    uid = int(current_user.get("sub", 0))
    rows = supabase.table("usuarios").select("id, nombre, apellidos, cargo_id") \
        .eq("activo", True).execute().data
    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    return [
        {"id": r["id"], "nombre": f"{r['nombre']} {r.get('apellidos','')}", "cargo": cargos.get(r.get("cargo_id"), "")}
        for r in rows if r["id"] != uid
    ]

# ─────────────────────────────────────────────────────────────
# ACTAS
# ─────────────────────────────────────────────────────────────
class ActaTipoCreate(BaseModel):
    nombre:   str
    es_cobro: bool = False

class ActaCreate(BaseModel):
    consecutivo:            int
    tipo_acta_id:           Optional[int]   = None
    tipo_grupo:             str             = "administrativa"
    observacion:            Optional[str]   = None
    asignado_a:             Optional[int]   = None
    fecha_asignacion:       Optional[str]   = None
    enlace:                 Optional[str]   = None
    numero_rpo:             Optional[int]   = None
    fecha_inicio:           Optional[str]   = None
    fecha_fin:              Optional[str]   = None
    valor_comp_ambiental:   Optional[float] = 0
    calificacion_ambiental: Optional[float] = None
    valor_comp_social:      Optional[float] = 0
    calificacion_social:    Optional[float] = None
    valor_comp_pmt:         Optional[float] = 0
    calificacion_pmt:       Optional[float] = None
    valor_cobrado_adicional:Optional[float] = 0
    ajuste_iccp:            Optional[float] = 0
    ajuste_icociv:          Optional[float] = 0
    ajuste_ipc:             Optional[float] = 0
    pct_proyectado_ajustes: Optional[float] = None

@app.get("/actas-tipos/{contrato_id}")
def get_actas_tipos(contrato_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("actas_tipos").select("*")\
        .or_(f"contrato_id.is.null,contrato_id.eq.{contrato_id}")\
        .order("nombre").execute().data
    return rows or []

@app.post("/actas-tipos/{contrato_id}")
def crear_acta_tipo(contrato_id: int, body: ActaTipoCreate, current_user=Depends(get_current_user)):
    existente = supabase.table("actas_tipos").select("id").eq("nombre", body.nombre).execute().data
    if existente:
        return existente[0]
    result = supabase.table("actas_tipos").insert({
        "nombre": body.nombre, "es_cobro": body.es_cobro, "contrato_id": contrato_id
    }).execute()
    return result.data[0] if result.data else {"ok": True}

@app.get("/actas/{contrato_id}/lista")
def listar_actas(contrato_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("actas").select(
        "*, actas_tipos(nombre, es_cobro), usuarios(nombre, apellidos)"
    ).eq("contrato_id", contrato_id).order("consecutivo", desc=True).execute().data
    result = []
    for r in (rows or []):
        tipo = r.get("actas_tipos") or {}
        usr  = r.get("usuarios") or {}
        adj  = (r.get("ajuste_iccp") or 0) + (r.get("ajuste_icociv") or 0) + (r.get("ajuste_ipc") or 0)
        total = (r.get("valor_comp_ambiental") or 0) + (r.get("valor_comp_social") or 0) + \
                (r.get("valor_comp_pmt") or 0) + (r.get("valor_cobrado_adicional") or 0) + adj
        result.append({**r,
            "tipo_nombre":       tipo.get("nombre", ""),
            "es_cobro":          tipo.get("es_cobro", False),
            "asignado_nombre":   f"{usr.get('nombre','')} {usr.get('apellidos','')}".strip(),
            "valor_total_ajustes": adj,
            "valor_total_acta":    total,
        })
    return result

@app.get("/actas/{contrato_id}/proximo-consecutivo")
def proximo_consecutivo_acta(contrato_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("actas").select("consecutivo").eq("contrato_id", contrato_id).execute().data
    maximo = max((r["consecutivo"] for r in rows), default=0)
    return {"proximo": maximo + 1}

@app.get("/actas/{contrato_id}/usuarios-contrato")
def usuarios_del_contrato(contrato_id: int, current_user=Depends(get_current_user)):
    uc = supabase.table("usuario_contratos").select("usuario_id").eq("contrato_id", contrato_id).execute().data or []
    ids_uc = [r["usuario_id"] for r in uc]
    usuarios_principal = supabase.table("usuarios").select("id, nombre, apellidos, cargo_id")\
        .eq("contrato_id", contrato_id).execute().data or []
    ids_principal = [u["id"] for u in usuarios_principal]
    todos_ids = list(set(ids_uc + ids_principal))
    if not todos_ids:
        return []
    users = supabase.table("usuarios").select("id, nombre, apellidos").in_("id", todos_ids).execute().data or []
    return users

@app.post("/actas/{contrato_id}")
def crear_acta(contrato_id: int, body: ActaCreate, current_user=Depends(get_current_user)):
    row = {"contrato_id": contrato_id, **{k: v for k, v in body.dict().items() if v is not None}}
    result = supabase.table("actas").insert(row).execute()
    nuevo = result.data[0] if result.data else {}
    registrar_log(current_user, "CREAR", "ACTAS", "acta", str(nuevo.get("id","")),
                  {"consecutivo": body.consecutivo, "tipo_grupo": body.tipo_grupo})
    return nuevo

@app.put("/actas/{acta_id}")
def actualizar_acta(acta_id: int, body: ActaCreate, current_user=Depends(get_current_user)):
    data = {k: v for k, v in body.dict().items() if v is not None}
    supabase.table("actas").update({**data, "updated_at": "now()"}).eq("id", acta_id).execute()
    registrar_log(current_user, "EDITAR", "ACTAS", "acta", str(acta_id), {})
    return {"ok": True}


class CerrarActaRpoBody(BaseModel):
    """Cierra un acta RPO en fecha_cierre (≤ fin de mes original), crea el siguiente mes completo y traslada cantidades residuales (sin N3 aprobado)."""
    fecha_cierre: str
    acta_id: Optional[int] = None


def _first_day_next_month(d: date) -> date:
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _last_day_of_month(y: int, m: int) -> date:
    return date(y, m, calendar.monthrange(y, m)[1])


def _acta_rpo_periodos_se_solapan(fi_a: str, ff_a: str, fi_b: str, ff_b: str) -> bool:
    """[fi_a,ff_a] y [fi_b,ff_b] se solapan (inclusive)."""
    return fi_a <= ff_b and ff_a >= fi_b


@app.post("/actas/{contrato_id}/rpo/cerrar-y-siguiente")
def cerrar_acta_rpo_y_crear_siguiente(
    contrato_id: int,
    body: CerrarActaRpoBody,
    current_user=Depends(get_current_user),
):
    try:
        fc = date.fromisoformat((body.fecha_cierre or "")[:10])
    except ValueError:
        raise HTTPException(status_code=422, detail="fecha_cierre debe ser YYYY-MM-DD válida.")

    cerrar_id = body.acta_id
    acta_row = None

    if cerrar_id is not None:
        rows = supabase.table("actas").select("*").eq("id", cerrar_id).eq("contrato_id", contrato_id).limit(1).execute().data
        if not rows:
            raise HTTPException(status_code=404, detail="Acta no encontrada en este contrato.")
        acta_row = rows[0]
    else:
        ds = fc.isoformat()
        rows = supabase.table("actas").select("*").eq("contrato_id", contrato_id).eq("tipo_grupo", "RPO")\
            .lte("fecha_inicio", ds).gte("fecha_fin", ds).order("id", desc=True).limit(1).execute().data
        if not rows:
            raise HTTPException(
                status_code=404,
                detail="No hay Acta RPO cuyo período incluya la fecha de cierre. Indica acta_id o revise las fechas.",
            )
        acta_row = rows[0]
        cerrar_id = acta_row["id"]

    if (acta_row.get("tipo_grupo") or "").strip().upper() != "RPO":
        raise HTTPException(status_code=400, detail="Solo aplica a actas con tipo_grupo RPO.")

    fi_old = (acta_row.get("fecha_inicio") or "")[:10]
    ff_old = (acta_row.get("fecha_fin") or "")[:10]
    if not fi_old or not ff_old:
        raise HTTPException(status_code=400, detail="El acta no tiene fecha_inicio / fecha_fin.")
    try:
        d_ini = date.fromisoformat(fi_old)
        d_fin_prev = date.fromisoformat(ff_old)
    except ValueError:
        raise HTTPException(status_code=400, detail="Fechas del acta corruptas.")

    if fc < d_ini:
        raise HTTPException(status_code=422, detail="La fecha de cierre no puede ser anterior al inicio del acta.")
    if fc > d_fin_prev:
        raise HTTPException(status_code=422, detail="La fecha de cierre no puede ser posterior al fin vigente del acta.")
    if fc > date.today():
        raise HTTPException(status_code=422, detail="La fecha de cierre no puede ser futura.")

    # Mes completo siguiente al mes de fecha_cierre (ej.: cierre 29-ene → 1–28/29 feb)
    fi_n = _first_day_next_month(fc)
    ff_n = _last_day_of_month(fi_n.year, fi_n.month)
    fi_ns, ff_ns = fi_n.isoformat(), ff_n.isoformat()

    existentes = supabase.table("actas").select("id, numero_rpo, fecha_inicio, fecha_fin, consecutivo")\
        .eq("contrato_id", contrato_id).eq("tipo_grupo", "RPO").execute().data or []
    for ex in existentes:
        if ex.get("id") == cerrar_id:
            continue
        ei = (ex.get("fecha_inicio") or "")[:10]
        ef = (ex.get("fecha_fin") or "")[:10]
        if ei and ef and _acta_rpo_periodos_se_solapan(ei, ef, fi_ns, ff_ns):
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un Acta RPO que cubre el período {fi_ns} … {ff_ns} (id {ex.get('id')} / RPO {ex.get('numero_rpo')}).",
            )

    rpo_rows = [r for r in existentes if r.get("numero_rpo") is not None]
    max_rpo = max((int(r["numero_rpo"]) for r in rpo_rows), default=0)
    nuevo_numero_rpo = max_rpo + 1

    cons_rows = supabase.table("actas").select("consecutivo").eq("contrato_id", contrato_id).execute().data or []
    max_cons = max((r["consecutivo"] for r in cons_rows), default=0)
    nuevo_cons = max_cons + 1

    # 1) Acortar período del acta actual
    supabase.table("actas").update({"fecha_fin": fc.isoformat(), "updated_at": "now()"}).eq("id", cerrar_id).execute()

    new_row = {
        "contrato_id":      contrato_id,
        "consecutivo":      nuevo_cons,
        "tipo_grupo":       "RPO",
        "numero_rpo":       nuevo_numero_rpo,
        "fecha_inicio":     fi_ns,
        "fecha_fin":        ff_ns,
        "tipo_acta_id":     acta_row.get("tipo_acta_id"),
        "asignado_a":       acta_row.get("asignado_a"),
        "fecha_asignacion": acta_row.get("fecha_asignacion"),
        "observacion":      acta_row.get("observacion"),
    }
    new_row = {k: v for k, v in new_row.items() if v is not None}
    ins = supabase.table("actas").insert(new_row).execute()
    creada = ins.data[0] if ins.data else {}
    nueva_id = creada.get("id")

    registros_movidos = 0
    reportes_tocados = set()

    if nueva_id:
        off = 0
        while True:
            batch = supabase.table("so_registros").select("id, reporte_id, nivel3_estado")\
                .eq("contrato_id", contrato_id).eq("acta_rpo_id", cerrar_id)\
                .range(off, off + 199).execute().data or []
            for reg in batch:
                n3 = (reg.get("nivel3_estado") or "").strip().lower()
                if n3 == "aprobado":
                    continue
                rid = reg["id"]
                supabase.table("so_registros").update({"acta_rpo_id": nueva_id}).eq("id", rid).execute()
                registros_movidos += 1
                rp = reg.get("reporte_id")
                if rp is not None:
                    reportes_tocados.add(int(rp))
            if len(batch) < 200:
                break
            off += 200

        for rep_id in reportes_tocados:
            supabase.table("so_reportes").update({"acta_rpo_id": nueva_id})\
                .eq("id", rep_id).eq("contrato_id", contrato_id).execute()

    registrar_log(
        current_user,
        "EDITAR",
        "ACTAS",
        "acta",
        str(cerrar_id),
        {
            "accion": "cerrar_rpo_anticipado",
            "fecha_cierre": fc.isoformat(),
            "nueva_acta_id": nueva_id,
            "registros_movidos": registros_movidos,
        },
    )

    return {
        "ok": True,
        "acta_cerrada": {"id": cerrar_id, "fecha_fin": fc.isoformat()},
        "acta_creada": creada,
        "periodo_siguiente": {"fecha_inicio": fi_ns, "fecha_fin": ff_ns},
        "registros_movidos_residual": registros_movidos,
    }


@app.get("/actas/{acta_id}/financiero")
def acta_financiero(acta_id: int, current_user=Depends(get_current_user)):
    acta = supabase.table("actas").select("contrato_id, numero_rpo, tipo_grupo")\
        .eq("id", acta_id).single().execute().data
    if not acta or acta.get("tipo_grupo") != "cobro":
        return {"resumen": [], "capitulos": []}
    contrato_id = acta["contrato_id"]
    caps = supabase.table("listado_precios").select("capitulo").eq("contrato_id", contrato_id)\
        .execute().data or []
    caps_unicos = list(dict.fromkeys([r["capitulo"] for r in caps if r.get("capitulo")]))
    resumen = [
        {"estado": "Aprobado",                    "aiu": 0, "iva": 0},
        {"estado": "Pendiente",                   "aiu": 0, "iva": 0},
        {"estado": "Pendiente aprobación precio", "aiu": 0, "iva": 0},
        {"estado": "Rechazado",                   "aiu": 0, "iva": 0},
    ]
    capitulos = [{"capitulo": c, "aprobado": 0, "pendiente": 0, "pendiente_precio": 0,
                  "no_revisado": 0, "rechazado": 0} for c in caps_unicos]
    return {"resumen": resumen, "capitulos": capitulos}

# ─────────────────────────────────────────────────────────────
# SUBCONTRATISTAS
# ─────────────────────────────────────────────────────────────
class SubcontratistaCreate(BaseModel):
    razon_social:    str
    objeto_contrato: Optional[str] = None
    nit:             Optional[str] = None
    nombre_contacto: Optional[str] = None
    telefono:        Optional[str] = None

class CorteCreate(BaseModel):
    tipo_periodo: str          # 'quincenal' | 'mensual'
    consecutivo:  int
    fecha_inicio: str          # ISO date YYYY-MM-DD
    fecha_fin:    str

class CorteUpdate(BaseModel):
    fecha_fin: str

class SubprecioCreate(BaseModel):
    listado_precio_id:   int
    precio_unitario_sub: float

class SubprecioUpdate(BaseModel):
    precio_unitario_sub: float

@app.get("/subcontratistas/{contrato_id}")
def listar_subcontratistas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    rows = supabase.table("subcontratistas").select("*").eq("contrato_id", contrato_id).order("razon_social").execute().data
    return rows or []

@app.post("/subcontratistas/{contrato_id}")
def crear_subcontratista(contrato_id: int, body: SubcontratistaCreate, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    row = {"contrato_id": contrato_id, **body.dict()}
    result = supabase.table("subcontratistas").insert(row).execute()
    nuevo = result.data[0] if result.data else {}
    registrar_log(current_user, "CREAR", "SUBCONTRATISTAS", "subcontratista", str(nuevo.get("id","")),
                  {"razon_social": body.razon_social})
    return nuevo

@app.put("/subcontratistas/{sub_id}")
def actualizar_subcontratista(sub_id: int, body: SubcontratistaCreate, current_user=Depends(get_current_user)):
    supabase.table("subcontratistas").update(body.dict()).eq("id", sub_id).execute()
    registrar_log(current_user, "EDITAR", "SUBCONTRATISTAS", "subcontratista", str(sub_id),
                  {"razon_social": body.razon_social})
    return {"ok": True}

@app.patch("/subcontratistas/{sub_id}/toggle-activo")
def toggle_activo_subcontratista(sub_id: int, current_user=Depends(get_current_user)):
    actual = supabase.table("subcontratistas").select("activo").eq("id", sub_id).single().execute().data
    nuevo_estado = not (actual.get("activo") or False)
    supabase.table("subcontratistas").update({"activo": nuevo_estado}).eq("id", sub_id).execute()
    registrar_log(current_user, "EDITAR", "SUBCONTRATISTAS", "subcontratista", str(sub_id),
                  {"activo": nuevo_estado})
    return {"activo": nuevo_estado}

# ── Cortes ──────────────────────────────────────────────────
@app.get("/subcontratistas/{sub_id}/cortes")
def listar_cortes(sub_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("subcontratista_cortes").select("*").eq("subcontratista_id", sub_id).order("consecutivo").execute().data
    return rows or []

@app.get("/subcontratistas/{sub_id}/proximo-consecutivo")
def proximo_consecutivo(sub_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("subcontratista_cortes").select("consecutivo").eq("subcontratista_id", sub_id).execute().data
    maximo = max((r["consecutivo"] for r in rows), default=0)
    return {"proximo": maximo + 1}

@app.post("/subcontratistas/{sub_id}/cortes")
def crear_corte(sub_id: int, body: CorteCreate, current_user=Depends(get_current_user)):
    from datetime import date
    fi = date.fromisoformat(body.fecha_inicio)
    ff = date.fromisoformat(body.fecha_fin)
    if ff <= fi:
        raise HTTPException(status_code=400, detail="La fecha fin debe ser posterior a la fecha inicio.")
    cortes_existentes = supabase.table("subcontratista_cortes").select("fecha_inicio, fecha_fin, consecutivo")\
        .eq("subcontratista_id", sub_id).order("consecutivo").execute().data or []
    if cortes_existentes:
        ultimo = cortes_existentes[-1]
        ultimo_fin = date.fromisoformat(str(ultimo["fecha_fin"]))
        if fi != ultimo_fin:
            raise HTTPException(status_code=400,
                detail=f"La fecha inicio debe ser exactamente {ultimo_fin.isoformat()} (fecha fin del corte anterior).")
    row = {
        "subcontratista_id": sub_id,
        "contrato_id": supabase.table("subcontratistas").select("contrato_id").eq("id", sub_id).single().execute().data["contrato_id"],
        "consecutivo":   body.consecutivo,
        "tipo_periodo":  body.tipo_periodo,
        "fecha_inicio":  body.fecha_inicio,
        "fecha_fin":     body.fecha_fin,
    }
    result = supabase.table("subcontratista_cortes").insert(row).execute()
    nuevo = result.data[0] if result.data else {}
    registrar_log(current_user, "CREAR", "SUBCONTRATISTAS", "corte", str(nuevo.get("id","")),
                  {"subcontratista_id": sub_id, "consecutivo": body.consecutivo})
    return nuevo

@app.put("/subcontratistas/cortes/{corte_id}")
def actualizar_corte(corte_id: int, body: CorteUpdate, current_user=Depends(get_current_user)):
    from datetime import date, timedelta
    corte = supabase.table("subcontratista_cortes").select("*").eq("id", corte_id).single().execute().data
    if not corte:
        raise HTTPException(status_code=404, detail="Corte no encontrado.")
    nueva_fin = date.fromisoformat(body.fecha_fin)
    supabase.table("subcontratista_cortes").update({"fecha_fin": body.fecha_fin}).eq("id", corte_id).execute()
    siguiente = supabase.table("subcontratista_cortes").select("*")\
        .eq("subcontratista_id", corte["subcontratista_id"])\
        .eq("consecutivo", corte["consecutivo"] + 1).execute().data
    if siguiente:
        sig = siguiente[0]
        tipo = sig.get("tipo_periodo", corte.get("tipo_periodo", "quincenal"))
        nueva_fi_sig = nueva_fin
        if tipo == "quincenal":
            nueva_ff_sig = nueva_fi_sig + timedelta(days=15)
        else:
            import calendar
            dias_mes = calendar.monthrange(nueva_fi_sig.year, nueva_fi_sig.month)[1]
            nueva_ff_sig = nueva_fi_sig + timedelta(days=dias_mes)
        supabase.table("subcontratista_cortes").update({
            "fecha_inicio": nueva_fi_sig.isoformat(),
            "fecha_fin": nueva_ff_sig.isoformat(),
        }).eq("id", sig["id"]).execute()
    registrar_log(current_user, "EDITAR", "SUBCONTRATISTAS", "corte", str(corte_id),
                  {"nueva_fecha_fin": body.fecha_fin})
    return {"ok": True}

# ── Precios subcontratista ───────────────────────────────────
@app.get("/subcontratistas/{sub_id}/precios")
def listar_precios_sub(sub_id: int, current_user=Depends(get_current_user)):
    rows = supabase.table("subcontratista_precios").select(
        "*, listado_precios(capitulo, competencia, item_numero, descripcion, unidad, precio_unitario)"
    ).eq("subcontratista_id", sub_id).execute().data
    result = []
    for r in (rows or []):
        lp = r.get("listado_precios") or {}
        result.append({
            "id":                   r["id"],
            "listado_precio_id":    r["listado_precio_id"],
            "precio_unitario_sub":  r["precio_unitario_sub"],
            "capitulo":             lp.get("capitulo", ""),
            "competencia":          lp.get("competencia", ""),
            "item_numero":          lp.get("item_numero", ""),
            "descripcion":          lp.get("descripcion", ""),
            "unidad":               lp.get("unidad", ""),
            "precio_unitario_ref":  lp.get("precio_unitario", 0),
        })
    return result

@app.post("/subcontratistas/{sub_id}/precios")
def agregar_precio_sub(sub_id: int, body: SubprecioCreate, current_user=Depends(get_current_user)):
    sub = supabase.table("subcontratistas").select("contrato_id").eq("id", sub_id).single().execute().data
    if not sub:
        raise HTTPException(status_code=404, detail="Subcontratista no encontrado.")
    existente = supabase.table("listado_precios").select("id").eq("id", body.listado_precio_id)\
        .eq("contrato_id", sub["contrato_id"]).execute().data
    if not existente:
        raise HTTPException(status_code=400, detail="El ítem no pertenece al listado de precios de este contrato.")
    row = {
        "subcontratista_id":   sub_id,
        "contrato_id":         sub["contrato_id"],
        "listado_precio_id":   body.listado_precio_id,
        "precio_unitario_sub": body.precio_unitario_sub,
    }
    result = supabase.table("subcontratista_precios").insert(row).execute()
    registrar_log(current_user, "CREAR", "SUBCONTRATISTAS", "precio_sub", str(sub_id),
                  {"listado_precio_id": body.listado_precio_id})
    return result.data[0] if result.data else {"ok": True}

@app.put("/subcontratistas/precios/{precio_id}")
def actualizar_precio_sub(precio_id: int, body: SubprecioUpdate, current_user=Depends(get_current_user)):
    supabase.table("subcontratista_precios").update({"precio_unitario_sub": body.precio_unitario_sub})\
        .eq("id", precio_id).execute()
    registrar_log(current_user, "EDITAR", "SUBCONTRATISTAS", "precio_sub", str(precio_id),
                  {"precio_unitario_sub": body.precio_unitario_sub})
    return {"ok": True}

@app.get("/subcontratistas/{contrato_id}/alertas-corte")
def alertas_corte(contrato_id: int, current_user=Depends(get_current_user)):
    """Subcontratistas cuyo corte activo vence mañana o hoy."""
    from datetime import date, timedelta
    hoy = date.today()
    manana = hoy + timedelta(days=1)
    subs = supabase.table("subcontratistas").select("id, razon_social").eq("contrato_id", contrato_id)\
        .eq("activo", True).execute().data or []
    alertas = []
    for s in subs:
        cortes = supabase.table("subcontratista_cortes").select("consecutivo, fecha_fin, tipo_periodo")\
            .eq("subcontratista_id", s["id"]).order("consecutivo", desc=True).limit(1).execute().data
        if cortes:
            ultimo = cortes[0]
            ff = date.fromisoformat(str(ultimo["fecha_fin"]))
            if ff in (hoy, manana):
                alertas.append({
                    "subcontratista_id": s["id"],
                    "razon_social":      s["razon_social"],
                    "fecha_fin":         ultimo["fecha_fin"],
                    "consecutivo":       ultimo["consecutivo"],
                    "vence_hoy":         ff == hoy,
                })
    return alertas

# ─────────────────────────────────────────────
# SICOE OBRA
# ─────────────────────────────────────────────

@app.get("/sicoe-obra/{contrato_id}/reportes")
def listar_reportes_obra(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("so_reportes")\
            .select("*, subcontratistas(razon_social)")\
            .eq("contrato_id", contrato_id)\
            .order("numero_reporte", desc=True).execute().data
    rows = supabase_execute(_q)

    # Batch-resolve semana_numero y acta_rpo (las FKs no están expuestas como JOINs implícitos en PostgREST)
    semana_ids = list({r["semana_id"] for r in rows if r.get("semana_id")})
    acta_ids   = list({r["acta_rpo_id"] for r in rows if r.get("acta_rpo_id")})

    semana_map = {}
    if semana_ids:
        try:
            def _sems():
                return supabase.table("so_semanas").select("id, numero_semana")\
                    .in_("id", semana_ids).execute().data
            for s in supabase_execute(_sems):
                semana_map[s["id"]] = s["numero_semana"]
        except Exception:
            pass

    acta_map = {}
    if acta_ids:
        try:
            def _actas():
                return supabase.table("actas").select("id, numero_rpo, consecutivo")\
                    .in_("id", acta_ids).execute().data
            for a in supabase_execute(_actas):
                acta_map[a["id"]] = a
        except Exception:
            pass

    for r in rows:
        sub = r.pop("subcontratistas", None)
        r["subcontratista_nombre"] = sub["razon_social"] if sub else None
        r["semana_numero"]    = semana_map.get(r.get("semana_id"))
        acta = acta_map.get(r.get("acta_rpo_id"))
        r["acta_rpo"]         = acta["numero_rpo"] if acta else None
        r["acta_consecutivo"] = acta["consecutivo"] if acta else None
    return rows

@app.get("/sicoe-obra/{contrato_id}/pk-ids")
def listar_pk_ids(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("pk_ids")\
            .select("*")\
            .eq("contrato_id", contrato_id)\
            .order("pk_id").execute().data
    return supabase_execute(_q)

@app.get("/sicoe-obra/{contrato_id}/subcontratistas-activos")
def listar_subcontratistas_activos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    def _q():
        return supabase.table("subcontratistas")\
            .select("id, razon_social")\
            .eq("contrato_id", contrato_id)\
            .eq("activo", True)\
            .order("razon_social").execute().data
    rows = supabase_execute(_q)
    for r in rows:
        r["nombre"] = r.pop("razon_social", "")
    return rows

@app.get("/usuarios/{usuario_id}")
def obtener_usuario(usuario_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("usuarios").select("id, nombre, apellidos")\
            .eq("id", usuario_id).execute().data
    rows = supabase_execute(_q)
    return rows[0] if rows else {}

@app.get("/sicoe-obra/{contrato_id}/inspectores")
def listar_inspectores(contrato_id: int, current_user=Depends(get_current_user)):
    def _u():
        return supabase.table("usuarios")\
            .select("id, nombre, apellidos")\
            .eq("contrato_id", contrato_id)\
            .eq("estado", "aprobado")\
            .eq("cargo_id", 54)\
            .order("nombre").execute().data
    usuarios = supabase_execute(_u)
    return [{"id": u["id"], "nombre": f"{u.get('nombre','')} {u.get('apellidos','')}".strip()} for u in usuarios]

@app.get("/sicoe-obra/{contrato_id}/capitulos")
def listar_capitulos_obra(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("listado_precios")\
            .select("capitulo")\
            .eq("contrato_id", contrato_id)\
            .execute().data
    rows = supabase_execute(_q)
    import re
    def orden_capitulo(c):
        m = re.match(r'^(\d+)', c)
        return (int(m.group(1)) if m else 9999, c)
    caps = sorted(set(r["capitulo"] for r in rows if r.get("capitulo")), key=orden_capitulo)
    return [{"capitulo": c} for c in caps]

@app.get("/sicoe-obra/{contrato_id}/next-reporte")
def next_numero_reporte(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        rows = supabase.table("so_reportes")\
            .select("numero_reporte")\
            .eq("contrato_id", contrato_id)\
            .order("numero_reporte", desc=True)\
            .limit(1).execute().data
        return rows
    rows = supabase_execute(_q)
    ultimo = rows[0]["numero_reporte"] if rows else 0
    return {"siguiente": ultimo + 1}

@app.get("/sicoe-obra/{contrato_id}/nodos")
def listar_nodos_obra(contrato_id: int, capitulo: str = None, current_user=Depends(get_current_user)):
    def _q():
        q = supabase.table("presupuesto")\
            .select("no_inicio, no_final")\
            .eq("contrato_id", contrato_id)\
            .eq("dado_de_baja", False)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        return q.execute().data
    rows = supabase_execute(_q)
    nodos = set()
    for r in rows:
        if r.get("no_inicio"): nodos.add(r["no_inicio"])
        if r.get("no_final"): nodos.add(r["no_final"])
    return sorted(list(nodos))

class ReporteCreate(BaseModel):
    descripcion_actividad: str
    subcontratista_id: Optional[int] = None
    inspector_id: Optional[int] = None
    capitulo: str
    pk_id_id: Optional[int] = None
    civ: Optional[str] = None
    tramo: Optional[str] = None
    infraestructura: Optional[str] = None
    calzada: Optional[str] = None
    ubicacion: Optional[str] = None
    coord_lat: Optional[float] = None
    coord_lng: Optional[float] = None
    margen: Optional[str] = None
    abs_inicio: Optional[float] = None
    abs_final: Optional[float] = None
    nodo_ini: Optional[str] = None
    nodo_fin: Optional[str] = None
    estado: Optional[str] = None
    enlace_soporte: Optional[str] = None
    semana_id: Optional[int] = None
    acta_rpo_id: Optional[int] = None
    corte_id: Optional[int] = None

@app.get("/sicoe-obra/{contrato_id}/cargos-validacion")
def cargos_con_validacion(contrato_id: int, current_user=Depends(get_current_user)):
    try:
        # Cargos que están en CARGO_ID_NIVEL_MAP y tienen usuarios aprobados
        cargo_ids_nivel = list(CARGO_ID_NIVEL_MAP.keys())

        def _cargos():
            return supabase.table("cargos").select("id, nombre")\
                .in_("id", cargo_ids_nivel).execute().data
        cargos_rows = supabase_execute(_cargos)
        cargo_id_nombre = {r["id"]: r["nombre"] for r in cargos_rows}

        def _usuarios():
            return supabase.table("usuarios").select("cargo_id")\
                .eq("contrato_id", contrato_id)\
                .eq("estado", "aprobado")\
                .in_("cargo_id", cargo_ids_nivel).execute().data
        usuarios_rows = supabase_execute(_usuarios)
        cargos_activos = {r["cargo_id"] for r in usuarios_rows}

        return [
            {"id": cid, "nombre": cargo_id_nombre[cid]}
            for cid in cargo_ids_nivel
            if cid in cargos_activos and cid in cargo_id_nombre
        ]
    except Exception as e:
        return []


@app.get("/sicoe-obra/{contrato_id}/reportes/buscar")
def buscar_reportes_obra(
    contrato_id: int,
    numero_reporte: Optional[int] = None,
    numero_registro: Optional[int] = None,
    semana: Optional[int] = None,
    acta_rpo: Optional[int] = None,
    subcontratista_id: Optional[int] = None,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    tramo: Optional[str] = None,
    costado: Optional[str] = None,
    pk_id: Optional[int] = None,
    abs_inicio: Optional[float] = None,
    abs_final: Optional[float] = None,
    estado: Optional[str] = None,
    cargo_id: Optional[int] = None,
    estado_validacion: Optional[str] = None,
    validacion_capas: Optional[str] = None,
    q_observacion: Optional[str] = None,
    q_nodo: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    current_user=Depends(get_current_user)
):
    limit = min(limit, 100)
    _ocultar_costo_rep = _sicoe_ocultar_costo_directo_reportes(current_user)
    capas_v = _parse_validacion_capas_param(validacion_capas, cargo_id, estado_validacion)
    _nivel_l = None
    _ev_l = None
    _prereq = None

    # Reporte IDs derivados de filtros sobre so_registros
    reporte_ids_from_reg = None

    if numero_registro is not None:
        def _reg():
            return supabase.table("so_registros").select("reporte_id")\
                .eq("contrato_id", contrato_id)\
                .eq("numero_registro", numero_registro).execute().data
        rows_reg = supabase_execute(_reg)
        reporte_ids_from_reg = list({r["reporte_id"] for r in rows_reg if r.get("reporte_id")})
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # ── Abscisa: por líneas (solape con [abs_inicio, abs_final] del filtro), no solo cabecera del reporte
    if abs_inicio is not None or abs_final is not None:
        ids_abs = _sicoe_reporte_ids_abs_solapa_registros(contrato_id, abs_inicio, abs_final, reporte_ids_from_reg)
        if ids_abs is not None:
            if not ids_abs:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
            if reporte_ids_from_reg is not None:
                reporte_ids_from_reg = [x for x in reporte_ids_from_reg if x in ids_abs]
            else:
                reporte_ids_from_reg = list(ids_abs)
            if not reporte_ids_from_reg:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # ── Filtros sobre so_registros (línea “Excel”): capítulo, ítem, subc, tramo, costado
    has_reg_f = any([
        capitulo, item, subcontratista_id is not None,
        bool(tramo), bool(costado),
    ])
    if has_reg_f:
        def _regs_f():
            q = supabase.table("so_registros").select("reporte_id")\
                .eq("contrato_id", contrato_id)
            if capitulo:                    q = q.eq("capitulo", capitulo)
            if item:                        q = q.ilike("item_numero", f"%{item}%")
            if subcontratista_id is not None: q = q.eq("subcontratista_id", subcontratista_id)
            if tramo:                       q = q.eq("tramo", tramo)
            if costado:                     q = _so_reg_filtro_costado(q, costado)
            return q.limit(50000).execute().data
        ids_reg_f = list({r["reporte_id"] for r in supabase_execute(_regs_f) if r.get("reporte_id")})
        if not ids_reg_f:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        if reporte_ids_from_reg is not None:
            reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_reg_f))
        else:
            reporte_ids_from_reg = ids_reg_f
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # ── Texto en observación / nodo inicio o final (so_registros) ────────────
    if q_observacion is not None and str(q_observacion).strip():
        pat_o = f"%{str(q_observacion).strip()}%"

        def _regs_obs():
            q = supabase.table("so_registros").select("reporte_id")\
                .eq("contrato_id", contrato_id).ilike("observacion", pat_o)
            return q.limit(50000).execute().data
        ids_obs = list({r["reporte_id"] for r in supabase_execute(_regs_obs) if r.get("reporte_id")})
        if not ids_obs:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        if reporte_ids_from_reg is not None:
            reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_obs))
        else:
            reporte_ids_from_reg = ids_obs
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    if q_nodo is not None and str(q_nodo).strip():
        ids_n = _sicoe_reporte_ids_coinciden_nodo(contrato_id, q_nodo, reporte_ids_from_reg)
        if ids_n is not None:
            if not ids_n:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
            if reporte_ids_from_reg is not None:
                reporte_ids_from_reg = [x for x in reporte_ids_from_reg if x in ids_n]
            else:
                reporte_ids_from_reg = list(ids_n)
            if not reporte_ids_from_reg:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # PK desde líneas de obra (so_registros), no solo cabecera de so_reportes — alinea plano/grilla/panel
    if pk_id is not None:
        def _regs_pk():
            q = supabase.table("so_registros").select("reporte_id")\
                .eq("contrato_id", contrato_id).eq("pk_id_id", pk_id)
            return q.limit(50000).execute().data
        ids_pk = list({r["reporte_id"] for r in supabase_execute(_regs_pk) if r.get("reporte_id")})
        if not ids_pk:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        if reporte_ids_from_reg is not None:
            reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_pk))
        else:
            reporte_ids_from_reg = ids_pk
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # Validación N1–N3: varias capas = AND en la misma fila de so_registros (misma lógica en panel y grilla)
    if capas_v and not _estado_filtro_omite_validacion_por_cargo(estado):
        _tramo_v = tramo
        _costado_v = costado
        _cap_v = capitulo
        _sub_v = subcontratista_id
        _item_v = item
        _seen_rids = set()
        _pag_offset = 0
        _pag_size = 1000
        ids_val = []

        while True:
            def _val_page(off=_pag_offset):
                q0 = supabase.table("so_registros").select("reporte_id")\
                    .eq("contrato_id", contrato_id)
                q0 = _so_registros_q_y_capas_validacion(
                    q0, capas_v, pk_id, _tramo_v, _costado_v, _cap_v, _sub_v, _item_v
                )
                return q0.range(off, off + _pag_size - 1).execute().data
            _page = supabase_execute(_val_page)
            for r in _page:
                rid = r.get("reporte_id")
                if rid and rid not in _seen_rids:
                    _seen_rids.add(rid)
                    ids_val.append(rid)
            if len(_page) < _pag_size:
                break
            _pag_offset += _pag_size

        if ids_val and _validacion_cualquier_nivel2_o_3(capas_v):
            ids_val = _filtrar_reporte_ids_excl_estados(
                contrato_id, ids_val, ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA
            )

        if not ids_val:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        if reporte_ids_from_reg is not None:
            reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_val))
        else:
            reporte_ids_from_reg = ids_val
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

        _nivel_l = CARGO_ID_NIVEL_MAP.get(int(capas_v[0]["cargo_id"]))
        _ev_l = (capas_v[0].get("estado") or "").strip()
        _prereq = CARGO_NIVEL_PRERREQUISITO.get(_nivel_l) if _nivel_l else None

    # Resolver semana_id desde numero_semana
    semana_id_filtro = None
    if semana is not None:
        try:
            def _sem_id():
                return supabase.table("so_semanas").select("id")\
                    .eq("contrato_id", contrato_id)\
                    .eq("numero_semana", semana).execute().data
            sem_rows = supabase_execute(_sem_id)
            if sem_rows:
                semana_id_filtro = sem_rows[0]["id"]
            else:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        except Exception:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # Resolver acta_id desde numero_rpo (con fallback a consecutivo)
    acta_id_filtro = None
    if acta_rpo is not None:
        try:
            def _acta_id():
                # Intentar por numero_rpo primero
                rows = supabase.table("actas").select("id")\
                    .eq("contrato_id", contrato_id)\
                    .eq("numero_rpo", acta_rpo).execute().data
                if not rows:
                    # Fallback: buscar por consecutivo
                    rows = supabase.table("actas").select("id")\
                        .eq("contrato_id", contrato_id)\
                        .eq("consecutivo", acta_rpo).execute().data
                return rows
            acta_rows = supabase_execute(_acta_id)
            if acta_rows:
                acta_id_filtro = acta_rows[0]["id"]
            else:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        except Exception:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

        # Buscar reporte_ids via so_registros.acta_rpo_id (más fiable que so_reportes.acta_rpo_id)
        try:
            _acta_id_local = acta_id_filtro
            def _regs_acta():
                return supabase.table("so_registros").select("reporte_id")\
                    .eq("contrato_id", contrato_id)\
                    .eq("acta_rpo_id", _acta_id_local).execute().data
            reg_acta_rows = supabase_execute(_regs_acta)
            ids_via_reg = list({r["reporte_id"] for r in reg_acta_rows if r.get("reporte_id")})
            if ids_via_reg:
                if reporte_ids_from_reg is not None:
                    reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_via_reg))
                else:
                    reporte_ids_from_reg = ids_via_reg
                if not reporte_ids_from_reg:
                    return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
                acta_id_filtro = None  # ya cubierto por reporte_ids_from_reg
        except Exception:
            pass  # fallback: filtrar por acta_rpo_id directo en so_reportes

    # PostgREST envía .in_() como parámetro URL; listas grandes superan el límite
    # de longitud del servidor y se truncan silenciosamente. Se divide en chunks
    # para garantizar que todos los IDs se filtren correctamente.
    _IDS_CHUNK_SIZE = 200

    def _build_q(ids_chunk=None):
        q = supabase.table("so_reportes").select("*, subcontratistas(razon_social)")\
            .eq("contrato_id", contrato_id)
        if numero_reporte is not None:
            q = q.eq("numero_reporte", numero_reporte)
        # subcontratista / tramo / costado: ya restringidos vía so_registros (has_reg_f)
        # o vía bloque de validación; repetir en cabecera vacía el universo.
        # pk_id: restringido por reporte_ids_from_reg (líneas so_registros), no por cabecera.
        # abs_inicio/abs_final: ya aplicados por solape en so_registros (arriba)
        _hay_n23_build = (
            (_validacion_cualquier_nivel2_o_3(capas_v) if capas_v else False)
            or (_nivel_l is not None and _es_validacion_avanzada(_nivel_l))
        )
        if estado:
            q = _so_reportes_q_por_estado(q, estado)
        elif _hay_n23_build:
            q = q.not_.in_("estado", list(ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA))
        # Importante: para validaciones por nivel, el universo debe definirse por
        # estado de so_registros (nivelX_estado), no por estado de so_reportes.
        # Solo se filtra por estado de reporte cuando el usuario lo pide explícitamente.
        if semana_id_filtro is not None:
            q = q.eq("semana_id", semana_id_filtro)
        if acta_id_filtro is not None:
            q = q.eq("acta_rpo_id", acta_id_filtro)
        if ids_chunk is not None:
            q = q.in_("id", ids_chunk)
        return q

    # Chunking completo para garantizar todos los IDs
    all_rows = []
    if reporte_ids_from_reg is not None:
        seen_ids = set()
        for i in range(0, len(reporte_ids_from_reg), 200):
            _chunk = reporte_ids_from_reg[i:i + 200]
            def _qc(c=_chunk):
                return _build_q(c).limit(1000).execute().data
            for row in supabase_execute(_qc):
                if row["id"] not in seen_ids:
                    seen_ids.add(row["id"])
                    all_rows.append(row)
    else:
        def _qall():
            return _build_q(None).limit(5000).execute().data
        all_rows = supabase_execute(_qall)

    all_rows.sort(key=lambda r: (r.get("numero_reporte") or 0), reverse=True)
    rows = all_rows[offset:offset + limit + 1]
    hay_mas = len(rows) > limit
    rows = rows[:limit]

    # Batch-resolve semana_numero y acta_rpo
    semana_ids = list({r["semana_id"] for r in rows if r.get("semana_id")})
    acta_ids   = list({r["acta_rpo_id"] for r in rows if r.get("acta_rpo_id")})
    semana_map = {}
    if semana_ids:
        try:
            def _sems():
                return supabase.table("so_semanas").select("id, numero_semana")\
                    .in_("id", semana_ids).execute().data
            for s in supabase_execute(_sems):
                semana_map[s["id"]] = s["numero_semana"]
        except Exception:
            pass
    acta_map = {}
    if acta_ids:
        try:
            def _actas():
                return supabase.table("actas").select("id, numero_rpo, consecutivo")\
                    .in_("id", acta_ids).execute().data
            for a in supabase_execute(_actas):
                acta_map[a["id"]] = a
        except Exception:
            pass
    # Batch-resolve per-cargo estado_max desde so_registros
    reporte_ids_batch = [r["id"] for r in rows]
    if reporte_ids_batch:
        try:
            _rb_l = reporte_ids_batch
            def _reg_estados():
                q = supabase.table("so_registros")\
                    .select("reporte_id, costo_directo, nivel1_estado, nivel2_estado, nivel3_estado, sub_estado, semana_id, acta_rpo_id, item_numero, capitulo, subcontratista_id, tramo, margen")\
                    .in_("reporte_id", _rb_l)

                # Mantener coherencia con el universo filtrado de grilla/panel
                if semana_id_filtro is not None:
                    q = q.eq("semana_id", semana_id_filtro)
                if acta_id_filtro is not None:
                    q = q.eq("acta_rpo_id", acta_id_filtro)
                if capitulo:
                    q = q.eq("capitulo", capitulo)
                if subcontratista_id is not None:
                    q = q.eq("subcontratista_id", subcontratista_id)
                if item:
                    q = q.ilike("item_numero", f"%{item}%")
                if tramo:
                    q = q.eq("tramo", tramo)
                if costado:
                    q = _so_reg_filtro_costado(q, costado)
                if pk_id is not None:
                    q = q.eq("pk_id_id", pk_id)
                # Mismo universo de líneas que el panel dinámico (abs / análisis)
                q = _so_reg_filtro_abs_solape(q, abs_inicio, abs_final)

                # Misma semántica AND que el bloque de ids_val (varias capas en la misma línea)
                if capas_v and not _estado_filtro_omite_validacion_por_cargo(estado):
                    q = _so_registros_q_y_capas_validacion(
                        q, capas_v, pk_id, tramo, costado, capitulo, subcontratista_id, item
                    )

                return q.limit(5000).execute().data
            reg_estados = supabase_execute(_reg_estados)
            cargo_map = {r["id"]: {"n1": [], "n2": [], "n3": [], "sub": [], "count": 0} for r in rows}
            costo_map = {}
            for reg in reg_estados:
                rid = reg.get("reporte_id")
                if rid in cargo_map:
                    cargo_map[rid]["n1"].append(reg.get("nivel1_estado") or "No Revisado")
                    cargo_map[rid]["n2"].append(reg.get("nivel2_estado") or "No Revisado")
                    cargo_map[rid]["n3"].append(reg.get("nivel3_estado") or "No Revisado")
                    cargo_map[rid]["sub"].append(reg.get("sub_estado") or "No Revisado")
                    cargo_map[rid]["count"] += 1
                    costo_map[rid] = costo_map.get(rid, 0.0) + float(reg.get("costo_directo") or 0)
            cap_por_rep: dict = {}
            for reg in reg_estados:
                rid = reg.get("reporte_id")
                if not rid:
                    continue
                c = (reg.get("capitulo") or "").strip()
                if rid not in cap_por_rep:
                    cap_por_rep[rid] = set()
                if c:
                    cap_por_rep[rid].add(c)
            for r in rows:
                m = cargo_map.get(r["id"], {})
                r["nivel1_estados"] = list(set(m.get("n1", [])))
                r["nivel2_estados"] = list(set(m.get("n2", [])))
                r["nivel3_estados"] = list(set(m.get("n3", [])))
                r["sub_estados"]    = list(set(m.get("sub", [])))
                r["num_registros"] = m.get("count", 0)
                if not _ocultar_costo_rep:
                    r["costo_directo_validacion"] = round(costo_map.get(r["id"], 0.0), 2)
                caps = cap_por_rep.get(r["id"], set())
                if caps:
                    r["capitulo"] = ", ".join(sorted(caps))
        except Exception:
            for r in rows:
                r["nivel1_estados"] = r["nivel2_estados"] = r["nivel3_estados"] = r["sub_estados"] = []
                r["num_registros"] = 0
            if not _ocultar_costo_rep:
                for r in rows:
                    r["costo_directo_validacion"] = 0.0

    for r in rows:
        sub = r.pop("subcontratistas", None)
        r["subcontratista_nombre"] = sub["razon_social"] if sub else None
        r["semana_numero"]    = semana_map.get(r.get("semana_id"))
        acta = acta_map.get(r.get("acta_rpo_id"))
        r["acta_rpo"]         = acta["numero_rpo"] if acta else None
        r["acta_consecutivo"] = acta["consecutivo"] if acta else None

    # Si la búsqueda está en modo validación por nivel, eliminar reportes
    # sin registros coincidentes para evitar descuadres panel/grilla.
    if _nivel_l and _ev_l:
        rows = [r for r in rows if (r.get("num_registros") or 0) > 0]

    return {"reportes": rows, "total": len(rows), "offset": offset, "limit": limit, "hay_mas": hay_mas}


# ─── SICOE OBRA: Exportar registros filtrados ───────────────────────────────
class ExportarRegistrosBody(BaseModel):
    campos: List[str]

    # Filtros (mismos nombres que la grilla / buscar_reportes_obra)
    numero_reporte: Optional[int] = None
    numero_registro: Optional[int] = None
    semana: Optional[int] = None
    acta_rpo: Optional[int] = None
    subcontratista_id: Optional[int] = None
    capitulo: Optional[str] = None
    item: Optional[str] = None
    tramo: Optional[str] = None
    costado: Optional[str] = None
    pk_id: Optional[int] = None
    abs_inicio: Optional[float] = None
    abs_final: Optional[float] = None
    estado: Optional[str] = None

    # Validación por nivel (JSON [{cargo_id, estado}, ...] o capasValidacion[0] vía cargo_id/estado)
    cargo_id: Optional[int] = None
    estado_validacion: Optional[str] = None
    validacion_capas: Optional[str] = None

    q_observacion: Optional[str] = None
    q_nodo: Optional[str] = None


@app.get("/sicoe-obra/{contrato_id}/registros/campos")
def listar_campos_registros_sicoe(
    contrato_id: int,
    current_user=Depends(get_current_user),
):
    try:
        rows = supabase_execute(
            lambda: supabase.table("so_registros")
            .select("*")
            .eq("contrato_id", contrato_id)
            .limit(1)
            .execute()
            .data
        )
    except Exception:
        rows = []
    if not rows:
        return []
    return sorted(list(rows[0].keys()))


@app.post("/sicoe-obra/{contrato_id}/registros/exportar")
def exportar_registros_sicoe(
    contrato_id: int,
    body: ExportarRegistrosBody,
    current_user=Depends(get_current_user),
):
    if not body.campos:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un campo para exportar.")

    def _seguro_campo(c: str) -> bool:
        c = str(c or "")
        return bool(c) and all((ch.isalnum() or ch == "_") for ch in c)

    campos_solicitados = [c for c in body.campos if _seguro_campo(c)]
    if not campos_solicitados:
        raise HTTPException(status_code=400, detail="Campos inválidos.")
    campos_virtuales = {"reporte_numero", "acta_rpo_numero", "semana_numero", "pk_id_valor", "subcontratista_nombre"}
    campos = [c for c in campos_solicitados if c not in campos_virtuales]
    if not campos:
        # Permitir exportar solo virtuales; internamente se consulta llaves mínimas.
        campos = []
    campos_aux = list(dict.fromkeys(campos + ["reporte_id", "acta_rpo_id", "semana_id"]))

    # 1) Resolver semana_id / acta_rpo_id
    semana_id_filtro = None
    if body.semana is not None:
        try:
            sem_rows = supabase_execute(
                lambda: supabase.table("so_semanas")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("numero_semana", body.semana)
                .limit(1)
                .execute()
                .data
            )
            semana_id_filtro = sem_rows[0]["id"] if sem_rows else None
        except Exception:
            semana_id_filtro = None

    acta_id_filtro = None
    if body.acta_rpo is not None:
        try:
            acta_rows = supabase_execute(
                lambda: supabase.table("actas")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("numero_rpo", body.acta_rpo)
                .limit(1)
                .execute()
                .data
            )
            if acta_rows:
                acta_id_filtro = acta_rows[0]["id"]
            else:
                acta_rows = supabase_execute(
                    lambda: supabase.table("actas")
                    .select("id")
                    .eq("contrato_id", contrato_id)
                    .eq("consecutivo", body.acta_rpo)
                    .limit(1)
                    .execute()
                    .data
                )
                acta_id_filtro = acta_rows[0]["id"] if acta_rows else None
        except Exception:
            acta_id_filtro = None

    # 2) Filtros que viven en so_reportes (necesitan restricción por reporte_id)
    # abs_inicio/abs_final se aplican por solape en líneas (paso aparte, como buscar/analisis)
    necesita_reporte_filter = any(
        v is not None for v in [body.numero_reporte, body.pk_id, body.estado]
    )

    reporte_ids_base = None
    if necesita_reporte_filter:
        def _rep_ids():
            q = supabase.table("so_reportes").select("id").eq("contrato_id", contrato_id)
            if body.numero_reporte is not None:
                q = q.eq("numero_reporte", body.numero_reporte)
            if body.pk_id is not None:
                q = q.eq("pk_id_id", body.pk_id)
            if body.estado:
                q = _so_reportes_q_por_estado(q, body.estado)
            if body.subcontratista_id is not None:
                q = q.eq("subcontratista_id", body.subcontratista_id)
            if body.semana is not None and semana_id_filtro is not None:
                q = q.eq("semana_id", semana_id_filtro)
            if body.acta_rpo is not None and acta_id_filtro is not None:
                q = q.eq("acta_rpo_id", acta_id_filtro)
            return q.limit(50000).execute().data
        rep_rows = supabase_execute(_rep_ids)
        reporte_ids_base = [r["id"] for r in rep_rows if r.get("id")]
        if not reporte_ids_base:
            return []

    if body.q_nodo is not None and str(body.q_nodo).strip():
        ids_n = _sicoe_reporte_ids_coinciden_nodo(contrato_id, body.q_nodo, reporte_ids_base)
        if ids_n is not None:
            if not ids_n:
                return []
            if reporte_ids_base is not None:
                reporte_ids_base = [x for x in reporte_ids_base if x in ids_n]
            else:
                reporte_ids_base = list(ids_n)
            if not reporte_ids_base:
                return []

    # Abscisa en línea (misma semántica que analisis / grilla); no precalcular miles de reporte_id

    # 3) Query base sobre so_registros
    def _aplicar_filtros_reg(q):
        q = q.eq("contrato_id", contrato_id)
        q = _so_reg_filtro_abs_solape(q, body.abs_inicio, body.abs_final)
        if body.numero_registro is not None:
            q = q.eq("numero_registro", body.numero_registro)
        if semana_id_filtro is not None:
            q = q.eq("semana_id", semana_id_filtro)
        if acta_id_filtro is not None:
            q = q.eq("acta_rpo_id", acta_id_filtro)
        if body.subcontratista_id is not None:
            q = q.eq("subcontratista_id", body.subcontratista_id)
        if body.capitulo:
            q = q.eq("capitulo", body.capitulo)
        if body.item:
            q = q.ilike("item_numero", f"%{body.item}%")
        if body.tramo:
            q = q.eq("tramo", body.tramo)
        if body.costado:
            q = _so_reg_filtro_costado(q, body.costado)
        if body.q_observacion is not None and str(body.q_observacion).strip():
            q = q.ilike("observacion", f"%{str(body.q_observacion).strip()}%")

        # Validación: _parse reúne validacion_capas JSON y/o cargo_id+estado (una o varias capas = AND)
        if not _estado_filtro_omite_validacion_por_cargo(body.estado):
            capas_exp = _parse_validacion_capas_param(
                body.validacion_capas, body.cargo_id, body.estado_validacion
            )
            if capas_exp:
                q = _so_registros_q_y_capas_validacion(
                    q,
                    capas_exp,
                    body.pk_id,
                    body.tramo,
                    body.costado,
                    body.capitulo,
                    body.subcontratista_id,
                    body.item,
                )

        return q

    registros: list = []
    batch_size = 999

    def _enriquecer_registros_export(rows: List[dict]) -> List[dict]:
        if not rows:
            return rows
        reporte_ids = list({r.get("reporte_id") for r in rows if r.get("reporte_id")})
        rep_map = {}
        if reporte_ids:
            try:
                rep_rows = supabase_execute(
                    lambda: supabase.table("so_reportes")
                    .select("id, numero_reporte, acta_rpo_id, semana_id, pk_id_id, subcontratista_id, estado")
                    .in_("id", reporte_ids)
                    .execute()
                    .data
                )
                rep_map = {r["id"]: r for r in rep_rows if r.get("id")}
            except Exception:
                rep_map = {}

        _capas_enr = _parse_validacion_capas_param(
            body.validacion_capas, body.cargo_id, body.estado_validacion
        )
        _nf_legacy = CARGO_ID_NIVEL_MAP.get(body.cargo_id) if body.cargo_id and body.estado_validacion else None
        _filtrar_rep_pub_n23 = (
            (_capas_enr and _validacion_cualquier_nivel2_o_3(_capas_enr))
            or (_nf_legacy and _es_validacion_avanzada(_nf_legacy))
        )
        if _filtrar_rep_pub_n23:
            rows = [
                r for r in rows
                if (rep_map.get(r.get("reporte_id")) or {}).get("estado") not in ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA
                and (r.get("item_numero") or "").strip()
            ]
            if not rows:
                return rows

        acta_ids = list({
            (r.get("acta_rpo_id") or (rep_map.get(r.get("reporte_id")) or {}).get("acta_rpo_id"))
            for r in rows
            if (r.get("acta_rpo_id") or (rep_map.get(r.get("reporte_id")) or {}).get("acta_rpo_id"))
        })
        semana_ids = list({
            (r.get("semana_id") or (rep_map.get(r.get("reporte_id")) or {}).get("semana_id"))
            for r in rows
            if (r.get("semana_id") or (rep_map.get(r.get("reporte_id")) or {}).get("semana_id"))
        })
        pk_ids = list({
            (rep_map.get(r.get("reporte_id")) or {}).get("pk_id_id")
            for r in rows
            if (rep_map.get(r.get("reporte_id")) or {}).get("pk_id_id")
        })

        acta_map = {}
        if acta_ids:
            try:
                aa = supabase_execute(
                    lambda: supabase.table("actas")
                    .select("id, numero_rpo")
                    .in_("id", acta_ids)
                    .execute()
                    .data
                )
                acta_map = {a["id"]: a.get("numero_rpo") for a in aa if a.get("id")}
            except Exception:
                acta_map = {}

        semana_map = {}
        if semana_ids:
            try:
                ss = supabase_execute(
                    lambda: supabase.table("so_semanas")
                    .select("id, numero_semana")
                    .in_("id", semana_ids)
                    .execute()
                    .data
                )
                semana_map = {s["id"]: s.get("numero_semana") for s in ss if s.get("id")}
            except Exception:
                semana_map = {}

        pk_map = {}
        if pk_ids:
            try:
                pp = supabase_execute(
                    lambda: supabase.table("pk_ids")
                    .select("id, pk_id")
                    .in_("id", pk_ids)
                    .execute()
                    .data
                )
                pk_map = {p["id"]: p.get("pk_id") for p in pp if p.get("id")}
            except Exception:
                pk_map = {}

        sub_ids = list({
            (rep_map.get(r.get("reporte_id")) or {}).get("subcontratista_id")
            for r in rows
            if (rep_map.get(r.get("reporte_id")) or {}).get("subcontratista_id")
        })
        sub_map = {}
        if sub_ids:
            try:
                ssb = supabase_execute(
                    lambda: supabase.table("subcontratistas")
                    .select("id, razon_social")
                    .in_("id", sub_ids)
                    .execute()
                    .data
                )
                sub_map = {s["id"]: s.get("razon_social") for s in ssb if s.get("id")}
            except Exception:
                sub_map = {}

        for r in rows:
            rep = rep_map.get(r.get("reporte_id")) or {}
            acta_id = r.get("acta_rpo_id") or rep.get("acta_rpo_id")
            sem_id = r.get("semana_id") or rep.get("semana_id")
            pk_id_id = rep.get("pk_id_id")
            sub_id = rep.get("subcontratista_id")
            r["reporte_numero"] = rep.get("numero_reporte")
            r["acta_rpo_numero"] = acta_map.get(acta_id)
            r["semana_numero"] = semana_map.get(sem_id)
            r["pk_id_valor"] = pk_map.get(pk_id_id)
            r["subcontratista_nombre"] = sub_map.get(sub_id)
        return rows

    def _fetch_by_reporte_id_list(id_list: List[int]):
        out: list = []
        off = 0
        base_q = (
            supabase.table("so_registros")
            .select(",".join(campos_aux))
            .in_("reporte_id", id_list)
        )
        base_q = _aplicar_filtros_reg(base_q)
        while True:
            batch = supabase_execute(lambda: base_q.range(off, off + batch_size).execute().data)
            if not batch:
                break
            out.extend(batch)
            if len(batch) < batch_size + 1:
                break
            off += batch_size + 1
        return out

    if reporte_ids_base is None:
        base_q = supabase.table("so_registros").select(",".join(campos_aux))
        base_q = _aplicar_filtros_reg(base_q)
        off = 0
        while True:
            batch = supabase_execute(lambda: base_q.range(off, off + batch_size).execute().data)
            if not batch:
                break
            registros.extend(batch)
            if len(batch) < batch_size + 1:
                break
            off += batch_size + 1
        registros = _enriquecer_registros_export(registros)
        try:
            cn_row = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
            cn = cn_row[0]["numero"] if cn_row else None
            u_log = {
                "sub": str(current_user.get("sub")),
                "nombre": current_user.get("nombre") or "",
                "email": current_user.get("email"),
                "cargo_nombre": current_user.get("cargo_nombre"),
                "rol_nombre": current_user.get("rol_nombre"),
                "contrato_id": contrato_id,
                "contrato_numero": cn,
            }
            registrar_log(
                u_log,
                "EXPORTAR",
                "SICOE",
                "registro_export",
                str(contrato_id),
                {"filas": len(registros), "campos": len(campos_solicitados)},
            )
        except Exception:
            pass
        return registros

    # Cuando hay restricción por reporte_ids, chunking por .in_()
    _CHUNK = 200
    for i in range(0, len(reporte_ids_base), _CHUNK):
        chunk = reporte_ids_base[i:i + _CHUNK]
        registros.extend(_fetch_by_reporte_id_list(chunk))

    registros = _enriquecer_registros_export(registros)
    try:
        cn_row = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        cn = cn_row[0]["numero"] if cn_row else None
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cn,
        }
        registrar_log(
            u_log,
            "EXPORTAR",
            "SICOE",
            "registro_export",
            str(contrato_id),
            {"filas": len(registros), "campos": len(campos_solicitados)},
        )
    except Exception:
        pass
    return registros


@app.get("/sicoe-obra/{contrato_id}/analisis")
def analisis_registros_obra(
    contrato_id:      int,
    acta_rpo:         Optional[int]   = None,
    semana:           Optional[int]   = None,
    subcontratista_id: Optional[int]  = None,
    capitulo:         Optional[str]   = None,
    item:             Optional[str]   = None,
    tramo:            Optional[str]   = None,
    costado:          Optional[str]   = None,
    abs_inicio:       Optional[float] = None,
    abs_final:        Optional[float] = None,
    estado:           Optional[str]   = None,
    numero_reporte:   Optional[int]   = None,
    numero_registro:  Optional[int]   = None,
    pk_id:            Optional[int]   = None,
    cargo_id:         Optional[int]   = None,
    estado_validacion: Optional[str]  = None,
    validacion_capas: Optional[str] = None,
    q_observacion: Optional[str] = None,
    q_nodo: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Agregados del panel dinámico: cada query param activo es un filtro AND sobre el universo de registros."""
    _empty = {"modo":"general","encabezado":"Sin resultados","grupos":[],
              "total_costo_directo":0,"total_registros":0,
              "total_aprobados":0,"total_pendientes":0,"total_rechazados":0}

    # ── 1. Determinar modo jerárquico ─────────────────────────────────────────
    tiene_contexto = bool(acta_rpo or semana)
    if item:
        modo = "item_detalle"
    elif capitulo:
        modo = "capitulo_items"
    elif tiene_contexto:
        modo = "acta_semana"
    else:
        modo = "general"

    # ── 2. Resolver acta_id y semana_id con sus metadatos ────────────────────
    acta_id = None; acta_info = None
    if acta_rpo is not None:
        try:
            def _ai():
                rows = supabase.table("actas").select("id, numero_rpo, consecutivo")\
                    .eq("contrato_id", contrato_id).eq("numero_rpo", acta_rpo).execute().data
                if not rows:
                    rows = supabase.table("actas").select("id, numero_rpo, consecutivo")\
                        .eq("contrato_id", contrato_id).eq("consecutivo", acta_rpo).execute().data
                return rows
            ar = supabase_execute(_ai)
            if ar: acta_id = ar[0]["id"]; acta_info = ar[0]
        except Exception: pass

    if acta_rpo is not None and acta_id is None:
        return _empty

    semana_id = None; semana_info = None
    if semana is not None:
        try:
            def _si():
                return supabase.table("so_semanas")\
                    .select("id, numero_semana, fecha_inicio, fecha_fin")\
                    .eq("contrato_id", contrato_id).eq("numero_semana", semana).execute().data
            sr = supabase_execute(_si)
            if sr: semana_id = sr[0]["id"]; semana_info = sr[0]
        except Exception: pass

    if semana is not None and semana_id is None:
        return _empty

    # ── 3. Campo de validación (KPI panel: primera capa; filtro SQL: todas con AND) ─
    capas_ana = _parse_validacion_capas_param(validacion_capas, cargo_id, estado_validacion)
    _val_campo_l = None
    _val_estado_l = None
    if capas_ana and not _estado_filtro_omite_validacion_por_cargo(estado):
        _c0 = capas_ana[0]
        _c = CARGO_ID_NIVEL_MAP.get(int(_c0["cargo_id"]))
        if _c:
            _val_campo_l = _c
            _val_estado_l = (_c0.get("estado") or "").strip()

    # ── 4. Filtros AND a nivel so_reportes (misma idea que export / buscar grilla) ─
    # tramo/costado van en so_registros (paso 5). subcontratista_id va en registros.
    _cap_l = capitulo
    _sub_l = subcontratista_id
    reporte_ids_base = None
    has_rep_f = any([
        numero_reporte is not None,
        bool(estado and str(estado).strip()),
    ])
    if has_rep_f:
        try:
            def _reps():
                q = supabase.table("so_reportes").select("id")\
                    .eq("contrato_id", contrato_id)
                if numero_reporte is not None:
                    q = q.eq("numero_reporte", numero_reporte)
                if estado and str(estado).strip():
                    q = _so_reportes_q_por_estado(q, estado.strip())
                return q.limit(50000).execute().data
            rr = supabase_execute(_reps)
            reporte_ids_base = list({r["id"] for r in rr if r.get("id")})
            if not reporte_ids_base:
                return _empty
        except Exception:
            pass

    # PK por líneas (so_registros), igual que /reportes/buscar — panel alineado al plano
    if pk_id is not None:
        try:
            def _rpk_a():
                q = supabase.table("so_registros").select("reporte_id")\
                    .eq("contrato_id", contrato_id).eq("pk_id_id", pk_id)
                return q.limit(50000).execute().data
            ids_pk_a = list({r["reporte_id"] for r in supabase_execute(_rpk_a) if r.get("reporte_id")})
            if not ids_pk_a:
                return _empty
            if reporte_ids_base is not None:
                reporte_ids_base = list(set(reporte_ids_base) & set(ids_pk_a))
            else:
                reporte_ids_base = ids_pk_a
            if not reporte_ids_base:
                return _empty
        except Exception:
            return _empty

    if q_nodo is not None and str(q_nodo).strip():
        ids_n = _sicoe_reporte_ids_coinciden_nodo(contrato_id, q_nodo, reporte_ids_base)
        if ids_n is not None:
            if not ids_n:
                return _empty
            if reporte_ids_base is not None:
                reporte_ids_base = [x for x in reporte_ids_base if x in ids_n]
            else:
                reporte_ids_base = list(ids_n)
            if not reporte_ids_base:
                return _empty

    # Abscisa: filtrar en la propia línea (evita .in_(reporte_id) gigante que rompe PostgREST / panel vacío)
    _abs_ai = abs_inicio
    _abs_af = abs_final

    # ── 5. Obtener registros: todos los filtros de barra se combinan con AND ───
    registros = []
    try:
        _a_l=acta_id; _s_l=semana_id; _it_l=item; _rp_l=reporte_ids_base
        _capas_sql = capas_ana
        _nr = numero_registro
        off = 0
        while True:
            def _regs(o=off):
                q = supabase.table("so_registros")\
                    .select("reporte_id, costo_directo, cantidad_total, item_numero, item_descripcion, unidad, acta_rpo_id, nivel1_estado, nivel2_estado, nivel3_estado, capitulo, subcontratista_id")\
                    .eq("contrato_id", contrato_id)
                q = _so_reg_filtro_abs_solape(q, _abs_ai, _abs_af)
                if _nr is not None:
                    q = q.eq("numero_registro", _nr)
                if _a_l is not None:  q = q.eq("acta_rpo_id", _a_l)
                if _s_l is not None:  q = q.eq("semana_id", _s_l)
                if _it_l:             q = q.ilike("item_numero", f"%{_it_l}%")
                if _cap_l:            q = q.eq("capitulo", _cap_l)
                if _sub_l is not None: q = q.eq("subcontratista_id", _sub_l)
                if _rp_l is not None: q = q.in_("reporte_id", _rp_l)
                if tramo:
                    q = q.eq("tramo", tramo)
                if costado:
                    q = _so_reg_filtro_costado(q, costado)
                if pk_id is not None:
                    q = q.eq("pk_id_id", pk_id)
                if q_observacion is not None and str(q_observacion).strip():
                    q = q.ilike("observacion", f"%{str(q_observacion).strip()}%")
                if _capas_sql and not _estado_filtro_omite_validacion_por_cargo(estado):
                    q = _so_registros_q_y_capas_validacion(
                        q, _capas_sql, pk_id, tramo, costado, _cap_l, _sub_l, _it_l
                    )
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            raw_len = len(batch)
            registros.extend(batch)
            if raw_len < 1000:
                break
            off += 1000
    except Exception as e:
        if not registros:
            registros = []

    if capas_ana and _validacion_cualquier_nivel2_o_3(capas_ana) and registros \
            and not _estado_filtro_omite_validacion_por_cargo(estado):
        _rp_ids = list({r.get("reporte_id") for r in registros if r.get("reporte_id")})
        _est_map: dict = {}
        for _i in range(0, len(_rp_ids), 500):
            _ch = _rp_ids[_i:_i + 500]

            def _em(c=_ch):
                return supabase.table("so_reportes").select("id, estado")\
                    .eq("contrato_id", contrato_id).in_("id", c).execute().data
            for _row in supabase_execute(_em):
                _est_map[_row["id"]] = _row.get("estado")
        registros = [
            r for r in registros
            if _est_map.get(r.get("reporte_id")) not in ESTADOS_REPORTE_EXCL_VALIDACION_AVANZADA
            and (r.get("item_numero") or "").strip()
        ]

    # ── 6. Batch-resolve capitulo y estado desde so_reportes ─────────────────
    rep_ids_found = list({r["reporte_id"] for r in registros if r.get("reporte_id")})
    reporte_map: dict = {}
    if rep_ids_found:
        # Procesar en lotes de 500 para no exceder límites de URL con .in_()
        _cid_l = contrato_id
        for chunk_start in range(0, len(rep_ids_found), 500):
            chunk = rep_ids_found[chunk_start:chunk_start + 500]
            try:
                def _ri(ids=chunk):
                    return supabase.table("so_reportes").select("id, capitulo, estado")\
                        .eq("contrato_id", _cid_l).in_("id", ids).execute().data
                for r in supabase_execute(_ri):
                    reporte_map[r["id"]] = r
            except Exception:
                pass

    # ── 7. Agrupar según modo ─────────────────────────────────────────────────
    def _estado_efectivo(reg):
        # Si hay filtro de validación activo, usar solo el estado del nivel (primera capa) para KPI
        if _val_campo_l:
            estado = reg.get(_val_campo_l) or ""
            if estado == "Aprobado":  return "Aprobado"
            if estado == "Pendiente": return "Pendiente"
            if estado == "Rechazado": return "Rechazado"
            return "No Revisado"
        # Sin filtro: estado global del registro
        niveles = [
            reg.get("nivel1_estado") or "",
            reg.get("nivel2_estado") or "",
            reg.get("nivel3_estado") or "",
        ]
        if "Rechazado" in niveles: return "Rechazado"
        if "Pendiente" in niveles: return "Pendiente"
        activos = [n for n in niveles if n]
        if activos and all(n == "Aprobado" for n in activos): return "Aprobado"
        return "No Revisado"

    grupos: dict = {}

    if modo in ("acta_semana", "general"):
        for reg in registros:
            cap = reg.get("capitulo") or "Sin capítulo"
            ee  = _estado_efectivo(reg)
            cd  = float(reg.get("costo_directo") or 0)
            if cap not in grupos:
                grupos[cap] = {"label": cap, "costo_directo": 0.0,
                               "total_registros": 0, "no_revisados": 0, "no_revisados_costo": 0.0,
                               "aprobados": 0.0, "pendientes": 0.0, "rechazados": 0.0,
                               "aprobados_count": 0, "pendientes_count": 0, "rechazados_count": 0}
            grupos[cap]["costo_directo"]   += cd
            grupos[cap]["total_registros"] += 1
            if   ee == "Aprobado":   grupos[cap]["aprobados"]  += cd; grupos[cap]["aprobados_count"]  += 1
            elif ee == "Pendiente":  grupos[cap]["pendientes"] += cd; grupos[cap]["pendientes_count"] += 1
            elif ee == "Rechazado":  grupos[cap]["rechazados"] += cd; grupos[cap]["rechazados_count"] += 1
            else:
                grupos[cap]["no_revisados"] += 1
                grupos[cap]["no_revisados_costo"] = grupos[cap].get("no_revisados_costo", 0.0) + cd

    elif modo == "capitulo_items":
        for reg in registros:
            ee  = _estado_efectivo(reg)
            cd  = float(reg.get("costo_directo") or 0)
            it  = reg.get("item_numero") or "Sin ítem"
            if it not in grupos:
                grupos[it] = {
                    "label":           it,
                    "descripcion":     reg.get("item_descripcion") or "",
                    "cantidad_total":  0.0,
                    "unidad":          reg.get("unidad") or "",
                    "costo_directo":   0.0,
                    "total_registros": 0,
                    "no_revisados": 0,
                    "no_revisados_costo": 0.0,
                    "aprobados": 0.0, "pendientes": 0.0, "rechazados": 0.0,
                    "aprobados_count": 0, "pendientes_count": 0, "rechazados_count": 0,
                }
            if not grupos[it]["descripcion"] and reg.get("item_descripcion"):
                grupos[it]["descripcion"] = reg["item_descripcion"]
            if not grupos[it]["unidad"] and reg.get("unidad"):
                grupos[it]["unidad"] = reg["unidad"]
            grupos[it]["cantidad_total"] += float(reg.get("cantidad_total") or 0)
            grupos[it]["costo_directo"]  += cd
            grupos[it]["total_registros"] += 1
            if   ee == "Aprobado":   grupos[it]["aprobados"]  += cd; grupos[it]["aprobados_count"]  += 1
            elif ee == "Pendiente":  grupos[it]["pendientes"] += cd; grupos[it]["pendientes_count"] += 1
            elif ee == "Rechazado":  grupos[it]["rechazados"] += cd; grupos[it]["rechazados_count"] += 1
            else:
                grupos[it]["no_revisados"] += 1
                grupos[it]["no_revisados_costo"] = grupos[it].get("no_revisados_costo", 0.0) + cd

    elif modo == "item_detalle":
        acta_ids_found = list({r.get("acta_rpo_id") for r in registros if r.get("acta_rpo_id")})
        acta_map_local: dict = {}
        if acta_ids_found:
            try:
                def _am():
                    return supabase.table("actas").select("id, numero_rpo, consecutivo")\
                        .in_("id", acta_ids_found).execute().data
                for a in supabase_execute(_am):
                    acta_map_local[a["id"]] = a
            except Exception: pass
        for reg in registros:
            ee   = _estado_efectivo(reg)
            cd   = float(reg.get("costo_directo") or 0)
            cap  = reg.get("capitulo") or "Sin capítulo"
            a_id = reg.get("acta_rpo_id")
            a    = acta_map_local.get(a_id) or {}
            nr   = a.get("numero_rpo") or a.get("consecutivo") or "?"
            label = f"RPO {nr}"
            key   = f"{label}||{cap}"
            if key not in grupos:
                grupos[key] = {
                    "label": label, "capitulo": cap,
                    "cantidad_total": 0.0, "costo_directo": 0.0,
                    "total_registros": 0,
                    "aprobados": 0.0, "pendientes": 0.0, "rechazados": 0.0,
                }
            grupos[key]["cantidad_total"] += float(reg.get("cantidad_total") or 0)
            grupos[key]["costo_directo"]  += cd
            grupos[key]["total_registros"] += 1
            if   ee == "Aprobado":   grupos[key]["aprobados"]  += cd
            elif ee == "Pendiente":  grupos[key]["pendientes"] += cd
            elif ee == "Rechazado":  grupos[key]["rechazados"] += cd

    import re as _re
    def _cap_sort_key(label):
        m = _re.match(r'^(\d+)', label or "")
        return (0, int(m.group(1)), label) if m else (1, 0, label)

    if modo in ("acta_semana", "general", "capitulo_items"):
        grupos_list = sorted(grupos.values(), key=lambda g: _cap_sort_key(g["label"]))
    else:
        grupos_list = sorted(grupos.values(), key=lambda g: g["costo_directo"], reverse=True)
    for g in grupos_list:
        g["costo_directo"] = round(g["costo_directo"], 2)
        if "no_revisados_costo" in g:
            g["no_revisados_costo"] = round(g.get("no_revisados_costo") or 0, 2)
        if "cantidad_total" in g:
            g["cantidad_total"] = round(g["cantidad_total"], 3)

    # ── 8. Encabezado ─────────────────────────────────────────────────────────
    if modo == "acta_semana":
        if acta_rpo is not None:
            nr = (acta_info or {}).get("numero_rpo") or acta_rpo
            encabezado = f"Acta RPO {nr}"
        else:
            if semana_info:
                encabezado = (f"Semana {semana_info['numero_semana']} | "
                              f"{semana_info['fecha_inicio']} → {semana_info['fecha_fin']}")
            else:
                encabezado = f"Semana {semana}"
    elif modo == "capitulo_items":
        prefix = ""
        if acta_rpo is not None:
            nr = (acta_info or {}).get("numero_rpo") or acta_rpo
            prefix = f"Acta RPO {nr}"
        elif semana is not None:
            sn = (semana_info or {}).get("numero_semana") or semana
            prefix = f"Semana {sn}"
        encabezado = f"{prefix} — {capitulo}" if prefix else (capitulo or "Ítems")
    elif modo == "item_detalle":
        encabezado = f"Ítem: {item}"
    else:  # general
        partes = []
        if numero_reporte is not None:
            partes.append(f"Rep. #{numero_reporte}")
        if numero_registro is not None:
            partes.append(f"Reg. #{numero_registro}")
        if pk_id is not None:
            partes.append(f"PK_ID id {pk_id}")
        if subcontratista_id:
            partes.append(f"Subc. #{subcontratista_id}")
        if capitulo:
            partes.append(f"Cap.: {capitulo}")
        if item:
            partes.append(f"Ítem: {item}")
        if tramo:
            partes.append(f"Tramo: {tramo}")
        if costado:
            partes.append(f"Costado: {costado}")
        if estado:
            partes.append(f"Estado rep.: {estado}")
        if abs_inicio is not None:
            partes.append(f"Abs. ≥ {abs_inicio}")
        if abs_final is not None:
            partes.append(f"Abs. ≤ {abs_final}")
        if capas_ana:
            for capx in capas_ana:
                cid = int(capx["cargo_id"])
                evx = (capx.get("estado") or "").strip()
                cargo_lbl = f"cargo {cid}"
                try:
                    c = supabase.table("cargos").select("nombre").eq("id", cid).single().execute().data
                    if c and c.get("nombre"):
                        cargo_lbl = c["nombre"]
                except Exception:
                    pass
                partes.append(f"Val. {cargo_lbl}: {evx}")
        encabezado = " · ".join(partes) if partes else "Todos los registros"

    tc  = round(sum(g["costo_directo"]   for g in grupos_list), 2)
    tr  = sum(g["total_registros"] for g in grupos_list)
    ta  = sum(g["aprobados"]       for g in grupos_list)
    tp  = sum(g["pendientes"]      for g in grupos_list)
    trj = sum(g["rechazados"]      for g in grupos_list)
    ta_c  = sum(g.get("aprobados_count",  0) for g in grupos_list)
    tp_c  = sum(g.get("pendientes_count", 0) for g in grupos_list)
    trj_c = sum(g.get("rechazados_count", 0) for g in grupos_list)
    tnr   = sum(g.get("no_revisados",     0) for g in grupos_list)
    tnrc  = round(sum(g.get("no_revisados_costo", 0.0) for g in grupos_list), 2)

    return {"modo": modo, "encabezado": encabezado, "grupos": grupos_list,
            "total_costo_directo": tc, "total_registros": tr,
            "total_no_revisados": tnr,
            "total_no_revisados_costo": tnrc,
            "total_aprobados": ta, "total_pendientes": tp, "total_rechazados": trj,
            "total_aprobados_count": ta_c, "total_pendientes_count": tp_c, "total_rechazados_count": trj_c}


@app.get("/sicoe-obra/{contrato_id}/filtros/semanas")
def filtros_semanas(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("so_semanas").select("id, numero_semana")\
            .eq("contrato_id", contrato_id).order("numero_semana").execute().data
    return supabase_execute(_q)


@app.get("/sicoe-obra/{contrato_id}/filtros/actas")
def filtros_actas(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("actas").select("id, numero_rpo")\
            .eq("contrato_id", contrato_id).not_.is_("numero_rpo", "null")\
            .order("numero_rpo").execute().data
    rows = supabase_execute(_q)
    return [{"numero_rpo": r["numero_rpo"]} for r in rows if r.get("numero_rpo") is not None]


@app.get("/sicoe-obra/{contrato_id}/filtros/capitulos")
def filtros_capitulos_reportes(
    contrato_id: int,
    acta_rpo: Optional[int] = None,
    semana: Optional[int] = None,
    subcontratista_id: Optional[int] = None,
    current_user=Depends(get_current_user)
):
    import re
    def orden_cap(c):
        m = re.match(r'^(\d+)', c)
        return (int(m.group(1)) if m else 9999, c)

    # Sin filtros → lista completa con paginación
    if acta_rpo is None and semana is None and subcontratista_id is None:
        todos: list = []
        off = 0
        while True:
            def _q(o=off):
                return supabase.table("so_reportes").select("capitulo")\
                    .eq("contrato_id", contrato_id)\
                    .not_.is_("capitulo", "null").range(o, o + 999).execute().data
            batch = supabase_execute(_q)
            todos.extend(batch)
            if len(batch) < 1000:
                break
            off += 1000
        return sorted({r["capitulo"] for r in todos if r.get("capitulo")}, key=orden_cap)

    # Resolver acta_id
    acta_id = None
    if acta_rpo is not None:
        try:
            def _ai():
                rows = supabase.table("actas").select("id")\
                    .eq("contrato_id", contrato_id).eq("numero_rpo", acta_rpo).execute().data
                if not rows:
                    rows = supabase.table("actas").select("id")\
                        .eq("contrato_id", contrato_id).eq("consecutivo", acta_rpo).execute().data
                return rows
            acta_rows = supabase_execute(_ai)
            if not acta_rows:
                return []
            acta_id = acta_rows[0]["id"]
        except Exception:
            return []

    # Resolver semana_id
    semana_id = None
    if semana is not None:
        try:
            def _si():
                return supabase.table("so_semanas").select("id")\
                    .eq("contrato_id", contrato_id).eq("numero_semana", semana).execute().data
            sem_rows = supabase_execute(_si)
            if not sem_rows:
                return []
            semana_id = sem_rows[0]["id"]
        except Exception:
            return []

    # Obtener reporte_ids desde so_registros si hay filtro de acta o semana
    reporte_ids = None
    if acta_id is not None or semana_id is not None:
        try:
            _acta_id_l = acta_id
            _semana_id_l = semana_id
            def _regs():
                q = supabase.table("so_registros").select("reporte_id")\
                    .eq("contrato_id", contrato_id)
                if _acta_id_l is not None:
                    q = q.eq("acta_rpo_id", _acta_id_l)
                if _semana_id_l is not None:
                    q = q.eq("semana_id", _semana_id_l)
                return q.execute().data
            reg_rows = supabase_execute(_regs)
            reporte_ids = list({r["reporte_id"] for r in reg_rows if r.get("reporte_id")})
            if not reporte_ids:
                return []
        except Exception:
            return []

    # Obtener capítulos desde so_reportes (paginado)
    try:
        _rep_ids_l = reporte_ids
        _sub_id_l  = subcontratista_id
        cap_todos: list = []
        off2 = 0
        while True:
            def _caps(o=off2):
                q = supabase.table("so_reportes").select("capitulo")\
                    .eq("contrato_id", contrato_id)\
                    .not_.is_("capitulo", "null")
                if _sub_id_l is not None:
                    q = q.eq("subcontratista_id", _sub_id_l)
                if _rep_ids_l is not None:
                    q = q.in_("id", _rep_ids_l)
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_caps)
            cap_todos.extend(batch)
            if len(batch) < 1000:
                break
            off2 += 1000
        return sorted({r["capitulo"] for r in cap_todos if r.get("capitulo")}, key=orden_cap)
    except Exception:
        return []


@app.get("/sicoe-obra/{contrato_id}/filtros/items")
def filtros_items_registros(
    contrato_id: int,
    q: Optional[str] = None,
    capitulo: Optional[str] = None,
    acta_rpo: Optional[int] = None,
    semana: Optional[int] = None,
    subcontratista_id: Optional[int] = None,
    current_user=Depends(get_current_user)
):
    # Resolver acta_id
    acta_id = None
    if acta_rpo is not None:
        try:
            def _ai():
                rows = supabase.table("actas").select("id")\
                    .eq("contrato_id", contrato_id).eq("numero_rpo", acta_rpo).execute().data
                if not rows:
                    rows = supabase.table("actas").select("id")\
                        .eq("contrato_id", contrato_id).eq("consecutivo", acta_rpo).execute().data
                return rows
            acta_rows = supabase_execute(_ai)
            if not acta_rows:
                return []
            acta_id = acta_rows[0]["id"]
        except Exception:
            return []

    # Resolver semana_id
    semana_id = None
    if semana is not None:
        try:
            def _si():
                return supabase.table("so_semanas").select("id")\
                    .eq("contrato_id", contrato_id).eq("numero_semana", semana).execute().data
            sem_rows = supabase_execute(_si)
            if not sem_rows:
                return []
            semana_id = sem_rows[0]["id"]
        except Exception:
            return []

    # Obtener items desde so_registros (paginado)
    # capitulo y subcontratista_id se filtran directamente en so_registros,
    # igual que el endpoint /analisis, para garantizar coherencia entre panel y autocomplete
    try:
        _acta_id_l   = acta_id
        _semana_id_l = semana_id
        _cap_l       = capitulo
        _sub_l       = subcontratista_id
        _q_l         = q
        item_todos: list = []
        off3 = 0
        while True:
            def _items(o=off3):
                qr = supabase.table("so_registros")\
                    .select("item_numero, item_descripcion")\
                    .eq("contrato_id", contrato_id)\
                    .not_.is_("item_numero", "null")
                if _acta_id_l is not None:
                    qr = qr.eq("acta_rpo_id", _acta_id_l)
                if _semana_id_l is not None:
                    qr = qr.eq("semana_id", _semana_id_l)
                if _cap_l is not None:
                    qr = qr.eq("capitulo", _cap_l)
                if _sub_l is not None:
                    qr = qr.eq("subcontratista_id", _sub_l)
                if _q_l:
                    qr = qr.or_(f"item_numero.ilike.%{_q_l}%,item_descripcion.ilike.%{_q_l}%")
                return qr.range(o, o + 999).execute().data
            batch = supabase_execute(_items)
            item_todos.extend(batch)
            if len(batch) < 1000:
                break
            off3 += 1000
        # Deduplicar por item_numero, conservar descripcion
        seen: dict = {}
        for r in item_todos:
            num = r.get("item_numero")
            if not num:
                continue
            if num not in seen:
                seen[num] = r.get("item_descripcion") or ""
            elif not seen[num] and r.get("item_descripcion"):
                seen[num] = r["item_descripcion"]
        results = [{"item_numero": k, "item_descripcion": v} for k, v in sorted(seen.items())]
        return results[:20]
    except Exception:
        return []


@app.get("/sicoe-obra/{contrato_id}/filtros/tramoscostados")
def filtros_tramos_costados(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("so_reportes").select("tramo")\
            .eq("contrato_id", contrato_id).execute().data
    rows = supabase_execute(_q)
    tramos = {r["tramo"] for r in rows if r.get("tramo")}
    # Calzada del filtro: valores únicos desde pk_ids.calzada (maestro por contrato)
    costados = set()
    try:
        _off_pk = 0
        _step_pk = 1000
        while True:
            def _q_pk(o=_off_pk):
                return supabase.table("pk_ids").select("calzada")\
                    .eq("contrato_id", contrato_id)\
                    .range(o, o + _step_pk - 1).execute().data
            batch_pk = supabase_execute(_q_pk)
            for r in batch_pk:
                c = r.get("calzada")
                if c is not None and str(c).strip() != "":
                    costados.add(str(c).strip())
            if len(batch_pk) < _step_pk:
                break
            _off_pk += _step_pk
    except Exception:
        pass
    return {
        "tramos":   sorted(tramos),
        "costados": sorted(costados),
    }


@app.get("/sicoe-obra/{contrato_id}/reportes/{reporte_id}")
def obtener_reporte(
    contrato_id: int,
    reporte_id: int,
    cargo_id: Optional[int] = Query(None),
    estado_validacion: Optional[str] = Query(None),
    validacion_capas: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    def _r():
        return supabase.table("so_reportes").select("*, subcontratistas(razon_social), pk_ids(pk_id, civ, tramo, infraestructura, calzada, abs_inicio, abs_final)")\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    def _reg():
        return supabase.table("so_registros").select("*")\
            .eq("reporte_id", reporte_id).order("id").execute().data
    def _pts():
        return supabase.table("so_puntos_topograficos").select("*")\
            .eq("reporte_id", reporte_id).order("id").execute().data
    with ThreadPoolExecutor(max_workers=3) as ex:
        fut_rep = ex.submit(lambda: supabase_execute(_r))
        fut_reg = ex.submit(lambda: supabase_execute(_reg))
        fut_pts = ex.submit(lambda: supabase_execute(_pts))
    reporte = fut_rep.result()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    regs_raw = fut_reg.result()
    puntos_rows = fut_pts.result()
    r = reporte[0]
    sub = r.pop("subcontratistas", None)
    r["subcontratista_nombre"] = sub["razon_social"] if sub else None
    pk = r.pop("pk_ids", None)
    if pk:
        r["pk_id_valor"]    = pk.get("pk_id")
        r["civ"]            = r.get("civ")     or pk.get("civ")
        r["tramo"]          = r.get("tramo")   or pk.get("tramo")
        r["infraestructura"]= r.get("infraestructura") or pk.get("infraestructura")
        r["calzada"]        = r.get("calzada") or pk.get("calzada")
    else:
        r["pk_id_valor"] = None
    # No filtrar registros por capas de validación en el detalle: la grilla ya acotó reportes;
    # filtrar aquí ocultaba líneas aprobadas (p. ej. con foto_url) y dejaba carpetas "vacías".
    # validacion_capas / cargo_id / estado_validacion se aceptan por compatibilidad y se ignoran.
    reg_ids = [reg["id"] for reg in regs_raw if reg.get("id")]
    num_comentarios_map = {}
    if reg_ids:
        try:
            def _cnt():
                return supabase.table("so_registro_comentarios")\
                    .select("registro_id")\
                    .in_("registro_id", reg_ids).execute().data
            cnt_rows = supabase_execute(_cnt)
            for row in cnt_rows:
                rid = row["registro_id"]
                num_comentarios_map[rid] = num_comentarios_map.get(rid, 0) + 1
        except Exception:
            pass
    for reg in regs_raw:
        reg["num_comentarios"] = num_comentarios_map.get(reg["id"], 0)
    r["registros"] = regs_raw
    r["puntos"] = puntos_rows

    # Resolver nombre del modificador
    modificado_por = r.get("modificado_por")
    if modificado_por:
        def _modif():
            return supabase.table("usuarios")\
                .select("nombre, apellidos")\
                .eq("id", modificado_por).single().execute().data
        try:
            modif = supabase_execute(_modif)
            r["nombre_modificador"] = f"{modif.get('nombre','')} {modif.get('apellidos','')}".strip() if modif else None
        except:
            r["nombre_modificador"] = None
    else:
        r["nombre_modificador"] = None

    # Resolver nombre del creador
    creado_por = r.get("creado_por")
    if creado_por:
        def _creador():
            return supabase.table("usuarios")\
                .select("nombre, apellidos")\
                .eq("id", creado_por).single().execute().data
        try:
            creador = supabase_execute(_creador)
            r["nombre_creador"] = f"{creador.get('nombre','')} {creador.get('apellidos','')}".strip() if creador else None
        except:
            r["nombre_creador"] = None
    else:
        r["nombre_creador"] = None

    # Resolver nombre del inspector
    inspector_id = r.get("inspector_id")
    if inspector_id:
        def _insp():
            return supabase.table("usuarios")\
                .select("nombre, apellidos")\
                .eq("id", inspector_id).single().execute().data
        try:
            insp = supabase_execute(_insp)
            r["inspector_nombre"] = f"{insp.get('nombre','')} {insp.get('apellidos','')}".strip() if insp else None
        except:
            r["inspector_nombre"] = None
    else:
        r["inspector_nombre"] = None

    # Resolver número de acta RPO
    if r.get("acta_rpo_id"):
        def _acta():
            return supabase.table("actas")\
                .select("numero_rpo").eq("id", r["acta_rpo_id"]).single().execute().data
        try:
            acta = supabase_execute(_acta)
            r["acta_rpo_numero"] = acta.get("numero_rpo") if acta else None
        except:
            r["acta_rpo_numero"] = None
    else:
        r["acta_rpo_numero"] = None

    # Resolver consecutivo de corte
    if r.get("corte_id"):
        def _corte():
            return supabase.table("subcontratista_cortes")\
                .select("consecutivo").eq("id", r["corte_id"]).single().execute().data
        try:
            corte = supabase_execute(_corte)
            r["corte_numero"] = corte.get("consecutivo") if corte else None
        except:
            r["corte_numero"] = None
    else:
        r["corte_numero"] = None

    # Resolver número y período de semana
    if r.get("semana_id"):
        def _sem():
            return supabase.table("so_semanas")\
                .select("numero_semana, fecha_inicio, fecha_fin")\
                .eq("id", r["semana_id"]).single().execute().data
        try:
            sem = supabase_execute(_sem)
            if sem:
                r["semana_numero"]  = sem.get("numero_semana")
                r["semana_periodo"] = f"{sem.get('fecha_inicio','')} → {sem.get('fecha_fin','')}"
            else:
                r["semana_numero"] = None
                r["semana_periodo"] = None
        except:
            r["semana_numero"] = None
            r["semana_periodo"] = None
    else:
        r["semana_numero"] = None
        r["semana_periodo"] = None

    return r

@app.delete("/sicoe-obra/{contrato_id}/reportes/{reporte_id}")
def eliminar_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _del():
        return supabase.table("so_reportes").delete()\
            .eq("id", reporte_id).eq("contrato_id", contrato_id)\
            .eq("estado", "Borrador").execute().data
    supabase_execute(_del)
    return {"ok": True}

@app.post("/sicoe-obra/{contrato_id}/reportes")
def crear_reporte_obra(contrato_id: int, body: ReporteCreate, current_user=Depends(get_current_user)):
    def _num():
        return supabase.rpc("siguiente_numero_reporte", {"p_contrato_id": contrato_id}).execute().data
    numero = supabase_execute(_num)
    data = body.dict()
    data["contrato_id"] = contrato_id
    data["numero_reporte"] = numero
    data["estado"] = "Borrador"
    data["creado_por"] = int(current_user.get("sub") or current_user.get("id", 0))
    def _ins():
        return supabase.table("so_reportes").insert(data).execute().data
    result = supabase_execute(_ins)
    return result[0] if result else {}

@app.get("/sicoe-obra/{contrato_id}/plantillas")
def listar_plantillas(contrato_id: int, capitulo: str = None, current_user=Depends(get_current_user)):
    def _q():
        q = supabase.table("so_plantillas").select("*, so_plantilla_items(*)").eq("contrato_id", contrato_id)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        return q.order("nombre").execute().data
    rows = supabase_execute(_q)
    for r in rows:
        r["items"] = r.pop("so_plantilla_items", [])
    return rows

class PlantillaItem(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    orden: int = 0

class PlantillaCreate(BaseModel):
    nombre: str
    capitulo: str
    items: List[PlantillaItem] = []

@app.post("/sicoe-obra/{contrato_id}/plantillas")
def crear_plantilla(contrato_id: int, body: PlantillaCreate, current_user=Depends(get_current_user)):
    def _ins():
        return supabase.table("so_plantillas").insert({
            "contrato_id": contrato_id,
            "nombre": body.nombre,
            "capitulo": body.capitulo,
            "creado_por": int(current_user.get("sub", 0) or current_user.get("id", 0))
        }).execute().data
    plantilla = supabase_execute(_ins)
    if not plantilla:
        raise HTTPException(status_code=500, detail="Error creando plantilla")
    pid = plantilla[0]["id"]
    if body.items:
        def _items():
            return supabase.table("so_plantilla_items").insert([
                {"plantilla_id": pid, "nombre": it.nombre, "descripcion": it.descripcion, "orden": it.orden}
                for it in body.items
            ]).execute().data
        supabase_execute(_items)
    return plantilla[0]

@app.post("/sicoe-obra/{contrato_id}/next-registro")
def next_numero_registro(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.rpc("siguiente_numero_registro", {"p_contrato_id": contrato_id}).execute().data
    numero = supabase_execute(_q)
    return {"numero": numero}

@app.post("/sicoe-obra/{contrato_id}/upload-foto")
async def upload_foto(contrato_id: int, file: UploadFile = File(...), numero: int = Form(...), descripcion: str = Form(""), current_user=Depends(get_current_user)):
    import cloudinary.uploader
    _cloudinary_config()
    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=_cloudinary_folder_contrato(contrato_id, CLOUDINARY_SUB_FOTOS),
        public_id=f"foto_{numero}",
        overwrite=True,
        resource_type="image",
    )
    return {"url": result["secure_url"], "numero": numero}

@app.post("/sicoe-obra/{contrato_id}/upload-grafico")
async def upload_grafico(contrato_id: int, file: UploadFile = File(...), numero: int = Form(...), descripcion: str = Form(""), current_user=Depends(get_current_user)):
    import cloudinary.uploader
    _cloudinary_config()
    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=_cloudinary_folder_contrato(contrato_id, CLOUDINARY_SUB_GRAFICOS),
        public_id=f"grafico_{numero}",
        overwrite=True,
        resource_type="image",
    )
    return {"url": result["secure_url"], "numero": numero}

@app.get("/sicoe-obra/{contrato_id}/galeria")
def galeria_imagenes(contrato_id: int, tipo: str = "foto", desde: str = None, hasta: str = None, current_user=Depends(get_current_user)):
    def _q():
        q = supabase.table("so_registros")\
            .select("foto_url, foto_numero, foto_descripcion, grafico_url, grafico_numero, grafico_descripcion, created_at")\
            .eq("contrato_id", contrato_id)
        if desde:
            q = q.gte("created_at", desde)
        if hasta:
            q = q.lte("created_at", hasta + "T23:59:59")
        return q.order("created_at", desc=True).execute().data
    rows = supabase_execute(_q)
    result = []
    for r in rows:
        if tipo == "foto" and r.get("foto_url"):
            result.append({"url": r["foto_url"], "numero": r["foto_numero"], "descripcion": r.get("foto_descripcion","")})
        elif tipo == "grafico" and r.get("grafico_url"):
            result.append({"url": r["grafico_url"], "numero": r["grafico_numero"], "descripcion": r.get("grafico_descripcion","")})
    return result

@app.post("/sicoe-obra/{contrato_id}/next-foto")
def next_numero_foto(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.rpc("siguiente_numero_foto", {"p_contrato_id": contrato_id}).execute().data
    return {"numero": supabase_execute(_q)}

@app.post("/sicoe-obra/{contrato_id}/next-grafico")
def next_numero_grafico(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.rpc("siguiente_numero_grafico", {"p_contrato_id": contrato_id}).execute().data
    return {"numero": supabase_execute(_q)}

class RegistroCreate(BaseModel):
    reporte_id: int
    numero_registro: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    longitud: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    cantidad: Optional[float] = None
    cantidad_total: Optional[float] = None
    unidad: Optional[str] = None
    observacion: Optional[str] = None
    foto_url: Optional[str] = None
    foto_numero: Optional[int] = None
    foto_descripcion: Optional[str] = None
    grafico_url: Optional[str] = None
    grafico_numero: Optional[int] = None
    grafico_descripcion: Optional[str] = None
    competencia: Optional[str] = None
    item_numero: Optional[str] = None
    item_descripcion: Optional[str] = None
    vlr_unitario: Optional[float] = None
    costo_directo: Optional[float] = None
    enlace_soporte: Optional[str] = None
    semana_id: Optional[int] = None
    acta_rpo_id: Optional[int] = None
    corte_id: Optional[int] = None
    pk_id_id: Optional[int] = None
    civ: Optional[str] = None
    tramo: Optional[str] = None
    infraestructura: Optional[str] = None
    calzada: Optional[str] = None
    ubicacion: Optional[str] = None
    coord_lat: Optional[float] = None
    coord_lng: Optional[float] = None
    abs_inicio: Optional[float] = None
    abs_final: Optional[float] = None
    nodo_ini: Optional[str] = None
    nodo_fin: Optional[str] = None
    subcontratista_id: Optional[int] = None
    inspector_id: Optional[int] = None
    creado_por_reg: Optional[int] = None
    modificado_por_reg: Optional[int] = None

class RegistroLineaNuevoReporte(BaseModel):
    """Líneas del modal Nuevo reporte: sin reporte_id ni número (los asigna el servidor)."""
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    longitud: Optional[float] = None
    ancho: Optional[float] = None
    espesor: Optional[float] = None
    cantidad: Optional[float] = None
    cantidad_total: Optional[float] = None
    unidad: Optional[str] = None
    observacion: Optional[str] = None
    foto_url: Optional[str] = None
    foto_numero: Optional[int] = None
    foto_descripcion: Optional[str] = None
    grafico_url: Optional[str] = None
    grafico_numero: Optional[int] = None
    grafico_descripcion: Optional[str] = None

class ReemplazarRegistrosNuevoReporteBody(BaseModel):
    registros: List[RegistroLineaNuevoReporte]

@app.put("/sicoe-obra/{contrato_id}/reportes/{reporte_id}")
def actualizar_reporte(contrato_id: int, reporte_id: int, body: ReporteCreate, current_user=Depends(get_current_user)):
    data = body.dict()
    # Se persisten localización y PK en so_reportes (antes se descartaban y solo existía PATCH en Borrador;
    # un reintento tras guardar cabecera dejaba estado≠Borrador y el PATCH devolvía 400).
    data.pop("updated_at", None)
    data["updated_at"]     = "now()"
    data["modificado_por"] = int(current_user.get("sub") or current_user.get("id", 0))
    def _upd():
        return supabase.table("so_reportes").update(data)\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    result = supabase_execute(_upd)
    return result[0] if result else {}

@app.patch("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/localizacion")
def actualizar_localizacion_borrador(contrato_id: int, reporte_id: int, body: dict, current_user=Depends(get_current_user)):
    """Solo actualiza localización si el reporte está en Borrador."""
    def _check():
        return supabase.table("so_reportes").select("estado")\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).single().execute().data
    reporte = supabase_execute(_check)
    if not reporte or reporte.get("estado") != "Borrador":
        raise HTTPException(status_code=400, detail="Solo se puede actualizar localización en Borrador")
    campos = {k: v for k, v in body.items() if k in (
        'pk_id_id','civ','tramo','infraestructura','calzada',
        'ubicacion','coord_lat','coord_lng','abs_inicio','abs_final',
        'nodo_ini','nodo_fin','margen'
    )}
    if not campos:
        raise HTTPException(status_code=400, detail="Sin campos de localización")
    def _upd():
        return supabase.table("so_reportes").update(campos)\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    result = supabase_execute(_upd)
    return result[0] if result else {}

def _registro_nivel3_aprobado(row: Optional[Dict[str, Any]]) -> bool:
    """Tras aprobación Nivel 3 (Interventoría), no se editan datos de obra salvo corte de subcontratista."""
    if not row:
        return False
    return (row.get("nivel3_estado") or "").strip() == "Aprobado"


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}")
def actualizar_registro(contrato_id: int, registro_id: int, body: RegistroCreate, current_user=Depends(get_current_user)):
    data = {k: v for k, v in body.dict().items() if v is not None}

    def _prev():
        return supabase.table("so_registros").select("*").eq("id", registro_id).eq("contrato_id", contrato_id).limit(1).execute().data

    prev_rows = supabase_execute(_prev)
    prev_row = prev_rows[0] if prev_rows else None
    if not prev_row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    if _registro_nivel3_aprobado(prev_row):
        otros = {k: v for k, v in data.items() if k not in ("corte_id", "reporte_id", "numero_registro")}
        if otros:
            raise HTTPException(
                status_code=400,
                detail="Registro aprobado por Interventoría (Nivel 3): solo puede modificarse el número de corte de subcontratista.",
            )
        if data.get("reporte_id") is not None and int(data["reporte_id"]) != int(prev_row["reporte_id"]):
            raise HTTPException(status_code=400, detail="No puede modificarse el reporte del registro aprobado por Nivel 3.")
        if data.get("numero_registro") is not None and int(data["numero_registro"]) != int(prev_row["numero_registro"]):
            raise HTTPException(status_code=400, detail="No puede modificarse el número de registro aprobado por Nivel 3.")
        if "corte_id" not in data:
            return prev_row
        data = {"corte_id": data["corte_id"]}

    def _upd():
        return supabase.table("so_registros").update(data)\
            .eq("id", registro_id).eq("contrato_id", contrato_id).execute().data

    out = supabase_execute(_upd)
    row = out[0] if out else {}
    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "EDITAR",
            "SICOE",
            "registro",
            str(registro_id),
            {"reporte_id": row.get("reporte_id"), "id_pol": row.get("id_pol")},
            valor_anterior=_json_for_log(prev_row),
            valor_nuevo=_json_for_log(row),
        )
    except Exception:
        pass
    return row

@app.delete("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/registros")
def eliminar_registros_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _list():
        return supabase.table("so_registros").select("id").eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data

    ids_rows = supabase_execute(_list) or []
    n = len(ids_rows)

    def _del():
        return supabase.table("so_registros").delete()\
            .eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data

    supabase_execute(_del)
    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "ELIMINAR",
            "SICOE",
            "reporte",
            str(reporte_id),
            {
                "registros_eliminados": n,
                "muestra_ids": [r.get("id") for r in ids_rows[:80]],
            },
            valor_anterior={"ids": [r.get("id") for r in ids_rows]},
            valor_nuevo={},
            severidad="AUDIT",
            alerta_generada=(n >= 20),
        )
    except Exception:
        pass
    return {"ok": True}

@app.put("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/reemplazar-registros")
def reemplazar_registros_nuevo_reporte(
    contrato_id: int, reporte_id: int, body: ReemplazarRegistrosNuevoReporteBody, current_user=Depends(get_current_user)
):
    """
    Un solo ida y vuelta: borra so_registros del reporte e inserta las líneas nuevas.
    Sustituye N×(next-registro+POST) para evitar “Failed to fetch” en móviles (timeout / cierre de conexión).
    """
    def _get_rep():
        return supabase.table("so_reportes").select(
            "pk_id_id,civ,tramo,infraestructura,calzada,ubicacion,"
            "coord_lat,coord_lng,abs_inicio,abs_final,nodo_ini,nodo_fin,"
            "subcontratista_id,inspector_id"
        ).eq("id", reporte_id).eq("contrato_id", contrato_id).limit(1).execute().data
    rep_rows = supabase_execute(_get_rep)
    if not rep_rows:
        raise HTTPException(status_code=404, detail="Reporte no encontrado en este contrato")
    rep = rep_rows[0]
    def _del():
        return supabase.table("so_registros").delete()\
            .eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del)
    uid = int(current_user.get("sub") or current_user.get("id", 0))
    if not body.registros:
        return {"ok": True, "insertados": 0}

    def _parse_numero_registro_raw(raw) -> int:
        if raw is None:
            raise ValueError("RPC sin número de registro")
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            return int(raw)
        if isinstance(raw, list) and len(raw) > 0:
            return _parse_numero_registro_raw(raw[0])
        if isinstance(raw, dict):
            for k in ("numero", "siguiente_numero_registro", "siguiente", "id"):
                if k in raw and raw[k] is not None:
                    return int(raw[k])
        return int(raw)

    def _rpc_solo_numero(_: int) -> int:
        """RPC en hilo con cliente propio: el bucle secuencial N× hacía timeout en móvil."""
        last_err = None
        sb = get_supabase()
        for attempt in range(3):
            try:
                data = sb.rpc("siguiente_numero_registro", {"p_contrato_id": contrato_id}).execute().data
                return _parse_numero_registro_raw(data)
            except Exception as e:
                last_err = e
                time.sleep(0.35 * (attempt + 1))
        raise last_err  # type: ignore

    nlines = len(body.registros)
    workers = min(24, max(1, nlines))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        numeros = list(pool.map(_rpc_solo_numero, range(nlines)))
    rows_to_insert: List[Dict[str, Any]] = []
    for line, numero in zip(body.registros, numeros):
        data: Dict[str, Any] = line.dict()
        data["reporte_id"] = reporte_id
        data["numero_registro"] = numero
        data["contrato_id"] = contrato_id
        data["creado_por_reg"] = uid
        for campo in ("pk_id_id", "civ", "tramo", "infraestructura", "calzada", "ubicacion",
                      "coord_lat", "coord_lng", "abs_inicio", "abs_final",
                      "nodo_ini", "nodo_fin", "subcontratista_id", "inspector_id"):
            if rep.get(campo) is not None:
                data[campo] = rep[campo]
        rows_to_insert.append(data)
    _BATCH = 200
    total = 0
    for i in range(0, len(rows_to_insert), _BATCH):
        chunk = rows_to_insert[i : i + _BATCH]
        def _ins():
            return supabase.table("so_registros").insert(chunk).execute().data
        supabase_execute(_ins)
        total += len(chunk)
    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "CREAR",
            "SICOE",
            "registro",
            f"reporte_{reporte_id}_lote",
            {"reporte_id": reporte_id, "reemplazar_registros_masivo": True, "insertados": total},
            valor_anterior=None,
            valor_nuevo={"insertados": total},
        )
    except Exception:
        pass
    return {"ok": True, "insertados": total}

@app.delete("/sicoe-obra/{contrato_id}/registros/{registro_id}/dev")
def dev_eliminar_registro(contrato_id: int, registro_id: int, current_user=Depends(get_current_user)):
    """Solo Desarrollador: elimina un registro y sus comentarios (uso de soporte/desarrollo)."""
    if not _es_desarrollador(current_user):
        raise HTTPException(status_code=403, detail="Solo el cargo Desarrollador puede usar esta acción.")

    def _get():
        return supabase.table("so_registros").select("*").eq("id", registro_id).eq("contrato_id", contrato_id).limit(1).execute().data
    rows = supabase_execute(_get)
    if not rows:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    prev_row = rows[0]

    def _del_com():
        return supabase.table("so_registro_comentarios").delete().eq("registro_id", registro_id).execute().data
    supabase_execute(_del_com)

    def _del_reg():
        return supabase.table("so_registros").delete().eq("id", registro_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del_reg)

    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "ELIMINAR",
            "SICOE",
            "registro",
            str(registro_id),
            {"reporte_id": prev_row.get("reporte_id"), "dev": True},
            valor_anterior=_json_for_log(prev_row),
            valor_nuevo={},
            severidad="AUDIT",
            alerta_generada=True,
        )
    except Exception:
        pass
    return {"ok": True}


@app.delete("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/dev")
def dev_eliminar_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    """Solo Desarrollador: elimina reporte, registros, comentarios y puntos topográficos (uso de soporte/desarrollo)."""
    if not _es_desarrollador(current_user):
        raise HTTPException(status_code=403, detail="Solo el cargo Desarrollador puede usar esta acción.")

    def _get_rep():
        return supabase.table("so_reportes").select("*").eq("id", reporte_id).eq("contrato_id", contrato_id).limit(1).execute().data
    rep_rows = supabase_execute(_get_rep)
    if not rep_rows:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    prev_rep = rep_rows[0]

    def _list_reg():
        return supabase.table("so_registros").select("id").eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    reg_rows = supabase_execute(_list_reg) or []
    reg_ids = [r["id"] for r in reg_rows]

    if reg_ids:
        def _del_com():
            return supabase.table("so_registro_comentarios").delete().in_("registro_id", reg_ids).execute().data
        supabase_execute(_del_com)

    def _del_regs():
        return supabase.table("so_registros").delete().eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del_regs)

    def _del_pts():
        return supabase.table("so_puntos_topograficos").delete().eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del_pts)

    def _del_rep():
        return supabase.table("so_reportes").delete().eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del_rep)

    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "ELIMINAR",
            "SICOE",
            "reporte",
            str(reporte_id),
            {"registros_eliminados": len(reg_ids), "dev": True},
            valor_anterior=_json_for_log(prev_rep),
            valor_nuevo={},
            severidad="AUDIT",
            alerta_generada=True,
        )
    except Exception:
        pass
    return {"ok": True, "registros_eliminados": len(reg_ids)}


@app.post("/sicoe-obra/{contrato_id}/registros")
def crear_registro(contrato_id: int, body: RegistroCreate, current_user=Depends(get_current_user)):
    data = body.dict()
    data["contrato_id"] = contrato_id
    data["creado_por_reg"] = int(current_user.get("sub") or current_user.get("id", 0))
    try:
        def _rep():
            return supabase.table("so_reportes").select(
                "pk_id_id,civ,tramo,infraestructura,calzada,ubicacion,"
                "coord_lat,coord_lng,abs_inicio,abs_final,nodo_ini,nodo_fin,"
                "subcontratista_id,inspector_id"
            ).eq("id", body.reporte_id).eq("contrato_id", contrato_id).limit(1).execute().data
        rep_rows = supabase_execute(_rep)
        if rep_rows:
            rep = rep_rows[0]
            for campo in ("pk_id_id","civ","tramo","infraestructura","calzada","ubicacion",
                          "coord_lat","coord_lng","abs_inicio","abs_final",
                          "nodo_ini","nodo_fin","subcontratista_id","inspector_id"):
                if rep.get(campo) is not None:
                    data[campo] = rep[campo]
    except Exception:
        pass
    def _ins():
        return supabase.table("so_registros").insert(data).execute().data
    result = supabase_execute(_ins)
    row = result[0] if result else {}
    try:
        cnum = None
        cr = supabase.table("contratos").select("numero").eq("id", contrato_id).limit(1).execute().data
        if cr:
            cnum = cr[0].get("numero")
        u_log = {
            "sub": str(current_user.get("sub")),
            "nombre": current_user.get("nombre") or "",
            "email": current_user.get("email"),
            "cargo_nombre": current_user.get("cargo_nombre"),
            "rol_nombre": current_user.get("rol_nombre"),
            "contrato_id": contrato_id,
            "contrato_numero": cnum,
        }
        registrar_log(
            u_log,
            "CREAR",
            "SICOE",
            "registro",
            str(row.get("id", "")),
            {"reporte_id": row.get("reporte_id"), "id_pol": row.get("id_pol")},
            valor_anterior=None,
            valor_nuevo=_json_for_log(row),
        )
    except Exception:
        pass
    return row

class PuntoTopo(BaseModel):
    punto: Optional[str] = None
    norte: Optional[float] = None
    este: Optional[float] = None
    cota: Optional[float] = None
    descripcion: Optional[str] = None

class PuntosCreate(BaseModel):
    reporte_id: int
    puntos: List[PuntoTopo]

@app.delete("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/puntos-topograficos")
def eliminar_puntos_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _del():
        return supabase.table("so_puntos_topograficos").delete()\
            .eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del)
    return {"ok": True}

@app.post("/sicoe-obra/{contrato_id}/puntos-topograficos")
def crear_puntos(contrato_id: int, body: PuntosCreate, current_user=Depends(get_current_user)):
    rows = []
    for p in body.puntos:
        d = p.dict()
        d["contrato_id"] = contrato_id
        d["reporte_id"] = body.reporte_id
        d["creado_por"] = int(current_user.get("sub") or current_user.get("id", 0))
        rows.append(d)
    def _ins():
        return supabase.table("so_puntos_topograficos").insert(rows).execute().data
    return supabase_execute(_ins)

# ─── SICOE OBRA: Verificar acta RPO vigente ──────────────────────────────────
def _acta_rpo_vigente_row(contrato_id: int):
    """Acta RPO cuyo período [fecha_inicio, fecha_fin] contiene hoy (tipo RPO)."""
    from datetime import date
    today = date.today().isoformat()

    def _q():
        return supabase.table("actas")\
            .select("id, numero_rpo, fecha_inicio, fecha_fin, usuarios(nombre, apellidos)")\
            .eq("contrato_id", contrato_id)\
            .eq("tipo_grupo", "RPO")\
            .lte("fecha_inicio", today)\
            .gte("fecha_fin", today)\
            .order("id", desc=True).limit(1).execute().data

    actas = supabase_execute(_q)
    row = actas[0] if actas else None
    if not row:
        return None
    u = row.get("usuarios") or {}
    if isinstance(u, list) and len(u) > 0:
        u = u[0]
    if not isinstance(u, dict):
        u = {}
    an = f"{u.get('nombre', '')} {u.get('apellidos', '')}".strip()
    row = {k: v for k, v in row.items() if k != "usuarios"}
    row["asignado_nombre"] = an or None
    return row


def _parse_iso_to_date(val) -> Optional[date]:
    """Convierte ISO string o date a datetime.date; None si no es parseable."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _acta_rpo_id_vigente_para_fecha(contrato_id: int, ref_date) -> Optional[int]:
    """Acta RPO (tipo_grupo RPO) cuyo período [fecha_inicio, fecha_fin] contiene ref_date."""
    d = _parse_iso_to_date(ref_date)
    if not d:
        return None
    ds = d.isoformat()

    def _q():
        return supabase.table("actas")\
            .select("id")\
            .eq("contrato_id", contrato_id)\
            .eq("tipo_grupo", "RPO")\
            .lte("fecha_inicio", ds)\
            .gte("fecha_fin", ds)\
            .order("id", desc=True)\
            .limit(1)\
            .execute().data

    rows = supabase_execute(_q)
    return rows[0]["id"] if rows else None


def _aplicar_acta_rpo_vigente_a_registro(contrato_id: int, registro_id: int, ref_date) -> Optional[int]:
    """
    Asigna acta_rpo_id según acta RPO vigente en ref_date (parcial N2 o definitivo N3).
    Actualiza so_registros y so_reportes. Retorna el id de acta o None si no hay acta para esa fecha.
    """
    acta_id = _acta_rpo_id_vigente_para_fecha(contrato_id, ref_date)
    if not acta_id:
        return None

    def _get():
        return supabase.table("so_registros").select("reporte_id")\
            .eq("id", registro_id).eq("contrato_id", contrato_id).limit(1).execute().data

    rows = supabase_execute(_get)
    if not rows:
        return None
    rep_id = rows[0]["reporte_id"]

    def _upd_reg():
        return supabase.table("so_registros").update({"acta_rpo_id": acta_id})\
            .eq("id", registro_id).eq("contrato_id", contrato_id).execute().data

    supabase_execute(_upd_reg)

    def _upd_rep():
        return supabase.table("so_reportes").update({"acta_rpo_id": acta_id})\
            .eq("id", rep_id).eq("contrato_id", contrato_id).execute().data

    supabase_execute(_upd_rep)
    return acta_id


@app.get("/sicoe-obra/{contrato_id}/acta-rpo-vigente")
def get_acta_rpo_vigente(contrato_id: int, current_user=Depends(get_current_user)):
    try:
        return _acta_rpo_vigente_row(contrato_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SICOE OBRA: Búsqueda de ítems del listado de precios ────────────────────
@app.get("/sicoe-obra/{contrato_id}/listado-precios-busqueda")
def buscar_items_listado(contrato_id: int, q: str = "", capitulo: str = None, competencia: str = None, current_user=Depends(get_current_user)):
    def _q():
        query = supabase.table("listado_precios")\
            .select("id, capitulo, competencia, item_numero, descripcion, unidad, precio_unitario")\
            .eq("contrato_id", contrato_id)
        if capitulo:
            query = query.eq("capitulo", capitulo)
        if competencia:
            query = query.eq("competencia", competencia)
        if q:
            query = query.or_(f"descripcion.ilike.%{q}%,item_numero.ilike.%{q}%")
        return query.order("item_numero").limit(200).execute().data
    return supabase_execute(_q)

# ─── SICOE OBRA: Asignar ítem a registro ─────────────────────────────────────
class AsignarItemBody(BaseModel):
    item_listado_id: int
    competencia: Optional[str] = None

@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/asignar-item")
def asignar_item_registro(contrato_id: int, registro_id: int, body: AsignarItemBody, current_user=Depends(get_current_user)):
    try:
        from datetime import date
        today = date.today().isoformat()

        def _item():
            return supabase.table("listado_precios")\
                .select("capitulo, competencia, item_numero, descripcion, unidad, precio_unitario")\
                .eq("id", body.item_listado_id).single().execute().data
        item = supabase_execute(_item)
        if not item:
            raise HTTPException(status_code=404, detail="Ítem no encontrado en listado de precios")

        def _reg():
            return supabase.table("so_registros")\
                .select("cantidad_total, reporte_id, nivel3_estado")\
                .eq("id", registro_id).single().execute().data
        registro = supabase_execute(_reg)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if _registro_nivel3_aprobado(registro):
            raise HTTPException(
                status_code=400,
                detail="El registro está aprobado por Nivel 3 (Interventoría): no puede reasignarse el ítem.",
            )

        cant_total = float(registro.get("cantidad_total") or 0)
        vlr_unit   = float(item.get("precio_unitario") or 0)
        costo_dir  = round(cant_total * vlr_unit, 2)
        reporte_id = registro["reporte_id"]

        def _rep():
            return supabase.table("so_reportes")\
                .select("subcontratista_id, acta_rpo_id, corte_id, semana_id")\
                .eq("id", reporte_id).single().execute().data
        reporte = supabase_execute(_rep) or {}

        # 4. Detectar acta RPO vigente por período — obligatorio para asignar
        acta_rpo_id = reporte.get("acta_rpo_id")
        if not acta_rpo_id:
            def _acta():
                return supabase.table("actas")\
                    .select("id, numero_rpo")\
                    .eq("contrato_id", contrato_id)\
                    .eq("tipo_grupo", "RPO")\
                    .lte("fecha_inicio", today)\
                    .gte("fecha_fin", today)\
                    .order("id", desc=True).limit(1).execute().data
            actas = supabase_execute(_acta)
            acta_rpo_id = actas[0]["id"] if actas else None
        if not acta_rpo_id:
            raise HTTPException(status_code=422, detail="No existe un Acta RPO vigente para la fecha de hoy. Crea el acta en el módulo administrativo antes de asignar ítems.")

        corte_id = reporte.get("corte_id")
        sub_id   = reporte.get("subcontratista_id")
        if not corte_id and sub_id:
            try:
                def _corte():
                    return supabase.table("subcontratista_cortes")\
                        .select("id, consecutivo")\
                        .eq("subcontratista_id", sub_id)\
                        .lte("fecha_inicio", today)\
                        .gte("fecha_fin", today)\
                        .limit(1).execute().data
                cortes = supabase_execute(_corte)
                corte_id = cortes[0]["id"] if cortes else None
            except:
                corte_id = None

        semana_id = reporte.get("semana_id")
        if not semana_id:
            try:
                def _sem():
                    return supabase.table("so_semanas")\
                        .select("id, numero_semana")\
                        .eq("contrato_id", contrato_id)\
                        .eq("estado", "activa")\
                        .lte("fecha_inicio", today)\
                        .gte("fecha_fin", today)\
                        .limit(1).execute().data
                sems = supabase_execute(_sem)
                semana_id = sems[0]["id"] if sems else None
            except:
                semana_id = None

        def _upd_reg():
            return supabase.table("so_registros").update({
                "capitulo":         item.get("capitulo"),
                "competencia":      body.competencia or item.get("competencia"),
                "item_numero":      item.get("item_numero"),
                "item_descripcion": item.get("descripcion"),
                "vlr_unitario":     vlr_unit,
                "costo_directo":    costo_dir,
                "unidad":           item.get("unidad"),
                "semana_id":        semana_id,
                "acta_rpo_id":      acta_rpo_id,
                "corte_id":         corte_id,
            }).eq("id", registro_id).eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd_reg)

        def _upd_rep():
            return supabase.table("so_reportes").update({
                "acta_rpo_id": acta_rpo_id,
                "corte_id":    corte_id,
                "semana_id":   semana_id,
                "estado":      "No Revisados",
            }).eq("id", reporte_id).execute().data
        supabase_execute(_upd_rep)

        return {
            "ok": True, "vlr_unitario": vlr_unit, "costo_directo": costo_dir,
            "semana_id": semana_id, "acta_rpo_id": acta_rpo_id, "corte_id": corte_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error asignando ítem: {str(e)}")

# ─── SICOE OBRA: Nuevo registro en blanco dentro de un reporte existente ─────
@app.post("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/nuevo-registro")
def nuevo_registro_en_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _num():
        return supabase.rpc("siguiente_numero_registro", {"p_contrato_id": contrato_id}).execute().data
    numero = supabase_execute(_num)
    def _ins():
        return supabase.table("so_registros").insert({
            "contrato_id":    contrato_id,
            "reporte_id":     reporte_id,
            "numero_registro": numero,
        }).execute().data
    result = supabase_execute(_ins)
    return result[0] if result else {}

# ─── SICOE OBRA: Mover registro a otro reporte ───────────────────────────────
@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/mover-a/{nuevo_reporte_id}")
def mover_registro(contrato_id: int, registro_id: int, nuevo_reporte_id: int, current_user=Depends(get_current_user)):
    try:
        # 1. Verificar que el reporte destino existe en el contrato
        def _ver_dest():
            return supabase.table("so_reportes")\
                .select("id").eq("id", nuevo_reporte_id)\
                .eq("contrato_id", contrato_id).execute().data
        if not supabase_execute(_ver_dest):
            raise HTTPException(status_code=404, detail="Reporte destino no encontrado en este contrato")

        # 2. Leer el registro para obtener el reporte_id origen
        def _reg():
            return supabase.table("so_registros")\
                .select("reporte_id, nivel3_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        reg_rows = supabase_execute(_reg)
        if not reg_rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if _registro_nivel3_aprobado(reg_rows[0]):
            raise HTTPException(
                status_code=400,
                detail="El registro está aprobado por Nivel 3 (Interventoría): no puede moverse a otro reporte.",
            )
        reporte_origen_id = reg_rows[0]["reporte_id"]

        # 3. Leer campos de localización del reporte ORIGEN
        campos_loc = ("pk_id_id","civ","tramo","infraestructura","calzada","ubicacion",
                      "coord_lat","coord_lng","abs_inicio","abs_final",
                      "nodo_ini","nodo_fin","subcontratista_id","inspector_id","creado_por")
        def _rep_orig():
            return supabase.table("so_reportes")\
                .select(",".join(campos_loc))\
                .eq("id", reporte_origen_id).eq("contrato_id", contrato_id)\
                .limit(1).execute().data
        rep_rows = supabase_execute(_rep_orig)
        loc_data = {}
        if rep_rows:
            rep = rep_rows[0]
            for campo in campos_loc:
                if rep.get(campo) is not None:
                    loc_data[campo] = rep[campo]

        # 4. Actualizar el registro: nuevo reporte_id + datos de localización del origen tatuados
        update_data = {
            "reporte_id": nuevo_reporte_id,
            "modificado_por_reg": int(current_user.get("sub") or current_user.get("id", 0)),
            **{k: v for k, v in loc_data.items() if k != "creado_por"},
        }
        def _upd():
            return supabase.table("so_registros")\
                .update(update_data)\
                .eq("id", registro_id).eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SICOE OBRA: Semanas ──────────────────────────────────────────────────────
class SemanaCreate(BaseModel):
    numero_semana: int
    fecha_inicio:  str
    fecha_fin:     str
    dia_corte:     int  # 0=Lunes … 6=Domingo
    estado:        str = "activa"

@app.get("/sicoe-obra/{contrato_id}/semanas")
def listar_semanas(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("so_semanas")\
            .select("*").eq("contrato_id", contrato_id)\
            .order("numero_semana").execute().data
    return supabase_execute(_q)

@app.post("/sicoe-obra/{contrato_id}/semanas")
def crear_semanas(contrato_id: int, body: List[SemanaCreate], current_user=Depends(get_current_user)):
    rows = [{"contrato_id": contrato_id, **s.dict()} for s in body]
    def _ins():
        return supabase.table("so_semanas").insert(rows).execute().data
    return supabase_execute(_ins)

@app.get("/sicoe-obra/{contrato_id}/semana-vigente")
def semana_vigente(contrato_id: int, current_user=Depends(get_current_user)):
    from datetime import date
    today = date.today().isoformat()
    def _vig():
        return supabase.table("so_semanas")\
            .select("*").eq("contrato_id", contrato_id).eq("estado", "activa")\
            .lte("fecha_inicio", today).gte("fecha_fin", today)\
            .limit(1).execute().data
    def _prox():
        return supabase.table("so_semanas")\
            .select("*").eq("contrato_id", contrato_id).eq("estado", "activa")\
            .gt("fecha_inicio", today)\
            .order("fecha_inicio").limit(1).execute().data
    vigente = supabase_execute(_vig)
    proxima = supabase_execute(_prox)
    return {
        "vigente": vigente[0] if vigente else None,
        "proxima": proxima[0] if proxima else None
    }

@app.post("/sicoe-obra/{contrato_id}/semanas/extender")
def extender_semanas(contrato_id: int, n_semanas: int, current_user=Depends(get_current_user)):
    """Agrega n_semanas adicionales continuando desde la última semana existente"""
    from datetime import date, timedelta
    def _ultima():
        return supabase.table("so_semanas")\
            .select("numero_semana, fecha_fin, dia_corte")\
            .eq("contrato_id", contrato_id)\
            .order("numero_semana", desc=True).limit(1).execute().data
    rows = supabase_execute(_ultima)
    if not rows:
        raise HTTPException(status_code=400, detail="No hay semanas base. Crea la primera semana primero.")
    ultima     = rows[0]
    ultimo_num = ultima["numero_semana"]
    dia_corte  = ultima["dia_corte"]
    fecha_base = date.fromisoformat(ultima["fecha_fin"])
    nuevas = []
    for i in range(1, n_semanas + 1):
        f_ini = fecha_base + timedelta(days=(i - 1) * 7 + 1)
        f_fin = fecha_base + timedelta(days=i * 7)
        nuevas.append({
            "contrato_id":   contrato_id,
            "numero_semana": ultimo_num + i,
            "fecha_inicio":  f_ini.isoformat(),
            "fecha_fin":     f_fin.isoformat(),
            "dia_corte":     dia_corte,
            "estado":        "activa"
        })
    def _ins():
        return supabase.table("so_semanas").insert(nuevas).execute().data
    return supabase_execute(_ins)


# ─── SICOE OBRA: Validación de Registros ─────────────────────────────────────

class ValidarNivel1Body(BaseModel):
    estado: str
    comentario_data: Optional[dict] = None

class ValidarNivel2Body(BaseModel):
    estado: str
    objeto_pago_sub: Optional[bool] = None
    comentario_data: Optional[dict] = None

class ValidarNivel3Body(BaseModel):
    estado: str
    comentario_data: Optional[dict] = None

class ValidarSubBody(BaseModel):
    estado: str

class SolicitarReversionBody(BaseModel):
    comentario_data: dict

class AceptarReversionBody(BaseModel):
    aceptar: bool

class ComentarioCreate(BaseModel):
    rol_origen: Optional[str] = None
    confidencialidad: Optional[str] = None
    destinatarios: Optional[list] = None
    etiqueta: Optional[str] = None
    asunto: Optional[str] = None
    mensaje: Optional[str] = None
    enlaces: Optional[list] = None
    cantidad_verificada: Optional[float] = None
    tipo: Optional[str] = None
    nivel_validacion: Optional[int] = None
    padre_id: Optional[int] = None

class ValidarMasivoNivel2Body(BaseModel):
    estado: str
    ids_registros: List[int]
    objeto_pago_sub: Optional[bool] = None
    comentario_data: Optional[dict] = None

class ValidarMasivoNivel3Body(BaseModel):
    estado: str
    ids_registros: List[int]
    comentario_data: Optional[dict] = None

class ReconciliarActaRpoHistoricoBody(BaseModel):
    dry_run: bool = False

def _normalizar_macro_rol(valor: Optional[str]) -> Optional[str]:
    txt = (valor or "").strip().lower()
    if not txt:
        return None
    if "intervent" in txt:
        return "interventoria"
    # Subcontratista se considera del lado contratista para confidencialidad.
    if "subcontrat" in txt:
        return "contratista"
    if "contrat" in txt:
        return "contratista"
    return None

def _macro_rol_usuario_por_id(usuario_id: Optional[int]) -> Optional[str]:
    if not usuario_id:
        return None
    try:
        u = supabase.table("usuarios").select("cargo_id").eq("id", usuario_id).single().execute().data or {}
        cargo_id = u.get("cargo_id")
        if not cargo_id:
            return None
        c = supabase.table("cargos").select("nombre").eq("id", cargo_id).single().execute().data or {}
        return _normalizar_macro_rol(c.get("nombre"))
    except Exception:
        return None

def _macro_rol_current_user(current_user) -> Optional[str]:
    try:
        uid = int(current_user.get("sub") or current_user.get("id", 0))
    except (TypeError, ValueError):
        return None
    return _macro_rol_usuario_por_id(uid)

def _cargo_current_user(current_user) -> str:
    try:
        uid = int(current_user.get("sub") or current_user.get("id", 0))
        u = supabase.table("usuarios").select("cargo_id").eq("id", uid).single().execute().data or {}
        cargo_id = u.get("cargo_id")
        if not cargo_id:
            return ""
        c = supabase.table("cargos").select("nombre").eq("id", cargo_id).single().execute().data or {}
        return (c.get("nombre") or "").strip().lower()
    except Exception:
        return ""

def _macro_roles_destinatarios(destinatarios: list) -> set:
    roles_dest = set()
    for d in (destinatarios or []):
        if not isinstance(d, dict):
            continue
        r_macro = _normalizar_macro_rol(
            d.get("rol") or d.get("rol_nombre") or d.get("cargo_nombre") or d.get("cargo")
        )
        if not r_macro:
            r_macro = _macro_rol_usuario_por_id(d.get("id"))
        if r_macro:
            roles_dest.add(r_macro)
    return roles_dest


def _insertar_comentario(contrato_id: int, registro_id: int, autor_id: int,
                         comentario_data: dict, tipo_override: str = None, nivel_validacion_override: str = None):
    """Inserta un comentario en so_registro_comentarios calculando confidencialidad."""
    destinatarios = comentario_data.get("destinatarios") or []
    rol_origen_payload = comentario_data.get("rol_origen", "")
    # Fuente de verdad: preferir el lado real del autor en BD.
    rol_origen_macro = _normalizar_macro_rol(rol_origen_payload) or _macro_rol_usuario_por_id(autor_id)
    rol_origen = rol_origen_macro or rol_origen_payload

    roles_dest = _macro_roles_destinatarios(destinatarios)

    if not destinatarios:
        confidencialidad = "publico"
    else:
        if roles_dest == {"contratista"} and rol_origen_macro == "contratista":
            confidencialidad = "contratista_interno"
        elif roles_dest == {"interventoria"} and rol_origen_macro == "interventoria":
            confidencialidad = "interventoria_interna"
        elif not roles_dest:
            confidencialidad = "publico"
        else:
            confidencialidad = "cruzado"

    row = {
        "registro_id":        registro_id,
        "contrato_id":        contrato_id,
        "autor_id":           autor_id,
        "rol_origen":         rol_origen,
        "confidencialidad":   confidencialidad,
        "destinatarios":      destinatarios,
        "etiqueta":           comentario_data.get("etiqueta"),
        "asunto":             comentario_data.get("asunto"),
        "mensaje":            comentario_data.get("mensaje"),
        "enlaces":            comentario_data.get("enlaces") or [],
        "cantidad_verificada": comentario_data.get("cantidad_verificada"),
        "tipo":               tipo_override or comentario_data.get("tipo"),
        "nivel_validacion":   nivel_validacion_override or comentario_data.get("nivel_validacion"),
        "padre_id":           comentario_data.get("padre_id"),
    }

    def _ins():
        return supabase.table("so_registro_comentarios").insert(row).execute().data
    data = supabase_execute(_ins)
    return data[0] if data else {}

@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/validar-nivel1")
def validar_nivel1(contrato_id: int, registro_id: int, body: ValidarNivel1Body,
                   current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(status_code=422,
            detail="Se requiere comentario_data cuando el estado es Pendiente o Rechazado.")
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        def _get_n3():
            return supabase.table("so_registros").select("nivel3_estado, reporte_id")\
                .eq("id", registro_id).eq("contrato_id", contrato_id).limit(1).execute().data
        n3rows = supabase_execute(_get_n3)
        if not n3rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado.")
        if _registro_nivel3_aprobado(n3rows[0]):
            raise HTTPException(
                status_code=400,
                detail="El registro está aprobado por Nivel 3 (Interventoría) y no puede modificarse por esta vía.",
            )
        update = {
            "nivel1_estado":     body.estado,
            "nivel1_usuario_id": autor_id,
            "nivel1_fecha":      datetime.utcnow().isoformat(),
        }
        # Actualizar modificado_por en so_reportes para reflejar la validación
        try:
            def _get_rep_id():
                return supabase.table("so_registros").select("reporte_id")\
                    .eq("id", registro_id).eq("contrato_id", contrato_id)\
                    .limit(1).execute().data
            rep_rows = supabase_execute(_get_rep_id)
            if rep_rows:
                rep_id = rep_rows[0]["reporte_id"]
                def _upd_rep():
                    return supabase.table("so_reportes")\
                        .update({"modificado_por": autor_id, "updated_at": datetime.utcnow().isoformat()})\
                        .eq("id", rep_id).eq("contrato_id", contrato_id).execute().data
                supabase_execute(_upd_rep)
        except Exception:
            pass
        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data,
                                 tipo_override="validacion", nivel_validacion_override="Nivel 1")
            destinatarios = body.comentario_data.get("destinatarios") or []
            for dest in destinatarios:
                dest_id = dest.get("id") if isinstance(dest, dict) else None
                if dest_id:
                    try:
                        def _notif(did=dest_id):
                            return supabase.table("notificaciones").insert({
                                "destinatario_id": did,
                                "remitente_id": autor_id,
                                "contrato_id": contrato_id,
                                "tipo": "validacion",
                                "modulo": "sicoe_obra",
                                "entidad_tipo": "registro",
                                "entidad_id": str(registro_id),
                                "asunto": f"Validación Nivel 1: {body.estado}",
                                "mensaje": body.comentario_data.get("mensaje", ""),
                                "leido": False
                            }).execute().data
                        supabase_execute(_notif)
                    except Exception:
                        pass
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/validar-nivel2")
def validar_nivel2(contrato_id: int, registro_id: int, body: ValidarNivel2Body,
                   current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado", "No Objeto de Cobro"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        # Verificar nivel1
        def _get():
            return supabase.table("so_registros")\
                .select("nivel1_estado, nivel3_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado.")
        if _registro_nivel3_aprobado(rows[0]):
            raise HTTPException(
                status_code=400,
                detail="El registro está aprobado por Nivel 3 (Interventoría) y no puede modificarse por esta vía.",
            )
        if rows[0].get("nivel1_estado") != "Aprobado":
            raise HTTPException(status_code=422,
                detail="El registro debe estar aprobado por Nivel 1 primero.")

        estado_real = body.estado
        if body.estado == "No Objeto de Cobro":
            estado_real = "Rechazado"
            if not body.comentario_data:
                raise HTTPException(status_code=422,
                    detail="Se requiere comentario_data para 'No Objeto de Cobro'.")

        if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
            raise HTTPException(status_code=422,
                detail="Se requiere comentario_data cuando el estado es Pendiente o Rechazado.")

        update = {
            "nivel2_estado":     estado_real,
            "nivel2_usuario_id": autor_id,
            "nivel2_fecha":      datetime.utcnow().isoformat(),
        }
        if body.objeto_pago_sub is not None:
            update["nivel2_objeto_pago_sub"] = body.objeto_pago_sub

        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        # Acta RPO parcial: al aprobar Residente de Obra (N2), alinear a acta vigente a la fecha de aprobación
        if estado_real == "Aprobado":
            try:
                _aplicar_acta_rpo_vigente_a_registro(contrato_id, registro_id, date.today())
            except Exception:
                pass
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data,
                                 tipo_override="validacion", nivel_validacion_override="Nivel 2")
            destinatarios = body.comentario_data.get("destinatarios") or []
            for dest in destinatarios:
                dest_id = dest.get("id") if isinstance(dest, dict) else None
                if dest_id:
                    try:
                        def _notif(did=dest_id):
                            return supabase.table("notificaciones").insert({
                                "destinatario_id": did,
                                "remitente_id": autor_id,
                                "contrato_id": contrato_id,
                                "tipo": "validacion",
                                "modulo": "sicoe_obra",
                                "entidad_tipo": "registro",
                                "entidad_id": str(registro_id),
                                "asunto": f"Validación Nivel 2: {body.estado}",
                                "mensaje": body.comentario_data.get("mensaje", ""),
                                "leido": False
                            }).execute().data
                        supabase_execute(_notif)
                    except Exception:
                        pass
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/validar-nivel3")
def validar_nivel3(contrato_id: int, registro_id: int, body: ValidarNivel3Body,
                   current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(status_code=422,
            detail="Se requiere comentario_data cuando el estado es Pendiente o Rechazado.")
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        # Verificar nivel2
        def _get():
            return supabase.table("so_registros")\
                .select("nivel2_estado, nivel3_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado.")
        if rows[0].get("nivel3_estado") == "Aprobado" and body.estado != "Aprobado":
            raise HTTPException(
                status_code=400,
                detail="El registro ya está aprobado por Nivel 3. Use el flujo de reversión para modificar la validación.",
            )
        if rows[0].get("nivel2_estado") != "Aprobado":
            raise HTTPException(status_code=422,
                detail="El registro debe estar aprobado por Nivel 2 primero.")

        update = {
            "nivel3_estado":     body.estado,
            "nivel3_usuario_id": autor_id,
            "nivel3_fecha":      datetime.utcnow().isoformat(),
        }
        if body.estado == "Aprobado":
            update["bloqueado"] = True

        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        # Acta RPO definitiva: al aprobar Interventoría (N3), alinear a acta vigente a la fecha de aprobación
        if body.estado == "Aprobado":
            try:
                _aplicar_acta_rpo_vigente_a_registro(contrato_id, registro_id, date.today())
            except Exception:
                pass
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data,
                                 tipo_override="validacion", nivel_validacion_override="Nivel 3")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/validar-sub")
def validar_sub(contrato_id: int, registro_id: int, body: ValidarSubBody,
                current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        # Verificar nivel2_objeto_pago_sub
        def _get():
            return supabase.table("so_registros")\
                .select("nivel2_objeto_pago_sub, nivel3_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado.")
        if _registro_nivel3_aprobado(rows[0]):
            raise HTTPException(
                status_code=400,
                detail="El registro está aprobado por Nivel 3 (Interventoría) y no puede modificarse por esta vía.",
            )
        if not rows[0].get("nivel2_objeto_pago_sub"):
            raise HTTPException(status_code=422,
                detail="El registro no es objeto de pago a subcontratista (nivel2_objeto_pago_sub debe ser True).")

        update = {
            "sub_estado":     body.estado,
            "sub_usuario_id": autor_id,
            "sub_fecha":      datetime.utcnow().isoformat(),
        }
        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# SICOE-OBRA — Dashboard endpoints (reemplazan /cobro/ leyendo so_registros)
# ══════════════════════════════════════════════════════════════════════════════


def _parse_rpc_dashboard_resumen_raw(raw):
    """Deserializa respuesta de dashboard_resumen_sicoe_agg (PostgREST / RPC)."""
    if raw is None:
        return None
    if isinstance(raw, list) and len(raw) > 0:
        row = raw[0]
        if isinstance(row, dict):
            for v in row.values():
                if isinstance(v, dict) and "total_presupuesto" in v:
                    return v
        if isinstance(row, dict) and "total_presupuesto" in row:
            return row
    if isinstance(raw, dict) and "total_presupuesto" in raw:
        return raw
    if isinstance(raw, dict):
        k = next(iter(raw.keys()), None)
        if k and isinstance(raw.get(k), dict) and "total_presupuesto" in raw[k]:
            return raw[k]
    return None


@app.get("/sicoe-obra/{contrato_id}/dashboard-resumen")
def dashboard_resumen_obra(contrato_id: int, current_user=Depends(get_current_user)):
    try:
        try:
            def _rpc():
                return supabase.rpc(
                    "dashboard_resumen_sicoe_agg",
                    {"p_contrato_id": contrato_id},
                ).execute().data

            hit = _parse_rpc_dashboard_resumen_raw(supabase_execute(_rpc))
            if hit is not None and isinstance(hit.get("comparativo_capitulos"), list):
                return hit
        except Exception:
            pass

        # 1. Obra aprobada (Interventoría): agregar desde so_registros con el mismo criterio
        #    que la matriz / drill (nivel3 ≈ Aprobado), no desde vista_dashboard_resumen,
        #    para que importaciones con variantes de texto ("APROBADO", espacios, etc.) cuenten.
        def _actas_map():
            return supabase.table("actas").select("id, numero_rpo")\
                .eq("contrato_id", contrato_id).execute().data
        acta_rows = supabase_execute(_actas_map) or []
        acta_id_to_nr = {a["id"]: a.get("numero_rpo") for a in acta_rows if a.get("id") is not None}

        total_cobrado = 0.0
        acta_agg = {}
        obra_caps = {}
        off = 0
        while True:
            def _batch(o=off):
                return supabase.table("so_registros").select(
                    "capitulo, costo_directo, acta_rpo_id, nivel3_estado"
                ).eq("contrato_id", contrato_id).range(o, o + 999).execute().data
            batch = supabase_execute(_batch) or []
            for reg in batch:
                if _matriz_validacion_norm_estado(reg.get("nivel3_estado")) != "Aprobado":
                    continue
                cd = float(reg.get("costo_directo") or 0)
                total_cobrado += cd
                cap = reg.get("capitulo") or "Sin capítulo"
                obra_caps[cap] = obra_caps.get(cap, 0) + cd
                aid = reg.get("acta_rpo_id")
                nr = acta_id_to_nr.get(aid) if aid is not None else None
                if nr is not None:
                    acta_agg[nr] = acta_agg.get(nr, 0) + cd
            if len(batch) < 1000:
                break
            off += 1000

        # 2. Presupuesto por capítulo
        def _ppto():
            return supabase.table("vista_ppto_por_capitulo")\
                .select("*").eq("contrato_id", contrato_id).execute().data
        ppto_raw = supabase_execute(_ppto)
        ppto_caps = {r["capitulo"]: float(r.get("presupuesto") or 0) for r in ppto_raw}
        ppto_total = sum(ppto_caps.values())

        # 3. Comparativo por capítulo (presupuesto vs obra aprobada N3)

        def _sort_acta_key(x):
            try:
                return float(x[0])
            except (TypeError, ValueError):
                return 0.0

        def _acta_num(k):
            try:
                return float(k)
            except (TypeError, ValueError):
                return 0.0

        por_acta = [{"acta": nr, "cobrado": round(v, 2)} for nr, v in sorted(acta_agg.items(), key=_sort_acta_key, reverse=True)]

        caps = sorted(set(list(ppto_caps.keys()) + list(obra_caps.keys())))
        comparativo = [
            {
                "capitulo": c,
                "presupuesto": ppto_caps.get(c, 0),
                "cobrado": round(obra_caps.get(c, 0), 2),
                "delta": round(ppto_caps.get(c, 0) - obra_caps.get(c, 0), 2),
                "consumo_pct": round(obra_caps.get(c, 0) / ppto_caps.get(c, 0) * 100, 1) if ppto_caps.get(c, 0) else 0,
            }
            for c in caps
        ]

        return {
            "total_presupuesto": ppto_total,
            "total_cobrado": round(total_cobrado, 2),
            "delta": round(ppto_total - total_cobrado, 2),
            "consumo_pct": round(total_cobrado / ppto_total * 100, 1) if ppto_total else 0,
            "actas": sorted(acta_agg.keys(), key=_acta_num, reverse=True),
            "comparativo_capitulos": comparativo,
            "por_acta": por_acta,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _matriz_validacion_norm_estado(v) -> str:
    if v is None:
        return "No Revisado"
    s = str(v).strip()
    if not s:
        return "No Revisado"
    sl = s.lower()
    if sl == "aprobado":
        return "Aprobado"
    if sl == "pendiente":
        return "Pendiente"
    if sl == "rechazado":
        return "Rechazado"
    if "no revis" in sl or sl == "no revisado":
        return "No Revisado"
    return s


def _matriz_validacion_bloque_capitulo(capitulo: Optional[str]) -> str:
    """Obra ejecutada directa vs ensayos/sondeos (cap. 14–15 o nombre típico)."""
    c = (capitulo or "").strip().upper()
    if c.startswith("14.") or c.startswith("15.") or "ENSAYO" in c or "SONDEO" in c:
        return "ensayos"
    return "obra"


def _matriz_validacion_empty():
    z = {"interventoria": 0.0, "residente": 0.0, "inspector": 0.0}
    return {
        "aprobado": dict(z),
        "pendiente": dict(z),
        "pendiente_item": dict(z),
        "no_revisado": dict(z),
        "rechazado": dict(z),
        "habilitado": dict(z),
        "otras_actas": dict(z),
    }


def _dashboard_matriz_validacion_fallback(
    contrato_id: int,
    acta_id_filtro: Optional[int],
) -> dict:
    """Fallback lento si la función SQL dashboard_matriz_validacion_agg no está desplegada."""
    obra_m = _matriz_validacion_empty()
    ens_m = _matriz_validacion_empty()

    off = 0
    while True:
        def _batch(o=off):
            q = supabase.table("so_registros").select(
                "costo_directo,nivel1_estado,nivel2_estado,nivel3_estado,sub_estado,"
                "capitulo,acta_rpo_id,item_numero"
            ).eq("contrato_id", contrato_id)
            if acta_id_filtro is not None:
                q = q.eq("acta_rpo_id", acta_id_filtro)
            return q.range(o, o + 999).execute().data

        batch = supabase_execute(_batch)
        for reg in batch:
            if not (reg.get("item_numero") or "").strip():
                continue
            cd = float(reg.get("costo_directo") or 0)
            n1 = _matriz_validacion_norm_estado(reg.get("nivel1_estado"))
            n2 = _matriz_validacion_norm_estado(reg.get("nivel2_estado"))
            n3 = _matriz_validacion_norm_estado(reg.get("nivel3_estado"))
            sub_n = _matriz_validacion_norm_estado(reg.get("sub_estado"))
            sub_raw = str(reg.get("sub_estado") or "").strip().lower()
            bloque = _matriz_validacion_bloque_capitulo(reg.get("capitulo"))
            M = ens_m if bloque == "ensayos" else obra_m

            def acc(estado_nivel: str, col: str):
                if estado_nivel == "Aprobado":
                    M["aprobado"][col] += cd
                elif estado_nivel == "Pendiente":
                    M["pendiente"][col] += cd
                elif estado_nivel == "Rechazado":
                    M["rechazado"][col] += cd
                else:
                    M["no_revisado"][col] += cd

            # N1 (inspector): todas las filas del acta; solo estados nivel 1.
            acc(n1, "inspector")
            # N2 (residente): solo si N1 aprobó; sobre ese subconjunto, estados nivel 2.
            if n1 == "Aprobado":
                acc(n2, "residente")
            # N3 (interventoría): solo si N1 y N2 aprobaron; sobre ese subconjunto, estados nivel 3.
            if n1 == "Aprobado" and n2 == "Aprobado":
                acc(n3, "interventoria")

            # Pendiente por ítem (sub_estado): no forma parte del bucket Pendiente del inspector; solo con N1 aprobado.
            if (sub_raw == "pendiente" or sub_n == "Pendiente") and n1 == "Aprobado":
                M["pendiente_item"]["residente"] += cd

            M["habilitado"]["inspector"] += cd
            if n1 == "Aprobado":
                M["habilitado"]["residente"] += cd
            if n1 == "Aprobado" and n2 == "Aprobado":
                M["habilitado"]["interventoria"] += cd

        if len(batch) < 1000:
            break
        off += 1000

    if acta_id_filtro is not None:
        off = 0
        while True:
            def _bo(o=off):
                q = supabase.table("so_registros").select(
                    "costo_directo,nivel1_estado,nivel2_estado,nivel3_estado,capitulo,acta_rpo_id,item_numero"
                ).eq("contrato_id", contrato_id)
                return q.range(o, o + 999).execute().data

            batch = supabase_execute(_bo)
            for reg in batch:
                if not (reg.get("item_numero") or "").strip():
                    continue
                aid = reg.get("acta_rpo_id")
                if aid is not None and aid == acta_id_filtro:
                    continue
                cd = float(reg.get("costo_directo") or 0)
                n1 = _matriz_validacion_norm_estado(reg.get("nivel1_estado"))
                n2 = _matriz_validacion_norm_estado(reg.get("nivel2_estado"))
                n3 = _matriz_validacion_norm_estado(reg.get("nivel3_estado"))
                bloque = _matriz_validacion_bloque_capitulo(reg.get("capitulo"))
                Ox = ens_m if bloque == "ensayos" else obra_m
                if n1 == "Aprobado" and n2 == "Aprobado" and n3 == "Pendiente":
                    Ox["otras_actas"]["interventoria"] += cd
                if n1 == "Aprobado" and n2 == "Pendiente":
                    Ox["otras_actas"]["residente"] += cd
                if n1 == "Pendiente":
                    Ox["otras_actas"]["inspector"] += cd
            if len(batch) < 1000:
                break
            off += 1000

    def round_block(m):
        out = {}
        for k, cols in m.items():
            out[k] = {c: round(v, 2) for c, v in cols.items()}
        return out

    return {
        "obra_ejecutada_directo_sin_aiu": round_block(obra_m),
        "ensayos_sondeos_directo_sin_iva": round_block(ens_m),
    }


@app.get("/sicoe-obra/{contrato_id}/dashboard-matriz-validacion")
def dashboard_matriz_validacion_obra(
    contrato_id: int,
    acta_rpo: Optional[int] = None,
    todo_contrato: bool = Query(False, description="Si true, agrega todo el contrato (lento). Si false y sin acta_rpo, usa acta vigente por período."),
    current_user=Depends(get_current_user),
):
    """
    Matriz de validación por rol (Interventoría=nivel3, Residente=nivel2, Inspector=nivel1).
    Por defecto (sin acta_rpo y todo_contrato=false): solo registros del **Acta RPO vigente** (fecha hoy ∈ [inicio, fin]).
    Con acta_rpo explícito: solo ese acta. Con todo_contrato=true: histórico completo (costoso).
    Preferir función SQL dashboard_matriz_validacion_agg (rápido); si no existe, fallback en Python.
    """
    try:
        acta_id_filtro: Optional[int] = None
        filtro_modo = "vigente"
        acta_rpo_resp: Optional[int] = None
        vig = None
        payload: dict = {}

        def _parse_rpc_matrix_raw(raw):
            if raw is None:
                return {}
            if isinstance(raw, list) and len(raw) > 0:
                return raw[0] if isinstance(raw[0], dict) else {}
            if isinstance(raw, dict) and "obra_ejecutada_directo_sin_aiu" in raw:
                return raw
            if isinstance(raw, dict):
                k = next(iter(raw.keys()), None)
                return raw[k] if k and isinstance(raw.get(k), dict) else raw
            return {}

        if todo_contrato:
            filtro_modo = "todo_contrato"
            acta_id_filtro = None
        elif acta_rpo is not None:
            filtro_modo = "acta"

            def _aid():
                rows = supabase.table("actas").select("id")\
                    .eq("contrato_id", contrato_id).eq("numero_rpo", acta_rpo).execute().data
                if rows:
                    return rows[0]["id"]
                rows = supabase.table("actas").select("id")\
                    .eq("contrato_id", contrato_id).eq("consecutivo", acta_rpo).execute().data
                return rows[0]["id"] if rows else None
            acta_id_filtro = supabase_execute(_aid)
            acta_rpo_resp = int(acta_rpo) if acta_rpo is not None else None
        else:
            # Acta vigente: preferir RPC único (resuelve acta + agrega en BD; menos latencia).
            bundle_meta = None
            try:
                def _bundle():
                    return supabase.rpc(
                        "dashboard_matriz_validacion_vigente_bundle",
                        {"p_contrato_id": contrato_id},
                    ).execute().data
                pay = _parse_rpc_matrix_raw(supabase_execute(_bundle))
                vm = pay.get("_vigente") if isinstance(pay, dict) else None
                if isinstance(vm, dict) and "obra_ejecutada_directo_sin_aiu" in pay:
                    bundle_meta = vm
                    payload = {k: v for k, v in pay.items() if k != "_vigente"}
            except Exception:
                payload = {}

            if bundle_meta is not None:
                aid = bundle_meta.get("acta_id")
                try:
                    acta_id_filtro = int(aid) if aid is not None else None
                except (TypeError, ValueError):
                    acta_id_filtro = None
                fm = bundle_meta.get("filtro")
                if isinstance(fm, str):
                    filtro_modo = fm
                nr = bundle_meta.get("numero_rpo")
                try:
                    acta_rpo_resp = int(nr) if nr is not None else None
                except (TypeError, ValueError):
                    acta_rpo_resp = None
                an_b = bundle_meta.get("asignado_nombre")
                if an_b is not None and not isinstance(an_b, str):
                    an_b = str(an_b)
                if acta_id_filtro is not None:
                    vig = {
                        "id": acta_id_filtro,
                        "numero_rpo": nr,
                        "asignado_nombre": (an_b or "").strip() or None,
                    }
                else:
                    vig = None
            else:
                vig = _acta_rpo_vigente_row(contrato_id)
                if vig:
                    acta_id_filtro = vig.get("id")
                    nr = vig.get("numero_rpo")
                    try:
                        acta_rpo_resp = int(nr) if nr is not None else None
                    except (TypeError, ValueError):
                        acta_rpo_resp = None
                else:
                    filtro_modo = "sin_vigente_todo_contrato"
                    acta_id_filtro = None

        if "obra_ejecutada_directo_sin_aiu" not in payload or "ensayos_sondeos_directo_sin_iva" not in payload:
            try:
                def _rpc():
                    return supabase.rpc(
                        "dashboard_matriz_validacion_agg",
                        {"p_contrato_id": contrato_id, "p_acta_id": acta_id_filtro},
                    ).execute().data
                payload = _parse_rpc_matrix_raw(supabase_execute(_rpc))
            except Exception:
                payload = {}

        if "obra_ejecutada_directo_sin_aiu" not in payload or "ensayos_sondeos_directo_sin_iva" not in payload:
            payload = _dashboard_matriz_validacion_fallback(contrato_id, acta_id_filtro)

        def _acta_vigente_public(v):
            if not v:
                return None
            nm = v.get("asignado_nombre")
            if nm is not None:
                nm = str(nm).strip() or None
            return {
                "id": v.get("id"),
                "numero_rpo": v.get("numero_rpo"),
                "asignado_nombre": nm,
            }

        return {
            "acta_rpo": acta_rpo_resp,
            "acta_id_resuelto": acta_id_filtro,
            "filtro": filtro_modo,
            "acta_vigente": _acta_vigente_public(vig),
            "obra_ejecutada_directo_sin_aiu": payload.get("obra_ejecutada_directo_sin_aiu") or {},
            "ensayos_sondeos_directo_sin_iva": payload.get("ensayos_sondeos_directo_sin_iva") or {},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sicoe-obra/{contrato_id}/dashboard-drill")
def dashboard_drill_obra(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    try:
        campo = "item" if capitulo else "capitulo"

        # 1. Obra aprobada desde vista
        if capitulo:
            def _obra():
                q = supabase.table("vista_dashboard_drill_item")\
                    .select("*").eq("contrato_id", contrato_id)\
                    .eq("capitulo", capitulo)
                if item: q = q.ilike("item_numero", f"%{item}%")
                return q.execute().data
        else:
            def _obra():
                return supabase.table("vista_dashboard_drill_capitulo")\
                    .select("*").eq("contrato_id", contrato_id).execute().data
        obra_rows = supabase_execute(_obra)

        # 2. Presupuesto desde vista
        def _ppto():
            q = supabase.table("vista_dashboard_ppto_drill")\
                .select("*").eq("contrato_id", contrato_id)
            if capitulo: q = q.eq("capitulo", capitulo)
            if item: q = q.eq("item", item)
            return q.execute().data
        ppto = supabase_execute(_ppto)

        # 3. Agregar presupuesto
        agg_p = {}; agg_p_cant = {}; desc_map = {}
        for r in ppto:
            k = r.get(campo) or "(sin valor)"
            agg_p[k] = agg_p.get(k, 0) + float(r.get("costo_directo") or 0)
            agg_p_cant[k] = agg_p_cant.get(k, 0) + float(r.get("cant_total") or 0)
            if campo == "item" and r.get("descripcion") and k not in desc_map:
                desc_map[k] = r["descripcion"]

        # 4. Agregar obra
        agg_c = {}; agg_c_cant = {}
        for r in obra_rows:
            if campo == "item":
                k = r.get("item_numero") or "(sin valor)"
                if k not in desc_map and r.get("item_descripcion"):
                    desc_map[k] = r["item_descripcion"]
            else:
                k = r.get("capitulo") or "Sin capítulo"
            agg_c[k] = agg_c.get(k, 0) + float(r.get("cobrado") or 0)
            agg_c_cant[k] = agg_c_cant.get(k, 0) + float(r.get("cant_cobro") or 0)

        keys = sorted(set(list(agg_p.keys()) + list(agg_c.keys())), key=lambda x: str(x))
        result = []
        for k in keys:
            p = agg_p.get(k, 0); c = agg_c.get(k, 0)
            result.append({
                "nombre": k, "descripcion": desc_map.get(k, ""),
                "presupuesto": p, "cobrado": round(c, 2),
                "delta": round(p - c, 2),
                "pct": round(c / p * 100, 1) if p else 0,
                "cant_ppto": round(agg_p_cant.get(k, 0), 3),
                "cant_cobro": round(agg_c_cant.get(k, 0), 3),
            })
        return {"campo": campo, "items": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _dashboard_pkid_tabla_obra_core(contrato_id: int, capitulo: Optional[str], item: Optional[str]) -> Dict[str, Any]:
    """Misma lógica que GET dashboard-pkid-tabla (para API y export Excel)."""
    registros = []
    off = 0
    while True:
        def _regs(o=off):
            q = supabase.table("so_registros")\
                .select("pk_id_id, pk_ids(pk_id), costo_directo, cantidad_total, item_numero")\
                .eq("contrato_id", contrato_id)\
                .eq("nivel3_estado", "Aprobado")
            if capitulo: q = q.eq("capitulo", capitulo)
            if item: q = q.ilike("item_numero", f"%{item}%")
            return q.range(o, o + 999).execute().data
        batch = supabase_execute(_regs)
        registros.extend(batch)
        if len(batch) < 1000: break
        off += 1000

    q_p = supabase.table("presupuesto")\
        .select("pk_id, cant_total, costo_directo, descripcion")\
        .eq("contrato_id", contrato_id).eq("dado_de_baja", False)
    if item: q_p = q_p.eq("item", item)
    elif capitulo: q_p = q_p.eq("capitulo", capitulo)
    ppto = []
    off = 0
    while True:
        batch = q_p.range(off, off + 999).execute().data
        ppto.extend(batch)
        if len(batch) < 1000: break
        off += 1000

    agg_p = {}
    for r in ppto:
        k = r.get("pk_id") or "(sin pk)"
        if k not in agg_p: agg_p[k] = {"cant": 0.0, "costo": 0.0, "desc": ""}
        agg_p[k]["cant"] += float(r.get("cant_total") or 0)
        agg_p[k]["costo"] += float(r.get("costo_directo") or 0)
        if not agg_p[k]["desc"] and r.get("descripcion"):
            agg_p[k]["desc"] = r["descripcion"]

    agg_c = {}
    for r in registros:
        pk_join = r.get("pk_ids") or {}
        k = pk_join.get("pk_id") or str(r.get("pk_id_id") or "(sin pk)")
        if k not in agg_c: agg_c[k] = {"cant": 0.0, "costo": 0.0}
        agg_c[k]["cant"] += float(r.get("cantidad_total") or 0)
        agg_c[k]["costo"] += float(r.get("costo_directo") or 0)

    keys = sorted(set(list(agg_p.keys()) + list(agg_c.keys())), key=lambda x: str(x))
    rows = []
    for k in keys:
        p = agg_p.get(k, {"cant": 0.0, "costo": 0.0})
        c = agg_c.get(k, {"cant": 0.0, "costo": 0.0})
        rows.append({
            "pk_id": k,
            "cant_ppto": round(p["cant"], 3), "costo_ppto": round(p["costo"], 0),
            "cant_sicoe": round(c["cant"], 3), "costo_sicoe": round(c["costo"], 0),
            "delta_cant": round(p["cant"] - c["cant"], 3),
            "delta_costo": round(p["costo"] - c["costo"], 0),
            "descripcion": p.get("desc", ""),
        })

    desc_item = ""
    if item:
        d = supabase.table("presupuesto").select("descripcion")\
            .eq("contrato_id", contrato_id).eq("item", item)\
            .not_.is_("descripcion", "null").limit(1).execute().data
        if d: desc_item = d[0].get("descripcion") or ""

    por_cobrar = sum(r["delta_costo"] for r in rows if r["delta_costo"] > 0)
    devolucion = sum(abs(r["delta_costo"]) for r in rows if r["delta_costo"] < 0)
    return {"rows": rows, "por_cobrar": por_cobrar, "devolucion": devolucion, "descripcion_item": desc_item}


def _build_dashboard_capitulo_xlsx(data: Dict[str, Any], capitulo: str, item: Optional[str], contrato_id: int):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Detalle PK"
    ws.append(["Contrato ID", contrato_id])
    ws.append(["Capítulo", capitulo or ""])
    ws.append(["Ítem", item or ""])
    if data.get("descripcion_item"):
        ws.append(["Descripción ítem", data["descripcion_item"]])
    ws.append([])
    hdr = [
        "pk_id", "Descripción (ppto)", "Cant. presupuesto", "Costo presupuesto",
        "Cant. SICOE", "Costo SICOE", "Delta cant.", "Delta costo",
    ]
    ws.append(hdr)
    hr = ws.max_row
    for c in range(1, len(hdr) + 1):
        ws.cell(row=hr, column=c).font = Font(bold=True)
    for r in data.get("rows") or []:
        ws.append([
            r.get("pk_id"),
            r.get("descripcion") or "",
            r.get("cant_ppto"),
            r.get("costo_ppto"),
            r.get("cant_sicoe"),
            r.get("costo_sicoe"),
            r.get("delta_cant"),
            r.get("delta_costo"),
        ])
    ws.append([])
    ws.append(["Por cobrar (delta costo > 0)", data.get("por_cobrar", 0)])
    ws.append(["Devolución / ajuste (delta < 0)", data.get("devolucion", 0)])
    bio = io.BytesIO()
    wb.save(bio)
    safe_cap = re.sub(r"[^\w\-.]+", "_", str(capitulo or "cap"))[:40]
    fn = f"ClaraCore_dashboard_{contrato_id}_{safe_cap}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
    return bio.getvalue(), fn


@app.get("/sicoe-obra/{contrato_id}/dashboard-pkid-tabla")
def dashboard_pkid_tabla_obra(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
    Reemplaza /cobro/{contrato_id}/pkid-tabla para el Dashboard.
    Retorna misma forma: {rows: [{pk_id, cant_ppto, costo_ppto, cant_sicoe, costo_sicoe, delta_cant, delta_costo}]}
    """
    try:
        return _dashboard_pkid_tabla_obra_core(contrato_id, capitulo, item)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sicoe-obra/{contrato_id}/dashboard-export-capitulo")
def dashboard_export_capitulo_obra(
    contrato_id: int,
    capitulo: str = Query(..., description="Capítulo del drill del dashboard"),
    item: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Inicia generación de Excel alineado con dashboard-pkid-tabla (reemplazo de /cobro/.../exportar-capitulo).
    Respuesta: { job_id }; luego GET /exportar/estado/{job_id} y /exportar/descargar/{job_id}.
    """
    _require_contract_access(current_user, contrato_id)
    job_id = str(uuid.uuid4())
    _export_jobs[job_id] = {"estado": "procesando", "buf": None, "filename": None}
    cap_copy = capitulo
    item_copy = item

    def _work():
        try:
            data = _dashboard_pkid_tabla_obra_core(contrato_id, cap_copy, item_copy)
            buf, fn = _build_dashboard_capitulo_xlsx(data, cap_copy, item_copy, contrato_id)
            _export_jobs[job_id] = {"estado": "listo", "buf": buf, "filename": fn}
        except Exception as e:
            _export_jobs[job_id] = {"estado": f"error:{e!s}", "buf": None, "filename": None}

    threading.Thread(target=_work, daemon=True).start()
    return {"job_id": job_id}


@app.get(
    "/presupuesto/{contrato_id}/pkid-colores",
    operation_id="presupuesto_pkid_colores_compat",
)
@app.get(
    "/sicoe-obra/{contrato_id}/dashboard-pkid-colores",
    operation_id="sicoe_dashboard_pkid_colores",
)
def dashboard_pkid_colores_obra(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
    Compat: el front aún llama GET /presupuesto/{id}/pkid-colores.
    Reemplaza /cobro/{contrato_id}/pkid-colores-drill para el mini-mapa semáforo del Dashboard.
    Retorna misma forma: {pk_id: {cobrado, presupuesto, pct, sobrecosto}}
    """
    try:
        reporte_ids = None
        if capitulo:
            def _reps():
                return supabase.table("so_reportes")\
                    .select("id").eq("contrato_id", contrato_id)\
                    .eq("capitulo", capitulo).execute().data
            reporte_ids = [r["id"] for r in supabase_execute(_reps)]

        # Registros aprobados
        registros = []
        off = 0
        while True:
            def _regs(o=off):
                q = supabase.table("so_registros")\
                    .select("pk_id_id, pk_ids(pk_id), costo_directo")\
                    .eq("contrato_id", contrato_id)\
                    .eq("nivel3_estado", "Aprobado")
                if capitulo: q = q.eq("capitulo", capitulo)
                if item: q = q.ilike("item_numero", f"%{item}%")
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        cobro_agg = {}
        for r in registros:
            pk_join = r.get("pk_ids") or {}
            k = pk_join.get("pk_id") or str(r.get("pk_id_id") or "")
            if k: cobro_agg[k] = cobro_agg.get(k, 0) + float(r.get("costo_directo") or 0)

        q_p = supabase.table("presupuesto")\
            .select("pk_id, costo_directo").eq("contrato_id", contrato_id)
        if item: q_p = q_p.eq("item", item)
        elif capitulo: q_p = q_p.eq("capitulo", capitulo)
        try:
            ppto_rows = q_p.execute().data
        except Exception:
            ppto_rows = []
        ppto_agg = {}
        for r in ppto_rows:
            k = str(r.get("pk_id") or "").strip()
            if k: ppto_agg[k] = ppto_agg.get(k, 0) + float(r.get("costo_directo") or 0)

        result = {}
        for pk in set(list(cobro_agg.keys()) + list(ppto_agg.keys())):
            c = cobro_agg.get(pk, 0); p = ppto_agg.get(pk, 0)
            result[pk] = {
                "cobrado": round(c, 2), "presupuesto": round(p, 2),
                "pct": round(c / p * 100, 1) if p else 0,
                "sobrecosto": c > p,
            }
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sicoe-obra/{contrato_id}/dashboard-pkid-detalle")
def dashboard_pkid_detalle_obra(
    contrato_id: int,
    pk_id: Optional[str] = None,
    item: Optional[str] = None,
    capitulo: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
    Reemplaza /cobro/{contrato_id}/pkid-detalle para el popup de detalle por PK_ID.
    Retorna misma forma: {ppto, cobro, totales}
    """
    try:
        # Presupuesto
        q_p = supabase.table("presupuesto")\
            .select("id, id_pol, no_inicio, no_final, cant_total, costo_directo, descripcion, item, ent_handle, x_label, y_label")\
            .eq("contrato_id", contrato_id).eq("dado_de_baja", False)
        if pk_id: q_p = q_p.eq("pk_id", pk_id)
        if item: q_p = q_p.eq("item", item)
        elif capitulo: q_p = q_p.eq("capitulo", capitulo)
        ppto = q_p.execute().data or []

        # Resolver pk_id_id desde string pk_id
        pkid_id_val = None
        if pk_id:
            def _pk():
                return supabase.table("pk_ids").select("id")\
                    .eq("pk_id", pk_id).limit(1).execute().data
            res = supabase_execute(_pk)
            if res: pkid_id_val = res[0]["id"]

        # Registros aprobados para este pk_id
        q_c = supabase.table("so_registros")\
            .select("id, numero_registro, id_pol, tramo, nodo_ini, nodo_fin, cantidad_total, costo_directo, item_descripcion, item_numero, acta_rpo_id, calzada, reporte_id")\
            .eq("contrato_id", contrato_id).eq("nivel3_estado", "Aprobado")
        if pkid_id_val: q_c = q_c.eq("pk_id_id", pkid_id_val)
        if capitulo and not item: q_c = q_c.eq("capitulo", capitulo)
        if item: q_c = q_c.ilike("item_numero", f"%{item}%")
        cobro_rows = q_c.execute().data or []

        # Resolver numero_rpo para cada registro
        acta_ids2 = list({r["acta_rpo_id"] for r in cobro_rows if r.get("acta_rpo_id")})
        acta_map2 = {}
        if acta_ids2:
            def _am2():
                return supabase.table("actas").select("id, numero_rpo")\
                    .in_("id", acta_ids2).execute().data
            for a in supabase_execute(_am2):
                acta_map2[a["id"]] = a.get("numero_rpo") or a["id"]

        cobro_fmt = []
        for r in cobro_rows:
            cobro_fmt.append({
                "registro": r.get("numero_registro"),
                "id_pol": r.get("id_pol"),
                "registro_id": r.get("id"),
                "reporte_id": r.get("reporte_id"),
                "tramo_inicio": r.get("nodo_ini"),
                "tramo_final": r.get("nodo_fin"),
                "cantidad": float(r.get("cantidad_total") or 0),
                "longitud": float(r.get("cantidad_total") or 0),
                "costo_directo": float(r.get("costo_directo") or 0),
                "descripcion": r.get("item_descripcion") or "",
                "item": r.get("item_numero") or "",
                "acta": acta_map2.get(r.get("acta_rpo_id")),
                "calzada": r.get("calzada") or "",
                "reporte_id": r.get("reporte_id"),
            })

        cant_ppto  = sum(float(r.get("cant_total") or 0) for r in ppto)
        costo_ppto = sum(float(r.get("costo_directo") or 0) for r in ppto)
        cant_cobro  = sum(float(r.get("cantidad_total") or 0) for r in cobro_rows)
        costo_cobro = sum(float(r.get("costo_directo") or 0) for r in cobro_rows)

        return {
            "ppto": ppto,
            "cobro": cobro_fmt,
            "totales": {
                "cant_ppto":   round(cant_ppto, 2),
                "costo_ppto":  round(costo_ppto, 0),
                "cant_cobro":  round(cant_cobro, 2),
                "costo_cobro": round(costo_cobro, 0),
                "delta_cant":  round(cant_ppto - cant_cobro, 2),
                "delta_costo": round(costo_ppto - costo_cobro, 0),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/solicitar-reversion")
def solicitar_reversion(contrato_id: int, registro_id: int, body: SolicitarReversionBody,
                        current_user=Depends(get_current_user)):
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        def _get():
            return supabase.table("so_registros")\
                .select("nivel3_estado, bloqueado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado.")
        reg = rows[0]
        if reg.get("nivel3_estado") != "Aprobado" or not reg.get("bloqueado"):
            raise HTTPException(status_code=422,
                detail="El registro debe estar en nivel3 Aprobado y bloqueado para solicitar reversión.")

        def _upd():
            return supabase.table("so_registros")\
                .update({"solicitud_reversion": True}).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data,
                             tipo_override="solicitud_reversion")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}/aceptar-reversion")
def aceptar_reversion(contrato_id: int, registro_id: int, body: AceptarReversionBody,
                      current_user=Depends(get_current_user)):
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        def _get():
            return supabase.table("so_registros")\
                .select("solicitud_reversion").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows or not rows[0].get("solicitud_reversion"):
            raise HTTPException(status_code=422,
                detail="No existe una solicitud de reversión activa para este registro.")

        if body.aceptar:
            update = {
                "bloqueado":          False,
                "solicitud_reversion": False,
                "nivel3_estado":      "No Revisado",
                "nivel3_usuario_id":  None,
                "nivel3_fecha":       None,
            }
        else:
            update = {"solicitud_reversion": False}

        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)

        if body.aceptar:
            comentario_data = {
                "tipo":    "aceptar_reversion",
                "mensaje": "Reversión aceptada.",
            }
            _insertar_comentario(contrato_id, registro_id, autor_id, comentario_data,
                                 tipo_override="aceptar_reversion")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sicoe-obra/{contrato_id}/registros/{registro_id}/comentarios")
def crear_comentario(contrato_id: int, registro_id: int, body: ComentarioCreate,
                     current_user=Depends(get_current_user)):
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        comentario_data = body.dict()
        dest_raw = comentario_data.get("destinatarios") or []
        n_dest = 0
        for d in dest_raw:
            if isinstance(d, dict) and d.get("id") is not None:
                n_dest += 1
        mensaje_limpio = (comentario_data.get("mensaje") or "").strip()
        if not mensaje_limpio:
            raise HTTPException(
                status_code=422, detail="El cuerpo del mensaje es obligatorio.")
        if n_dest < 1:
            raise HTTPException(
                status_code=422, detail="Debe indicar al menos un destinatario (para quién va el mensaje).")
        creado = _insertar_comentario(contrato_id, registro_id, autor_id, comentario_data)

        # Notificación directa a destinatarios explícitos
        destinatarios = comentario_data.get("destinatarios") or []
        asunto = (comentario_data.get("asunto") or "Comentario de validación").strip() or "Comentario de validación"
        mensaje = comentario_data.get("mensaje") or ""
        for d in destinatarios:
            if not isinstance(d, dict):
                continue
            try:
                did = int(d.get("id"))
            except Exception:
                continue
            if did == autor_id:
                continue
            try:
                def _notif():
                    return supabase.table("notificaciones").insert({
                        "destinatario_id": did,
                        "remitente_id": autor_id,
                        "contrato_id": contrato_id,
                        "tipo": "validacion",
                        "modulo": "sicoe_obra",
                        "entidad_tipo": "registro",
                        "entidad_id": str(registro_id),
                        "asunto": asunto,
                        "mensaje": mensaje,
                        "leido": False,
                    }).execute().data
                supabase_execute(_notif)
            except Exception:
                pass

        return {"ok": True, "comentario_id": creado.get("id")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sicoe-obra/{contrato_id}/registros/{registro_id}/comentarios/{comentario_id}/respuesta")
def responder_comentario_registro(contrato_id: int, registro_id: int, comentario_id: int,
                                   body: dict, current_user=Depends(get_current_user)):
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        parent = supabase.table("so_registro_comentarios").select(
            "confidencialidad, rol_origen, destinatarios, etiqueta, asunto, tipo, nivel_validacion"
        ).eq("id", comentario_id).eq("registro_id", registro_id).eq("contrato_id", contrato_id).single().execute().data

        if not parent:
            raise HTTPException(status_code=404, detail="Comentario padre no encontrado")

        parent_conf = parent.get("confidencialidad") or "publico"
        parent_rol = parent.get("rol_origen") or ""
        parent_dest = parent.get("destinatarios") or []
        parent_tipo = parent.get("tipo") or "validacion"

        def _ins():
            return supabase.table("so_registro_comentarios").insert({
                "registro_id":    registro_id,
                "contrato_id":    contrato_id,
                "autor_id":       autor_id,
                "padre_id":       comentario_id,
                "mensaje":        body.get("mensaje", ""),
                "tipo":           parent_tipo,
                # Heredar confidencialidad del hilo evita fugas por respuestas "cruzadas".
                "confidencialidad": parent_conf,
                "rol_origen":     body.get("rol_origen") or parent_rol,
                "destinatarios":  parent_dest,
                "etiqueta":       parent.get("etiqueta"),
                "asunto":         parent.get("asunto"),
                "enlaces":        [],
                "nivel_validacion": parent.get("nivel_validacion"),
            }).execute().data
        supabase_execute(_ins)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sicoe-obra/{contrato_id}/registros/{registro_id}/reporte")
def get_reporte_de_registro(
    contrato_id: int,
    registro_id: int,
    cargo_id: Optional[int] = Query(None),
    estado_validacion: Optional[str] = Query(None),
    validacion_capas: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    try:
        def _get():
            return supabase.table("so_registros").select("reporte_id")\
                .eq("id", registro_id).eq("contrato_id", contrato_id)\
                .limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        reporte_id = rows[0]["reporte_id"]
        # Reusar el endpoint existente
        from fastapi import Request
        def _rep():
            return supabase.table("so_reportes")\
                .select("*, subcontratistas(razon_social)")\
                .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
        def _reg():
            return supabase.table("so_registros").select("*")\
                .eq("reporte_id", reporte_id).order("id").execute().data
        reporte = supabase_execute(_rep)
        if not reporte:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")
        r = reporte[0]
        sub = r.pop("subcontratistas", None)
        r["subcontratista_nombre"] = sub["razon_social"] if sub else None
        regs_raw = supabase_execute(_reg)
        _capas_gr = _parse_validacion_capas_param(validacion_capas, cargo_id, estado_validacion)
        if _capas_gr:
            regs_raw = _filtrar_registros_validacion_capas_sicoe(regs_raw, _capas_gr, r)
        reg_ids = [reg["id"] for reg in regs_raw if reg.get("id")]
        num_comentarios_map = {}
        if reg_ids:
            try:
                def _cnt():
                    return supabase.table("so_registro_comentarios")\
                        .select("registro_id").in_("registro_id", reg_ids).execute().data
                for row in supabase_execute(_cnt):
                    rid = row["registro_id"]
                    num_comentarios_map[rid] = num_comentarios_map.get(rid, 0) + 1
            except Exception:
                pass
        for reg in regs_raw:
            reg["num_comentarios"] = num_comentarios_map.get(reg["id"], 0)
        r["registros"] = regs_raw
        r["puntos"] = []
        return r
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sicoe-obra/{contrato_id}/registros/{registro_id}/comentarios")
def listar_comentarios(contrato_id: int, registro_id: int, rol_solicitante: str,
                       current_user=Depends(get_current_user)):
    try:
        def _get():
            return supabase.table("so_registro_comentarios")\
                .select("*")\
                .eq("registro_id", registro_id)\
                .eq("contrato_id", contrato_id)\
                .order("created_at", desc=False).execute().data
        comentarios = supabase_execute(_get)
        autor_ids = list({c["autor_id"] for c in comentarios if c.get("autor_id")})
        autor_map = {}
        if autor_ids:
            try:
                def _autores():
                    return supabase.table("usuarios").select("id, nombre, apellidos")\
                        .in_("id", autor_ids).execute().data
                for u in supabase_execute(_autores):
                    autor_map[u["id"]] = f"{u.get('nombre','')} {u.get('apellidos','')or ''}".strip()
            except Exception:
                pass
        for c in comentarios:
            c["autor"] = {"nombre": autor_map.get(c.get("autor_id"), "Usuario")}

        # Regla directa solicitada:
        # - Sin destinatarios: visible para todos.
        # - Con destinatarios: visible solo para ids explícitos.
        uid = int(current_user.get("sub") or current_user.get("id", 0))
        by_id = {c.get("id"): c for c in comentarios}
        filtrados = []
        for c in comentarios:
            destinatarios = c.get("destinatarios") or []
            # Si es respuesta sin destinatarios, heredar destinatarios del padre.
            if (not destinatarios) and c.get("padre_id") and by_id.get(c.get("padre_id")):
                destinatarios = by_id[c.get("padre_id")].get("destinatarios") or []
            ids_dest = set()
            for d in destinatarios:
                if isinstance(d, dict):
                    try:
                        did = int(d.get("id"))
                        ids_dest.add(did)
                    except Exception:
                        continue
            visible = (not ids_dest) or (uid in ids_dest) or (int(c.get("autor_id") or 0) == uid)

            if visible:
                filtrados.append(c)

        # Agrupar: padres con sus respuestas anidadas
        padres = [c for c in filtrados if not c.get("padre_id")]
        hijos  = [c for c in filtrados if c.get("padre_id")]
        for p in padres:
            p["respuestas"] = [h for h in hijos if h.get("padre_id") == p["id"]]
        return padres
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/validar-masivo-nivel2")
def validar_masivo_nivel2(contrato_id: int, reporte_id: int, body: ValidarMasivoNivel2Body,
                          current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado", "No Objeto de Cobro"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")

    estado_real = body.estado
    if body.estado == "No Objeto de Cobro":
        estado_real = "Rechazado"
        if not body.comentario_data:
            raise HTTPException(status_code=422,
                detail="Se requiere comentario_data para 'No Objeto de Cobro'.")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(status_code=422,
            detail="Se requiere comentario_data cuando el estado es Pendiente o Rechazado.")

    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        actualizados = 0
        omitidos = 0

        for reg_id in body.ids_registros:
            def _get(rid=reg_id):
                return supabase.table("so_registros")\
                    .select("nivel1_estado").eq("id", rid)\
                    .eq("contrato_id", contrato_id).limit(1).execute().data
            rows = supabase_execute(_get)
            if not rows or rows[0].get("nivel1_estado") != "Aprobado":
                omitidos += 1
                continue

            update = {
                "nivel2_estado":     estado_real,
                "nivel2_usuario_id": autor_id,
                "nivel2_fecha":      datetime.utcnow().isoformat(),
            }
            if body.objeto_pago_sub is not None:
                update["nivel2_objeto_pago_sub"] = body.objeto_pago_sub

            def _upd(rid=reg_id, upd=update):
                return supabase.table("so_registros")\
                    .update(upd).eq("id", rid)\
                    .eq("contrato_id", contrato_id).execute().data
            supabase_execute(_upd)

            if estado_real == "Aprobado":
                try:
                    _aplicar_acta_rpo_vigente_a_registro(contrato_id, reg_id, date.today())
                except Exception:
                    pass

            if body.comentario_data:
                _insertar_comentario(
                    contrato_id, reg_id, autor_id, body.comentario_data,
                    tipo_override="validacion", nivel_validacion_override="Nivel 2"
                )
            actualizados += 1

        return {"actualizados": actualizados, "omitidos": omitidos}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/validar-masivo-nivel3")
def validar_masivo_nivel3(contrato_id: int, reporte_id: int, body: ValidarMasivoNivel3Body,
                          current_user=Depends(get_current_user)):
    ESTADOS = {"Aprobado", "Pendiente", "Rechazado"}
    if body.estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Acepta: {ESTADOS}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(status_code=422,
            detail="Se requiere comentario_data cuando el estado es Pendiente o Rechazado.")
    try:
        autor_id = int(current_user.get("sub") or current_user.get("id", 0))
        actualizados = 0
        omitidos = 0

        for reg_id in body.ids_registros:
            def _get(rid=reg_id):
                return supabase.table("so_registros")\
                    .select("nivel2_estado").eq("id", rid)\
                    .eq("contrato_id", contrato_id).limit(1).execute().data
            rows = supabase_execute(_get)
            if not rows or rows[0].get("nivel2_estado") != "Aprobado":
                omitidos += 1
                continue

            update = {
                "nivel3_estado":     body.estado,
                "nivel3_usuario_id": autor_id,
                "nivel3_fecha":      datetime.utcnow().isoformat(),
            }
            if body.estado == "Aprobado":
                update["bloqueado"] = True

            def _upd(rid=reg_id, upd=update):
                return supabase.table("so_registros")\
                    .update(upd).eq("id", rid)\
                    .eq("contrato_id", contrato_id).execute().data
            supabase_execute(_upd)

            if body.estado == "Aprobado":
                try:
                    _aplicar_acta_rpo_vigente_a_registro(contrato_id, reg_id, date.today())
                except Exception:
                    pass

            if body.comentario_data:
                _insertar_comentario(
                    contrato_id, reg_id, autor_id, body.comentario_data,
                    tipo_override="validacion", nivel_validacion_override="Nivel 3"
                )
            actualizados += 1

        return {"actualizados": actualizados, "omitidos": omitidos}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sicoe-obra/{contrato_id}/registros/reconciliar-acta-rpo-historico")
def reconciliar_acta_rpo_historico(
    contrato_id: int,
    body: ReconciliarActaRpoHistoricoBody,
    current_user=Depends(get_current_user),
):
    """
    Alinea acta_rpo_id en registros ya existentes según la fecha de aprobación:
    N3 aprobado → acta vigente en nivel3_fecha (o nivel2_fecha si falta);
    solo N2 aprobado → acta vigente en nivel2_fecha.
    No modifica registros sin aprobación N2. Solo Desarrollador.
    """
    if not _es_desarrollador(current_user):
        raise HTTPException(status_code=403, detail="Solo el cargo Desarrollador puede ejecutar esta acción.")
    try:
        revisados = 0
        actualizados = 0
        sin_acta_periodo = 0
        off = 0
        while True:
            def _batch(o=off):
                return supabase.table("so_registros").select(
                    "id, reporte_id, acta_rpo_id, nivel2_estado, nivel3_estado, nivel2_fecha, nivel3_fecha"
                ).eq("contrato_id", contrato_id).range(o, o + 499).execute().data

            rows = supabase_execute(_batch) or []
            for row in rows:
                revisados += 1
                ref_raw = None
                if _matriz_validacion_norm_estado(row.get("nivel3_estado")) == "Aprobado":
                    ref_raw = row.get("nivel3_fecha") or row.get("nivel2_fecha")
                elif _matriz_validacion_norm_estado(row.get("nivel2_estado")) == "Aprobado":
                    ref_raw = row.get("nivel2_fecha")
                else:
                    continue
                d = _parse_iso_to_date(ref_raw)
                if not d:
                    continue
                acta_id = _acta_rpo_id_vigente_para_fecha(contrato_id, d)
                if not acta_id:
                    sin_acta_periodo += 1
                    continue
                if acta_id == row.get("acta_rpo_id"):
                    continue
                if body.dry_run:
                    actualizados += 1
                    continue
                rid = row["id"]
                rep_id = row.get("reporte_id")

                def _ur():
                    return supabase.table("so_registros").update({"acta_rpo_id": acta_id})\
                        .eq("id", rid).eq("contrato_id", contrato_id).execute().data

                supabase_execute(_ur)
                if rep_id is not None:
                    def _urp():
                        return supabase.table("so_reportes").update({"acta_rpo_id": acta_id})\
                            .eq("id", rep_id).eq("contrato_id", contrato_id).execute().data

                    supabase_execute(_urp)
                actualizados += 1
            if len(rows) < 500:
                break
            off += 500
        return {
            "revisados": revisados,
            "actualizados": actualizados,
            "sin_acta_periodo": sin_acta_periodo,
            "dry_run": body.dry_run,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
