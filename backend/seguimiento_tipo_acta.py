"""Tipos de acta personalizados (opción Otro) por contrato."""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import List, Optional

_log = logging.getLogger("claracore.seguimiento.tipo_acta")

BUILTIN_TIPOS = frozenset({"interna", "externa"})
_MAX_NOMBRE = 80


def norm_tipo_key(raw: Optional[str]) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    # NFD + quitar marcas diacríticas + casefold
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.casefold()


def acta_incluye_gestion_obra(tipo_acta: Optional[str]) -> bool:
    """TAB/PDF de Gestión de obra solo para Interna y Externa (tipos originales)."""
    return norm_tipo_key(tipo_acta) in BUILTIN_TIPOS


def display_tipo_acta(raw: Optional[str]) -> str:
    t = (raw or "").strip()
    if not t:
        return "—"
    k = norm_tipo_key(t)
    if k == "interna":
        return "Interna"
    if k == "externa":
        return "Externa"
    return t


def normalize_tipo_acta_value(
    raw: Optional[str],
    *,
    custom_nombres: Optional[List[str]] = None,
) -> str:
    """
    Devuelve el valor canónico a persistir en seguimiento_acta.tipo_acta.
    Builtins → interna|externa. Personalizados → nombre canónico del catálogo
    (o el texto limpio si aún no está en catálogo).
    """
    t = (raw or "interna").strip()
    if not t:
        raise ValueError("El tipo de acta es obligatorio")
    if len(t) > _MAX_NOMBRE:
        raise ValueError(f"El tipo de acta no puede superar {_MAX_NOMBRE} caracteres")
    k = norm_tipo_key(t)
    if k in BUILTIN_TIPOS:
        return k
    # No permitir nombres que colisionen con builtins tras normalizar
    if k in ("interna", "externa"):
        return k
    # Reusar canónico del catálogo si hay match por nombre_norm
    for nom in custom_nombres or []:
        if norm_tipo_key(nom) == k:
            return str(nom).strip()
    # Capitalizar mínimamente el primero
    cleaned = re.sub(r"\s+", " ", t).strip()
    if not cleaned:
        raise ValueError("El tipo de acta es obligatorio")
    return cleaned


def list_tipos_custom(sb, contrato_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("seguimiento_acta_tipo_custom")
            .select("id,contrato_id,nombre,nombre_norm,created_at")
            .eq("contrato_id", int(contrato_id))
            .order("nombre")
            .execute()
            .data
            or []
        )
        return list(rows)
    except Exception as exc:
        msg = str(exc or "").lower()
        if "seguimiento_acta_tipo_custom" in msg or "schema cache" in msg or "pgrst" in msg:
            _log.warning("tabla tipos custom no disponible: %s", exc)
            return []
        raise


def upsert_tipo_custom(sb, contrato_id: int, nombre: str) -> dict:
    """Registra (o reutiliza) un tipo personalizado. No duplica por nombre_norm."""
    cleaned = normalize_tipo_acta_value(nombre)
    k = norm_tipo_key(cleaned)
    if k in BUILTIN_TIPOS:
        return {"nombre": k, "nombre_norm": k, "builtin": True}

    existing = list_tipos_custom(sb, contrato_id)
    for row in existing:
        if norm_tipo_key(row.get("nombre")) == k:
            return {**row, "builtin": False}

    row = {
        "contrato_id": int(contrato_id),
        "nombre": cleaned,
        "nombre_norm": k,
    }
    try:
        inserted = (
            sb.table("seguimiento_acta_tipo_custom")
            .upsert(row, on_conflict="contrato_id,nombre_norm")
            .execute()
            .data
            or []
        )
        if inserted:
            return {**inserted[0], "builtin": False}
    except Exception as exc:
        _log.warning("upsert tipo custom: %s", exc)
        # Fallback insert simple
        try:
            inserted = sb.table("seguimiento_acta_tipo_custom").insert(row).execute().data or []
            if inserted:
                return {**inserted[0], "builtin": False}
        except Exception as exc2:
            # Carrera: ya existía
            for r in list_tipos_custom(sb, contrato_id):
                if norm_tipo_key(r.get("nombre")) == k:
                    return {**r, "builtin": False}
            raise ValueError(f"No se pudo guardar el tipo de acta: {exc2}") from exc2
    # Releer
    for r in list_tipos_custom(sb, contrato_id):
        if norm_tipo_key(r.get("nombre")) == k:
            return {**r, "builtin": False}
    return {"nombre": cleaned, "nombre_norm": k, "builtin": False}


def list_tipos_acta_contrato(sb, contrato_id: int) -> List[dict]:
    """Builtins + personalizados del contrato (para selects)."""
    out = [
        {"value": "interna", "label": "Interna", "builtin": True},
        {"value": "externa", "label": "Externa", "builtin": True},
    ]
    seen = {norm_tipo_key("interna"), norm_tipo_key("externa")}
    for row in list_tipos_custom(sb, contrato_id):
        nombre = str(row.get("nombre") or "").strip()
        if not nombre:
            continue
        k = norm_tipo_key(nombre)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append({
            "value": nombre,
            "label": nombre,
            "builtin": False,
            "id": row.get("id"),
        })
    return out
