"""
Modo Retroactivo — habilitaciones temporales y validación de fechas del hecho.

fecha_entrada / fecha_hora_salida = fecha del hecho.
created_at = fecha de registro (automática).
Marca visible mientras es_retroactivo y retroactivo_validado_at IS NULL.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from almacen_datetime import BOGOTA, parse_timestamp
from almacen_permissions import (
    es_contratista_gerencial,
    es_desarrollador_almacen,
    rol_excluido_almacen,
    tiene_permiso_almacen,
)
from entradas_salidas_permissions import tiene_permiso_entradas_salidas

_log = logging.getLogger("claracore.almacen.retroactivo")

AVISO_HORAS = 24
LOOKBACK_ANIOS_DEFAULT = 10


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today_bogota() -> date:
    return datetime.now(BOGOTA).date()


def _as_bool(val) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() in ("1", "true", "si", "sí", "yes", "t")


def marca_retroactivo_visible(row: Optional[dict]) -> bool:
    if not row:
        return False
    if not _as_bool(row.get("es_retroactivo")):
        return False
    return row.get("retroactivo_validado_at") in (None, "", False)


def puede_habilitar_modo_retroactivo(current_user) -> bool:
    """Validar en Almacén + Contratista Gerencial (o desarrollador)."""
    if rol_excluido_almacen(current_user):
        return False
    if es_desarrollador_almacen(current_user):
        return True
    if not es_contratista_gerencial(current_user):
        return False
    return tiene_permiso_almacen(current_user, "validar")


def require_habilitar_modo_retroactivo(current_user) -> None:
    if puede_habilitar_modo_retroactivo(current_user):
        return
    from fastapi import HTTPException
    raise HTTPException(
        status_code=403,
        detail=(
            "Solo quien tenga Validar en Almacén y rol Contratista Gerencial "
            "(o el desarrollador) puede habilitar el modo Retroactivo."
        ),
    )


def puede_registrar_retroactivo_flag(current_user) -> bool:
    """Crear o Editar en Entradas y Salidas (sin mirar aún la habilitación)."""
    if rol_excluido_almacen(current_user):
        return False
    if es_desarrollador_almacen(current_user):
        return True
    return bool(
        tiene_permiso_entradas_salidas(current_user, "crear")
        or tiene_permiso_entradas_salidas(current_user, "editar")
    )


def puede_validar_registros_retroactivos(current_user) -> bool:
    if rol_excluido_almacen(current_user):
        return False
    if es_desarrollador_almacen(current_user):
        return True
    return bool(tiene_permiso_entradas_salidas(current_user, "validar"))


def require_validar_registros_retroactivos(current_user) -> None:
    if puede_validar_registros_retroactivos(current_user):
        return
    from fastapi import HTTPException
    raise HTTPException(
        status_code=403,
        detail="Se requiere Validar en Entradas y Salidas para validar registros retroactivos.",
    )


def _parse_iso_dt(raw) -> Optional[datetime]:
    return parse_timestamp(raw)


def habilitacion_vigente(sb, contrato_id: int, usuario_id: int, *, ahora: Optional[datetime] = None) -> Optional[dict]:
    """Devuelve la habilitación vigente más cercana a vencer, o None."""
    now = ahora or _now_utc()
    try:
        rows = (
            sb.table("almacen_habilitacion_retroactivo")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("usuario_id", int(usuario_id))
            .is_("revocado_at", "null")
            .lte("desde", now.isoformat())
            .gte("hasta", now.isoformat())
            .order("hasta")
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("No se pudo leer habilitaciones retroactivas: %s", exc)
        return None
    if not rows:
        return None
    # Preferir la que vence más tarde (ventana activa más útil).
    rows_sorted = sorted(rows, key=lambda r: str(r.get("hasta") or ""), reverse=True)
    return rows_sorted[0]


def estado_retroactivo_usuario(sb, contrato_id: int, usuario_id: int, current_user=None) -> dict:
    hab = habilitacion_vigente(sb, contrato_id, usuario_id)
    puede_flag = puede_registrar_retroactivo_flag(current_user) if current_user is not None else True
    vigente = bool(hab) and puede_flag
    horas_restantes = None
    aviso_poco_tiempo = False
    if hab and hab.get("hasta"):
        hasta = _parse_iso_dt(hab["hasta"])
        if hasta:
            delta = hasta - _now_utc()
            horas_restantes = max(0.0, delta.total_seconds() / 3600.0)
            aviso_poco_tiempo = 0 < horas_restantes <= AVISO_HORAS
    return {
        "habilitado": vigente,
        "puede_usar_modo": vigente,
        "habilitacion": hab,
        "horas_restantes": horas_restantes,
        "aviso_poco_tiempo": aviso_poco_tiempo,
        "puede_habilitar": puede_habilitar_modo_retroactivo(current_user) if current_user else False,
        "puede_validar_retroactivos": puede_validar_registros_retroactivos(current_user) if current_user else False,
    }


def list_habilitaciones(sb, contrato_id: int, *, incluir_vencidas: bool = True) -> List[dict]:
    try:
        q = (
            sb.table("almacen_habilitacion_retroactivo")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .order("created_at", desc=True)
        )
        rows = q.execute().data or []
    except Exception as exc:
        _log.warning("list_habilitaciones: %s", exc)
        return []
    now = _now_utc()
    out = []
    for r in rows:
        r = dict(r)
        hasta = _parse_iso_dt(r.get("hasta"))
        rev = r.get("revocado_at")
        vigente = (not rev) and hasta is not None and hasta >= now and _parse_iso_dt(r.get("desde")) <= now
        r["vigente"] = vigente
        r["vencida"] = (not rev) and hasta is not None and hasta < now
        if not incluir_vencidas and (r["vencida"] or rev):
            continue
        out.append(r)
    return out


def crear_habilitacion(
    sb,
    contrato_id: int,
    *,
    usuario_ids: List[int],
    desde: str,
    hasta: str,
    motivo: Optional[str],
    habilitado_por: int,
) -> List[dict]:
    d0 = _parse_iso_dt(desde)
    d1 = _parse_iso_dt(hasta)
    if not d0 or not d1:
        raise ValueError("Indique desde y hasta con fecha y hora válidas.")
    if d1 <= d0:
        raise ValueError("La fecha «hasta» debe ser posterior a «desde».")
    if d1 <= _now_utc():
        raise ValueError("La ventana debe terminar en el futuro.")
    uids = sorted({int(u) for u in usuario_ids if u})
    if not uids:
        raise ValueError("Seleccione al menos un usuario.")
    created = []
    for uid in uids:
        row = {
            "contrato_id": int(contrato_id),
            "usuario_id": uid,
            "desde": d0.astimezone(timezone.utc).isoformat(),
            "hasta": d1.astimezone(timezone.utc).isoformat(),
            "motivo": (motivo or "").strip() or None,
            "habilitado_por": int(habilitado_por),
        }
        ins = sb.table("almacen_habilitacion_retroactivo").insert(row).execute().data
        if ins:
            created.append(ins[0])
    if not created:
        raise ValueError("No se pudo crear la habilitación.")
    return created


def ampliar_habilitacion(sb, contrato_id: int, hab_id: int, *, hasta: str, user_id: int) -> dict:
    d1 = _parse_iso_dt(hasta)
    if not d1:
        raise ValueError("Indique la nueva fecha «hasta».")
    rows = (
        sb.table("almacen_habilitacion_retroactivo")
        .select("*")
        .eq("id", int(hab_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Habilitación no encontrada.")
    hab = rows[0]
    if hab.get("revocado_at"):
        raise ValueError("La habilitación ya fue revocada.")
    prev_hasta = _parse_iso_dt(hab.get("hasta"))
    if prev_hasta and d1 <= prev_hasta:
        raise ValueError("La ampliación debe extender la fecha «hasta».")
    if d1 <= _now_utc():
        raise ValueError("La nueva fecha «hasta» debe ser futura.")
    upd = (
        sb.table("almacen_habilitacion_retroactivo")
        .update({
            "hasta": d1.astimezone(timezone.utc).isoformat(),
            "updated_at": _now_utc().isoformat(),
        })
        .eq("id", int(hab_id))
        .execute()
        .data
    )
    if not upd:
        raise ValueError("No se pudo ampliar la habilitación.")
    return upd[0]


def revocar_habilitacion(sb, contrato_id: int, hab_id: int, *, user_id: int) -> dict:
    rows = (
        sb.table("almacen_habilitacion_retroactivo")
        .select("*")
        .eq("id", int(hab_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Habilitación no encontrada.")
    if rows[0].get("revocado_at"):
        return rows[0]
    upd = (
        sb.table("almacen_habilitacion_retroactivo")
        .update({
            "revocado_at": _now_utc().isoformat(),
            "revocado_por": int(user_id),
            "updated_at": _now_utc().isoformat(),
        })
        .eq("id", int(hab_id))
        .execute()
        .data
    )
    return (upd or rows)[0]


def fecha_minima_contrato(sb, contrato_id: int) -> date:
    """Fecha mínima aceptable para el hecho. Usa created_at del contrato si existe."""
    try:
        rows = (
            sb.table("contratos")
            .select("created_at")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows and rows[0].get("created_at"):
            dt = _parse_iso_dt(rows[0]["created_at"])
            if dt:
                return dt.astimezone(BOGOTA).date()
    except Exception as exc:
        _log.warning("fecha_minima_contrato: %s", exc)
    return _today_bogota() - timedelta(days=365 * LOOKBACK_ANIOS_DEFAULT)


def parse_fecha_hecho_entrada(raw) -> date:
    if not raw:
        raise ValueError("En modo Retroactivo la fecha del hecho es obligatoria.")
    s = str(raw).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError as exc:
        raise ValueError("Fecha del hecho inválida. Use AAAA-MM-DD.") from exc


def assert_fecha_hecho_entrada(sb, contrato_id: int, fecha: date) -> None:
    hoy = _today_bogota()
    if fecha > hoy:
        raise ValueError("No se aceptan fechas futuras para el hecho.")
    minimo = fecha_minima_contrato(sb, contrato_id)
    if fecha < minimo:
        raise ValueError(
            f"La fecha del hecho no puede ser anterior al inicio del contrato ({minimo.isoformat()})."
        )


def assert_fecha_hecho_salida(sb, contrato_id: int, fecha_hora_iso: str) -> datetime:
    dt = _parse_iso_dt(fecha_hora_iso)
    if not dt:
        raise ValueError("En modo Retroactivo la fecha y hora del hecho son obligatorias.")
    ahora = _now_utc()
    if dt > ahora + timedelta(minutes=2):
        raise ValueError("No se aceptan fechas futuras para el hecho.")
    minimo = fecha_minima_contrato(sb, contrato_id)
    if dt.astimezone(BOGOTA).date() < minimo:
        raise ValueError(
            f"La fecha del hecho no puede ser anterior al inicio del contrato ({minimo.isoformat()})."
        )
    return dt


def assert_entrada_no_antes_de_oc(sb, oc_id: Optional[int], fecha_entrada: date) -> None:
    if not oc_id:
        return
    rows = (
        sb.table("almacen_orden_compra")
        .select("id, created_at, numero_oc")
        .eq("id", int(oc_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return
    oc = rows[0]
    dt = _parse_iso_dt(oc.get("created_at"))
    if not dt:
        return
    oc_day = dt.astimezone(BOGOTA).date()
    if fecha_entrada < oc_day:
        num = oc.get("numero_oc")
        raise ValueError(
            f"La fecha de llegada no puede ser anterior a la de la OC "
            f"#{num if num is not None else oc_id} ({oc_day.isoformat()})."
        )


def disponible_salida_as_of(
    sb,
    entrada_item_id: int,
    *,
    fecha_hora_corte: datetime,
    cantidad_recibida: float,
    excluir_salida_id: Optional[int] = None,
) -> float:
    """Disponible a la fecha del hecho: recibido − salidas hasta esa fecha + devoluciones."""
    corte = fecha_hora_corte.astimezone(timezone.utc).isoformat()
    salidas = (
        sb.table("almacen_salida")
        .select("id, cantidad_salida, fecha_hora_salida")
        .eq("entrada_item_id", int(entrada_item_id))
        .lte("fecha_hora_salida", corte)
        .execute()
        .data
        or []
    )
    total_sal = 0.0
    for s in salidas:
        if excluir_salida_id and int(s.get("id") or 0) == int(excluir_salida_id):
            continue
        total_sal += float(s.get("cantidad_salida") or 0)

    devoluciones = (
        sb.table("almacen_devolucion")
        .select("cantidad, fecha_hora_devolucion")
        .eq("entrada_item_id", int(entrada_item_id))
        .lte("fecha_hora_devolucion", corte)
        .execute()
        .data
        or []
    )
    total_dev = sum(float(d.get("cantidad") or 0) for d in devoluciones)
    return max(0.0, float(cantidad_recibida or 0) - total_sal + total_dev)


def assert_salida_coherente_con_entrada(
    sb,
    ent: dict,
    *,
    fecha_hora_salida: datetime,
    cantidad: float,
    entrada_item_id: int,
    cantidad_recibida: float,
) -> None:
    fe = ent.get("fecha_entrada")
    if fe:
        try:
            fe_d = date.fromisoformat(str(fe)[:10])
        except ValueError:
            fe_d = None
        if fe_d and fecha_hora_salida.astimezone(BOGOTA).date() < fe_d:
            raise ValueError(
                "La salida no puede tener fecha anterior a la entrada del mismo material. "
                "Registre primero la entrada con su fecha del hecho y luego la salida."
            )
    disp = disponible_salida_as_of(
        sb,
        entrada_item_id,
        fecha_hora_corte=fecha_hora_salida,
        cantidad_recibida=cantidad_recibida,
    )
    if cantidad > disp + 1e-9:
        raise ValueError(
            f"A la fecha del hecho solo hay disponible {disp} de este material "
            f"(recibido hasta esa fecha menos lo ya sacado). Máximo: {disp}."
        )


def resolver_flags_retroactivo_create(
    sb,
    contrato_id: int,
    user_id: int,
    body: dict,
    *,
    current_user=None,
) -> Tuple[bool, bool]:
    """
    Interpreta es_retroactivo / modo_retroactivo del body.
    Si pide retroactivo sin habilitación vigente → ValueError.
    """
    quiere = _as_bool(body.get("es_retroactivo")) or str(body.get("modo") or "").strip().lower() in (
        "retroactivo",
        "retro",
    )
    if not quiere:
        return False, _as_bool(body.get("fecha_aproximada"))
    if current_user is not None and not puede_registrar_retroactivo_flag(current_user):
        raise ValueError("No tiene permiso de Crear o Editar en Entradas y Salidas para modo Retroactivo.")
    hab = habilitacion_vigente(sb, contrato_id, user_id)
    if not hab:
        raise ValueError(
            "Su ventana de modo Retroactivo no está vigente o fue revocada. "
            "Solo puede registrar en modo Actualizado."
        )
    return True, _as_bool(body.get("fecha_aproximada"))


def patch_retroactivo_columns(row: dict, *, es_retro: bool, fecha_aprox: bool) -> dict:
    out = dict(row)
    out["es_retroactivo"] = bool(es_retro)
    out["fecha_aproximada"] = bool(fecha_aprox) if es_retro else False
    if es_retro:
        out["retroactivo_validado_at"] = None
        out["retroactivo_validado_por"] = None
    return out


def strip_retroactivo_unknown(exc: BaseException, row: dict) -> dict:
    """Si faltan columnas (migración pendiente), quita flags y reintenta el caller."""
    text = str(exc or "").lower()
    keys = ("es_retroactivo", "fecha_aproximada", "retroactivo_validado_at", "retroactivo_validado_por")
    if not any(k in text for k in keys) and "does not exist" not in text and "pgrst204" not in text:
        return row
    cleaned = dict(row)
    for k in keys:
        cleaned.pop(k, None)
    return cleaned


def contar_pendientes_validacion(sb, contrato_id: int) -> dict:
    n_ent = 0
    n_sal = 0
    try:
        ent = (
            sb.table("almacen_entrada")
            .select("id", count="exact")
            .eq("contrato_id", int(contrato_id))
            .eq("es_retroactivo", True)
            .is_("retroactivo_validado_at", "null")
            .execute()
        )
        n_ent = int(getattr(ent, "count", None) or len(ent.data or []))
    except Exception as exc:
        _log.warning("contar entradas retro: %s", exc)
    try:
        sal = (
            sb.table("almacen_salida")
            .select("id", count="exact")
            .eq("contrato_id", int(contrato_id))
            .eq("es_retroactivo", True)
            .is_("retroactivo_validado_at", "null")
            .execute()
        )
        n_sal = int(getattr(sal, "count", None) or len(sal.data or []))
    except Exception as exc:
        _log.warning("contar salidas retro: %s", exc)
    return {
        "entradas": n_ent,
        "salidas": n_sal,
        "total": n_ent + n_sal,
    }


def validar_registros_retroactivos(
    sb,
    contrato_id: int,
    *,
    validador_id: int,
    entrada_ids: Optional[List[int]] = None,
    salida_ids: Optional[List[int]] = None,
) -> dict:
    now = _now_utc().isoformat()
    patch = {
        "retroactivo_validado_at": now,
        "retroactivo_validado_por": int(validador_id),
    }
    ok_e: List[int] = []
    ok_s: List[int] = []
    for eid in sorted({int(x) for x in (entrada_ids or []) if x}):
        rows = (
            sb.table("almacen_entrada")
            .select("id, es_retroactivo, retroactivo_validado_at")
            .eq("id", eid)
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows or not rows[0].get("es_retroactivo") or rows[0].get("retroactivo_validado_at"):
            continue
        sb.table("almacen_entrada").update(patch).eq("id", eid).execute()
        ok_e.append(eid)
    for sid in sorted({int(x) for x in (salida_ids or []) if x}):
        rows = (
            sb.table("almacen_salida")
            .select("id, es_retroactivo, retroactivo_validado_at")
            .eq("id", sid)
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows or not rows[0].get("es_retroactivo") or rows[0].get("retroactivo_validado_at"):
            continue
        sb.table("almacen_salida").update(patch).eq("id", sid).execute()
        ok_s.append(sid)
    return {
        "entradas_validadas": ok_e,
        "salidas_validadas": ok_s,
        "validado_at": now,
        "validado_por": int(validador_id),
    }


def enriquecer_marca(row: dict) -> dict:
    r = dict(row)
    r["marca_retroactivo"] = marca_retroactivo_visible(r)
    return r


def leyenda_pdf_retroactivo(row: Optional[dict]) -> Optional[str]:
    """Texto extra para PDF térmico cuando aplica."""
    if not row or not _as_bool(row.get("es_retroactivo")):
        return None
    partes = ["Registro retroactivo"]
    if row.get("created_at"):
        from almacen_datetime import fmt_fecha_hora_bogota
        partes.append(f"Captura: {fmt_fecha_hora_bogota(row.get('created_at'))}")
    if _as_bool(row.get("fecha_aproximada")):
        partes.append("Fecha aproximada")
    return " · ".join(partes)
