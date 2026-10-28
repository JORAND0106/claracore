"""
Rutas — Reportar transporte (Obra Ejecutada).
POST /presupuesto/{contrato_id}/transporte/preview
POST /presupuesto/{contrato_id}/transporte/confirmar
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from main import (
    _cargo_permiso_crear_registros_presupuesto,
    _cargo_permiso_editar_registros_presupuesto,
    _es_desarrollador,
    _invalidate_dashboard_financial_caches,
    _pk_ids_ubicacion_por_codigo,
    _require_contract_access,
    get_current_user,
    registrar_log,
    supabase,
)
from presupuesto_papelera import aplicar_update_baja
from presupuesto_transporte import (
    elegir_ubicacion_origen,
    normalizar_items_origen,
    repartir_transporte_por_pk,
)

router = APIRouter(tags=["presupuesto-transporte"])

TIPO_OBRA = "Obra Ejecutada"
ESTADO_NO_REVISADO = "No Revisado"


class TransportePreviewBody(BaseModel):
    capitulo: str
    competencia: Optional[str] = ""
    items_origen: List[str] = Field(default_factory=list)
    item_destino: Optional[str] = None
    cantidad_reportar: Optional[float] = None


class TransporteConfirmarBody(BaseModel):
    capitulo: str
    competencia: Optional[str] = ""
    items_origen: List[str] = Field(default_factory=list)
    item_destino: str
    cantidad_reportar: float
    # create | replace | sum
    modo: str = "create"
    lote_previo_id: Optional[str] = None


def _assert_puede_reportar(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, contrato_id)
    if _es_desarrollador(current_user):
        return
    if _cargo_permiso_editar_registros_presupuesto(current_user, contrato_id) or _cargo_permiso_crear_registros_presupuesto(
        current_user, contrato_id
    ):
        return
    raise HTTPException(status_code=403, detail="Sin permiso para editar presupuesto.")


def _fetch_origen_rows(contrato_id: int, capitulo: str, competencia: str, items: List[str]) -> List[dict]:
    if not items:
        return []
    out: List[dict] = []
    PAGE = 1000
    for i in range(0, len(items), 80):
        chunk = items[i : i + 80]
        off = 0
        while True:
            batch = (
                supabase.table("presupuesto")
                .select(
                    "id, pk_id, cant_total, tramo, calzada, abs_inicio, abs_final, "
                    "no_inicio, no_final, infraestructura, item, competencia, capitulo"
                )
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", TIPO_OBRA)
                .eq("dado_de_baja", False)
                .eq("capitulo", capitulo)
                .eq("competencia", competencia)
                .in_("item", chunk)
                .order("id")
                .range(off, off + PAGE - 1)
                .execute()
                .data
                or []
            )
            out.extend(batch)
            if len(batch) < PAGE:
                break
            off += PAGE
    return out


def _agregar_por_pk(rows: List[dict], pk_ubic: Dict[str, dict]) -> List[dict]:
    by_pk: Dict[str, List[dict]] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        if not pk:
            continue
        by_pk.setdefault(pk, []).append(r)

    filas = []
    for pk, regs in by_pk.items():
        cant = 0.0
        for r in regs:
            try:
                cant += float(r.get("cant_total") or 0)
            except (TypeError, ValueError):
                pass
        if cant <= 0:
            continue
        ubi = elegir_ubicacion_origen(regs)
        info = pk_ubic.get(pk) or {}
        civ = ""
        if info.get("civ") is not None and str(info.get("civ")).strip():
            civ = str(info.get("civ")).strip()
        infra = (ubi.get("infraestructura") or "").strip() or str(info.get("infraestructura") or "").strip()
        filas.append({
            "pk_id": pk,
            "cant_compacta": round(cant, 6),
            "ubicacion": {
                "pk_id": pk,
                "civ": civ,
                "tramo": (ubi.get("tramo") or info.get("tramo") or "") or "",
                "calzada": (ubi.get("calzada") or info.get("calzada") or "") or "",
                "infraestructura": infra,
                "abs_inicio": ubi.get("abs_inicio"),
                "abs_final": ubi.get("abs_final"),
                "no_inicio": ubi.get("no_inicio"),
                "no_final": ubi.get("no_final"),
            },
        })
    filas.sort(key=lambda x: x["pk_id"])
    return filas


def _buscar_lote_previo(
    contrato_id: int,
    capitulo: str,
    competencia: str,
    items: List[str],
    item_destino: str,
) -> Optional[dict]:
    try:
        rows = (
            supabase.table("presupuesto_transporte_lotes")
            .select(
                "id, capitulo, competencia, items_origen, item_destino, "
                "cantidad_reportada, n_registros, usuario_nombre, created_at, activo"
            )
            .eq("contrato_id", contrato_id)
            .eq("capitulo", capitulo)
            .eq("competencia", competencia)
            .eq("item_destino", item_destino)
            .eq("activo", True)
            .order("created_at", desc=True)
            .limit(30)
            .execute()
            .data
            or []
        )
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo consultar lotes de transporte (¿migración aplicada?): {ex}",
        ) from ex

    want = set(items)
    for row in rows:
        got = set(normalizar_items_origen(row.get("items_origen") or []))
        if got == want:
            return row
    return None


def _listado_destino(contrato_id: int, item_destino: str) -> dict:
    candidatos = [item_destino]
    if not item_destino.endswith("."):
        candidatos.append(f"{item_destino}.")
    for cand in candidatos:
        rows = (
            supabase.table("listado_precios")
            .select("item_numero, descripcion, unidad, precio_unitario, capitulo, competencia")
            .eq("contrato_id", contrato_id)
            .eq("item_numero", cand)
            .limit(5)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0]
    raise HTTPException(
        status_code=404,
        detail=f"Ítem destino «{item_destino}» no está en el listado de precios.",
    )


def _usuario_nombre(current_user) -> str:
    nom = (current_user.get("nombre") or "").strip()
    ape = (current_user.get("apellidos") or "").strip()
    full = f"{nom} {ape}".strip()
    return full or (current_user.get("email") or "") or str(current_user.get("sub") or "")


def _build_preview_core(contrato_id: int, body: TransportePreviewBody) -> dict:
    capitulo = str(body.capitulo or "").strip()
    competencia = str(body.competencia or "").strip()
    items = normalizar_items_origen(body.items_origen)
    if not capitulo:
        raise HTTPException(status_code=422, detail="Seleccione un capítulo.")
    if not items:
        raise HTTPException(status_code=422, detail="Seleccione al menos un ítem de origen.")

    pk_ubic = {}
    try:
        pk_ubic = _pk_ids_ubicacion_por_codigo(contrato_id)
    except Exception:
        pk_ubic = {}

    rows = _fetch_origen_rows(contrato_id, capitulo, competencia, items)
    filas_pk = _agregar_por_pk(rows, pk_ubic)
    total_compacta = round(sum(f["cant_compacta"] for f in filas_pk), 6)

    reparto = None
    if body.cantidad_reportar is not None:
        reparto = repartir_transporte_por_pk(filas_pk, body.cantidad_reportar)

    destino_meta = None
    if body.item_destino and str(body.item_destino).strip():
        try:
            destino_meta = _listado_destino(contrato_id, str(body.item_destino).strip())
        except HTTPException:
            destino_meta = None

    previo = None
    if body.item_destino and str(body.item_destino).strip():
        previo = _buscar_lote_previo(
            contrato_id, capitulo, competencia, items, str(body.item_destino).strip()
        )

    return {
        "capitulo": capitulo,
        "competencia": competencia,
        "items_origen": items,
        "total_compacta": total_compacta,
        "n_pk": len(filas_pk),
        "filas": filas_pk,
        "reparto": reparto,
        "item_destino": destino_meta,
        "reporte_previo": previo,
    }


@router.post("/presupuesto/{contrato_id}/transporte/preview")
def preview_transporte(
    contrato_id: int,
    body: TransportePreviewBody,
    current_user=Depends(get_current_user),
):
    _assert_puede_reportar(current_user, contrato_id)
    return _build_preview_core(contrato_id, body)


@router.post("/presupuesto/{contrato_id}/transporte/confirmar")
def confirmar_transporte(
    contrato_id: int,
    body: TransporteConfirmarBody,
    current_user=Depends(get_current_user),
):
    _assert_puede_reportar(current_user, contrato_id)

    capitulo = str(body.capitulo or "").strip()
    competencia = str(body.competencia or "").strip()
    items = normalizar_items_origen(body.items_origen)
    item_destino = str(body.item_destino or "").strip()
    modo = str(body.modo or "create").strip().lower()
    if modo not in ("create", "replace", "sum"):
        raise HTTPException(status_code=422, detail="modo debe ser create, replace o sum.")
    if not capitulo or not items or not item_destino:
        raise HTTPException(status_code=422, detail="Capítulo, ítems de origen e ítem destino son obligatorios.")

    destino = _listado_destino(contrato_id, item_destino)
    try:
        vu = float(destino.get("precio_unitario") or 0)
    except (TypeError, ValueError):
        vu = 0.0
    vu = round(vu, 0)
    und = (destino.get("unidad") or "").strip()
    descripcion = (destino.get("descripcion") or "").strip()
    item_num = (destino.get("item_numero") or item_destino).strip()

    pk_ubic = {}
    try:
        pk_ubic = _pk_ids_ubicacion_por_codigo(contrato_id)
    except Exception:
        pk_ubic = {}
    rows = _fetch_origen_rows(contrato_id, capitulo, competencia, items)
    filas_pk = _agregar_por_pk(rows, pk_ubic)
    reparto = repartir_transporte_por_pk(filas_pk, body.cantidad_reportar)
    if not reparto.get("ok"):
        raise HTTPException(status_code=422, detail=reparto.get("error") or "No se pudo repartir.")

    ubi_by_pk = {f["pk_id"]: f["ubicacion"] for f in filas_pk}
    asignaciones = [f for f in reparto["filas"] if float(f.get("cant_transporte") or 0) > 0]
    if not asignaciones:
        raise HTTPException(status_code=422, detail="No hay PK_ID con asignación mayor a cero.")

    previo = _buscar_lote_previo(contrato_id, capitulo, competencia, items, item_destino)
    if previo and modo == "create":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "reporte_existente",
                "message": "Ya existe un reporte de transporte para esta combinación.",
                "reporte_previo": previo,
            },
        )
    if modo == "replace" and not (body.lote_previo_id or (previo or {}).get("id")):
        raise HTTPException(status_code=422, detail="Falta lote_previo_id para reemplazar.")

    lote_id = str(uuid.uuid4())
    uid = None
    try:
        uid = int(current_user.get("sub") or 0) or None
    except (TypeError, ValueError):
        uid = None
    u_nombre = _usuario_nombre(current_user)

    lote_prev_id = str(body.lote_previo_id or (previo or {}).get("id") or "").strip() or None
    ids_baja: List[int] = []

    # 1) Crear lote (los registros previos se dan de baja solo tras insert exitoso)
    try:
        supabase.table("presupuesto_transporte_lotes").insert({
            "id": lote_id,
            "contrato_id": contrato_id,
            "capitulo": capitulo,
            "competencia": competencia,
            "items_origen": items,
            "item_destino": item_num,
            "cantidad_reportada": reparto["total_asignado"],
            "n_registros": len(asignaciones),
            "usuario_id": uid,
            "usuario_nombre": u_nombre,
            "activo": True,
        }).execute()
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo crear el lote de transporte (¿migración aplicada?): {ex}",
        ) from ex

    # 2) Insertar registros (sin id_pol → no bloqueo CAD)
    nuevos: List[dict] = []
    for a in asignaciones:
        cant = float(a["cant_transporte"])
        costo = round(cant * vu, 0)
        ubi = ubi_by_pk.get(a["pk_id"]) or {"pk_id": a["pk_id"]}
        nuevos.append({
            "contrato_id": contrato_id,
            "tipo_ejecucion": TIPO_OBRA,
            "capitulo": capitulo,
            "competencia": competencia,
            "item": item_num,
            "descripcion": descripcion,
            "und": und,
            "vlr_unitario": vu,
            "cant_total": cant,
            "costo_directo": costo,
            "area_long_nod": cant,
            "ancho": 1,
            "espesor": 1,
            "tipo_entidad": "",
            "pk_id": ubi.get("pk_id") or a["pk_id"],
            "tramo": ubi.get("tramo") or "",
            "calzada": ubi.get("calzada") or "",
            "infraestructura": ubi.get("infraestructura") or "",
            "abs_inicio": ubi.get("abs_inicio"),
            "abs_final": ubi.get("abs_final"),
            "no_inicio": ubi.get("no_inicio"),
            "no_final": ubi.get("no_final"),
            "id_pol": "",
            "dado_de_baja": False,
            "revisado": ESTADO_NO_REVISADO,
            "pre_interv_estado": ESTADO_NO_REVISADO,
            "sellado": False,
            "transporte_lote_id": lote_id,
        })

    created_ids: List[int] = []
    try:
        BATCH = 200
        for i in range(0, len(nuevos), BATCH):
            batch = nuevos[i : i + BATCH]
            res = supabase.table("presupuesto").insert(batch).execute()
            data = getattr(res, "data", None) or []
            for row in data if isinstance(data, list) else [data]:
                if isinstance(row, dict) and row.get("id") is not None:
                    try:
                        created_ids.append(int(row["id"]))
                    except (TypeError, ValueError):
                        pass
        if len(created_ids) < len(nuevos):
            # Algunos drivers no retornan filas; verificar por lote.
            check = (
                supabase.table("presupuesto")
                .select("id")
                .eq("transporte_lote_id", lote_id)
                .eq("dado_de_baja", False)
                .execute()
                .data
                or []
            )
            created_ids = [int(r["id"]) for r in check if r.get("id") is not None]
            if len(created_ids) < len(nuevos):
                raise RuntimeError(
                    f"Se esperaban {len(nuevos)} registros, hay {len(created_ids)} en el lote."
                )
    except Exception as ex:
        # Rollback best-effort: nada del lote nuevo queda persistido.
        try:
            supabase.table("presupuesto").delete().eq("transporte_lote_id", lote_id).execute()
        except Exception:
            pass
        try:
            supabase.table("presupuesto_transporte_lotes").delete().eq("id", lote_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error al crear registros de transporte: {ex}") from ex

    # 3) Reemplazo: dar de baja el lote previo solo tras creación exitosa
    if modo == "replace" and lote_prev_id:
        try:
            prev_regs = (
                supabase.table("presupuesto")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("transporte_lote_id", lote_prev_id)
                .eq("dado_de_baja", False)
                .execute()
                .data
                or []
            )
        except Exception as ex:
            raise HTTPException(
                status_code=500,
                detail=f"Registros nuevos creados, pero no se pudieron leer el lote previo para baja: {ex}",
            ) from ex
        for r in prev_regs:
            try:
                rid = int(r["id"])
            except (TypeError, ValueError, KeyError):
                continue
            aplicar_update_baja(supabase, rid)
            ids_baja.append(rid)
        try:
            supabase.table("presupuesto_transporte_lotes").update(
                {"activo": False, "reemplazado_por": lote_id}
            ).eq("id", lote_prev_id).execute()
        except Exception:
            pass

    try:
        _invalidate_dashboard_financial_caches(contrato_id)
    except Exception:
        pass

    try:
        registrar_log(
            current_user,
            "CREAR",
            "PRESUPUESTO",
            "presupuesto_transporte",
            lote_id,
            {
                "contrato_id": contrato_id,
                "modo": modo,
                "capitulo": capitulo,
                "competencia": competencia,
                "items_origen": items,
                "item_destino": item_num,
                "cantidad_reportada": reparto["total_asignado"],
                "n_registros": len(created_ids),
                "ids_baja_previos": ids_baja,
                "lote_previo_id": lote_prev_id,
            },
        )
    except Exception:
        pass

    return {
        "ok": True,
        "lote_id": lote_id,
        "n_registros": len(created_ids),
        "cantidad_asignada": reparto["total_asignado"],
        "ids": created_ids,
        "modo": modo,
    }
