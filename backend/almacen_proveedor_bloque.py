"""
Cambiar proveedor de todas las líneas de un mismo insumo (una operación).
Deshacer solo la última acción de este tipo.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("claracore.almacen.proveedor_bloque")

ACCION_CAMBIO = "CAMBIAR_PROVEEDOR_BLOQUE"
ACCION_DESHACER = "DESHACER_PROVEEDOR_BLOQUE"


def _to_float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _sb():
    from almacen_service import _sb as sb
    return sb()


def _snapshot_linea(it: dict) -> dict:
    return {
        "item_id": int(it["id"]),
        "insumo_id": it.get("insumo_id"),
        "proveedor_seleccionado_id": it.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": (it.get("proveedor_seleccionado_nombre") or "").strip() or None,
        "cotizacion_numero_seleccionada": (it.get("cotizacion_numero_seleccionada") or "").strip() or None,
        "valor_compra_unitario": it.get("valor_compra_unitario"),
        "estado_validacion": it.get("estado_validacion") or "pendiente",
        "numero_linea": it.get("numero_linea"),
    }


def _exigir_mismo_insumo(lineas: List[dict]) -> int:
    ids = set()
    for it in lineas:
        if not it.get("insumo_id"):
            raise ValueError(
                "Todas las líneas deben tener el mismo insumo asignado. "
                "Asigne el insumo antes de cambiar el proveedor."
            )
        try:
            ids.add(int(it["insumo_id"]))
        except (TypeError, ValueError) as exc:
            raise ValueError("Insumo inválido en una de las líneas.") from exc
    if len(ids) != 1:
        raise ValueError(
            "Solo se puede cambiar el proveedor de un insumo a la vez. "
            "Seleccione una sola fila (un solo insumo)."
        )
    return next(iter(ids))


def vista_previa_cambio_proveedor(
    contrato_id: int,
    solicitud_id: int,
    item_ids: List[int],
    *,
    ver_economicos: bool = False,
) -> dict:
    """Ofertas del insumo + total por proveedor para la cantidad de las líneas."""
    from almacen_service import (
        _fetch_ocs_de_solicitud,
        _fetch_solicitud_head,
        _solicitud_item_ids_en_ocs,
        listar_ofertas_proveedor_insumo,
        producto,
    )

    ids = sorted({int(x) for x in (item_ids or []) if x})
    if not ids:
        raise ValueError("Seleccione las líneas del insumo.")
    sb = _sb()
    _fetch_solicitud_head(contrato_id, solicitud_id)
    rows = (
        sb.table("almacen_solicitud_item")
        .select(
            "id, solicitud_id, insumo_id, cantidad, valor_compra_unitario, estado_validacion, "
            "proveedor_seleccionado_id, proveedor_seleccionado_nombre, "
            "cotizacion_numero_seleccionada, numero_linea, en_orden_compra"
        )
        .eq("solicitud_id", int(solicitud_id))
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    if len(rows) != len(ids):
        raise ValueError("Alguna línea no pertenece a esta solicitud.")
    insumo_id = _exigir_mismo_insumo(rows)
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = (
        _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if ocs else set()
    )
    bloqueadas = [int(r["id"]) for r in rows if int(r["id"]) in en_oc]
    editables = [r for r in rows if int(r["id"]) not in en_oc]
    cant_total = sum(_to_float(r.get("cantidad")) for r in editables)
    ofertas = listar_ofertas_proveedor_insumo(
        contrato_id, insumo_id, ver_economicos=ver_economicos,
    )
    actual_id = None
    actual_nombre = ""
    for r in editables:
        if r.get("proveedor_seleccionado_id") not in (None, ""):
            try:
                actual_id = int(r["proveedor_seleccionado_id"])
            except (TypeError, ValueError):
                actual_id = None
            actual_nombre = (r.get("proveedor_seleccionado_nombre") or "").strip()
            break
        if (r.get("proveedor_seleccionado_nombre") or "").strip():
            actual_nombre = (r.get("proveedor_seleccionado_nombre") or "").strip()
            break

    filas = []
    for o in ofertas:
        pid = o.get("proveedor_id")
        es_actual = False
        if actual_id is not None and pid is not None:
            try:
                es_actual = int(pid) == int(actual_id)
            except (TypeError, ValueError):
                es_actual = False
        if not es_actual and actual_nombre:
            es_actual = (o.get("proveedor_nombre") or "").strip().casefold() == actual_nombre.casefold()
        fila = {
            "proveedor_id": pid,
            "proveedor_nombre": o.get("proveedor_nombre"),
            "numero": o.get("numero"),
            "es_ganadora": bool(o.get("es_ganadora")),
            "es_actual": es_actual,
        }
        if ver_economicos:
            vu = _to_float(o.get("valor"))
            fila["valor_unitario"] = vu if vu > 0 else None
            fila["costo_total"] = producto(cant_total, vu) if vu > 0 and cant_total > 0 else None
        filas.append(fila)

    return {
        "insumo_id": insumo_id,
        "lineas_totales": len(rows),
        "lineas_editables": len(editables),
        "lineas_en_oc": len(bloqueadas),
        "item_ids_editables": [int(r["id"]) for r in editables],
        "item_ids_en_oc": bloqueadas,
        "cantidad_total": cant_total,
        "proveedor_actual_id": actual_id,
        "proveedor_actual_nombre": actual_nombre or None,
        "ofertas": filas,
    }


def _aplicar_una_linea(
    sb,
    *,
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    existing: dict,
    body: dict,
    ver_economicos: bool,
) -> Tuple[dict, dict, bool]:
    """Devuelve (antes, despues, cambio)."""
    from almacen_service import (
        _persistir_cotizacion_elegida,
        _resolver_proveedor_mapeo,
        _sincronizar_titulo_solicitud,
        _update_solicitud_item_row,
    )

    antes = _snapshot_linea(existing)
    estado = (existing.get("estado_validacion") or "pendiente").strip().lower()
    sel = _resolver_proveedor_mapeo(sb, body, existing, existing.get("insumo_id"))
    if not sel.get("aplicar"):
        raise ValueError("Elija un proveedor de la lista de este insumo.")

    despues_vals = {
        "proveedor_seleccionado_id": sel.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": sel.get("proveedor_seleccionado_nombre"),
        "cotizacion_numero_seleccionada": sel.get("cotizacion_numero_seleccionada"),
        "valor_compra_unitario": (
            sel.get("valor")
            if sel.get("valor") not in (None, "")
            else existing.get("valor_compra_unitario")
        ),
        "estado_validacion": "aprobado" if estado == "aprobado" else estado,
    }
    mismo = (
        (antes.get("proveedor_seleccionado_id") or None) == (despues_vals.get("proveedor_seleccionado_id") or None)
        and (antes.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        == (despues_vals.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        and (antes.get("cotizacion_numero_seleccionada") or "").strip()
        == (despues_vals.get("cotizacion_numero_seleccionada") or "").strip()
    )
    valor_nuevo = _to_float(sel.get("valor")) if sel.get("valor") not in (None, "") else 0.0
    precio_cambio = (
        valor_nuevo > 0
        and abs(valor_nuevo - _to_float(antes.get("valor_compra_unitario"))) > 0.009
    )
    if mismo and not precio_cambio:
        return antes, {**antes, **{k: despues_vals.get(k) for k in (
            "proveedor_seleccionado_id", "proveedor_seleccionado_nombre",
            "cotizacion_numero_seleccionada", "valor_compra_unitario",
        )}}, False

    cot_sel_id = _persistir_cotizacion_elegida(sb, int(existing["id"]), existing, sel)
    patch = {
        "proveedor_seleccionado_id": despues_vals["proveedor_seleccionado_id"],
        "proveedor_seleccionado_nombre": despues_vals["proveedor_seleccionado_nombre"],
        "cotizacion_numero_seleccionada": despues_vals["cotizacion_numero_seleccionada"],
        "valor_compra_unitario": despues_vals["valor_compra_unitario"],
    }
    if cot_sel_id:
        patch["cotizacion_seleccionada_id"] = cot_sel_id
    if patch["valor_compra_unitario"] is not None and _to_float(patch["valor_compra_unitario"]) < 0:
        raise ValueError("El costo de compra no puede ser negativo.")
    _update_solicitud_item_row(sb, int(existing["id"]), patch)
    despues = {**antes, **patch, "item_id": int(existing["id"])}
    return antes, despues, True


def cambiar_proveedor_bloque(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    item_ids: List[int],
    body: dict,
    *,
    ver_economicos: bool = False,
    confirmar_aprobadas: bool = False,
) -> dict:
    """
    Cambia proveedor en todas las líneas editables del mismo insumo.
    Todo o nada. Las que ya están en OC no se tocan (se reportan).
    """
    from almacen_service import (
        _exigir_agrupacion_libre,
        _fetch_ocs_de_solicitud,
        _fetch_solicitud_head,
        _solicitud_item_ids_en_ocs,
        _sincronizar_titulo_solicitud,
        get_solicitud,
    )

    t0 = time.perf_counter()
    ids = sorted({int(x) for x in (item_ids or []) if x})
    if not ids:
        raise ValueError("Seleccione las líneas del insumo.")
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    _fetch_solicitud_head(contrato_id, solicitud_id)
    rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", int(solicitud_id))
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    if len(rows) != len(ids):
        raise ValueError("Alguna línea no pertenece a esta solicitud.")
    insumo_id = _exigir_mismo_insumo(rows)

    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = (
        _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if ocs else set()
    )
    en_oc_ids = [int(r["id"]) for r in rows if int(r["id"]) in en_oc]
    editables = [r for r in rows if int(r["id"]) not in en_oc]
    if not editables:
        raise ValueError(
            "Ninguna de las líneas se puede cambiar: ya hacen parte de una orden de compra."
        )
    aprobadas = [
        r for r in editables
        if (r.get("estado_validacion") or "").strip().lower() == "aprobado"
    ]
    if aprobadas and not confirmar_aprobadas:
        raise ValueError(
            f"{len(aprobadas)} línea(s) ya están aprobadas. Confirme el cambio de proveedor "
            "para continuar (las que tienen OC no se modificarán)."
        )

    snapshots_antes: List[dict] = []
    snapshots_despues: List[dict] = []
    cambios = 0
    try:
        for existing in editables:
            antes, despues, cambio = _aplicar_una_linea(
                sb,
                contrato_id=contrato_id,
                solicitud_id=solicitud_id,
                user_id=user_id,
                existing=existing,
                body=body,
                ver_economicos=ver_economicos,
            )
            snapshots_antes.append(antes)
            snapshots_despues.append(despues)
            if cambio:
                cambios += 1
    except Exception:
        # Revertir lo ya aplicado en esta corrida.
        for snap in snapshots_antes:
            try:
                from almacen_service import _update_solicitud_item_row
                _update_solicitud_item_row(sb, int(snap["item_id"]), {
                    "proveedor_seleccionado_id": snap.get("proveedor_seleccionado_id"),
                    "proveedor_seleccionado_nombre": snap.get("proveedor_seleccionado_nombre"),
                    "cotizacion_numero_seleccionada": snap.get("cotizacion_numero_seleccionada"),
                    "valor_compra_unitario": snap.get("valor_compra_unitario"),
                })
            except Exception:
                _log.exception("No se pudo revertir la línea %s tras fallo", snap.get("item_id"))
        raise

    _sincronizar_titulo_solicitud(sb, solicitud_id)
    ejecucion_id = str(uuid.uuid4())
    ms = int((time.perf_counter() - t0) * 1000)
    if ms > 5000:
        _log.warning("cambiar_proveedor_bloque tardó %sms (solicitud=%s)", ms, solicitud_id)

    solicitud = get_solicitud(contrato_id, solicitud_id, ver_economicos=ver_economicos, ligera=True)
    return {
        "solicitud": solicitud,
        "insumo_id": insumo_id,
        "lineas_cambiadas": cambios,
        "lineas_editables": len(editables),
        "lineas_en_oc": len(en_oc_ids),
        "item_ids_en_oc": en_oc_ids,
        "ejecucion_id": ejecucion_id,
        "duracion_ms": ms,
        "proveedor_nuevo_id": body.get("proveedor_seleccionado_id"),
        "proveedor_nuevo_nombre": body.get("proveedor_seleccionado_nombre"),
        "antes": snapshots_antes,
        "despues": snapshots_despues,
    }


def _leer_ultimo_cambio(sb, contrato_id: int, solicitud_id: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("logs_auditoria")
            .select("id, accion, entidad_tipo, entidad_id, detalle, valor_anterior, valor_nuevo, created_at")
            .eq("contrato_id", int(contrato_id))
            .eq("entidad_tipo", "solicitud")
            .eq("entidad_id", int(solicitud_id))
            .in_("accion", [ACCION_CAMBIO, ACCION_DESHACER])
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("No se pudo leer el log de cambio de proveedor: %s", exc)
        return None
    if not rows:
        return None
    top = rows[0]
    if (top.get("accion") or "") == ACCION_DESHACER:
        return {"ya_deshecho": True, "log": top}
    if (top.get("accion") or "") != ACCION_CAMBIO:
        return None
    return {"ya_deshecho": False, "log": top}


def vista_previa_deshacer_proveedor(contrato_id: int, solicitud_id: int) -> dict:
    from almacen_service import (
        _fetch_ocs_de_solicitud,
        _fetch_solicitud_head,
        _solicitud_item_ids_en_ocs,
    )

    sb = _sb()
    _fetch_solicitud_head(contrato_id, solicitud_id)
    info = _leer_ultimo_cambio(sb, contrato_id, solicitud_id)
    if not info:
        return {
            "puede": False,
            "resumen": "No hay un cambio de proveedor reciente para deshacer.",
            "lineas": 0,
            "bloqueos": [],
        }
    if info.get("ya_deshecho"):
        return {
            "puede": False,
            "resumen": "El último cambio de proveedor ya se deshizo. Solo se puede deshacer la acción más reciente.",
            "lineas": 0,
            "bloqueos": [],
        }
    log = info["log"]
    antes = log.get("valor_anterior") or {}
    if isinstance(antes, str):
        import json
        try:
            antes = json.loads(antes)
        except Exception:
            antes = {}
    lineas = antes.get("lineas") if isinstance(antes, dict) else None
    if not isinstance(lineas, list) or not lineas:
        return {
            "puede": False,
            "resumen": "El historial del cambio no tiene el detalle para deshacer.",
            "lineas": 0,
            "bloqueos": [],
        }

    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = (
        _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if ocs else set()
    )
    bloqueos = []
    restaurables = []
    for snap in lineas:
        try:
            iid = int(snap.get("item_id"))
        except (TypeError, ValueError):
            continue
        if iid in en_oc:
            bloqueos.append(
                f"La línea {snap.get('numero_linea') or iid} ya está en una orden de compra."
            )
            continue
        # Comprobar que el proveedor actual sigue siendo el «después» del cambio.
        row = (
            sb.table("almacen_solicitud_item")
            .select(
                "id, proveedor_seleccionado_id, proveedor_seleccionado_nombre, "
                "cotizacion_numero_seleccionada, valor_compra_unitario"
            )
            .eq("id", iid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not row:
            bloqueos.append(f"La línea {iid} ya no existe.")
            continue
        cur = row[0]
        det = log.get("valor_nuevo") or {}
        if isinstance(det, str):
            import json
            try:
                det = json.loads(det)
            except Exception:
                det = {}
        despues_list = det.get("lineas") if isinstance(det, dict) else None
        despues_map = {
            int(x["item_id"]): x
            for x in (despues_list or [])
            if x.get("item_id") is not None
        }
        esp = despues_map.get(iid) or {}
        cur_pid = cur.get("proveedor_seleccionado_id")
        esp_pid = esp.get("proveedor_seleccionado_id")
        cur_nom = (cur.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        esp_nom = (esp.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        if (cur_pid or None) != (esp_pid or None) or cur_nom != esp_nom:
            bloqueos.append(
                f"La línea {snap.get('numero_linea') or iid} cambió de nuevo después; "
                "no se puede deshacer a medias."
            )
            continue
        restaurables.append(snap)

    proveedor_volver = None
    if restaurables:
        proveedor_volver = (restaurables[0].get("proveedor_seleccionado_nombre") or "").strip() or None

    if bloqueos and not restaurables:
        return {
            "puede": False,
            "resumen": "No se puede deshacer: " + " ".join(bloqueos[:3]),
            "lineas": 0,
            "bloqueos": bloqueos,
            "proveedor_volver": proveedor_volver,
        }
    if bloqueos:
        return {
            "puede": False,
            "resumen": (
                "No se puede deshacer completo: algunas líneas ya no están en el estado "
                "del cambio. " + " ".join(bloqueos[:2])
            ),
            "lineas": len(restaurables),
            "bloqueos": bloqueos,
            "proveedor_volver": proveedor_volver,
        }
    return {
        "puede": True,
        "resumen": (
            f"Se revertirán {len(restaurables)} línea(s)"
            + (f" al proveedor «{proveedor_volver}»" if proveedor_volver else "")
            + "."
        ),
        "lineas": len(restaurables),
        "bloqueos": [],
        "proveedor_volver": proveedor_volver,
        "item_ids": [int(s["item_id"]) for s in restaurables],
        "ejecucion_id": (log.get("detalle") or {}).get("ejecucion_id")
        if isinstance(log.get("detalle"), dict) else None,
    }


def ejecutar_deshacer_proveedor(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    *,
    confirmar: bool = False,
    ver_economicos: bool = False,
) -> dict:
    from almacen_service import (
        _exigir_agrupacion_libre,
        _fetch_solicitud_head,
        _sincronizar_titulo_solicitud,
        _update_solicitud_item_row,
        get_solicitud,
    )

    if not confirmar:
        raise ValueError("Confirme el resumen antes de deshacer el cambio de proveedor.")
    t0 = time.perf_counter()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    prev = vista_previa_deshacer_proveedor(contrato_id, solicitud_id)
    if not prev.get("puede"):
        raise ValueError(prev.get("resumen") or "No se puede deshacer.")

    sb = _sb()
    _fetch_solicitud_head(contrato_id, solicitud_id)
    info = _leer_ultimo_cambio(sb, contrato_id, solicitud_id)
    log = (info or {}).get("log") or {}
    antes = log.get("valor_anterior") or {}
    if isinstance(antes, str):
        import json
        try:
            antes = json.loads(antes)
        except Exception:
            antes = {}
    lineas = antes.get("lineas") if isinstance(antes, dict) else []
    by_id = {int(s["item_id"]): s for s in (lineas or []) if s.get("item_id") is not None}
    aplicados = []
    try:
        for iid in prev.get("item_ids") or []:
            snap = by_id.get(int(iid))
            if not snap:
                continue
            _update_solicitud_item_row(sb, int(iid), {
                "proveedor_seleccionado_id": snap.get("proveedor_seleccionado_id"),
                "proveedor_seleccionado_nombre": snap.get("proveedor_seleccionado_nombre"),
                "cotizacion_numero_seleccionada": snap.get("cotizacion_numero_seleccionada"),
                "valor_compra_unitario": snap.get("valor_compra_unitario"),
            })
            aplicados.append(snap)
    except Exception:
        raise

    _sincronizar_titulo_solicitud(sb, solicitud_id)
    ms = int((time.perf_counter() - t0) * 1000)
    return {
        "solicitud": get_solicitud(contrato_id, solicitud_id, ver_economicos=ver_economicos, ligera=True),
        "lineas_revertidas": len(aplicados),
        "proveedor_volver": prev.get("proveedor_volver"),
        "duracion_ms": ms,
        "antes": aplicados,
    }
