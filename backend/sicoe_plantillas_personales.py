"""Plantillas de reporte SicoeObra: alcance personal por creador."""
from __future__ import annotations

from typing import Any, Optional


def usuario_id_desde_token(current_user: Optional[dict]) -> Optional[int]:
    if not isinstance(current_user, dict):
        return None
    raw = current_user.get("sub", current_user.get("id"))
    try:
        uid = int(raw)
    except (TypeError, ValueError):
        return None
    return uid if uid > 0 else None


def plantilla_creador_identificable(row: Optional[dict]) -> bool:
    if not isinstance(row, dict):
        return False
    raw = row.get("creado_por")
    if raw is None or raw == "":
        return False
    try:
        return int(raw) > 0
    except (TypeError, ValueError):
        return False


def plantilla_es_del_usuario(row: Optional[dict], usuario_id: Any) -> bool:
    try:
        uid = int(usuario_id)
    except (TypeError, ValueError):
        return False
    if uid <= 0 or not isinstance(row, dict):
        return False
    try:
        return int(row.get("creado_por")) == uid
    except (TypeError, ValueError):
        return False


def resumir_plantillas_sin_creador(rows: list) -> dict:
    """Lista plantillas sin creador usable (no las elimina ni las asigna)."""
    huerfanas = []
    for r in rows or []:
        if plantilla_creador_identificable(r):
            continue
        huerfanas.append(
            {
                "id": r.get("id"),
                "nombre": r.get("nombre"),
                "contrato_id": r.get("contrato_id"),
                "capitulo": r.get("capitulo"),
                "creado_por": r.get("creado_por"),
            }
        )
    return {"count": len(huerfanas), "plantillas": huerfanas}
