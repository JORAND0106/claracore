"""
Registro de modificaciones de datos.

Toda escritura que pasa por el cliente de PostgREST (insert, update, upsert,
delete) queda auditada en Python, después de que la operación se confirma.
No hay triggers ni reglas de negocio en la base de datos: si la escritura
falla, no se agrega nada al log, y un fallo del log no cambia el resultado
de la operación.

Las entradas de `logs` solo se insertan. Un update, delete o upsert sobre
esa tabla se rechaza aquí, que es el único camino de la plataforma hacia
la base.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple
from urllib.parse import unquote

try:
    import pytz
except ImportError:  # pragma: no cover
    pytz = None

_log = logging.getLogger("claracore.auditoria_datos")

CATEGORIA = "datos"
TIPO_DETALLE = "modificacion_datos"
SNAPSHOT_MAX = 400

_TZ = pytz.timezone("America/Bogota") if pytz else None

# Tablas técnicas: no son datos que un usuario edita en un módulo.
_TABLAS_OMITIDAS = frozenset({"logs", "schema_migrations"})

_RUIDO = frozenset({
    "id",
    "uuid",
    "created_at",
    "updated_at",
    "modificado_en",
    "actualizado_en",
    "fecha_actualizacion",
    "created_by",
    "updated_by",
    "modificado_por",
    "creado_por",
    "ultimo_acceso",
    "last_login",
    "last_seen",
    "ultimo_login",
})

_SENSIBLES = frozenset({
    "password",
    "password_hash",
    "passwd",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "authorization",
})

# Prefijos más largos primero.
_PREFIJOS_MODULO: Tuple[Tuple[str, str], ...] = (
    ("catalogo_insumo", "Catálogo de insumos"),
    ("catalogo_", "Catálogo de insumos"),
    ("almacen_", "Almacén"),
    ("almacen", "Almacén"),
    ("listado_precio", "Precios"),
    ("presupuesto", "Presupuesto"),
    ("programacion", "Programación de obra"),
    ("subcontrat", "Subcontratistas"),
    ("seguimiento_", "Seguimiento"),
    ("bitacora_", "Bitácora"),
    ("contab", "Contabilidad"),
    ("contrato", "Contratos"),
    ("claracad", "ClaraCAD"),
    ("notific", "Notificaciones"),
    ("usuario", "Usuarios"),
    ("permiso", "Cargos y permisos"),
    ("funcion", "Cargos y permisos"),
    ("precio", "Precios"),
    ("informe", "Informes"),
    ("inicio_", "Inicio"),
    ("novedad", "Inicio"),
    ("orden_pago", "Cobro"),
    ("ordenes_pago", "Cobro"),
    ("esquema_ia", "Informes"),
    ("storage_", "Contratos"),
    ("diseno_", "Topografía"),
    ("prog_", "Programación de obra"),
    ("rrhh_", "Recursos humanos"),
    ("topo", "Topografía"),
    ("acta", "Actas"),
    ("cobro", "Cobro"),
    ("corte_", "Cobro"),
    ("cargo", "Cargos y permisos"),
    ("so_", "SICOE"),
    ("cad_", "Topografía"),
    ("avi_", "Informes"),
    ("rol", "Cargos y permisos"),
    ("pk_", "Contratos"),
)

_TABLAS: Dict[str, str] = {
    "presupuesto": "Ítem de presupuesto",
    "presupuesto_versiones": "Versión de presupuesto",
    "so_registros": "Registro de obra",
    "so_reportes": "Reporte de obra",
    "usuarios": "Usuario",
    "contratos": "Contrato",
    "cargos": "Cargo",
    "roles": "Rol",
    "permisos": "Permiso",
    "listado_precios": "Precio",
    "almacen_entradas": "Entrada de almacén",
    "almacen_salidas": "Salida de almacén",
    "almacen_insumos": "Insumo de almacén",
    "catalogo_insumos": "Insumo de catálogo",
    "catalogo_proveedores": "Proveedor",
    "rrhh_trabajadores": "Trabajador",
    "subcontratistas": "Subcontratista",
    "prog_actividades": "Actividad de programación",
    "topo_diseno_rasante": "Rasante de diseño",
    "topo_diseno_ejes": "Eje de diseño",
    "bitacora_entradas": "Entrada de bitácora",
}

_ETIQUETAS: Dict[str, str] = {
    "descripcion": "Descripción",
    "item": "Ítem",
    "item_descripcion": "Descripción del ítem",
    "item_numero": "Ítem",
    "cantidad": "Cantidad",
    "cant_total": "Cantidad total",
    "cantidad_total": "Cantidad total",
    "cantidad_recibida": "Cantidad recibida",
    "cantidad_salida": "Cantidad de salida",
    "cantidad_devuelta": "Cantidad devuelta",
    "vlr_unitario": "Valor unitario",
    "valor_unitario": "Valor unitario",
    "valor": "Valor",
    "costo_directo": "Costo directo",
    "precio": "Precio",
    "und": "Unidad",
    "unidad": "Unidad",
    "codigo": "Código",
    "numero": "Número",
    "nombre": "Nombre",
    "titulo": "Título",
    "estado": "Estado",
    "observacion": "Observación",
    "observaciones": "Observaciones",
    "capitulo": "Capítulo",
    "email": "Correo",
    "password": "Contraseña",
    "password_hash": "Contraseña",
    "telefono": "Teléfono",
    "direccion": "Dirección",
    "identificacion": "Identificación",
    "documento": "Documento",
    "fecha": "Fecha",
    "placa": "Placa",
    "proveedor_id": "Proveedor",
    "contrato_id": "Contrato",
    "usuario_id": "Usuario",
    "id_pol": "ID-POL",
    "pk_id": "PK",
    "consecutivo": "Consecutivo",
    "tramo": "Tramo",
    "calzada": "Calzada",
    "ancho": "Ancho",
    "espesor": "Espesor",
    "longitud": "Longitud",
    "abscisa": "Abscisa",
    "abs_inicio": "Abscisa inicio",
    "abs_final": "Abscisa fin",
    "no_inicio": "Nodo inicio",
    "no_final": "Nodo fin",
    "sellado": "Sellado",
    "bloqueado": "Bloqueado",
    "activo": "Activo",
    "motivo": "Motivo",
    "nota": "Nota",
    "notas": "Notas",
    "razon_social": "Razón social",
    "nit": "NIT",
    "cargo_nombre": "Cargo",
    "rol_nombre": "Rol",
}

_PALABRAS: Dict[str, str] = {
    "descripcion": "descripción",
    "numero": "número",
    "codigo": "código",
    "direccion": "dirección",
    "telefono": "teléfono",
    "identificacion": "identificación",
    "titulo": "título",
    "capitulo": "capítulo",
    "item": "ítem",
    "observacion": "observación",
    "vlr": "valor",
    "cant": "cantidad",
    "und": "unidad",
    "abs": "abscisa",
    "no": "nodo",
    "fecha": "fecha",
    "hora": "hora",
    "nombre": "nombre",
    "cantidad": "cantidad",
    "valor": "valor",
    "unitario": "unitario",
    "total": "total",
    "estado": "estado",
    "inicio": "inicio",
    "final": "fin",
    "usuario": "usuario",
    "contrato": "contrato",
    "proveedor": "proveedor",
    "documento": "documento",
    "email": "correo",
    "placa": "placa",
    "tramo": "tramo",
    "ancho": "ancho",
    "largo": "largo",
    "espesor": "espesor",
    "longitud": "longitud",
    "precio": "precio",
    "costo": "costo",
    "directo": "directo",
    "motivo": "motivo",
    "nota": "nota",
    "notas": "notas",
    "activo": "activo",
    "tipo": "tipo",
    "fecha_entrada": "fecha de entrada",
}

_CLAVES_REGISTRO = (
    "nombre",
    "titulo",
    "descripcion",
    "item_descripcion",
    "item",
    "codigo",
    "numero",
    "consecutivo",
    "id_pol",
    "numero_documento",
    "numero_entrada",
    "numero_salida",
    "numero_oc",
    "email",
    "placa",
    "razon_social",
    "capitulo",
    "pk_id",
)

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")
_CARGA_EN_RUTA = ("import", "importar", "masiv", "bulk", "/csv", "carga-masiva", "cargar-csv")

_insertar: Optional[Callable[[Any], Any]] = None
_instalado = False
_orig_execute = None

_ctx: ContextVar[Optional["ContextoAuditoria"]] = ContextVar("auditoria_datos_ctx", default=None)
_en_auditoria: ContextVar[bool] = ContextVar("auditoria_datos_en", default=False)


class AuditoriaInmutableError(RuntimeError):
    """La plataforma no permite editar ni borrar entradas del log."""


@dataclass
class ContextoAuditoria:
    usuario: Optional[dict]
    ip: Optional[str]
    endpoint: Optional[str]
    metodo_http: Optional[str]
    es_carga: bool
    carga_id: Optional[str]


def configurar_insertador(fn: Optional[Callable[[Any], Any]]) -> None:
    """fn(dict | list[dict]) persiste en la tabla logs y no debe lanzar hacia el caller."""
    global _insertar
    _insertar = fn


def insertador_actual() -> Optional[Callable[[Any], Any]]:
    return _insertar


def ruta_es_carga(path: str, metodo: str) -> bool:
    """Una importación o carga masiva, reconocible por la ruta, agrupa sus filas."""
    if (metodo or "").upper() in ("GET", "HEAD", "OPTIONS"):
        return False
    p = (path or "").lower()
    return any(tok in p for tok in _CARGA_EN_RUTA)


def abrir_contexto(
    *,
    usuario: Optional[dict] = None,
    ip: Optional[str] = None,
    endpoint: Optional[str] = None,
    metodo_http: Optional[str] = None,
    es_carga: bool = False,
) -> Token:
    ctx = ContextoAuditoria(
        usuario=usuario if isinstance(usuario, dict) else None,
        ip=(ip or "")[:128] or None,
        endpoint=(endpoint or "")[:1024] or None,
        metodo_http=(metodo_http or "")[:32] or None,
        es_carga=bool(es_carga),
        carga_id=str(uuid.uuid4()) if es_carga else None,
    )
    return _ctx.set(ctx)


def cerrar_contexto(token: Token) -> None:
    _ctx.reset(token)


def contexto_actual() -> Optional[ContextoAuditoria]:
    return _ctx.get()


def modulo_de_tabla(tabla: str) -> str:
    t = (tabla or "").lower()
    for pref, mod in _PREFIJOS_MODULO:
        if t.startswith(pref):
            return mod
    return "Otros"


def etiqueta_tabla(tabla: str) -> str:
    if tabla in _TABLAS:
        return _TABLAS[tabla]
    return etiqueta_campo(tabla)


def etiqueta_campo(clave: str) -> str:
    if not clave:
        return "Campo"
    if clave in _ETIQUETAS:
        return _ETIQUETAS[clave]
    hoja = clave.split(".")[-1]
    if hoja in _ETIQUETAS:
        base = _ETIQUETAS[hoja]
    else:
        bare = re.sub(r"^c\d+_", "", hoja)
        partes = [p for p in bare.split("_") if p]
        palabras = [_PALABRAS.get(p.lower(), p.lower()) for p in partes] or [hoja]
        frase = " ".join(palabras)
        base = frase[:1].upper() + frase[1:] if frase else hoja
    if "." not in clave:
        return base
    return " › ".join(etiqueta_campo(p) for p in clave.split("."))


def etiqueta_registro(tabla: str, row: Optional[dict]) -> str:
    tipo = etiqueta_tabla(tabla)
    bits: List[str] = []
    vistos = set()
    if isinstance(row, dict):
        for clave in _CLAVES_REGISTRO:
            val = row.get(clave)
            if val is None or isinstance(val, (dict, list)):
                continue
            texto = str(val).strip()
            if not texto:
                continue
            marca = texto.lower()
            if marca in vistos:
                continue
            vistos.add(marca)
            bits.append(texto[:90])
            if len(bits) >= 3:
                break
    if bits:
        return f"{tipo} · " + " · ".join(bits)
    if isinstance(row, dict) and row.get("id") not in (None, ""):
        return f"{tipo} · {row.get('id')}"
    return tipo


def sanitizar_busqueda(texto: Optional[str]) -> str:
    """Texto seguro para un filtro ilike de PostgREST."""
    s = (texto or "").strip()
    s = re.sub(r'[%*,()"\\]', " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:180]


def clausula_busqueda(texto: Optional[str], *, extendida: bool) -> str:
    safe = sanitizar_busqueda(texto)
    if not safe:
        return ""
    valor = f'"*{safe}*"'
    columnas = [
        "usuario_nombre",
        "modulo",
        "accion",
        "entidad_tipo",
        "entidad_id",
        "contrato_numero",
    ]
    if extendida:
        columnas.extend(["busqueda", "registro_etiqueta", "carga_id"])
    return ",".join(f"{col}.ilike.{valor}" for col in columnas)


def tabla_desde_path(path: Any) -> str:
    s = unquote(str(path or ""))
    s = s.split("?")[0].rstrip("/")
    if not s:
        return ""
    return s.rsplit("/", 1)[-1]


def _es_sensible(clave: str) -> bool:
    hoja = (clave or "").split(".")[-1].lower()
    return hoja in _SENSIBLES or hoja.endswith("_password") or hoja.endswith("_token")


def _es_ruido(clave: str) -> bool:
    hoja = (clave or "").split(".")[-1].lower()
    return hoja in _RUIDO


def _norm_cmp(valor: Any) -> Any:
    if isinstance(valor, str):
        s = valor.strip()
        if s == "" or s.lower() in ("null", "none"):
            return None
        if _ISO.match(s):
            return s[:19]
        return s
    if isinstance(valor, float):
        if valor != valor:  # NaN
            return None
        if valor.is_integer():
            return int(valor)
        return valor
    if isinstance(valor, (dict, list)):
        try:
            return json.dumps(valor, sort_keys=True, ensure_ascii=False, default=str)
        except Exception:
            return str(valor)
    return valor


def _distinto(a: Any, b: Any) -> bool:
    ba = _como_bool_flexible(a, b)
    bb = _como_bool_flexible(b, a)
    if ba is not None and bb is not None:
        a, b = ba, bb
    na, nb = _norm_cmp(a), _norm_cmp(b)
    if na is None and nb is None:
        return False
    if _numeros_iguales(na, nb):
        return False
    return na != nb


def _como_bool_flexible(valor: Any, otro: Any) -> Optional[bool]:
    if isinstance(valor, bool):
        return valor
    if isinstance(otro, bool) and isinstance(valor, str):
        low = valor.strip().lower()
        if low == "true":
            return True
        if low == "false":
            return False
    return None


def _numeros_iguales(a: Any, b: Any) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return False
    if not isinstance(a, (int, float, str)) or not isinstance(b, (int, float, str)):
        return False
    try:
        fa = float(a)
        fb = float(b)
    except (TypeError, ValueError):
        return False
    return fa == fb


def _huella(valor: Any) -> str:
    try:
        raw = json.dumps(valor, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        raw = str(valor)
    return hashlib.sha1(raw.encode("utf-8", errors="replace")).hexdigest()[:8]


def _es_geo(clave: str, valor: Any) -> bool:
    hoja = (clave or "").lower()
    if any(tok in hoja for tok in ("geojson", "plano", "huella", "coords", "geometria", "geometría")):
        return True
    return isinstance(valor, dict) and valor.get("type") in ("FeatureCollection", "Feature", "Polygon", "LineString", "Point")


def _presentar(clave: str, valor: Any) -> str:
    if _es_sensible(clave):
        if valor in (None, ""):
            return "—"
        return "(oculto)"
    if valor is None or valor == "":
        return "—"
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    if isinstance(valor, str) and _ISO.match(valor.strip()):
        return _fmt_fecha(valor.strip())
    if isinstance(valor, datetime):
        return _fmt_fecha(valor.isoformat())
    if _es_geo(clave, valor) or _serial_len(valor) > 1500:
        return _resumen_largo(clave, valor)
    if isinstance(valor, (dict, list)):
        try:
            texto = json.dumps(valor, ensure_ascii=False, default=str)
        except Exception:
            texto = str(valor)
        return _cortar(texto)
    if isinstance(valor, float):
        if valor.is_integer():
            return str(int(valor))
        return _cortar(str(valor))
    return _cortar(str(valor))


def _fmt_fecha(iso: str) -> str:
    s = iso.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        return _cortar(iso)
    if _TZ is not None:
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        dt = dt.astimezone(_TZ)
    return dt.strftime("%d/%m/%Y %I:%M %p")


def _serial_len(valor: Any) -> int:
    if isinstance(valor, str):
        return len(valor)
    try:
        return len(json.dumps(valor, ensure_ascii=False, default=str))
    except Exception:
        return len(str(valor))


def _resumen_largo(clave: str, valor: Any) -> str:
    if isinstance(valor, dict) and valor.get("type") == "FeatureCollection":
        n = len(valor.get("features") or [])
        return f"Geometría ({n} elementos, ref. {_huella(valor)})"
    if isinstance(valor, dict) and valor.get("type") == "Feature":
        return f"Geometría (1 elemento, ref. {_huella(valor)})"
    if isinstance(valor, dict) and _es_geo(clave, valor):
        return f"Geometría (ref. {_huella(valor)})"
    if isinstance(valor, (bytes, bytearray)) or (
        isinstance(valor, str) and len(valor) > 200 and _parece_archivo(clave, valor)
    ):
        n = len(valor)
        return f"Archivo ({n} caracteres, ref. {_huella(valor)})"
    if isinstance(valor, dict):
        return f"Datos ({len(valor)} campos, ref. {_huella(valor)})"
    if isinstance(valor, list):
        return f"Lista ({len(valor)} elementos, ref. {_huella(valor)})"
    return _cortar(str(valor))


def _parece_archivo(clave: str, valor: str) -> bool:
    hoja = clave.lower()
    if any(tok in hoja for tok in ("logo", "imagen", "foto", "archivo", "base64", "blob", "adjunto")):
        return True
    return valor.startswith("data:") or (len(valor) > 400 and " " not in valor[:80])


def _cortar(texto: str, limite: int = 1500) -> str:
    if len(texto) <= limite:
        return texto
    return texto[: limite - 1] + "…"


def _agregar_cambios(clave: str, antes: Any, despues: Any, out: List[dict], profundidad: int = 0) -> None:
    if _es_ruido(clave):
        return
    if not _distinto(antes, despues):
        return
    if (
        profundidad < 1
        and isinstance(despues, dict)
        and (antes is None or isinstance(antes, dict))
        and not _es_geo(clave, despues)
        and not _es_geo(clave, antes)
    ):
        izq = antes if isinstance(antes, dict) else {}
        if len(izq) + len(despues) <= 40 and _serial_len(izq) <= 4000 and _serial_len(despues) <= 4000:
            hubo = False
            marca = len(out)
            for sub in sorted(set(izq) | set(despues), key=str):
                _agregar_cambios(f"{clave}.{sub}", izq.get(sub), despues.get(sub), out, profundidad + 1)
                hubo = hubo or len(out) > marca
            if hubo or (not izq and not despues):
                return
    out.append({
        "campo": clave,
        "etiqueta": etiqueta_campo(clave),
        "anterior": _presentar(clave, antes),
        "nuevo": _presentar(clave, despues),
    })


def _campos_de_par(antes: Optional[dict], despues: Optional[dict], *, solo_claves: Optional[Sequence[str]] = None) -> List[dict]:
    izq = antes or {}
    der = despues or {}
    if solo_claves is not None:
        claves = [c for c in solo_claves if c in der or c in izq]
    else:
        claves = sorted(set(izq) | set(der), key=str)
    out: List[dict] = []
    for clave in claves:
        if _es_ruido(clave):
            continue
        _agregar_cambios(clave, izq.get(clave), der.get(clave), out, 0)
    return out


def _campos_creacion(row: dict) -> List[dict]:
    out: List[dict] = []
    for clave in sorted(row.keys(), key=str):
        if _es_ruido(clave):
            continue
        val = row.get(clave)
        if val is None or val == "":
            continue
        if isinstance(val, (dict, list)) and len(val) == 0:
            continue
        out.append({
            "campo": clave,
            "etiqueta": etiqueta_campo(clave),
            "anterior": "—",
            "nuevo": _presentar(clave, val),
        })
    return out


def _campos_eliminacion(row: dict) -> List[dict]:
    out: List[dict] = []
    for clave in sorted(row.keys(), key=str):
        if _es_ruido(clave):
            continue
        val = row.get(clave)
        if val is None or val == "":
            continue
        if isinstance(val, (dict, list)) and len(val) == 0:
            continue
        out.append({
            "campo": clave,
            "etiqueta": etiqueta_campo(clave),
            "anterior": _presentar(clave, val),
            "nuevo": "—",
        })
    return out


def _filas(data: Any) -> List[dict]:
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    return []


def _indexar(rows: Sequence[dict]) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for row in rows:
        if row.get("id") is not None:
            out[str(row.get("id"))] = row
    return out


def _emparejar(antes: Sequence[dict], despues: Sequence[dict]) -> List[Tuple[dict, dict]]:
    if not antes and not despues:
        return []
    por_id_a = _indexar(antes)
    por_id_d = _indexar(despues)
    if por_id_a and por_id_d:
        pares = []
        vistos = set()
        for clave, der in por_id_d.items():
            izq = por_id_a.get(clave)
            if izq is not None:
                pares.append((izq, der))
                vistos.add(clave)
        for clave, izq in por_id_a.items():
            if clave not in vistos and clave not in por_id_d:
                continue
        return pares or list(zip(antes, despues))
    return list(zip(antes, despues))


def _contrato_de(row: Optional[dict]) -> Optional[int]:
    if not isinstance(row, dict):
        return None
    val = row.get("contrato_id")
    if val in (None, ""):
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _evento(
    *,
    tabla: str,
    operacion: str,
    row: dict,
    campos: List[dict],
    aviso: Optional[str],
) -> Optional[dict]:
    if operacion == "EDITAR" and not campos:
        return None
    if operacion in ("CREAR", "ELIMINAR") and not campos:
        etiqueta = etiqueta_registro(tabla, row)
        campos = [{
            "campo": "_registro",
            "etiqueta": "Registro",
            "anterior": "—" if operacion == "CREAR" else etiqueta,
            "nuevo": etiqueta if operacion == "CREAR" else "—",
        }]
    registro = etiqueta_registro(tabla, row)
    anterior = {c["etiqueta"]: c["anterior"] for c in campos}
    nuevo = {c["etiqueta"]: c["nuevo"] for c in campos}
    rid = row.get("id")
    return {
        "accion": operacion,
        "operacion": operacion,
        "modulo": modulo_de_tabla(tabla),
        "entidad_tipo": tabla,
        "entidad_id": None if rid is None else str(rid),
        "registro": registro,
        "campos": campos,
        "carga_id": None,
        "aviso": aviso,
        "valor_anterior": anterior if operacion != "CREAR" else None,
        "valor_nuevo": nuevo if operacion != "ELIMINAR" else None,
        "contrato_id": _contrato_de(row),
    }


def construir_eventos(
    *,
    tabla: str,
    metodo: str,
    payload: Any,
    antes: Optional[List[dict]],
    despues: Optional[List[dict]],
    es_upsert: bool,
    es_carga: bool,
    carga_id: Optional[str],
    aviso: Optional[str] = None,
    claves_conflicto: Optional[Sequence[str]] = None,
) -> List[dict]:
    """
    Arma un evento por registro afectado.
    `antes is None` significa que no se pudo leer el estado previo (no se inventa un cambio).
    """
    metodo_u = (metodo or "").upper()
    eventos: List[dict] = []

    if metodo_u == "POST" and not es_upsert:
        filas = despues or _filas(payload)
        for row in filas:
            ev = _evento(tabla=tabla, operacion="CREAR", row=row, campos=_campos_creacion(row), aviso=aviso)
            if ev:
                eventos.append(ev)
    elif metodo_u == "POST" and es_upsert:
        if antes is None:
            return []
        nuevos = despues or _filas(payload)
        claves = list(claves_conflicto or ["id"])
        idx: Dict[Tuple[str, ...], dict] = {}
        for row in antes:
            idx[_llave(row, claves)] = row
        for row in nuevos:
            previo = idx.get(_llave(row, claves))
            if previo is None:
                ev = _evento(tabla=tabla, operacion="CREAR", row=row, campos=_campos_creacion(row), aviso=aviso)
            else:
                actual = dict(previo)
                actual.update(row)
                if len(row) >= len(previo) and len(previo) > 0:
                    actual = row
                campos = _campos_de_par(previo, actual)
                ev = _evento(tabla=tabla, operacion="EDITAR", row=actual, campos=campos, aviso=aviso)
            if ev:
                eventos.append(ev)
    elif metodo_u in ("PATCH", "PUT"):
        if not antes:
            return []
        nuevos = despues or []
        if not nuevos and isinstance(payload, dict):
            nuevos = []
            for row in antes:
                fusion = dict(row)
                fusion.update(payload)
                nuevos.append(fusion)
        for previo, actual in _emparejar(antes, nuevos):
            fusion = dict(previo)
            fusion.update(actual)
            uso = actual if len(actual) >= len(previo) and len(previo) > 0 else fusion
            campos = _campos_de_par(previo, uso)
            ev = _evento(tabla=tabla, operacion="EDITAR", row=uso, campos=campos, aviso=aviso)
            if ev:
                eventos.append(ev)
    elif metodo_u == "DELETE":
        filas_previas = antes if antes is not None else (despues or [])
        if antes is None and not filas_previas:
            return []
        if not filas_previas:
            return []
        for row in filas_previas:
            ev = _evento(tabla=tabla, operacion="ELIMINAR", row=row, campos=_campos_eliminacion(row), aviso=aviso)
            if ev:
                eventos.append(ev)
    else:
        return []

    if not eventos:
        return []
    masiva = bool(es_carga) or len(eventos) > 1
    if not masiva:
        return eventos
    cid = carga_id or str(uuid.uuid4())
    for ev in eventos:
        ev["operacion"] = ev.get("operacion") or ev["accion"]
        ev["accion"] = "CARGA_MASIVA"
        ev["carga_id"] = cid
    return eventos


def _llave(row: dict, claves: Sequence[str]) -> Tuple[str, ...]:
    return tuple("" if row.get(c) is None else str(row.get(c)) for c in claves)


def fila_log(evento: dict, ctx: Optional[ContextoAuditoria]) -> dict:
    usuario = (ctx.usuario if ctx else None) or {}
    uid = usuario.get("sub") or usuario.get("id")
    uid_int = None
    if uid is not None and str(uid).strip() != "":
        try:
            uid_int = int(str(uid).strip())
        except (TypeError, ValueError):
            uid_int = None
    nombre = (usuario.get("nombre") or usuario.get("email") or "").strip() or "SISTEMA"
    campos = evento.get("campos") or []
    busqueda = " ".join(
        p
        for p in [
            nombre,
            evento.get("modulo") or "",
            evento.get("accion") or "",
            evento.get("operacion") or "",
            evento.get("registro") or "",
            evento.get("carga_id") or "",
            " ".join(
                f"{c.get('etiqueta', '')} {c.get('anterior', '')} {c.get('nuevo', '')}"
                for c in campos
            ),
        ]
        if p
    )[:4000]
    detalle = {
        "tipo": TIPO_DETALLE,
        "registro": evento.get("registro"),
        "operacion": evento.get("operacion"),
        "carga_id": evento.get("carga_id"),
        "campos": campos,
        "busqueda": busqueda,
    }
    if evento.get("aviso"):
        detalle["aviso"] = evento["aviso"]
    contrato_id = evento.get("contrato_id")
    if contrato_id is None:
        raw = usuario.get("contrato_id")
        try:
            contrato_id = int(raw) if raw not in (None, "") else None
        except (TypeError, ValueError):
            contrato_id = None
    contrato_numero = usuario.get("contrato_numero") or None
    if contrato_id is not None and usuario.get("contrato_id") not in (None, ""):
        try:
            if int(usuario.get("contrato_id")) != int(contrato_id):
                contrato_numero = None
        except (TypeError, ValueError):
            pass
    return {
        "usuario_id": uid_int,
        "usuario_nombre": nombre,
        "cargo_nombre": usuario.get("cargo_nombre") or "",
        "rol_nombre": usuario.get("rol_nombre") or None,
        "contrato_id": contrato_id,
        "contrato_numero": contrato_numero,
        "accion": evento.get("accion"),
        "modulo": evento.get("modulo"),
        "entidad_tipo": evento.get("entidad_tipo"),
        "entidad_id": evento.get("entidad_id"),
        "detalle": detalle,
        "resultado": "ok",
        "valor_anterior": evento.get("valor_anterior"),
        "valor_nuevo": evento.get("valor_nuevo"),
        "ip": ctx.ip if ctx else None,
        "categoria": CATEGORIA,
        "severidad": "INFO",
        "endpoint": ctx.endpoint if ctx else None,
        "metodo_http": ctx.metodo_http if ctx else None,
        "busqueda": busqueda,
        "registro_etiqueta": evento.get("registro"),
        "carga_id": evento.get("carga_id"),
        "alerta_generada": False,
    }


def _header(req: Any, nombre: str) -> str:
    headers = getattr(req, "headers", None) or {}
    try:
        val = headers.get(nombre)
        if val:
            return str(val)
    except Exception:
        pass
    try:
        for k, v in headers.items():
            if str(k).lower() == nombre.lower():
                return str(v)
    except Exception:
        pass
    return ""


def _es_upsert(req: Any) -> bool:
    prefer = _header(req, "prefer").lower()
    if "resolution=merge-duplicates" in prefer or "resolution=ignore-duplicates" in prefer:
        return True
    return bool(_param(req, "on_conflict"))


def _param(req: Any, clave: str) -> str:
    params = getattr(req, "params", None)
    if params is None:
        return ""
    try:
        val = params.get(clave)
    except Exception:
        return ""
    return "" if val is None else str(val)


def _claves_conflicto(req: Any) -> List[str]:
    raw = _param(req, "on_conflict")
    cols = [c.strip() for c in raw.split(",") if c.strip()]
    return cols or ["id"]


def _headers_lectura(req: Any) -> Dict[str, str]:
    src = getattr(req, "headers", None) or {}
    try:
        items = list(src.items())
    except Exception:
        items = []
    drop = {"prefer", "content-type", "content-length"}
    out = {str(k): str(v) for k, v in items if str(k).lower() not in drop}
    out["Accept"] = "application/json"
    out["Range"] = f"0-{SNAPSHOT_MAX - 1}"
    out["Range-Unit"] = "items"
    return out


def _params_select_all(req: Any) -> Any:
    params = getattr(req, "params", None)
    if params is None:
        return {"select": "*"}
    if hasattr(params, "set"):
        return params.set("select", "*")
    if isinstance(params, dict):
        copia = dict(params)
        copia["select"] = "*"
        return copia
    return params


def _aviso_rango(resp: Any, n: int) -> Optional[str]:
    try:
        cr = resp.headers.get("content-range") or resp.headers.get("Content-Range") or ""
    except Exception:
        cr = ""
    total = ""
    if "/" in str(cr):
        total = str(cr).split("/")[-1].strip()
    if total.isdigit() and int(total) > n:
        return (
            f"La operación afectó {total} registros. "
            f"El log detalla los primeros {n} para no alterar la respuesta."
        )
    return None


def _leer_json(resp: Any) -> Any:
    try:
        return resp.json()
    except Exception:
        return None


def leer_antes(req: Any) -> Tuple[Optional[List[dict]], Optional[str]]:
    """Devuelve (filas, aviso). filas None si la lectura falló."""
    session = getattr(req, "session", None)
    if session is None or not hasattr(session, "request"):
        return None, None
    try:
        resp = session.request(
            "GET",
            str(getattr(req, "path", "")),
            params=_params_select_all(req),
            headers=_headers_lectura(req),
            auth=getattr(req, "auth", None),
        )
    except Exception:
        _log.debug("auditoria: no se pudo leer el estado anterior", exc_info=True)
        return None, None
    status = getattr(resp, "status_code", 500) or 500
    if status >= 400:
        return None, None
    data = _leer_json(resp)
    filas = _filas(data)
    return filas, _aviso_rango(resp, len(filas))


def _leer_antes_upsert(req: Any, payload: Any) -> Tuple[Optional[List[dict]], Optional[str]]:
    """Lee las filas que ya existen para las llaves de conflicto del upsert."""
    session = getattr(req, "session", None)
    if session is None or not hasattr(session, "request"):
        return None, None
    claves = _claves_conflicto(req)
    filas_payload = _filas(payload)
    if not filas_payload:
        return [], None
    if len(claves) == 1:
        col = claves[0]
        valores = []
        for row in filas_payload:
            if row.get(col) is None:
                continue
            val = row.get(col)
            if isinstance(val, str):
                valores.append(f'"{val}"')
            else:
                valores.append(str(val))
        if not valores:
            return [], None
        params = {"select": "*", col: f"in.({','.join(valores[:SNAPSHOT_MAX])})"}
    else:
        partes = []
        for row in filas_payload[:SNAPSHOT_MAX]:
            if any(row.get(c) is None for c in claves):
                continue
            bits = []
            for c in claves:
                val = row.get(c)
                rendered = f'"{val}"' if isinstance(val, str) else str(val)
                bits.append(f"{c}.eq.{rendered}")
            partes.append("and(" + ",".join(bits) + ")")
        if not partes:
            return [], None
        params = {"select": "*", "or": f"({','.join(partes)})"}
    try:
        resp = session.request(
            "GET",
            str(getattr(req, "path", "")),
            params=params,
            headers=_headers_lectura(req),
            auth=getattr(req, "auth", None),
        )
    except Exception:
        _log.debug("auditoria: no se pudo leer el estado anterior del upsert", exc_info=True)
        return None, None
    if (getattr(resp, "status_code", 500) or 500) >= 400:
        return None, None
    return _filas(_leer_json(resp)), None


def _persistir(filas: List[dict]) -> None:
    fn = _insertar
    if not fn or not filas:
        return
    token = _en_auditoria.set(True)
    try:
        for i in range(0, len(filas), 40):
            chunk = filas[i : i + 40]
            try:
                ok = fn(chunk if len(chunk) > 1 else chunk[0])
            except Exception:
                _log.debug("auditoria: insert del log falló", exc_info=True)
                ok = False
            if ok is False and len(chunk) > 1:
                for row in chunk:
                    try:
                        fn(row)
                    except Exception:
                        _log.debug("auditoria: insert individual del log falló", exc_info=True)
    finally:
        _en_auditoria.reset(token)


def _datos_resultado(resultado: Any) -> Any:
    if resultado is None:
        return None
    if isinstance(resultado, (dict, list)):
        return resultado
    return getattr(resultado, "data", None)


def _auditar_execute(builder: Any, orig: Callable) -> Any:
    req = getattr(builder, "request", None)
    if req is None:
        return orig(builder)
    try:
        metodo = str(getattr(req, "http_method", "") or "").upper()
    except Exception:
        return orig(builder)
    if metodo not in ("POST", "PATCH", "PUT", "DELETE"):
        return orig(builder)
    if _en_auditoria.get():
        return orig(builder)

    tabla = tabla_desde_path(getattr(req, "path", ""))
    if tabla == "logs":
        if metodo in ("PATCH", "PUT", "DELETE") or _es_upsert(req):
            raise AuditoriaInmutableError(
                "Las entradas del log no se pueden modificar ni eliminar."
            )
        return orig(builder)
    if not tabla or tabla.lower() in _TABLAS_OMITIDAS or tabla.lower().endswith("_counter"):
        return orig(builder)

    payload = getattr(req, "json", None)
    # Un parche que solo toca marcas de tiempo no es una modificación de datos
    # y no debe sumar una lectura previa a la operación.
    if metodo in ("PATCH", "PUT") and isinstance(payload, dict) and payload:
        if all(_es_ruido(k) for k in payload):
            return orig(builder)
    es_upsert = metodo == "POST" and _es_upsert(req)
    antes: Optional[List[dict]] = None
    aviso: Optional[str] = None
    try:
        if metodo in ("PATCH", "PUT", "DELETE"):
            antes, aviso = leer_antes(req)
        elif es_upsert:
            antes, aviso = _leer_antes_upsert(req, payload)
    except Exception:
        _log.debug("auditoria: lectura previa falló", exc_info=True)
        antes, aviso = None, None

    resultado = orig(builder)

    try:
        despues = _filas(_datos_resultado(resultado))
        if metodo == "DELETE" and antes is None and despues:
            antes = despues
        ctx = _ctx.get()
        eventos = construir_eventos(
            tabla=tabla,
            metodo=metodo,
            payload=payload,
            antes=antes,
            despues=despues,
            es_upsert=es_upsert,
            es_carga=bool(ctx and ctx.es_carga),
            carga_id=ctx.carga_id if ctx else None,
            aviso=aviso,
            claves_conflicto=_claves_conflicto(req) if es_upsert else None,
        )
        filas_log = [fila_log(ev, ctx) for ev in eventos]
        _persistir(filas_log)
    except AuditoriaInmutableError:
        raise
    except Exception:
        _log.debug("auditoria: no se pudo registrar la modificación", exc_info=True)
    return resultado


def instalar() -> None:
    """Envuelve el execute síncrono de PostgREST. Idempotente."""
    global _instalado, _orig_execute
    if _instalado:
        return
    from postgrest._sync.request_builder import SyncQueryRequestBuilder

    _orig_execute = SyncQueryRequestBuilder.execute

    def execute(self):
        return _auditar_execute(self, _orig_execute)

    SyncQueryRequestBuilder.execute = execute  # type: ignore[method-assign]
    _instalado = True


def desinstalar() -> None:
    """Revierte el parche. Solo para pruebas."""
    global _instalado, _orig_execute
    if not _instalado or _orig_execute is None:
        _instalado = False
        return
    from postgrest._sync.request_builder import SyncQueryRequestBuilder

    SyncQueryRequestBuilder.execute = _orig_execute  # type: ignore[method-assign]
    _instalado = False
    _orig_execute = None

