"""
Papelera de presupuesto: purga automática (>N días) y eliminación definitiva.

La baja lógica usa ``dado_de_baja``; ``dado_de_baja_at`` marca el ingreso a papelera
(migración ``migration_presupuesto_dado_de_baja_at.sql``).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence

_log = logging.getLogger("claracore.presupuesto.papelera")

DIAS_PURGA_PAPELERA = 30
LOTE_PURGA = 500


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def umbral_purga(dias: int = DIAS_PURGA_PAPELERA) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(1, int(dias)))


def _parse_ts(val: Any) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    s = str(val).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def edad_en_papelera_dias(row: dict, *, ahora: Optional[datetime] = None) -> Optional[float]:
    """Días desde ingreso a papelera (dado_de_baja_at → updated_at → created_at)."""
    now = ahora or datetime.now(timezone.utc)
    ts = (
        _parse_ts(row.get("dado_de_baja_at"))
        or _parse_ts(row.get("updated_at"))
        or _parse_ts(row.get("created_at"))
    )
    if not ts:
        return None
    return max(0.0, (now - ts).total_seconds() / 86400.0)


def payload_marcar_baja() -> Dict[str, Any]:
    return {
        "dado_de_baja": True,
        "dado_de_baja_at": utc_now_iso(),
        "updated_at": "now()",
    }


def payload_restaurar() -> Dict[str, Any]:
    return {
        "dado_de_baja": False,
        "dado_de_baja_at": None,
        "updated_at": "now()",
    }


def aplicar_update_baja(sb, item_id: int) -> None:
    """Marca baja; si la columna dado_de_baja_at aún no existe, reintenta sin ella."""
    try:
        sb.table("presupuesto").update(payload_marcar_baja()).eq("id", item_id).execute()
        return
    except Exception as ex:
        msg = str(ex).lower()
        if "dado_de_baja_at" not in msg and "42703" not in msg:
            raise
    sb.table("presupuesto").update(
        {"dado_de_baja": True, "updated_at": "now()"}
    ).eq("id", item_id).execute()


def aplicar_update_restaurar(sb, item_id: int) -> None:
    try:
        sb.table("presupuesto").update(payload_restaurar()).eq("id", item_id).execute()
        return
    except Exception as ex:
        msg = str(ex).lower()
        if "dado_de_baja_at" not in msg and "42703" not in msg:
            raise
    sb.table("presupuesto").update(
        {"dado_de_baja": False, "updated_at": "now()"}
    ).eq("id", item_id).execute()


def _limpiar_dependencias_antes_delete(sb, ids: Sequence[int]) -> None:
    id_list = [int(x) for x in ids if x is not None]
    if not id_list:
        return
    # Comentarios del módulo presupuesto (si existen)
    for col_tabla in (
        ("comentarios", "presupuesto_id"),
    ):
        tabla, col = col_tabla
        try:
            # Borrar por lotes pequeños
            for i in range(0, len(id_list), 80):
                chunk = id_list[i : i + 80]
                sb.table(tabla).delete().in_(col, chunk).execute()
        except Exception:
            _log.debug("cleanup %s.%s ignorado", tabla, col, exc_info=True)


def eliminar_definitivo_ids(sb, ids: Sequence[int]) -> Dict[str, Any]:
    """
    Borra filas de ``presupuesto`` que estén en papelera (dado_de_baja=true).
    No toca registros activos. Retorna {eliminados, omitidos, errores}.
    """
    id_list = sorted({int(x) for x in ids if x is not None})
    if not id_list:
        return {"eliminados": [], "omitidos": [], "errores": []}

    eliminados: List[int] = []
    omitidos: List[Dict[str, Any]] = []
    errores: List[Dict[str, Any]] = []

    # Verificar estado
    rows: List[dict] = []
    for i in range(0, len(id_list), 100):
        chunk = id_list[i : i + 100]
        try:
            res = (
                sb.table("presupuesto")
                .select("id, dado_de_baja, contrato_id")
                .in_("id", chunk)
                .execute()
            )
            rows.extend(res.data or [])
        except Exception as ex:
            for uid in chunk:
                errores.append({"id": uid, "detail": str(ex)})
            return {"eliminados": eliminados, "omitidos": omitidos, "errores": errores}

    by_id = {int(r["id"]): r for r in rows if r.get("id") is not None}
    a_borrar: List[int] = []
    for uid in id_list:
        r = by_id.get(uid)
        if not r:
            omitidos.append({"id": uid, "motivo": "no_encontrado"})
            continue
        if not r.get("dado_de_baja"):
            omitidos.append({"id": uid, "motivo": "no_en_papelera"})
            continue
        a_borrar.append(uid)

    if not a_borrar:
        return {"eliminados": eliminados, "omitidos": omitidos, "errores": errores}

    _limpiar_dependencias_antes_delete(sb, a_borrar)

    for i in range(0, len(a_borrar), 80):
        chunk = a_borrar[i : i + 80]
        try:
            sb.table("presupuesto").delete().in_("id", chunk).eq("dado_de_baja", True).execute()
            eliminados.extend(chunk)
        except Exception as ex:
            msg = str(ex)
            # Fallback uno a uno si el lote falla (FK, etc.)
            for uid in chunk:
                try:
                    sb.table("presupuesto").delete().eq("id", uid).eq("dado_de_baja", True).execute()
                    eliminados.append(uid)
                except Exception as ex2:
                    errores.append({"id": uid, "detail": str(ex2) or msg})

    return {"eliminados": eliminados, "omitidos": omitidos, "errores": errores}


def purgar_papelera_vencida(
    sb,
    *,
    dias: int = DIAS_PURGA_PAPELERA,
    lote: int = LOTE_PURGA,
    max_lotes: int = 40,
    contrato_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Elimina registros en papelera con antigüedad > ``dias``.
    Preferencia: filtro por ``dado_de_baja_at``; si la columna no existe, usa ``updated_at``.
    """
    limite = umbral_purga(dias)
    limite_iso = limite.isoformat()
    total_eliminados = 0
    lotes = 0
    errores: List[str] = []
    modo = "dado_de_baja_at"

    while lotes < max_lotes:
        lotes += 1
        try:
            q = (
                sb.table("presupuesto")
                .select("id")
                .eq("dado_de_baja", True)
                .lt("dado_de_baja_at", limite_iso)
                .order("dado_de_baja_at")
                .limit(lote)
            )
            if contrato_id is not None:
                q = q.eq("contrato_id", int(contrato_id))
            batch = q.execute().data or []
        except Exception as ex:
            msg = str(ex).lower()
            if "dado_de_baja_at" in msg or "42703" in msg:
                modo = "updated_at"
                try:
                    q = (
                        sb.table("presupuesto")
                        .select("id")
                        .eq("dado_de_baja", True)
                        .lt("updated_at", limite_iso)
                        .order("updated_at")
                        .limit(lote)
                    )
                    if contrato_id is not None:
                        q = q.eq("contrato_id", int(contrato_id))
                    batch = q.execute().data or []
                except Exception as ex2:
                    errores.append(str(ex2))
                    break
            else:
                errores.append(str(ex))
                break

        if not batch:
            break
        ids = [int(r["id"]) for r in batch if r.get("id") is not None]
        result = eliminar_definitivo_ids(sb, ids)
        total_eliminados += len(result.get("eliminados") or [])
        if result.get("errores"):
            errores.extend(
                f"#{e.get('id')}: {e.get('detail')}" for e in result["errores"][:20]
            )
        if len(ids) < lote:
            break

    return {
        "ok": True,
        "dias": dias,
        "umbral": limite_iso,
        "modo_fecha": modo,
        "eliminados": total_eliminados,
        "lotes": lotes,
        "errores": errores[:50],
    }
