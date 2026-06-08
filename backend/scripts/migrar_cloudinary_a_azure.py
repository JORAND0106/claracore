r"""
Migración masiva Cloudinary → Azure Blob Storage + actualización de URLs en Supabase.

Requisitos:
  pip install cloudinary azure-storage-blob  (cloudinary solo para esta migración one-shot)

Variables (.env en backend/):
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER
  SUPABASE_URL, SUPABASE_KEY

Uso (desde la raíz del repo):
  python backend/scripts/migrar_cloudinary_a_azure.py

Opcional:
  CONTRATO_ID=2          — default contrato para fotos en raíz de Cloudinary sin carpeta
  DRY_RUN=1              — lista y mapea sin subir ni actualizar BD
  BATCH_SIZE=100         — tamaño de lote para logs y pausas
  SKIP_DB=1              — solo copia blobs, no actualiza Supabase
"""

from __future__ import annotations

import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import cloudinary
    import cloudinary.api
except ImportError:
    print("Instala cloudinary para la migración: pip install cloudinary", file=sys.stderr)
    raise

# Permite importar azure_blob_storage desde backend/
_SCRIPT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPT_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from azure_blob_storage import (  # noqa: E402
    blob_exists,
    blob_public_url,
    ensure_container_public,
    upload_blob,
)
from supabase import create_client  # noqa: E402

CLOUDINARY_ROOT = "claracore"
DEFAULT_CONTRATO_ID = 2
SEED_PREFIXES = ("_inicial_",)


@dataclass
class MigrationStats:
    total_resources: int = 0
    uploaded: int = 0
    upload_skipped: int = 0
    upload_failed: int = 0
    db_foto_updated: int = 0
    db_grafico_updated: int = 0
    db_perfil_updated: int = 0
    db_firma_updated: int = 0
    db_other_updated: int = 0
    db_skipped: int = 0
    db_failed: int = 0
    errors: list[str] = field(default_factory=list)


def _load_env_file() -> None:
    for candidate in (_BACKEND_DIR / ".env", Path.cwd() / "backend" / ".env", Path.cwd() / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip()
            if v.startswith('"') and v.endswith('"'):
                v = v[1:-1]
            elif v.startswith("'") and v.endswith("'"):
                v = v[1:-1]
            if k and k not in os.environ:
                os.environ[k] = v
        break


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in ("1", "true", "yes", "on")


def _fetch_all_image_resources(prefix: str | None) -> list[dict]:
    out: list[dict] = []
    next_cursor = None
    while True:
        params: dict = {
            "resource_type": "image",
            "type": "upload",
            "max_results": 500,
        }
        if prefix:
            params["prefix"] = prefix
        if next_cursor:
            params["next_cursor"] = next_cursor
        result = cloudinary.api.resources(**params)
        out.extend(result.get("resources", []))
        next_cursor = result.get("next_cursor")
        if not next_cursor:
            break
    return out


def _basename(public_id: str) -> str:
    return (public_id or "").strip().split("/")[-1]


def _numero_desde_basename(base: str) -> Optional[str]:
    m = re.match(r"^(\d+)", base)
    if m:
        return m.group(1)
    m = re.match(r"^foto_(\d+)", base, re.I)
    if m:
        return m.group(1)
    m = re.match(r"^grafico_(\d+)", base, re.I)
    if m:
        return m.group(1)
    return None


def _ext_from_resource(resource: dict) -> str:
    fmt = (resource.get("format") or "jpg").strip().lower()
    if fmt == "jpeg":
        return ".jpg"
    return f".{fmt}" if fmt else ".jpg"


def _is_seed_resource(public_id: str) -> bool:
    base = _basename(public_id)
    return any(base.startswith(p) for p in SEED_PREFIXES)


def cloudinary_public_id_to_azure_path(public_id: str, resource: dict, default_contrato_id: int) -> Optional[str]:
    """
    Mapea public_id Cloudinary → ruta blob Azure.
    Ejemplos:
      claracore/2/fotos/foto_123 → 2/fotos/foto_123.jpg
      claracore/inicio-novedades/nov_abc → inicio-novedades/nov_abc.jpg
      26773_xxx (raíz) → {default}/fotos/foto_26773.jpg
    """
    pid = (public_id or "").strip().strip("/")
    if not pid or _is_seed_resource(pid):
        return None

    ext = _ext_from_resource(resource)

    if pid.startswith(f"{CLOUDINARY_ROOT}/"):
        rel = pid[len(CLOUDINARY_ROOT) + 1 :]
    else:
        rel = pid

    parts = rel.split("/")

    # Raíz del account: 26773_abc
    if len(parts) == 1:
        num = _numero_desde_basename(parts[0])
        if num:
            return f"{default_contrato_id}/fotos/foto_{num}{ext}"
        return None

    # sin_contrato/{uid}/Fotos de Perfil/usuario_{uid}
    if parts[0] == "sin_contrato" and len(parts) >= 2:
        try:
            uid = int(parts[1])
        except ValueError:
            return None
        folder = "/".join(parts[2:]).lower()
        if "perfil" in folder:
            return f"perfiles/{uid}{ext}"
        if "firma" in folder:
            return f"firmas/{uid}{ext}"

    # inicio-novedades/nov_xxx | guias-bloques/guia_xxx
    if parts[0] in ("inicio-novedades", "guias-bloques"):
        name = parts[-1]
        if not name.endswith(ext):
            name = f"{name}{ext}" if not re.search(r"\.[a-z0-9]+$", name, re.I) else name
        return f"{parts[0]}/{name}"

    # {contrato_id}/fotos/foto_123
    if len(parts) >= 3:
        try:
            cid = int(parts[0])
        except ValueError:
            return None
        sub = parts[1].lower()
        base = parts[-1]
        if sub == "fotos":
            if base.startswith("foto_"):
                return f"{cid}/fotos/{base}{ext}" if not base.endswith(ext) else f"{cid}/fotos/{base}"
            num = _numero_desde_basename(base)
            if num:
                return f"{cid}/fotos/foto_{num}{ext}"
        if sub == "graficos":
            if base.startswith("grafico_"):
                return f"{cid}/graficos/{base}{ext}" if not base.endswith(ext) else f"{cid}/graficos/{base}"
            num = _numero_desde_basename(base)
            if num:
                return f"{cid}/graficos/grafico_{num}{ext}"
        if "perfil" in sub:
            m = re.search(r"usuario_(\d+)", base, re.I)
            if m:
                return f"perfiles/{int(m.group(1))}{ext}"
        if "firma" in sub:
            m = re.search(r"usuario_(\d+)", base, re.I)
            if m:
                return f"firmas/{int(m.group(1))}{ext}"

    return None


def _download_cloudinary_bytes(secure_url: str) -> bytes:
    import httpx

    r = httpx.get(secure_url, timeout=120.0, follow_redirects=True)
    r.raise_for_status()
    return r.content


def _content_type_from_ext(ext: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext.lower(), "image/jpeg")


def _migrate_blob(
    resource: dict,
    azure_path: str,
    old_url: str,
    *,
    dry_run: bool,
    stats: MigrationStats,
) -> Optional[str]:
    new_url = blob_public_url(azure_path)
    if dry_run:
        print(f"[DRY] {old_url} → {new_url} ({azure_path})")
        stats.upload_skipped += 1
        return new_url

    if blob_exists(azure_path):
        print(f"[SKIP blob exists] {azure_path}")
        stats.upload_skipped += 1
        return new_url

    try:
        data = _download_cloudinary_bytes(old_url)
        ct = _content_type_from_ext(Path(azure_path).suffix)
        upload_blob(azure_path, data, ct, overwrite=True)
        print(f"[OK upload] {azure_path} ({len(data)} bytes)")
        stats.uploaded += 1
        return new_url
    except Exception as exc:
        msg = f"Upload failed {azure_path}: {exc}"
        print(f"[ERR] {msg}", file=sys.stderr)
        stats.upload_failed += 1
        stats.errors.append(msg)
        return None


def _update_registros_by_url(sb, old_url: str, new_url: str, field: str, stats: MigrationStats, dry_run: bool) -> None:
    if old_url == new_url:
        return
    try:
        rows = (
            sb.table("so_registros")
            .select("id")
            .eq(field, old_url)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        msg = f"Select so_registros.{field} url={old_url[:80]}…: {exc}"
        stats.db_failed += 1
        stats.errors.append(msg)
        print(f"[ERR] {msg}", file=sys.stderr)
        return

    for row in rows:
        rid = row.get("id")
        if rid is None:
            continue
        if dry_run:
            print(f"[DRY DB] so_registros id={rid} {field} → {new_url}")
            if field == "foto_url":
                stats.db_foto_updated += 1
            else:
                stats.db_grafico_updated += 1
            continue
        try:
            sb.table("so_registros").update({field: new_url}).eq("id", rid).execute()
            print(f"[OK DB] so_registros id={rid} {field}")
            if field == "foto_url":
                stats.db_foto_updated += 1
            else:
                stats.db_grafico_updated += 1
        except Exception as exc:
            msg = f"Update so_registros id={rid}: {exc}"
            stats.db_failed += 1
            stats.errors.append(msg)
            print(f"[ERR] {msg}", file=sys.stderr)


def _update_usuario_url(sb, user_id: int, field: str, old_url: str, new_url: str, stats: MigrationStats, dry_run: bool) -> None:
    if old_url == new_url:
        stats.db_skipped += 1
        return
    if dry_run:
        print(f"[DRY DB] usuarios id={user_id} {field} → {new_url}")
        if field == "foto_perfil_url":
            stats.db_perfil_updated += 1
        else:
            stats.db_firma_updated += 1
        return
    try:
        sb.table("usuarios").update({field: new_url}).eq("id", user_id).execute()
        print(f"[OK DB] usuarios id={user_id} {field}")
        if field == "foto_perfil_url":
            stats.db_perfil_updated += 1
        else:
            stats.db_firma_updated += 1
    except Exception as exc:
        msg = f"Update usuarios id={user_id} {field}: {exc}"
        stats.db_failed += 1
        stats.errors.append(msg)
        print(f"[ERR] {msg}", file=sys.stderr)


def _migrate_usuarios_cloudinary_urls(sb, url_map: dict[str, str], stats: MigrationStats, dry_run: bool) -> None:
    try:
        users = (
            sb.table("usuarios")
            .select("id, foto_perfil_url, firma_imagen_url")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        stats.errors.append(f"Select usuarios: {exc}")
        return

    for u in users:
        uid = u.get("id")
        for field in ("foto_perfil_url", "firma_imagen_url"):
            old = (u.get(field) or "").strip()
            if not old or "cloudinary.com" not in old.lower():
                continue
            new_url = url_map.get(old)
            if not new_url:
                stats.db_skipped += 1
                print(f"[WARN] Sin mapeo Azure para usuarios.{field} id={uid}: {old[:80]}…")
                continue
            _update_usuario_url(sb, int(uid), field, old, new_url, stats, dry_run)


def main() -> None:
    _load_env_file()
    dry_run = _env_bool("DRY_RUN")
    skip_db = _env_bool("SKIP_DB")
    batch_size = _env_int("BATCH_SIZE", 100)
    default_contrato = _env_int("CONTRATO_ID", DEFAULT_CONTRATO_ID)

    cloud_name = (os.environ.get("CLOUDINARY_CLOUD_NAME") or "").strip()
    api_key = (os.environ.get("CLOUDINARY_API_KEY") or "").strip()
    api_secret = (os.environ.get("CLOUDINARY_API_SECRET") or "").strip()
    if not cloud_name or not api_key or not api_secret:
        print("Definí CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET", file=sys.stderr)
        sys.exit(1)

    sb_url = (os.environ.get("SUPABASE_URL") or "").strip()
    sb_key = (os.environ.get("SUPABASE_KEY") or "").strip()
    if not skip_db and (not sb_url or not sb_key):
        print("Definí SUPABASE_URL y SUPABASE_KEY (o SKIP_DB=1)", file=sys.stderr)
        sys.exit(1)

    if not dry_run:
        ensure_container_public()

    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)
    sb = create_client(sb_url, sb_key) if not skip_db else None

    print("Listando recursos Cloudinary (puede tardar)…", file=sys.stderr)
    resources = _fetch_all_image_resources(None)
    stats = MigrationStats(total_resources=len(resources))
    print(f"Total recursos imagen: {len(resources)}", file=sys.stderr)

    # old_url → new_url (dedupe por azure_path: gana el primero)
    url_map: dict[str, str] = {}
    azure_path_seen: dict[str, str] = {}

    processed = 0
    for resource in resources:
        pid = (resource.get("public_id") or "").strip()
        old_url = (resource.get("secure_url") or resource.get("url") or "").strip()
        if not pid or not old_url:
            continue

        azure_path = cloudinary_public_id_to_azure_path(pid, resource, default_contrato)
        if not azure_path:
            continue

        if azure_path in azure_path_seen:
            url_map[old_url] = azure_path_seen[azure_path]
            stats.upload_skipped += 1
            continue

        new_url = _migrate_blob(resource, azure_path, old_url, dry_run=dry_run, stats=stats)
        if new_url:
            url_map[old_url] = new_url
            azure_path_seen[azure_path] = new_url

        processed += 1
        if processed % batch_size == 0:
            print(f"--- Lote {processed}/{stats.total_resources} ---", file=sys.stderr)
            time.sleep(0.2)

    if not skip_db and sb is not None:
        print("Actualizando so_registros y usuarios…", file=sys.stderr)
        for old_url, new_url in url_map.items():
            base_old = old_url.split("?", 1)[0]
            for candidate in (old_url, base_old):
                if "cloudinary.com" not in candidate.lower():
                    continue
                _update_registros_by_url(sb, candidate, new_url, "foto_url", stats, dry_run)
                _update_registros_by_url(sb, candidate, new_url, "grafico_url", stats, dry_run)

        _migrate_usuarios_cloudinary_urls(sb, url_map, stats, dry_run)

        # Barrido final: cualquier URL Cloudinary restante que coincida parcialmente
        if not dry_run:
            try:
                rest_foto = (
                    sb.table("so_registros")
                    .select("id, foto_url")
                    .ilike("foto_url", "%cloudinary.com%")
                    .limit(5000)
                    .execute()
                    .data
                    or []
                )
                rest_graf = (
                    sb.table("so_registros")
                    .select("id, grafico_url")
                    .ilike("grafico_url", "%cloudinary.com%")
                    .limit(5000)
                    .execute()
                    .data
                    or []
                )
            except Exception as exc:
                stats.errors.append(f"Barrido final select: {exc}")
                rest_foto, rest_graf = [], []

            for row in rest_foto:
                old = (row.get("foto_url") or "").strip()
                new = url_map.get(old) or url_map.get(old.split("?", 1)[0])
                if new and row.get("id") is not None:
                    _update_registros_by_url(sb, old, new, "foto_url", stats, dry_run=False)
                elif old:
                    print(f"[WARN] foto_url sin mapeo id={row.get('id')}: {old[:80]}…")

            for row in rest_graf:
                old = (row.get("grafico_url") or "").strip()
                new = url_map.get(old) or url_map.get(old.split("?", 1)[0])
                if new and row.get("id") is not None:
                    _update_registros_by_url(sb, old, new, "grafico_url", stats, dry_run=False)
                elif old:
                    print(f"[WARN] grafico_url sin mapeo id={row.get('id')}: {old[:80]}…")

    print("\n=== REPORTE FINAL ===")
    print(f"Recursos Cloudinary listados: {stats.total_resources}")
    print(f"Blobs subidos:              {stats.uploaded}")
    print(f"Blobs omitidos (existían):  {stats.upload_skipped}")
    print(f"Blobs fallidos:             {stats.upload_failed}")
    print(f"so_registros foto_url:      {stats.db_foto_updated}")
    print(f"so_registros grafico_url:   {stats.db_grafico_updated}")
    print(f"usuarios foto_perfil_url:   {stats.db_perfil_updated}")
    print(f"usuarios firma_imagen_url:  {stats.db_firma_updated}")
    print(f"BD omitidos:                {stats.db_skipped}")
    print(f"BD fallidos:                {stats.db_failed}")
    if stats.errors:
        print(f"\nErrores ({len(stats.errors)}):")
        for err in stats.errors[:30]:
            print(f"  - {err}")
        if len(stats.errors) > 30:
            print(f"  … y {len(stats.errors) - 30} más")


if __name__ == "__main__":
    main()
