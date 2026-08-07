"""
Rutas HTTP — gráficos de memorias de Presupuesto (grupos persistentes).
Prefijo: /presupuesto/{contrato_id}/graficos
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from azure_blob_storage import path_presupuesto_grafico, upload_blob

_log = logging.getLogger("claracore.presupuesto.graficos")

router = APIRouter(tags=["presupuesto-graficos"])


def _norm_pie_foto(raw: Any) -> str:
    return " ".join(str(raw or "").split()).strip()


def _require_pie_foto(raw: Any) -> str:
    pie = _norm_pie_foto(raw)
    if not pie:
        raise HTTPException(status_code=422, detail="El pie de foto es obligatorio")
    if len(pie) > 280:
        raise HTTPException(
            status_code=422, detail="El pie de foto no puede superar 280 caracteres"
        )
    return pie


class ImagenGrupoIn(BaseModel):
    url: str
    blob_path: Optional[str] = None
    descripcion: Optional[str] = None
    origen: Optional[str] = "upload"
    orden: Optional[int] = 0


class CrearGrupoGraficosBody(BaseModel):
    presupuesto_ids: List[int] = Field(default_factory=list)
    imagenes: List[ImagenGrupoIn] = Field(default_factory=list)
    titulo: Optional[str] = None
    pie_foto: str = ""


class AgregarRegsBody(BaseModel):
    presupuesto_ids: List[int] = Field(default_factory=list)


class ActualizarGrupoGraficosBody(BaseModel):
    pie_foto: str = ""
    titulo: Optional[str] = None


class ReemplazarImagenBody(BaseModel):
    url: str
    blob_path: Optional[str] = None
    origen: Optional[str] = "upload"
    descripcion: Optional[str] = None
    pie_foto: Optional[str] = None


class RedaccionClaraPieBody(BaseModel):
    texto: str = ""
    instruccion: Optional[str] = None
    historial: Optional[List[Dict[str, str]]] = None


def _ext_desde_content_type(content_type: Optional[str]) -> str:
    c = (content_type or "image/jpeg").split(";")[0].strip().lower()
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(c, ".jpg")


def _assert_grupo_del_contrato(supabase, contrato_id: int, grupo_id: str) -> dict:
    rows = (
        supabase.table("presupuesto_grafico_grupos")
        .select("id, contrato_id, titulo, pie_foto, created_at, created_by")
        .eq("id", grupo_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    return rows[0]


def _validar_presupuesto_ids(supabase, contrato_id: int, ids: List[int]) -> List[int]:
    ids = sorted({int(x) for x in ids if x is not None})
    if not ids:
        return []
    check = (
        supabase.table("presupuesto")
        .select("id")
        .eq("contrato_id", contrato_id)
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    found = {int(r["id"]) for r in check}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Registros no encontrados en el contrato: {missing[:10]}",
        )
    return ids


def _pk_infra_mapa(supabase, contrato_id: int, ppto_rows: List[dict]) -> Dict[str, str]:
    pk_codes = list({str(r.get("pk_id") or "").strip() for r in ppto_rows if r.get("pk_id")})
    pk_infra: Dict[str, str] = {}
    if not pk_codes:
        return pk_infra
    try:
        pk_data = (
            supabase.table("pk_ids")
            .select("codigo, infraestructura")
            .eq("contrato_id", contrato_id)
            .in_("codigo", pk_codes)
            .execute()
            .data
            or []
        )
        for p in pk_data:
            c = str(p.get("codigo") or "").strip()
            if c:
                pk_infra[c] = (p.get("infraestructura") or "").strip()
    except Exception as exc:
        _log.warning("pk_ids infra para graficos: %s", exc)
    return pk_infra


def _enrich_ppto_rows(supabase, contrato_id: int, ppto_rows: List[dict]) -> List[Dict[str, Any]]:
    pk_infra = _pk_infra_mapa(supabase, contrato_id, ppto_rows)
    out = []
    for r in ppto_rows:
        pk = str(r.get("pk_id") or "").strip()
        out.append(
            {
                "id": int(r["id"]),
                "capitulo": (r.get("capitulo") or "").strip(),
                "item": (r.get("item") or "").strip(),
                "tramo": (r.get("tramo") or "").strip(),
                "id_pol": r.get("id_pol") or "",
                "pk_id": r.get("pk_id") or "",
                "abs_inicio": r.get("abs_inicio"),
                "abs_final": r.get("abs_final"),
                "tipo_entidad": (r.get("tipo_entidad") or "").strip(),
                "infraestructura": pk_infra.get(pk, ""),
            }
        )
    return out


def _fetch_regs_info_by_ids(
    supabase, contrato_id: int, pids: List[int]
) -> Dict[int, Dict[str, Any]]:
    if not pids:
        return {}
    ppto_rows = (
        supabase.table("presupuesto")
        .select("id, capitulo, item, tramo, id_pol, abs_inicio, abs_final, pk_id, tipo_entidad")
        .eq("contrato_id", contrato_id)
        .in_("id", pids)
        .execute()
        .data
        or []
    )
    enriched = _enrich_ppto_rows(supabase, contrato_id, ppto_rows)
    return {r["id"]: r for r in enriched}


def _items_keys_from_regs(regs: List[Dict[str, Any]]) -> List[str]:
    keys: List[str] = []
    seen: Set[str] = set()
    for r in regs:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not cap or not it:
            continue
        label = f"{cap} · {it}"
        if label not in seen:
            seen.add(label)
            keys.append(label)
    return keys


def _serialize_grupo_detalle(
    supabase, contrato_id: int, grupo: dict, regs_j: List[dict], imgs: List[dict]
) -> dict:
    pids = [int(r["presupuesto_id"]) for r in regs_j]
    by_id = _fetch_regs_info_by_ids(supabase, contrato_id, pids)
    regs = [by_id[pid] for pid in pids if pid in by_id]
    pie = _norm_pie_foto(grupo.get("pie_foto"))
    imagenes = sorted(imgs or [], key=lambda x: (int(x.get("orden") or 0), int(x.get("id") or 0)))
    thumb = imagenes[0]["url"] if imagenes else None
    return {
        "id": grupo["id"],
        "titulo": grupo.get("titulo"),
        "created_at": grupo.get("created_at"),
        "created_by": grupo.get("created_by"),
        "pie_foto": pie,
        "caption": pie or "—",
        "registros_count": len(regs),
        "imagenes_count": len(imagenes),
        "thumb_url": thumb,
        "items": _items_keys_from_regs(regs),
        "registros": regs,
        "imagenes": [
            {
                "id": im.get("id"),
                "url": im.get("url"),
                "blob_path": im.get("blob_path"),
                "origen": im.get("origen"),
                "orden": im.get("orden") or 0,
                "descripcion": im.get("descripcion"),
            }
            for im in imagenes
        ],
    }


def register_deps(supabase, get_current_user, require_contract_access):
    """Inyecta dependencias desde main (evita import circular al cargar el módulo)."""

    @router.post("/presupuesto/{contrato_id}/graficos/upload")
    async def upload_grafico_presupuesto(
        contrato_id: int,
        file: UploadFile = File(...),
        current_user=Depends(get_current_user),
    ):
        require_contract_access(current_user, contrato_id)
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=422, detail="Archivo vacío")
        ext = _ext_desde_content_type(file.content_type)
        nombre = f"g_{uuid.uuid4().hex}"
        blob_path = path_presupuesto_grafico(contrato_id, nombre, ext)
        try:
            url = upload_blob(blob_path, contents, file.content_type, overwrite=True)
        except Exception as exc:
            _log.warning("Azure Blob upload presupuesto grafico %s: %s", blob_path, exc)
            raise HTTPException(
                status_code=503,
                detail="No se pudo subir el gráfico a Azure Blob Storage.",
            ) from exc
        return {"url": url, "blob_path": blob_path}

    @router.post("/presupuesto/{contrato_id}/graficos/grupos")
    def crear_grupo_graficos(
        contrato_id: int,
        body: CrearGrupoGraficosBody,
        current_user=Depends(get_current_user),
    ):
        require_contract_access(current_user, contrato_id)
        ids = _validar_presupuesto_ids(supabase, contrato_id, body.presupuesto_ids or [])
        if not ids:
            raise HTTPException(status_code=422, detail="Seleccione al menos un registro")
        imgs = body.imagenes or []
        if not imgs:
            raise HTTPException(status_code=422, detail="Cargue al menos una imagen")
        pie_foto = _require_pie_foto(body.pie_foto)

        uid = current_user.get("id") if isinstance(current_user, dict) else None
        g_ins = (
            supabase.table("presupuesto_grafico_grupos")
            .insert(
                {
                    "contrato_id": contrato_id,
                    "titulo": (body.titulo or "").strip() or None,
                    "pie_foto": pie_foto,
                    "created_by": uid,
                }
            )
            .execute()
            .data
        )
        if not g_ins:
            raise HTTPException(status_code=500, detail="No se pudo crear el grupo")
        grupo_id = g_ins[0]["id"]

        supabase.table("presupuesto_grafico_grupo_regs").insert(
            [{"grupo_id": grupo_id, "presupuesto_id": pid} for pid in ids]
        ).execute()

        rows_img = []
        for i, im in enumerate(imgs):
            url = (im.url or "").strip()
            if not url:
                continue
            rows_img.append(
                {
                    "grupo_id": grupo_id,
                    "url": url,
                    "blob_path": (im.blob_path or "").strip() or None,
                    "descripcion": (im.descripcion or "").strip() or None,
                    "origen": (im.origen or "upload").strip() or "upload",
                    "orden": int(im.orden if im.orden is not None else i),
                    "created_by": uid,
                }
            )
        if not rows_img:
            raise HTTPException(status_code=422, detail="Ninguna imagen válida")
        supabase.table("presupuesto_grafico_imagenes").insert(rows_img).execute()

        return {"ok": True, "grupo_id": grupo_id, "registros": len(ids), "imagenes": len(rows_img)}

    @router.get("/presupuesto/{contrato_id}/graficos/grupos")
    def listar_grupos_graficos(
        contrato_id: int,
        current_user=Depends(get_current_user),
    ):
        """Listado de grupos del contrato (miniatura, conteos, ítems, pie de foto)."""
        require_contract_access(current_user, contrato_id)
        grupos = (
            supabase.table("presupuesto_grafico_grupos")
            .select("id, contrato_id, titulo, pie_foto, created_at, created_by")
            .eq("contrato_id", contrato_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        if not grupos:
            return {"grupos": []}
        gids = [g["id"] for g in grupos]
        regs_j = (
            supabase.table("presupuesto_grafico_grupo_regs")
            .select("grupo_id, presupuesto_id")
            .in_("grupo_id", gids)
            .execute()
            .data
            or []
        )
        imgs = (
            supabase.table("presupuesto_grafico_imagenes")
            .select("id, grupo_id, url, blob_path, origen, orden, descripcion")
            .in_("grupo_id", gids)
            .order("orden")
            .execute()
            .data
            or []
        )
        regs_by: Dict[str, List[dict]] = {}
        for j in regs_j:
            regs_by.setdefault(j["grupo_id"], []).append(j)
        imgs_by: Dict[str, List[dict]] = {}
        for im in imgs:
            imgs_by.setdefault(im["grupo_id"], []).append(im)

        out = []
        for g in grupos:
            gid = g["id"]
            out.append(
                _serialize_grupo_detalle(
                    supabase, contrato_id, g, regs_by.get(gid, []), imgs_by.get(gid, [])
                )
            )
        return {"grupos": out}

    @router.get("/presupuesto/{contrato_id}/graficos/grupos/{grupo_id}")
    def detalle_grupo_graficos(
        contrato_id: int,
        grupo_id: str,
        current_user=Depends(get_current_user),
    ):
        require_contract_access(current_user, contrato_id)
        g = _assert_grupo_del_contrato(supabase, contrato_id, grupo_id)
        regs_j = (
            supabase.table("presupuesto_grafico_grupo_regs")
            .select("grupo_id, presupuesto_id")
            .eq("grupo_id", grupo_id)
            .execute()
            .data
            or []
        )
        imgs = (
            supabase.table("presupuesto_grafico_imagenes")
            .select("id, grupo_id, url, blob_path, origen, orden, descripcion")
            .eq("grupo_id", grupo_id)
            .order("orden")
            .execute()
            .data
            or []
        )
        return _serialize_grupo_detalle(supabase, contrato_id, g, regs_j, imgs)

    @router.post("/presupuesto/{contrato_id}/graficos/grupos/{grupo_id}/registros")
    def agregar_regs_grupo(
        contrato_id: int,
        grupo_id: str,
        body: AgregarRegsBody,
        current_user=Depends(get_current_user),
    ):
        """Agrega registros al grupo sin afectar imagen ni el resto de la membresía."""
        require_contract_access(current_user, contrato_id)
        _assert_grupo_del_contrato(supabase, contrato_id, grupo_id)
        ids = _validar_presupuesto_ids(supabase, contrato_id, body.presupuesto_ids or [])
        if not ids:
            raise HTTPException(status_code=422, detail="Seleccione al menos un registro")

        existentes = (
            supabase.table("presupuesto_grafico_grupo_regs")
            .select("presupuesto_id")
            .eq("grupo_id", grupo_id)
            .in_("presupuesto_id", ids)
            .execute()
            .data
            or []
        )
        ya = {int(r["presupuesto_id"]) for r in existentes}
        nuevos = [i for i in ids if i not in ya]
        if nuevos:
            supabase.table("presupuesto_grafico_grupo_regs").insert(
                [{"grupo_id": grupo_id, "presupuesto_id": pid} for pid in nuevos]
            ).execute()
        return {"ok": True, "agregados": len(nuevos), "ya_existian": len(ya)}

    @router.delete(
        "/presupuesto/{contrato_id}/graficos/grupos/{grupo_id}/registros/{presupuesto_id}"
    )
    def quitar_reg_grupo(
        contrato_id: int,
        grupo_id: str,
        presupuesto_id: int,
        current_user=Depends(get_current_user),
    ):
        require_contract_access(current_user, contrato_id)
        _assert_grupo_del_contrato(supabase, contrato_id, grupo_id)
        supabase.table("presupuesto_grafico_grupo_regs").delete().eq(
            "grupo_id", grupo_id
        ).eq("presupuesto_id", presupuesto_id).execute()
        return {"ok": True}

    @router.put(
        "/presupuesto/{contrato_id}/graficos/grupos/{grupo_id}/imagenes/{imagen_id}"
    )
    def reemplazar_imagen_grupo(
        contrato_id: int,
        grupo_id: str,
        imagen_id: int,
        body: ReemplazarImagenBody,
        current_user=Depends(get_current_user),
    ):
        """Reemplaza URL de una imagen sin tocar la membresía de registros."""
        require_contract_access(current_user, contrato_id)
        _assert_grupo_del_contrato(supabase, contrato_id, grupo_id)
        url = (body.url or "").strip()
        if not url:
            raise HTTPException(status_code=422, detail="URL de imagen requerida")
        # Pie obligatorio en el flujo de carga/reemplazo.
        pie_foto = _require_pie_foto(body.pie_foto)
        existing = (
            supabase.table("presupuesto_grafico_imagenes")
            .select("id")
            .eq("id", imagen_id)
            .eq("grupo_id", grupo_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Imagen no encontrada en el grupo")
        patch = {
            "url": url,
            "blob_path": (body.blob_path or "").strip() or None,
            "origen": (body.origen or "upload").strip() or "upload",
        }
        if body.descripcion is not None:
            patch["descripcion"] = (body.descripcion or "").strip() or None
        supabase.table("presupuesto_grafico_imagenes").update(patch).eq(
            "id", imagen_id
        ).eq("grupo_id", grupo_id).execute()
        supabase.table("presupuesto_grafico_grupos").update({"pie_foto": pie_foto}).eq(
            "id", grupo_id
        ).eq("contrato_id", contrato_id).execute()
        return {"ok": True, "imagen_id": imagen_id, "url": url, "pie_foto": pie_foto}

    @router.patch("/presupuesto/{contrato_id}/graficos/grupos/{grupo_id}")
    def actualizar_grupo_graficos(
        contrato_id: int,
        grupo_id: str,
        body: ActualizarGrupoGraficosBody,
        current_user=Depends(get_current_user),
    ):
        """Actualiza pie de foto (y título opcional) del grupo."""
        require_contract_access(current_user, contrato_id)
        _assert_grupo_del_contrato(supabase, contrato_id, grupo_id)
        pie_foto = _require_pie_foto(body.pie_foto)
        patch: Dict[str, Any] = {"pie_foto": pie_foto}
        if body.titulo is not None:
            patch["titulo"] = (body.titulo or "").strip() or None
        supabase.table("presupuesto_grafico_grupos").update(patch).eq(
            "id", grupo_id
        ).eq("contrato_id", contrato_id).execute()
        return {"ok": True, "grupo_id": grupo_id, "pie_foto": pie_foto}

    @router.post("/presupuesto/{contrato_id}/graficos/redaccion-clara")
    async def redaccion_clara_pie_foto(
        contrato_id: int,
        body: RedaccionClaraPieBody,
        current_user=Depends(get_current_user),
    ):
        """Mejora la redacción del pie de foto con Clara (sin inventar datos)."""
        require_contract_access(current_user, contrato_id)
        texto = _norm_pie_foto(body.texto)
        if not texto:
            raise HTTPException(
                status_code=422,
                detail="Escriba un pie de foto antes de pedir a Clara",
            )
        uid = current_user.get("id") if isinstance(current_user, dict) else None
        if not uid:
            raise HTTPException(status_code=401, detail="Usuario no autenticado")
        try:
            from seguimiento_service import redaccion_asistida_clara

            return await redaccion_asistida_clara(
                supabase,
                str(uid),
                texto,
                body.instruccion or "",
                body.historial,
                modo="pie_foto",
            )
        except HTTPException:
            raise
        except Exception as exc:
            _log.exception("redaccion-clara pie_foto: %s", exc)
            raise HTTPException(
                status_code=502,
                detail="Clara no está disponible en este momento.",
            ) from exc

    @router.get("/presupuesto/{contrato_id}/graficos/buscar-registros")
    def buscar_registros_para_grupo(
        contrato_id: int,
        q: str = Query("", max_length=80),
        limit: int = Query(40, ge=1, le=100),
        current_user=Depends(get_current_user),
    ):
        """Busca registros vivos por Id_Pol / PK / ítem / tramo para agregar a un grupo."""
        require_contract_access(current_user, contrato_id)
        term = (q or "").strip()
        query = (
            supabase.table("presupuesto")
            .select("id, capitulo, item, tramo, id_pol, abs_inicio, abs_final, pk_id")
            .eq("contrato_id", contrato_id)
            .eq("dado_de_baja", False)
            .limit(limit)
        )
        if term:
            safe = term.replace("%", "").replace(",", " ")
            pattern = f"%{safe}%"
            query = query.or_(
                f"id_pol.ilike.{pattern},pk_id.ilike.{pattern},"
                f"item.ilike.{pattern},tramo.ilike.{pattern},capitulo.ilike.{pattern}"
            )
        rows = query.execute().data or []
        return {"registros": _enrich_ppto_rows(supabase, contrato_id, rows)}

    @router.get("/presupuesto/{contrato_id}/graficos/por-items")
    def graficos_por_items(
        contrato_id: int,
        current_user=Depends(get_current_user),
    ):
        """Devuelve gráficos agrupados por (capitulo, item) para el contrato."""
        require_contract_access(current_user, contrato_id)
        return {"items": _graficos_por_item_mapa(supabase, contrato_id)}

    return router


def _graficos_por_item_mapa(supabase, contrato_id: int) -> Dict[str, List[Dict[str, Any]]]:
    """
    key = f"{capitulo}\\x1e{item}" → lista de { url, caption, grupo_id, orden }
    Caption = pie_foto manual del grupo (sin generación automática).
    """
    grupos = (
        supabase.table("presupuesto_grafico_grupos")
        .select("id, pie_foto")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    if not grupos:
        return {}
    pie_by_gid = {g["id"]: _norm_pie_foto(g.get("pie_foto")) for g in grupos}
    gids = [g["id"] for g in grupos]

    regs_j = (
        supabase.table("presupuesto_grafico_grupo_regs")
        .select("grupo_id, presupuesto_id")
        .in_("grupo_id", gids)
        .execute()
        .data
        or []
    )
    imgs = (
        supabase.table("presupuesto_grafico_imagenes")
        .select("id, grupo_id, url, orden, descripcion")
        .in_("grupo_id", gids)
        .order("orden")
        .execute()
        .data
        or []
    )
    if not regs_j or not imgs:
        return {}

    pids = sorted({int(r["presupuesto_id"]) for r in regs_j})
    by_id = _fetch_regs_info_by_ids(supabase, contrato_id, pids)

    regs_by_grupo: Dict[str, List[Dict[str, Any]]] = {}
    for j in regs_j:
        gid = j["grupo_id"]
        pid = int(j["presupuesto_id"])
        info = by_id.get(pid)
        if not info:
            continue
        regs_by_grupo.setdefault(gid, []).append(info)

    imgs_by_grupo: Dict[str, List[Dict[str, Any]]] = {}
    for im in imgs:
        imgs_by_grupo.setdefault(im["grupo_id"], []).append(im)

    out: Dict[str, List[Dict[str, Any]]] = {}
    for gid, regs in regs_by_grupo.items():
        caption = pie_by_gid.get(gid) or "—"
        regs_by_item: Dict[str, List[Dict[str, Any]]] = {}
        for r in regs:
            cap = (r.get("capitulo") or "").strip()
            it = (r.get("item") or "").strip()
            if not cap or not it:
                continue
            regs_by_item.setdefault(f"{cap}\x1e{it}", []).append(r)

        for im in imgs_by_grupo.get(gid, []):
            base = {
                "url": im["url"],
                "caption": caption,
                "grupo_id": gid,
                "orden": im.get("orden") or 0,
                "descripcion": im.get("descripcion"),
            }
            for key, item_regs in regs_by_item.items():
                # Tipos de entidad del grupo presentes en ESTE ítem (para ubicar
                # el gráfico tras cada subtabla Área/Longitud/Unidad correspondiente).
                tipos: List[str] = []
                seen_te: Set[str] = set()
                for r in item_regs:
                    te = (r.get("tipo_entidad") or "").strip()
                    if te and te not in seen_te:
                        seen_te.add(te)
                        tipos.append(te)
                out.setdefault(key, []).append({**base, "tipos_entidad": tipos})

    for key in out:
        out[key].sort(key=lambda x: (int(x.get("orden") or 0), str(x.get("url") or "")))
    return out


def attach_graficos_a_items_export(
    supabase,
    contrato_id: int,
    items_out: List[Dict[str, Any]],
) -> None:
    """Adjunta lista `graficos` a cada ítem del payload de exportación."""
    try:
        mapa = _graficos_por_item_mapa(supabase, contrato_id)
    except Exception as exc:
        _log.warning("attach graficos export: %s", exc)
        return
    if not mapa:
        return
    for it in items_out:
        key = f"{(it.get('capitulo') or '').strip()}\x1e{(it.get('item') or '').strip()}"
        grafs = mapa.get(key) or []
        if grafs:
            it["graficos"] = grafs
