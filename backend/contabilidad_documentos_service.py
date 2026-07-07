"""
Gestión documental corporativa — módulo Contabilidad ClaraCore.

Metadatos en Supabase; binarios en contenedor Azure privado (claracore-privado).
Acceso: cargo Contador y Desarrollador (validado en contabilidad_routes).
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_contabilidad_documento_empresa,
    upload_blob_private,
)

_log = logging.getLogger("claracore.contabilidad.documentos")

DOC_CATEGORIAS = frozenset({"legal", "tributario", "corporativo", "laboral", "otros"})
DOC_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_DOC_BYTES = 20 * 1024 * 1024

_TABLE = "contabilidad_documento_empresa"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_mime(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _parse_date_optional(value: Any) -> Optional[date]:
    if value is None:
        return None
    s = str(value).strip()[:10]
    if not s:
        return None
    return date.fromisoformat(s)


def _validate_categoria(categoria: str) -> str:
    c = (categoria or "").strip().lower()
    if c not in DOC_CATEGORIAS:
        raise ValueError(
            f"Categoría inválida. Opciones: {', '.join(sorted(DOC_CATEGORIAS))}"
        )
    return c


def validate_documento_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > MAX_DOC_BYTES:
        raise ValueError(f"El archivo supera el máximo de {MAX_DOC_BYTES // (1024 * 1024)} MB.")
    mime = _normalize_mime(content_type)
    if mime not in DOC_MIMES:
        raise ValueError("Formato no permitido. Use PDF o imagen (JPEG, PNG, WebP).")
    return mime


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _row_visible(doc: Optional[dict]) -> bool:
    return bool(doc) and not (doc.get("eliminado_en") or "").strip()


def get_documento_empresa(sb, doc_id: int) -> dict:
    rows = (
        sb.table(_TABLE)
        .select("*")
        .eq("id", int(doc_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or not _row_visible(rows[0]):
        raise ValueError("Documento no encontrado.")
    return rows[0]


def list_documentos_empresa(
    sb,
    *,
    categoria: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> Dict[str, Any]:
    query = (
        sb.table(_TABLE)
        .select("*", count="exact")
        .is_("eliminado_en", "null")
        .order("created_at", desc=True)
    )
    if categoria:
        query = query.eq("categoria", _validate_categoria(categoria))
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.or_(f"nombre.ilike.{term},descripcion.ilike.{term},nombre_archivo.ilike.{term}")

    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    res = query.range(offset, offset + limit - 1).execute()
    items = res.data or []
    total = getattr(res, "count", None)
    if total is None:
        total = len(items)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def _doc_alerta_item(row: dict, hoy: date) -> dict:
    fv = _parse_date_optional(row.get("fecha_vencimiento"))
    if not fv:
        return {}
    dias = (fv - hoy).days
    return {
        "id": int(row["id"]),
        "nombre": row.get("nombre"),
        "categoria": row.get("categoria"),
        "fecha_vencimiento": fv.isoformat(),
        "dias_restantes": dias,
        "nombre_archivo": row.get("nombre_archivo"),
    }


def alertas_vencimiento_documentos(sb, *, dias_alerta: int = 30) -> dict:
    """Documentos vencidos o que vencen dentro de dias_alerta (solo con fecha_vencimiento)."""
    dias_alerta = max(1, min(int(dias_alerta), 365))
    hoy = date.today()
    limite = hoy + timedelta(days=dias_alerta)

    rows = (
        sb.table(_TABLE)
        .select("id, nombre, categoria, fecha_vencimiento, nombre_archivo")
        .is_("eliminado_en", "null")
        .not_.is_("fecha_vencimiento", "null")
        .order("fecha_vencimiento")
        .execute()
        .data
        or []
    )

    vencidos: List[dict] = []
    por_vencer: List[dict] = []
    for row in rows:
        fv = _parse_date_optional(row.get("fecha_vencimiento"))
        if not fv:
            continue
        item = _doc_alerta_item(row, hoy)
        if fv < hoy:
            vencidos.append(item)
        elif fv <= limite:
            por_vencer.append(item)

    vencidos.sort(key=lambda x: x.get("fecha_vencimiento") or "")
    por_vencer.sort(key=lambda x: x.get("fecha_vencimiento") or "")

    return {
        "dias_alerta": dias_alerta,
        "fecha_consulta": hoy.isoformat(),
        "total_vencidos": len(vencidos),
        "total_por_vencer": len(por_vencer),
        "total_alertas": len(vencidos) + len(por_vencer),
        "vencidos": vencidos,
        "por_vencer": por_vencer,
    }


def create_documento_empresa(
    sb,
    payload: dict,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: int,
) -> dict:
    categoria = _validate_categoria(payload.get("categoria") or "")
    nombre = (payload.get("nombre") or "").strip()
    if len(nombre) < 2:
        raise ValueError("El nombre del documento es obligatorio (mín. 2 caracteres).")
    descripcion = (payload.get("descripcion") or "").strip() or None
    fecha_documento = _parse_date_optional(payload.get("fecha_documento"))
    fecha_vencimiento = _parse_date_optional(payload.get("fecha_vencimiento"))
    if fecha_documento and fecha_vencimiento and fecha_vencimiento < fecha_documento:
        raise ValueError("La fecha de vencimiento no puede ser anterior a la fecha del documento.")

    mime = validate_documento_upload(content_type, len(data))
    file_name = (nombre_archivo or "documento").strip()[:255] or "documento"
    blob_path = path_contabilidad_documento_empresa(categoria, file_name)
    upload_blob_private(blob_path, data, mime, overwrite=True)

    row = {
        "categoria": categoria,
        "nombre": nombre[:200],
        "descripcion": descripcion,
        "fecha_documento": fecha_documento.isoformat() if fecha_documento else None,
        "fecha_vencimiento": fecha_vencimiento.isoformat() if fecha_vencimiento else None,
        "azure_blob_path": blob_path,
        "nombre_archivo": file_name,
        "mime_type": mime,
        "tamano_bytes": len(data),
        "hash_sha256": _sha256_hex(data),
        "created_by": user_id,
    }
    ins = sb.table(_TABLE).insert(row).execute()
    created = (ins.data or [None])[0]
    if not created:
        raise ValueError("No se pudo registrar el documento.")
    return created


def update_documento_empresa(sb, doc_id: int, patch: dict, user_id: int) -> dict:
    doc = get_documento_empresa(sb, doc_id)
    updates: Dict[str, Any] = {"updated_at": _now_iso(), "updated_by": user_id}

    if "categoria" in patch and patch["categoria"] is not None:
        updates["categoria"] = _validate_categoria(patch["categoria"])
    if "nombre" in patch and patch["nombre"] is not None:
        nombre = str(patch["nombre"]).strip()
        if len(nombre) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres.")
        updates["nombre"] = nombre[:200]
    if "descripcion" in patch:
        desc = patch["descripcion"]
        updates["descripcion"] = (str(desc).strip() if desc else None) or None
    if "fecha_documento" in patch:
        updates["fecha_documento"] = (
            _parse_date_optional(patch["fecha_documento"]).isoformat()
            if _parse_date_optional(patch["fecha_documento"])
            else None
        )
    if "fecha_vencimiento" in patch:
        updates["fecha_vencimiento"] = (
            _parse_date_optional(patch["fecha_vencimiento"]).isoformat()
            if _parse_date_optional(patch["fecha_vencimiento"])
            else None
        )

    fd = _parse_date_optional(updates.get("fecha_documento", doc.get("fecha_documento")))
    fv = _parse_date_optional(updates.get("fecha_vencimiento", doc.get("fecha_vencimiento")))
    if fd and fv and fv < fd:
        raise ValueError("La fecha de vencimiento no puede ser anterior a la fecha del documento.")

    if len(updates) <= 2:
        return doc

    sb.table(_TABLE).update(updates).eq("id", int(doc_id)).execute()
    return get_documento_empresa(sb, doc_id)


def replace_archivo_documento_empresa(
    sb,
    doc_id: int,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: int,
) -> dict:
    doc = get_documento_empresa(sb, doc_id)
    mime = validate_documento_upload(content_type, len(data))
    old_path = (doc.get("azure_blob_path") or "").strip()
    categoria = (doc.get("categoria") or "otros").strip().lower()
    file_name = (nombre_archivo or doc.get("nombre_archivo") or "documento").strip()[:255] or "documento"
    blob_path = path_contabilidad_documento_empresa(categoria, file_name)
    upload_blob_private(blob_path, data, mime, overwrite=True)

    sb.table(_TABLE).update({
        "azure_blob_path": blob_path,
        "nombre_archivo": file_name,
        "mime_type": mime,
        "tamano_bytes": len(data),
        "hash_sha256": _sha256_hex(data),
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(doc_id)).execute()

    if old_path and old_path != blob_path:
        try:
            delete_blob_private(old_path)
        except Exception as exc:
            _log.warning("No se pudo eliminar blob anterior %s: %s", old_path, exc)

    return get_documento_empresa(sb, doc_id)


def delete_documento_empresa(sb, doc_id: int, user_id: int) -> dict:
    doc = get_documento_empresa(sb, doc_id)
    sb.table(_TABLE).update({
        "eliminado_en": _now_iso(),
        "eliminado_por": user_id,
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(doc_id)).execute()
    return {**doc, "eliminado_en": _now_iso(), "eliminado_por": user_id}


def download_documento_empresa(sb, doc_id: int) -> Tuple[bytes, str, str]:
    doc = get_documento_empresa(sb, doc_id)
    path = (doc.get("azure_blob_path") or "").strip()
    if not path:
        raise ValueError("El documento no tiene archivo asociado.")
    data = download_blob_bytes_private(path)
    mime = (doc.get("mime_type") or "application/octet-stream").split(";")[0].strip()
    name = (doc.get("nombre_archivo") or doc.get("nombre") or "documento").strip()
    safe = re.sub(r'[^\w.\- ]', '_', name)[:200]
    return data, mime, safe
