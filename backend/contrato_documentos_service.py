"""
Gestión documental contractual de licenciamiento ClaraCore.

Metadatos en Supabase; binarios en contenedor Azure privado (claracore-privado).
Acceso API: solo cargo Desarrollador (validado en contrato_documentos_routes).
"""

from __future__ import annotations

import io
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    download_blob_bytes_private,
    path_contrato_doc_firmado,
    path_contrato_doc_generado,
    upload_blob_private,
)

_log = logging.getLogger("claracore.contrato_documentos")

DOC_ESTADOS = frozenset({"borrador", "generado", "enviado", "firmado"})
DOC_TIPOS = frozenset({"generado", "firmado"})
MAX_FIRMADO_BYTES = 20 * 1024 * 1024
MIME_PDF = "application/pdf"
MIME_JPEG = "image/jpeg"
MIME_PNG = "image/png"
MIME_WEBP = "image/webp"
FIRMADO_MIMES = frozenset({MIME_PDF, MIME_JPEG, MIME_PNG, MIME_WEBP})

LICENCIATARIO_FIELDS = (
    "razon_social",
    "nit",
    "representante_nombre",
    "representante_cedula",
    "direccion",
    "email_notificaciones",
    "identificacion_obra",
    "valor_mensual",
    "valor_mensual_digitado",
    "valor_mensual_iva_incluido",
)


def empresa_footer_config() -> dict:
    """Datos de pie de página del PDF (variables de entorno)."""
    nit = (os.getenv("CLARACORE_EMPRESA_NIT") or "").strip()
    return {
        "razon_social": (os.getenv("CLARACORE_EMPRESA_RAZON_SOCIAL") or "CLARACORE SOLUTIONS S.A.S.").strip(),
        "nit": nit or None,
        "email": (os.getenv("CLARACORE_EMPRESA_EMAIL") or "ajaimes@claracore.co").strip(),
        "ciudad": (os.getenv("CLARACORE_EMPRESA_CIUDAD") or "Bogotá D.C.").strip(),
    }


def logo_claracore_path() -> str:
    """Ruta absoluta del logo para PDFs (asset en backend/assets/)."""
    base = os.path.dirname(os.path.abspath(__file__))
    for name in ("CLARA.CORE.png", "claracore-logo.png", "logo-claracore.png"):
        p = os.path.join(base, "assets", name)
        if os.path.isfile(p):
            return p
    return os.path.join(base, "assets", "CLARA.CORE.png")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_mime(content_type: Optional[str]) -> str:
    return (content_type or "").split(";")[0].strip().lower()


def _contrato_exists(sb, contrato_id: int) -> bool:
    rows = (
        sb.table("contratos")
        .select("id")
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def assert_contrato_exists(sb, contrato_id: int) -> None:
    if not _contrato_exists(sb, contrato_id):
        raise ValueError(f"Contrato {contrato_id} no encontrado")


def get_doc_estado_row(sb, contrato_id: int) -> dict:
    rows = (
        sb.table("contratos")
        .select("id, numero, contratista, nit, iva, doc_contractual_estado, doc_contractual_updated_at")
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ValueError(f"Contrato {contrato_id} no encontrado")
    return rows[0]


def iva_tasa_licencia_contrato(contrato_row: Optional[dict]) -> float:
    """
    Tasa de IVA para licenciamiento: contratos.iva (fracción 0.19) si existe;
    si no, CLARACORE_LICENCIA_IVA_PORCENTAJE; default 0.19.
    """
    if contrato_row:
        raw = contrato_row.get("iva")
        if raw is not None and raw != "":
            try:
                t = float(raw)
                if t >= 0:
                    return t
            except (TypeError, ValueError):
                pass
    env = (os.getenv("CLARACORE_LICENCIA_IVA_PORCENTAJE") or "").strip()
    if env:
        try:
            t = float(env)
            if t >= 0:
                return t
        except ValueError:
            pass
    return 0.19


def calcular_valor_mensual_neto(
    digitado: Optional[float],
    *,
    iva_incluido: bool,
    tasa_iva: float,
) -> Optional[int]:
    """Valor antes de IVA en pesos enteros (redondeo matemático estándar)."""
    if digitado is None or digitado == "":
        return None
    try:
        v = float(digitado)
    except (TypeError, ValueError) as exc:
        raise ValueError("valor_mensual_digitado debe ser numérico") from exc
    if v < 0:
        raise ValueError("valor_mensual no puede ser negativo")
    if iva_incluido:
        if tasa_iva < 0:
            raise ValueError("Tasa de IVA inválida")
        divisor = 1.0 + float(tasa_iva)
        if divisor <= 0:
            raise ValueError("Tasa de IVA inválida")
        return int(round(v / divisor))
    return int(round(v))


def get_licenciatario(sb, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("contrato_licencia_licenciatario")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def licenciatario_desde_contrato(sb, contrato_id: int) -> dict:
    """Prefill desde contratos.contratista, nit y numero (identificación obra)."""
    row = get_doc_estado_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id) or {}
    numero = (row.get("numero") or "").strip()
    tasa_iva = iva_tasa_licencia_contrato(row)
    return {
        "contrato_id": int(contrato_id),
        "razon_social": lic.get("razon_social") or row.get("contratista") or "",
        "nit": lic.get("nit") or row.get("nit") or "",
        "representante_nombre": lic.get("representante_nombre") or "",
        "representante_cedula": lic.get("representante_cedula") or "",
        "direccion": lic.get("direccion") or "",
        "email_notificaciones": lic.get("email_notificaciones") or "",
        "identificacion_obra": lic.get("identificacion_obra") or numero,
        "valor_mensual": lic.get("valor_mensual"),
        "valor_mensual_digitado": lic.get("valor_mensual_digitado"),
        "valor_mensual_iva_incluido": bool(lic.get("valor_mensual_iva_incluido")),
        "iva_tasa": tasa_iva,
        "iva_porcentaje_etiqueta": _iva_etiqueta_porcentaje(tasa_iva),
    }


def _iva_etiqueta_porcentaje(tasa: float) -> str:
    pct = float(tasa) * 100.0
    if abs(pct - round(pct)) < 0.0001:
        return f"{int(round(pct))}%"
    s = f"{pct:.4f}".rstrip("0").rstrip(".")
    return f"{s}%"


def _validate_licenciatario_payload(data: dict, *, tasa_iva: float) -> dict:
    iva_incluido = bool(data.get("valor_mensual_iva_incluido"))

    digitado_raw = data.get("valor_mensual_digitado")
    if digitado_raw is None or digitado_raw == "":
        digitado_raw = data.get("valor_mensual")

    digitado_f: Optional[float] = None
    if digitado_raw is not None and digitado_raw != "":
        try:
            digitado_f = float(digitado_raw)
        except (TypeError, ValueError) as exc:
            raise ValueError("valor_mensual debe ser numérico") from exc

    neto = calcular_valor_mensual_neto(
        digitado_f, iva_incluido=iva_incluido, tasa_iva=tasa_iva
    )

    out: Dict[str, Any] = {}
    for f in LICENCIATARIO_FIELDS:
        if f in ("valor_mensual", "valor_mensual_digitado", "valor_mensual_iva_incluido"):
            continue
        v = data.get(f)
        out[f] = (str(v).strip() if v is not None else "") or None

    out["valor_mensual"] = float(neto) if neto is not None else None
    out["valor_mensual_digitado"] = float(digitado_f) if digitado_f is not None else None
    out["valor_mensual_iva_incluido"] = iva_incluido

    email = out.get("email_notificaciones") or ""
    if email and "@" not in email:
        raise ValueError("email_notificaciones no es válido")
    if not (out.get("razon_social") or "").strip():
        raise ValueError("razon_social es obligatoria")
    return out


def upsert_licenciatario(sb, contrato_id: int, data: dict, user_id: int) -> dict:
    assert_contrato_exists(sb, contrato_id)
    row = get_doc_estado_row(sb, contrato_id)
    tasa_iva = iva_tasa_licencia_contrato(row)
    norm = _validate_licenciatario_payload(data, tasa_iva=tasa_iva)
    payload = {
        **norm,
        "contrato_id": int(contrato_id),
        "updated_at": _now_iso(),
        "updated_by": int(user_id),
    }
    existing = get_licenciatario(sb, contrato_id)
    if existing:
        sb.table("contrato_licencia_licenciatario").update(payload).eq(
            "contrato_id", int(contrato_id)
        ).execute()
    else:
        sb.table("contrato_licencia_licenciatario").insert(payload).execute()
    return get_licenciatario(sb, contrato_id) or payload


def validate_doc_estado(estado: str) -> str:
    e = (estado or "").strip().lower()
    if e not in DOC_ESTADOS:
        raise ValueError(f"Estado inválido: {estado}. Valores: {', '.join(sorted(DOC_ESTADOS))}")
    return e


def update_doc_estado(sb, contrato_id: int, estado: str) -> dict:
    assert_contrato_exists(sb, contrato_id)
    e = validate_doc_estado(estado)
    now = _now_iso()
    sb.table("contratos").update(
        {"doc_contractual_estado": e, "doc_contractual_updated_at": now}
    ).eq("id", int(contrato_id)).execute()
    return get_doc_estado_row(sb, contrato_id)


def touch_doc_contractual_updated_at(sb, contrato_id: int) -> None:
    sb.table("contratos").update({"doc_contractual_updated_at": _now_iso()}).eq(
        "id", int(contrato_id)
    ).execute()


def next_version_num(sb, contrato_id: int, tipo: str) -> int:
    t = (tipo or "").strip().lower()
    if t not in DOC_TIPOS:
        raise ValueError(f"tipo inválido: {tipo}")
    max_v = max_version_num(sb, contrato_id, t)
    return max_v + 1 if max_v else 1


def max_version_num(sb, contrato_id: int, tipo: str) -> int:
    """Mayor version_num existente para contrato+tipo (0 si no hay registros)."""
    t = (tipo or "").strip().lower()
    if t not in DOC_TIPOS:
        raise ValueError(f"tipo inválido: {tipo}")
    rows = (
        sb.table("contrato_documento_contractual")
        .select("version_num")
        .eq("contrato_id", int(contrato_id))
        .eq("tipo", t)
        .order("version_num", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return 0
    return int(rows[0].get("version_num") or 0)


def list_documentos(sb, contrato_id: int, tipo: Optional[str] = None) -> List[dict]:
    q = (
        sb.table("contrato_documento_contractual")
        .select(
            "id, contrato_id, tipo, version_num, azure_blob_path, nombre_archivo, "
            "mime_type, tamano_bytes, datos_licenciatario_snapshot, created_at, created_by"
        )
        .eq("contrato_id", int(contrato_id))
        .order("created_at", desc=True)
    )
    if tipo:
        q = q.eq("tipo", (tipo or "").strip().lower())
    return q.execute().data or []


def get_documento(sb, doc_id: int, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("contrato_documento_contractual")
        .select("*")
        .eq("id", int(doc_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def ultimo_documento(sb, contrato_id: int, tipo: str) -> Optional[dict]:
    rows = list_documentos(sb, contrato_id, tipo=tipo)
    return rows[0] if rows else None


def insert_documento_record(
    sb,
    *,
    contrato_id: int,
    tipo: str,
    version_num: int,
    azure_blob_path: str,
    nombre_archivo: Optional[str],
    mime_type: str,
    tamano_bytes: int,
    created_by: int,
    datos_licenciatario_snapshot: Optional[dict] = None,
) -> dict:
    t = (tipo or "").strip().lower()
    if t not in DOC_TIPOS:
        raise ValueError(f"tipo inválido: {tipo}")
    row = {
        "contrato_id": int(contrato_id),
        "tipo": t,
        "version_num": int(version_num),
        "azure_blob_path": azure_blob_path,
        "nombre_archivo": nombre_archivo,
        "mime_type": mime_type,
        "tamano_bytes": int(tamano_bytes),
        "created_by": int(created_by),
        "datos_licenciatario_snapshot": datos_licenciatario_snapshot,
    }
    res = sb.table("contrato_documento_contractual").insert(row).execute()
    data = (res.data or [None])[0]
    if not data:
        raise RuntimeError("No se pudo registrar el documento contractual")
    touch_doc_contractual_updated_at(sb, contrato_id)
    return data


def download_documento_bytes(doc_row: dict) -> Tuple[bytes, str, str]:
    path = (doc_row.get("azure_blob_path") or "").strip()
    if not path:
        raise ValueError("Documento sin ruta de almacenamiento")
    data = download_blob_bytes_private(path)
    mime = (doc_row.get("mime_type") or MIME_PDF).split(";")[0].strip()
    name = (doc_row.get("nombre_archivo") or f"documento_{doc_row.get('id')}.pdf").strip()
    return data, mime, name


def validate_firmado_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("El archivo está vacío")
    if size > MAX_FIRMADO_BYTES:
        raise ValueError(f"El archivo supera el máximo de {MAX_FIRMADO_BYTES // (1024 * 1024)} MB")
    mime = _normalize_mime(content_type)
    if mime not in FIRMADO_MIMES:
        raise ValueError("Tipo no permitido. Use PDF, JPEG, PNG o WebP.")
    return mime


def imagen_a_pdf(data: bytes, mime: str) -> bytes:
    """Convierte JPEG/PNG/WebP a PDF de una página (uniformidad del repositorio)."""
    from PIL import Image

    m = _normalize_mime(mime)
    if m not in {MIME_JPEG, MIME_PNG, MIME_WEBP}:
        raise ValueError("Solo se convierten imágenes JPEG, PNG o WebP")
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        alpha = img.split()[-1] if img.mode in ("RGBA", "LA") else None
        rgb = img.convert("RGB")
        if alpha is not None:
            bg.paste(rgb, mask=alpha)
        else:
            bg.paste(rgb)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="PDF", resolution=150.0)
    pdf = out.getvalue()
    if not pdf:
        raise ValueError("No se pudo convertir la imagen a PDF")
    return pdf


def normalizar_firmado_bytes(data: bytes, content_type: Optional[str]) -> Tuple[bytes, str, str]:
    """
    Devuelve (bytes, mime, ext_sugerida).
    PDF se conserva; imágenes se convierten a PDF.
    """
    mime = validate_firmado_upload(content_type, len(data))
    if mime == MIME_PDF:
        return data, MIME_PDF, ".pdf"
    pdf_bytes = imagen_a_pdf(data, mime)
    base = "documento_firmado"
    return pdf_bytes, MIME_PDF, f"{base}.pdf"


def registrar_firmado(
    sb,
    *,
    contrato_id: int,
    data: bytes,
    content_type: Optional[str],
    nombre_original: Optional[str],
    user_id: int,
) -> dict:
    pdf_bytes, mime, _ = normalizar_firmado_bytes(data, content_type)
    version = next_version_num(sb, contrato_id, "firmado")
    blob_path = path_contrato_doc_firmado(contrato_id, version)
    upload_blob_private(blob_path, pdf_bytes, mime, overwrite=False)
    nom = (nombre_original or "documento_firmado").strip()
    if not nom.lower().endswith(".pdf"):
        nom = re.sub(r"\.(jpe?g|png|webp)$", "", nom, flags=re.I) + ".pdf"
    return insert_documento_record(
        sb,
        contrato_id=contrato_id,
        tipo="firmado",
        version_num=version,
        azure_blob_path=blob_path,
        nombre_archivo=nom,
        mime_type=mime,
        tamano_bytes=len(pdf_bytes),
        created_by=user_id,
    )


def registrar_generado(
    sb,
    *,
    contrato_id: int,
    pdf_bytes: bytes,
    licenciatario_snapshot: dict,
    user_id: int,
) -> dict:
    if not pdf_bytes:
        raise ValueError("PDF vacío")
    version = next_version_num(sb, contrato_id, "generado")
    blob_path = path_contrato_doc_generado(contrato_id, version)
    upload_blob_private(blob_path, pdf_bytes, MIME_PDF, overwrite=False)
    nom = f"contrato_licencia_v{version:03d}.pdf"
    return insert_documento_record(
        sb,
        contrato_id=contrato_id,
        tipo="generado",
        version_num=version,
        azure_blob_path=blob_path,
        nombre_archivo=nom,
        mime_type=MIME_PDF,
        tamano_bytes=len(pdf_bytes),
        created_by=user_id,
        datos_licenciatario_snapshot=licenciatario_snapshot,
    )


def matriz_resumen(sb) -> List[dict]:
    """Todos los contratos con estado documental, último movimiento y flag de firmado."""
    contratos = (
        sb.table("contratos")
        .select(
            "id, numero, contratista, doc_contractual_estado, doc_contractual_updated_at"
        )
        .order("numero")
        .execute()
        .data
        or []
    )
    if not contratos:
        return []

    ids = [int(c["id"]) for c in contratos if c.get("id") is not None]
    docs = (
        sb.table("contrato_documento_contractual")
        .select("contrato_id, tipo, created_at")
        .in_("contrato_id", ids)
        .execute()
        .data
        or []
    )

    ultimo_por_contrato: Dict[int, str] = {}
    tiene_firmado: Dict[int, bool] = {i: False for i in ids}

    for d in docs:
        cid = int(d["contrato_id"])
        ts = d.get("created_at") or ""
        if ts and (cid not in ultimo_por_contrato or ts > ultimo_por_contrato[cid]):
            ultimo_por_contrato[cid] = ts
        if (d.get("tipo") or "").lower() == "firmado":
            tiene_firmado[cid] = True

    out = []
    for c in contratos:
        cid = int(c["id"])
        out.append(
            {
                "contrato_id": cid,
                "numero": c.get("numero"),
                "contratista": c.get("contratista"),
                "doc_contractual_estado": c.get("doc_contractual_estado") or "borrador",
                "doc_contractual_updated_at": c.get("doc_contractual_updated_at"),
                "ultimo_movimiento_documento_at": ultimo_por_contrato.get(cid),
                "tiene_documento_firmado": tiene_firmado.get(cid, False),
            }
        )
    return out


def resumen_contrato(sb, contrato_id: int) -> dict:
    """Estado completo para la UI de detalle."""
    estado = get_doc_estado_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id)
    tasa_iva = iva_tasa_licencia_contrato(estado)
    docs_gen = list_documentos(sb, contrato_id, tipo="generado")
    docs_firm = list_documentos(sb, contrato_id, tipo="firmado")
    numero = (estado.get("numero") or "").strip()
    lic_out = dict(lic) if lic else None
    if lic_out is not None and not (lic_out.get("identificacion_obra") or "").strip() and numero:
        lic_out["identificacion_obra_sugerida"] = numero
    return {
        "contrato": {
            "id": estado.get("id"),
            "numero": estado.get("numero"),
            "contratista": estado.get("contratista"),
            "nit": estado.get("nit"),
        },
        "doc_contractual_estado": estado.get("doc_contractual_estado") or "borrador",
        "doc_contractual_updated_at": estado.get("doc_contractual_updated_at"),
        "licenciatario": lic_out,
        "iva_tasa": tasa_iva,
        "iva_porcentaje_etiqueta": _iva_etiqueta_porcentaje(tasa_iva),
        "ultimo_generado": docs_gen[0] if docs_gen else None,
        "ultimo_firmado": docs_firm[0] if docs_firm else None,
        "historial_generados": docs_gen,
        "historial_firmados": docs_firm,
        "empresa_footer": empresa_footer_config(),
    }


def eliminar_documento_contractual(sb, doc_id: int, contrato_id: int) -> dict:
    """
    Elimina registro y blob. El consecutivo (version_num) solo queda libre para
    reutilización si era el máximo de su tipo (generado | firmado) en el contrato.
    """
    from azure_blob_storage import delete_blob_private

    assert_contrato_exists(sb, contrato_id)
    doc = get_documento(sb, doc_id, contrato_id)
    if not doc:
        raise ValueError("Documento no encontrado")
    tipo = (doc.get("tipo") or "").strip().lower()
    if tipo not in DOC_TIPOS:
        raise ValueError("Tipo de documento inválido")
    version_num = int(doc.get("version_num") or 0)
    max_v = max_version_num(sb, contrato_id, tipo)
    consecutivo_liberado = version_num > 0 and version_num == max_v

    blob_path = (doc.get("azure_blob_path") or "").strip()
    if blob_path:
        try:
            delete_blob_private(blob_path)
        except Exception as exc:
            _log.warning("No se pudo borrar blob documento %s: %s", doc_id, exc)

    sb.table("contrato_documento_contractual").delete().eq("id", int(doc_id)).eq(
        "contrato_id", int(contrato_id)
    ).execute()
    touch_doc_contractual_updated_at(sb, contrato_id)

    return {
        "id": int(doc_id),
        "tipo": tipo,
        "version_num": version_num,
        "consecutivo_liberado": consecutivo_liberado,
        "proximo_consecutivo": next_version_num(sb, contrato_id, tipo),
    }
