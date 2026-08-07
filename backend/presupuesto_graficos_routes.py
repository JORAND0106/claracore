"""
Rutas HTTP — gráficos de memorias de Presupuesto.
Prefijo: /presupuesto/{contrato_id}/graficos
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from azure_blob_storage import path_presupuesto_grafico, upload_blob

_log = logging.getLogger("claracore.presupuesto.graficos")

router = APIRouter(tags=["presupuesto-graficos"])


def _abs_rango(abs_ini: Any, abs_fin: Any) -> str:
    a = (str(abs_ini).strip() if abs_ini is not None else "") or ""
    b = (str(abs_fin).strip() if abs_fin is not None else "") or ""
    if a and b:
        return f"{a}-{b}"
    return a or b


def build_caption_pie_foto(regs: List[Dict[str, Any]]) -> str:
    """Pie de foto: Tramo, Infraestructura, Abs, Id_Pol (valores distintos, coma)."""
    tramos: List[str] = []
    infras: List[str] = []
    abs_list: List[str] = []
    pols: List[str] = []
    seen_t, seen_i, seen_a, seen_p = set(), set(), set(), set()

    for r in regs or []:
        t = str(r.get("tramo") or "").strip()
        if t and t not in seen_t:
            seen_t.add(t)
            tramos.append(t)
        inf = str(r.get("infraestructura") or "").strip()
        if inf and inf not in seen_i:
            seen_i.add(inf)
            infras.append(inf)
        ar = _abs_rango(r.get("abs_inicio"), r.get("abs_final"))
        if ar and ar not in seen_a:
            seen_a.add(ar)
            abs_list.append(ar)
        pol = str(r.get("id_pol") or "").strip()
        if pol and pol not in seen_p:
            seen_p.add(pol)
            pols.append(pol)

    parts = []
    if tramos:
        parts.append(f"Tramo: {', '.join(tramos)}")
    if infras:
        parts.append(f"Infraestructura: {', '.join(infras)}")
    if abs_list:
        parts.append(f"Abs: {', '.join(abs_list)}")
    if pols:
        parts.append(f"Id_Pol: {', '.join(pols)}")
    return " · ".join(parts) if parts else "—"


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


def _ext_desde_content_type(content_type: Optional[str]) -> str:
    c = (content_type or "image/jpeg").split(";")[0].strip().lower()
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(c, ".jpg")


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
        ids = sorted({int(x) for x in (body.presupuesto_ids or []) if x is not None})
        if not ids:
            raise HTTPException(status_code=422, detail="Seleccione al menos un registro")
        imgs = body.imagenes or []
        if not imgs:
            raise HTTPException(status_code=422, detail="Cargue al menos una imagen")

        # Validar que los IDs pertenecen al contrato
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

        uid = current_user.get("id") if isinstance(current_user, dict) else None
        g_ins = (
            supabase.table("presupuesto_grafico_grupos")
            .insert(
                {
                    "contrato_id": contrato_id,
                    "titulo": (body.titulo or "").strip() or None,
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
    Caption usa TODOS los registros del grupo.
    """
    grupos = (
        supabase.table("presupuesto_grafico_grupos")
        .select("id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    if not grupos:
        return {}
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
    ppto_rows = (
        supabase.table("presupuesto")
        .select("id, capitulo, item, tramo, id_pol, abs_inicio, abs_final, pk_id")
        .eq("contrato_id", contrato_id)
        .in_("id", pids)
        .execute()
        .data
        or []
    )
    # Infraestructura desde pk_ids si hace falta
    pk_codes = list({str(r.get("pk_id") or "").strip() for r in ppto_rows if r.get("pk_id")})
    pk_infra: Dict[str, str] = {}
    if pk_codes:
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

    by_id: Dict[int, Dict[str, Any]] = {}
    for r in ppto_rows:
        rid = int(r["id"])
        pk = str(r.get("pk_id") or "").strip()
        by_id[rid] = {
            "id": rid,
            "capitulo": (r.get("capitulo") or "").strip(),
            "item": (r.get("item") or "").strip(),
            "tramo": (r.get("tramo") or "").strip(),
            "id_pol": r.get("id_pol") or "",
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
            "infraestructura": pk_infra.get(pk, ""),
        }

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
        caption = build_caption_pie_foto(regs)
        items_keys = {
            f"{(r.get('capitulo') or '').strip()}\x1e{(r.get('item') or '').strip()}"
            for r in regs
            if (r.get("capitulo") or "").strip() and (r.get("item") or "").strip()
        }
        for im in imgs_by_grupo.get(gid, []):
            entry = {
                "url": im["url"],
                "caption": caption,
                "grupo_id": gid,
                "orden": im.get("orden") or 0,
                "descripcion": im.get("descripcion"),
            }
            for key in items_keys:
                out.setdefault(key, []).append(entry)

    # Orden estable por orden dentro de cada ítem
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
