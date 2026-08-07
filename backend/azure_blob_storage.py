"""Azure Blob Storage para imágenes de ClaraCore."""

from __future__ import annotations

import logging
import os
import re
import threading
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import BlobServiceClient, ContentSettings, PublicAccess

_log = logging.getLogger("claracore.azure_blob")

_init_lock = threading.Lock()
_initialized = False
_private_init_lock = threading.Lock()
_private_initialized = False
_blob_service: Optional[BlobServiceClient] = None


def _connection_string() -> str:
    cs = (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
    if not cs:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING no está configurada.")
    return cs


def container_name() -> str:
    return (os.getenv("AZURE_STORAGE_CONTAINER") or "claracore").strip()


def get_blob_service_client() -> BlobServiceClient:
    global _blob_service
    if _blob_service is None:
        _blob_service = BlobServiceClient.from_connection_string(_connection_string())
    return _blob_service


def ensure_container_public() -> None:
    """Crea el contenedor si no existe y habilita acceso público a nivel blob."""
    global _initialized
    with _init_lock:
        if _initialized:
            return
        client = get_blob_service_client()
        name = container_name()
        cc = client.get_container_client(name)
        try:
            cc.create_container(public_access=PublicAccess.Blob)
        except ResourceExistsError:
            pass
        try:
            cc.set_container_access_policy(public_access=PublicAccess.Blob, signed_identifiers={})
        except Exception as exc:
            _log.warning("set_container_access_policy %s: %s", name, exc)
        _initialized = True


def blob_public_url(blob_path: str) -> str:
    path = blob_path.lstrip("/")
    cc = get_blob_service_client().get_container_client(container_name())
    return cc.get_blob_client(path).url


def upload_blob(
    blob_path: str,
    data: bytes,
    content_type: Optional[str] = None,
    *,
    overwrite: bool = True,
) -> str:
    ensure_container_public()
    path = blob_path.lstrip("/")
    ct = (content_type or "image/jpeg").split(";")[0].strip()
    cc = get_blob_service_client().get_container_client(container_name())
    cc.upload_blob(
        name=path,
        data=data,
        overwrite=overwrite,
        content_settings=ContentSettings(content_type=ct),
    )
    return blob_public_url(path)


def download_blob_bytes(blob_path: str) -> bytes:
    path = blob_path.lstrip("/")
    cc = get_blob_service_client().get_container_client(container_name())
    return cc.download_blob(path).readall()


def blob_exists(blob_path: str) -> bool:
    path = blob_path.lstrip("/")
    cc = get_blob_service_client().get_container_client(container_name())
    return cc.get_blob_client(path).exists()


def blob_path_from_url(url: str) -> Optional[str]:
    """Extrae la ruta del blob desde una URL pública de Azure."""
    if not url or not str(url).strip():
        return None
    raw = str(url).strip().split("?", 1)[0]
    parsed = urlparse(raw)
    if not parsed.netloc.endswith(".blob.core.windows.net"):
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if not parts:
        return None
    cname = container_name()
    if parts[0] == cname:
        return unquote("/".join(parts[1:]))
    return unquote("/".join(parts))


def path_sicoe_foto(contrato_id: int, numero: int, ext: str = ".jpg") -> str:
    return f"{int(contrato_id)}/fotos/foto_{int(numero)}{ext}"


def path_sicoe_grafico(contrato_id: int, numero: int, ext: str = ".jpg") -> str:
    return f"{int(contrato_id)}/graficos/grafico_{int(numero)}{ext}"


def path_presupuesto_grafico(contrato_id: int, nombre: str, ext: str = ".jpg") -> str:
    """Gráficos de memorias de ítem (Presupuesto), path único por nombre/uuid."""
    safe = (nombre or "grafico").strip().replace("/", "_")
    if not ext.startswith("."):
        ext = f".{ext}"
    return f"{int(contrato_id)}/presupuesto-graficos/{safe}{ext}"


def path_perfil(uid: int, ext: str = ".jpg") -> str:
    return f"perfiles/{int(uid)}{ext}"


def path_firma(uid: int, ext: str = ".jpg") -> str:
    return f"firmas/{int(uid)}{ext}"


def path_inicio_novedad(nombre: str) -> str:
    return f"inicio-novedades/{nombre}"


def path_guia_bloque(nombre: str) -> str:
    return f"guias-bloques/{nombre}"


def sicoe_blob_path(contrato_id: int, subcarpeta: str, public_id: str, ext: str = ".jpg") -> str:
    """Mapea subcarpeta + public_id (p. ej. fotos, foto_123) al path Azure."""
    sub = (subcarpeta or "").strip().lower()
    pid = (public_id or "").strip()
    if sub == "fotos" and pid.startswith("foto_"):
        num = pid[5:]
        return path_sicoe_foto(contrato_id, int(num), ext)
    if sub == "graficos" and pid.startswith("grafico_"):
        num = pid[8:]
        return path_sicoe_grafico(contrato_id, int(num), ext)
    cid = int(contrato_id)
    return f"{cid}/{sub}/{pid}{ext}"


# ── Contenedor privado (documentos contractuales; sin URLs públicas) ──────────


def private_container_name() -> str:
    return (os.getenv("AZURE_STORAGE_CONTAINER_PRIVADO") or "claracore-privado").strip()


def ensure_private_container() -> None:
    """Crea el contenedor privado si no existe. No modifica el contenedor público claracore."""
    global _private_initialized
    with _private_init_lock:
        if _private_initialized:
            return
        client = get_blob_service_client()
        name = private_container_name()
        cc = client.get_container_client(name)
        try:
            cc.create_container()
        except ResourceExistsError:
            pass
        _private_initialized = True


def upload_blob_private(
    blob_path: str,
    data: bytes,
    content_type: Optional[str] = None,
    *,
    overwrite: bool = False,
) -> str:
    """
    Sube al contenedor privado. Devuelve la ruta del blob (no URL pública).
    """
    ensure_private_container()
    path = blob_path.lstrip("/")
    ct = (content_type or "application/octet-stream").split(";")[0].strip()
    cc = get_blob_service_client().get_container_client(private_container_name())
    cc.upload_blob(
        name=path,
        data=data,
        overwrite=overwrite,
        content_settings=ContentSettings(content_type=ct),
    )
    return path


def download_blob_bytes_private(blob_path: str) -> bytes:
    path = blob_path.lstrip("/")
    cc = get_blob_service_client().get_container_client(private_container_name())
    return cc.download_blob(path).readall()


def delete_blob_private(blob_path: str) -> None:
    """Elimina un blob del contenedor privado (idempotente si no existe)."""
    path = (blob_path or "").strip().lstrip("/")
    if not path:
        return
    cc = get_blob_service_client().get_container_client(private_container_name())
    blob = cc.get_blob_client(path)
    if blob.exists():
        blob.delete_blob()


def blob_exists_private(blob_path: str) -> bool:
    path = blob_path.lstrip("/")
    cc = get_blob_service_client().get_container_client(private_container_name())
    return cc.get_blob_client(path).exists()


def path_contrato_doc_generado(contrato_id: int, version_num: int) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"contratos-documentos/{int(contrato_id)}/generados/v{int(version_num):03d}_{ts}.pdf"


def path_contrato_doc_firmado(contrato_id: int, version_num: int) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"contratos-documentos/{int(contrato_id)}/firmados/v{int(version_num):03d}_{ts}.pdf"


def path_contrato_orden_pago(contrato_id: int, numero_corte: int) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return (
        f"contratos-ordenes-pago/{int(contrato_id)}/"
        f"corte-{int(numero_corte):04d}/orden_{ts}.pdf"
    )


def path_contrato_orden_pago_factura(
    contrato_id: int, numero_corte: int, nombre_archivo: str
) -> str:
    """Factura emitida (PDF/imagen) adjunta a una orden de pago — contenedor privado."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = re.sub(r"[^\w.\-]", "_", (nombre_archivo or "factura").strip())[:120]
    return (
        f"contratos-ordenes-pago/{int(contrato_id)}/"
        f"corte-{int(numero_corte):04d}/factura_{ts}_{safe}"
    )


def path_contabilidad_soporte(transaccion_id: int, nombre_archivo: str) -> str:
    """Soporte adjunto de transacción contable (contenedor privado)."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = re.sub(r"[^\w.\-]", "_", (nombre_archivo or "soporte").strip())[:120]
    return f"contabilidad-soportes/{int(transaccion_id)}/{ts}_{safe}"


def path_contabilidad_documento_empresa(categoria: str, nombre_archivo: str) -> str:
    """Documento corporativo del módulo Contabilidad (contenedor privado)."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cat = re.sub(r"[^\w\-]", "_", (categoria or "otros").strip().lower())[:32]
    safe = re.sub(r"[^\w.\-]", "_", (nombre_archivo or "documento").strip())[:120]
    return f"contabilidad-documentos-empresa/{cat}/{ts}_{safe}"
