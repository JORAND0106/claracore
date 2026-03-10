from fastapi import FastAPI, HTTPException, Depends
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

load_dotenv()

app = FastAPI(title="ClaraCore API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://happy-grass-0aea5f31e.6.azurestaticapps.net",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
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

class ListadoPrecioItem(BaseModel):
    capitulo: Optional[str] = None
    competencia: Optional[str] = None
    item_numero: Optional[str] = None
    descripcion: Optional[str] = None
    unidad: Optional[str] = None
    precio_unitario: Optional[float] = None
    color_hex: Optional[str] = None

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
    no_inicio: Optional[float] = None
    no_final: Optional[float] = None
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

class ResetSolicitud(BaseModel):
    email: str

class ResetAutorizar(BaseModel):
    contrasena_temporal: str

class CambiarPassword(BaseModel):
    email: str
    contrasena_temporal: str
    nueva_password: str

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
    return supabase.table("contratos").select("id, numero, objeto, contratista, nit, interventoria, logo_contratista, logo_interventoria").order("numero").execute().data

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
    return {"mensaje": "Usuario aprobado"}

@app.put("/admin/usuarios/{usuario_id}/rechazar")
def rechazar_usuario(usuario_id: int, current_user=Depends(get_current_user)):
    supabase.table("usuarios").update({
        "estado": "rechazado", "activo": False
    }).eq("id", usuario_id).execute()
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
    # Proteger: no se puede modificar un usuario con cargo Desarrollador
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
    return {"mensaje": "Usuario actualizado"}

@app.get("/admin/usuario-contratos/{usuario_id}")
def get_usuario_contratos(usuario_id: int, current_user=Depends(get_current_user)):
    result = supabase.table("usuario_contratos").select("contrato_id").eq("usuario_id", usuario_id).execute()
    ids = [r["contrato_id"] for r in result.data]
    if not ids:
        return []
    contratos = supabase.table("contratos").select("id, numero, contratista, logo_contratista, logo_interventoria, interventoria").in_("id", ids).execute()
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
    return supabase.table("listado_precios").select("*").eq("contrato_id", contrato_id).order("item_numero").execute().data

@app.post("/listado-precios/{contrato_id}/bulk")
def bulk_precios(contrato_id: int, items: List[ListadoPrecioItem], current_user=Depends(get_current_user)):
    """Reemplaza todos los precios del contrato con los items del CSV."""
    supabase.table("listado_precios").delete().eq("contrato_id", contrato_id).execute()
    if items:
        rows = [{"contrato_id": contrato_id, **{k: v for k, v in item.dict().items() if v is not None}} for item in items]
        supabase.table("listado_precios").insert(rows).execute()
    return {"mensaje": f"{len(items)} items cargados"}

@app.put("/listado-precios/item/{item_id}")
def update_precio(item_id: int, body: ListadoPrecioItem, current_user=Depends(get_current_user)):
    data = body.dict(exclude_unset=True)
    supabase.table("listado_precios").update(data).eq("id", item_id).execute()
    return {"mensaje": "Item actualizado"}

@app.delete("/listado-precios/item/{item_id}")
def delete_precio(item_id: int, current_user=Depends(get_current_user)):
    supabase.table("listado_precios").delete().eq("id", item_id).execute()
    return {"mensaje": "Item eliminado"}

# ─────────────────────────────────────────────
# PRESUPUESTO
# ─────────────────────────────────────────────

@app.get("/presupuesto/{contrato_id}")
def get_presupuesto(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    tramo: Optional[str] = None,
    calzada: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    q = supabase.table("presupuesto").select("*").eq("contrato_id", contrato_id)
    if capitulo: q = q.eq("capitulo", capitulo)
    if item:     q = q.eq("item", item)
    if tramo:    q = q.eq("tramo", tramo)
    if calzada:  q = q.eq("calzada", calzada)
    return q.order("capitulo").order("item").order("pk_id").limit(10000).execute().data

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
    """KPIs: total registros, costo total, por capítulo, estados revisado."""
    rows = supabase.table("presupuesto").select(
        "capitulo, costo_directo, revisado"
    ).eq("contrato_id", contrato_id).execute().data
    total_registros = len(rows)
    costo_total = sum(r.get("costo_directo") or 0 for r in rows)
    por_capitulo = {}
    for r in rows:
        cap = r.get("capitulo") or "Sin capítulo"
        por_capitulo.setdefault(cap, {"registros": 0, "costo": 0})
        por_capitulo[cap]["registros"] += 1
        por_capitulo[cap]["costo"] += r.get("costo_directo") or 0
    revisados   = sum(1 for r in rows if (r.get("revisado") or "").lower() == "verificado")
    campo       = sum(1 for r in rows if (r.get("revisado") or "").lower() == "verificar campo")
    pendientes  = sum(1 for r in rows if (r.get("revisado") or "").lower() == "pendiente")
    return {
        "total_registros": total_registros,
        "costo_total": costo_total,
        "revisados": revisados,
        "campo": campo,
        "pendientes": pendientes,
        "por_capitulo": [{"capitulo": k, **v} for k, v in sorted(por_capitulo.items())]
    }

@app.post("/presupuesto/{contrato_id}/bulk")
def bulk_presupuesto(contrato_id: int, items: List[PresupuestoRow], mode: str = "replace", current_user=Depends(get_current_user)):
    """Carga masiva. mode=replace elimina primero; mode=append agrega."""
    if mode == "replace":
        supabase.table("presupuesto").delete().eq("contrato_id", contrato_id).execute()
    if items:
        BATCH = 500
        all_rows = [{"contrato_id": contrato_id, **{k: v for k, v in row.dict().items() if v is not None}} for row in items]
        for i in range(0, len(all_rows), BATCH):
            supabase.table("presupuesto").insert(all_rows[i:i+BATCH]).execute()
    return {"mensaje": f"{len(items)} registros {'cargados' if mode=='replace' else 'agregados'}"}

@app.put("/presupuesto/item/{item_id}")
def update_presupuesto_item(item_id: int, body: PresupuestoUpdate, current_user=Depends(get_current_user)):
    data = body.dict(exclude_unset=True)
    # Recalcular cant_total y costo_directo si cambian dimensiones
    dims = {k: data.get(k) for k in ["area_long_nod", "ancho", "espesor"]}
    if any(v is not None for v in dims.values()):
        current = supabase.table("presupuesto").select("area_long_nod, ancho, espesor, vlr_unitario").eq("id", item_id).execute().data
        if current:
            c = current[0]
            area   = data.get("area_long_nod", c.get("area_long_nod") or 0)
            ancho  = data.get("ancho",         c.get("ancho")         or 0)
            esp    = data.get("espesor",        c.get("espesor")       or 0)
            vlr    = data.get("vlr_unitario",   c.get("vlr_unitario")  or 0)
            cant = round(float(area) * float(ancho) * float(esp), 2) if ancho or esp else round(float(area), 2)
            data["cant_total"]    = cant
            data["costo_directo"] = round(cant * float(vlr), 0)
    data["updated_at"] = "now()"
    supabase.table("presupuesto").update(data).eq("id", item_id).execute()
    return {"mensaje": "Registro actualizado"}

# ─────────────────────────────────────────────
# COBRO
# ─────────────────────────────────────────────

@app.get("/cobro/{contrato_id}")
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
    return q.order("acta").order("capitulo").order("item").limit(10000).execute().data

@app.get("/cobro/{contrato_id}/resumen")
def get_resumen_cobro(contrato_id: int, current_user=Depends(get_current_user)):
    """KPIs + comparativo Presupuesto vs Cobro por capítulo."""
    cobros = supabase.table("cobro").select("capitulo, item, pk_id, costo_directo, acta").eq("contrato_id", contrato_id).execute().data
    ppto   = supabase.table("presupuesto").select("capitulo, item, pk_id, costo_directo").eq("contrato_id", contrato_id).execute().data

    total_cobrado  = sum(r.get("costo_directo") or 0 for r in cobros)
    total_ppto     = sum(r.get("costo_directo") or 0 for r in ppto)
    actas_unicas   = sorted(set(r.get("acta") for r in cobros if r.get("acta")))

    # Por capítulo
    por_cap_ppto  = {}
    for r in ppto:
        cap = r.get("capitulo") or "Sin capítulo"
        por_cap_ppto.setdefault(cap, 0)
        por_cap_ppto[cap] += r.get("costo_directo") or 0

    por_cap_cobro = {}
    for r in cobros:
        cap = r.get("capitulo") or "Sin capítulo"
        por_cap_cobro.setdefault(cap, 0)
        por_cap_cobro[cap] += r.get("costo_directo") or 0

    caps = sorted(set(list(por_cap_ppto.keys()) + list(por_cap_cobro.keys())))
    comparativo = []
    for cap in caps:
        p = por_cap_ppto.get(cap, 0)
        c = por_cap_cobro.get(cap, 0)
        comparativo.append({
            "capitulo": cap,
            "presupuesto": p,
            "cobrado": c,
            "delta": p - c,
            "consumo_pct": round(c / p * 100, 1) if p else 0
        })

    # Por acta
    por_acta = {}
    for r in cobros:
        a = r.get("acta") or 0
        por_acta.setdefault(a, 0)
        por_acta[a] += r.get("costo_directo") or 0

    return {
        "total_presupuesto": total_ppto,
        "total_cobrado": total_cobrado,
        "delta": total_ppto - total_cobrado,
        "consumo_pct": round(total_cobrado / total_ppto * 100, 1) if total_ppto else 0,
        "actas": actas_unicas,
        "comparativo_capitulos": comparativo,
        "por_acta": [{"acta": k, "cobrado": v} for k, v in sorted(por_acta.items())]
    }

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

@app.post("/cobro/{contrato_id}/bulk")
def bulk_cobro(contrato_id: int, items: List[CobroRow], mode: str = "replace", current_user=Depends(get_current_user)):
    """Carga masiva. mode=replace elimina primero; mode=append agrega."""
    if mode == "replace":
        supabase.table("cobro").delete().eq("contrato_id", contrato_id).execute()
    if items:
        BATCH = 500
        all_rows = [{"contrato_id": contrato_id, **{k: v for k, v in row.dict().items() if v is not None}} for row in items]
        for i in range(0, len(all_rows), BATCH):
            supabase.table("cobro").insert(all_rows[i:i+BATCH]).execute()
    return {"mensaje": f"{len(items)} registros {'cargados' if mode=='replace' else 'agregados'}"}


