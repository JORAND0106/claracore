"""
Bloc de notas de campo — privado por usuario y contrato.
Prefijo: /bloc-notas/{contrato_id}/...
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from main import get_current_user, supabase

_log = logging.getLogger("claracore.bloc_notas")

router = APIRouter(prefix="/bloc-notas", tags=["bloc-notas"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _missing_table(exc: BaseException) -> bool:
    msg = str(exc)
    return ("bloc_notas_" in msg) and (
        "does not exist" in msg or "PGRST205" in msg or "42P01" in msg
    )


def _table_error(exc: BaseException) -> HTTPException:
    if _missing_table(exc):
        return HTTPException(
            status_code=503,
            detail="Falta la tabla del bloc de notas. Ejecute backend/sql/bloc_notas_modulo.sql.",
        )
    return HTTPException(status_code=500, detail=str(exc)[:240])


class FolderUpsert(BaseModel):
    id: str = Field(..., min_length=8, max_length=64)
    nombre: str = Field(..., min_length=1, max_length=200)
    updated_at: Optional[str] = None
    rev: int = Field(1, ge=1)
    deleted: bool = False
    device_id: Optional[str] = None


class NoteUpsert(BaseModel):
    id: str = Field(..., min_length=8, max_length=64)
    folder_id: Optional[str] = None
    title: str = Field("", max_length=300)
    body: Dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[str] = None
    rev: int = Field(1, ge=1)
    base_rev: Optional[int] = None
    deleted: bool = False
    device_id: Optional[str] = None


class SyncPushBody(BaseModel):
    folders: List[FolderUpsert] = Field(default_factory=list)
    notes: List[NoteUpsert] = Field(default_factory=list)
    device_id: Optional[str] = None


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/{contrato_id}/sync")
def pull_sync(
    contrato_id: int,
    since: Optional[str] = Query(None, description="ISO timestamp UTC"),
    current_user=Depends(get_current_user),
):
    uid = _uid(current_user)
    cid = int(contrato_id)
    try:
        fq = (
            supabase.table("bloc_notas_folders")
            .select("*")
            .eq("usuario_id", uid)
            .eq("contrato_id", cid)
        )
        nq = (
            supabase.table("bloc_notas_notes")
            .select("*")
            .eq("usuario_id", uid)
            .eq("contrato_id", cid)
        )
        since_dt = _parse_ts(since)
        if since_dt is not None:
            iso = since_dt.isoformat()
            fq = fq.gte("updated_at", iso)
            nq = nq.gte("updated_at", iso)
        folders = fq.execute().data or []
        notes = nq.execute().data or []
        return {
            "folders": folders,
            "notes": notes,
            "server_time": _now_iso(),
        }
    except Exception as e:
        raise _table_error(e) from e


@router.post("/{contrato_id}/sync")
def push_sync(
    contrato_id: int,
    body: SyncPushBody,
    current_user=Depends(get_current_user),
):
    """
    Empuja carpetas y notas del dispositivo.
    Si una nota local choca con una versión más nueva en servidor, se conserva
    la del servidor y se crea una copia automática con el contenido local.
    """
    uid = _uid(current_user)
    cid = int(contrato_id)
    conflict_copies: List[dict] = []
    applied_folders: List[dict] = []
    applied_notes: List[dict] = []

    try:
        for f in body.folders:
            fid = str(f.id).strip()
            try:
                uuid.UUID(fid)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"folder id inválido: {fid}") from exc
            existing = (
                supabase.table("bloc_notas_folders")
                .select("*")
                .eq("id", fid)
                .eq("usuario_id", uid)
                .eq("contrato_id", cid)
                .limit(1)
                .execute()
                .data
                or []
            )
            row = {
                "id": fid,
                "contrato_id": cid,
                "usuario_id": uid,
                "nombre": (f.nombre or "Cuaderno").strip()[:200] or "Cuaderno",
                "updated_at": f.updated_at or _now_iso(),
                "rev": int(f.rev or 1),
                "device_id": f.device_id or body.device_id,
                "deleted_at": _now_iso() if f.deleted else None,
            }
            if not existing:
                row["created_at"] = _now_iso()
                supabase.table("bloc_notas_folders").insert(row).execute()
            else:
                supabase.table("bloc_notas_folders").update(row).eq("id", fid).eq(
                    "usuario_id", uid
                ).execute()
            applied_folders.append(row)

        for n in body.notes:
            nid = str(n.id).strip()
            try:
                uuid.UUID(nid)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"note id inválido: {nid}") from exc
            existing_rows = (
                supabase.table("bloc_notas_notes")
                .select("*")
                .eq("id", nid)
                .eq("usuario_id", uid)
                .eq("contrato_id", cid)
                .limit(1)
                .execute()
                .data
                or []
            )
            existing = existing_rows[0] if existing_rows else None
            server_rev = int(existing.get("rev") or 0) if existing else 0
            base_rev = int(n.base_rev) if n.base_rev is not None else None
            client_device = (n.device_id or body.device_id or "") or ""
            server_device = str((existing or {}).get("device_id") or "")

            # Conflicto REAL: misma nota editada en DOS dispositivos distintos sin conexión.
            # Mismo device_id → siempre upsert (nunca copia). base_rev None → primera subida.
            is_real_conflict = (
                existing
                and base_rev is not None
                and server_rev > base_rev
                and not n.deleted
                and bool(client_device)
                and bool(server_device)
                and client_device != server_device
            )
            if is_real_conflict:
                copy_id = str(uuid.uuid4())
                copy_row = {
                    "id": copy_id,
                    "folder_id": n.folder_id or existing.get("folder_id"),
                    "contrato_id": cid,
                    "usuario_id": uid,
                    "title": _conflict_title(n.title or existing.get("title") or "Nota"),
                    "body": n.body or {},
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                    "rev": 1,
                    "device_id": client_device,
                    "deleted_at": None,
                    "conflict_of": nid,
                }
                supabase.table("bloc_notas_notes").insert(copy_row).execute()
                conflict_copies.append(copy_row)
                applied_notes.append(existing)
                continue

            row = {
                "id": nid,
                "folder_id": n.folder_id,
                "contrato_id": cid,
                "usuario_id": uid,
                "title": (n.title or "")[:300],
                "body": n.body or {},
                "updated_at": n.updated_at or _now_iso(),
                "rev": max(int(n.rev or 1), server_rev + 1 if existing else 1),
                "device_id": client_device or (existing.get("device_id") if existing else None),
                "deleted_at": _now_iso() if n.deleted else None,
                "conflict_of": existing.get("conflict_of") if existing else None,
            }
            if not existing:
                row["created_at"] = _now_iso()
                supabase.table("bloc_notas_notes").insert(row).execute()
            else:
                supabase.table("bloc_notas_notes").update(row).eq("id", nid).eq(
                    "usuario_id", uid
                ).execute()
            applied_notes.append(row)

        return {
            "ok": True,
            "folders": applied_folders,
            "notes": applied_notes,
            "conflict_copies": conflict_copies,
            "server_time": _now_iso(),
        }
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("bloc-notas sync push failed")
        raise _table_error(e) from e


def _conflict_title(title: str) -> str:
    """Misma regla que frontend/src/modules/bloc-notas/blocNotasConflict.js."""
    base = (title or "Nota").strip() or "Nota"
    if len(base) > 240:
        base = base[:240]
    return f"{base} · copia"


@router.get("/{contrato_id}/notes")
def list_notes(contrato_id: int, current_user=Depends(get_current_user)):
    """Lista notas propias del contrato (nunca las de otro usuario)."""
    uid = _uid(current_user)
    try:
        rows = (
            supabase.table("bloc_notas_notes")
            .select("id, folder_id, title, updated_at, rev, deleted_at, conflict_of, created_at")
            .eq("usuario_id", uid)
            .eq("contrato_id", int(contrato_id))
            .is_("deleted_at", "null")
            .order("updated_at", desc=True)
            .execute()
            .data
            or []
        )
        return rows
    except Exception as e:
        raise _table_error(e) from e
