"""Rutas HTTP Topografia — montadas en main con prefijo `/topografia`."""
from __future__ import annotations

import base64
import html
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from main import _require_contract_access, get_current_user, supabase, supabase_execute
from topografia_permissions import require_permiso_topografia, tiene_permiso_topografia
from topografia_utils import (
    area_por_coordenadas,
    azimut_desde_deltas,
    calcular_verificacion_estacion_total,
    calcular_verificacion_nivel,
    decimal_a_gms_numero,
    decimal_to_gms,
    ajustar_poligonal_armadas,
    enriquecer_estaciones_poligonal,
    fusionar_estaciones_vista,
    gms_to_decimal,
    html_documento_poligonal_pdf,
    calcular_cierre_poligonal,
    interseccion_dos_puntos,
    perimetro_por_coordenadas,
    radiar_armadas,
    svg_interseccion,
    svg_poligono,
    to_pdf_bytes,
)

router = APIRouter(tags=["topografia"])

NIVEL_MAX = 2


def _perm(current_user, accion: str) -> None:
    require_permiso_topografia(current_user, accion)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def _sanitize_uuid_optional(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    return value


def _dump_model(body: BaseModel, uuid_fields: tuple[str, ...] = (), exclude: Optional[set] = None) -> dict:
    # mode="json" convierte date/datetime a string ISO para que Supabase/JSON no falle.
    data = body.model_dump(mode="json", exclude=exclude or set())
    for field in uuid_fields:
        if field in data:
            data[field] = _sanitize_uuid_optional(data[field])
    return data


def _row(table: str, select: str = "*", **eq) -> Optional[dict]:
    q = supabase.table(table).select(select)
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data or []
    return rows[0] if rows else None


def _require_contrato_row(contrato_id: int) -> dict:
    row = _row(
        "contratos",
        "id, numero, objeto, contratista, nit, interventoria, entidad, entidad_otra, logo_contratista, logo_interventoria",
        id=contrato_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    return row


def _assert_editable(nivel_validacion: int) -> None:
    if int(nivel_validacion or 0) >= NIVEL_MAX:
        raise HTTPException(status_code=403, detail="Registro sellado; no editable")


def _punto_verificado(punto_id: str, contrato_id: int) -> dict:
    p = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if not p.get("verificado"):
        raise HTTPException(status_code=422, detail="El punto no esta verificado")
    return p


def _crear_punto_amarre(contrato_id: int, amarre: AmarreBody) -> str:
    nombre = (amarre.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="Indique el nombre del punto de amarre.")
    existing = _row("topo_puntos", contrato_id=contrato_id, nombre=nombre)
    if existing:
        if existing.get("verificado"):
            return existing["id"]
        supabase.table("topo_puntos").update(
            {
                "norte": amarre.norte,
                "este": amarre.este,
                "cota": amarre.cota,
                "tipo": "BM",
            }
        ).eq("id", existing["id"]).execute()
        return existing["id"]
    row = (
        supabase.table("topo_puntos")
        .insert(
            {
                "contrato_id": contrato_id,
                "nombre": nombre,
                "norte": amarre.norte,
                "este": amarre.este,
                "cota": amarre.cota,
                "tipo": "BM",
                "verificado": False,
                "modulo_origen": "poligonal_amarre",
            }
        )
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear el punto de amarre")
    return row[0]["id"]


def _resolver_amarres_poligonal(contrato_id: int, body: PoligonalBody, payload: dict) -> None:
    if payload.get("punto_inicial_id"):
        _punto_verificado(payload["punto_inicial_id"], contrato_id)
    elif body.amarre_inicial:
        payload["punto_inicial_id"] = _crear_punto_amarre(contrato_id, body.amarre_inicial)
    else:
        raise HTTPException(
            status_code=422,
            detail="Indique el punto de amarre inicial (nombre, Norte y Este) o seleccione un BM verificado.",
        )

    if payload["tipo"] == "cerrada":
        payload["punto_final_id"] = payload["punto_inicial_id"]
    elif payload.get("punto_final_id"):
        _punto_verificado(payload["punto_final_id"], contrato_id)
    elif body.amarre_final:
        payload["punto_final_id"] = _crear_punto_amarre(contrato_id, body.amarre_final)

    # Punto de visado (referencia para el azimut de partida).
    if payload.get("punto_visado_id"):
        _punto_verificado(payload["punto_visado_id"], contrato_id)
    elif body.amarre_visado:
        payload["punto_visado_id"] = _crear_punto_amarre(contrato_id, body.amarre_visado)


def _calcular_base_visado(punto_estacion: Optional[dict], punto_visado: Optional[dict]) -> Optional[dict]:
    """Azimut y distancia de la base estacion -> visado a partir de sus coordenadas."""
    if not punto_estacion or not punto_visado:
        return None
    ne, ee = punto_estacion.get("norte"), punto_estacion.get("este")
    nv, ev = punto_visado.get("norte"), punto_visado.get("este")
    if ne is None or ee is None or nv is None or ev is None:
        return None
    dn = float(nv) - float(ne)
    de = float(ev) - float(ee)
    distancia = (dn ** 2 + de ** 2) ** 0.5
    azimut = azimut_desde_deltas(dn, de)
    return {
        "estacion": punto_estacion.get("nombre"),
        "visado": punto_visado.get("nombre"),
        "delta_norte": round(dn, 3),
        "delta_este": round(de, 3),
        "distancia": round(distancia, 3),
        "azimut_decimal": round(azimut, 6),
        "azimut_gms": decimal_a_gms_numero(azimut),
        "azimut_texto": decimal_to_gms(azimut),
    }


def _firma_imagen_a_data_uri(src: str) -> str:
    """URL o data URI de firma → data:image/...;base64,... (evita cuelgues en PDF)."""
    if not src:
        return ""
    if str(src).startswith("data:image"):
        return str(src)
    try:
        import httpx

        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            r = client.get(str(src))
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
            if not ct.startswith("image/"):
                ct = "image/png"
            b64 = base64.b64encode(r.content).decode("ascii")
            return f"data:{ct};base64,{b64}"
    except Exception:
        return ""


def _firmas_para_pdf(firmas: List[dict]) -> List[dict]:
    out = []
    for f in firmas or []:
        img = f.get("firma_base64") or ""
        if img.startswith("http://") or img.startswith("https://"):
            img = _firma_imagen_a_data_uri(img)
        out.append({**f, "firma_base64": img})
    return out


def _guardar_firma(modulo: str, referencia_id: str, body: "FirmaBody", uid: int) -> dict:
    row = (
        supabase.table("topo_firmas")
        .insert(
            {
                "modulo": modulo,
                "referencia_id": referencia_id,
                "tipo_firmante": body.tipo_firmante,
                "nombre_firmante": body.nombre_firmante,
                "cargo_firmante": body.cargo_firmante,
                "matricula": body.matricula,
                "firma_base64": body.firma_base64,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


def _firmas_referencia(referencia_id: str) -> List[dict]:
    return (
        supabase.table("topo_firmas")
        .select("*")
        .eq("referencia_id", referencia_id)
        .order("fecha_firma")
        .execute()
        .data
        or []
    )


class PuntoBody(BaseModel):
    nombre: str
    norte: Optional[float] = None
    este: Optional[float] = None
    cota: Optional[float] = None
    tipo: Literal["BM", "estacion", "auxiliar", "PI", "cambio"] = "BM"
    verificado: bool = False


class AmarreBody(BaseModel):
    nombre: str
    norte: float
    este: float
    cota: Optional[float] = None


class PoligonalBody(BaseModel):
    nombre: str
    tipo: Literal["abierta", "cerrada"] = "cerrada"
    sentido: Literal["horario", "antihorario"] = "antihorario"
    punto_inicial_id: Optional[str] = None
    punto_final_id: Optional[str] = None
    punto_visado_id: Optional[str] = None
    amarre_inicial: Optional[AmarreBody] = None
    amarre_final: Optional[AmarreBody] = None
    amarre_visado: Optional[AmarreBody] = None
    tolerancia_relativa: int = 3000
    tolerancia_cota_mm_km: float = 12
    precision_angular_seg: float = 10.0
    longitud_max_delta_m: float = 300.0
    metodo: Literal["trigonometrica"] = "trigonometrica"
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    equipo_marca: Optional[str] = None
    equipo_referencia: Optional[str] = None
    equipo_serial: Optional[str] = None
    fecha_campo: Optional[date] = None


class EstacionBody(BaseModel):
    orden: Optional[int] = None
    armada_id: Optional[str] = None
    tipo_punto: Literal["estacion", "auxiliar"] = "auxiliar"
    nombre_punto: str
    angulo_gms: float
    distancia: Optional[float] = None  # opcional: en armadas de cierre puede no medirse
    altura_instrumento: Optional[float] = None  # se hereda de la armada si no viene
    angulo_vertical_gms: Optional[float] = None  # opcional: solo para nivelacion trigonométrica
    altura_objetivo: Optional[float] = 0
    lectura_mira: Optional[float] = None


class EstacionEditBody(BaseModel):
    tipo_punto: Optional[Literal["estacion", "auxiliar"]] = None
    nombre_punto: Optional[str] = None
    angulo_gms: Optional[float] = None
    angulo_vertical_gms: Optional[float] = None
    distancia: Optional[float] = None
    altura_objetivo: Optional[float] = None


class ArmadaBody(BaseModel):
    estacion_nombre: str
    visado_nombre: str
    altura_instrumento: Optional[float] = None


class ArmadaUpdateBody(BaseModel):
    estacion_nombre: Optional[str] = None
    visado_nombre: Optional[str] = None
    altura_instrumento: Optional[float] = None


class NivelacionBody(BaseModel):
    nombre: str
    tipo: Literal["abierta", "cerrada"] = "abierta"
    bm_inicial_id: Optional[str] = None
    bm_final_id: Optional[str] = None
    tolerancia_mm_km: float = 12
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    fecha_campo: Optional[date] = None


class LecturaNivelBody(BaseModel):
    orden: int
    nombre_punto: str
    tipo_punto: Literal["BM", "TP", "cambio"] = "TP"
    lectura_atras: Optional[float] = None
    lectura_adelante: Optional[float] = None
    distancia_atras: Optional[float] = None
    distancia_adelante: Optional[float] = None


class AreaBody(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    puntos: List[dict]
    operador: Optional[str] = None
    fecha: Optional[date] = None


class InterseccionBody(BaseModel):
    nombre_punto_nuevo: str
    descripcion: Optional[str] = None
    punto1_id: str
    azimut1_gms: float
    distancia1: float
    punto2_id: str
    azimut2_gms: float
    distancia2: float
    tolerancia_lineal: float = 0.05
    tolerancia_angular_seg: float = 30
    operador: Optional[str] = None
    fecha: Optional[date] = None


class EquipoBody(BaseModel):
    nombre: str
    tipo: Literal["nivel", "estacion_total", "gps", "otro"]
    marca: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    propietario: Optional[str] = None
    activo: bool = True


class VerificacionEquipoBody(BaseModel):
    fecha: date
    tipo_verificacion: Literal["nivel", "estacion_total"]
    operador: Optional[str] = None
    condiciones: Optional[str] = None
    resultados: dict
    observaciones: Optional[str] = None
    proxima_verificacion: Optional[date] = None
    tolerancia_mm: float = 2.0
    tolerancia_seg: float = 30.0


class ViaProyectoBody(BaseModel):
    nombre: str
    abscisa_inicio: Optional[float] = None
    abscisa_fin: Optional[float] = None
    ancho_calzada: Optional[float] = None
    capas: Optional[dict] = None
    cota_subrasante: Optional[dict] = None


class ViaRegistroBody(BaseModel):
    proyecto_id: str
    capa_recibir: Optional[str] = None
    calzada: Optional[str] = None
    bm_referencia_id: Optional[str] = None
    fecha_campo: Optional[date] = None
    operador: Optional[str] = None
    area_intervencion: Optional[dict] = None


class ViaLecturaBody(BaseModel):
    orden: int
    abscisa: float
    punto_tomado: Optional[str] = None
    altura_instrumento: Optional[float] = None
    lectura_mira: Optional[float] = None
    cota_diseno: Optional[float] = None
    tolerancia_m: float = 0.02


class TuberiaBody(BaseModel):
    nombre: str
    diametro_nominal: Optional[str] = None
    material: Optional[str] = None
    cota_diseno_inicio: Optional[float] = None
    cota_diseno_fin: Optional[float] = None
    longitud_total: Optional[float] = None
    pendiente_diseno: Optional[float] = None
    factor_atraque: Optional[float] = None
    ancho_excavacion: Optional[float] = None
    numero_tubos: Optional[int] = None
    tolerancia_cm: float = 2.0
    fecha_inicio: Optional[date] = None


class TuberiaRegistroBody(BaseModel):
    fecha: date
    bm_referencia_id: Optional[str] = None
    altura_instrumento: Optional[float] = None
    operador: Optional[str] = None


class TuberiaTuboBody(BaseModel):
    numero_tubo: int
    abscisa_inicio: float
    abscisa_fin: float
    cota_diseno_inicio: Optional[float] = None
    cota_diseno_fin: Optional[float] = None
    lectura_mira_inicio: Optional[float] = None
    lectura_mira_fin: Optional[float] = None


class FirmaBody(BaseModel):
    tipo_firmante: str = "topografo"
    nombre_firmante: str
    cargo_firmante: Optional[str] = None
    matricula: Optional[str] = None
    firma_base64: str


# ── BIBLIOTECA DE PUNTOS ──────────────────────────────────────────────────────

@router.get("/{contrato_id}/puntos")
def listar_puntos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_puntos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("nombre")
        .execute()
        .data
        or []
    )


@router.get("/{contrato_id}/puntos/verificados")
def listar_puntos_verificados(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_puntos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("verificado", True)
        .order("nombre")
        .execute()
        .data
        or []
    )


@router.get("/{contrato_id}/operadores")
def listar_operadores(contrato_id: int, current_user=Depends(get_current_user)):
    """Usuarios activos del contrato cuyo cargo esta relacionado con topografia.

    Coincide por nombre de cargo: 'topograf...' (Topografo, Coordinador de Topografia,
    Auxiliar de Topografia) o 'cadenero'.
    """
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    cargos = {
        c["id"]: (c.get("nombre") or "")
        for c in (supabase.table("cargos").select("id, nombre").execute().data or [])
    }

    def es_topo(cargo_id) -> bool:
        n = (cargos.get(cargo_id) or "").lower()
        return "topograf" in n or "cadenero" in n or "desarrollador" in n

    by_id: Dict[Any, dict] = {}
    directos = (
        supabase.table("usuarios")
        .select("id, nombre, apellidos, cargo_id")
        .eq("activo", True)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    for r in directos:
        by_id[r["id"]] = r

    vinculos = (
        supabase.table("usuario_contratos")
        .select("usuario_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    extra_ids = list({v["usuario_id"] for v in vinculos if v.get("usuario_id") is not None} - set(by_id.keys()))
    for i in range(0, len(extra_ids), 120):
        part = extra_ids[i : i + 120]
        if not part:
            continue
        extra = (
            supabase.table("usuarios")
            .select("id, nombre, apellidos, cargo_id")
            .eq("activo", True)
            .in_("id", part)
            .execute()
            .data
            or []
        )
        for r in extra:
            by_id[r["id"]] = r

    out = []
    for r in by_id.values():
        if not es_topo(r.get("cargo_id")):
            continue
        nombre = f"{r.get('nombre', '') or ''} {r.get('apellidos', '') or ''}".strip()
        out.append({"id": r["id"], "nombre": nombre, "cargo": cargos.get(r.get("cargo_id"), "")})
    out.sort(key=lambda x: (x.get("nombre") or "").lower())
    return out


@router.post("/{contrato_id}/puntos")
def crear_punto(contrato_id: int, body: PuntoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.verificado and not body.norte and body.tipo != "BM":
        raise HTTPException(status_code=422, detail="Solo BM iniciales pueden crearse verificados manualmente")
    row = (
        supabase.table("topo_puntos")
        .insert(
            {
                "contrato_id": contrato_id,
                "nombre": body.nombre.strip(),
                "norte": body.norte,
                "este": body.este,
                "cota": body.cota,
                "tipo": body.tipo,
                "verificado": body.verificado,
                "fecha_verificacion": datetime.now(timezone.utc).isoformat() if body.verificado else None,
            }
        )
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear el punto")
    return row[0]


@router.put("/{contrato_id}/puntos/{punto_id}")
def actualizar_punto(contrato_id: int, punto_id: str, body: PuntoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    existing = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if existing.get("verificado") and existing.get("circuito_id"):
        raise HTTPException(status_code=403, detail="Punto verificado por circuito; no editable")
    row = (
        supabase.table("topo_puntos")
        .update(
            {
                "nombre": body.nombre.strip(),
                "norte": body.norte,
                "este": body.este,
                "cota": body.cota,
                "tipo": body.tipo,
            }
        )
        .eq("id", punto_id)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
    )
    return row[0] if row else existing


@router.delete("/{contrato_id}/puntos/{punto_id}")
def eliminar_punto(contrato_id: int, punto_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    existing = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if existing.get("verificado") and existing.get("circuito_id"):
        raise HTTPException(status_code=403, detail="Punto verificado por circuito; no eliminable")
    supabase.table("topo_puntos").delete().eq("id", punto_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


# ── POLIGONAL ─────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/poligonales")
def listar_poligonales(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_poligonales")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/poligonales")
def crear_poligonal(contrato_id: int, body: PoligonalBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    payload = body.model_dump(mode="json", exclude={"amarre_inicial", "amarre_final", "amarre_visado"})
    for field in ("punto_inicial_id", "punto_final_id", "punto_visado_id"):
        payload[field] = _sanitize_uuid_optional(payload.get(field))
    if not (payload.get("nombre") or "").strip():
        raise HTTPException(status_code=422, detail="Indique un nombre para la poligonal.")
    _resolver_amarres_poligonal(contrato_id, body, payload)
    row = (
        supabase.table("topo_poligonales")
        .insert({**payload, "contrato_id": contrato_id})
        .execute()
        .data
    )
    if not row:
        return {}
    pol = row[0]
    # Armada 1 automatica: estacion = amarre inicial, visado = punto de visado
    est_nombre = None
    vis_nombre = None
    if pol.get("punto_inicial_id"):
        pi = _row("topo_puntos", id=pol["punto_inicial_id"])
        est_nombre = pi.get("nombre") if pi else None
    if pol.get("punto_visado_id"):
        pv = _row("topo_puntos", id=pol["punto_visado_id"])
        vis_nombre = pv.get("nombre") if pv else None
    supabase.table("topo_poligonal_armadas").insert(
        {
            "poligonal_id": pol["id"],
            "orden": 1,
            "estacion_nombre": est_nombre,
            "visado_nombre": vis_nombre,
            "altura_instrumento": None,
        }
    ).execute()
    return pol


@router.get("/{contrato_id}/poligonales/{poligonal_id}")
def obtener_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    punto_final = _row("topo_puntos", id=pol.get("punto_final_id")) if pol.get("punto_final_id") else None
    punto_visado = _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None

    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    amarres = {}
    for p in (punto_inicial, punto_visado):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}
    armadas_enr, known, estaciones_flat = radiar_armadas(armadas, estaciones, amarres)

    # Puntos disponibles para el selector de cambio de armada
    estacion_names = set()
    if punto_inicial and punto_inicial.get("nombre"):
        estacion_names.add(punto_inicial["nombre"])
    for e in estaciones:
        if (e.get("tipo_punto") or "auxiliar") == "estacion" and e.get("nombre_punto"):
            estacion_names.add(e["nombre_punto"])
    puntos_estacion_disponibles = [
        {"nombre": nom, **known[nom]} for nom in known if nom in estacion_names
    ]
    puntos_visado_disponibles = [{"nombre": nom, **coords} for nom, coords in known.items()]

    cierre = calcular_cierre_poligonal(
        armadas_enr,
        punto_inicial,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        tol_cota_mm_km=pol.get("tolerancia_cota_mm_km") or 12,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        longitud_max_delta_m=pol.get("longitud_max_delta_m"),
    )

    estaciones_vista = fusionar_estaciones_vista(estaciones, estaciones_flat)

    return {
        "poligonal": pol,
        "estaciones": estaciones_vista,
        "estaciones_radiadas": estaciones_flat,
        "armadas": armadas_enr,
        "punto_inicial": punto_inicial,
        "punto_final": punto_final,
        "punto_visado": punto_visado,
        "base": _calcular_base_visado(punto_inicial, punto_visado),
        "puntos_estacion_disponibles": puntos_estacion_disponibles,
        "puntos_visado_disponibles": puntos_visado_disponibles,
        "cierre": cierre,
    }


@router.put("/{contrato_id}/poligonales/{poligonal_id}")
def actualizar_poligonal(contrato_id: int, poligonal_id: str, body: PoligonalBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    row = (
        supabase.table("topo_poligonales")
        .update(_dump_model(
            body,
            ("punto_inicial_id", "punto_final_id", "punto_visado_id"),
            exclude={"amarre_inicial", "amarre_final", "amarre_visado"},
        ))
        .eq("id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else pol


@router.delete("/{contrato_id}/poligonales/{poligonal_id}")
def eliminar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    # estaciones y armadas se eliminan en cascada (FK ON DELETE CASCADE).
    # Los puntos de biblioteca generados por el circuito se conservan; solo se
    # desvincula la referencia al circuito eliminado.
    supabase.table("topo_puntos").update({"circuito_id": None}).eq("circuito_id", poligonal_id).execute()
    supabase.table("topo_poligonales").delete().eq("id", poligonal_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/estaciones")
def agregar_estacion(contrato_id: int, poligonal_id: str, body: EstacionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    if not (body.nombre_punto or "").strip():
        raise HTTPException(status_code=422, detail="Indique el nombre del punto observado.")
    if body.distancia is not None and body.distancia < 0:
        raise HTTPException(status_code=422, detail="La distancia no puede ser negativa.")
    # Armada destino: la indicada o la ultima de la poligonal
    armada = None
    if body.armada_id:
        armada = _row("topo_poligonal_armadas", id=body.armada_id, poligonal_id=poligonal_id)
    if not armada:
        ultimas = (
            supabase.table("topo_poligonal_armadas")
            .select("*")
            .eq("poligonal_id", poligonal_id)
            .order("orden", desc=True)
            .limit(1)
            .execute()
            .data
        )
        armada = ultimas[0] if ultimas else None
    if not armada:
        raise HTTPException(status_code=422, detail="No hay armada activa. Defina la armada (estacion y visado) antes de radiar puntos.")
    # HI: el de la armada (o el enviado para inicializarlo)
    hi = armada.get("altura_instrumento")
    if hi is None:
        hi = body.altura_instrumento
        if hi is not None:
            supabase.table("topo_poligonal_armadas").update({"altura_instrumento": hi}).eq("id", armada["id"]).execute()
    ultima = (
        supabase.table("topo_poligonal_estaciones")
        .select("orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_orden = (ultima[0]["orden"] + 1) if ultima else 1
    row = (
        supabase.table("topo_poligonal_estaciones")
        .insert(
            {
                "poligonal_id": poligonal_id,
                "armada_id": armada["id"],
                "tipo_punto": body.tipo_punto,
                "orden": next_orden,
                "nombre_punto": body.nombre_punto.strip(),
                "angulo_medido": gms_to_decimal(body.angulo_gms),
                "distancia": body.distancia,
                "altura_instrumento": hi,
                "angulo_vertical": gms_to_decimal(body.angulo_vertical_gms) if body.angulo_vertical_gms is not None else None,
                "altura_objetivo": body.altura_objetivo or 0,
                "lectura_mira": body.lectura_mira,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.put("/{contrato_id}/poligonales/{poligonal_id}/estaciones/{estacion_id}")
def editar_estacion(contrato_id: int, poligonal_id: str, estacion_id: str, body: EstacionEditBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    est = _row("topo_poligonal_estaciones", id=estacion_id, poligonal_id=poligonal_id)
    if not est:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    # exclude_unset permite distinguir "no enviado" de "enviado vacio" (limpiar a null).
    enviados = body.model_dump(exclude_unset=True)
    cambios = {}
    if "tipo_punto" in enviados and enviados["tipo_punto"]:
        cambios["tipo_punto"] = enviados["tipo_punto"]
    if "nombre_punto" in enviados:
        if not (enviados["nombre_punto"] or "").strip():
            raise HTTPException(status_code=422, detail="El nombre del punto no puede quedar vacio.")
        cambios["nombre_punto"] = enviados["nombre_punto"].strip()
    if "angulo_gms" in enviados:
        ag = enviados["angulo_gms"]
        cambios["angulo_medido"] = gms_to_decimal(ag) if ag is not None else None
    # Angulo vertical y distancia se pueden limpiar (set a null) en armadas de cierre.
    if "angulo_vertical_gms" in enviados:
        av = enviados["angulo_vertical_gms"]
        cambios["angulo_vertical"] = gms_to_decimal(av) if av is not None else None
    if "angulo_gms" in enviados or "distancia" in enviados:
        cambios["azimut"] = None
        cambios["norte"] = None
        cambios["este"] = None
        cambios["cota"] = None
    if "distancia" in enviados:
        dist = enviados["distancia"]
        if dist is not None and dist < 0:
            raise HTTPException(status_code=422, detail="La distancia no puede ser negativa.")
        cambios["distancia"] = dist
    if "altura_objetivo" in enviados and enviados["altura_objetivo"] is not None:
        cambios["altura_objetivo"] = enviados["altura_objetivo"]
    if not cambios:
        return est
    row = (
        supabase.table("topo_poligonal_estaciones")
        .update(cambios)
        .eq("id", estacion_id)
        .eq("poligonal_id", poligonal_id)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(
            status_code=500,
            detail="No se pudo actualizar el punto (verifique permisos o que la poligonal siga editable).",
        )
    return row[0]


@router.get("/{contrato_id}/poligonales/{poligonal_id}/armadas")
def listar_armadas(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/poligonales/{poligonal_id}/armadas")
def crear_armada(contrato_id: int, poligonal_id: str, body: ArmadaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    if not (body.estacion_nombre or "").strip() or not (body.visado_nombre or "").strip():
        raise HTTPException(status_code=422, detail="Indique la estacion y el visado de la nueva armada.")
    ultimas = (
        supabase.table("topo_poligonal_armadas")
        .select("orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_orden = (ultimas[0]["orden"] + 1) if ultimas else 1
    row = (
        supabase.table("topo_poligonal_armadas")
        .insert(
            {
                "poligonal_id": poligonal_id,
                "orden": next_orden,
                "estacion_nombre": body.estacion_nombre.strip(),
                "visado_nombre": body.visado_nombre.strip(),
                "altura_instrumento": body.altura_instrumento,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.put("/{contrato_id}/poligonales/{poligonal_id}/armadas/{armada_id}")
def actualizar_armada(contrato_id: int, poligonal_id: str, armada_id: str, body: ArmadaUpdateBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    cambios = {k: v for k, v in body.model_dump().items() if v is not None}
    if not cambios:
        return _row("topo_poligonal_armadas", id=armada_id, poligonal_id=poligonal_id) or {}
    # Si cambia el HI de la armada, propagarlo a sus puntos radiados
    if "altura_instrumento" in cambios:
        supabase.table("topo_poligonal_estaciones").update(
            {"altura_instrumento": cambios["altura_instrumento"]}
        ).eq("armada_id", armada_id).execute()
    row = (
        supabase.table("topo_poligonal_armadas")
        .update(cambios)
        .eq("id", armada_id)
        .eq("poligonal_id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else {}


@router.delete("/{contrato_id}/poligonales/{poligonal_id}/armadas/{armada_id}")
def eliminar_armada(contrato_id: int, poligonal_id: str, armada_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("id, orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    if len(armadas) <= 1:
        raise HTTPException(status_code=422, detail="No se puede eliminar la armada inicial.")
    supabase.table("topo_poligonal_armadas").delete().eq("id", armada_id).eq("poligonal_id", poligonal_id).execute()
    return {"ok": True}


class SentidoBody(BaseModel):
    sentido: Literal["horario", "antihorario"]


@router.post("/{contrato_id}/poligonales/{poligonal_id}/sentido")
def set_sentido_poligonal(contrato_id: int, poligonal_id: str, body: SentidoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    row = (
        supabase.table("topo_poligonales")
        .update({"sentido": body.sentido})
        .eq("id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else pol


@router.delete("/{contrato_id}/poligonales/{poligonal_id}/estaciones/{estacion_id}")
def eliminar_estacion(contrato_id: int, poligonal_id: str, estacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))
    supabase.table("topo_poligonal_estaciones").delete().eq("id", estacion_id).eq("poligonal_id", poligonal_id).execute()
    # Reordena los puntos restantes para mantener la secuencia 1..n
    restantes = (
        supabase.table("topo_poligonal_estaciones")
        .select("id")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    for idx, est in enumerate(restantes, start=1):
        supabase.table("topo_poligonal_estaciones").update({"orden": idx}).eq("id", est["id"]).execute()
    return {"ok": True}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/calcular")
def calcular_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Corregir y ajustar: distribuye error angular y aplica Bowditch (azimuts por armadas)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))

    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    amarres = {}
    for p in (
        punto_inicial,
        _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None,
    ):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}

    resultado = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, punto_inicial)
    resumen = resultado["resumen"]
    cierre = resultado["cierre"]

    for upd in resultado["updates"]:
        eid = upd.pop("id")
        supabase.table("topo_poligonal_estaciones").update(upd).eq("id", eid).execute()

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_poligonales").update(
        {
            "error_cierre_dn": resumen["error_dn"],
            "error_cierre_de": resumen["error_de"],
            "error_cierre_dz": resumen["error_dz"],
            "error_lineal": resumen["error_lineal"],
            "precision_relativa": resumen["precision"],
            "suma_angular_obs": cierre.get("suma_observada"),
            "suma_angular_teorica": cierre.get("suma_teorica"),
            "error_angular_seg": cierre.get("error_angular_seg"),
            "num_vertices": cierre.get("num_vertices"),
            "ajustada_at": now,
        }
    ).eq("id", poligonal_id).execute()

    return {"ok": True, "ajustada_at": now, "resumen": resumen, "cierre": cierre}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/cerrar")
def cerrar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))

    # Radiacion por armadas (ceros atras). Los puntos pasan a la biblioteca solo si la
    # poligonal cierra (cierre lineal admisible).
    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    punto_visado = _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None
    amarres = {}
    for p in (punto_inicial, punto_visado):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}
    armadas_enr, _, estaciones_flat = radiar_armadas(armadas, estaciones, amarres)

    cierre = calcular_cierre_poligonal(
        armadas_enr,
        punto_inicial,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        tol_cota_mm_km=pol.get("tolerancia_cota_mm_km") or 12,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        longitud_max_delta_m=pol.get("longitud_max_delta_m"),
    )
    if not cierre.get("cerrado"):
        raise HTTPException(status_code=422, detail="La poligonal aun no cierra: falta la observacion que regresa al punto inicial. Solo se envia a la biblioteca cuando la poligonal ha cerrado.")
    if not cierre.get("admisible_lineal"):
        prec = cierre.get("precision")
        raise HTTPException(status_code=422, detail=f"El cierre lineal es inadmisible (precision 1:{int(prec) if prec else 0}, tolerancia 1:{int(cierre.get('tolerancia_relativa') or 0)}). Revise angulos y distancias antes de enviar a la biblioteca.")

    now = datetime.now(timezone.utc).isoformat()

    if pol.get("punto_inicial_id"):
        pi = _row("topo_puntos", id=pol["punto_inicial_id"], contrato_id=contrato_id)
        if pi:
            supabase.table("topo_puntos").update(
                {
                    "verificado": True,
                    "modulo_origen": "poligonal",
                    "circuito_id": poligonal_id,
                    "fecha_verificacion": now,
                }
            ).eq("id", pi["id"]).execute()

    for est in estaciones_flat:
        if est.get("norte") is None or est.get("este") is None:
            continue
        tipo = "estacion" if (est.get("tipo_punto") == "estacion") else "auxiliar"
        existing = _row("topo_puntos", contrato_id=contrato_id, nombre=est.get("nombre_punto"))
        payload = {
            "contrato_id": contrato_id,
            "nombre": est.get("nombre_punto"),
            "norte": est.get("norte"),
            "este": est.get("este"),
            "cota": est.get("cota"),
            "tipo": tipo,
            "verificado": True,
            "modulo_origen": "poligonal",
            "circuito_id": poligonal_id,
            "fecha_verificacion": now,
        }
        # Persistir coordenadas radiadas en la estacion
        supabase.table("topo_poligonal_estaciones").update(
            {"azimut": est.get("azimut"), "norte": est.get("norte"), "este": est.get("este"), "cota": est.get("cota")}
        ).eq("id", est["id"]).execute()
        if existing:
            supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute()
        else:
            supabase.table("topo_puntos").insert(payload).execute()

    supabase.table("topo_poligonales").update({"estado": "cerrado"}).eq("id", poligonal_id).execute()
    return {"ok": True, "cierre": cierre}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/validar")
def validar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    if not pol.get("ajustada_at"):
        raise HTTPException(
            status_code=422,
            detail="Debe ejecutar «Corregir y ajustar» antes de validar. La validación usa coordenadas ajustadas.",
        )
    nuevo = min(int(pol.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_poligonales").update({"nivel_validacion": nuevo}).eq("id", poligonal_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/firma")
def firma_poligonal(contrato_id: int, poligonal_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    return _guardar_firma("poligonal", poligonal_id, body, _uid(current_user))


@router.post("/{contrato_id}/poligonales/{poligonal_id}/firma-perfil")
def firma_poligonal_desde_perfil(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Registra la firma digital del usuario (imagen en perfil) en la poligonal."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    uid = _uid(current_user)
    u = _row("usuarios", select="id, nombre, cargo, firma_imagen_url", id=uid)
    if not u or not u.get("firma_imagen_url"):
        raise HTTPException(
            status_code=422,
            detail="No tiene imagen de firma en su perfil. Suba la firma en Configuración de usuario.",
        )
    firma_src = _firma_imagen_a_data_uri(u["firma_imagen_url"])
    body = FirmaBody(
        tipo_firmante="topografo",
        nombre_firmante=u.get("nombre") or "Topógrafo",
        cargo_firmante=u.get("cargo"),
        firma_base64=firma_src,
    )
    return _guardar_firma("poligonal", poligonal_id, body, uid)


@router.get("/{contrato_id}/poligonales/{poligonal_id}/pdf")
def pdf_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    try:
        data = obtener_poligonal(contrato_id, poligonal_id, current_user)
        contrato = _require_contrato_row(contrato_id)
        pol = data["poligonal"]
        estaciones = data["estaciones"]
        cierre = data.get("cierre")
        firmas = _firmas_para_pdf(_firmas_referencia(poligonal_id))
        html_doc = html_documento_poligonal_pdf(
            contrato,
            pol,
            estaciones,
            cierre,
            firmas,
            data.get("punto_inicial"),
        )
        pdf = to_pdf_bytes(html_doc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="poligonal_{poligonal_id[:8]}.pdf"'},
    )


# ── NIVELACION ────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/nivelaciones")
def listar_nivelaciones(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_nivelaciones").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/nivelaciones")
def crear_nivelacion(contrato_id: int, body: NivelacionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.bm_inicial_id:
        _punto_verificado(body.bm_inicial_id, contrato_id)
    if body.bm_final_id:
        _punto_verificado(body.bm_final_id, contrato_id)
    row = supabase.table("topo_nivelaciones").insert({**_dump_model(body, ("bm_inicial_id", "bm_final_id")), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/nivelaciones/{nivelacion_id}")
def obtener_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    lecturas = supabase.table("topo_nivelacion_lecturas").select("*").eq("nivelacion_id", nivelacion_id).order("orden").execute().data or []
    return {"nivelacion": niv, "lecturas": lecturas}


@router.put("/{contrato_id}/nivelaciones/{nivelacion_id}")
def actualizar_nivelacion(contrato_id: int, nivelacion_id: str, body: NivelacionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_editable(niv.get("nivel_validacion", 0))
    row = supabase.table("topo_nivelaciones").update(body.model_dump()).eq("id", nivelacion_id).execute().data
    return row[0] if row else niv


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/lecturas")
def agregar_lectura_nivelacion(contrato_id: int, nivelacion_id: str, body: LecturaNivelBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_editable(niv.get("nivel_validacion", 0))
    row = supabase.table("topo_nivelacion_lecturas").insert({**body.model_dump(), "nivelacion_id": nivelacion_id}).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/calcular")
def calcular_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")

    def _rpc():
        return supabase.rpc("topo_calcular_nivelacion", {"p_nivelacion_id": nivelacion_id}).execute()

    res = supabase_execute(_rpc)
    return res.data if res else {}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/cerrar")
def cerrar_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_editable(niv.get("nivel_validacion", 0))
    calc = calcular_nivelacion(contrato_id, nivelacion_id, current_user)
    if not calc.get("admisible"):
        raise HTTPException(status_code=422, detail="Error de cierre fuera de tolerancia")

    lecturas = supabase.table("topo_nivelacion_lecturas").select("*").eq("nivelacion_id", nivelacion_id).order("orden").execute().data or []
    uid = str(_uid(current_user))
    now = datetime.now(timezone.utc).isoformat()
    for lect in lecturas:
        if lect.get("tipo_punto") == "BM":
            continue
        payload = {
            "contrato_id": contrato_id,
            "nombre": lect.get("nombre_punto"),
            "cota": lect.get("cota_ajustada"),
            "tipo": "cambio" if lect.get("tipo_punto") == "cambio" else "estacion",
            "verificado": True,
            "modulo_origen": "nivelacion",
            "circuito_id": nivelacion_id,
            "fecha_verificacion": now,
        }
        existing = _row("topo_puntos", contrato_id=contrato_id, nombre=lect.get("nombre_punto"))
        if existing:
            supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute()
        else:
            supabase.table("topo_puntos").insert(payload).execute()

    supabase.table("topo_nivelaciones").update({"estado": "cerrado"}).eq("id", nivelacion_id).execute()
    return {"ok": True, "resultado": calc}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/validar")
def validar_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    nuevo = min(int(niv.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_nivelaciones").update({"nivel_validacion": nuevo}).eq("id", nivelacion_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/firma")
def firma_nivelacion(contrato_id: int, nivelacion_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    return _guardar_firma("nivelacion", nivelacion_id, body, _uid(current_user))


@router.get("/{contrato_id}/nivelaciones/{nivelacion_id}/pdf")
def pdf_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_nivelacion(contrato_id, nivelacion_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    niv = data["nivelacion"]
    lecturas = data["lecturas"]
    rows = ""
    for l in lecturas:
        rows += f"<tr><td>{html.escape(str(l.get('nombre_punto')))}</td><td>{l.get('lectura_atras')}</td><td>{l.get('lectura_adelante')}</td><td>{l.get('cota_ajustada')}</td><td>{l.get('correccion')}</td></tr>"
    firmas = _firmas_referencia(nivelacion_id)
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Nivelacion — {niv.get('nombre')}")}
    <table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Punto</th><th>Atras</th><th>Adelante</th><th>Cota ajust.</th><th>Corr.</th></tr>{rows}</table>
    <p>Error cierre: {niv.get('error_cierre')} m | Tolerancia: {niv.get('tolerancia_calculada')} m</p>
    {html_firmas_pdf(firmas)}{html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="nivelacion_{nivelacion_id[:8]}.pdf"'})


# ── AREAS ─────────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/areas")
def listar_areas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_areas").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/areas")
def crear_area(contrato_id: int, body: AreaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if len(body.puntos) < 3:
        raise HTTPException(status_code=422, detail="Se requieren al menos 3 vertices")
    area_m2 = area_por_coordenadas(body.puntos)
    perimetro = perimetro_por_coordenadas(body.puntos)
    row = supabase.table("topo_areas").insert({
        "contrato_id": contrato_id,
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "puntos": body.puntos,
        "area_m2": area_m2,
        "area_ha": area_m2 / 10000.0,
        "perimetro": perimetro,
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
    }).execute().data
    result = row[0] if row else {}
    result["svg"] = svg_poligono(body.puntos, titulo=body.nombre)
    return result


@router.get("/{contrato_id}/areas/{area_id}")
def obtener_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    area = _row("topo_areas", id=area_id, contrato_id=contrato_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area no encontrada")
    area["svg"] = svg_poligono(area.get("puntos") or [], titulo=area.get("nombre", ""))
    return area


@router.put("/{contrato_id}/areas/{area_id}")
def actualizar_area(contrato_id: int, area_id: str, body: AreaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_areas", id=area_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Area no encontrada")
    area_m2 = area_por_coordenadas(body.puntos)
    perimetro = perimetro_por_coordenadas(body.puntos)
    row = supabase.table("topo_areas").update({
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "puntos": body.puntos,
        "area_m2": area_m2,
        "area_ha": area_m2 / 10000.0,
        "perimetro": perimetro,
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
    }).eq("id", area_id).execute().data
    result = row[0] if row else {}
    result["svg"] = svg_poligono(body.puntos, titulo=body.nombre)
    return result


@router.delete("/{contrato_id}/areas/{area_id}")
def eliminar_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    supabase.table("topo_areas").delete().eq("id", area_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/{contrato_id}/areas/{area_id}/pdf")
def pdf_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    area = obtener_area(contrato_id, area_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    puntos = area.get("puntos") or []
    rows = ""
    for p in puntos:
        rows += f"<tr><td>{html.escape(str(p.get('nombre')))}</td><td>{p.get('norte')}</td><td>{p.get('este')}</td></tr>"
    svg = area.get("svg") or svg_poligono(puntos, titulo=area.get("nombre", ""))
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Area por coordenadas — {area.get('nombre')}")}
    <table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Punto</th><th>Norte</th><th>Este</th></tr>{rows}</table>
    <p>Area: {area.get('area_m2'):.4f} m2 | {area.get('area_ha'):.6f} ha | Perimetro: {area.get('perimetro'):.3f} m</p>
    {svg}{html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="area_{area_id[:8]}.pdf"'})


# ── INTERSECCION ──────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/intersecciones")
def listar_intersecciones(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_intersecciones").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/intersecciones")
def crear_interseccion(contrato_id: int, body: InterseccionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    p1 = _punto_verificado(body.punto1_id, contrato_id)
    p2 = _punto_verificado(body.punto2_id, contrato_id)
    calc = interseccion_dos_puntos(
        p1["norte"], p1["este"], body.azimut1_gms, body.distancia1,
        p2["norte"], p2["este"], body.azimut2_gms, body.distancia2,
    )
    admisible = calc["error_lineal"] <= body.tolerancia_lineal and calc["error_angular_segundos"] <= body.tolerancia_angular_seg
    row = supabase.table("topo_intersecciones").insert({
        "contrato_id": contrato_id,
        "nombre_punto_nuevo": body.nombre_punto_nuevo,
        "descripcion": body.descripcion,
        "punto1_id": body.punto1_id,
        "azimut1_gms": body.azimut1_gms,
        "distancia1": body.distancia1,
        "punto2_id": body.punto2_id,
        "azimut2_gms": body.azimut2_gms,
        "distancia2": body.distancia2,
        "norte_resultado": calc["norte"],
        "este_resultado": calc["este"],
        "error_lineal": calc["error_lineal"],
        "error_angular_segundos": calc["error_angular_segundos"],
        "tolerancia_lineal": body.tolerancia_lineal,
        "tolerancia_angular_seg": body.tolerancia_angular_seg,
        "admisible": admisible,
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
    }).execute().data
    result = row[0] if row else {}
    result["calculo"] = calc
    result["svg"] = svg_interseccion(p1, p2, {"nombre": body.nombre_punto_nuevo, "norte": calc["norte"], "este": calc["este"]})
    return result


@router.get("/{contrato_id}/intersecciones/{interseccion_id}")
def obtener_interseccion(contrato_id: int, interseccion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    inter = _row("topo_intersecciones", id=interseccion_id, contrato_id=contrato_id)
    if not inter:
        raise HTTPException(status_code=404, detail="Interseccion no encontrada")
    p1 = _row("topo_puntos", id=inter.get("punto1_id")) or {}
    p2 = _row("topo_puntos", id=inter.get("punto2_id")) or {}
    inter["svg"] = svg_interseccion(p1, p2, {"nombre": inter.get("nombre_punto_nuevo"), "norte": inter.get("norte_resultado"), "este": inter.get("este_resultado")})
    return inter


@router.post("/{contrato_id}/intersecciones/{interseccion_id}/agregar-a-biblioteca")
def agregar_interseccion_biblioteca(contrato_id: int, interseccion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    inter = _row("topo_intersecciones", id=interseccion_id, contrato_id=contrato_id)
    if not inter:
        raise HTTPException(status_code=404, detail="Interseccion no encontrada")
    if not inter.get("admisible"):
        raise HTTPException(status_code=422, detail="Resultado inadmisible; no se puede agregar a biblioteca")
    uid = str(_uid(current_user))
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "contrato_id": contrato_id,
        "nombre": inter.get("nombre_punto_nuevo"),
        "norte": inter.get("norte_resultado"),
        "este": inter.get("este_resultado"),
        "tipo": "auxiliar",
        "verificado": True,
        "modulo_origen": "interseccion",
        "circuito_id": interseccion_id,
        "fecha_verificacion": now,
    }
    existing = _row("topo_puntos", contrato_id=contrato_id, nombre=inter.get("nombre_punto_nuevo"))
    if existing:
        row = supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute().data
    else:
        row = supabase.table("topo_puntos").insert(payload).execute().data
    return row[0] if row else payload


@router.get("/{contrato_id}/intersecciones/{interseccion_id}/pdf")
def pdf_interseccion(contrato_id: int, interseccion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    inter = obtener_interseccion(contrato_id, interseccion_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    diag = "ADMISIBLE" if inter.get("admisible") else "INADMISIBLE"
    color = "#16a34a" if inter.get("admisible") else "#dc2626"
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Interseccion — {inter.get('nombre_punto_nuevo')}")}
    <p style="color:{color};font-weight:bold;">Diagnostico: {diag}</p>
    <p>Norte: {inter.get('norte_resultado')} | Este: {inter.get('este_resultado')}</p>
    <p>Error lineal: {inter.get('error_lineal')} m | Error angular: {inter.get('error_angular_segundos')} seg</p>
    {inter.get('svg')}{html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="interseccion_{interseccion_id[:8]}.pdf"'})


# ── EQUIPOS ───────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/equipos")
def listar_equipos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_equipos").select("*").eq("contrato_id", contrato_id).order("nombre").execute().data or []


@router.post("/{contrato_id}/equipos")
def crear_equipo(contrato_id: int, body: EquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_equipos").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/equipos/alertas")
def alertas_equipos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    equipos = listar_equipos(contrato_id, current_user)
    hoy = date.today()
    alertas = {"vencidas": [], "proximas": [], "al_dia": []}
    for eq in equipos:
        if not eq.get("activo"):
            continue
        ver = (
            supabase.table("topo_equipos_verificaciones")
            .select("*")
            .eq("equipo_id", eq["id"])
            .order("fecha", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not ver:
            alertas["vencidas"].append({**eq, "motivo": "Sin verificacion"})
            continue
        prox = ver[0].get("proxima_verificacion")
        if not prox:
            alertas["al_dia"].append(eq)
            continue
        try:
            fprox = date.fromisoformat(str(prox)[:10])
        except ValueError:
            alertas["al_dia"].append(eq)
            continue
        delta = (fprox - hoy).days
        item = {**eq, "proxima_verificacion": prox, "ultima_verificacion": ver[0]}
        if delta < 0:
            alertas["vencidas"].append(item)
        elif delta <= 7:
            alertas["proximas"].append(item)
        else:
            alertas["al_dia"].append(item)
    alertas["total_alertas"] = len(alertas["vencidas"]) + len(alertas["proximas"])
    return alertas


@router.put("/{contrato_id}/equipos/{equipo_id}")
def actualizar_equipo(contrato_id: int, equipo_id: str, body: EquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_equipos", id=equipo_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    row = supabase.table("topo_equipos").update(body.model_dump()).eq("id", equipo_id).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/equipos/{equipo_id}/verificaciones")
def listar_verificaciones_equipo(contrato_id: int, equipo_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    if not _row("topo_equipos", id=equipo_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return supabase.table("topo_equipos_verificaciones").select("*").eq("equipo_id", equipo_id).order("fecha", desc=True).execute().data or []


@router.post("/{contrato_id}/equipos/{equipo_id}/verificaciones")
def crear_verificacion_equipo(contrato_id: int, equipo_id: str, body: VerificacionEquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    eq = _row("topo_equipos", id=equipo_id, contrato_id=contrato_id)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    if body.tipo_verificacion == "nivel":
        calc = calcular_verificacion_nivel(body.resultados, tolerancia_mm=body.tolerancia_mm)
    else:
        calc = calcular_verificacion_estacion_total(body.resultados, tolerancia_seg=body.tolerancia_seg)
    resultados = {**(body.resultados or {}), **calc}
    prox = body.proxima_verificacion
    if not prox:
        from datetime import timedelta
        prox = body.fecha + timedelta(days=30)
    row = supabase.table("topo_equipos_verificaciones").insert({
        "equipo_id": equipo_id,
        "contrato_id": contrato_id,
        "fecha": str(body.fecha),
        "tipo_verificacion": body.tipo_verificacion,
        "operador": body.operador,
        "condiciones": body.condiciones,
        "resultados": resultados,
        "cumple": calc.get("cumple"),
        "observaciones": body.observaciones,
        "proxima_verificacion": str(prox),
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/equipos/{equipo_id}/verificaciones/{verificacion_id}/validar")
def validar_verificacion_equipo(contrato_id: int, equipo_id: str, verificacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    ver = _row("topo_equipos_verificaciones", id=verificacion_id, equipo_id=equipo_id, contrato_id=contrato_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Verificacion no encontrada")
    nuevo = min(int(ver.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_equipos_verificaciones").update({"nivel_validacion": nuevo}).eq("id", verificacion_id).execute()
    return {"nivel_validacion": nuevo}


@router.get("/{contrato_id}/equipos/{equipo_id}/verificaciones/{verificacion_id}/pdf")
def pdf_verificacion_equipo(contrato_id: int, equipo_id: str, verificacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    eq = _row("topo_equipos", id=equipo_id, contrato_id=contrato_id)
    ver = _row("topo_equipos_verificaciones", id=verificacion_id, equipo_id=equipo_id)
    if not eq or not ver:
        raise HTTPException(status_code=404, detail="No encontrado")
    contrato = _require_contrato_row(contrato_id)
    res = ver.get("resultados") or {}
    diag = res.get("diagnostico", "NO CUMPLE" if not ver.get("cumple") else "CUMPLE")
    color = "#16a34a" if ver.get("cumple") else "#dc2626"
    advertencia = ""
    if not ver.get("cumple"):
        advertencia = '<p style="background:#fef2f2;border:2px solid #dc2626;padding:8px;color:#991b1b;font-weight:bold;">ADVERTENCIA: Equipo requiere calibracion. Datos tomados con este equipo no son confiables.</p>'
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Verificacion de equipo — {eq.get('nombre')}")}
    <p>Tipo: {eq.get('tipo')} | Marca: {eq.get('marca')} | Modelo: {eq.get('modelo')} | Serie: {eq.get('serie')}</p>
    <p>Fecha: {ver.get('fecha')} | Operador: {html.escape(str(ver.get('operador') or ''))}</p>
    {advertencia}
    <p style="color:{color};font-weight:bold;font-size:12pt;">Diagnostico: {diag}</p>
    <p>Recomendacion: {html.escape(str(res.get('recomendacion') or ''))}</p>
    <p>Proxima verificacion: {ver.get('proxima_verificacion')}</p>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="verificacion_{verificacion_id[:8]}.pdf"'})


# ── VIAS ──────────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/vias/proyectos")
def listar_vias_proyectos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_vias_proyectos").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/vias/proyectos")
def crear_via_proyecto(contrato_id: int, body: ViaProyectoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_vias_proyectos").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/vias/proyectos/{proyecto_id}")
def obtener_via_proyecto(contrato_id: int, proyecto_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    proj = _row("topo_vias_proyectos", id=proyecto_id, contrato_id=contrato_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return proj


@router.post("/{contrato_id}/vias/registros")
def crear_via_registro(contrato_id: int, body: ViaRegistroBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.bm_referencia_id:
        _punto_verificado(body.bm_referencia_id, contrato_id)
    row = supabase.table("topo_vias_registros").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/vias/registros/{registro_id}")
def obtener_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    lecturas = supabase.table("topo_vias_lecturas").select("*").eq("registro_id", registro_id).order("orden").execute().data or []
    return {"registro": reg, "lecturas": lecturas}


@router.post("/{contrato_id}/vias/registros/{registro_id}/lecturas")
def agregar_via_lectura(contrato_id: int, registro_id: str, body: ViaLecturaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    _assert_editable(reg.get("nivel_validacion", 0))
    cota_campo = None
    if body.lectura_mira is not None and body.altura_instrumento is not None:
        cota_campo = body.altura_instrumento - body.lectura_mira
    delta = None
    dentro = None
    if cota_campo is not None and body.cota_diseno is not None:
        delta = cota_campo - body.cota_diseno
        dentro = abs(delta) <= body.tolerancia_m
    row = supabase.table("topo_vias_lecturas").insert({
        "registro_id": registro_id,
        "orden": body.orden,
        "abscisa": body.abscisa,
        "punto_tomado": body.punto_tomado,
        "altura_instrumento": body.altura_instrumento,
        "lectura_mira": body.lectura_mira,
        "cota_campo": cota_campo,
        "cota_diseno": body.cota_diseno,
        "delta": delta,
        "dentro_tolerancia": dentro,
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/vias/registros/{registro_id}/calcular")
def calcular_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    lecturas = supabase.table("topo_vias_lecturas").select("*").eq("registro_id", registro_id).execute().data or []
    total = len(lecturas)
    ok = sum(1 for l in lecturas if l.get("dentro_tolerancia"))
    return {"total": total, "dentro_tolerancia": ok, "fuera_tolerancia": total - ok}


@router.post("/{contrato_id}/vias/registros/{registro_id}/validar")
def validar_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    nuevo = min(int(reg.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_vias_registros").update({"nivel_validacion": nuevo}).eq("id", registro_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/vias/registros/{registro_id}/firma")
def firma_via_registro(contrato_id: int, registro_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return _guardar_firma("vias", registro_id, body, _uid(current_user))


@router.get("/{contrato_id}/vias/registros/{registro_id}/pdf")
def pdf_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_via_registro(contrato_id, registro_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    reg = data["registro"]
    lecturas = data["lecturas"]
    rows = ""
    for l in lecturas:
        rows += f"<tr><td>{l.get('abscisa')}</td><td>{l.get('cota_campo')}</td><td>{l.get('cota_diseno')}</td><td>{l.get('delta')}</td><td>{'SI' if l.get('dentro_tolerancia') else 'NO'}</td></tr>"
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, "Verificacion de vias")}
    <table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Abscisa</th><th>Cota campo</th><th>Cota diseno</th><th>Delta</th><th>OK</th></tr>{rows}</table>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="vias_{registro_id[:8]}.pdf"'})


# ── TUBERIA ───────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/tuberias")
def listar_tuberias(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_tuberias").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/tuberias")
def crear_tuberia(contrato_id: int, body: TuberiaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_tuberias").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/tuberias/{tuberia_id}")
def obtener_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    registros = supabase.table("topo_tuberia_registros").select("*").eq("tuberia_id", tuberia_id).order("fecha").execute().data or []
    return {"tuberia": tub, "registros": registros}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/registros")
def crear_tuberia_registro(contrato_id: int, tuberia_id: str, body: TuberiaRegistroBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    if body.bm_referencia_id:
        _punto_verificado(body.bm_referencia_id, contrato_id)
    row = supabase.table("topo_tuberia_registros").insert({**body.model_dump(), "tuberia_id": tuberia_id}).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/registros/{registro_id}/tubos")
def agregar_tubo(contrato_id: int, tuberia_id: str, registro_id: str, body: TuberiaTuboBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    reg = _row("topo_tuberia_registros", id=registro_id, tuberia_id=tuberia_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    registro = _row("topo_tuberia_registros", id=registro_id)
    hi = registro.get("altura_instrumento") if registro else None
    tol = float(tub.get("tolerancia_cm") or 2.0) / 100.0
    cota_ini = hi - body.lectura_mira_inicio if hi is not None and body.lectura_mira_inicio is not None else None
    cota_fin = hi - body.lectura_mira_fin if hi is not None and body.lectura_mira_fin is not None else None
    delta_ini = cota_ini - body.cota_diseno_inicio if cota_ini is not None and body.cota_diseno_inicio is not None else None
    delta_fin = cota_fin - body.cota_diseno_fin if cota_fin is not None and body.cota_diseno_fin is not None else None
    dentro = True
    if delta_ini is not None and abs(delta_ini) > tol:
        dentro = False
    if delta_fin is not None and abs(delta_fin) > tol:
        dentro = False
    row = supabase.table("topo_tuberia_tubos").insert({
        **body.model_dump(),
        "registro_id": registro_id,
        "cota_campo_inicio": cota_ini,
        "cota_campo_fin": cota_fin,
        "delta_inicio": delta_ini,
        "delta_fin": delta_fin,
        "dentro_tolerancia": dentro,
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/cerrar")
def cerrar_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    supabase.table("topo_tuberias").update({"estado": "cerrado", "fecha_cierre": str(date.today())}).eq("id", tuberia_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/validar")
def validar_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    nuevo = min(int(tub.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_tuberias").update({"nivel_validacion": nuevo}).eq("id", tuberia_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/firma")
def firma_tuberia(contrato_id: int, tuberia_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    return _guardar_firma("tuberia", tuberia_id, body, _uid(current_user))


@router.get("/{contrato_id}/tuberias/{tuberia_id}/pdf")
def pdf_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_tuberia(contrato_id, tuberia_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    tub = data["tuberia"]
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Tuberia — {tub.get('nombre')}")}
    <p>Material: {tub.get('material')} | Diametro: {tub.get('diametro_nominal')} | Estado: {tub.get('estado')}</p>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="tuberia_{tuberia_id[:8]}.pdf"'})
