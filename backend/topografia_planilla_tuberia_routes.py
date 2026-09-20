"""Rutas HTTP — Planillas de Tubería (ALCANTARILLA / FILTRO)."""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from main import _es_desarrollador, _require_contract_access, get_current_user, supabase
from topografia_permissions import require_permiso_topografia
from topografia_planilla_tuberia import (
    FILAS_INICIALES_CARTERA,
    ITEMS_CANTIDADES,
    ITEMS_DESCUENTOS_ALCANTARILLA,
    ITEMS_DESCUENTOS_FILTRO,
    RELACIONES_ATRAQUE,
    TIPOS_PLANILLA,
    calcular_planilla_completa,
    construir_fila_consolidado,
    validar_cartera_campo,
)
from topo_crs import gk_bogota_to_wgs84

logger = logging.getLogger("claracore.topo.planilla_tuberia")
router = APIRouter(tags=["topografia-planillas-tuberia"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(user) -> int:
    """ID numérico de public.usuarios (JWT sub), no UUID."""
    raw = (user or {}).get("sub") or (user or {}).get("id")
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(401, "Token inválido: usuario_id no numérico") from exc


def _row(table: str, **eq) -> Optional[dict]:
    q = supabase.table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    data = q.limit(1).execute().data or []
    return data[0] if data else None


def _perm(user, accion: str) -> None:
    require_permiso_topografia(user, accion)  # type: ignore[arg-type]


def _assert_editable(p: dict) -> None:
    if (p.get("estado") or "").lower() in ("cerrado", "validado"):
        raise HTTPException(409, "Planilla cerrada/validada: no editable.")


def _assert_version(p: dict, version: int) -> None:
    actual = int(p.get("version") or 1)
    if int(version) != actual:
        raise HTTPException(409, f"Conflicto de versión: esperaba {actual}, recibió {version}.")


class CrearBody(BaseModel):
    tipo: str = "ALCANTARILLA"
    nombre: Optional[str] = None
    pk_id: Optional[str] = None
    costado: Optional[str] = None


class ParamsBody(BaseModel):
    version: int
    tipo: Optional[str] = None
    nombre: Optional[str] = None
    pk_id: Optional[str] = None
    costado: Optional[str] = None
    abscisa_inicial_txt: Optional[str] = None
    abscisa_final_txt: Optional[str] = None
    diametro_m: Optional[float] = None
    espesor_m: Optional[float] = None
    ancho_excavacion_m: Optional[float] = None
    relacion_atraque: Optional[str] = None
    material: Optional[str] = None
    norte_ref: Optional[float] = None
    este_ref: Optional[float] = None
    # Amplía cabecera XLSM sin migrar columnas: geo final, cama, partes, contrato.
    meta_cabecera: Optional[dict[str, Any]] = None
    firmas: Optional[dict[str, Any]] = None


class FilaBody(BaseModel):
    orden: int
    abscisa: Optional[float] = None
    terreno_natural: Optional[float] = None
    subrasante_via: Optional[float] = None
    terminado_filtro: Optional[float] = None
    cota_fondo_excavacion: Optional[float] = None
    norte: Optional[float] = None
    este: Optional[float] = None
    observacion: Optional[str] = None


class DescBody(BaseModel):
    codigo: str
    cantidad: float = 0
    nota: Optional[str] = None


class CarteraBody(BaseModel):
    version: int
    filas: list[FilaBody]
    descuentos_manuales: list[DescBody] = Field(default_factory=list)


def _filas(planilla_id: str) -> list[dict]:
    return (
        supabase.table("topo_planilla_tuberia_filas")
        .select("*").eq("planilla_id", planilla_id).order("orden").execute().data or []
    )


def _descuentos(planilla_id: str) -> list[dict]:
    return (
        supabase.table("topo_planilla_tuberia_descuentos")
        .select("*").eq("planilla_id", planilla_id).execute().data or []
    )


def _as_campo(filas_db: list[dict]) -> list[dict]:
    return [{
        "orden": f.get("orden"),
        "abscisa": f.get("abscisa"),
        "terreno_natural": f.get("terreno_natural"),
        "subrasante_via": f.get("subrasante_via"),
        "terminado_filtro": f.get("terminado_filtro"),
        "cota_fondo_excavacion": f.get("cota_fondo_excavacion"),
        "norte": f.get("norte"),
        "este": f.get("este"),
        "observacion": f.get("observacion"),
    } for f in filas_db]


def _cama_triturado_m(planilla: dict) -> float:
    meta = planilla.get("meta_cabecera") or {}
    if not isinstance(meta, dict):
        return 0.0
    try:
        return float(meta.get("cama_triturado_m") or 0)
    except (TypeError, ValueError):
        return 0.0


def _calcular(planilla: dict, filas_db: list[dict], desc_db: list[dict]) -> dict:
    diam = float(planilla.get("diametro_m") or 0)
    ancho = float(planilla.get("ancho_excavacion_m") or 0)
    if diam <= 0 or ancho <= 0:
        raise HTTPException(422, "Configure diámetro y ancho de excavación.")
    return calcular_planilla_completa(
        tipo=planilla.get("tipo") or "ALCANTARILLA",
        diametro_m=diam,
        espesor_m=float(planilla.get("espesor_m") or 0),
        ancho_excavacion_m=ancho,
        relacion_atraque=planilla.get("relacion_atraque") or "1:3",
        filas_campo=_as_campo(filas_db),
        descuentos_manuales=[{"codigo": d["codigo"], "cantidad": d.get("cantidad")} for d in desc_db],
        cama_triturado_m=_cama_triturado_m(planilla),
    )


def _audit(contrato_id: int, planilla_id: str, accion: str, user, detalle: dict) -> None:
    try:
        supabase.table("topo_planilla_tuberia_auditoria").insert({
            "planilla_id": planilla_id,
            "contrato_id": contrato_id,
            "accion": accion,
            "usuario_id": _uid(user),
            "detalle": detalle,
        }).execute()
    except Exception:
        logger.exception("audit")


def _detalle(contrato_id: int, planilla_id: str) -> dict:
    planilla = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not planilla:
        raise HTTPException(404, "Planilla no encontrada")
    filas = _filas(planilla_id)
    descuentos = _descuentos(planilla_id)
    calculo = None
    try:
        if planilla.get("diametro_m") and planilla.get("ancho_excavacion_m"):
            calculo = _calcular(planilla, filas, descuentos)
            sec = calculo["seccion"]
            supabase.table("topo_planillas_tuberia").update({
                "altura_relleno_m": sec["altura_relleno_m"],
                "area_1_m2": sec["area_1_m2"],
                "area_2_m2": sec["area_2_m2"],
                "updated_at": _now(),
            }).eq("id", planilla_id).execute()
            planilla = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id) or planilla
    except HTTPException:
        pass
    except Exception as exc:
        logger.warning("calculo %s: %s", planilla_id, exc)

    coords = None
    if planilla.get("este_ref") is not None and planilla.get("norte_ref") is not None:
        try:
            lon, lat = gk_bogota_to_wgs84(float(planilla["este_ref"]), float(planilla["norte_ref"]))
            coords = {"lon": lon, "lat": lat}
        except Exception:
            coords = None

    return {
        "planilla": planilla,
        "filas_campo": filas,
        "descuentos_manuales": descuentos,
        "calculo": calculo,
        "coords_wgs84": coords,
        "relaciones_atraque": list(RELACIONES_ATRAQUE),
        "tipos": list(TIPOS_PLANILLA),
    }


def _replace_filas(planilla_id: str, filas: list[dict]) -> list[dict]:
    prev = _filas(planilla_id)
    prev_ids = [p["id"] for p in prev if p.get("id")]
    payloads = [{
        "id": str(uuid4()),
        "planilla_id": planilla_id,
        "orden": int(f["orden"]),
        "abscisa": f.get("abscisa"),
        "terreno_natural": f.get("terreno_natural"),
        "subrasante_via": f.get("subrasante_via"),
        "terminado_filtro": f.get("terminado_filtro"),
        "cota_fondo_excavacion": f.get("cota_fondo_excavacion"),
        "norte": f.get("norte"),
        "este": f.get("este"),
        "observacion": f.get("observacion"),
    } for f in filas]
    new_ids = [p["id"] for p in payloads]
    try:
        if payloads:
            supabase.table("topo_planilla_tuberia_filas").insert(payloads).execute()
        all_rows = (
            supabase.table("topo_planilla_tuberia_filas")
            .select("id").eq("planilla_id", planilla_id).execute().data or []
        )
        inserted = [r for r in all_rows if r["id"] in set(new_ids)]
        if len(inserted) != len(payloads):
            raise RuntimeError(f"Inserción incompleta {len(inserted)}/{len(payloads)}")
        if prev_ids:
            for i in range(0, len(prev_ids), 100):
                supabase.table("topo_planilla_tuberia_filas").delete().in_("id", prev_ids[i:i + 100]).execute()
        rows = _filas(planilla_id)
        if len(rows) != len(payloads):
            raise RuntimeError(f"Cartera inconsistente {len(rows)}/{len(payloads)}")
        return rows
    except Exception:
        try:
            if new_ids:
                for i in range(0, len(new_ids), 100):
                    supabase.table("topo_planilla_tuberia_filas").delete().in_("id", new_ids[i:i + 100]).execute()
        except Exception:
            pass
        raise


@router.get("/{contrato_id}/planillas-tuberia")
def listar(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_planillas_tuberia")
        .select("id,tipo,nombre,pk_id,costado,estado,version,diametro_m,relacion_atraque,created_at,updated_at,cerrado_at")
        .eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []
    )


@router.post("/{contrato_id}/planillas-tuberia")
def crear(contrato_id: int, body: CrearBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    tipo = (body.tipo or "ALCANTARILLA").upper()
    if tipo not in TIPOS_PLANILLA:
        raise HTTPException(422, f"Tipo inválido: {tipo}")
    # creado_por = usuarios.id (INTEGER). No enviar UUID ni strings no numéricos.
    payload: dict[str, Any] = {
        "contrato_id": contrato_id,
        "tipo": tipo,
        "nombre": body.nombre or f"Planilla {tipo}",
        "estado": "borrador",
        "version": 1,
        "relacion_atraque": "1:3",
        "espesor_m": 0,
        "creado_por": _uid(current_user),
        "created_at": _now(),
        "updated_at": _now(),
    }
    if body.pk_id:
        payload["pk_id"] = body.pk_id
    if body.costado:
        payload["costado"] = body.costado
    row = supabase.table("topo_planillas_tuberia").insert(payload).execute().data
    if not row:
        raise HTTPException(500, "No se pudo crear la planilla")
    return _detalle(contrato_id, row[0]["id"])


@router.get("/{contrato_id}/planillas-tuberia/{planilla_id}")
def obtener(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return _detalle(contrato_id, planilla_id)


@router.put("/{contrato_id}/planillas-tuberia/{planilla_id}/params")
def actualizar_params(contrato_id: int, planilla_id: str, body: ParamsBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")
    _assert_editable(p)
    _assert_version(p, body.version)
    patch: dict[str, Any] = {"updated_at": _now(), "version": int(p.get("version") or 1) + 1}
    if body.tipo is not None:
        tipo_up = str(body.tipo).upper()
        if tipo_up not in TIPOS_PLANILLA:
            raise HTTPException(422, f"Tipo inválido: {tipo_up}")
        patch["tipo"] = tipo_up
    for field in (
        "nombre", "pk_id", "costado", "abscisa_inicial_txt", "abscisa_final_txt",
        "diametro_m", "espesor_m", "ancho_excavacion_m", "material", "norte_ref", "este_ref",
    ):
        val = getattr(body, field)
        if val is not None:
            patch[field] = val
    if body.relacion_atraque is not None:
        if body.relacion_atraque not in RELACIONES_ATRAQUE:
            raise HTTPException(422, "Relación de atraque inválida")
        patch["relacion_atraque"] = body.relacion_atraque
    if body.meta_cabecera is not None:
        prev = p.get("meta_cabecera") if isinstance(p.get("meta_cabecera"), dict) else {}
        patch["meta_cabecera"] = {**prev, **body.meta_cabecera}
    if body.firmas is not None:
        prev_f = p.get("firmas") if isinstance(p.get("firmas"), dict) else {}
        patch["firmas"] = {**prev_f, **body.firmas}
    diam = patch.get("diametro_m", p.get("diametro_m"))
    esp = patch.get("espesor_m", p.get("espesor_m") or 0)
    ancho = patch.get("ancho_excavacion_m", p.get("ancho_excavacion_m"))
    rel = patch.get("relacion_atraque", p.get("relacion_atraque") or "1:3")
    tipo_calc = patch.get("tipo", p.get("tipo") or "ALCANTARILLA")
    meta_for_calc = patch.get("meta_cabecera", p.get("meta_cabecera"))
    if diam and ancho:
        calc = calcular_planilla_completa(
            tipo=tipo_calc, diametro_m=float(diam), espesor_m=float(esp or 0),
            ancho_excavacion_m=float(ancho), relacion_atraque=rel, filas_campo=[],
            cama_triturado_m=_cama_triturado_m({"meta_cabecera": meta_for_calc}),
        )
        sec = calc["seccion"]
        patch.update({
            "altura_relleno_m": sec["altura_relleno_m"],
            "area_1_m2": sec["area_1_m2"],
            "area_2_m2": sec["area_2_m2"],
        })
    supabase.table("topo_planillas_tuberia").update(patch).eq("id", planilla_id).execute()
    return _detalle(contrato_id, planilla_id)


@router.put("/{contrato_id}/planillas-tuberia/{planilla_id}/cartera")
def guardar_cartera(contrato_id: int, planilla_id: str, body: CarteraBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")
    _assert_editable(p)
    _assert_version(p, body.version)

    filas_util = []
    for f in body.filas:
        d = f.model_dump()
        if any(d.get(k) is not None for k in (
            "abscisa", "terreno_natural", "subrasante_via", "terminado_filtro", "cota_fondo_excavacion"
        )):
            filas_util.append(d)

    valid = validar_cartera_campo(filas_util, p.get("tipo") or "ALCANTARILLA")
    if not valid.get("ok"):
        raise HTTPException(422, {
            "mensaje": "Validación restrictiva: corrija errores antes de guardar.",
            "errores": valid.get("errores") or [],
            "infos": valid.get("infos") or [],
        })

    try:
        rows = _replace_filas(planilla_id, filas_util)
    except Exception as exc:
        raise HTTPException(500, f"Error al guardar cartera: {exc}") from exc

    supabase.table("topo_planilla_tuberia_descuentos").delete().eq("planilla_id", planilla_id).execute()
    desc_rows = [
        {"planilla_id": planilla_id, "codigo": d.codigo, "cantidad": float(d.cantidad), "nota": d.nota}
        for d in (body.descuentos_manuales or []) if d.codigo
    ]
    if desc_rows:
        supabase.table("topo_planilla_tuberia_descuentos").insert(desc_rows).execute()

    nueva_v = int(p.get("version") or 1) + 1
    supabase.table("topo_planillas_tuberia").update({"version": nueva_v, "updated_at": _now()}).eq("id", planilla_id).execute()
    detalle = _detalle(contrato_id, planilla_id)
    if len(detalle.get("filas_campo") or []) != len(rows):
        raise HTTPException(500, "Verificación post-guardado falló.")
    return {**detalle, "verified": True, "count": len(rows), "version": nueva_v,
            "validacion": {"infos": valid.get("infos") or []}}


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/calcular")
def calcular(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return _detalle(contrato_id, planilla_id)


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/cerrar")
def cerrar(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")
    if (p.get("estado") or "").lower() != "borrador":
        raise HTTPException(422, "Solo se cierran planillas en borrador.")
    filas = _filas(planilla_id)
    if not filas:
        raise HTTPException(422, "No hay cartera para cerrar.")
    calc = _calcular(p, filas, _descuentos(planilla_id))
    now = _now()
    consol = construir_fila_consolidado(
        {**p, "estado": "cerrado", "cerrado_at": now, "contrato_id": contrato_id}, calc
    )
    supabase.table("topo_planillas_tuberia").update({
        "estado": "cerrado", "cerrado_at": now, "cerrado_por": _uid(current_user),
        "calculo_snapshot": calc, "version": int(p.get("version") or 1) + 1, "updated_at": now,
    }).eq("id", planilla_id).execute()
    supabase.table("topo_planilla_tuberia_consolidado").delete().eq("planilla_id", planilla_id).execute()
    supabase.table("topo_planilla_tuberia_consolidado").insert({
        "contrato_id": contrato_id,
        "planilla_id": planilla_id,
        "c01_planilla_id": consol.get("c01_planilla_id"),
        "c02_tipo": consol.get("c02_tipo"),
        "c03_pk_id": consol.get("c03_pk_id"),
        "c04_nombre": consol.get("c04_nombre"),
        "c05_costado": consol.get("c05_costado"),
        "c06_abscisa_inicial": consol.get("c06_abscisa_inicial"),
        "c07_abscisa_final": consol.get("c07_abscisa_final"),
        "c08_longitud_m": consol.get("c08_longitud_m"),
        "c09_diametro_m": consol.get("c09_diametro_m"),
        "c10_espesor_m": consol.get("c10_espesor_m"),
        "c11_relacion_atraque": consol.get("c11_relacion_atraque"),
        "c12_ancho_excavacion_m": consol.get("c12_ancho_excavacion_m"),
        "c13_vol_excavacion_m3": consol.get("c13_vol_excavacion_m3"),
        "c14_vol_triturado_m3": consol.get("c14_vol_triturado_m3"),
        "c15_vol_relleno_m3": consol.get("c15_vol_relleno_m3"),
        "c16_area_geotextil_m2": consol.get("c16_area_geotextil_m2"),
        "c17_long_tuberia_m": consol.get("c17_long_tuberia_m"),
        "c18_norte_ref": consol.get("c18_norte_ref"),
        "c19_este_ref": consol.get("c19_este_ref"),
        "c20_estado": "cerrado",
        "c21_cerrado_at": now,
        "c22_contrato_id": contrato_id,
    }).execute()
    _audit(contrato_id, planilla_id, "CERRAR", current_user, {"consolidado": consol})
    return _detalle(contrato_id, planilla_id)


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/reabrir")
def reabrir(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    if not _es_desarrollador(current_user):
        raise HTTPException(403, "Solo Desarrollador puede reabrir planillas.")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")
    if (p.get("estado") or "").lower() not in ("cerrado", "validado"):
        raise HTTPException(422, "La planilla no está cerrada.")
    now = _now()
    supabase.table("topo_planillas_tuberia").update({
        "estado": "borrador", "nivel_validacion": 0, "validado_at": None, "validado_por": None,
        "reabierto_at": now, "reabierto_por": _uid(current_user),
        "version": int(p.get("version") or 1) + 1, "updated_at": now,
    }).eq("id", planilla_id).execute()
    supabase.table("topo_planilla_tuberia_consolidado").delete().eq("planilla_id", planilla_id).execute()
    _audit(contrato_id, planilla_id, "REABRIR", current_user, {"estado_previo": p.get("estado")})
    return _detalle(contrato_id, planilla_id)


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/revocar-validacion")
def revocar(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    if not _es_desarrollador(current_user):
        raise HTTPException(403, "Solo Desarrollador puede revocar validación.")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")
    now = _now()
    supabase.table("topo_planillas_tuberia").update({
        "nivel_validacion": 0,
        "estado": "cerrado" if p.get("cerrado_at") else "borrador",
        "validado_at": None, "validado_por": None,
        "validacion_revocada_at": now, "validacion_revocada_por": _uid(current_user),
        "version": int(p.get("version") or 1) + 1, "updated_at": now,
    }).eq("id", planilla_id).execute()
    _audit(contrato_id, planilla_id, "REVOCAR_VALIDACION", current_user, {})
    return _detalle(contrato_id, planilla_id)



@router.delete("/{contrato_id}/planillas-tuberia/{planilla_id}")
def eliminar(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    """Elimina la planilla y todos sus registros asociados (cartera, descuentos, consolidado).

    La UI confirma de forma básica si la cartera está vacía, o con alerta
    explícita si ya hay datos diligenciados. El backend reporta `tenia_datos`.
    """
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(status_code=404, detail="Planilla no encontrada")

    det = _detalle(contrato_id, planilla_id)
    tenia_datos = _tiene_datos_exportables(det)
    logger.info(
        "eliminar planilla_tuberia id=%s contrato=%s tenia_datos=%s user=%s",
        planilla_id, contrato_id, tenia_datos, _uid(current_user),
    )

    for table in (
        "topo_planilla_tuberia_filas",
        "topo_planilla_tuberia_descuentos",
        "topo_planilla_tuberia_consolidado",
        "topo_planilla_tuberia_auditoria",
    ):
        try:
            supabase.table(table).delete().eq("planilla_id", planilla_id).execute()
        except Exception:
            logger.exception("eliminar %s planilla=%s", table, planilla_id)

    supabase.table("topo_planillas_tuberia").delete().eq("id", planilla_id).eq(
        "contrato_id", contrato_id
    ).execute()
    return {"ok": True, "id": planilla_id, "tenia_datos": tenia_datos}


@router.get("/{contrato_id}/planillas-tuberia-consolidado")
def consolidado(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_planilla_tuberia_consolidado").select("*")
        .eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []
    )


def _tiene_datos_exportables(det: dict) -> bool:
    """True si hay al menos una fila de cartera con dato de campo (no plantilla vacía)."""
    calc = det.get("calculo") or {}
    for f in (calc.get("cartera") or {}).get("filas") or []:
        if not f.get("vacio"):
            return True
    for f in det.get("filas_campo") or []:
        if any(f.get(k) is not None for k in (
            "abscisa", "terreno_natural", "subrasante_via", "terminado_filtro", "cota_fondo_excavacion"
        )):
            return True
    return False


def _assert_export_permitido(current_user, det: dict) -> bool:
    """
    Exportación con datos: permiso exportar.
    Plantilla vacía (sin datos): solo Desarrollador (para verificar formato).
    Returns True si es plantilla vacía.
    """
    vacia = not _tiene_datos_exportables(det)
    if vacia:
        if not _es_desarrollador(current_user):
            raise HTTPException(
                422,
                "Sin datos para exportar. Solo Desarrollador puede descargar la plantilla vacía.",
            )
        return True
    _perm(current_user, "exportar")
    return False


def _catalogo_descuentos(tipo: str):
    return ITEMS_DESCUENTOS_FILTRO if tipo == "FILTRO" else ITEMS_DESCUENTOS_ALCANTARILLA


def _contrato_para_pdf(contrato_id: int) -> dict:
    row = _row(
        "contratos",
        id=contrato_id,
    ) or {}
    # Ampliar select de logos/número/objeto si la fila genérica no los trae.
    if not row.get("numero") and not row.get("logo_contratista"):
        try:
            q = (
                supabase.table("contratos")
                .select(
                    "id, numero, objeto, contratista, interventoria, "
                    "logo_contratista, logo_interventoria, logo_entidad"
                )
                .eq("id", contrato_id)
                .limit(1)
                .execute()
            )
            data = q.data or []
            if data:
                return data[0]
        except Exception:
            logger.exception("contrato para pdf planilla tuberia")
    return row


@router.get("/{contrato_id}/planillas-tuberia/{planilla_id}/excel")
def excel(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    """Exporta .xlsx (sin macros) construido desde el inventario JSON versionado."""
    _require_contract_access(current_user, contrato_id)
    det = _detalle(contrato_id, planilla_id)
    vacia = _assert_export_permitido(current_user, det)
    try:
        from topografia_planilla_tuberia_excel import build_planilla_tuberia_xlsx
    except ImportError as exc:
        raise HTTPException(500, "Exportador Excel no disponible") from exc

    p = det["planilla"]
    calc = det.get("calculo") or {}
    try:
        content = build_planilla_tuberia_xlsx(planilla=p, calculo=calc, vacia=vacia)
    except FileNotFoundError as exc:
        raise HTTPException(500, str(exc)) from exc
    except Exception as exc:
        logger.exception("excel planilla tuberia")
        raise HTTPException(500, f"No se pudo generar Excel: {exc}") from exc

    suffix = "_plantilla" if vacia else ""
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="planilla_tuberia_{planilla_id[:8]}{suffix}.xlsx"'
            )
        },
    )


@router.get("/{contrato_id}/planillas-tuberia/{planilla_id}/pdf")
def pdf(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    det = _detalle(contrato_id, planilla_id)
    vacia = _assert_export_permitido(current_user, det)
    p = det["planilla"]
    calc = det.get("calculo") or {}
    tipo = p.get("tipo") or "ALCANTARILLA"
    contrato = _contrato_para_pdf(contrato_id)

    def fmt(v, d=3):
        if v is None:
            return ""
        try:
            return f"{float(v):.{d}f}"
        except Exception:
            return str(v)

    filas = [f for f in (calc.get("cartera") or {}).get("filas") or [] if not f.get("vacio")]
    if vacia and not filas:
        filas = [{"orden": i, "vacio": True} for i in range(1, FILAS_INICIALES_CARTERA + 1)]

    nivel_hdr = "Terminado Filtro" if tipo == "FILTRO" else "Subrasante de Vía"
    meta = p.get("meta_cabecera") if isinstance(p.get("meta_cabecera"), dict) else {}
    firmas = p.get("firmas") if isinstance(p.get("firmas"), dict) else {}
    titulo = (
        "PLANILLA DE INSTALACIÓN DE FILTROS"
        if tipo == "FILTRO"
        else "PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS"
    )

    rows = "".join(
        f"<tr><td>{f.get('orden')}</td><td>{fmt(f.get('abscisa'),2)}</td>"
        f"<td>{fmt(f.get('terreno_natural'))}</td>"
        f"<td>{fmt(f.get('subrasante_via') if tipo=='ALCANTARILLA' else f.get('terminado_filtro'))}</td>"
        f"<td>{fmt(f.get('cota_fondo_excavacion'))}</td>"
        f"<td class='calc'>{fmt(f.get('altura_excavacion'))}</td>"
        f"<td class='calc'>{fmt(f.get('altura_triturado'))}</td>"
        f"<td class='calc'>{fmt(f.get('altura_relleno'))}</td>"
        f"<td class='calc'>{fmt(f.get('ancho_geotextil'))}</td></tr>"
        for f in filas
    )
    netos = calc.get("netos") or [
        {**it, "long": None, "ancho": None, "espesor": None, "bruto": None, "descuentos": None, "neto": None}
        for it in ITEMS_CANTIDADES
    ]
    cants = "".join(
        f"<tr><td>{n['nombre']}</td>"
        f"<td class='calc'>{fmt(n.get('long'))}</td>"
        f"<td class='calc'>{fmt(n.get('ancho'))}</td>"
        f"<td class='calc'>{fmt(n.get('espesor'))}</td>"
        f"<td class='calc'>{fmt(n.get('descuentos'))}</td>"
        f"<td class='calc'>{fmt(n.get('neto') if n.get('neto') is not None else n.get('bruto'))}</td></tr>"
        for n in netos
    )
    descuentos = calc.get("descuentos") or [
        {**it, "cantidad": None, "long": None, "ancho": None, "espesor": None}
        for it in _catalogo_descuentos(tipo)
    ]
    descs = "".join(
        f"<tr><td>{d['nombre']}</td>"
        f"<td class='calc'>{fmt(d.get('long'))}</td>"
        f"<td class='calc'>{fmt(d.get('ancho'))}</td>"
        f"<td class='calc'>{fmt(d.get('espesor'))}</td>"
        f"<td class='calc'>{fmt(d.get('cantidad'))}</td></tr>"
        for d in descuentos
        if d.get("nombre")
    )
    badge = (
        "<p class='badge'>PLANTILLA VACÍA — solo Desarrollador (verificación de formato)</p>"
        if vacia else ""
    )
    sec = calc.get("seccion") or {}
    elaboro = firmas.get("elaboro_nombre") or ""
    aprobo = firmas.get("aprobo_nombre") or ""

    from topografia_planilla_tuberia_pdf import (
        html_bloque_graficos_pdf,
        html_cabecera_planilla_tuberia,
        html_franja_tramo_tuberia,
    )

    cabecera = html_cabecera_planilla_tuberia(
        contrato=contrato, meta=meta, titulo=titulo
    )
    franja = html_franja_tramo_tuberia(planilla=p, calculo=calc, meta=meta)
    graficos = html_bloque_graficos_pdf(calc, tipo=tipo)

    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
    @page {{ size: letter portrait; margin: 6mm 5mm; }}
    body{{font-family:Arial,sans-serif;font-size:6.5pt;color:#0f172a;margin:0}}
    h2{{font-size:7pt;margin:2px 0 1px}}
    table.sheet{{border-collapse:collapse;width:100%;margin-bottom:2px}}
    table.sheet th,table.sheet td{{border:0.4pt solid #64748b;padding:4px 5px;font-size:7.5pt;line-height:1.4}}
    table.sheet th{{background:#D9D9D9;font-size:6pt}}
    .graficos-wrap{{width:100%;border-collapse:collapse;margin:2px 0 3px;table-layout:fixed}}
    .graficos-wrap td{{border:0.4pt solid #94a3b8;padding:1px;vertical-align:top;height:88px}}
    .graficos-wrap img{{display:block;width:100%;height:auto;margin:0 auto}}
    table.sheet th.desc{{background:#EA4296;color:#fff}}
    table.sheet th.cant{{background:#4472C4;color:#fff}}
    table.sheet td.calc{{background:#F2F2F2;text-align:right;font-family:Consolas,monospace}}
    .meta{{color:#334155;margin:0;font-size:6.5pt}}
    .badge{{background:#fef3c7;border:1px solid #f59e0b;padding:1px 5px;font-size:6.5pt;margin:1px 0}}
    .grid2{{width:100%;border-collapse:collapse;margin-top:1px}}
    .grid2 td{{vertical-align:top;padding:0 2px}}
    .firmas{{width:100%;border-collapse:collapse;margin-top:4px}}
    .firmas td{{width:50%;border-top:0.5pt solid #94a3b8;padding-top:2px;font-size:6.5pt;vertical-align:top}}
    </style></head><body>
    {cabecera}
    {badge}
    {franja}
    <h2>Cartera</h2>
    <table class="sheet"><thead><tr>
      <th>#</th><th>Abscisa</th><th>Terreno Natural</th><th>{nivel_hdr}</th>
      <th>Cota Fondo Excavación</th><th>Altura Excavacion</th><th>Altura Triturado</th>
      <th>Altura Relleno</th><th>Ancho Geotextil</th>
    </tr></thead><tbody>{rows}</tbody></table>
    <div style="clear:both;height:2px;"></div>{graficos}<div style="clear:both;height:6px;">&nbsp;</div>
    <table class="grid2"><tr>
      <td width="55%">
        <h2>Resumen de Cantidades</h2>
        <table class="sheet"><thead><tr>
          <th class="cant">Item</th><th class="cant">Long</th><th class="cant">Ancho</th>
          <th class="cant">Espesor</th><th class="cant">Desc.</th><th class="cant">Cantidad</th>
        </tr></thead><tbody>{cants}</tbody></table>
      </td>
      <td width="45%">
        <h2>Descuentos Específicos</h2>
        <table class="sheet"><thead><tr>
          <th class="desc">Item</th><th class="desc">Long</th><th class="desc">Ancho</th>
          <th class="desc">Espesor</th><th class="desc">Cantidad</th>
        </tr></thead><tbody>{descs}</tbody></table>
      </td>
    </tr></table>
    <table class="firmas"><tr>
      <td><b>Elaboró</b><br/>{elaboro}<br/><span class="meta">Topografo de Obra (Contratista)</span></td>
      <td><b>Aprobó:</b><br/>{aprobo}<br/><span class="meta">Topografo Interventoria</span></td>
    </tr></table>
    </body></html>"""
    try:
        from topografia_utils import to_pdf_bytes
        content, media = to_pdf_bytes(html_doc, landscape=False), "application/pdf"
    except Exception:
        content, media = html_doc.encode("utf-8"), "text/html; charset=utf-8"
    suffix = "_plantilla" if vacia else ""
    return Response(
        content=content, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="planilla_tuberia_{planilla_id[:8]}{suffix}.pdf"'},
    )

