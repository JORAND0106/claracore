"""
Trabajo que no hace falta para confirmar que la solicitud quedó guardada.

Corre después de la respuesta: nombre, precio vigente, proveedor y registro
del log. Si algo falla, queda anotado en la solicitud y se puede reintentar
sin volver a crear el pedido.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

_log = logging.getLogger("claracore.almacen.tareas")

PASOS = ("titulo", "precios", "proveedor", "log")
NOMBRE_PASO = {
    "titulo": "el nombre de la solicitud",
    "precios": "el precio vigente",
    "proveedor": "el proveedor de las líneas",
    "log": "el registro de modificaciones",
}

_MEM: Dict[int, dict] = {}


def estado_publico(estado: Optional[dict]) -> Optional[dict]:
    """Lo que ve el usuario. El payload del log se queda en el servidor."""
    if not isinstance(estado, dict):
        return estado
    return {k: v for k, v in estado.items() if k != "log"}


def estado_en_memoria(solicitud_id) -> Optional[dict]:
    try:
        return _MEM.get(int(solicitud_id))
    except (TypeError, ValueError):
        return None


def _usuario_para_log(usuario) -> dict:
    if not isinstance(usuario, dict):
        return {}
    keys = (
        "sub", "id", "nombre", "email", "cargo_nombre",
        "rol_nombre", "contrato_id", "contrato_numero",
    )
    return {k: usuario.get(k) for k in keys if k in usuario}


def _columna_ausente(exc: BaseException) -> bool:
    text = str(exc or "").lower()
    return "tareas_fondo" in text or any(
        tok in text for tok in ("pgrst204", "schema cache", "could not find", "42703")
    )


def _guardar_estado(sb, solicitud_id: int, estado: dict) -> None:
    _MEM[int(solicitud_id)] = estado
    try:
        sb.table("almacen_solicitud").update({
            "tareas_fondo": estado,
        }).eq("id", int(solicitud_id)).execute()
    except Exception as exc:
        if _columna_ausente(exc):
            return
        _log.warning("No se pudo anotar el estado de tareas de la solicitud %s: %s", solicitud_id, exc)


def _leer_estado(sb, solicitud_id: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("almacen_solicitud")
            .select("id, tareas_fondo")
            .eq("id", int(solicitud_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows and isinstance(rows[0].get("tareas_fondo"), dict):
            return rows[0]["tareas_fondo"]
    except Exception as exc:
        if not _columna_ausente(exc):
            _log.warning("No se pudo leer tareas de la solicitud %s: %s", solicitud_id, exc)
    return _MEM.get(int(solicitud_id))


def _estado_inicial(log_payload: dict) -> dict:
    return {
        "estado": "pendiente",
        "pasos": {paso: "pendiente" for paso in PASOS},
        "error": None,
        "mensaje": (
            "La solicitud ya está guardada. "
            "Se actualizan el nombre, el proveedor y el registro de modificaciones."
        ),
        "log": log_payload,
    }


def _mensaje_error(pasos: dict) -> str:
    fallos = [NOMBRE_PASO[p] for p in PASOS if pasos.get(p) == "error"]
    if not fallos:
        return "No se pudo completar la actualización complementaria."
    return (
        "La solicitud está guardada, pero no se pudo completar "
        + ", ".join(fallos)
        + ". Puede reintentarlo sin perder el pedido."
    )


def _items(sb, solicitud_id: int) -> list:
    return (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )


def _correr_paso(paso: str, sb, contrato_id: int, solicitud_id: int, estado: dict) -> None:
    if paso == "titulo":
        from almacen_agrupar import sincronizar_titulo_solicitud
        nuevo = sincronizar_titulo_solicitud(sb, int(solicitud_id))
        if nuevo is None:
            raise ValueError("No se pudo actualizar el nombre de la solicitud.")
        return
    if paso == "precios":
        from almacen_service import (
            _fetch_ocs_de_solicitud,
            _solicitud_item_ids_en_ocs,
            sincronizar_precios_sin_oc,
        )
        items = _items(sb, solicitud_id)
        ocs = _fetch_ocs_de_solicitud(sb, int(contrato_id), int(solicitud_id))
        ids_oc = (
            _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
            if ocs else set()
        )
        sincronizar_precios_sin_oc(sb, items, ids_oc)
        return
    if paso == "proveedor":
        from almacen_service import completar_proveedor_guardado
        completar_proveedor_guardado(sb, _items(sb, solicitud_id))
        return
    if paso == "log":
        from almacen_audit import insertar_log_almacen
        payload = estado.get("log") or {}
        accion = payload.get("accion")
        if not accion:
            raise ValueError("Falta la acción para el registro de modificaciones.")
        ok = insertar_log_almacen(
            payload.get("usuario") or {},
            accion,
            "solicitud",
            solicitud_id,
            payload.get("detalle") or {},
            valor_anterior=payload.get("valor_anterior"),
            valor_nuevo=payload.get("valor_nuevo"),
        )
        if not ok:
            raise ValueError("No se pudo escribir el registro de modificaciones.")
        return
    raise ValueError(f"Paso desconocido: {paso}")


def ejecutar_tareas_tras_guardar(contrato_id: int, solicitud_id: int) -> dict:
    from almacen_service import _sb
    sb = _sb()
    estado = _leer_estado(sb, int(solicitud_id)) or _estado_inicial({})
    pasos = dict(estado.get("pasos") or {})
    errores = []
    for paso in PASOS:
        if pasos.get(paso) == "ok":
            continue
        try:
            _correr_paso(paso, sb, int(contrato_id), int(solicitud_id), estado)
            pasos[paso] = "ok"
        except Exception as exc:
            pasos[paso] = "error"
            errores.append(str(exc))
            _log.exception(
                "Tarea %s de la solicitud %s no se completó", paso, solicitud_id,
            )
    estado["pasos"] = pasos
    if errores:
        estado["estado"] = "error"
        estado["error"] = " ".join(errores)[:500]
        estado["mensaje"] = _mensaje_error(pasos)
    else:
        estado["estado"] = "ok"
        estado["error"] = None
        estado["mensaje"] = None
    _guardar_estado(sb, int(solicitud_id), estado)
    return estado


def programar_tareas_tras_guardar(
    background_tasks,
    contrato_id: int,
    solicitud_id: int,
    usuario,
    *,
    accion: str,
    detalle: Optional[dict],
    valor_anterior,
    valor_nuevo,
    resultado: Dict[str, Any],
) -> None:
    """Deja la solicitud visible como guardada y corre el resto al responder."""
    from almacen_service import _sb
    log_payload = {
        "accion": accion,
        "detalle": detalle or {},
        "valor_anterior": valor_anterior,
        "valor_nuevo": valor_nuevo,
        "usuario": _usuario_para_log(usuario),
    }
    estado = _estado_inicial(log_payload)
    _guardar_estado(_sb(), int(solicitud_id), estado)
    resultado["tareas_fondo"] = estado_publico(estado)
    background_tasks.add_task(
        ejecutar_tareas_tras_guardar, int(contrato_id), int(solicitud_id),
    )


def reintentar_tareas_solicitud(contrato_id: int, solicitud_id: int, usuario) -> dict:
    """Vuelve a correr solo lo que falló. La solicitud ya guardada no se toca."""
    from almacen_service import _sb, get_solicitud
    estado = _leer_estado(_sb(), int(solicitud_id))
    if not estado:
        raise ValueError("No hay una actualización pendiente para reintentar.")
    if estado.get("estado") == "ok":
        sol = get_solicitud(int(contrato_id), int(solicitud_id), ligera=True, diferir_secundarios=True)
        return {"ok": True, "tareas_fondo": estado_publico(estado), "solicitud": sol}
    log = dict(estado.get("log") or {})
    if not log.get("usuario"):
        log["usuario"] = _usuario_para_log(usuario)
        estado["log"] = log
        _guardar_estado(_sb(), int(solicitud_id), estado)
    final = ejecutar_tareas_tras_guardar(int(contrato_id), int(solicitud_id))
    sol = get_solicitud(int(contrato_id), int(solicitud_id), ligera=True, diferir_secundarios=True)
    publico = estado_publico(final)
    sol["tareas_fondo"] = publico
    return {"ok": final.get("estado") == "ok", "tareas_fondo": publico, "solicitud": sol}
