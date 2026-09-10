"""
Documentos versionados RRHH (soporte e ingreso) + contratos laborales generados.
Patrón análogo a documentos de Subcontratistas, sin acoplar ese módulo.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_rrhh_contrato_laboral,
    path_rrhh_trabajador_documento,
    upload_blob_private,
)
from rrhh_service import get_trabajador, trabajador_display_nombre

_log = logging.getLogger("claracore.rrhh.docs")

_TABLE_DOCS = "rrhh_trabajador_documentos"
_TABLE_CONTRATOS = "rrhh_contratos_generados"

DOC_CATEGORIAS = frozenset({"soporte", "ingreso"})

DOC_TIPOS_SOPORTE = (
    ("cedula", "Cédula / Documento de identidad"),
    ("hoja_vida", "Hoja de vida"),
    ("certificados", "Certificados"),
    ("otro", "Otro"),
)

DOC_TIPOS_INGRESO = (
    ("induccion", "Constancia de inducción"),
    ("reglamento", "Entrega de reglamentos"),
    ("examen_medico", "Examen médico de ingreso"),
    ("otro", "Otro"),
)

DOC_TIPO_LABEL = {
    **{k: v for k, v in DOC_TIPOS_SOPORTE},
    **{k: v for k, v in DOC_TIPOS_INGRESO},
}

DOC_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_DOC_BYTES = 20 * 1024 * 1024


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        return None


def _normalize_mime(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > MAX_DOC_BYTES:
        raise ValueError(f"El archivo supera el máximo de {MAX_DOC_BYTES // (1024 * 1024)} MB.")
    mime = _normalize_mime(content_type)
    if mime not in DOC_MIMES:
        raise ValueError("Formato no permitido. Use PDF o imagen (JPEG, PNG, WebP).")
    return mime


def _tipos_permitidos(categoria: str) -> frozenset:
    if categoria == "soporte":
        return frozenset(k for k, _ in DOC_TIPOS_SOPORTE)
    if categoria == "ingreso":
        return frozenset(k for k, _ in DOC_TIPOS_INGRESO)
    raise ValueError("Categoría de documento inválida.")


def _validate_tipo(categoria: str, tipo: str, tipo_otro_texto: Optional[str]) -> tuple[str, Optional[str]]:
    cat = (categoria or "").strip().lower()
    if cat not in DOC_CATEGORIAS:
        raise ValueError("Categoría inválida. Use «soporte» o «ingreso».")
    t = (tipo or "").strip().lower()
    if t not in _tipos_permitidos(cat):
        raise ValueError(f"Tipo de documento inválido para {cat}.")
    otro = (tipo_otro_texto or "").strip() or None
    if t == "otro":
        if not otro:
            raise ValueError("Indique el nombre del documento cuando elige «Otro».")
        return t, otro[:200]
    return t, None


def list_documentos(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    categoria: Optional[str] = None,
) -> List[dict]:
    get_trabajador(sb, contrato_id, trabajador_id)
    q = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("created_at", desc=True)
    )
    if categoria:
        cat = categoria.strip().lower()
        if cat not in DOC_CATEGORIAS:
            raise ValueError("Categoría inválida.")
        q = q.eq("categoria", cat)
    return q.execute().data or []


def create_documento(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    categoria: str,
    tipo: str,
    archivo_bytes: bytes,
    nombre_archivo: str,
    content_type: Optional[str],
    current_user,
    version_label: Optional[str] = None,
    tipo_otro_texto: Optional[str] = None,
    notas: Optional[str] = None,
    marcar_vigente: bool = True,
) -> dict:
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    cat = (categoria or "").strip().lower()
    t, otro = _validate_tipo(cat, tipo, tipo_otro_texto)
    mime = validate_upload(content_type, len(archivo_bytes))
    safe_name = (nombre_archivo or f"{t}.pdf").strip()[:255] or f"{t}.pdf"
    blob_path = path_rrhh_trabajador_documento(
        int(contrato_id),
        int(trabajador_id),
        cat,
        t,
        safe_name,
    )
    upload_blob_private(blob_path, archivo_bytes, content_type=mime)
    label = (version_label or "").strip() or ("Original" if marcar_vigente else "Histórico")

    if marcar_vigente:
        prev = (
            sb.table(_TABLE_DOCS)
            .select("id")
            .eq("trabajador_id", int(trabajador_id))
            .eq("categoria", cat)
            .eq("tipo", t)
            .eq("vigente", True)
            .is_("eliminado_en", "null")
            .execute()
            .data
            or []
        )
        for p in prev:
            sb.table(_TABLE_DOCS).update({"vigente": False}).eq("id", p["id"]).execute()

    payload = {
        "trabajador_id": int(trabajador_id),
        "contrato_id": int(contrato_id),
        "categoria": cat,
        "tipo": t,
        "tipo_otro_texto": otro,
        "version_label": label[:80],
        "vigente": bool(marcar_vigente),
        "azure_blob_path": blob_path,
        "nombre_archivo": safe_name,
        "mime_type": mime,
        "tamano_bytes": len(archivo_bytes),
        "hash_sha256": _sha256_hex(archivo_bytes),
        "notas": (notas or "").strip()[:1000] or None,
        "created_by": _uid(current_user),
    }
    rows = sb.table(_TABLE_DOCS).insert(payload).execute().data or []
    if not rows:
        try:
            delete_blob_private(blob_path)
        except Exception:
            pass
        raise ValueError("No se pudo registrar el documento.")
    _log.info(
        "rrhh doc creado trab=%s cat=%s tipo=%s id=%s contrato=%s",
        trabajador_id,
        cat,
        t,
        rows[0].get("id"),
        contrato_id,
    )
    # Enrich with trabajador nombre for logs/UI if needed
    rows[0]["_trabajador_nombre"] = trabajador_display_nombre(trab)
    return rows[0]


def marcar_documento_vigente(sb, contrato_id: int, trabajador_id: int, doc_id: int, current_user) -> dict:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    doc = rows[0]
    prev = (
        sb.table(_TABLE_DOCS)
        .select("id")
        .eq("trabajador_id", int(trabajador_id))
        .eq("categoria", doc["categoria"])
        .eq("tipo", doc["tipo"])
        .eq("vigente", True)
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for p in prev:
        if int(p["id"]) != int(doc_id):
            sb.table(_TABLE_DOCS).update({"vigente": False}).eq("id", p["id"]).execute()
    updated = (
        sb.table(_TABLE_DOCS)
        .update({"vigente": True})
        .eq("id", int(doc_id))
        .execute()
        .data
        or []
    )
    if not updated:
        raise ValueError("No se pudo marcar el documento como vigente.")
    return updated[0]


def soft_delete_documento(sb, contrato_id: int, trabajador_id: int, doc_id: int, current_user) -> dict:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    updated = (
        sb.table(_TABLE_DOCS)
        .update(
            {
                "eliminado_en": _now_iso(),
                "eliminado_por": _uid(current_user),
                "vigente": False,
            }
        )
        .eq("id", int(doc_id))
        .execute()
        .data
        or []
    )
    if not updated:
        raise ValueError("No se pudo eliminar el documento.")
    return updated[0]


def download_documento(sb, contrato_id: int, trabajador_id: int, doc_id: int) -> tuple[bytes, dict]:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    doc = rows[0]
    data = download_blob_bytes_private(doc["azure_blob_path"])
    return data, doc


def list_contratos_generados(sb, contrato_id: int, trabajador_id: int) -> List[dict]:
    get_trabajador(sb, contrato_id, trabajador_id)
    return (
        sb.table(_TABLE_CONTRATOS)
        .select("*")
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("version_num", desc=True)
        .execute()
        .data
        or []
    )


def generar_contrato_laboral(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    current_user,
    tipo_contrato: Optional[str] = None,
    tipo_contrato_id: Optional[int] = None,  # legacy ignored
    numero_contrato_laboral: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> dict:
    from rrhh_contrato_pdf import generar_pdf_contrato_laboral
    from rrhh_service import add_catalogo_opcion

    trab = get_trabajador(sb, contrato_id, trabajador_id)
    tipo_nombre = (tipo_contrato or trab.get("tipo_contrato") or "").strip()
    if not tipo_nombre:
        raise ValueError("Seleccione un tipo de contrato laboral.")

    if (trab.get("tipo_contrato") or "").strip() != tipo_nombre:
        sb.table("rrhh_trabajadores").update(
            {
                "tipo_contrato": tipo_nombre,
                "updated_at": _now_iso(),
                "updated_by": _uid(current_user),
            }
        ).eq("id", int(trabajador_id)).execute()
        trab["tipo_contrato"] = tipo_nombre

    try:
        add_catalogo_opcion(sb, contrato_id, "tipo_contrato", tipo_nombre, current_user)
    except Exception:
        pass

    tipo = {"nombre": tipo_nombre}

    crows = (
        sb.table("contratos")
        .select("id, numero, contratista, nit, objeto")
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    contrato_obra = crows[0] if crows else {}

    pdf_bytes = generar_pdf_contrato_laboral(
        trabajador=trab,
        tipo_contrato=tipo,
        contrato_obra=contrato_obra,
        numero_contrato_laboral=numero_contrato_laboral,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )

    prev = (
        sb.table(_TABLE_CONTRATOS)
        .select("id, version_num")
        .eq("trabajador_id", int(trabajador_id))
        .is_("eliminado_en", "null")
        .order("version_num", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    next_ver = int(prev[0]["version_num"]) + 1 if prev else 1

    # Desmarcar vigentes anteriores
    vigentes = (
        sb.table(_TABLE_CONTRATOS)
        .select("id")
        .eq("trabajador_id", int(trabajador_id))
        .eq("vigente", True)
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for v in vigentes:
        sb.table(_TABLE_CONTRATOS).update({"vigente": False}).eq("id", v["id"]).execute()

    nombre = f"contrato_laboral_v{next_ver}.pdf"
    blob_path = path_rrhh_contrato_laboral(int(contrato_id), int(trabajador_id), next_ver, nombre)
    upload_blob_private(blob_path, pdf_bytes, content_type="application/pdf")

    payload = {
        "trabajador_id": int(trabajador_id),
        "contrato_id": int(contrato_id),
        "tipo_contrato_nombre": tipo_nombre,
        "numero_contrato_laboral": (numero_contrato_laboral or "").strip()[:80] or None,
        "fecha_inicio": (fecha_inicio or "").strip()[:10] or None,
        "fecha_fin": (fecha_fin or "").strip()[:10] or None,
        "version_num": next_ver,
        "vigente": True,
        "azure_blob_path": blob_path,
        "nombre_archivo": nombre,
        "mime_type": "application/pdf",
        "tamano_bytes": len(pdf_bytes),
        "estado": "generado",
        "created_by": _uid(current_user),
    }
    rows = sb.table(_TABLE_CONTRATOS).insert(payload).execute().data or []
    if not rows:
        try:
            delete_blob_private(blob_path)
        except Exception:
            pass
        raise ValueError("No se pudo registrar el contrato generado.")
    return rows[0]


def download_contrato_generado(
    sb, contrato_id: int, trabajador_id: int, gen_id: int
) -> tuple[bytes, dict]:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_CONTRATOS)
        .select("*")
        .eq("id", int(gen_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Contrato laboral no encontrado.")
    doc = rows[0]
    data = download_blob_bytes_private(doc["azure_blob_path"])
    return data, doc


def soft_delete_contrato_generado(
    sb, contrato_id: int, trabajador_id: int, gen_id: int, current_user
) -> dict:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_CONTRATOS)
        .select("*")
        .eq("id", int(gen_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Contrato laboral no encontrado.")
    updated = (
        sb.table(_TABLE_CONTRATOS)
        .update(
            {
                "eliminado_en": _now_iso(),
                "eliminado_por": _uid(current_user),
                "vigente": False,
                "estado": "anulado",
            }
        )
        .eq("id", int(gen_id))
        .execute()
        .data
        or []
    )
    if not updated:
        raise ValueError("No se pudo eliminar el contrato generado.")
    return updated[0]


def catalogo_tipos_documento() -> dict:
    return {
        "soporte": [{"tipo": k, "label": v} for k, v in DOC_TIPOS_SOPORTE],
        "ingreso": [{"tipo": k, "label": v} for k, v in DOC_TIPOS_INGRESO],
    }
