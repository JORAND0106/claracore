"""
Rutas — Reportar transporte (Obra Ejecutada), popup en dos fases.
GET  /presupuesto/{contrato_id}/transporte/opciones
POST /presupuesto/{contrato_id}/transporte/preview
POST /presupuesto/{contrato_id}/transporte/confirmar

Fase 1 (origen): capítulo + ítems → cantidades (todas las competencias).
Fase 2 (destino): capítulo/competencia/ítem donde nacen los registros nuevos.
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
    normalizar_items_origen,
    repartir_transporte_por_pk,
)
from presupuesto_transporte_fuentes import (
    agregar_por_pk,
    filas_oe_combinadas,
    opciones_oe_capitulo,
)

router = APIRouter(tags=["presupuesto-transporte"])

TIPO_OBRA = "Obra Ejecutada"
ESTADO_NO_REVISADO = "No Revisado"


class TransportePreviewBody(BaseModel):
    # Fase 1 — origen
    capitulo: str  # capítulo de origen
    items_origen: List[str] = Field(default_factory=list)
    cantidad_reportar: Optional[float] = None
    # Fase 2 — destino (opcionales en preview temprano)
    capitulo_destino: Optional[str] = None
    competencia_destino: Optional[str] = ""
    item_destino: Optional[str] = None
    # Legacy (ignorados): competencia de origen ya no se usa
    competencia: Optional[str] = None


class TransporteConfirmarBody(BaseModel):
    capitulo: str  # origen
    items_origen: List[str] = Field(default_factory=list)
    cantidad_reportar: float
    capitulo_destino: str
    competencia_destino: Optional[str] = ""
    item_destino: str
    modo: str = "create"  # create | replace | sum
    lote_previo_id: Optional[str] = None
    competencia: Optional[str] = None  # legacy


def _assert_puede_reportar(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, contrato_id)
    if _es_desarrollador(current_user):
        return
    if _cargo_permiso_editar_registros_presupuesto(current_user, contrato_id) or _cargo_permiso_crear_registros_presupuesto(
        current_user, contrato_id
    ):
        return
    raise HTTPException(status_code=403, detail="Sin permiso para editar presupuesto.")


def _fetch_origen_rows(
    contrato_id: int,
    capitulo: str,
    items: List[str],
    current_user,
) -> List[dict]:
    """Todas las competencias del capítulo + ítems (fuente combinada OE)."""
    if not items:
        return []
    return filas_oe_combinadas(
        contrato_id,
        capitulo,
        "",
        items,
        current_user,
        filtrar_competencia=False,
    )


def _buscar_lote_previo(
    contrato_id: int,
    capitulo_origen: str,
    items: List[str],
    capitulo_destino: str,
    competencia_destino: str,
    item_destino: str,
) -> Optional[dict]:
    try:
        rows = (
            supabase.table("presupuesto_transporte_lotes")
            .select(
                "id, capitulo, competencia, items_origen, item_destino, "
                "capitulo_origen, capitulo_destino, competencia_destino, "
                "cantidad_reportada, n_registros, usuario_nombre, created_at, activo"
            )
            .eq("contrato_id", contrato_id)
            .eq("item_destino", item_destino)
            .eq("activo", True)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo consultar lotes de transporte (¿migración aplicada?): {ex}",
        ) from ex

    want_items = set(items)
    want_cap_o = str(capitulo_origen or "").strip()
    want_cap_d = str(capitulo_destino or "").strip()
    want_comp_d = str(competencia_destino or "").strip()

    for row in rows:
        got_items = set(normalizar_items_origen(row.get("items_origen") or []))
        if got_items != want_items:
            continue
        cap_o = str(row.get("capitulo_origen") or row.get("capitulo") or "").strip()
        cap_d = str(row.get("capitulo_destino") or row.get("capitulo") or "").strip()
        comp_d = str(
            row.get("competencia_destino")
            if row.get("competencia_destino") is not None
            else (row.get("competencia") or "")
        ).strip()
        if cap_o == want_cap_o and cap_d == want_cap_d and comp_d == want_comp_d:
            return row
    return None


def _listado_destino(contrato_id: int, item_destino: str, capitulo_destino: Optional[str] = None) -> dict:
    candidatos = [item_destino]
    if not item_destino.endswith("."):
        candidatos.append(f"{item_destino}.")
    cap = str(capitulo_destino or "").strip()
    for cand in candidatos:
        q = (
            supabase.table("listado_precios")
            .select("item_numero, descripcion, unidad, precio_unitario, capitulo, competencia")
            .eq("contrato_id", contrato_id)
            .eq("item_numero", cand)
        )
        if cap:
            q = q.eq("capitulo", cap)
        rows = q.limit(5).execute().data or []
        if rows:
            return rows[0]
    # Sin filtro de capítulo (ítem único en el listado)
    if cap:
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


def _build_preview_core(contrato_id: int, body: TransportePreviewBody, current_user) -> dict:
    capitulo_origen = str(body.capitulo or "").strip()
    items = normalizar_items_origen(body.items_origen)
    if not capitulo_origen:
        raise HTTPException(status_code=422, detail="Seleccione un capítulo.")
    if not items:
        raise HTTPException(status_code=422, detail="Seleccione al menos un ítem de origen.")

    capitulo_destino = str(body.capitulo_destino or capitulo_origen).strip()
    competencia_destino = str(body.competencia_destino or "").strip()
    item_destino = str(body.item_destino or "").strip() or None

    pk_ubic = {}
    try:
        pk_ubic = _pk_ids_ubicacion_por_codigo(contrato_id)
    except Exception:
        pk_ubic = {}

    rows = _fetch_origen_rows(contrato_id, capitulo_origen, items, current_user)
    filas_pk = agregar_por_pk(rows, pk_ubic)
    total_compacta = round(sum(f["cant_compacta"] for f in filas_pk), 6)

    reparto = None
    if body.cantidad_reportar is not None:
        reparto = repartir_transporte_por_pk(filas_pk, body.cantidad_reportar)

    destino_meta = None
    if item_destino:
        try:
            destino_meta = _listado_destino(contrato_id, item_destino, capitulo_destino)
        except HTTPException:
            destino_meta = None

    previo = None
    if item_destino:
        previo = _buscar_lote_previo(
            contrato_id,
            capitulo_origen,
            items,
            capitulo_destino,
            competencia_destino,
            item_destino,
        )

    return {
        "capitulo": capitulo_origen,
        "capitulo_origen": capitulo_origen,
        "items_origen": items,
        "capitulo_destino": capitulo_destino,
        "competencia_destino": competencia_destino,
        "total_compacta": total_compacta,
        "n_pk": len(filas_pk),
        "filas": filas_pk,
        "reparto": reparto,
        "item_destino": destino_meta,
        "reporte_previo": previo,
    }


@router.get("/presupuesto/{contrato_id}/transporte/opciones")
def opciones_transporte(
    contrato_id: int,
    capitulo: str = Query(..., min_length=1),
    current_user=Depends(get_current_user),
):
    """Ítems de origen del capítulo (fuente combinada OE; todas las competencias)."""
    _assert_puede_reportar(current_user, contrato_id)
    cap = str(capitulo or "").strip()
    if not cap:
        raise HTTPException(status_code=422, detail="Seleccione un capítulo.")
    try:
        return opciones_oe_capitulo(contrato_id, cap, current_user)
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudieron cargar opciones de transporte: {ex}",
        ) from ex


@router.post("/presupuesto/{contrato_id}/transporte/preview")
def preview_transporte(
    contrato_id: int,
    body: TransportePreviewBody,
    current_user=Depends(get_current_user),
):
    _assert_puede_reportar(current_user, contrato_id)
    return _build_preview_core(contrato_id, body, current_user)


@router.post("/presupuesto/{contrato_id}/transporte/confirmar")
def confirmar_transporte(
    contrato_id: int,
    body: TransporteConfirmarBody,
    current_user=Depends(get_current_user),
):
    _assert_puede_reportar(current_user, contrato_id)

    capitulo_origen = str(body.capitulo or "").strip()
    items = normalizar_items_origen(body.items_origen)
    capitulo_destino = str(body.capitulo_destino or capitulo_origen).strip()
    competencia_destino = str(body.competencia_destino or "").strip()
    item_destino = str(body.item_destino or "").strip()
    modo = str(body.modo or "create").strip().lower()
    if modo not in ("create", "replace", "sum"):
        raise HTTPException(status_code=422, detail="modo debe ser create, replace o sum.")
    if not capitulo_origen or not items or not item_destino or not capitulo_destino:
        raise HTTPException(
            status_code=422,
            detail="Capítulo de origen, ítems de origen, capítulo destino e ítem destino son obligatorios.",
        )

    destino = _listado_destino(contrato_id, item_destino, capitulo_destino)
    try:
        vu = float(destino.get("precio_unitario") or 0)
    except (TypeError, ValueError):
        vu = 0.0
    vu = round(vu, 0)
    und = (destino.get("unidad") or "").strip()
    descripcion = (destino.get("descripcion") or "").strip()
    item_num = (destino.get("item_numero") or item_destino).strip()
    # Capítulo efectivo del registro = destino elegido (o el del listado si coincide).
    cap_reg = capitulo_destino or str(destino.get("capitulo") or "").strip() or capitulo_origen

    pk_ubic = {}
    try:
        pk_ubic = _pk_ids_ubicacion_por_codigo(contrato_id)
    except Exception:
        pk_ubic = {}
    rows = _fetch_origen_rows(contrato_id, capitulo_origen, items, current_user)
    filas_pk = agregar_por_pk(rows, pk_ubic)
    reparto = repartir_transporte_por_pk(filas_pk, body.cantidad_reportar)
    if not reparto.get("ok"):
        raise HTTPException(status_code=422, detail=reparto.get("error") or "No se pudo repartir.")

    ubi_by_pk = {f["pk_id"]: f["ubicacion"] for f in filas_pk}
    asignaciones = [f for f in reparto["filas"] if float(f.get("cant_transporte") or 0) > 0]
    if not asignaciones:
        raise HTTPException(status_code=422, detail="No hay PK_ID con asignación mayor a cero.")

    previo = _buscar_lote_previo(
        contrato_id,
        capitulo_origen,
        items,
        cap_reg,
        competencia_destino,
        item_num,
    )
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

    # 1) Crear lote
    try:
        supabase.table("presupuesto_transporte_lotes").insert({
            "id": lote_id,
            "contrato_id": contrato_id,
            "capitulo": capitulo_origen,  # legacy / origen
            "competencia": competencia_destino,  # legacy = destino
            "capitulo_origen": capitulo_origen,
            "capitulo_destino": cap_reg,
            "competencia_destino": competencia_destino,
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

    # 2) Insertar registros (campos de catálogo = destino; ubicación = origen)
    nuevos: List[dict] = []
    for a in asignaciones:
        cant = float(a["cant_transporte"])
        costo = round(cant * vu, 0)
        ubi = ubi_by_pk.get(a["pk_id"]) or {"pk_id": a["pk_id"]}
        nuevos.append({
            "contrato_id": contrato_id,
            "tipo_ejecucion": TIPO_OBRA,
            "capitulo": cap_reg,
            "competencia": competencia_destino,
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
        try:
            supabase.table("presupuesto").delete().eq("transporte_lote_id", lote_id).execute()
        except Exception:
            pass
        try:
            supabase.table("presupuesto_transporte_lotes").delete().eq("id", lote_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error al crear registros de transporte: {ex}") from ex

    # 3) Reemplazo: baja del lote previo solo tras creación exitosa
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
                "capitulo_origen": capitulo_origen,
                "items_origen": items,
                "capitulo_destino": cap_reg,
                "competencia_destino": competencia_destino,
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
