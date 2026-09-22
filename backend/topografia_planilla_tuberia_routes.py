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
    abscisas_extremos_cartera,
    calcular_planilla_completa,
    construir_fila_consolidado,
    filtrar_descuentos_manuales_por_tipo,
    lineas_planilla_a_registros_sicoe,
    migrar_filas_campo_al_cambiar_tipo,
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
    cantidades_manuales: Optional[list[dict[str, Any]]] = None


class CrearReporteSicoeBody(BaseModel):
    """Datos que no se derivan de la planilla: actores + capítulo + nodos editables."""
    subcontratista_id: int
    inspector_id: int
    capitulo: str
    nodo_ini: Optional[str] = None
    nodo_fin: Optional[str] = None
    abs_inicio: Optional[float] = None
    abs_final: Optional[float] = None


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



def _cantidades_manuales_from_meta(planilla: dict) -> list[dict]:
    meta = planilla.get("meta_cabecera") or {}
    if not isinstance(meta, dict):
        return []
    raw = meta.get("cantidades_manuales") or []
    return raw if isinstance(raw, list) else []



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
        cantidades_manuales=_cantidades_manuales_from_meta(planilla),
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
    # WGS84 sigue usando el par de inicio (EPSG transform sin cambios).
    # Preferir columnas norte_ref/este_ref; si faltan, meta_cabecera de Abs Inicial.
    meta_geo = planilla.get("meta_cabecera") if isinstance(planilla.get("meta_cabecera"), dict) else {}
    norte_wgs = planilla.get("norte_ref")
    if norte_wgs is None:
        norte_wgs = meta_geo.get("norte_abs_inicial")
    este_wgs = planilla.get("este_ref")
    if este_wgs is None:
        este_wgs = meta_geo.get("este_abs_inicial")
    if este_wgs is not None and norte_wgs is not None:
        try:
            lon, lat = gk_bogota_to_wgs84(float(este_wgs), float(norte_wgs))
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


# Conservado por compatibilidad de tests / imports; el replace ya no usa offset temporal.
_ORDEN_TEMP_OFFSET = 1_000_000


def _num_fp(v: Any) -> str:
    if v is None or v == "":
        return ""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v).strip()
    if not (n == n):  # NaN
        return ""
    s = f"{n:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def fingerprint_filas_campo(filas: list[dict]) -> list[str]:
    """Huella estable orden|abscisa|TN|CFE|subrasante|terminado (eco post-guardado)."""
    return sorted(
        f"{int(f.get('orden') or 0)}|{_num_fp(f.get('abscisa'))}|"
        f"{_num_fp(f.get('terreno_natural'))}|{_num_fp(f.get('cota_fondo_excavacion'))}|"
        f"{_num_fp(f.get('subrasante_via'))}|{_num_fp(f.get('terminado_filtro'))}"
        for f in (filas or [])
    )


def _fila_payload_db(planilla_id: str, f: dict, *, orden: int, row_id: Optional[str] = None) -> dict:
    return {
        "id": row_id or str(uuid4()),
        "planilla_id": planilla_id,
        "orden": int(orden),
        "abscisa": f.get("abscisa"),
        "terreno_natural": f.get("terreno_natural"),
        "subrasante_via": f.get("subrasante_via"),
        "terminado_filtro": f.get("terminado_filtro"),
        "cota_fondo_excavacion": f.get("cota_fondo_excavacion"),
        "norte": f.get("norte"),
        "este": f.get("este"),
        "observacion": f.get("observacion"),
    }


def _replace_filas(planilla_id: str, filas: list[dict]) -> list[dict]:
    """Reemplaza la cartera de forma idempotente por (planilla_id, orden).

    Evita el patrón insert+delete que chocaba con UNIQUE(planilla_id, orden) y
    que, ante fallos de verificación, podía dejar la cartera vacía.

    Estrategia:
      1) UPDATE filas cuyo orden ya existe
      2) INSERT órdenes nuevos
      3) DELETE órdenes que ya no vienen en el payload
      4) Verificar conteo + huella por SELECT (no confiar en insert.data)
    """
    prev = _filas(planilla_id)
    prev_by_orden: dict[int, dict] = {}
    for p in prev:
        try:
            prev_by_orden[int(p.get("orden"))] = p
        except (TypeError, ValueError):
            continue

    ordenes_finales = [int(f["orden"]) for f in filas]
    wanted = set(ordenes_finales)
    expected_fp = fingerprint_filas_campo([
        {**f, "orden": o} for f, o in zip(filas, ordenes_finales)
    ])

    logger.info(
        "planilla_tuberia_filas_replace start id=%s previas=%s payload=%s strategy=upsert_orden",
        planilla_id, len(prev), len(filas),
    )

    try:
        for f, o in zip(filas, ordenes_finales):
            fields = {
                "abscisa": f.get("abscisa"),
                "terreno_natural": f.get("terreno_natural"),
                "subrasante_via": f.get("subrasante_via"),
                "terminado_filtro": f.get("terminado_filtro"),
                "cota_fondo_excavacion": f.get("cota_fondo_excavacion"),
                "norte": f.get("norte"),
                "este": f.get("este"),
                "observacion": f.get("observacion"),
                "orden": o,
            }
            existing = prev_by_orden.get(o)
            if existing and existing.get("id"):
                supabase.table("topo_planilla_tuberia_filas").update(fields).eq(
                    "id", existing["id"]
                ).execute()
            else:
                supabase.table("topo_planilla_tuberia_filas").insert(
                    _fila_payload_db(planilla_id, f, orden=o)
                ).execute()

        obsolete_ids = [
            p["id"] for o, p in prev_by_orden.items()
            if o not in wanted and p.get("id")
        ]
        if obsolete_ids:
            for i in range(0, len(obsolete_ids), 100):
                supabase.table("topo_planilla_tuberia_filas").delete().in_(
                    "id", obsolete_ids[i:i + 100]
                ).execute()

        rows = _filas(planilla_id)
        if len(rows) != len(filas):
            raise RuntimeError(f"Cartera inconsistente {len(rows)}/{len(filas)}")
        got_fp = fingerprint_filas_campo(rows)
        if got_fp != expected_fp:
            # Log detallado; reintento de lectura (eventual consistency) antes de fallar
            rows2 = _filas(planilla_id)
            got_fp2 = fingerprint_filas_campo(rows2)
            if got_fp2 != expected_fp:
                logger.error(
                    "planilla_tuberia_filas_replace fingerprint mismatch id=%s expected=%s got=%s",
                    planilla_id, expected_fp, got_fp2,
                )
                raise RuntimeError(
                    "La huella de filas persistidas no coincide con el payload enviado."
                )
            rows = rows2
        logger.info(
            "planilla_tuberia_filas_replace ok id=%s saved=%s",
            planilla_id, len(rows),
        )
        return rows
    except Exception as exc:
        logger.exception(
            "planilla_tuberia_filas_replace fail id=%s err=%s", planilla_id, exc,
        )
        raise


@router.get("/{contrato_id}/planillas-tuberia")
def listar(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_planillas_tuberia")
        .select(
            "id,tipo,nombre,pk_id,costado,estado,version,diametro_m,relacion_atraque,"
            "created_at,updated_at,cerrado_at,creado_por,cerrado_por,validado_por,validado_at"
        )
        .eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []
    )
    uids = {
        int(u)
        for r in rows
        for u in (r.get("validado_por"), r.get("cerrado_por"), r.get("creado_por"))
        if u is not None and str(u).strip() != ""
    }
    nombres: dict[int, str] = {}
    if uids:
        try:
            data = (
                supabase.table("usuarios")
                .select("id,nombre,apellidos")
                .in_("id", list(uids))
                .execute()
                .data
                or []
            )
            for u in data:
                uid = int(u["id"])
                nom = " ".join(
                    x for x in (str(u.get("nombre") or "").strip(), str(u.get("apellidos") or "").strip()) if x
                ).strip()
                if nom:
                    nombres[uid] = nom
        except Exception:
            logger.exception("No se pudieron resolver nombres de usuarios para listado de planillas")
    out = []
    for r in rows:
        item = dict(r)
        vid = r.get("validado_por") or r.get("cerrado_por")
        try:
            vid_i = int(vid) if vid is not None and str(vid).strip() != "" else None
        except (TypeError, ValueError):
            vid_i = None
        item["validado_por_nombre"] = nombres.get(vid_i) if vid_i is not None else None
        out.append(item)
    return out


def _norm_nombre_planilla(nombre: Optional[str]) -> str:
    return str(nombre or "").strip()


def _assert_nombre_planilla_unico(
    contrato_id: int,
    nombre: Optional[str],
    *,
    exclude_id: Optional[str] = None,
) -> str:
    """Nombre obligatorio y único por contrato (comparación case-insensitive)."""
    nom = _norm_nombre_planilla(nombre)
    if not nom:
        raise HTTPException(422, "El nombre de la planilla es obligatorio.")
    rows = (
        supabase.table("topo_planillas_tuberia")
        .select("id,nombre")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    low = nom.casefold()
    for r in rows:
        if exclude_id and str(r.get("id")) == str(exclude_id):
            continue
        other = _norm_nombre_planilla(r.get("nombre"))
        if other and other.casefold() == low:
            raise HTTPException(
                422,
                f"Ya existe una planilla con el nombre «{nom}» en este contrato.",
            )
    return nom


@router.post("/{contrato_id}/planillas-tuberia")
def crear(contrato_id: int, body: CrearBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    tipo = (body.tipo or "ALCANTARILLA").upper()
    if tipo not in TIPOS_PLANILLA:
        raise HTTPException(422, f"Tipo inválido: {tipo}")
    nombre = _assert_nombre_planilla_unico(contrato_id, body.nombre)
    # creado_por = usuarios.id (INTEGER). No enviar UUID ni strings no numéricos.
    payload: dict[str, Any] = {
        "contrato_id": contrato_id,
        "tipo": tipo,
        "nombre": nombre,
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
    # Nombre siempre obligatorio y único (aunque no venga en el body, validar el resultante).
    nombre_final = patch.get("nombre", p.get("nombre"))
    patch["nombre"] = _assert_nombre_planilla_unico(
        contrato_id, nombre_final, exclude_id=planilla_id,
    )
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

    # Al cambiar tipo: migrar nivel de cartera y depurar descuentos del catálogo anterior
    tipo_prev = (p.get("tipo") or "ALCANTARILLA").upper()
    if "tipo" in patch and patch["tipo"] != tipo_prev:
        filas_db = _filas(planilla_id)
        migradas = migrar_filas_campo_al_cambiar_tipo(_as_campo(filas_db), patch["tipo"])
        if migradas:
            _replace_filas(planilla_id, [
                {
                    "orden": f.get("orden"),
                    "abscisa": f.get("abscisa"),
                    "terreno_natural": f.get("terreno_natural"),
                    "subrasante_via": f.get("subrasante_via"),
                    "terminado_filtro": f.get("terminado_filtro"),
                    "cota_fondo_excavacion": f.get("cota_fondo_excavacion"),
                    "norte": f.get("norte"),
                    "este": f.get("este"),
                    "observacion": f.get("observacion"),
                }
                for f in migradas
            ])
        desc_db = _descuentos(planilla_id)
        kept = filtrar_descuentos_manuales_por_tipo(
            patch["tipo"],
            [{"codigo": d.get("codigo"), "cantidad": d.get("cantidad")} for d in desc_db],
        )
        supabase.table("topo_planilla_tuberia_descuentos").delete().eq("planilla_id", planilla_id).execute()
        if kept:
            supabase.table("topo_planilla_tuberia_descuentos").insert([
                {
                    "planilla_id": planilla_id,
                    "codigo": d["codigo"],
                    "cantidad": float(d.get("cantidad") or 0),
                    "nota": None,
                }
                for d in kept
            ]).execute()

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

    if body.cantidades_manuales is not None:
        prev_meta = p.get("meta_cabecera") if isinstance(p.get("meta_cabecera"), dict) else {}
        new_meta = {**prev_meta, "cantidades_manuales": body.cantidades_manuales}
        supabase.table("topo_planillas_tuberia").update({
            "meta_cabecera": new_meta,
            "updated_at": _now(),
        }).eq("id", planilla_id).execute()
        p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id) or {**p, "meta_cabecera": new_meta}

    filas_util = []
    for f in body.filas:
        d = f.model_dump()
        if any(d.get(k) is not None for k in (
            "abscisa", "terreno_natural", "subrasante_via", "terminado_filtro", "cota_fondo_excavacion"
        )):
            filas_util.append(d)

    # Evita el wipe silencioso (mismo estándar que nivelación: cartera no vacía).
    if not filas_util:
        raise HTTPException(422, "No hay filas con datos para guardar en la cartera.")

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
    echo = detalle.get("filas_campo") or []
    if len(echo) != len(rows):
        raise HTTPException(500, "Verificación post-guardado falló (conteo).")
    fp = fingerprint_filas_campo(rows)
    if fingerprint_filas_campo(echo) != fp:
        raise HTTPException(500, "Verificación post-guardado falló (huella).")
    return {
        **detalle,
        "verified": True,
        "count": len(rows),
        "version": nueva_v,
        "fingerprint_orden": fp,
        "validacion": {"infos": valid.get("infos") or []},
    }


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/calcular")
def calcular(contrato_id: int, planilla_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return _detalle(contrato_id, planilla_id)


def _resolver_pk_id_maestro(contrato_id: int, pk_label: Optional[str]) -> Optional[int]:
    label = str(pk_label or "").strip()
    if not label:
        return None
    rows = (
        supabase.table("pk_ids")
        .select("id,pk_id")
        .eq("contrato_id", contrato_id)
        .eq("pk_id", label)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return int(rows[0]["id"])
    # Fallback: match case-insensitive via scan acotado
    all_rows = (
        supabase.table("pk_ids")
        .select("id,pk_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    label_l = label.lower()
    for r in all_rows:
        if str(r.get("pk_id") or "").strip().lower() == label_l:
            return int(r["id"])
    return None


def _sicoe_links_from_meta(meta: Any) -> list[dict]:
    if not isinstance(meta, dict):
        return []
    raw = meta.get("sicoe_reportes")
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, dict) and item.get("reporte_id") is not None:
            out.append(dict(item))
    return out


def _coords_wgs_planilla(p: dict) -> tuple[Optional[float], Optional[float]]:
    meta = p.get("meta_cabecera") if isinstance(p.get("meta_cabecera"), dict) else {}
    norte = p.get("norte_ref")
    if norte is None:
        norte = meta.get("norte_abs_inicial")
    este = p.get("este_ref")
    if este is None:
        este = meta.get("este_abs_inicial")
    if este is None or norte is None:
        return None, None
    try:
        lon, lat = gk_bogota_to_wgs84(float(este), float(norte))
        return float(lat), float(lon)
    except Exception:
        return None, None


@router.get("/{contrato_id}/planillas-tuberia/por-reporte-sicoe/{reporte_id}")
def planilla_por_reporte_sicoe(
    contrato_id: int, reporte_id: int, current_user=Depends(get_current_user),
):
    """Resuelve la planilla de origen vinculada a un so_reportes (pestaña SICOE)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_planillas_tuberia")
        .select("id,nombre,tipo,estado,pk_id,costado,meta_cabecera,updated_at")
        .eq("contrato_id", contrato_id)
        .order("updated_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    rid = int(reporte_id)
    for r in rows:
        for link in _sicoe_links_from_meta(r.get("meta_cabecera")):
            try:
                if int(link.get("reporte_id")) == rid:
                    return _detalle(contrato_id, r["id"])
            except (TypeError, ValueError):
                continue
    raise HTTPException(404, "No hay planilla de tubería vinculada a este reporte.")


@router.post("/{contrato_id}/planillas-tuberia/{planilla_id}/crear-reporte-sicoe")
def crear_reporte_sicoe_desde_planilla(
    contrato_id: int,
    planilla_id: str,
    body: CrearReporteSicoeBody,
    current_user=Depends(get_current_user),
):
    """
    Crea so_reportes + so_registros (sin ítem) a partir de la planilla.
    Reutiliza el mismo modelo/estructura que el wizard SICOE Obra.
    """
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    p = _row("topo_planillas_tuberia", id=planilla_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(404, "Planilla no encontrada")

    capitulo = str(body.capitulo or "").strip()
    if not capitulo:
        raise HTTPException(422, "Capítulo requerido")
    if not body.subcontratista_id or not body.inspector_id:
        raise HTTPException(422, "Subcontratista e Inspector son requeridos")

    nombre = str(p.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(422, "La planilla debe tener nombre antes de crear el reporte.")

    filas = _filas(planilla_id)
    if not filas:
        raise HTTPException(422, "Guarde la cartera de campo con datos antes de crear el reporte.")

    try:
        calc = _calcular(p, filas, _descuentos(planilla_id))
    except HTTPException as exc:
        raise HTTPException(
            422,
            "Configure diámetro y ancho de excavación, y asegúrese de tener cartera calculable.",
        ) from exc

    lineas = lineas_planilla_a_registros_sicoe(calc)
    if not lineas:
        raise HTTPException(
            422,
            "No hay líneas de cantidad/descuento con valor ≠ 0 para generar registros.",
        )

    abs0, abs1 = abscisas_extremos_cartera(calc, filas)
    if body.abs_inicio is not None:
        abs0 = float(body.abs_inicio)
    if body.abs_final is not None:
        abs1 = float(body.abs_final)
    if abs0 is not None and abs1 is not None and abs0 > abs1:
        abs0, abs1 = abs1, abs0

    nodo_ini = (body.nodo_ini if body.nodo_ini is not None else (str(abs0) if abs0 is not None else None))
    nodo_fin = (body.nodo_fin if body.nodo_fin is not None else (str(abs1) if abs1 is not None else None))
    if isinstance(nodo_ini, str):
        nodo_ini = nodo_ini.strip() or None
    if isinstance(nodo_fin, str):
        nodo_fin = nodo_fin.strip() or None

    pk_id_id = _resolver_pk_id_maestro(contrato_id, p.get("pk_id"))
    lat, lng = _coords_wgs_planilla(p)
    margen = str(p.get("costado") or "").strip() or None
    uid = _uid(current_user)

    # 1) Cabecera so_reportes (mismo flujo que POST /sicoe-obra/.../reportes)
    try:
        from main import (
            _get_niveles_activos_contrato,
            _invalidate_dashboard_financial_caches,
            _so_registro_normalizar_graficos_historial,
            _so_reportes_normalizar_payload_cabecera,
            _sicoe_resolver_acta_semana_corte,
            registrar_log,
            supabase_execute,
        )
    except ImportError:
        _so_reportes_normalizar_payload_cabecera = None  # type: ignore
        _so_registro_normalizar_graficos_historial = lambda d: d  # type: ignore
        _sicoe_resolver_acta_semana_corte = lambda *_a, **_k: (None, None, None)  # type: ignore
        _get_niveles_activos_contrato = lambda *_a, **_k: [1, 2, 3]  # type: ignore
        _invalidate_dashboard_financial_caches = lambda *_a, **_k: None  # type: ignore
        registrar_log = None  # type: ignore

        def supabase_execute(fn):  # type: ignore
            return fn()

    numero = supabase_execute(
        lambda: supabase.rpc("siguiente_numero_reporte", {"p_contrato_id": contrato_id}).execute().data
    )
    acta_rpo_id, semana_id, corte_id = _sicoe_resolver_acta_semana_corte(
        int(contrato_id), int(body.subcontratista_id),
    )

    reporte_payload: dict[str, Any] = {
        "descripcion_actividad": nombre,
        "subcontratista_id": int(body.subcontratista_id),
        "inspector_id": int(body.inspector_id),
        "capitulo": capitulo,
        "pk_id_id": pk_id_id,
        "margen": margen,
        "abs_inicio": abs0,
        "abs_final": abs1,
        "nodo_ini": nodo_ini,
        "nodo_fin": nodo_fin,
        "coord_lat": lat,
        "coord_lng": lng,
        "tipo_localizacion": "unica",
        "estado": "Sin Asignar Ítem",
        "contrato_id": contrato_id,
        "numero_reporte": numero,
        "creado_por": uid,
        "acta_rpo_id": acta_rpo_id,
        "semana_id": semana_id,
        "corte_id": corte_id,
    }
    if _so_reportes_normalizar_payload_cabecera:
        _so_reportes_normalizar_payload_cabecera(reporte_payload)

    rep_rows = supabase_execute(
        lambda: supabase.table("so_reportes").insert(reporte_payload).execute().data
    )
    if not rep_rows:
        raise HTTPException(500, "No se pudo crear el reporte en SICOE Obra")
    reporte = rep_rows[0]
    reporte_id = int(reporte["id"])

    # 2) Números de registro + insert lote
    nlines = len(lineas)
    numeros: list[int] = []
    try:
        raw_nums = supabase_execute(
            lambda: supabase.rpc(
                "siguiente_n_numeros_registro",
                {"p_contrato_id": contrato_id, "p_n": nlines},
            ).execute().data
        )
        if isinstance(raw_nums, list) and len(raw_nums) == nlines:
            numeros = [int(x) for x in raw_nums]
    except Exception:
        numeros = []
    if len(numeros) != nlines:
        numeros = []
        for _ in range(nlines):
            numeros.append(int(supabase_execute(
                lambda: supabase.rpc(
                    "siguiente_numero_registro", {"p_contrato_id": contrato_id}
                ).execute().data
            )))

    niveles = _get_niveles_activos_contrato(int(contrato_id)) or [1, 2, 3]
    rows_ins: list[dict[str, Any]] = []
    mapa_codigos: dict[str, int] = {}
    for line, num in zip(lineas, numeros):
        data = {k: v for k, v in line.items() if not str(k).startswith("_")}
        data.update({
            "reporte_id": reporte_id,
            "numero_registro": int(num),
            "contrato_id": contrato_id,
            "creado_por_reg": uid,
            "modificado_por_reg": uid,
            "bloqueado": False,
            "capitulo": capitulo,
            "pk_id_id": pk_id_id,
            "margen": margen,
            "abs_inicio": abs0,
            "abs_final": abs1,
            "nodo_ini": nodo_ini,
            "nodo_fin": nodo_fin,
            "coord_lat": lat,
            "coord_lng": lng,
            "subcontratista_id": int(body.subcontratista_id),
            "inspector_id": int(body.inspector_id),
            "acta_rpo_id": acta_rpo_id,
            "semana_id": semana_id,
            "corte_id": corte_id,
        })
        for n in niveles:
            try:
                ni = int(n)
            except (TypeError, ValueError):
                continue
            if 1 <= ni <= 6:
                data[f"nivel{ni}_estado"] = "No Revisado"
                data[f"nivel{ni}_usuario_id"] = None
                data[f"nivel{ni}_fecha"] = None
        _so_registro_normalizar_graficos_historial(data)
        rows_ins.append(data)
        origen_key = f"{line.get('_origen_tabla')}:{line.get('_origen_codigo')}"
        mapa_codigos[origen_key] = int(num)

    inserted = supabase_execute(
        lambda: supabase.table("so_registros").insert(rows_ins).execute().data
    ) or []

    # 3) Vínculo cruzado en meta_cabecera de la planilla
    prev_meta = p.get("meta_cabecera") if isinstance(p.get("meta_cabecera"), dict) else {}
    links = _sicoe_links_from_meta(prev_meta)
    link = {
        "reporte_id": reporte_id,
        "numero_reporte": reporte.get("numero_reporte"),
        "created_at": _now(),
        "capitulo": capitulo,
        "n_registros": len(rows_ins),
        "registro_numeros_por_codigo": mapa_codigos,
    }
    links.append(link)
    new_meta = {**prev_meta, "sicoe_reportes": links}
    supabase.table("topo_planillas_tuberia").update({
        "meta_cabecera": new_meta,
        "updated_at": _now(),
        "version": int(p.get("version") or 1) + 1,
    }).eq("id", planilla_id).execute()

    try:
        if registrar_log:
            from main import _audit_user_contrato
            u_log = _audit_user_contrato(current_user, contrato_id)
            registrar_log(
                u_log, "CREAR", "SICOE", "reporte", str(reporte_id),
                {
                    "origen": "planilla_tuberia",
                    "planilla_id": planilla_id,
                    "numero_reporte": reporte.get("numero_reporte"),
                    "n_registros": len(rows_ins),
                },
            )
    except Exception:
        logger.exception("audit crear reporte desde planilla")
    try:
        _invalidate_dashboard_financial_caches(int(contrato_id))
    except Exception:
        pass

    return {
        "ok": True,
        "reporte": reporte,
        "reporte_id": reporte_id,
        "numero_reporte": reporte.get("numero_reporte"),
        "n_registros": len(inserted) or len(rows_ins),
        "link": link,
        "planilla": _detalle(contrato_id, planilla_id),
    }


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
        raise HTTPException(
            422,
            "No hay cartera para cerrar. Guarde la cartera de campo (con datos) antes de cerrar la planilla.",
        )
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
        f"<tr><td class='item'>{n['nombre']}</td>"
        f"<td class='calc num'>{fmt(n.get('long'))}</td>"
        f"<td class='calc num'>{fmt(n.get('ancho'))}</td>"
        f"<td class='calc num'>{fmt(n.get('espesor'))}</td>"
        f"<td class='calc num'>{fmt(n.get('descuentos'))}</td>"
        f"<td class='calc num'>{fmt(n.get('neto') if n.get('neto') is not None else n.get('bruto'))}</td></tr>"
        for n in netos
    )
    descuentos = calc.get("descuentos") or [
        {**it, "cantidad": None, "long": None, "ancho": None, "espesor": None}
        for it in _catalogo_descuentos(tipo)
    ]
    descs = "".join(
        f"<tr><td class='item'>{d['nombre']}</td>"
        f"<td class='calc num'>{fmt(d.get('long'))}</td>"
        f"<td class='calc num'>{fmt(d.get('ancho'))}</td>"
        f"<td class='calc num'>{fmt(d.get('espesor'))}</td>"
        f"<td class='calc num'>{fmt(d.get('cantidad'))}</td></tr>"
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
    table.sheet.cartera th,table.sheet.cartera td{{padding:3px 4px;font-size:7pt;line-height:1.15}}
    table.sheet.cartera th{{font-size:5.5pt;background:#B0B0B0;color:#1e293b}}
    table.sheet.resumen th,table.sheet.resumen td{{padding:2px 3px;font-size:6.5pt;line-height:1.05}}
    table.sheet.resumen th{{font-size:5.5pt}}
    table.sheet.resumen th.item,table.sheet.resumen td.item{{width:42%;white-space:nowrap;text-align:left}}
    table.sheet.resumen th.num,table.sheet.resumen td.num{{width:11%;white-space:nowrap}}
    .graficos-wrap{{width:100%;border-collapse:collapse;margin:2px 0 3px;table-layout:fixed}}
    .graficos-wrap td{{border:0.4pt solid #94a3b8;padding:1px;vertical-align:top;height:141px}}
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
    <table class="sheet cartera"><thead><tr>
      <th>#</th><th>Abscisa</th><th>Terreno Natural</th><th>{nivel_hdr}</th>
      <th>Cota Fondo Excavación</th><th>Altura Excavacion</th><th>Altura Triturado</th>
      <th>Altura Relleno</th><th>Ancho Geotextil</th>
    </tr></thead><tbody>{rows}</tbody></table>
    <div style="clear:both;height:2px;"></div>{graficos}<div style="clear:both;height:6px;">&nbsp;</div>
    <table class="grid2"><tr>
      <td width="58%">
        <h2>Resumen de Cantidades</h2>
        <table class="sheet resumen"><thead><tr>
          <th class="cant item" width="42%">Item</th><th class="cant num">Long</th><th class="cant num">Ancho</th>
          <th class="cant num">Espesor</th><th class="cant num">Desc.</th><th class="cant num">Cantidad</th>
        </tr></thead><tbody>{cants}</tbody></table>
      </td>
      <td width="42%">
        <h2>Descuentos Específicos</h2>
        <table class="sheet resumen"><thead><tr>
          <th class="desc item" width="46%">Item</th><th class="desc num">Long</th><th class="desc num">Ancho</th>
          <th class="desc num">Área</th><th class="desc num">Cantidad</th>
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

