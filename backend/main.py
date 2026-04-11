from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import io, requests as req_http
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
from supabase import create_client, ClientOptions
import httpx
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

def get_supabase():
    return create_client(
        _SUPABASE_URL,
        _SUPABASE_KEY,
        options=ClientOptions(httpx_client=httpx.Client(http2=False))
    )

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
    subcontratista_id: Optional[int] = None

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

# ─────────────────────────────────────────────
# HELPER SUPABASE CON REINTENTOS
# ─────────────────────────────────────────────
def supabase_execute(fn, retries=3, delay=0.5):
    import time
    last_err = None
    for i in range(retries):
        try:
            global supabase
            supabase = create_client(_SUPABASE_URL, _SUPABASE_KEY)
            return fn()
        except Exception as e:
            last_err = e
            if i < retries - 1:
                time.sleep(delay)
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
    # C3: Subcontratista sin subcontratista asignado → sin acceso
    if cargo_nombre and cargo_nombre.lower() == 'subcontratista' and not usuario.get('subcontratista_id'):
        permisos = []

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
            "subcontratista_id": usuario.get("subcontratista_id"),
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
        try:
            permisos_raw = supabase.table("permisos").select("*").eq("cargo_id", u["cargo_id"]).execute().data
        except Exception:
            permisos_raw = []
        funciones_map = {f["id"]: f["nombre"] for f in supabase.table("funciones").select("id, nombre").execute().data}
        permisos = [{**p, "funcion_nombre": funciones_map.get(p["funcion_id"], "")} for p in permisos_raw]
    # C3: Subcontratista sin subcontratista asignado → sin acceso
    if cargo_nombre and cargo_nombre.lower() == 'subcontratista' and not u.get('subcontratista_id'):
        permisos = []
    return {
        "id": u["id"], "nombre": u["nombre"], "apellidos": u.get("apellidos"),
        "email": u["email"], "cargo_id": u.get("cargo_id"), "cargo_nombre": cargo_nombre,
        "rol_id": u.get("rol_id"), "rol_nombre": rol_nombre,
        "contrato_id": u.get("contrato_id"), "estado": u.get("estado"), "activo": u.get("activo"),
        "subcontratista_id": u.get("subcontratista_id"),
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

        caller_id = int(current_user["sub"])
        caller_data = supabase.table("usuarios").select("cargo_id, contrato_id").eq("id", caller_id).execute().data
        caller_cargo = ""
        caller_contrato = None
        if caller_data:
            cid = caller_data[0].get("cargo_id")
            if cid:
                c = supabase.table("cargos").select("nombre").eq("id", cid).execute().data
                if c: caller_cargo = c[0]["nombre"].lower()
            caller_contrato = caller_data[0].get("contrato_id")

        if caller_cargo == "administrador" and caller_contrato:
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
    # exclude_unset=True: campos no enviados no se tocan; null explícito sí borra el campo
    data = body.dict(exclude_unset=True)
    if body.estado == "aprobado":
        data["activo"] = True
    elif body.estado == "rechazado":
        data["activo"] = False
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
    registrar_log(current_user, "EDITAR", "USUARIOS", "usuario", str(usuario_id), detalle_log)
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

    updated = supabase.table("presupuesto").select("*").eq("id", item_id).execute().data
    return updated[0] if updated else {"mensaje": "Registro actualizado"}

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

@app.get("/presupuesto/{contrato_id}/comentarios-validacion")
def comentarios_validacion_batch(contrato_id: int, ids: str, current_user=Depends(get_current_user)):
    """Devuelve el comentario de validacion más reciente (sin hijos) por cada presupuesto_id."""
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return {}
    rows = supabase.table("comentarios").select(
        "presupuesto_id, mensaje, usuario_nombre, created_at"
    ).in_("presupuesto_id", id_list).eq("tipo", "validacion").is_("parent_id", "null").order(
        "created_at", desc=True
    ).execute().data
    result = {}
    for r in rows:
        pid = r["presupuesto_id"]
        if pid not in result:
            result[pid] = {
                "mensaje": r["mensaje"],
                "usuario_nombre": r["usuario_nombre"],
                "created_at": r["created_at"],
            }
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
            .order("numero_reporte", desc=False).execute().data
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
    def _q():
        return supabase.table("so_registros")\
            .select("inspector_id")\
            .eq("contrato_id", contrato_id)\
            .not_.is_("inspector_id", "null").execute().data
    rows = supabase_execute(_q)
    ids = list({r["inspector_id"] for r in rows if r.get("inspector_id")})
    if not ids:
        return []
    def _u():
        return supabase.table("usuarios")\
            .select("id, nombre, apellidos")\
            .in_("id", ids).execute().data
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
    cargo: Optional[str] = None,
    estado_validacion: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    current_user=Depends(get_current_user)
):
    limit = min(limit, 100)

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

    if item:
        def _item():
            return supabase.table("so_registros").select("reporte_id")\
                .eq("contrato_id", contrato_id)\
                .ilike("item_numero", f"%{item}%").execute().data
        rows_item = supabase_execute(_item)
        ids_item = list({r["reporte_id"] for r in rows_item if r.get("reporte_id")})
        if not ids_item:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
        if reporte_ids_from_reg is not None:
            reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_item))
        else:
            reporte_ids_from_reg = ids_item
        if not reporte_ids_from_reg:
            return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

    # Filtrar por cargo + estado_validacion ANTES de paginar
    if cargo and estado_validacion:
        _campo_db_map = {
            'Inspector':      'nivel1_estado',
            'Residente':      'nivel2_estado',
            'Interventoría':  'nivel3_estado',
            'Subcontratista': 'sub_estado',
        }
        _campo_db_local = _campo_db_map.get(cargo)
        if _campo_db_local:
            _ev_local = estado_validacion
            def _val():
                return supabase.table("so_registros").select("reporte_id")\
                    .eq("contrato_id", contrato_id)\
                    .eq(_campo_db_local, _ev_local).execute().data
            rows_val = supabase_execute(_val)
            ids_val = list({r["reporte_id"] for r in rows_val if r.get("reporte_id")})
            if not ids_val:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}
            if reporte_ids_from_reg is not None:
                reporte_ids_from_reg = list(set(reporte_ids_from_reg) & set(ids_val))
            else:
                reporte_ids_from_reg = ids_val
            if not reporte_ids_from_reg:
                return {"reportes": [], "total": 0, "offset": offset, "limit": limit, "hay_mas": False}

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

    def _q():
        q = supabase.table("so_reportes").select("*, subcontratistas(razon_social)")\
            .eq("contrato_id", contrato_id)
        if numero_reporte is not None:
            q = q.eq("numero_reporte", numero_reporte)
        if subcontratista_id is not None:
            q = q.eq("subcontratista_id", subcontratista_id)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        if tramo:
            q = q.eq("tramo", tramo)
        if costado:
            q = q.eq("calzada", costado)
        if pk_id is not None:
            q = q.eq("pk_id_id", pk_id)
        if abs_inicio is not None:
            q = q.gte("abs_inicio", abs_inicio)
        if abs_final is not None:
            q = q.lte("abs_final", abs_final)
        if estado:
            q = q.eq("estado", estado)
        if semana_id_filtro is not None:
            q = q.eq("semana_id", semana_id_filtro)
        if acta_id_filtro is not None:
            q = q.eq("acta_rpo_id", acta_id_filtro)
        if reporte_ids_from_reg is not None:
            q = q.in_("id", reporte_ids_from_reg)
        return q.order("numero_reporte", desc=False).range(offset, offset + limit).execute().data

    rows = supabase_execute(_q)
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
                return supabase.table("so_registros")\
                    .select("reporte_id, nivel1_estado, nivel2_estado, nivel3_estado, sub_estado")\
                    .in_("reporte_id", _rb_l).execute().data
            reg_estados = supabase_execute(_reg_estados)
            cargo_map = {r["id"]: {"n1": [], "n2": [], "n3": [], "sub": []} for r in rows}
            for reg in reg_estados:
                rid = reg.get("reporte_id")
                if rid in cargo_map:
                    cargo_map[rid]["n1"].append(reg.get("nivel1_estado") or "No Revisado")
                    cargo_map[rid]["n2"].append(reg.get("nivel2_estado") or "No Revisado")
                    cargo_map[rid]["n3"].append(reg.get("nivel3_estado") or "No Revisado")
                    cargo_map[rid]["sub"].append(reg.get("sub_estado") or "No Revisado")
            for r in rows:
                m = cargo_map.get(r["id"], {})
                r["nivel1_estados"] = list(set(m.get("n1", [])))
                r["nivel2_estados"] = list(set(m.get("n2", [])))
                r["nivel3_estados"] = list(set(m.get("n3", [])))
                r["sub_estados"]    = list(set(m.get("sub", [])))
        except Exception:
            for r in rows:
                r["nivel1_estados"] = r["nivel2_estados"] = r["nivel3_estados"] = r["sub_estados"] = []

    for r in rows:
        sub = r.pop("subcontratistas", None)
        r["subcontratista_nombre"] = sub["razon_social"] if sub else None
        r["semana_numero"]    = semana_map.get(r.get("semana_id"))
        acta = acta_map.get(r.get("acta_rpo_id"))
        r["acta_rpo"]         = acta["numero_rpo"] if acta else None
        r["acta_consecutivo"] = acta["consecutivo"] if acta else None

    return {"reportes": rows, "total": len(rows), "offset": offset, "limit": limit, "hay_mas": hay_mas}


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
    cargo:            Optional[str]   = None,
    estado_validacion: Optional[str]  = None,
    current_user=Depends(get_current_user)
):
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

    # ── 3. Resolver reporte_ids desde filtros a nivel reporte ────────────────
    reporte_ids_base = None
    has_rep_f = any([capitulo, subcontratista_id, tramo, costado, estado,
                     abs_inicio is not None, abs_final is not None])
    if has_rep_f:
        try:
            _cap_l=capitulo; _sub_l=subcontratista_id; _tr_l=tramo
            _cos_l=costado;  _est_l=estado
            _ai_l=abs_inicio; _af_l=abs_final
            def _reps():
                q = supabase.table("so_reportes").select("id")\
                    .eq("contrato_id", contrato_id)
                if _cap_l:  q = q.eq("capitulo", _cap_l)
                if _sub_l:  q = q.eq("subcontratista_id", _sub_l)
                if _tr_l:   q = q.eq("tramo", _tr_l)
                if _cos_l:  q = q.eq("calzada", _cos_l)
                if _est_l:  q = q.eq("estado", _est_l)
                if _ai_l is not None: q = q.gte("abs_inicio", _ai_l)
                if _af_l is not None: q = q.lte("abs_final", _af_l)
                return q.execute().data
            rr = supabase_execute(_reps)
            reporte_ids_base = list({r["id"] for r in rr if r.get("id")})
            if not reporte_ids_base:
                return _empty
        except Exception: pass

    # ── 3b. Resolver campo de validación para paso 4 ─────────────────────────
    _val_campo_l = None
    _val_estado_l = None
    if cargo and estado_validacion:
        _campo_db_map_a = {
            'Inspector':      'nivel1_estado',
            'Residente':      'nivel2_estado',
            'Interventoría':  'nivel3_estado',
            'Subcontratista': 'sub_estado',
        }
        _c = _campo_db_map_a.get(cargo)
        if _c:
            _val_campo_l = _c
            _val_estado_l = estado_validacion

    # ── 4. Obtener registros (paginado para superar límite 1000 de Supabase) ──
    registros = []
    try:
        _a_l=acta_id; _s_l=semana_id; _it_l=item; _rp_l=reporte_ids_base
        _vc_l=_val_campo_l; _ve_l=_val_estado_l
        off = 0
        while True:
            def _regs(o=off):
                q = supabase.table("so_registros")\
                    .select("reporte_id, costo_directo, cantidad_total, item_numero, item_descripcion, unidad, acta_rpo_id, nivel1_estado, nivel2_estado, nivel3_estado")\
                    .eq("contrato_id", contrato_id)
                if _a_l is not None:  q = q.eq("acta_rpo_id", _a_l)
                if _s_l is not None:  q = q.eq("semana_id", _s_l)
                if _it_l:             q = q.ilike("item_numero", f"%{_it_l}%")
                if _rp_l is not None: q = q.in_("reporte_id", _rp_l)
                if _vc_l and _ve_l:   q = q.eq(_vc_l, _ve_l)
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000:
                break
            off += 1000
    except Exception:
        registros = []

    # ── 5. Batch-resolve capitulo y estado desde so_reportes ─────────────────
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

    # ── 6. Agrupar según modo ─────────────────────────────────────────────────
    def _estado_efectivo(reg):
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
            rep = reporte_map.get(reg.get("reporte_id")) or {}
            cap = rep.get("capitulo") or "Sin capítulo"
            ee  = _estado_efectivo(reg)
            cd  = float(reg.get("costo_directo") or 0)
            if cap not in grupos:
                grupos[cap] = {"label": cap, "costo_directo": 0.0,
                               "total_registros": 0, "aprobados": 0.0,
                               "pendientes": 0.0, "rechazados": 0.0}
            grupos[cap]["costo_directo"]   += cd
            grupos[cap]["total_registros"] += 1
            if   ee == "Aprobado":   grupos[cap]["aprobados"]  += cd
            elif ee == "Pendiente":  grupos[cap]["pendientes"] += cd
            elif ee == "Rechazado":  grupos[cap]["rechazados"] += cd

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
                    "aprobados": 0.0, "pendientes": 0.0, "rechazados": 0.0,
                }
            if not grupos[it]["descripcion"] and reg.get("item_descripcion"):
                grupos[it]["descripcion"] = reg["item_descripcion"]
            if not grupos[it]["unidad"] and reg.get("unidad"):
                grupos[it]["unidad"] = reg["unidad"]
            grupos[it]["cantidad_total"] += float(reg.get("cantidad_total") or 0)
            grupos[it]["costo_directo"]  += cd
            grupos[it]["total_registros"] += 1
            if   ee == "Aprobado":   grupos[it]["aprobados"]  += cd
            elif ee == "Pendiente":  grupos[it]["pendientes"] += cd
            elif ee == "Rechazado":  grupos[it]["rechazados"] += cd

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
            rep  = reporte_map.get(reg.get("reporte_id")) or {}
            ee   = _estado_efectivo(reg)
            cd   = float(reg.get("costo_directo") or 0)
            cap  = rep.get("capitulo") or "Sin capítulo"
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
        if "cantidad_total" in g:
            g["cantidad_total"] = round(g["cantidad_total"], 3)

    # ── 7. Encabezado ─────────────────────────────────────────────────────────
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
        if subcontratista_id: partes.append(f"Subc. #{subcontratista_id}")
        if capitulo:   partes.append(f"Cap.: {capitulo}")
        if tramo:      partes.append(f"Tramo: {tramo}")
        if costado:    partes.append(f"Costado: {costado}")
        if estado:     partes.append(f"Estado: {estado}")
        if abs_inicio is not None: partes.append(f"Abs. ≥ {abs_inicio}")
        if abs_final  is not None: partes.append(f"Abs. ≤ {abs_final}")
        encabezado = " · ".join(partes) if partes else "Todos los registros"

    tc  = round(sum(g["costo_directo"]   for g in grupos_list), 2)
    tr  = sum(g["total_registros"] for g in grupos_list)
    ta  = sum(g["aprobados"]       for g in grupos_list)
    tp  = sum(g["pendientes"]      for g in grupos_list)
    trj = sum(g["rechazados"]      for g in grupos_list)

    return {"modo": modo, "encabezado": encabezado, "grupos": grupos_list,
            "total_costo_directo": tc, "total_registros": tr,
            "total_aprobados": ta, "total_pendientes": tp, "total_rechazados": trj}


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

    # Resolver reporte_ids si hay filtro de capitulo o subcontratista
    reporte_ids_filter = None
    if capitulo is not None or subcontratista_id is not None:
        try:
            _cap_l = capitulo
            _sub_l = subcontratista_id
            def _reps():
                q = supabase.table("so_reportes").select("id")\
                    .eq("contrato_id", contrato_id)
                if _cap_l is not None:
                    q = q.eq("capitulo", _cap_l)
                if _sub_l is not None:
                    q = q.eq("subcontratista_id", _sub_l)
                return q.execute().data
            rep_rows = supabase_execute(_reps)
            reporte_ids_filter = list({r["id"] for r in rep_rows if r.get("id")})
            if not reporte_ids_filter:
                return []
        except Exception:
            return []

    # Obtener items desde so_registros (paginado)
    try:
        _acta_id_l   = acta_id
        _semana_id_l = semana_id
        _rep_ids_l   = reporte_ids_filter
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
                if _rep_ids_l is not None:
                    qr = qr.in_("reporte_id", _rep_ids_l)
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
        return supabase.table("so_reportes").select("tramo, calzada")\
            .eq("contrato_id", contrato_id).execute().data
    rows = supabase_execute(_q)
    return {
        "tramos":   sorted({r["tramo"]   for r in rows if r.get("tramo")}),
        "costados": sorted({r["calzada"] for r in rows if r.get("calzada")}),
    }


@app.get("/sicoe-obra/{contrato_id}/reportes/{reporte_id}")
def obtener_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _r():
        return supabase.table("so_reportes").select("*, subcontratistas(razon_social), pk_ids(pk_id, civ, tramo, infraestructura, calzada, abs_inicio, abs_final)")\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    def _reg():
        return supabase.table("so_registros").select("*")\
            .eq("reporte_id", reporte_id).order("id").execute().data
    def _pts():
        return supabase.table("so_puntos_topograficos").select("*")\
            .eq("reporte_id", reporte_id).order("id").execute().data
    reporte = supabase_execute(_r)
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
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
    r["registros"] = supabase_execute(_reg)
    r["puntos"] = supabase_execute(_pts)

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

import cloudinary
import cloudinary.uploader

@app.post("/sicoe-obra/{contrato_id}/upload-foto")
async def upload_foto(contrato_id: int, file: UploadFile = File(...), numero: int = Form(...), descripcion: str = Form(""), current_user=Depends(get_current_user)):
    cloudinary.config(cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"), api_key=os.getenv("CLOUDINARY_API_KEY"), api_secret=os.getenv("CLOUDINARY_API_SECRET"))
    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=f"claracore/{contrato_id}/fotos",
        public_id=f"foto_{numero}",
        overwrite=True,
        resource_type="image"
    )
    return {"url": result["secure_url"], "numero": numero}

@app.post("/sicoe-obra/{contrato_id}/upload-grafico")
async def upload_grafico(contrato_id: int, file: UploadFile = File(...), numero: int = Form(...), descripcion: str = Form(""), current_user=Depends(get_current_user)):
    cloudinary.config(cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"), api_key=os.getenv("CLOUDINARY_API_KEY"), api_secret=os.getenv("CLOUDINARY_API_SECRET"))
    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=f"claracore/{contrato_id}/graficos",
        public_id=f"grafico_{numero}",
        overwrite=True,
        resource_type="image"
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

@app.put("/sicoe-obra/{contrato_id}/reportes/{reporte_id}")
def actualizar_reporte(contrato_id: int, reporte_id: int, body: ReporteCreate, current_user=Depends(get_current_user)):
    data = body.dict()
    for _campo in ('pk_id_id','civ','tramo','infraestructura','calzada','costado',
                   'ubicacion','coord_lat','coord_lng','abs_inicio','abs_final',
                   'nodo_ini','nodo_fin','margen'):
        data.pop(_campo, None)
    data.pop("updated_at", None)
    data["updated_at"]     = "now()"
    data["modificado_por"] = int(current_user.get("sub") or current_user.get("id", 0))
    def _upd():
        return supabase.table("so_reportes").update(data)\
            .eq("id", reporte_id).eq("contrato_id", contrato_id).execute().data
    result = supabase_execute(_upd)
    return result[0] if result else {}

@app.put("/sicoe-obra/{contrato_id}/registros/{registro_id}")
def actualizar_registro(contrato_id: int, registro_id: int, body: RegistroCreate, current_user=Depends(get_current_user)):
    data = {k: v for k, v in body.dict().items() if v is not None}
    def _upd():
        return supabase.table("so_registros").update(data)\
            .eq("id", registro_id).eq("contrato_id", contrato_id).execute().data
    return supabase_execute(_upd)

@app.delete("/sicoe-obra/{contrato_id}/reportes/{reporte_id}/registros")
def eliminar_registros_reporte(contrato_id: int, reporte_id: int, current_user=Depends(get_current_user)):
    def _del():
        return supabase.table("so_registros").delete()\
            .eq("reporte_id", reporte_id).eq("contrato_id", contrato_id).execute().data
    supabase_execute(_del)
    return {"ok": True}

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
@app.get("/sicoe-obra/{contrato_id}/acta-rpo-vigente")
def get_acta_rpo_vigente(contrato_id: int, current_user=Depends(get_current_user)):
    try:
        from datetime import date
        today = date.today().isoformat()
        def _q():
            return supabase.table("actas")\
                .select("id, numero_rpo, fecha_inicio, fecha_fin")\
                .eq("contrato_id", contrato_id)\
                .eq("tipo_grupo", "cobro")\
                .lte("fecha_inicio", today)\
                .gte("fecha_fin", today)\
                .order("id", desc=True).limit(1).execute().data
        actas = supabase_execute(_q)
        return actas[0] if actas else None
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
            query = query.ilike("descripcion", f"%{q}%")
        return query.order("item_numero").limit(50).execute().data
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
                .select("cantidad_total, reporte_id")\
                .eq("id", registro_id).single().execute().data
        registro = supabase_execute(_reg)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

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
                    .eq("tipo_grupo", "cobro")\
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
                .select("reporte_id").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        reg_rows = supabase_execute(_reg)
        if not reg_rows:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
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


def _insertar_comentario(contrato_id: int, registro_id: int, autor_id: int,
                         comentario_data: dict, tipo_override: str = None):
    """Inserta un comentario en so_registro_comentarios calculando confidencialidad."""
    destinatarios = comentario_data.get("destinatarios") or []
    rol_origen = comentario_data.get("rol_origen", "")

    if not destinatarios:
        confidencialidad = "publico"
    else:
        roles_dest = {d.get("rol") for d in destinatarios if isinstance(d, dict) and d.get("rol")}
        if len(roles_dest) == 1 and rol_origen in roles_dest:
            if rol_origen == "contratista":
                confidencialidad = "contratista_interno"
            elif rol_origen == "interventoria":
                confidencialidad = "interventoria_interna"
            else:
                confidencialidad = "privado"
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
        "nivel_validacion":   comentario_data.get("nivel_validacion"),
        "padre_id":           comentario_data.get("padre_id"),
    }

    def _ins():
        return supabase.table("so_registro_comentarios").insert(row).execute().data
    return supabase_execute(_ins)


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
        update = {
            "nivel1_estado":     body.estado,
            "nivel1_usuario_id": autor_id,
            "nivel1_fecha":      datetime.utcnow().isoformat(),
        }
        def _upd():
            return supabase.table("so_registros")\
                .update(update).eq("id", registro_id)\
                .eq("contrato_id", contrato_id).execute().data
        supabase_execute(_upd)
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data)
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
                .select("nivel1_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows or rows[0].get("nivel1_estado") != "Aprobado":
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
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data)
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
                .select("nivel2_estado").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows or rows[0].get("nivel2_estado") != "Aprobado":
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
        if body.comentario_data:
            _insertar_comentario(contrato_id, registro_id, autor_id, body.comentario_data)
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
                .select("nivel2_objeto_pago_sub").eq("id", registro_id)\
                .eq("contrato_id", contrato_id).limit(1).execute().data
        rows = supabase_execute(_get)
        if not rows or not rows[0].get("nivel2_objeto_pago_sub"):
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

@app.get("/sicoe-obra/{contrato_id}/dashboard-resumen")
def dashboard_resumen_obra(contrato_id: int, current_user=Depends(get_current_user)):
    """
    Reemplaza /cobro/{contrato_id}/resumen para el Dashboard.
    Fuente: so_registros WHERE nivel3_estado='Aprobado' + actas + presupuesto.
    Retorna misma forma que el endpoint de cobro para compatibilidad con frontend.
    """
    try:
        # 1. Obtener registros aprobados paginados
        registros = []
        off = 0
        while True:
            def _regs(o=off):
                return supabase.table("so_registros")\
                    .select("reporte_id, costo_directo, cantidad_total, acta_rpo_id, pk_id_id")\
                    .eq("contrato_id", contrato_id)\
                    .eq("nivel3_estado", "Aprobado")\
                    .range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        # 2. Resolver capitulo desde so_reportes
        rep_ids = list({r["reporte_id"] for r in registros if r.get("reporte_id")})
        reporte_map = {}
        for chunk_start in range(0, len(rep_ids), 500):
            chunk = rep_ids[chunk_start:chunk_start + 500]
            def _reps(ids=chunk):
                return supabase.table("so_reportes")\
                    .select("id, capitulo").eq("contrato_id", contrato_id)\
                    .in_("id", ids).execute().data
            for r in supabase_execute(_reps):
                reporte_map[r["id"]] = r.get("capitulo") or "Sin capítulo"

        # 3. Resolver numero_rpo desde actas
        acta_ids = list({r["acta_rpo_id"] for r in registros if r.get("acta_rpo_id")})
        acta_map = {}
        if acta_ids:
            for chunk_start in range(0, len(acta_ids), 500):
                chunk = acta_ids[chunk_start:chunk_start + 500]
                def _actas(ids=chunk):
                    return supabase.table("actas")\
                        .select("id, numero_rpo").in_("id", ids).execute().data
                for a in supabase_execute(_actas):
                    acta_map[a["id"]] = a.get("numero_rpo") or a["id"]

        # 4. Total cobrado
        total_cobrado = sum(float(r.get("costo_directo") or 0) for r in registros)

        # 5. Acumulado por acta RPO
        acta_agg = {}
        for r in registros:
            aid = r.get("acta_rpo_id")
            if not aid: continue
            nr = acta_map.get(aid, aid)
            acta_agg[nr] = acta_agg.get(nr, 0) + float(r.get("costo_directo") or 0)
        por_acta = [{"acta": nr, "cobrado": round(v, 2)} for nr, v in sorted(acta_agg.items(), key=lambda x: x[0])]

        # 6. Presupuesto por capítulo (vista existente)
        def _ppto():
            return supabase.table("vista_ppto_por_capitulo")\
                .select("*").eq("contrato_id", contrato_id).execute().data
        ppto_raw = supabase_execute(_ppto)
        ppto_caps = {r["capitulo"]: float(r.get("presupuesto") or 0) for r in ppto_raw}
        ppto_total = sum(ppto_caps.values())

        # 7. Obra por capítulo
        obra_caps = {}
        for r in registros:
            cap = reporte_map.get(r.get("reporte_id"), "Sin capítulo")
            obra_caps[cap] = obra_caps.get(cap, 0) + float(r.get("costo_directo") or 0)

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
            "actas": sorted(acta_agg.keys()),
            "comparativo_capitulos": comparativo,
            "por_acta": por_acta,
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
    """
    Reemplaza /cobro/{contrato_id}/drill para el Dashboard.
    Retorna misma forma: {campo, items: [{nombre, descripcion, presupuesto, cobrado, delta, pct, cant_ppto, cant_cobro}]}
    """
    try:
        # 1. Resolver reporte_ids por capitulo
        reporte_ids = None
        reporte_cap_map = {}
        if capitulo:
            def _reps():
                return supabase.table("so_reportes")\
                    .select("id, capitulo").eq("contrato_id", contrato_id)\
                    .eq("capitulo", capitulo).execute().data
            reps = supabase_execute(_reps)
            reporte_ids = [r["id"] for r in reps]
            for r in reps: reporte_cap_map[r["id"]] = r.get("capitulo")
            if not reporte_ids:
                return {"campo": "item" if capitulo else "capitulo", "items": []}
        else:
            def _allreps():
                return supabase.table("so_reportes")\
                    .select("id, capitulo").eq("contrato_id", contrato_id).execute().data
            for r in supabase_execute(_allreps()):
                reporte_cap_map[r["id"]] = r.get("capitulo")

        # 2. Obtener registros aprobados
        registros = []
        off = 0
        while True:
            def _regs(o=off):
                q = supabase.table("so_registros")\
                    .select("reporte_id, costo_directo, cantidad_total, item_numero, item_descripcion, pk_id_id")\
                    .eq("contrato_id", contrato_id)\
                    .eq("nivel3_estado", "Aprobado")
                if reporte_ids is not None:
                    q = q.in_("reporte_id", reporte_ids)
                if item:
                    q = q.ilike("item_numero", f"%{item}%")
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        # 3. Presupuesto
        q_p = supabase.table("presupuesto")\
            .select("capitulo, item, descripcion, costo_directo, cant_total")\
            .eq("contrato_id", contrato_id).eq("dado_de_baja", False)
        if capitulo: q_p = q_p.eq("capitulo", capitulo)
        if item: q_p = q_p.eq("item", item)
        ppto = []
        off = 0
        while True:
            batch = q_p.range(off, off + 999).execute().data
            ppto.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        # 4. Determinar campo de agrupación
        campo = "item" if capitulo else "capitulo"

        # 5. Agregar presupuesto
        agg_p = {}; agg_p_cant = {}; desc_map = {}
        for r in ppto:
            k = r.get(campo) or "(sin valor)"
            agg_p[k] = agg_p.get(k, 0) + float(r.get("costo_directo") or 0)
            agg_p_cant[k] = agg_p_cant.get(k, 0) + float(r.get("cant_total") or 0)
            if campo == "item" and r.get("descripcion") and k not in desc_map:
                desc_map[k] = r["descripcion"]

        # 6. Agregar obra aprobada
        agg_c = {}; agg_c_cant = {}
        for r in registros:
            if campo == "item":
                k = r.get("item_numero") or "(sin valor)"
                if k not in desc_map and r.get("item_descripcion"):
                    desc_map[k] = r["item_descripcion"]
            else:
                k = reporte_cap_map.get(r.get("reporte_id"), "Sin capítulo")
            agg_c[k] = agg_c.get(k, 0) + float(r.get("costo_directo") or 0)
            agg_c_cant[k] = agg_c_cant.get(k, 0) + float(r.get("cantidad_total") or 0)

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
        # 1. Resolver reporte_ids
        reporte_ids = None
        if capitulo:
            def _reps():
                return supabase.table("so_reportes")\
                    .select("id").eq("contrato_id", contrato_id)\
                    .eq("capitulo", capitulo).execute().data
            reporte_ids = [r["id"] for r in supabase_execute(_reps)]
            if not reporte_ids:
                return {"rows": [], "por_cobrar": 0, "devolucion": 0, "descripcion_item": ""}

        # 2. Registros aprobados con pk_id_id
        registros = []
        off = 0
        while True:
            def _regs(o=off):
                q = supabase.table("so_registros")\
                    .select("pk_id_id, costo_directo, cantidad_total, item_numero")\
                    .eq("contrato_id", contrato_id)\
                    .eq("nivel3_estado", "Aprobado")
                if reporte_ids is not None: q = q.in_("reporte_id", reporte_ids)
                if item: q = q.ilike("item_numero", f"%{item}%")
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        # 3. Resolver pk_id string desde pk_ids
        pkid_ids = list({r["pk_id_id"] for r in registros if r.get("pk_id_id")})
        pkid_str_map = {}
        for chunk_start in range(0, len(pkid_ids), 500):
            chunk = pkid_ids[chunk_start:chunk_start + 500]
            def _pks(ids=chunk):
                return supabase.table("pk_ids").select("id, pk_id").in_("id", ids).execute().data
            for p in supabase_execute(_pks):
                pkid_str_map[p["id"]] = p.get("pk_id") or str(p["id"])

        # 4. Presupuesto por pk_id
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
            k = pkid_str_map.get(r.get("pk_id_id"), "(sin pk)")
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sicoe-obra/{contrato_id}/dashboard-pkid-colores")
def dashboard_pkid_colores_obra(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
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
                    .select("pk_id_id, costo_directo")\
                    .eq("contrato_id", contrato_id)\
                    .eq("nivel3_estado", "Aprobado")
                if reporte_ids is not None: q = q.in_("reporte_id", reporte_ids)
                if item: q = q.ilike("item_numero", f"%{item}%")
                return q.range(o, o + 999).execute().data
            batch = supabase_execute(_regs)
            registros.extend(batch)
            if len(batch) < 1000: break
            off += 1000

        pkid_ids = list({r["pk_id_id"] for r in registros if r.get("pk_id_id")})
        pkid_str_map = {}
        for chunk_start in range(0, len(pkid_ids), 500):
            chunk = pkid_ids[chunk_start:chunk_start + 500]
            def _pks(ids=chunk):
                return supabase.table("pk_ids").select("id, pk_id").in_("id", ids).execute().data
            for p in supabase_execute(_pks):
                pkid_str_map[p["id"]] = p.get("pk_id") or str(p["id"])

        cobro_agg = {}
        for r in registros:
            k = pkid_str_map.get(r.get("pk_id_id"))
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
            .select("id_pol, no_inicio, no_final, cant_total, costo_directo, descripcion, item")\
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
        reporte_ids_filtered = None
        if capitulo and not item:
            def _reps():
                return supabase.table("so_reportes")\
                    .select("id").eq("contrato_id", contrato_id)\
                    .eq("capitulo", capitulo).execute().data
            reporte_ids_filtered = [r["id"] for r in supabase_execute(_reps)]

        q_c = supabase.table("so_registros")\
            .select("id, tramo, nodo_ini, nodo_fin, cantidad_total, costo_directo, item_descripcion, item_numero, acta_rpo_id, calzada")\
            .eq("contrato_id", contrato_id).eq("nivel3_estado", "Aprobado")
        if pkid_id_val: q_c = q_c.eq("pk_id_id", pkid_id_val)
        if item: q_c = q_c.ilike("item_numero", f"%{item}%")
        if reporte_ids_filtered is not None: q_c = q_c.in_("reporte_id", reporte_ids_filtered)
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
                "registro": r.get("id"),
                "tramo_inicio": r.get("nodo_ini"),
                "tramo_final": r.get("nodo_fin"),
                "cantidad": float(r.get("cantidad_total") or 0),
                "longitud": float(r.get("cantidad_total") or 0),
                "costo_directo": float(r.get("costo_directo") or 0),
                "descripcion": r.get("item_descripcion") or "",
                "item": r.get("item_numero") or "",
                "acta": acta_map2.get(r.get("acta_rpo_id")),
                "calzada": r.get("calzada") or "",
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
        _insertar_comentario(contrato_id, registro_id, autor_id, comentario_data)
        return {"ok": True}
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
                .select("*, autor:autor_id(nombre)")\
                .eq("registro_id", registro_id)\
                .eq("contrato_id", contrato_id)\
                .order("created_at", desc=False).execute().data
        comentarios = supabase_execute(_get)

        # Filtrar por confidencialidad según el rol del solicitante
        excluir = set()
        if rol_solicitante in ("interventoria", "subcontratista"):
            excluir.add("contratista_interno")
        if rol_solicitante in ("contratista", "subcontratista"):
            excluir.add("interventoria_interna")

        resultado = [c for c in comentarios if c.get("confidencialidad") not in excluir]
        return resultado
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

            if body.comentario_data:
                _insertar_comentario(contrato_id, reg_id, autor_id, body.comentario_data)
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

            if body.comentario_data:
                _insertar_comentario(contrato_id, reg_id, autor_id, body.comentario_data)
            actualizados += 1

        return {"actualizados": actualizados, "omitidos": omitidos}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
