from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
import io, requests as req_http
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
from supabase import create_client
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import time
import uuid
import threading
from datetime import datetime, timedelta

# ── Sesiones DWG activas (en memoria) ─────────────────────────────────────────
_dwg_sessions: dict = {}
# ── Jobs de exportación Excel en background ────────────────────────────────────
_export_jobs: dict = {}  # { job_id: { "estado": "procesando"|"listo"|"error", "buf": bytes, "filename": str } }
_DWG_TIMEOUT = 30  # segundos — margen para curl.exe

def _dwg_activo(contrato_id: int, usuario_id: int = None) -> bool:
    last = _dwg_sessions.get(contrato_id)
    return last is not None and (time.time() - last) < 10

load_dotenv()

app = FastAPI(title="ClaraCore API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://claracore.co",
        "https://www.claracore.co",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_KEY = os.getenv("SUPABASE_KEY")

import threading
_supabase_local = threading.local()

def get_supabase():
    if not hasattr(_supabase_local, 'client'):
        _supabase_local.client = create_client(_SUPABASE_URL, _SUPABASE_KEY)
    return _supabase_local.client

supabase = get_supabase()
security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

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

class UsuarioContratoCreate(BaseModel):
    usuario_id: int
    contrato_id: int

class ContratoUpdate(BaseModel):
    numero: Optional[str] = None
    objeto: Optional[str] = None
    contratista: Optional[str] = None
    nit: Optional[str] = None
    interventoria: Optional[str] = None
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

# ─────────────────────────────────────────────
# HELPER SUPABASE CON REINTENTOS
# ─────────────────────────────────────────────
def supabase_execute(fn, retries=3, delay=0.5):
    import time
    last_err = None
    for i in range(retries):
        try:
            global supabase
            supabase = get_supabase()
            return fn()
        except Exception as e:
            last_err = e
            if i < retries - 1:
                time.sleep(delay)
                if hasattr(_supabase_local, 'client'):
                    del _supabase_local.client
    raise last_err

# ─────────────────────────────────────────────
# SISTEMA DE LOGS
# ─────────────────────────────────────────────
def registrar_log(usuario, accion, modulo, entidad_tipo=None, entidad_id=None, detalle=None, resultado="ok"):
    try:
        uid = usuario.get("sub") or usuario.get("id")
        supabase.table("logs").insert({
            "usuario_id":      int(uid) if uid else None,
            "usuario_nombre":  usuario.get("nombre") or usuario.get("email", ""),
            "cargo_nombre":    usuario.get("cargo_nombre", ""),
            "contrato_id":     usuario.get("contrato_id"),
            "contrato_numero": usuario.get("contrato_numero"),
            "accion":          accion,
            "modulo":          modulo,
            "entidad_tipo":    entidad_tipo,
            "entidad_id":      str(entidad_id) if entidad_id is not None else None,
            "detalle":         detalle or {},
            "resultado":       resultado,
        }).execute()
    except Exception:
        pass

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

# ─────────────────────────────────────────────
# RUTAS PÚBLICAS
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "ClaraCore API funcionando"}

@app.get("/cargos")
def listar_cargos():
    return supabase.table("cargos").select("*").order("nombre").execute().data

@app.get("/roles")
def listar_roles():
    return supabase.table("roles").select("*").order("nombre").execute().data

@app.get("/contratos")
def listar_contratos():
    return supabase.table("contratos").select("id, numero, objeto, contratista, nit, interventoria, logo_contratista, logo_interventoria, fase").order("numero").execute().data

@app.post("/auth/login")
def login(request: LoginRequest):
    result = supabase.table("usuarios").select("*").eq("email", request.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    usuario = result.data[0]
    if not verify_password(request.password, usuario["password_hash"]):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    if usuario.get("estado") == "pendiente":
        raise HTTPException(status_code=403, detail="Tu cuenta está pendiente de aprobación")
    if usuario.get("estado") == "rechazado":
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

    token = create_token({"sub": str(usuario["id"]), "email": usuario["email"]})

    # Cargar permisos del cargo para control de acceso en el panel
    permisos = []
    if usuario.get("cargo_id"):
        permisos_raw = supabase.table("permisos").select("*").eq("cargo_id", usuario["cargo_id"]).execute().data
        funciones_map = {f["id"]: f["nombre"] for f in supabase.table("funciones").select("id, nombre").execute().data}
        permisos = [{**p, "funcion_nombre": funciones_map.get(p["funcion_id"], "")} for p in permisos_raw]

    registrar_log(
        {"sub": str(usuario["id"]), "nombre": usuario.get("nombre",""),
         "cargo_nombre": cargo_nombre, "contrato_id": usuario.get("contrato_id"),
         "contrato_numero": contrato_numero},
        "LOGIN", "AUTH", "usuario", str(usuario["id"]),
        {"email": usuario["email"], "cargo": cargo_nombre, "contrato": contrato_numero}
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
            "permisos": permisos,
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
    """Devuelve el perfil actualizado del usuario en sesión. Usado para polling de sesión en tiempo real."""
    uid = int(current_user["sub"])
    result = supabase.table("usuarios").select("*").eq("id", uid).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u = result.data[0]
    cargo_nombre = None
    if u.get("cargo_id"):
        r = supabase.table("cargos").select("nombre").eq("id", u["cargo_id"]).execute()
        if r.data: cargo_nombre = r.data[0]["nombre"]
    rol_nombre = None
    if u.get("rol_id"):
        r = supabase.table("roles").select("nombre").eq("id", u["rol_id"]).execute()
        if r.data: rol_nombre = r.data[0]["nombre"]
    permisos = []
    if u.get("cargo_id"):
        permisos_raw = supabase.table("permisos").select("*").eq("cargo_id", u["cargo_id"]).execute().data
        funciones_map = {f["id"]: f["nombre"] for f in supabase.table("funciones").select("id, nombre").execute().data}
        permisos = [{**p, "funcion_nombre": funciones_map.get(p["funcion_id"], "")} for p in permisos_raw]
    return {
        "id": u["id"], "nombre": u["nombre"], "apellidos": u.get("apellidos"),
        "email": u["email"], "cargo_id": u.get("cargo_id"), "cargo_nombre": cargo_nombre,
        "rol_id": u.get("rol_id"), "rol_nombre": rol_nombre,
        "contrato_id": u.get("contrato_id"), "estado": u.get("estado"), "activo": u.get("activo"),
        "permisos": permisos,
    }

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
    return supabase.table("funciones").select("*").order("nombre").execute().data

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
        "logo_contratista": contrato.logo_contratista,
        "logo_interventoria": contrato.logo_interventoria,
    }).execute()
    return result.data[0]

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
        "id, nombre, apellidos, email, activo, cargo_id, rol_id, contrato_id, estado, created_at"
    ).order("nombre").execute()
    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    roles = {r["id"]: r["nombre"] for r in supabase.table("roles").select("id, nombre").execute().data}
    contratos = {c["id"]: c["numero"] for c in supabase.table("contratos").select("id, numero").execute().data}
    for u in result.data:
        u["cargo_nombre"] = cargos.get(u.get("cargo_id"), "Sin cargo")
        u["rol_nombre"] = roles.get(u.get("rol_id"), "Sin rol")
        u["contrato_numero"] = contratos.get(u.get("contrato_id"), "Sin contrato")
    # Desarrollador es invisible para otros cargos, pero visible para sí mismo
        caller_id = int(current_user["sub"])
        # Obtener datos del caller para saber su cargo y contrato
        caller_data = supabase.table("usuarios").select("cargo_id, contrato_id").eq("id", caller_id).execute().data
        caller_cargo = ""
        caller_contrato = None
        if caller_data:
            cid = caller_data[0].get("cargo_id")
            if cid:
                c = supabase.table("cargos").select("nombre").eq("id", cid).execute().data
                if c: caller_cargo = c[0]["nombre"].lower()
            caller_contrato = caller_data[0].get("contrato_id")

            # Paso 1: filtro por contrato si es Administrador
            if caller_cargo == "administrador" and caller_contrato:
                filtered = [u for u in result.data if u.get("contrato_id") == caller_contrato]
            else:
                filtered = list(result.data)

            # Paso 2: Desarrollador siempre invisible para todos, excepto para sí mismo
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
    # exclude_unset=True: campos no enviados no se tocan; null explícito sí borra el campo
    data = body.dict(exclude_unset=True)
    if body.estado == "aprobado":
        data["activo"] = True
    elif body.estado == "rechazado":
        data["activo"] = False
    supabase.table("usuarios").update(data).eq("id", usuario_id).execute()
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
    registrar_log(current_user, "EDITAR", "USUARIOS", "usuario", str(usuario_id), detalle_log)
    return {"mensaje": "Usuario actualizado"}

@app.get("/admin/usuario-contratos/{usuario_id}")
def get_usuario_contratos(usuario_id: int, current_user=Depends(get_current_user)):
    result = supabase.table("usuario_contratos").select("contrato_id").eq("usuario_id", usuario_id).execute()
    ids = [r["contrato_id"] for r in result.data]
    if not ids:
        return []
    contratos = supabase.table("contratos").select("id, numero, contratista, interventoria, logo_contratista, logo_interventoria, fase").in_("id", ids).execute()
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

@app.post("/auth/refresh")
def refresh_token(current_user=Depends(get_current_user)):
    """Renueva el token JWT del usuario activo."""
    new_token = create_token({
        "sub": current_user.get("sub"),
        "email": current_user.get("email")
    })
    return {"access_token": new_token, "token_type": "bearer"}

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
    solicitud = supabase.table("password_reset_requests").select("*").eq("email", body.email).eq("estado", "autorizado").execute()
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
    for permiso in permisos:
        existe = supabase.table("permisos").select("id") \
            .eq("cargo_id", permiso.cargo_id).eq("funcion_id", permiso.funcion_id).execute()
        data = permiso.dict()
        if existe.data:
            supabase.table("permisos").update(data) \
                .eq("cargo_id", permiso.cargo_id).eq("funcion_id", permiso.funcion_id).execute()
        else:
            supabase.table("permisos").insert(data).execute()
    return {"mensaje": f"{len(permisos)} permisos guardados"}

# ─────────────────────────────────────────────
# LISTADO DE PRECIOS
# ─────────────────────────────────────────────

@app.get("/listado-precios/{contrato_id}")
def get_listado_precios(contrato_id: int, current_user=Depends(get_current_user)):
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
    registrar_log(current_user, "EXPORTAR", "PRECIOS", "listado_precios", str(contrato_id),
                  {"formato": "xlsx"})
    return {"ok": True}

# ─────────────────────────────────────────────
# PRESUPUESTO
# ─────────────────────────────────────────────

@app.get("/presupuesto/{contrato_id}")
@app.get("/presupuesto/{contrato_id}")
def get_presupuesto(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    tramo: Optional[str] = None,
    calzada: Optional[str] = None,
    papelera: bool = False,
    current_user=Depends(get_current_user)
):
    PAGE = 1000
    all_rows = []
    offset = 0
    while True:
        q = supabase.table("presupuesto").select("*").eq("contrato_id", contrato_id)
        if papelera:
            q = q.eq("dado_de_baja", True)
        else:
            q = q.eq("dado_de_baja", False)
        if capitulo: q = q.eq("capitulo", capitulo)
        if item:     q = q.eq("item", item)
        if tramo:    q = q.eq("tramo", tramo)
        if calzada:  q = q.eq("calzada", calzada)
        batch = q.order("capitulo").order("item").order("pk_id").range(offset, offset + PAGE - 1).execute().data
        all_rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return all_rows

@app.get("/presupuesto/{contrato_id}/filtros")
def get_filtros_presupuesto(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    tramo: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Devuelve valores únicos para filtros en cascada."""
    q = supabase.table("presupuesto").select("capitulo, item, tramo, calzada").eq("contrato_id", contrato_id)
    if capitulo: q = q.eq("capitulo", capitulo)
    if item:     q = q.eq("item", item)
    if tramo:    q = q.eq("tramo", tramo)
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
    return [{"capitulo": r["capitulo"], "costo_total": r["presupuesto"], "total_registros": r["registros"]} for r in caps]

@app.get("/presupuesto/{contrato_id}/items-lista")
def get_items_presupuesto(contrato_id: int, capitulo: str, current_user=Depends(get_current_user)):
    """Devuelve ítems de un capítulo con costo y cantidad agregados — sin traer registros individuales."""
    rows = []
    offset = 0
    while True:
        batch = supabase.table("presupuesto").select(
            "item, descripcion, und, vlr_unitario, cant_total, costo_directo, revisado"
        ).eq("contrato_id", contrato_id).eq("capitulo", capitulo).eq("dado_de_baja", False)\
         .range(offset, offset + 999).execute().data
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
    dims = {k: data.get(k) for k in ["area_long_nod", "ancho", "espesor"]}
    if any(v is not None for v in dims.values()):
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

    return {"mensaje": "Registro actualizado"}

@app.put("/presupuesto/item/{item_id}/dar-baja")
def dar_baja_presupuesto(item_id: int, current_user=Depends(get_current_user)):
    """Soft delete: marca el registro como dado de baja y renombra sus layers en CAD."""
    row = supabase.table("presupuesto").select(
        "layer_txt, layer_ent, x_label, y_label, contrato_id, ent_handle, txt_handle, rev_block_handle"
    ).eq("id", item_id).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    r = row[0]
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
    return {"ok": True}

@app.put("/presupuesto/item/{item_id}/restaurar")
def restaurar_presupuesto(item_id: int, current_user=Depends(get_current_user)):
    """Restaura un registro dado de baja: quita del_ de layers y reactiva en CAD."""
    row = supabase.table("presupuesto").select(
        "layer_txt, layer_ent, x_label, y_label, contrato_id, ent_handle, txt_handle, color_hex"
    ).eq("id", item_id).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    r = row[0]
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
    return {"ok": True}

@app.post("/presupuesto/{contrato_id}/bulk")
def bulk_presupuesto(contrato_id: int, items: List[PresupuestoRow], mode: str = "append", current_user=Depends(get_current_user)):
    """Importa registros de presupuesto. mode=replace elimina todo primero, mode=append agrega."""
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
        {"contrato_id": contrato_id, "mode": mode, "registros_insertados": insertados})
    return {"insertados": insertados}

@app.put("/presupuesto/{contrato_id}/bulk-recalcular")
def bulk_recalcular(contrato_id: int, body: PresupuestoBulkRecalc, current_user=Depends(get_current_user)):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No hay registros seleccionados")
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
        data  = {"cant_total": cant, "costo_directo": costo, "updated_at": "now()", **data_ancho}
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
    # Traer x_label, y_label, layer_txt para cad_queue
    rows_info = supabase.table("presupuesto").select("id, x_label, y_label, layer_txt, rev_block_handle"
        ).in_("id", body.ids).execute().data
    info_map = {r["id"]: r for r in rows_info}
    es_interventoria = current_user.get("rol_nombre") == "Interventoría"
    sellar = body.revisado == "Aprobado" and es_interventoria
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

# ─────────────────────────────────────────────
# CAD QUEUE
# ─────────────────────────────────────────────

@app.get("/cobro/{contrato_id}/exportar-capitulo")
def exportar_capitulo_excel(contrato_id: int, capitulo: str, current_user=Depends(get_current_user)):
    """Inicia generación del Excel en background y retorna job_id inmediatamente."""
    job_id = str(uuid.uuid4())
    _export_jobs[job_id] = {"estado": "procesando", "buf": None, "filename": ""}

    def generar():
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
            from openpyxl.drawing.image import Image as XLImage
            from collections import defaultdict
            import tempfile, os

            from supabase import create_client as _create_client
            sb = _create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
            def fetch_all(tabla, cols, filtros={}):
                acc, offset = [], 0
                while True:
                    q = sb.table(tabla).select(cols).eq("contrato_id", contrato_id).eq("capitulo", capitulo)
                    if tabla == "presupuesto":
                        q = q.eq("dado_de_baja", False)
                    for k, v in filtros.items():
                        q = q.eq(k, v)
                    # Reintento ante 502 de Supabase NANO
                    batch = []
                    for intento in range(3):
                        try:
                            batch = q.range(offset, offset + 999).execute().data
                            break
                        except Exception:
                            if intento < 2:
                                import time as _t; _t.sleep(2)
                            else:
                                raise
                    acc.extend(batch)
                    if len(batch) < 1000: break
                    offset += 1000
                return acc

            ppto_rows  = fetch_all("presupuesto", "*")
            cobro_rows = fetch_all("cobro", "*")

            contrato_info = sb.table("contratos").select(
                "numero, contratista, interventoria, logo_contratista, logo_interventoria"
            ).eq("id", contrato_id).single().execute().data or {}

            now_str     = datetime.now().strftime("%d/%m/%Y %H:%M")
            cap_nombre  = capitulo
            contratista = contrato_info.get("contratista", "")
            logo_cont_url = contrato_info.get("logo_contratista", "")
            logo_int_url  = contrato_info.get("logo_interventoria", "")

            COLOR_HEADER   = "1A3A5C"
            COLOR_TITLE    = "0D2137"
            COLOR_DEVOL    = "C0392B"
            COLOR_PORCOBR  = "1E8449"
            COLOR_HIST     = "7D6608"
            COLOR_TOTAL    = "154360"
            COLOR_ALT      = "EBF5FB"
            COLOR_DEVOL_BG = "FADBD8"
            COLOR_COBR_BG  = "D5F5E3"
            COLOR_APRO     = "1E8449"
            COLOR_PEND     = "D97706"
            COLOR_RECH     = "C0392B"

            def header_style(ws, row, col, val, bg=COLOR_HEADER, fg="FFFFFF", bold=True, size=10, wrap=False, halign="center"):
                c = ws.cell(row=row, column=col, value=val)
                c.font = Font(name="Arial", bold=bold, color=fg, size=size)
                c.fill = PatternFill("solid", fgColor=bg)
                c.alignment = Alignment(horizontal=halign, vertical="center", wrap_text=wrap)
                return c

            def data_cell(ws, row, col, val, bold=False, color="000000", bg=None, halign="right", fmt=None):
                c = ws.cell(row=row, column=col, value=val)
                c.font = Font(name="Arial", bold=bold, color=color, size=9)
                if bg: c.fill = PatternFill("solid", fgColor=bg)
                c.alignment = Alignment(horizontal=halign, vertical="center")
                if fmt: c.number_format = fmt
                return c

            def thin_border():
                s = Side(style="thin", color="CCCCCC")
                return Border(left=s, right=s, top=s, bottom=s)

            def apply_border(ws, min_row, max_row, min_col, max_col):
                for r in range(min_row, max_row + 1):
                    for c in range(min_col, max_col + 1):
                        ws.cell(r, c).border = thin_border()

            def set_col_widths(ws, widths):
                for i, w in enumerate(widths, 1):
                    ws.column_dimensions[get_column_letter(i)].width = w

            def add_logo(ws, url, anchor):
                if not url: return
                try:
                    r = req_http.get(url, timeout=4)
                    if r.status_code != 200: return
                    ext = ".png" if "png" in r.headers.get("content-type","") else ".jpg"
                    tmp = tempfile.mktemp(suffix=ext)
                    with open(tmp, "wb") as f: f.write(r.content)
                    img = XLImage(tmp)
                    img.height = 45; img.width = 110
                    ws.add_image(img, anchor)
                    try: os.remove(tmp)
                    except: pass
                except: pass

            def titulo_hoja(ws, titulo, subtitulo, ncols):
                ws.row_dimensions[1].height = 55
                ws.row_dimensions[2].height = 18
                ws.row_dimensions[3].height = 8
                ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
                c = ws.cell(1, 1, titulo)
                c.font = Font(name="Arial", bold=True, size=10, color="FFFFFF")
                c.fill = PatternFill("solid", fgColor=COLOR_TITLE)
                c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
                c2 = ws.cell(2, 1, subtitulo)
                c2.font = Font(name="Arial", size=9, color="7F8C8D")
                c2.alignment = Alignment(horizontal="center")
                add_logo(ws, logo_int_url,  "A1")
                add_logo(ws, logo_cont_url, f"{get_column_letter(ncols-1)}1")

            def color_revisado(estado):
                if estado == "Aprobado":  return COLOR_APRO
                if estado == "Pendiente": return COLOR_PEND
                if estado == "Rechazado": return COLOR_RECH
                return "888888"

            # ── Agregar por ítem ──────────────────────────────────────────────
            p_item = defaultdict(lambda: {"cant":0,"costo":0,"desc":"","vlr_unit":0,"revisados":[]})
            for r in ppto_rows:
                it = r.get("item","")
                p_item[it]["cant"]  += r.get("cant_total") or 0
                p_item[it]["costo"] += r.get("costo_directo") or 0
                if not p_item[it]["desc"]:
                    p_item[it]["desc"]     = r.get("descripcion","")
                    p_item[it]["vlr_unit"] = r.get("vlr_unitario") or 0
                rev = r.get("revisado") or "No Revisado"
                p_item[it]["revisados"].append(rev)

            c_item = defaultdict(lambda: {"cant":0,"costo":0,"desc":""})
            for r in cobro_rows:
                it = r.get("item","")
                c_item[it]["cant"]  += r.get("cantidad") or r.get("longitud") or 0
                c_item[it]["costo"] += r.get("costo_directo") or 0
                if not c_item[it]["desc"]:
                    c_item[it]["desc"] = r.get("descripcion","")

            for it in c_item:
                if not p_item[it]["desc"] and c_item[it]["desc"]:
                    p_item[it]["desc"] = c_item[it]["desc"]

            all_items = sorted(set(list(p_item.keys()) + list(c_item.keys())))

            def resumen_revisado(lista):
                """Devuelve el estado más crítico de la lista."""
                if not lista: return "Sin revisión"
                if "Rechazado" in lista:  return "Rechazado"
                if "Pendiente" in lista:  return "Pendiente"
                if all(r == "Aprobado" for r in lista): return "Aprobado"
                return "Parcial"

            def get_estado(p_cant, p_costo, c_cant, c_costo):
                if p_cant == 0 and p_costo == 0 and c_cant > 0:
                    return "Cobro Histórico", round(c_cant,4), round(c_costo,0)
                d_cant  = round(p_cant  - c_cant,  4)
                d_costo = round(p_costo - c_costo, 0)
                if d_costo < 0: return "Devolución", d_cant, d_costo
                return "Por cobrar", d_cant, d_costo

            wb = Workbook()

            # ── Hoja 1: Resumen Capítulo ──────────────────────────────────────
            ws1 = wb.active
            ws1.title = "Resumen Capítulo"
            ws1.sheet_view.showGridLines = False
            NCOLS1 = 13
            titulo_hoja(ws1, f"RESUMEN POR CAPÍTULO — {cap_nombre}", f"Generado: {now_str}   |   {contratista}", NCOLS1)
            hdrs1 = ["Ítem","Descripción","Cant. ClaraCore","Costo ClaraCore","Cant. Cobrada","Costo Cobrado","Δ Cantidad","Δ Costo","Estado","✅ Aprobado","🟡 Pendiente","🔴 Rechazado","⬜ No Revisado"]
            ws1.row_dimensions[4].height = 30
            for i, h in enumerate(hdrs1, 1):
                header_style(ws1, 4, i, h, wrap=True)

            row = 5
            tot_p_cant=tot_p_costo=tot_c_cant=tot_c_costo=tot_d_cant=tot_d_costo = 0
            tot_apro=tot_pend=tot_rech=tot_norev = 0
            for it in all_items:
                p = p_item[it]; c = c_item[it]
                estado, d_cant, d_costo = get_estado(p["cant"], p["costo"], c["cant"], c["costo"])
                if estado == "Cobro Histórico": continue
                # Calcular costos por estado de revisión
                apro = sum(r.get("costo_directo") or 0 for r in ppto_rows if r.get("item")==it and (r.get("revisado") or "No Revisado")=="Aprobado")
                pend = sum(r.get("costo_directo") or 0 for r in ppto_rows if r.get("item")==it and (r.get("revisado") or "No Revisado")=="Pendiente")
                rech = sum(r.get("costo_directo") or 0 for r in ppto_rows if r.get("item")==it and (r.get("revisado") or "No Revisado")=="Rechazado")
                norev= sum(r.get("costo_directo") or 0 for r in ppto_rows if r.get("item")==it and (r.get("revisado") or "No Revisado") not in ("Aprobado","Pendiente","Rechazado"))
                alt = (row % 2 == 0)
                bg = (COLOR_DEVOL_BG if estado=="Devolución" else COLOR_COBR_BG if alt else None)
                estado_color = COLOR_DEVOL if estado=="Devolución" else COLOR_PORCOBR
                data_cell(ws1, row, 1, it, bold=True, halign="left", bg=bg)
                data_cell(ws1, row, 2, p["desc"], halign="left", bg=bg)
                data_cell(ws1, row, 3, round(p["cant"],2), fmt="#,##0.00", bg=bg)
                data_cell(ws1, row, 4, round(p["costo"],0), fmt='$#,##0', bg=bg)
                data_cell(ws1, row, 5, round(c["cant"],2), fmt="#,##0.00", bg=bg)
                data_cell(ws1, row, 6, round(c["costo"],0), fmt='$#,##0', bg=bg)
                dc_c = data_cell(ws1, row, 7, round(d_cant,2), fmt="#,##0.00", bg=bg, bold=True)
                dc_c.font = Font(name="Arial", bold=True, size=9, color=COLOR_DEVOL if d_cant<0 else COLOR_PORCOBR)
                dd_c = data_cell(ws1, row, 8, round(d_costo,0), fmt='$#,##0', bg=bg, bold=True)
                dd_c.font = Font(name="Arial", bold=True, size=9, color=COLOR_DEVOL if d_costo<0 else COLOR_PORCOBR)
                est_c = data_cell(ws1, row, 9, estado, bold=True, halign="center", bg=bg)
                est_c.font = Font(name="Arial", bold=True, size=9, color=estado_color)
                ac = data_cell(ws1, row, 10, round(apro,0), fmt='$#,##0', bg="D5F5E3" if apro>0 else bg)
                ac.font = Font(name="Arial", size=9, color=COLOR_APRO if apro>0 else "888888")
                pc = data_cell(ws1, row, 11, round(pend,0), fmt='$#,##0', bg="FEF9E7" if pend>0 else bg)
                pc.font = Font(name="Arial", size=9, color=COLOR_PEND if pend>0 else "888888")
                rc = data_cell(ws1, row, 12, round(rech,0), fmt='$#,##0', bg=COLOR_DEVOL_BG if rech>0 else bg)
                rc.font = Font(name="Arial", size=9, color=COLOR_RECH if rech>0 else "888888")
                nc = data_cell(ws1, row, 13, round(norev,0), fmt='$#,##0', bg=bg)
                nc.font = Font(name="Arial", size=9, color="888888")
                tot_p_cant+=p["cant"]; tot_p_costo+=p["costo"]
                tot_c_cant+=c["cant"]; tot_c_costo+=c["costo"]
                tot_d_cant+=d_cant;    tot_d_costo+=d_costo
                tot_apro+=apro; tot_pend+=pend; tot_rech+=rech; tot_norev+=norev
                row += 1

            ws1.row_dimensions[row].height = 22
            for col in range(1, NCOLS1+1):
                ws1.cell(row,col).fill = PatternFill("solid", fgColor=COLOR_TOTAL)
                ws1.cell(row,col).font = Font(name="Arial", bold=True, color="FFFFFF", size=10)
                ws1.cell(row,col).alignment = Alignment(horizontal="center", vertical="center")
            ws1.cell(row,1,"TOTALES CAPÍTULO")
            ws1.cell(row,3,round(tot_p_cant,2)).number_format  = "#,##0.00"
            ws1.cell(row,4,round(tot_p_costo,0)).number_format = '$#,##0'
            ws1.cell(row,5,round(tot_c_cant,2)).number_format  = "#,##0.00"
            ws1.cell(row,6,round(tot_c_costo,0)).number_format = '$#,##0'
            ws1.cell(row,7,round(tot_d_cant,2)).number_format  = "#,##0.00"
            ws1.cell(row,8,round(tot_d_costo,0)).number_format = '$#,##0'
            ws1.cell(row,10,round(tot_apro,0)).number_format   = '$#,##0'
            ws1.cell(row,11,round(tot_pend,0)).number_format   = '$#,##0'
            ws1.cell(row,12,round(tot_rech,0)).number_format   = '$#,##0'
            ws1.cell(row,13,round(tot_norev,0)).number_format  = '$#,##0'
            apply_border(ws1, 4, row, 1, NCOLS1)
            set_col_widths(ws1, [10,42,14,16,14,16,12,16,14,14,14,14,14])
            ws1.freeze_panes = "A5"

            # ── Hojas por ítem ────────────────────────────────────────────────
            for it in all_items:
                p = p_item[it]; c = c_item[it]
                estado, _, _ = get_estado(p["cant"], p["costo"], c["cant"], c["costo"])
                if estado == "Cobro Histórico": continue

                # Agregar por pk_id incluyendo revisado
                p_pk = defaultdict(lambda: {"cant":0,"costo":0,"revisados":[]})
                c_pk = defaultdict(lambda: {"cant":0,"costo":0})
                for r in ppto_rows:
                    if r.get("item") != it: continue
                    pk = str(r.get("pk_id") or r.get("id_pol") or "S/N")
                    p_pk[pk]["cant"]  += r.get("cant_total") or 0
                    p_pk[pk]["costo"] += r.get("costo_directo") or 0
                    p_pk[pk]["revisados"].append(r.get("revisado") or "No Revisado")
                for r in cobro_rows:
                    if r.get("item") != it: continue
                    pk = str(r.get("pk_id") or "S/N")
                    c_pk[pk]["cant"]  += r.get("longitud") or r.get("cantidad") or 0
                    c_pk[pk]["costo"] += r.get("costo_directo") or 0

                all_pks = sorted(set(list(p_pk.keys()) + list(c_pk.keys())))
                porcobrar = [(pk,p_pk[pk],c_pk[pk]) for pk in all_pks
                             if round(p_pk[pk]["costo"]-c_pk[pk]["costo"],0)>=0
                             and not(p_pk[pk]["cant"]==0 and c_pk[pk]["cant"]>0)]
                devolucion= [(pk,p_pk[pk],c_pk[pk]) for pk in all_pks
                             if round(p_pk[pk]["costo"]-c_pk[pk]["costo"],0)<0
                             and not(p_pk[pk]["cant"]==0 and c_pk[pk]["cant"]>0)]

                sname = f"Item {it}"[:31]
                ws = wb.create_sheet(sname)
                ws.sheet_view.showGridLines = False
                NCOLS = 8
                desc_it = p_item[it]["desc"] or c_item[it].get("desc","")
                titulo_hoja(ws, f"ANÁLISIS DE COBRO — {it}  |  {desc_it}", f"{cap_nombre}   |   Generado: {now_str}", NCOLS)

                ws.row_dimensions[4].height = 20
                sum_hdrs = ["Cant. ClaraCore","Costo ClaraCore","Cant. Cobrada","Costo Cobrado","Δ Cantidad","Δ Costo"]
                for i, h in enumerate(sum_hdrs, 1):
                    header_style(ws, 4, i, h, bg="1A5276", size=9)
                vals = [round(p["cant"],2), round(p["costo"],0), round(c["cant"],2), round(c["costo"],0),
                        round(p["cant"]-c["cant"],2), round(p["costo"]-c["costo"],0)]
                fmts = ["#,##0.00","$#,##0","#,##0.00","$#,##0","#,##0.00","$#,##0"]
                for i,(v,f) in enumerate(zip(vals,fmts),1):
                    cc = ws.cell(5,i,v); cc.number_format=f
                    cc.font = Font(name="Arial",bold=True,size=10,color=COLOR_DEVOL if v<0 else COLOR_PORCOBR)
                    cc.alignment = Alignment(horizontal="center",vertical="center")

                def write_pk_section(ws, start_row, titulo_sec, datos, bg_sec):
                    ws.row_dimensions[start_row].height = 20
                    ws.merge_cells(start_row=start_row, start_column=1, end_row=start_row, end_column=NCOLS)
                    c = ws.cell(start_row,1,titulo_sec)
                    c.font = Font(name="Arial",bold=True,size=10,color="FFFFFF")
                    c.fill = PatternFill("solid", fgColor=COLOR_DEVOL if "DEVOLUCIÓN" in titulo_sec else COLOR_PORCOBR)
                    c.alignment = Alignment(horizontal="left",vertical="center")
                    start_row += 1
                    hdrs = ["PK_Id","Cant.ClaraCore","Costo ClaraCore","Cant.Cobrada","Costo Cobrado","Δ Cant","Δ Costo","Revisado"]
                    for i, h in enumerate(hdrs, 1):
                        header_style(ws, start_row, i, h, bg=COLOR_HEADER)
                    start_row += 1
                    tot_pc=tot_cc=tot_pco=tot_cco=tot_dc=tot_dco = 0
                    for pk, pp, cp in datos:
                        dc = round(pp["cant"]-cp["cant"],2)
                        dco= round(pp["costo"]-cp["costo"],0)
                        alt = (start_row % 2 == 0)
                        bg = bg_sec if alt else None
                        rev = resumen_revisado(pp.get("revisados",[]))
                        data_cell(ws, start_row, 1, pk, halign="left", bg=bg, bold=True)
                        data_cell(ws, start_row, 2, round(pp["cant"],2), fmt="#,##0.00", bg=bg)
                        data_cell(ws, start_row, 3, round(pp["costo"],0), fmt='$#,##0', bg=bg)
                        data_cell(ws, start_row, 4, round(cp["cant"],2), fmt="#,##0.00", bg=bg)
                        data_cell(ws, start_row, 5, round(cp["costo"],0), fmt='$#,##0', bg=bg)
                        cc2 = data_cell(ws, start_row, 6, dc, fmt="#,##0.00", bg=bg, bold=True)
                        cc2.font = Font(name="Arial",bold=True,size=9,color=COLOR_DEVOL if dc<0 else COLOR_PORCOBR)
                        cc3 = data_cell(ws, start_row, 7, dco, fmt='$#,##0', bg=bg, bold=True)
                        cc3.font = Font(name="Arial",bold=True,size=9,color=COLOR_DEVOL if dco<0 else COLOR_PORCOBR)
                        rev_c = data_cell(ws, start_row, 8, rev, halign="center", bg=bg, bold=True)
                        rev_c.font = Font(name="Arial",bold=True,size=9,color=color_revisado(rev))
                        tot_pc+=pp["cant"]; tot_cc+=cp["cant"]
                        tot_pco+=pp["costo"]; tot_cco+=cp["costo"]
                        tot_dc+=dc; tot_dco+=dco
                        start_row += 1
                    for col in range(1, NCOLS+1):
                        ws.cell(start_row,col).fill = PatternFill("solid",fgColor="2C3E50")
                        ws.cell(start_row,col).font = Font(name="Arial",bold=True,color="FFFFFF",size=9)
                        ws.cell(start_row,col).alignment = Alignment(horizontal="center",vertical="center")
                    ws.cell(start_row,1,"SUBTOTAL")
                    ws.cell(start_row,2,round(tot_pc,2)).number_format  = "#,##0.00"
                    ws.cell(start_row,3,round(tot_pco,0)).number_format = '$#,##0'
                    ws.cell(start_row,4,round(tot_cc,2)).number_format  = "#,##0.00"
                    ws.cell(start_row,5,round(tot_cco,0)).number_format = '$#,##0'
                    ws.cell(start_row,6,round(tot_dc,2)).number_format  = "#,##0.00"
                    ws.cell(start_row,7,round(tot_dco,0)).number_format = '$#,##0'
                    return start_row + 2

                cur_row = 7
                if porcobrar:
                    total_pc = sum(pp["costo"]-cp["costo"] for _,pp,cp in porcobrar)
                    cur_row = write_pk_section(ws, cur_row, f"POR COBRAR | Total: +${round(total_pc):,}", porcobrar, "D5F5E3")
                if devolucion:
                    total_dv = sum(pp["costo"]-cp["costo"] for _,pp,cp in devolucion)
                    cur_row = write_pk_section(ws, cur_row, f"DEVOLUCIÓN | Total: -${abs(round(total_dv)):,}", devolucion, "FADBD8")

                apply_border(ws, 4, cur_row-2, 1, NCOLS)
                set_col_widths(ws, [14,14,16,14,16,12,16,14])
                ws.freeze_panes = "A8"

            # ── Hoja Base Cobro ───────────────────────────────────────────────
            ws_c = wb.create_sheet("Base Cobro")
            if cobro_rows:
                cols_c = list(cobro_rows[0].keys())
                hdr_font = Font(name="Arial", bold=True, color="FFFFFF", size=8)
                hdr_fill = PatternFill("solid", fgColor=COLOR_HEADER)
                hdr_aln  = Alignment(horizontal="center", vertical="center")
                ws_c.append([str(h).upper() for h in cols_c])
                for ci in range(1, len(cols_c)+1):
                    ws_c.cell(1,ci).font=hdr_font; ws_c.cell(1,ci).fill=hdr_fill; ws_c.cell(1,ci).alignment=hdr_aln
                for row_d in cobro_rows:
                    ws_c.append([row_d.get(col) for col in cols_c])
                ws_c.freeze_panes = "A2"
                for i in range(1, len(cols_c)+1):
                    ws_c.column_dimensions[get_column_letter(i)].width = 13

            # ── Hoja ClaraCore Data ───────────────────────────────────────────
            ws_p = wb.create_sheet("ClaraCore Data")
            if ppto_rows:
                cols_p = list(ppto_rows[0].keys())
                ws_p.append([str(h).upper() for h in cols_p])
                for ci in range(1, len(cols_p)+1):
                    cell = ws_p.cell(1,ci)
                    cell.font = Font(name="Arial", bold=True, color="FFFFFF", size=8)
                    cell.fill = PatternFill("solid", fgColor=COLOR_TITLE)
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                for row_d in ppto_rows:
                    ws_p.append([row_d.get(col) for col in cols_p])
                ws_p.freeze_panes = "A2"
                for i in range(1, len(cols_p)+1):
                    ws_p.column_dimensions[get_column_letter(i)].width = 13

            # ── Guardar en memoria ────────────────────────────────────────────
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            import urllib.parse
            cap_safe = urllib.parse.quote(capitulo[:40])
            filename = f"ClaraCore_{cap_safe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            _export_jobs[job_id]["buf"]      = buf.getvalue()
            _export_jobs[job_id]["filename"] = filename
            _export_jobs[job_id]["estado"]   = "listo"

        except Exception as ex:
            _export_jobs[job_id]["estado"] = f"error: {str(ex)}"

    threading.Thread(target=generar, daemon=True).start()
    return {"job_id": job_id}


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
    rows = supabase.table("cad_queue").select("*") \
        .eq("contrato_id", contrato_id).eq("estado", "pendiente") \
        .order("id").limit(50).execute().data
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

# ─────────────────────────────────────────────
# COBRO
# ─────────────────────────────────────────────

@app.get("/cobro/{contrato_id}/pkid-tabla")
def pkid_tabla(contrato_id: int, capitulo: str = None, item: str = None, current_user=Depends(get_current_user)):
    """Tabla comparativa detallada por PK_ID con cantidades"""
    try:
        q_c = supabase.table("cobro").select("pk_id, costo_directo, longitud, cantidad").eq("contrato_id", contrato_id)
        q_p = supabase.table("presupuesto").select("pk_id, cant_total, costo_directo, descripcion").eq("contrato_id", contrato_id).eq("dado_de_baja", False)
        if item:
            q_c = q_c.eq("item", item)
            q_p = q_p.eq("item", item)
        elif capitulo:
            q_c = q_c.eq("capitulo", capitulo)
            q_p = q_p.eq("capitulo", capitulo)
        def paginate(q):
            all_rows = []; offset = 0
            while True:
                batch = q.range(offset, offset + 999).execute().data or []
                all_rows.extend(batch)
                if len(batch) < 1000: break
                offset += 1000
            return all_rows
        cobros = paginate(q_c)
        ppto   = paginate(q_p)
        agg_p = {}
        for r in ppto:
            k = r.get("pk_id") or "(sin pk)"
            if k not in agg_p: agg_p[k] = {"cant": 0.0, "costo": 0.0, "desc": ""}
            agg_p[k]["cant"]  += float(r.get("cant_total") or 0)
            agg_p[k]["costo"] += float(r.get("costo_directo") or 0)
            if not agg_p[k]["desc"] and r.get("descripcion"):
                agg_p[k]["desc"] = r.get("descripcion", "")
        agg_c = {}
        for r in cobros:
            k = r.get("pk_id") or "(sin pk)"
            if k not in agg_c: agg_c[k] = {"cant": 0.0, "costo": 0.0}
            agg_c[k]["cant"]  += float(r.get("cantidad") or r.get("longitud") or 0)
            agg_c[k]["costo"] += float(r.get("costo_directo") or 0)
        keys = sorted(set(list(agg_p.keys()) + list(agg_c.keys())), key=lambda x: str(x))
        rows = []
        for k in keys:
            p = agg_p.get(k, {"cant": 0.0, "costo": 0.0})
            c = agg_c.get(k, {"cant": 0.0, "costo": 0.0})
            rows.append({"pk_id": k, "cant_ppto": p["cant"], "costo_ppto": p["costo"],
                         "cant_sicoe": c["cant"], "costo_sicoe": c["costo"],
                         "delta_cant": round(p["cant"] - c["cant"], 2),
                         "delta_costo": round(p["costo"] - c["costo"], 0),
                         "descripcion": p.get("desc", "")})
        por_cobrar = sum(r["delta_costo"] for r in rows if r["delta_costo"] > 0)
        devolucion = sum(abs(r["delta_costo"]) for r in rows if r["delta_costo"] < 0)
        # Descripción del ítem — consulta dedicada, no depende de los polígonos
        desc_item = ""
        if item:
            d = supabase.table("presupuesto").select("descripcion").eq("contrato_id", contrato_id).eq("item", item).not_.is_("descripcion", "null").limit(1).execute().data
            if d: desc_item = d[0].get("descripcion") or ""
        return {"rows": rows, "por_cobrar": por_cobrar, "devolucion": devolucion, "descripcion_item": desc_item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/cobro/{contrato_id}/pkid-detalle")
def pkid_detalle(contrato_id: int, pk_id: str = None, item: str = None, capitulo: str = None, current_user=Depends(get_current_user)):
    """Filas individuales de ppto y cobro para un PK_ID específico."""
    try:
        q_p = supabase.table("presupuesto").select(
            "id_pol, no_inicio, no_final, cant_total, costo_directo, descripcion, item"
        ).eq("contrato_id", contrato_id).eq("dado_de_baja", False)
        q_c = supabase.table("cobro").select(
            "registro, tramo_inicio, tramo_final, cantidad, longitud, costo_directo, descripcion, item, acta, calzada"
        ).eq("contrato_id", contrato_id)
        if pk_id:
            q_p = q_p.eq("pk_id", pk_id)
            q_c = q_c.eq("pk_id", pk_id)
        if item:
            q_p = q_p.eq("item", item)
            q_c = q_c.eq("item", item)
        elif capitulo:
            q_p = q_p.eq("capitulo", capitulo)
            q_c = q_c.eq("capitulo", capitulo)
        ppto  = q_p.execute().data or []
        cobro = q_c.execute().data or []
        cant_ppto  = sum(float(r.get("cant_total") or 0) for r in ppto)
        costo_ppto = sum(float(r.get("costo_directo") or 0) for r in ppto)
        cant_cobro  = sum(float(r.get("cantidad") or r.get("longitud") or 0) for r in cobro)
        costo_cobro = sum(float(r.get("costo_directo") or 0) for r in cobro)
        return {
            "ppto":  ppto,
            "cobro": cobro,
            "totales": {
                "cant_ppto":   round(cant_ppto, 2),
                "costo_ppto":  round(costo_ppto, 0),
                "cant_cobro":  round(cant_cobro, 2),
                "costo_cobro": round(costo_cobro, 0),
                "delta_cant":  round(cant_ppto - cant_cobro, 2),
                "delta_costo": round(costo_ppto - costo_cobro, 0),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/cobro/{contrato_id}/drill")
def drill_comparativo(contrato_id: int, capitulo: str = None, item: str = None, current_user=Depends(get_current_user)):
    """Drill comparativo presupuesto vs cobro por capitulo→item→pk_id"""
    def fetch_filtered(tabla, dest, capitulo, item):
        acc, offset = [], 0
        while True:
            q = supabase.table(tabla).select(dest).eq("contrato_id", contrato_id)
            if capitulo: q = q.eq("capitulo", capitulo)
            if item:     q = q.eq("item", item)
            batch = q.range(offset, offset + 999).execute().data
            acc.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
        return acc

    cobros = fetch_filtered("cobro", "capitulo, item, pk_id, costo_directo, cantidad, longitud, descripcion", capitulo, item)
    ppto_q = supabase.table("presupuesto").select("capitulo, item, pk_id, costo_directo, cant_total, descripcion").eq("contrato_id", contrato_id).eq("dado_de_baja", False)
    if capitulo: ppto_q = ppto_q.eq("capitulo", capitulo)
    if item:     ppto_q = ppto_q.eq("item", item)
    ppto = []; offset = 0
    while True:
        batch = ppto_q.range(offset, offset + 999).execute().data
        ppto.extend(batch)
        if len(batch) < 1000: break
        offset += 1000

    campo = "pk_id" if (capitulo and item) else ("item" if capitulo else "capitulo")

    agg_p = {}; agg_c = {}; agg_p_cant = {}; agg_c_cant = {}; desc_map = {}
    for r in ppto:
        k = r.get(campo) or "(sin valor)"
        agg_p[k] = agg_p.get(k, 0) + (r.get("costo_directo") or 0)
        agg_p_cant[k] = agg_p_cant.get(k, 0) + (r.get("cant_total") or 0)
        if campo == "item" and r.get("descripcion") and k not in desc_map:
            desc_map[k] = r.get("descripcion", "")
    for r in cobros:
        k = r.get(campo) or "(sin valor)"
        agg_c[k] = agg_c.get(k, 0) + (r.get("costo_directo") or 0)
        agg_c_cant[k] = agg_c_cant.get(k, 0) + (r.get("cantidad") or r.get("longitud") or 0)
        if campo == "item" and r.get("descripcion") and k not in desc_map:
            desc_map[k] = r.get("descripcion", "")

    keys = sorted(set(list(agg_p.keys()) + list(agg_c.keys())), key=lambda x: str(x))
    result = []
    for k in keys:
        p = agg_p.get(k, 0); c = agg_c.get(k, 0)
        result.append({"nombre": k, "descripcion": desc_map.get(k, ""), "presupuesto": p, "cobrado": c, "delta": p - c, "pct": round(c/p*100,1) if p else 0, "cant_ppto": agg_p_cant.get(k, 0), "cant_cobro": agg_c_cant.get(k, 0)})
    return {"campo": campo, "items": result}

@app.get("/cobro/{contrato_id}/analisis-items")
def get_analisis_items(contrato_id: int, current_user=Depends(get_current_user)):
    """Todos los ítems con comparativo ppto vs cobro para análisis de desviaciones"""
    cobros, ppto = [], []
    for tabla, dest in [
        ("cobro", "capitulo, item, costo_directo, cantidad, longitud"),
        ("presupuesto", "capitulo, item, descripcion, costo_directo, cant_total")
    ]:
        acc, offset = [], 0
        while True:
            batch = supabase.table(tabla).select(dest).eq("contrato_id", contrato_id).range(offset, offset + 999).execute().data
            acc.extend(batch)
            if len(batch) < 1000: break
            offset += 1000
        if tabla == "cobro": cobros = acc
        else: ppto = acc

    agg_p = {}; agg_c = {}; agg_p_cant = {}; agg_c_cant = {}; desc_map = {}; cap_map = {}
    for r in ppto:
        k = r.get("item") or "(sin item)"
        agg_p[k] = agg_p.get(k, 0) + (r.get("costo_directo") or 0)
        agg_p_cant[k] = agg_p_cant.get(k, 0) + (r.get("cant_total") or 0)
        if r.get("descripcion") and k not in desc_map: desc_map[k] = r["descripcion"]
        if k not in cap_map: cap_map[k] = r.get("capitulo") or ""
    for r in cobros:
        k = r.get("item") or "(sin item)"
        agg_c[k] = agg_c.get(k, 0) + (r.get("costo_directo") or 0)
        agg_c_cant[k] = agg_c_cant.get(k, 0) + (r.get("cantidad") or r.get("longitud") or 0)

    keys2 = sorted(set(list(agg_p.keys()) + list(agg_c.keys())))
    result2 = []
    for k in keys2:
        p = agg_p.get(k, 0); c = agg_c.get(k, 0)
        result2.append({
            "nombre": k, "capitulo": cap_map.get(k, ""), "descripcion": desc_map.get(k, ""),
            "presupuesto": p, "cobrado": c, "delta": p - c,
            "pct": round(c / p * 100, 1) if p else 0,
            "cant_ppto": agg_p_cant.get(k, 0), "cant_cobro": agg_c_cant.get(k, 0),
        })
    return {"items": result2}

@app.get("/presupuesto/{contrato_id}/analisis-liquidacion")
def get_analisis_liquidacion(contrato_id: int, nivel: str = "item", current_user=Depends(get_current_user)):
    """Compara cobro vs cantidades recalculadas (tipo_ejecucion='O') para fase de liquidación."""
    cobros, recalc = [], []
    # Cobro: toda la tabla cobro del contrato
    offset = 0
    while True:
        batch = supabase.table("cobro").select("capitulo, item, costo_directo, cantidad, longitud").eq("contrato_id", contrato_id).range(offset, offset + 999).execute().data
        cobros.extend(batch)
        if len(batch) < 1000: break
        offset += 1000
    # Recalculado: presupuesto con tipo_ejecucion = 'O' (Obra ejecutada)
    offset = 0
    while True:
        batch = supabase.table("presupuesto").select("capitulo, item, descripcion, costo_directo, cant_total").eq("contrato_id", contrato_id).eq("tipo_ejecucion", "Obra Ejecutada").range(offset, offset + 999).execute().data
        recalc.extend(batch)
        if len(batch) < 1000: break
        offset += 1000

    agg_r = {}; agg_c = {}; agg_r_cant = {}; agg_c_cant = {}; desc_map = {}; cap_map = {}
    for r in recalc:
        k = r.get("item") or "(sin item)"
        agg_r[k] = agg_r.get(k, 0) + (r.get("costo_directo") or 0)
        agg_r_cant[k] = agg_r_cant.get(k, 0) + (r.get("cant_total") or 0)
        if r.get("descripcion") and k not in desc_map: desc_map[k] = r["descripcion"]
        if k not in cap_map: cap_map[k] = r.get("capitulo") or ""
    for r in cobros:
        k = r.get("item") or "(sin item)"
        agg_c[k] = agg_c.get(k, 0) + (r.get("costo_directo") or 0)
        agg_c_cant[k] = agg_c_cant.get(k, 0) + (r.get("cantidad") or r.get("longitud") or 0)
        if k not in cap_map and r.get("capitulo"): cap_map[k] = r["capitulo"]

    # Si nivel=capitulo, re-agregar por capítulo
    if nivel == "capitulo":
        cap_r = {}; cap_c = {}; cap_r_cant = {}; cap_c_cant = {}; cap_desc = {}
        for k in agg_r:
            cap = cap_map.get(k, "(sin capítulo)")
            cap_r[cap] = cap_r.get(cap, 0) + agg_r[k]
            cap_r_cant[cap] = cap_r_cant.get(cap, 0) + agg_r_cant.get(k, 0)
        for k in agg_c:
            cap = cap_map.get(k, "(sin capítulo)")
            cap_c[cap] = cap_c.get(cap, 0) + agg_c[k]
            cap_c_cant[cap] = cap_c_cant.get(cap, 0) + agg_c_cant.get(k, 0)
        agg_r = cap_r; agg_c = cap_c; agg_r_cant = cap_r_cant; agg_c_cant = cap_c_cant
        cap_map = {k: k for k in agg_r}

    UMBRAL = 20_000_000
    keys = sorted(set(list(agg_r.keys()) + list(agg_c.keys())))
    result = []
    for k in keys:
        r_val = agg_r.get(k, 0); c_val = agg_c.get(k, 0)
        r_cant = agg_r_cant.get(k, 0); c_cant = agg_c_cant.get(k, 0)
        delta_costo = r_val - c_val
        if r_cant == 0 and c_val > 0:
            categoria = "EJECUCION"
        elif c_val > r_val and (c_val - r_val) > UMBRAL:
            categoria = "SUPERCOBRO"
        elif c_val > r_val and (c_val - r_val) <= UMBRAL:
            categoria = "DEVOLUCION"
        elif r_val > c_val:
            categoria = "POR_COBRAR"
        else:
            categoria = "EQUILIBRIO"
        cap_val = k if nivel == "capitulo" else cap_map.get(k, "")
        result.append({
            "nombre": k, "capitulo": cap_val, "descripcion": desc_map.get(k, ""),
            "recalculado": r_val, "cobrado": c_val, "delta_costo": delta_costo,
            "pct": round(c_val / r_val * 100, 1) if r_val else 0,
            "cant_recalc": r_cant, "cant_cobro": c_cant, "delta_cant": r_cant - c_cant,
            "categoria": categoria,
        })
    return {"items": result}

@app.get("/cobro/{contrato_id}/pkid-colores-liquidacion")
def get_pkid_colores_liquidacion(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Colores PK_ID: cobro vs recalculado (tipo_ejecucion='O') para mini-mapa liquidación."""
    q_c = supabase.table("cobro").select("pk_id, costo_directo").eq("contrato_id", contrato_id)
    q_r = supabase.table("presupuesto").select("pk_id, costo_directo").eq("contrato_id", contrato_id).eq("tipo_ejecucion", "obra ejecutada")
    if item:
        q_c = q_c.eq("item", item)
        q_r = q_r.eq("item", item)
    elif capitulo:
        q_c = q_c.eq("capitulo", capitulo)
        q_r = q_r.eq("capitulo", capitulo)
    cobro = q_c.execute().data
    recalc = q_r.execute().data
    cobro_agg = {}
    for r in cobro:
        k = str(r.get("pk_id") or "").strip()
        if k: cobro_agg[k] = cobro_agg.get(k, 0) + (r.get("costo_directo") or 0)
    recalc_agg = {}
    for r in recalc:
        k = str(r.get("pk_id") or "").strip()
        if k: recalc_agg[k] = recalc_agg.get(k, 0) + (r.get("costo_directo") or 0)
    UMBRAL = 20_000_000
    result = {}
    for pk in set(list(cobro_agg.keys()) + list(recalc_agg.keys())):
        c = cobro_agg.get(pk, 0)
        r2 = recalc_agg.get(pk, 0)
        if r2 == 0 and c > 0:
            categoria = "EJECUCION"
        elif c > r2 and (c - r2) > UMBRAL:
            categoria = "SUPERCOBRO"
        elif c > r2 and (c - r2) <= UMBRAL:
            categoria = "DEVOLUCION"
        elif r2 > c:
            categoria = "POR_COBRAR"
        else:
            categoria = "EQUILIBRIO"
        result[pk] = {"cobrado": c, "recalculado": r2, "pct": round(c / r2 * 100, 1) if r2 else 0, "categoria": categoria}
    return result
def get_cobro(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    acta: Optional[int] = None,
    calzada: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    q = supabase.table("cobro").select("*").eq("contrato_id", contrato_id)
    if capitulo: q = q.eq("capitulo", capitulo)
    if item:     q = q.eq("item", item)
    if acta:     q = q.eq("acta", acta)
    if calzada:  q = q.eq("calzada", calzada)
    PAGE = 1000
    all_rows = []
    offset = 0
    while True:
        batch = q.order("acta").order("capitulo").order("item").range(offset, offset + PAGE - 1).execute().data
        all_rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return all_rows

@app.get("/cobro/{contrato_id}/chart")
def get_cobro_chart(
    contrato_id: int,
    nivel: str = "capitulo",
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Devuelve datos agregados para gráficos con fallback directo a tabla cobro."""
    try:
        if nivel == "capitulo":
            raw = supabase.table("vista_cobro_por_capitulo_detalle").select("*").eq("contrato_id", contrato_id).execute().data
            rows = [{"capitulo": r.get("capitulo"), "costo": r.get("cobrado") or r.get("costo") or 0, "count": r.get("count", 0)} for r in raw]
        elif nivel == "item":
            q = supabase.table("vista_cobro_por_item").select("*").eq("contrato_id", contrato_id)
            if capitulo: q = q.eq("capitulo", capitulo)
            rows = q.execute().data
            rows = [{"item": r.get("item"), "descripcion": r.get("descripcion"), "costo": r.get("cobrado") or r.get("costo") or 0, "count": r.get("count", 0)} for r in rows]
        elif nivel == "acta":
            raw = supabase.table("vista_cobro_por_acta").select("*").eq("contrato_id", contrato_id).execute().data
            rows = [{"acta": r.get("acta"), "costo": r.get("cobrado") or r.get("costo") or 0, "count": r.get("count", 0)} for r in raw]
        elif nivel == "calzada":
            raw = supabase.table("vista_cobro_por_calzada").select("*").eq("contrato_id", contrato_id).execute().data
            rows = [{"calzada": r.get("calzada"), "costo": r.get("cobrado") or r.get("costo") or 0, "count": r.get("count", 0)} for r in raw]
        else:
            rows = []
    except Exception:
        raw = []; offset = 0
        sel = "item, descripcion, capitulo, costo_directo" if nivel == "item" else f"{nivel}, costo_directo"
        q_fb = supabase.table("cobro").select(sel).eq("contrato_id", contrato_id)
        if capitulo and nivel == "item":
            q_fb = q_fb.eq("capitulo", capitulo)
        while True:
            batch = q_fb.range(offset, offset+999).execute().data
            raw.extend(batch)
            if len(batch) < 1000: break
            offset += 1000
        agg = {}
        for r in raw:
            k = r.get(nivel) or "(sin valor)"
            if k not in agg: agg[k] = {nivel: k, "costo": 0, "count": 0}
            agg[k]["costo"] += r.get("costo_directo") or 0
            agg[k]["count"] += 1
        rows = list(agg.values())
    return sorted(rows, key=lambda r: str(r.get(nivel) or ""))

@app.get("/cobro/{contrato_id}/resumen")
def get_resumen_cobro(contrato_id: int, current_user=Depends(get_current_user)):
    def _res():      return supabase.table("vista_cobro_resumen").select("*").eq("contrato_id", contrato_id).execute().data
    def _acta():     return supabase.table("vista_cobro_por_acta").select("*").eq("contrato_id", contrato_id).execute().data
    def _cap():      return supabase.table("vista_cobro_por_capitulo").select("*").eq("contrato_id", contrato_id).execute().data
    def _ppto():     return supabase.table("vista_ppto_por_capitulo").select("*").eq("contrato_id", contrato_id).execute().data
    res      = supabase_execute(_res)
    por_acta = supabase_execute(_acta)
    por_cap  = supabase_execute(_cap)
    total    = res[0].get("total_cobrado", 0) if res else 0
    actas    = sorted(set(r["acta"] for r in por_acta if r.get("acta")))
    # Comparativo por capítulo
    ppto_caps = {r["capitulo"]: r["presupuesto"] for r in supabase_execute(_ppto)}
    cobro_caps = {r["capitulo"]: r.get("cobrado") or r.get("costo") or 0 for r in por_cap}
    caps = sorted(set(list(ppto_caps.keys()) + list(cobro_caps.keys())))
    comparativo = [{"capitulo": c, "presupuesto": ppto_caps.get(c,0), "cobrado": cobro_caps.get(c,0),
                    "delta": ppto_caps.get(c,0)-cobro_caps.get(c,0),
                    "consumo_pct": round(cobro_caps.get(c,0)/ppto_caps.get(c,0)*100,1) if ppto_caps.get(c,0) else 0}
                   for c in caps]
    ppto_total = sum(ppto_caps.values())
    return {
        "total_presupuesto": ppto_total,
        "total_cobrado": total,
        "delta": ppto_total - total,
        "consumo_pct": round(total/ppto_total*100,1) if ppto_total else 0,
        "actas": actas,
        "comparativo_capitulos": comparativo,
        "por_acta": [{"acta": r["acta"], "cobrado": r.get("cobrado") or r.get("costo") or 0} for r in por_acta]
    }

@app.get("/cobro/{contrato_id}/pkid-colores")
def get_pkid_colores(contrato_id: int, current_user=Depends(get_current_user)):
    """Devuelve % cobro por PK_ID para colorear el plano semáforo."""
    cobro  = supabase.table("cobro").select("pk_id, costo_directo").eq("contrato_id", contrato_id).execute().data
    ppto   = supabase.table("presupuesto").select("pk_id, costo_directo").eq("contrato_id", contrato_id).execute().data
    cobro_agg = {}
    for r in cobro:
        k = str(r.get("pk_id") or "").strip()
        if k: cobro_agg[k] = cobro_agg.get(k, 0) + (r.get("costo_directo") or 0)
    ppto_agg = {}
    for r in ppto:
        k = str(r.get("pk_id") or "").strip()
        if k: ppto_agg[k] = ppto_agg.get(k, 0) + (r.get("costo_directo") or 0)
    result = {}
    for pk in set(list(cobro_agg.keys()) + list(ppto_agg.keys())):
        c = cobro_agg.get(pk, 0)
        p = ppto_agg.get(pk, 0)
        result[pk] = {
            "cobrado": c,
            "presupuesto": p,
            "pct": round(c / p * 100, 1) if p else 0,
            "sobrecosto": c > p
        }
    return result

@app.get("/presupuesto/{contrato_id}/pkid-colores")
def get_ppto_pkid_colores(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Colores PK_ID para el mini-mapa del módulo presupuesto."""
    q = supabase.table("presupuesto").select("pk_id, costo_directo").eq("contrato_id", contrato_id)
    if item:     q = q.eq("item", item)
    elif capitulo: q = q.eq("capitulo", capitulo)
    rows = q.execute().data
    agg = {}
    for r in rows:
        k = str(r.get("pk_id") or "").strip()
        if k: agg[k] = agg.get(k, 0) + (r.get("costo_directo") or 0)
    if not agg: return {}
    max_costo = max(agg.values()) or 1
    result = {}
    for pk, costo in agg.items():
        pct = round(costo / max_costo * 100, 1)
        result[pk] = {"costo": costo, "pct": pct, "activo": True}
    return result

@app.get("/cobro/{contrato_id}/pkid-colores-drill")
def get_pkid_colores_drill(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """Colores PK_ID filtrados por capítulo/ítem para el mini-mapa del dashboard."""
    q_c = supabase.table("cobro").select("pk_id, costo_directo").eq("contrato_id", contrato_id)
    q_p = supabase.table("presupuesto").select("pk_id, costo_directo").eq("contrato_id", contrato_id)
    if item:
        q_c = q_c.eq("item", item)
        q_p = q_p.eq("item", item)
    elif capitulo:
        q_c = q_c.eq("capitulo", capitulo)
        q_p = q_p.eq("capitulo", capitulo)
    try:
        cobro = q_c.execute().data
    except Exception:
        cobro = []
    try:
        ppto = q_p.execute().data
    except Exception:
        ppto = []
    cobro_agg = {}
    for r in cobro:
        k = str(r.get("pk_id") or "").strip()
        if k: cobro_agg[k] = cobro_agg.get(k, 0) + (r.get("costo_directo") or 0)
    ppto_agg = {}
    for r in ppto:
        k = str(r.get("pk_id") or "").strip()
        if k: ppto_agg[k] = ppto_agg.get(k, 0) + (r.get("costo_directo") or 0)
    result = {}
    for pk in set(list(cobro_agg.keys()) + list(ppto_agg.keys())):
        c = cobro_agg.get(pk, 0)
        p = ppto_agg.get(pk, 0)
        result[pk] = {
            "cobrado": c,
            "presupuesto": p,
            "pct": round(c / p * 100, 1) if p else 0,
            "sobrecosto": c > p
        }
    return result

@app.get("/cobro/{contrato_id}/filtros")
def get_filtros_cobro(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    q = supabase.table("cobro").select("capitulo, item, acta, calzada").eq("contrato_id", contrato_id)
    if capitulo: q = q.eq("capitulo", capitulo)
    if item:     q = q.eq("item", item)
    rows = q.execute().data
    return {
        "capitulos": sorted(set(r["capitulo"] for r in rows if r.get("capitulo"))),
        "items":     sorted(set(r["item"]     for r in rows if r.get("item"))),
        "actas":     sorted(set(r["acta"]     for r in rows if r.get("acta"))),
        "calzadas":  sorted(set(r["calzada"]  for r in rows if r.get("calzada"))),
    }

@app.delete("/cobro/{contrato_id}/clear")
def clear_cobro(contrato_id: int, current_user=Depends(get_current_user)):
    # Borrar en batches de 1000 para no timeout en Supabase free tier
    while True:
        ids = supabase.table("cobro").select("id").eq("contrato_id", contrato_id).limit(1000).execute().data
        if not ids:
            break
        id_list = [r["id"] for r in ids]
        supabase.table("cobro").delete().in_("id", id_list).execute()
    return {"ok": True}

@app.post("/cobro/{contrato_id}/bulk")
def bulk_cobro(contrato_id: int, items: List[CobroRow], current_user=Depends(get_current_user)):
    if not items:
        return {"insertados": 0}
    BATCH = 500
    all_rows = []
    for row in items:
        d = {}
        for k, v in row.dict().items():
            if v is None:
                continue
            if k == "fecha":
                continue
            # Limpiar saltos de línea en campos de texto
            if isinstance(v, str):
                v = v.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ').strip()
                v = ' '.join(v.split())  # colapsar espacios múltiples
            d[k] = v
        d["contrato_id"] = contrato_id
        all_rows.append(d)
    insertados = 0
    for i in range(0, len(all_rows), BATCH):
        try:
            supabase.table("cobro").insert(all_rows[i:i+BATCH]).execute()
            insertados += len(all_rows[i:i+BATCH])
        except Exception:
            # Si falla el batch, insertar fila por fila para no perder todo
            for row in all_rows[i:i+BATCH]:
                try:
                    supabase.table("cobro").insert(row).execute()
                    insertados += 1
                except Exception:
                    pass  # omitir fila problemática y continuar
    registrar_log(current_user, "IMPORTAR", "COBRO", "cobro_bulk", str(contrato_id),
        {"contrato_id": contrato_id, "registros_insertados": insertados})    
    return {"insertados": insertados}


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

@app.get("/logs")
def get_logs(
    usuario_id:   Optional[int] = None,
    modulo:       Optional[str] = None,
    accion:       Optional[str] = None,
    fecha_desde:  Optional[str] = None,
    fecha_hasta:  Optional[str] = None,
    limit:        int = 100,
    offset:       int = 0,
    current_user=Depends(get_current_user)
):
    """Consulta logs con filtros. Solo para Desarrollador y Administrador."""
    q = supabase.table("logs").select("*").order("created_at", desc=True)
    if usuario_id:  q = q.eq("usuario_id", usuario_id)
    if modulo:      q = q.eq("modulo", modulo)
    if accion:      q = q.eq("accion", accion)
    if fecha_desde: q = q.gte("created_at", fecha_desde)
    if fecha_hasta: q = q.lte("created_at", fecha_hasta + "T23:59:59")
    q = q.range(offset, offset + limit - 1)
    return q.execute().data

@app.get("/logs/usuarios-lista")
def get_logs_usuarios(current_user=Depends(get_current_user)):
    """Lista de usuarios que tienen logs — para el selector de filtros."""
    rows = supabase.table("logs").select("usuario_id, usuario_nombre, cargo_nombre").execute().data
    vistos = {}
    for r in rows:
        uid = r.get("usuario_id")
        if uid and uid not in vistos:
            vistos[uid] = {"id": uid, "nombre": r.get("usuario_nombre",""), "cargo": r.get("cargo_nombre","")}
    return list(vistos.values())

@app.get("/logs/entidad/{entidad_tipo}/{entidad_id}")
def get_logs_entidad(entidad_tipo: str, entidad_id: str, current_user=Depends(get_current_user)):
    """Historial completo de una entidad específica."""
    return supabase.table("logs").select("*") \
        .eq("entidad_tipo", entidad_tipo) \
        .eq("entidad_id", entidad_id) \
        .order("created_at", desc=False) \
        .execute().data

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
    current_user=Depends(get_current_user)
):
    """Notificaciones recibidas por el usuario actual."""
    uid = int(current_user.get("sub", 0))
    q = supabase.table("notificaciones").select("*") \
        .eq("destinatario_id", uid) \
        .order("created_at", desc=True)
    if solo_no_leidas:
        q = q.eq("leido", False)
    q = q.range(offset, offset + limit - 1)
    return q.execute().data

@app.get("/notificaciones/enviadas")
def get_notificaciones_enviadas(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user)
):
    """Notificaciones enviadas por el usuario actual."""
    uid = int(current_user.get("sub", 0))
    return supabase.table("notificaciones").select("*") \
        .eq("remitente_id", uid) \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1) \
        .execute().data

@app.get("/notificaciones/no-leidas-count")
def get_no_leidas_count(current_user=Depends(get_current_user)):
    """Conteo de notificaciones no leídas — solo mensajes raíz."""
    uid = int(current_user.get("sub", 0))
    try:
        result = supabase.table("notificaciones").select("id", count="exact") \
            .eq("destinatario_id", uid) \
            .eq("leido", False) \
            .is_("padre_id", "null") \
            .execute()
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
    rows = supabase.table("subcontratistas").select("*").eq("contrato_id", contrato_id).order("razon_social").execute().data
    return rows or []

@app.post("/subcontratistas/{contrato_id}")
def crear_subcontratista(contrato_id: int, body: SubcontratistaCreate, current_user=Depends(get_current_user)):
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
            .order("created_at", desc=True).execute().data
    rows = supabase_execute(_q)
    for r in rows:
        sub = r.pop("subcontratistas", None)
        r["subcontratista_nombre"] = sub["razon_social"] if sub else None
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

@app.get("/sicoe-obra/{contrato_id}/inspectores")
def listar_inspectores(contrato_id: int, current_user=Depends(get_current_user)):
    def _q():
        return supabase.table("usuarios")\
            .select("id, nombre, apellidos, cargo_id, rol_id")\
            .eq("contrato_id", contrato_id)\
            .eq("estado", "aprobado").execute().data
    rows = supabase_execute(_q)
    cargos = {c["id"]: c["nombre"] for c in supabase.table("cargos").select("id, nombre").execute().data}
    roles = {r["id"]: r["nombre"] for r in supabase.table("roles").select("id, nombre").execute().data}
    result = []
    for u in rows:
        cargo_nombre = cargos.get(u.get("cargo_id"), "")
        rol_nombre = roles.get(u.get("rol_id"), "")
        if "inspector" in cargo_nombre.lower() and rol_nombre.lower() == "contratista":
            result.append({
                "id": u["id"],
                "nombre": f"{u.get('nombre','')} {u.get('apellidos','')}".strip()
            })
    return result

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
        if r.get("nodo_ini"): nodos.add(r["nodo_ini"])
        if r.get("nodo_fin"): nodos.add(r["nodo_fin"])
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

@app.post("/sicoe-obra/{contrato_id}/reportes")
def crear_reporte_obra(contrato_id: int, body: ReporteCreate, current_user=Depends(get_current_user)):
    def _num():
        return supabase.rpc("siguiente_numero_reporte", {"p_contrato_id": contrato_id}).execute().data
    numero = supabase_execute(_num)
    data = body.dict()
    data["contrato_id"] = contrato_id
    data["numero_reporte"] = numero
    data["estado"] = "Borrador"
    data["creado_por"] = current_user["id"]
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
            "creado_por": current_user["id"]
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

@app.post("/sicoe-obra/{contrato_id}/registros")
def crear_registro(contrato_id: int, body: RegistroCreate, current_user=Depends(get_current_user)):
    data = body.dict()
    data["contrato_id"] = contrato_id
    def _ins():
        return supabase.table("so_registros").insert(data).execute().data
    result = supabase_execute(_ins)
    return result[0] if result else {}

class PuntoTopo(BaseModel):
    punto: Optional[str] = None
    norte: Optional[float] = None
    este: Optional[float] = None
    cota: Optional[float] = None
    descripcion: Optional[str] = None

class PuntosCreate(BaseModel):
    reporte_id: int
    puntos: List[PuntoTopo]

@app.post("/sicoe-obra/{contrato_id}/puntos-topograficos")
def crear_puntos(contrato_id: int, body: PuntosCreate, current_user=Depends(get_current_user)):
    rows = []
    for p in body.puntos:
        d = p.dict()
        d["contrato_id"] = contrato_id
        d["reporte_id"] = body.reporte_id
        d["creado_por"] = current_user["id"]
        rows.append(d)
    def _ins():
        return supabase.table("so_puntos_topograficos").insert(rows).execute().data
    return supabase_execute(_ins)
