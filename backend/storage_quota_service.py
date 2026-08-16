"""
Contabilización de almacenamiento Azure por contrato.

- Umbral gratuito global (configurable)
- Tarifas/rangos de capacidad (referencia; sin cobro automático)
- Contadores por tipo: fotos / documentos / otros
- Gate de carga cuando se supera el límite asignado

Diseño de rendimiento: contadores en BD actualizados atómicamente vía RPC
`storage_adjust_uso` en cada upload/delete (O(1)), sin listar blobs en caliente.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from fastapi import HTTPException

_log = logging.getLogger("claracore.storage_quota")

TIPO_FOTOS = "fotos"
TIPO_DOCUMENTOS = "documentos"
TIPO_OTROS = "otros"
TIPOS_VALIDOS = frozenset({TIPO_FOTOS, TIPO_DOCUMENTOS, TIPO_OTROS})

GIB = 1024 ** 3
DEFAULT_UMBRAL_GRATUITO_BYTES = 5 * GIB

CODE_QUOTA_EXCEEDED = "storage_quota_exceeded"
CODE_SCHEMA_MISSING = "storage_schema_missing"

# Caché corta de “¿existe el esquema?” para no martillar errores PostgREST
_schema_ok: Optional[bool] = None


class StorageQuotaExceeded(Exception):
    """Se intenta cargar más allá del límite del contrato."""

    def __init__(self, detail: dict):
        self.detail = detail
        super().__init__(detail.get("message") or CODE_QUOTA_EXCEEDED)


def format_bytes(n: int | float | None) -> str:
    try:
        v = float(n or 0)
    except (TypeError, ValueError):
        v = 0.0
    if v < 0:
        v = 0.0
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while v >= 1024 and i < len(units) - 1:
        v /= 1024.0
        i += 1
    if i == 0:
        return f"{int(v)} {units[i]}"
    return f"{v:.2f} {units[i]}"


def classify_storage_tipo(
    *,
    content_type: Optional[str] = None,
    blob_path: Optional[str] = None,
    hint: Optional[str] = None,
) -> str:
    """Clasifica el archivo en fotos | documentos | otros."""
    if hint and str(hint).strip().lower() in TIPOS_VALIDOS:
        return str(hint).strip().lower()

    path = (blob_path or "").lower()
    ct = (content_type or "").split(";")[0].strip().lower()

    if any(
        x in path
        for x in (
            "/fotos/",
            "/graficos/",
            "/presupuesto-graficos/",
            "/evidencia",
            "mapa-pantallazos",
        )
    ):
        return TIPO_FOTOS
    if ct.startswith("image/"):
        return TIPO_FOTOS

    if ct in ("application/pdf", "application/x-pdf") or path.endswith(".pdf"):
        return TIPO_DOCUMENTOS
    if any(
        x in path
        for x in (
            "documentos",
            "ordenes-pago",
            "almacen-soportes",
            "seguimiento-actas",
            "seguimiento-llamados",
            "factura",
            "soporte",
            "remision",
            "disposicion",
        )
    ):
        return TIPO_DOCUMENTOS
    if ct.startswith("application/") or ct.startswith("text/"):
        return TIPO_DOCUMENTOS

    return TIPO_OTROS


def infer_contrato_id_from_path(blob_path: Optional[str]) -> Optional[int]:
    """Extrae contrato_id de rutas conocidas; None si no es por-contrato."""
    path = (blob_path or "").lstrip("/")
    if not path:
        return None
    # Prefijos globales (no cuentan por contrato)
    skip_prefixes = (
        "perfiles/",
        "firmas/",
        "inicio-novedades/",
        "guias-bloques/",
        "ayuda/",
        "contabilidad-soportes/",
        "contabilidad-documentos-empresa/",
        "seguimiento-evidencias/",
        "seguimiento-tareas/",
    )
    if path.startswith(skip_prefixes):
        return None

    m = re.match(r"^(\d+)/(fotos|graficos|presupuesto-graficos)/", path)
    if m:
        return int(m.group(1))

    for prefix in (
        "almacen-soportes/",
        "contratos-documentos/",
        "contratos-ordenes-pago/",
        "seguimiento-actas/",
        "seguimiento-llamados/",
    ):
        if path.startswith(prefix):
            rest = path[len(prefix) :]
            part = rest.split("/", 1)[0]
            if part.isdigit():
                return int(part)
    return None


def resolve_limite_bytes(
    *,
    umbral_gratuito_bytes: int,
    tarifa_capacidad_bytes: Optional[int] = None,
    limite_override_bytes: Optional[int] = None,
) -> int:
    """Prioridad: override manual > capacidad del plan asignado > umbral gratuito."""
    if limite_override_bytes is not None:
        return max(0, int(limite_override_bytes))
    if tarifa_capacidad_bytes is not None:
        return max(0, int(tarifa_capacidad_bytes))
    return max(0, int(umbral_gratuito_bytes))


def build_quota_detail(
    *,
    contrato_id: int,
    used_bytes: int,
    limit_bytes: int,
    needed_bytes: int,
    bytes_fotos: int = 0,
    bytes_documentos: int = 0,
    bytes_otros: int = 0,
    plan_nombre: Optional[str] = None,
) -> dict:
    used = max(0, int(used_bytes))
    limit = max(0, int(limit_bytes))
    need = max(0, int(needed_bytes))
    return {
        "code": CODE_QUOTA_EXCEEDED,
        "message": (
            "Se alcanzó el límite de almacenamiento de este contrato "
            f"({format_bytes(used)} / {format_bytes(limit)}). "
            "No se pueden cargar más archivos hasta que se asigne un plan superior "
            "o se libere espacio."
        ),
        "contrato_id": int(contrato_id),
        "used_bytes": used,
        "limit_bytes": limit,
        "needed_bytes": need,
        "remaining_bytes": max(0, limit - used),
        "bytes_fotos": max(0, int(bytes_fotos)),
        "bytes_documentos": max(0, int(bytes_documentos)),
        "bytes_otros": max(0, int(bytes_otros)),
        "plan_nombre": plan_nombre,
        "used_human": format_bytes(used),
        "limit_human": format_bytes(limit),
    }


def _sb():
    from main import get_supabase

    return get_supabase()


def _mark_schema(ok: bool) -> None:
    global _schema_ok
    _schema_ok = ok


def schema_available(force: bool = False) -> bool:
    """True si las tablas de storage existen (tras aplicar la migración)."""
    global _schema_ok
    if _schema_ok is not None and not force:
        return _schema_ok
    try:
        _sb().table("storage_config").select("id").limit(1).execute()
        _mark_schema(True)
        return True
    except Exception as exc:
        msg = str(exc).lower()
        if "storage_config" in msg or "does not exist" in msg or "pgrst" in msg or "42p01" in msg:
            _log.warning("Esquema storage_quota no disponible aún: %s", exc)
            _mark_schema(False)
            return False
        # Otros errores (red): no cachear como ausente
        _log.warning("No se pudo verificar storage_config: %s", exc)
        return False


def get_config() -> dict:
    if not schema_available():
        return {
            "umbral_gratuito_bytes": DEFAULT_UMBRAL_GRATUITO_BYTES,
            "umbral_gratuito_human": format_bytes(DEFAULT_UMBRAL_GRATUITO_BYTES),
            "schema_ready": False,
        }
    row = (
        _sb().table("storage_config").select("*").eq("id", 1).limit(1).execute().data or [None]
    )[0]
    if not row:
        umbral = DEFAULT_UMBRAL_GRATUITO_BYTES
        return {
            "umbral_gratuito_bytes": umbral,
            "umbral_gratuito_human": format_bytes(umbral),
            "schema_ready": True,
        }
    umbral = int(row.get("umbral_gratuito_bytes") or DEFAULT_UMBRAL_GRATUITO_BYTES)
    return {
        **row,
        "umbral_gratuito_bytes": umbral,
        "umbral_gratuito_human": format_bytes(umbral),
        "schema_ready": True,
    }


def update_config(*, umbral_gratuito_bytes: int, updated_by: Optional[int] = None) -> dict:
    if int(umbral_gratuito_bytes) < 0:
        raise ValueError("umbral_gratuito_bytes debe ser >= 0")
    if not schema_available(force=True):
        raise RuntimeError(
            "Aplique la migración backend/migrations/20260816170000_contrato_storage_quota.sql"
        )
    payload: dict[str, Any] = {
        "id": 1,
        "umbral_gratuito_bytes": int(umbral_gratuito_bytes),
        "updated_at": "now()",
    }
    if updated_by is not None:
        payload["updated_by"] = int(updated_by)
    # supabase-py: use ISO timestamp via python
    from datetime import datetime, timezone

    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    _sb().table("storage_config").upsert(payload, on_conflict="id").execute()
    return get_config()


def list_tarifas(*, solo_activas: bool = False) -> list[dict]:
    if not schema_available():
        return []
    q = _sb().table("storage_tarifas").select("*").order("orden").order("capacidad_bytes")
    if solo_activas:
        q = q.eq("activo", True)
    rows = q.execute().data or []
    for r in rows:
        r["capacidad_human"] = format_bytes(r.get("capacidad_bytes"))
    return rows


def upsert_tarifa(payload: dict) -> dict:
    if not schema_available(force=True):
        raise RuntimeError("Esquema storage_quota no disponible")
    data = {
        "nombre": str(payload["nombre"]).strip(),
        "capacidad_bytes": int(payload["capacidad_bytes"]),
        "precio_cop_mes": float(payload.get("precio_cop_mes") or 0),
        "orden": int(payload.get("orden") or 100),
        "activo": bool(payload.get("activo", True)),
        "notas": (payload.get("notas") or None),
    }
    if not data["nombre"]:
        raise ValueError("nombre requerido")
    if data["capacidad_bytes"] <= 0:
        raise ValueError("capacidad_bytes debe ser > 0")
    if data["precio_cop_mes"] < 0:
        raise ValueError("precio_cop_mes debe ser >= 0")

    from datetime import datetime, timezone

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    tid = payload.get("id")
    if tid:
        _sb().table("storage_tarifas").update(data).eq("id", int(tid)).execute()
        row = (
            _sb().table("storage_tarifas").select("*").eq("id", int(tid)).limit(1).execute().data
            or [None]
        )[0]
    else:
        row = (_sb().table("storage_tarifas").insert(data).execute().data or [None])[0]
    if not row:
        raise RuntimeError("No se pudo guardar la tarifa")
    row["capacidad_human"] = format_bytes(row.get("capacidad_bytes"))
    return row


def delete_tarifa(tarifa_id: int) -> None:
    if not schema_available(force=True):
        raise RuntimeError("Esquema storage_quota no disponible")
    # Desasignar contratos que la usan
    _sb().table("contrato_storage_uso").update({"tarifa_id": None}).eq(
        "tarifa_id", int(tarifa_id)
    ).execute()
    _sb().table("storage_tarifas").delete().eq("id", int(tarifa_id)).execute()


def _ensure_uso_row(contrato_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("contrato_storage_uso")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    inserted = (
        sb.table("contrato_storage_uso")
        .upsert({"contrato_id": int(contrato_id)}, on_conflict="contrato_id")
        .execute()
        .data
        or []
    )
    if inserted:
        return inserted[0]
    rows = (
        sb.table("contrato_storage_uso")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {
        "contrato_id": int(contrato_id),
        "bytes_fotos": 0,
        "bytes_documentos": 0,
        "bytes_otros": 0,
        "bytes_total": 0,
        "tarifa_id": None,
        "limite_override_bytes": None,
    }


def get_contrato_usage(contrato_id: int) -> dict:
    """Uso + límite efectivo + estado para un contrato."""
    cfg = get_config()
    umbral = int(cfg.get("umbral_gratuito_bytes") or DEFAULT_UMBRAL_GRATUITO_BYTES)
    if not cfg.get("schema_ready"):
        return {
            "contrato_id": int(contrato_id),
            "bytes_fotos": 0,
            "bytes_documentos": 0,
            "bytes_otros": 0,
            "bytes_total": 0,
            "limit_bytes": umbral,
            "umbral_gratuito_bytes": umbral,
            "tarifa_id": None,
            "tarifa_nombre": None,
            "limite_override_bytes": None,
            "dentro_limite": True,
            "pct_usado": 0.0,
            "schema_ready": False,
            "used_human": format_bytes(0),
            "limit_human": format_bytes(umbral),
        }

    uso = _ensure_uso_row(int(contrato_id))
    tarifa = None
    tid = uso.get("tarifa_id")
    if tid:
        tarifa = (
            _sb().table("storage_tarifas").select("*").eq("id", int(tid)).limit(1).execute().data
            or [None]
        )[0]

    limit = resolve_limite_bytes(
        umbral_gratuito_bytes=umbral,
        tarifa_capacidad_bytes=int(tarifa["capacidad_bytes"]) if tarifa else None,
        limite_override_bytes=(
            int(uso["limite_override_bytes"])
            if uso.get("limite_override_bytes") is not None
            else None
        ),
    )
    used = int(uso.get("bytes_total") or 0)
    fotos = int(uso.get("bytes_fotos") or 0)
    docs = int(uso.get("bytes_documentos") or 0)
    otros = int(uso.get("bytes_otros") or 0)
    pct = (100.0 * used / limit) if limit > 0 else (100.0 if used > 0 else 0.0)
    return {
        "contrato_id": int(contrato_id),
        "bytes_fotos": fotos,
        "bytes_documentos": docs,
        "bytes_otros": otros,
        "bytes_total": used,
        "limit_bytes": limit,
        "umbral_gratuito_bytes": umbral,
        "tarifa_id": int(tid) if tid else None,
        "tarifa_nombre": (tarifa or {}).get("nombre"),
        "tarifa_capacidad_bytes": int(tarifa["capacidad_bytes"]) if tarifa else None,
        "limite_override_bytes": (
            int(uso["limite_override_bytes"])
            if uso.get("limite_override_bytes") is not None
            else None
        ),
        "dentro_limite": used <= limit,
        "pct_usado": round(pct, 2),
        "schema_ready": True,
        "used_human": format_bytes(used),
        "limit_human": format_bytes(limit),
        "fotos_human": format_bytes(fotos),
        "documentos_human": format_bytes(docs),
        "otros_human": format_bytes(otros),
        "updated_at": uso.get("updated_at"),
    }


def assign_contrato_plan(
    contrato_id: int,
    *,
    tarifa_id: Optional[int] = None,
    limite_override_bytes: Optional[int] = None,
    clear_override: bool = False,
) -> dict:
    if not schema_available(force=True):
        raise RuntimeError("Esquema storage_quota no disponible")
    uso = _ensure_uso_row(int(contrato_id))
    patch: dict[str, Any] = {}
    if tarifa_id is not None:
        if int(tarifa_id) <= 0:
            patch["tarifa_id"] = None
        else:
            rows = (
                _sb()
                .table("storage_tarifas")
                .select("id")
                .eq("id", int(tarifa_id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if not rows:
                raise ValueError("Tarifa no encontrada")
            patch["tarifa_id"] = int(tarifa_id)
    if clear_override:
        patch["limite_override_bytes"] = None
    elif limite_override_bytes is not None:
        if int(limite_override_bytes) < 0:
            raise ValueError("limite_override_bytes debe ser >= 0")
        patch["limite_override_bytes"] = int(limite_override_bytes)

    if patch:
        from datetime import datetime, timezone

        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        _sb().table("contrato_storage_uso").update(patch).eq(
            "contrato_id", int(contrato_id)
        ).execute()
    return get_contrato_usage(int(contrato_id))


def list_contratos_usage() -> list[dict]:
    """Resumen de uso para el panel de Jorge."""
    if not schema_available():
        return []
    cfg = get_config()
    umbral = int(cfg.get("umbral_gratuito_bytes") or DEFAULT_UMBRAL_GRATUITO_BYTES)
    contratos = (
        _sb()
        .table("contratos")
        .select("id, numero, objeto, contratista")
        .order("id")
        .execute()
        .data
        or []
    )
    usos = {
        int(r["contrato_id"]): r
        for r in (_sb().table("contrato_storage_uso").select("*").execute().data or [])
        if r.get("contrato_id") is not None
    }
    tarifas = {
        int(t["id"]): t
        for t in (_sb().table("storage_tarifas").select("*").execute().data or [])
        if t.get("id") is not None
    }
    out = []
    for c in contratos:
        cid = int(c["id"])
        uso = usos.get(cid) or {}
        tid = uso.get("tarifa_id")
        tarifa = tarifas.get(int(tid)) if tid else None
        limit = resolve_limite_bytes(
            umbral_gratuito_bytes=umbral,
            tarifa_capacidad_bytes=int(tarifa["capacidad_bytes"]) if tarifa else None,
            limite_override_bytes=(
                int(uso["limite_override_bytes"])
                if uso.get("limite_override_bytes") is not None
                else None
            ),
        )
        used = int(uso.get("bytes_total") or 0)
        fotos = int(uso.get("bytes_fotos") or 0)
        docs = int(uso.get("bytes_documentos") or 0)
        otros = int(uso.get("bytes_otros") or 0)
        pct = (100.0 * used / limit) if limit > 0 else (100.0 if used > 0 else 0.0)
        out.append(
            {
                "contrato_id": cid,
                "numero": c.get("numero"),
                "objeto": c.get("objeto"),
                "contratista": c.get("contratista"),
                "bytes_fotos": fotos,
                "bytes_documentos": docs,
                "bytes_otros": otros,
                "bytes_total": used,
                "limit_bytes": limit,
                "umbral_gratuito_bytes": umbral,
                "tarifa_id": int(tid) if tid else None,
                "tarifa_nombre": (tarifa or {}).get("nombre"),
                "limite_override_bytes": (
                    int(uso["limite_override_bytes"])
                    if uso.get("limite_override_bytes") is not None
                    else None
                ),
                "dentro_limite": used <= limit,
                "pct_usado": round(pct, 2),
                "used_human": format_bytes(used),
                "limit_human": format_bytes(limit),
                "fotos_human": format_bytes(fotos),
                "documentos_human": format_bytes(docs),
                "otros_human": format_bytes(otros),
            }
        )
    out.sort(key=lambda r: (-r["bytes_total"], r["contrato_id"]))
    return out


def assert_can_upload(contrato_id: int, additional_bytes: int) -> dict:
    """
    Verifica cupo. Si el esquema no existe, permite (fail-open) y loguea.
    Lanza StorageQuotaExceeded si no hay cupo.
    """
    add = max(0, int(additional_bytes or 0))
    if add <= 0:
        return get_contrato_usage(int(contrato_id))
    if not schema_available():
        return get_contrato_usage(int(contrato_id))

    info = get_contrato_usage(int(contrato_id))
    used = int(info["bytes_total"])
    limit = int(info["limit_bytes"])
    if used + add > limit:
        raise StorageQuotaExceeded(
            build_quota_detail(
                contrato_id=int(contrato_id),
                used_bytes=used,
                limit_bytes=limit,
                needed_bytes=add,
                bytes_fotos=info["bytes_fotos"],
                bytes_documentos=info["bytes_documentos"],
                bytes_otros=info["bytes_otros"],
                plan_nombre=info.get("tarifa_nombre"),
            )
        )
    return info


def adjust_usage(
    contrato_id: int,
    *,
    tipo: str,
    delta_bytes: int,
) -> Optional[dict]:
    """Ajusta contadores. delta puede ser negativo (borrado)."""
    if not contrato_id or int(contrato_id) <= 0:
        return None
    if not schema_available():
        return None
    t = classify_storage_tipo(hint=tipo)
    d = int(delta_bytes or 0)
    if d == 0:
        return get_contrato_usage(int(contrato_id))

    df = dd = do = 0
    if t == TIPO_FOTOS:
        df = d
    elif t == TIPO_DOCUMENTOS:
        dd = d
    else:
        do = d

    try:
        res = _sb().rpc(
            "storage_adjust_uso",
            {
                "p_contrato_id": int(contrato_id),
                "p_delta_fotos": df,
                "p_delta_documentos": dd,
                "p_delta_otros": do,
            },
        ).execute()
        _ = res
    except Exception as exc:
        _log.warning(
            "RPC storage_adjust_uso falló (%s); fallback read-modify-write", exc
        )
        uso = _ensure_uso_row(int(contrato_id))
        fotos = max(0, int(uso.get("bytes_fotos") or 0) + df)
        docs = max(0, int(uso.get("bytes_documentos") or 0) + dd)
        otros = max(0, int(uso.get("bytes_otros") or 0) + do)
        from datetime import datetime, timezone

        _sb().table("contrato_storage_uso").update(
            {
                "bytes_fotos": fotos,
                "bytes_documentos": docs,
                "bytes_otros": otros,
                "bytes_total": fotos + docs + otros,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("contrato_id", int(contrato_id)).execute()

    return get_contrato_usage(int(contrato_id))


def record_upload(
    contrato_id: Optional[int],
    size_bytes: int,
    *,
    tipo: Optional[str] = None,
    content_type: Optional[str] = None,
    blob_path: Optional[str] = None,
    replaced_old_bytes: int = 0,
) -> Optional[dict]:
    """Registra una carga (o reemplazo: delta = new - old)."""
    cid = int(contrato_id) if contrato_id else infer_contrato_id_from_path(blob_path)
    if not cid:
        return None
    t = classify_storage_tipo(content_type=content_type, blob_path=blob_path, hint=tipo)
    delta = int(size_bytes or 0) - max(0, int(replaced_old_bytes or 0))
    if delta == 0:
        return get_contrato_usage(cid) if schema_available() else None
    return adjust_usage(cid, tipo=t, delta_bytes=delta)


def record_delete(
    contrato_id: Optional[int],
    size_bytes: int,
    *,
    tipo: Optional[str] = None,
    content_type: Optional[str] = None,
    blob_path: Optional[str] = None,
) -> Optional[dict]:
    cid = int(contrato_id) if contrato_id else infer_contrato_id_from_path(blob_path)
    if not cid:
        return None
    t = classify_storage_tipo(content_type=content_type, blob_path=blob_path, hint=tipo)
    return adjust_usage(cid, tipo=t, delta_bytes=-max(0, int(size_bytes or 0)))


def raise_http_if_quota_exceeded(exc: BaseException) -> None:
    if isinstance(exc, StorageQuotaExceeded):
        raise HTTPException(status_code=413, detail=exc.detail) from exc


def guard_upload(
    contrato_id: Optional[int],
    size_bytes: int,
    *,
    blob_path: Optional[str] = None,
    replaced_old_bytes: int = 0,
) -> None:
    """Pre-check antes de subir. Lanza HTTPException 413 si no hay cupo."""
    cid = int(contrato_id) if contrato_id else infer_contrato_id_from_path(blob_path)
    if not cid:
        return
    net = max(0, int(size_bytes or 0) - max(0, int(replaced_old_bytes or 0)))
    try:
        assert_can_upload(cid, net)
    except StorageQuotaExceeded as exc:
        raise HTTPException(status_code=413, detail=exc.detail) from exc
