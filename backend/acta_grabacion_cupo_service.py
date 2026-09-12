"""
Cupo diario de grabación de reuniones (Actas).

Regla de producto:
  - 180 minutos por contrato y día calendario America/Bogota
  - Compartido entre todos los usuarios del contrato
  - Sin almacenamiento persistente de audio (solo consumo + auditoría de sesión)
  - Claim atómico (RPC) para que sesiones concurrentes no superen el límite
"""
from __future__ import annotations

import logging
import threading
from datetime import date, datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException

_log = logging.getLogger("claracore.acta_grabacion_cupo")

BOGOTA = ZoneInfo("America/Bogota")
LIMITE_MINUTOS = 180
LIMITE_SEGUNDOS = LIMITE_MINUTOS * 60  # 10800
MAX_CLAIM_SEGUNDOS = 120  # heartbeat razonable (UI enviará ~15–30 s)

# Fallback in-process (tests / RPC ausente). No sustituye el RPC en multi-worker.
_FALLBACK_LOCK = threading.Lock()


def fecha_bogota(now: Optional[datetime] = None) -> date:
    dt = now or datetime.now(BOGOTA)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BOGOTA)
    return dt.astimezone(BOGOTA).date()


def remaining_hoy(segundos_consumidos: int, limite: int = LIMITE_SEGUNDOS) -> int:
    return max(0, int(limite) - max(0, int(segundos_consumidos or 0)))


def _payload(
    segundos_consumidos: int,
    fecha: date,
    *,
    claimed: int = 0,
    sesion: Optional[dict] = None,
    debe_cerrar: bool = False,
) -> dict:
    consumidos = max(0, int(segundos_consumidos or 0))
    restantes = remaining_hoy(consumidos)
    return {
        "fecha": str(fecha),
        "timezone": "America/Bogota",
        "limite_minutos": LIMITE_MINUTOS,
        "limite_segundos": LIMITE_SEGUNDOS,
        "segundos_consumidos": consumidos,
        "segundos_restantes": restantes,
        "minutos_consumidos": round(consumidos / 60.0, 2),
        "minutos_restantes": round(restantes / 60.0, 2),
        "permitido": restantes > 0,
        "blocked": restantes <= 0,
        "claimed": max(0, int(claimed or 0)),
        "debe_cerrar": bool(debe_cerrar) or restantes <= 0,
        "sesion": sesion,
    }


def apply_claim(
    consumidos: int,
    pedir: int,
    limite: int = LIMITE_SEGUNDOS,
) -> tuple[int, int, int]:
    """
    Aplica un claim (permite parcial).
    Retorna (nuevos_consumidos, claimed, restantes).
    """
    c = max(0, int(consumidos or 0))
    p = max(0, int(pedir or 0))
    lim = max(0, int(limite))
    restantes = max(0, lim - c)
    claimed = min(p, restantes)
    nuevo = c + claimed
    return nuevo, claimed, max(0, lim - nuevo)


def _leer_consumidos(sb: Any, contrato_id: int, fecha: date) -> int:
    try:
        rows = (
            sb.table("acta_grabacion_cupo_diario")
            .select("segundos_consumidos")
            .eq("contrato_id", int(contrato_id))
            .eq("fecha", str(fecha))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("acta_grabacion_cupo_diario SELECT: %s", exc)
        return 0
    if not rows:
        return 0
    return max(0, int(rows[0].get("segundos_consumidos") or 0))


def leer_cupo(sb: Any, contrato_id: int, now: Optional[datetime] = None) -> dict:
    fecha = fecha_bogota(now)
    consumidos = _leer_consumidos(sb, int(contrato_id), fecha)
    return _payload(consumidos, fecha)


def _claim_via_rpc(sb: Any, contrato_id: int, fecha: date, segundos: int) -> dict:
    res = sb.rpc(
        "acta_grabacion_claim_segundos",
        {
            "p_contrato_id": int(contrato_id),
            "p_fecha": str(fecha),
            "p_segundos": int(segundos),
            "p_limite": LIMITE_SEGUNDOS,
        },
    ).execute()
    data = res.data
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        raise RuntimeError("RPC acta_grabacion_claim_segundos sin payload")
    return data


def _claim_via_fallback(sb: Any, contrato_id: int, fecha: date, segundos: int) -> dict:
    """Read-modify-write con lock de proceso (tests / degradación)."""
    with _FALLBACK_LOCK:
        fecha_s = str(fecha)
        cid = int(contrato_id)
        rows = (
            sb.table("acta_grabacion_cupo_diario")
            .select("segundos_consumidos")
            .eq("contrato_id", cid)
            .eq("fecha", fecha_s)
            .limit(1)
            .execute()
            .data
            or []
        )
        consumidos = int(rows[0]["segundos_consumidos"]) if rows else 0
        nuevo, claimed, restantes = apply_claim(consumidos, segundos)
        now_iso = datetime.now(BOGOTA).isoformat()
        if rows:
            sb.table("acta_grabacion_cupo_diario").update(
                {"segundos_consumidos": nuevo, "updated_at": now_iso}
            ).eq("contrato_id", cid).eq("fecha", fecha_s).execute()
        else:
            sb.table("acta_grabacion_cupo_diario").insert(
                {
                    "contrato_id": cid,
                    "fecha": fecha_s,
                    "segundos_consumidos": nuevo,
                    "updated_at": now_iso,
                }
            ).execute()
        return {
            "ok": claimed > 0 or int(segundos) == 0,
            "claimed": claimed,
            "segundos_consumidos": nuevo,
            "segundos_restantes": restantes,
            "limite_segundos": LIMITE_SEGUNDOS,
            "fecha": fecha_s,
        }


def claim_segundos(
    sb: Any,
    contrato_id: int,
    segundos: int,
    *,
    now: Optional[datetime] = None,
) -> dict:
    fecha = fecha_bogota(now)
    pedir = max(0, min(int(segundos or 0), MAX_CLAIM_SEGUNDOS))
    try:
        raw = _claim_via_rpc(sb, int(contrato_id), fecha, pedir)
    except Exception as exc:
        _log.warning(
            "RPC acta_grabacion_claim_segundos falló (%s); usando fallback",
            exc,
        )
        raw = _claim_via_fallback(sb, int(contrato_id), fecha, pedir)

    consumidos = int(raw.get("segundos_consumidos") or 0)
    claimed = int(raw.get("claimed") or 0)
    restantes = int(
        raw.get("segundos_restantes")
        if raw.get("segundos_restantes") is not None
        else remaining_hoy(consumidos)
    )
    return _payload(
        consumidos,
        fecha,
        claimed=claimed,
        debe_cerrar=restantes <= 0 or (pedir > 0 and claimed < pedir),
    )


def _sesion_row(sb: Any, sesion_id: int) -> Optional[dict]:
    rows = (
        sb.table("acta_grabacion_sesion")
        .select("*")
        .eq("id", int(sesion_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _abandonar_sesiones_activas(
    sb: Any,
    contrato_id: int,
    usuario_id: int,
) -> None:
    """Cierra sesiones huérfanas del mismo usuario/contrato sin reclamar más cupo."""
    now_iso = datetime.now(BOGOTA).isoformat()
    try:
        sb.table("acta_grabacion_sesion").update(
            {
                "estado": "abandonada",
                "motivo_cierre": "nueva_sesion",
                "finalizada_en": now_iso,
                "updated_at": now_iso,
            }
        ).eq("contrato_id", int(contrato_id)).eq(
            "usuario_id", int(usuario_id)
        ).eq("estado", "activa").execute()
    except Exception as exc:
        _log.warning("abandonar sesiones activas: %s", exc)


def iniciar_sesion(
    sb: Any,
    contrato_id: int,
    usuario_id: int,
    *,
    now: Optional[datetime] = None,
) -> dict:
    """
    Abre una sesión de grabación si queda cupo.
    No reserva minutos por adelantado: el consumo se hace con reclamar_segundos.
    """
    fecha = fecha_bogota(now)
    cupo = leer_cupo(sb, int(contrato_id), now=now)
    if not cupo["permitido"]:
        raise HTTPException(
            status_code=429,
            detail=(
                "El cupo diario de grabación de este contrato está agotado "
                f"({LIMITE_MINUTOS} minutos). Podrá grabar de nuevo mañana."
            ),
        )

    _abandonar_sesiones_activas(sb, int(contrato_id), int(usuario_id))
    now_iso = (now or datetime.now(BOGOTA)).isoformat()
    row = {
        "contrato_id": int(contrato_id),
        "usuario_id": int(usuario_id),
        "fecha": str(fecha),
        "iniciada_en": now_iso,
        "ultimo_claim_en": None,
        "segundos_consumidos": 0,
        "estado": "activa",
        "motivo_cierre": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        inserted = sb.table("acta_grabacion_sesion").insert(row).execute().data or []
    except Exception as exc:
        _log.error("acta_grabacion_sesion INSERT: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="No se pudo iniciar la sesión de grabación.",
        ) from exc

    sesion = inserted[0] if inserted else row
    if not sesion.get("id"):
        # FakeSb / insert sin RETURNING: buscar la última activa
        try:
            found = (
                sb.table("acta_grabacion_sesion")
                .select("*")
                .eq("contrato_id", int(contrato_id))
                .eq("usuario_id", int(usuario_id))
                .eq("estado", "activa")
                .limit(1)
                .execute()
                .data
                or []
            )
            if found:
                sesion = found[0]
        except Exception:
            pass

    out = _payload(cupo["segundos_consumidos"], fecha, sesion=_public_sesion(sesion))
    out["debe_cerrar"] = False
    return out


def _public_sesion(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    return {
        "id": row.get("id"),
        "contrato_id": row.get("contrato_id"),
        "usuario_id": row.get("usuario_id"),
        "fecha": row.get("fecha"),
        "estado": row.get("estado"),
        "segundos_consumidos": int(row.get("segundos_consumidos") or 0),
        "iniciada_en": row.get("iniciada_en"),
        "finalizada_en": row.get("finalizada_en"),
        "motivo_cierre": row.get("motivo_cierre"),
    }


def _assert_sesion_propia(
    sesion: dict,
    contrato_id: int,
    usuario_id: int,
) -> None:
    if int(sesion.get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if int(sesion.get("usuario_id") or 0) != int(usuario_id):
        raise HTTPException(status_code=403, detail="Sesión de otro usuario.")


def reclamar_segundos(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    segundos: int,
    *,
    now: Optional[datetime] = None,
) -> dict:
    sesion = _sesion_row(sb, int(sesion_id))
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_propia(sesion, int(contrato_id), int(usuario_id))
    if sesion.get("estado") != "activa":
        cupo = leer_cupo(sb, int(contrato_id), now=now)
        cupo["sesion"] = _public_sesion(sesion)
        cupo["debe_cerrar"] = True
        cupo["claimed"] = 0
        return cupo

    pedir = max(0, min(int(segundos or 0), MAX_CLAIM_SEGUNDOS))
    if pedir <= 0:
        cupo = leer_cupo(sb, int(contrato_id), now=now)
        cupo["sesion"] = _public_sesion(sesion)
        return cupo

    # Si la sesión empezó ayer (Bogotá), el claim va al día actual (regla diaria).
    claim = claim_segundos(sb, int(contrato_id), pedir, now=now)
    now_iso = (now or datetime.now(BOGOTA)).isoformat()
    nuevos_sesion = int(sesion.get("segundos_consumidos") or 0) + int(claim["claimed"])
    patch = {
        "segundos_consumidos": nuevos_sesion,
        "ultimo_claim_en": now_iso,
        "updated_at": now_iso,
    }
    debe_cerrar = bool(claim["debe_cerrar"]) or claim["claimed"] < pedir
    if debe_cerrar:
        patch["estado"] = "agotada"
        patch["motivo_cierre"] = "cupo_agotado"
        patch["finalizada_en"] = now_iso

    try:
        sb.table("acta_grabacion_sesion").update(patch).eq(
            "id", int(sesion_id)
        ).execute()
    except Exception as exc:
        _log.error("acta_grabacion_sesion UPDATE claim: %s", exc)

    sesion = {**sesion, **patch}
    claim["sesion"] = _public_sesion(sesion)
    claim["debe_cerrar"] = debe_cerrar or claim["segundos_restantes"] <= 0
    return claim


def finalizar_sesion(
    sb: Any,
    contrato_id: int,
    sesion_id: int,
    usuario_id: int,
    *,
    segundos_adicionales: int = 0,
    motivo: Optional[str] = None,
    now: Optional[datetime] = None,
) -> dict:
    sesion = _sesion_row(sb, int(sesion_id))
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    _assert_sesion_propia(sesion, int(contrato_id), int(usuario_id))

    claimed_extra = 0
    if sesion.get("estado") == "activa" and int(segundos_adicionales or 0) > 0:
        claim = claim_segundos(
            sb, int(contrato_id), int(segundos_adicionales), now=now
        )
        claimed_extra = int(claim["claimed"])
    else:
        claim = leer_cupo(sb, int(contrato_id), now=now)

    now_iso = (now or datetime.now(BOGOTA)).isoformat()
    estado_final = sesion.get("estado") or "finalizada"
    motivo_final = sesion.get("motivo_cierre")
    if estado_final == "activa":
        estado_final = "agotada" if claim.get("blocked") and claimed_extra > 0 else "finalizada"
        if motivo:
            motivo_final = str(motivo)[:80]
        elif estado_final == "agotada":
            motivo_final = "cupo_agotado"
        else:
            motivo_final = "usuario"

    patch = {
        "segundos_consumidos": int(sesion.get("segundos_consumidos") or 0) + claimed_extra,
        "estado": estado_final if estado_final != "activa" else "finalizada",
        "motivo_cierre": motivo_final,
        "finalizada_en": sesion.get("finalizada_en") or now_iso,
        "updated_at": now_iso,
    }
    if claimed_extra:
        patch["ultimo_claim_en"] = now_iso

    try:
        sb.table("acta_grabacion_sesion").update(patch).eq(
            "id", int(sesion_id)
        ).execute()
    except Exception as exc:
        _log.error("acta_grabacion_sesion FINALIZAR: %s", exc)

    sesion = {**sesion, **patch}
    out = _payload(
        claim["segundos_consumidos"],
        fecha_bogota(now),
        claimed=claimed_extra,
        sesion=_public_sesion(sesion),
        debe_cerrar=True,
    )
    return out
