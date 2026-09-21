"""Siembra de roles de plataforma (idempotente, vía cliente Supabase)."""
from __future__ import annotations

import logging
from typing import Any, Optional

_log = logging.getLogger("uvicorn.error")

ROL_ADMINISTRATIVO_NOMBRE = "Administrativo"


def ensure_rol_administrativo(sb: Any) -> list:
    """Garantiza el ROL «Administrativo» en `roles` sin migración manual.

    Idempotente. Si el INSERT falla (p. ej. RLS), registra warning y devuelve el
    listado actual; en ese caso hay que aplicar backend/sql/rrhh_rol_administrativo.sql.
    """
    if sb is None:
        return []
    try:
        rows = sb.table("roles").select("*").order("nombre").execute().data or []
    except Exception as e:
        _log.warning("roles: no se pudo listar para ensure Administrativo: %s", e)
        return []

    existe = any(
        (r.get("nombre") or "").strip().lower() == "administrativo"
        for r in rows
    )
    if existe:
        return rows

    try:
        sb.table("roles").insert({"nombre": ROL_ADMINISTRATIVO_NOMBRE}).execute()
    except Exception as e:
        _log.warning(
            "roles: no se pudo insertar ROL Administrativo vía API (%s). "
            "Ejecuta backend/sql/rrhh_rol_administrativo.sql en Supabase.",
            e,
        )
        return rows

    try:
        return sb.table("roles").select("*").order("nombre").execute().data or []
    except Exception as e2:
        _log.warning("roles: insert ok pero falló relectura: %s", e2)
        return rows
