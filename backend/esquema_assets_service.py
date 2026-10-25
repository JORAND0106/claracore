"""
Archivos de esquema (PNG / PDF / DXF / escena) en carpeta privada por contrato.

Ruta: esquemas/{contrato}/{modulo}/{reporte}/{registro}/{archivo}
Sin URLs públicas permanentes. Acceso con permiso de contrato + enlace temporal.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

_log = logging.getLogger("claracore.esquema_assets")


def _abs():
    """Import diferido: permite probar paths/tokens sin Azure instalado."""
    from azure_blob_storage import (
        delete_blob_private,
        download_blob_bytes_private,
        upload_blob_private,
    )
    return delete_blob_private, download_blob_bytes_private, upload_blob_private

_SAFE = re.compile(r"[^a-zA-Z0-9._\- áéíóúÁÉÍÓÚñÑ]+")
_KIND_EXT = {
    "png": ".png",
    "pdf": ".pdf",
    "dxf": ".dxf",
    "scene": ".scene.json",
    "memoria": ".png",
    "despiece": ".png",
}
_KIND_MIME = {
    "png": "image/png",
    "pdf": "application/pdf",
    "dxf": "application/dxf",
    "scene": "application/json",
    "memoria": "image/png",
    "despiece": "image/png",
}


def slug_part(raw: Any, fallback: str = "sin-nombre") -> str:
    s = str(raw or "")
    s = _SAFE.sub("-", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)[:80]
    return s or fallback


def folder_prefix(
    contrato_id: int,
    modulo: str,
    *,
    reporte_id: Any = None,
    reporte_nombre: Any = None,
    registro_id: Any = None,
    registro_nombre: Any = None,
) -> str:
    cid = slug_part(contrato_id, "contrato")
    mod = slug_part(modulo, "modulo")
    rep_bits = []
    if reporte_id is not None and str(reporte_id) != "":
        rep_bits.append(str(reporte_id))
    if reporte_nombre:
        rep_bits.append(slug_part(reporte_nombre))
    rep = "-".join(rep_bits) or "documento"
    reg_bits = []
    if registro_id is not None and str(registro_id) != "":
        reg_bits.append(str(registro_id))
    if registro_nombre:
        reg_bits.append(slug_part(registro_nombre))
    reg = "-".join(reg_bits) or "registro"
    return f"esquemas/{cid}/{mod}/{rep}/{reg}"


def file_name(kind: str, title: str = "esquema", stamp: Optional[int] = None) -> str:
    base = slug_part(title, "esquema")
    ts = str(int(stamp or time.time()))
    k = (kind or "png").lower()
    if k == "pdf":
        return f"{base}_{ts}.pdf"
    if k == "dxf":
        return f"{base}_{ts}.dxf"
    if k == "scene":
        return f"{base}_{ts}.scene.json"
    if k == "memoria":
        return f"memoria_{base}_{ts}.png"
    if k == "despiece":
        return f"despiece_{base}_{ts}.png"
    return f"{base}_{ts}.png"


def blob_path_for(
    contrato_id: int,
    modulo: str,
    kind: str,
    title: str = "esquema",
    **folder_kw: Any,
) -> str:
    return f"{folder_prefix(contrato_id, modulo, **folder_kw)}/{file_name(kind, title)}"


def assert_path_in_contrato(blob_path: str, contrato_id: int) -> str:
    path = (blob_path or "").lstrip("/")
    prefix = f"esquemas/{slug_part(contrato_id, 'contrato')}/"
    if not path.startswith(prefix) and not path.startswith(f"esquemas/{contrato_id}/"):
        raise PermissionError("Ruta fuera del contrato")
    if ".." in path or path.startswith("/"):
        raise PermissionError("Ruta inválida")
    return path


def upload_asset(
    *,
    contrato_id: int,
    modulo: str,
    kind: str,
    data: bytes,
    title: str = "esquema",
    content_type: Optional[str] = None,
    replace_path: Optional[str] = None,
    reporte_id: Any = None,
    reporte_nombre: Any = None,
    registro_id: Any = None,
    registro_nombre: Any = None,
) -> Dict[str, Any]:
    k = (kind or "png").lower()
    mime = content_type or _KIND_MIME.get(k, "application/octet-stream")
    delete_blob_private, _download, upload_blob_private = _abs()
    if replace_path:
        path = assert_path_in_contrato(replace_path, contrato_id)
        try:
            delete_blob_private(path, contrato_id=contrato_id, storage_tipo="esquema")
        except Exception as exc:
            _log.debug("replace delete %s: %s", path, exc)
    else:
        path = blob_path_for(
            contrato_id,
            modulo,
            k,
            title,
            reporte_id=reporte_id,
            reporte_nombre=reporte_nombre,
            registro_id=registro_id,
            registro_nombre=registro_nombre,
        )
    upload_blob_private(
        path,
        data,
        content_type=mime,
        overwrite=True,
        contrato_id=contrato_id,
        storage_tipo="esquema",
    )
    return {
        "blob_path": path,
        "kind": k,
        "mime": mime,
        "nombre": path.rsplit("/", 1)[-1],
        "bytes": len(data),
    }


def list_assets(
    *,
    contrato_id: int,
    modulo: str,
    reporte_id: Any = None,
    registro_id: Any = None,
) -> List[Dict[str, Any]]:
    """Lista por prefijo usando el SDK de Azure (sin descargar)."""
    from azure_blob_storage import get_blob_service_client, private_container_name

    prefix = folder_prefix(
        contrato_id,
        modulo,
        reporte_id=reporte_id,
        registro_id=registro_id,
    )
    # Prefijo más amplio si no hay registro: módulo
    if registro_id is None and reporte_id is None:
        prefix = f"esquemas/{slug_part(contrato_id)}/{slug_part(modulo)}/"
    else:
        prefix = prefix + "/"

    cc = get_blob_service_client().get_container_client(private_container_name())
    out: List[Dict[str, Any]] = []
    for blob in cc.list_blobs(name_starts_with=prefix):
        name = getattr(blob, "name", "") or ""
        if not name:
            continue
        kind = "png"
        low = name.lower()
        if low.endswith(".pdf"):
            kind = "pdf"
        elif low.endswith(".dxf"):
            kind = "dxf"
        elif low.endswith(".scene.json"):
            kind = "scene"
        elif "memoria_" in low:
            kind = "memoria"
        elif "despiece_" in low:
            kind = "despiece"
        out.append({
            "blob_path": name,
            "kind": kind,
            "nombre": name.rsplit("/", 1)[-1],
            "bytes": int(getattr(blob, "size", 0) or 0),
        })
    return out


def download_asset(blob_path: str, contrato_id: int) -> Tuple[bytes, str]:
    path = assert_path_in_contrato(blob_path, contrato_id)
    _del, download_blob_bytes_private, _up = _abs()
    data = download_blob_bytes_private(path)
    mime = "application/octet-stream"
    low = path.lower()
    if low.endswith(".png"):
        mime = "image/png"
    elif low.endswith(".pdf"):
        mime = "application/pdf"
    elif low.endswith(".dxf"):
        mime = "application/dxf"
    elif low.endswith(".json"):
        mime = "application/json"
    return data, mime


def _token_secret() -> bytes:
    raw = (os.getenv("SECRET_KEY") or os.getenv("ESQUEMA_ASSETS_HMAC") or "dev-esquema-assets").encode("utf-8")
    return raw


def mint_temp_token(blob_path: str, contrato_id: int, ttl_seconds: int = 300) -> Dict[str, Any]:
    """Token HMAC corto para descarga sin sesión (vence en minutos)."""
    path = assert_path_in_contrato(blob_path, contrato_id)
    ttl = max(60, min(900, int(ttl_seconds or 300)))
    exp = int(time.time()) + ttl
    msg = f"{contrato_id}|{path}|{exp}".encode("utf-8")
    sig = hmac.new(_token_secret(), msg, hashlib.sha256).hexdigest()
    return {
        "token": f"{exp}.{sig}",
        "exp": exp,
        "blob_path": path,
        "contrato_id": int(contrato_id),
        "ttl_seconds": ttl,
    }


def verify_temp_token(blob_path: str, contrato_id: int, token: str) -> bool:
    parts = str(token or "").split(".", 1)
    if len(parts) != 2:
        return False
    exp_s, sig = parts
    try:
        exp = int(exp_s)
    except (TypeError, ValueError):
        return False
    if exp < int(time.time()):
        return False
    try:
        path = assert_path_in_contrato(blob_path, contrato_id)
    except PermissionError:
        return False
    msg = f"{contrato_id}|{path}|{exp}".encode("utf-8")
    expect = hmac.new(_token_secret(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, sig)


def temp_download_path(blob_path: str, contrato_id: int, token: str) -> str:
    """Ruta relativa del endpoint público temporal."""
    return (
        f"/esquema/assets/temp-download"
        f"?contrato_id={int(contrato_id)}"
        f"&path={quote(blob_path, safe='')}"
        f"&token={quote(token, safe='')}"
    )
