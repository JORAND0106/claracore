"""Rutas HTTP Topografia — montadas en main con prefijo `/topografia`."""
from __future__ import annotations

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
    calcular_verificacion_estacion_total,
    calcular_verificacion_nivel,
    decimal_to_gms,
    enriquecer_estaciones_poligonal,
    gms_to_decimal,
    html_encabezado_pdf,
    html_firmas_pdf,
    html_pie_pdf,
    interseccion_dos_puntos,
    matplotlib_poligono_base64,
    perimetro_por_coordenadas,
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


def _dump_model(body: BaseModel, uuid_fields: tuple[str, ...] = ()) -> dict:
    data = body.model_dump()
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
    row = _row("contratos", "id, numero, objeto, contratista, nit, interventoria, logo_contratista, municipio, departamento", id=contrato_id)
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
    sentido: Optional[str] = None
    punto_inicial_id: Optional[str] = None
    punto_final_id: Optional[str] = None
    amarre_inicial: Optional[AmarreBody] = None
    amarre_final: Optional[AmarreBody] = None
    tolerancia_relativa: int = 3000
    tolerancia_cota_mm_km: float = 12
    metodo: Literal["trigonometrica"] = "trigonometrica"
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    fecha_campo: Optional[date] = None


class EstacionBody(BaseModel):
    orden: int
    nombre_punto: str
    angulo_gms: float
    distancia: float
    altura_instrumento: float
    angulo_vertical_gms: float
    altura_objetivo: Optional[float] = 0
    lectura_mira: Optional[float] = None


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
    payload = body.model_dump(exclude={"amarre_inicial", "amarre_final"})
    for field in ("punto_inicial_id", "punto_final_id"):
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
    return row[0] if row else {}


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
    return {
        "poligonal": pol,
        "estaciones": enriquecer_estaciones_poligonal(estaciones),
        "punto_inicial": _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None,
        "punto_final": _row("topo_puntos", id=pol.get("punto_final_id")) if pol.get("punto_final_id") else None,
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
        .update(_dump_model(body, ("punto_inicial_id", "punto_final_id")))
        .eq("id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else pol


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
    if body.distancia <= 0:
        raise HTTPException(status_code=422, detail="La distancia debe ser mayor que cero.")
    if body.altura_instrumento is None or body.altura_instrumento < 0:
        raise HTTPException(status_code=422, detail="Indique la altura del instrumento (HI) en metros.")
    row = (
        supabase.table("topo_poligonal_estaciones")
        .insert(
            {
                "poligonal_id": poligonal_id,
                "orden": body.orden,
                "nombre_punto": body.nombre_punto.strip(),
                "angulo_medido": gms_to_decimal(body.angulo_gms),
                "distancia": body.distancia,
                "altura_instrumento": body.altura_instrumento,
                "angulo_vertical": gms_to_decimal(body.angulo_vertical_gms),
                "altura_objetivo": body.altura_objetivo or 0,
                "lectura_mira": body.lectura_mira,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/calcular")
def calcular_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")

    def _rpc():
        return supabase.rpc("topo_calcular_poligonal", {"p_poligonal_id": poligonal_id}).execute()

    res = supabase_execute(_rpc)
    return res.data if res else {}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/cerrar")
def cerrar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_editable(pol.get("nivel_validacion", 0))

    calc = calcular_poligonal(contrato_id, poligonal_id, current_user)
    if not calc.get("admisible"):
        raise HTTPException(status_code=422, detail="Error de cierre fuera de tolerancia")

    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
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

    for est in estaciones:
        if not est.get("norte_ajustado"):
            continue
        existing = _row("topo_puntos", contrato_id=contrato_id, nombre=est.get("nombre_punto"))
        payload = {
            "contrato_id": contrato_id,
            "nombre": est.get("nombre_punto"),
            "norte": est.get("norte_ajustado"),
            "este": est.get("este_ajustado"),
            "cota": est.get("cota_ajustada"),
            "tipo": "estacion",
            "verificado": True,
            "modulo_origen": "poligonal",
            "circuito_id": poligonal_id,
            "fecha_verificacion": now,
        }
        if existing:
            supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute()
        else:
            supabase.table("topo_puntos").insert(payload).execute()

    supabase.table("topo_poligonales").update({"estado": "cerrado"}).eq("id", poligonal_id).execute()
    return {"ok": True, "resultado": calc}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/validar")
def validar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
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


@router.get("/{contrato_id}/poligonales/{poligonal_id}/pdf")
def pdf_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_poligonal(contrato_id, poligonal_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    pol = data["poligonal"]
    estaciones = data["estaciones"]
    puntos = [{"nombre": e.get("nombre_punto"), "norte": e.get("norte_ajustado") or 0, "este": e.get("este_ajustado") or 0} for e in estaciones if e.get("norte_ajustado")]
    img = matplotlib_poligono_base64(puntos, titulo=pol.get("nombre", "Poligonal"))
    img_html = f'<img src="data:image/png;base64,{img}" style="max-width:100%;" />' if img else ""
    rows = ""
    for e in estaciones:
        rows += (
            f"<tr><td>{html.escape(str(e.get('nombre_punto')))}</td>"
            f"<td>{decimal_to_gms(e.get('angulo_medido') or 0)}</td>"
            f"<td>{decimal_to_gms(e.get('angulo_vertical') or 0)}</td>"
            f"<td>{e.get('distancia')}</td>"
            f"<td>{e.get('norte_ajustado')}</td>"
            f"<td>{e.get('este_ajustado')}</td>"
            f"<td>{e.get('cota_ajustada')}</td></tr>"
        )
    firmas = _firmas_referencia(poligonal_id)
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Poligonal — {pol.get('nombre')}")}<table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Punto</th><th>Ang. hor.</th><th>Ang. vert.</th><th>Dist</th><th>Norte</th><th>Este</th><th>Cota</th></tr>{rows}</table>
    <p>Precision: 1:{int(pol.get('precision_relativa') or 0)} | Error lineal: {pol.get('error_lineal')} m | Error cota: {pol.get('error_cierre_dz')} m</p>{img_html}{html_firmas_pdf(firmas)}{html_pie_pdf(contrato)}</body></html>"""
    pdf = to_pdf_bytes(html_doc)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="poligonal_{poligonal_id[:8]}.pdf"'})


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
