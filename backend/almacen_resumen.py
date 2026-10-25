"""Vista Resumen de Almacén: líneas por proveedor, sin mover solicitudes."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


def _entero(value) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _texto(value) -> str:
    return str(value or "").strip()


def cubeta_linea(estado_validacion: Optional[str]) -> str:
    estado = _texto(estado_validacion).lower()
    if estado == "rechazado":
        return "rechazado"
    if estado == "aprobado":
        return "aprobado"
    return "enviado"


def _json_obj(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def solicitudes_con_lineas_movidas(filas: List[dict], logs: List[dict]) -> dict:
    """Solicitudes actuales que contienen una línea movida por Agrupar.

    No corrige nada. Una línea cuenta si el log trae una solicitud de origen
    distinta de la solicitud donde está ahora.
    """
    actual: Dict[int, int] = {}
    for fila in filas or []:
        iid = _entero(fila.get("id"))
        sid = _entero(fila.get("solicitud_id"))
        if iid and sid:
            actual[iid] = sid
    solicitudes = set()
    lineas = set()
    for log in logs or []:
        iid = _entero(log.get("entidad_id"))
        if not iid or iid not in actual:
            continue
        origen = _entero(_json_obj(log.get("valor_anterior")).get("solicitud_id"))
        if origen and origen != actual[iid]:
            solicitudes.add(actual[iid])
            lineas.add(iid)
    return {"solicitudes": len(solicitudes), "lineas": len(lineas), "disponible": True}


def fila_publica(
    fila: dict,
    *,
    solicitud: dict,
    nombres: Dict[int, str],
    oc: Optional[dict],
    insumo_codigo: str,
    ver_economicos: bool,
) -> dict:
    from almacen_dinero import producto

    cantidad = fila.get("cantidad")
    unitario = fila.get("valor_compra_unitario")
    valor = None
    try:
        cant_n = float(cantidad or 0)
        unit_n = float(unitario or 0)
    except (TypeError, ValueError):
        cant_n = 0.0
        unit_n = 0.0
    if cant_n > 0 and unit_n > 0:
        valor = producto(cant_n, unit_n)
    pedido_por = _entero(fila.get("solicitado_por"))
    dueno = _entero(solicitud.get("created_by"))
    observacion = _texto(fila.get("observacion_residente"))
    out = {
        "id": _entero(fila.get("id")),
        "numero_linea": fila.get("numero_linea"),
        "solicitud_id": _entero(fila.get("solicitud_id")),
        "consecutivo": solicitud.get("consecutivo"),
        "titulo": solicitud.get("titulo") or "",
        "estado_solicitud": solicitud.get("estado") or "",
        "solicitud_created_by": dueno,
        "estado_validacion": _texto(fila.get("estado_validacion")) or "pendiente",
        "cubeta": cubeta_linea(fila.get("estado_validacion")),
        "solicitado_por": pedido_por,
        "solicitado_por_nombre": nombres.get(pedido_por) if pedido_por else None,
        "capitulo": _texto(fila.get("capitulo")),
        "item": _texto(fila.get("item")),
        "insumo_id": _entero(fila.get("insumo_id")),
        "insumo_codigo": insumo_codigo or "",
        "material_descripcion": _texto(fila.get("material_descripcion") or fila.get("descripcion_solicitada")),
        "cantidad": cantidad,
        "unidad": _texto(fila.get("unidad")),
        "observacion": observacion,
        "justificacion": observacion,
        "proveedor_id": _entero(fila.get("proveedor_seleccionado_id")),
        "proveedor_nombre": _texto(fila.get("proveedor_seleccionado_nombre")),
        "numero_oc": (oc or {}).get("numero_oc"),
        "orden_compra_id": (oc or {}).get("id"),
        "en_oc": bool(oc),
        "motivo_rechazo": _texto(fila.get("motivo_rechazo_linea") or fila.get("motivo_rechazo")),
    }
    if ver_economicos:
        out["valor_compra_unitario"] = unitario
        out["valor"] = valor
    return out


def armar_resumen(
    filas: List[dict],
    solicitudes: Dict[int, dict],
    nombres: Dict[int, str],
    oc_por_item: Dict[int, dict],
    codigos: Dict[int, str],
    directorio: List[dict],
    *,
    ver_economicos: bool,
    sin_insumo: int,
    movidas: dict,
) -> dict:
    """Arma la respuesta liviana. Omite el dinero si el rol no lo ve."""
    lineas = []
    for fila in filas or []:
        if not _entero(fila.get("insumo_id")):
            continue
        sid = _entero(fila.get("solicitud_id"))
        solicitud = solicitudes.get(sid) or {}
        iid = _entero(fila.get("id"))
        insumo_id = _entero(fila.get("insumo_id"))
        lineas.append(fila_publica(
            fila,
            solicitud=solicitud,
            nombres=nombres,
            oc=oc_por_item.get(iid) if iid else None,
            insumo_codigo=codigos.get(insumo_id) or "",
            ver_economicos=ver_economicos,
        ))
    return {
        "lineas": lineas,
        "directorio": directorio,
        "sin_insumo": int(sin_insumo or 0),
        "movidas_por_agrupar": movidas,
        "ver_economicos": bool(ver_economicos),
    }


_SELECTS_ITEM = (
    "id, solicitud_id, numero_linea, insumo_id, cantidad, unidad, capitulo, item, "
    "material_descripcion, descripcion_solicitada, observacion_residente, estado_validacion, "
    "valor_compra_unitario, proveedor_seleccionado_id, proveedor_seleccionado_nombre, "
    "solicitado_por, motivo_rechazo_linea",
    "id, solicitud_id, numero_linea, insumo_id, cantidad, unidad, capitulo, item, "
    "material_descripcion, descripcion_solicitada, observacion_residente, estado_validacion, "
    "valor_compra_unitario, proveedor_seleccionado_id, proveedor_seleccionado_nombre, solicitado_por",
    "id, solicitud_id, numero_linea, insumo_id, cantidad, unidad, capitulo, item, "
    "material_descripcion, estado_validacion, valor_compra_unitario, "
    "proveedor_seleccionado_id, proveedor_seleccionado_nombre",
)


def _leer_items(sb, solicitud_ids: List[int]) -> List[dict]:
    from almacen_service import _pgrst_unknown_column, _trozos_ids

    if not solicitud_ids:
        return []
    last = None
    for select in _SELECTS_ITEM:
        try:
            rows: List[dict] = []
            for chunk in _trozos_ids(solicitud_ids, 80):
                rows.extend(
                    sb.table("almacen_solicitud_item")
                    .select(select)
                    .in_("solicitud_id", chunk)
                    .execute()
                    .data
                    or []
                )
            return rows
        except Exception as exc:
            last = exc
            if not _pgrst_unknown_column(exc):
                raise
    if last:
        raise last
    return []


def cargar_resumen_proveedores(contrato_id: int, *, ver_economicos: bool) -> dict:
    """Una pasada por solicitudes, líneas, proveedores y OC. Sin el detalle de cada solicitud."""
    from almacen_service import _map_usuario_nombres, _pgrst_unknown_column, _sb, _trozos_ids

    sb = _sb()
    sols = (
        sb.table("almacen_solicitud")
        .select("id, consecutivo, titulo, estado, created_by")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    solicitudes = {int(s["id"]): s for s in sols if s.get("id")}
    filas = _leer_items(sb, list(solicitudes))
    sin_insumo = sum(1 for fila in filas if not _entero(fila.get("insumo_id")))

    insumo_ids = sorted({iid for fila in filas if (iid := _entero(fila.get("insumo_id")))})
    codigos: Dict[int, str] = {}
    for chunk in _trozos_ids(insumo_ids, 80):
        rows = (
            sb.table("almacen_insumo").select("id, codigo").in_("id", chunk).execute().data or []
        )
        for row in rows:
            if row.get("id"):
                codigos[int(row["id"])] = _texto(row.get("codigo"))

    oc_por_item: Dict[int, dict] = {}
    sol_ids = list(solicitudes)
    oc_rows: List[dict] = []
    for chunk in _trozos_ids(sol_ids, 80):
        oc_rows.extend(
            sb.table("almacen_orden_compra")
            .select("id, numero_oc, solicitud_id")
            .eq("contrato_id", int(contrato_id))
            .in_("solicitud_id", chunk)
            .execute()
            .data
            or []
        )
    oc_por_id = {int(oc["id"]): oc for oc in oc_rows if oc.get("id")}
    for chunk in _trozos_ids(list(oc_por_id), 80):
        items_oc = (
            sb.table("almacen_orden_compra_item")
            .select("orden_compra_id, solicitud_item_id")
            .in_("orden_compra_id", chunk)
            .execute()
            .data
            or []
        )
        for row in items_oc:
            iid = _entero(row.get("solicitud_item_id"))
            oc = oc_por_id.get(_entero(row.get("orden_compra_id")) or 0)
            if iid and oc:
                oc_por_item[iid] = oc

    proveedor_ids = sorted({
        pid for fila in filas if (pid := _entero(fila.get("proveedor_seleccionado_id")))
    })
    directorio: List[dict] = []
    for chunk in _trozos_ids(proveedor_ids, 80):
        try:
            rows = (
                sb.table("almacen_proveedor")
                .select("id, razon_social, nit, contacto_nombre, contacto_email, contacto_telefono")
                .in_("id", chunk)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                raise
            rows = (
                sb.table("almacen_proveedor")
                .select("id, razon_social, nit")
                .in_("id", chunk)
                .execute()
                .data
                or []
            )
        for row in rows:
            directorio.append({
                "proveedor_id": _entero(row.get("id")),
                "nombre": _texto(row.get("razon_social")),
                "nit": _texto(row.get("nit")),
                "contacto_nombre": _texto(row.get("contacto_nombre")),
                "contacto_email": _texto(row.get("contacto_email")),
                "contacto_telefono": _texto(row.get("contacto_telefono")),
            })

    user_ids = []
    for fila in filas:
        if _entero(fila.get("solicitado_por")):
            user_ids.append(int(fila["solicitado_por"]))
    for sol in solicitudes.values():
        if _entero(sol.get("created_by")):
            user_ids.append(int(sol["created_by"]))
    nombres = _map_usuario_nombres(sb, user_ids)

    item_ids = [int(fila["id"]) for fila in filas if fila.get("id")]
    logs: List[dict] = []
    try:
        for chunk in _trozos_ids(item_ids, 50):
            logs.extend(
                sb.table("logs")
                .select("entidad_id, valor_anterior, valor_nuevo")
                .eq("accion", "AGRUPAR")
                .eq("entidad_tipo", "solicitud_item")
                .in_("entidad_id", [str(i) for i in chunk])
                .execute()
                .data
                or []
            )
        movidas = solicitudes_con_lineas_movidas(filas, logs)
    except Exception:
        movidas = {"solicitudes": None, "lineas": None, "disponible": False}

    return armar_resumen(
        filas,
        solicitudes,
        nombres,
        oc_por_item,
        codigos,
        directorio,
        ver_economicos=ver_economicos,
        sin_insumo=sin_insumo,
        movidas=movidas,
    )


def cambiar_proveedor_desde_resumen(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    body: dict,
    current_user,
) -> dict:
    """Cambia el proveedor guardado en la línea. No cambia la solicitud ni la OC."""
    from almacen_service import (
        _exigir_agrupacion_libre,
        _fetch_ocs_de_solicitud,
        _fetch_solicitud_head,
        _persistir_cotizacion_elegida,
        _resolver_proveedor_mapeo,
        _sb,
        _solicitud_item_ids_en_ocs,
        _sincronizar_titulo_solicitud,
        _to_float,
        _update_solicitud_item_row,
    )

    sb = _sb()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    _fetch_solicitud_head(contrato_id, solicitud_id)
    rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("id", int(item_id))
        .eq("solicitud_id", int(solicitud_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Ítem de solicitud no encontrado.")
    existing = rows[0]
    from almacen_permissions import (
        require_cambiar_proveedor_linea_aprobada,
        require_permiso_almacen,
    )

    if (existing.get("estado_validacion") or "") == "aprobado":
        require_cambiar_proveedor_linea_aprobada(current_user)
    else:
        require_permiso_almacen(current_user, "editar")
    if not existing.get("insumo_id"):
        raise ValueError("Esta línea no tiene insumo. Asigne el insumo antes de elegir proveedor.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if ocs:
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if int(item_id) in en_oc:
            raise ValueError(
                "Esta línea ya hace parte de una orden de compra generada. "
                "El proveedor no se puede cambiar."
            )
    sel = _resolver_proveedor_mapeo(sb, body, existing, existing.get("insumo_id"))
    if not sel.get("aplicar"):
        raise ValueError("Elija un proveedor de la lista de este insumo.")
    antes = {
        "proveedor_seleccionado_id": existing.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": existing.get("proveedor_seleccionado_nombre"),
        "cotizacion_numero_seleccionada": existing.get("cotizacion_numero_seleccionada"),
        "solicitud_id": int(solicitud_id),
        "solicitado_por": existing.get("solicitado_por"),
    }
    despues = {
        "proveedor_seleccionado_id": sel.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": sel.get("proveedor_seleccionado_nombre"),
        "cotizacion_numero_seleccionada": sel.get("cotizacion_numero_seleccionada"),
        "solicitud_id": int(solicitud_id),
        "solicitado_por": existing.get("solicitado_por"),
    }
    mismo = (
        (antes.get("proveedor_seleccionado_id") or None) == (despues.get("proveedor_seleccionado_id") or None)
        and _texto(antes.get("proveedor_seleccionado_nombre")).casefold()
        == _texto(despues.get("proveedor_seleccionado_nombre")).casefold()
    )
    if mismo:
        return {"cambio": False, "antes": antes, "despues": despues}
    cot_sel_id = _persistir_cotizacion_elegida(sb, int(item_id), existing, sel)
    patch = {
        "proveedor_seleccionado_id": despues["proveedor_seleccionado_id"],
        "proveedor_seleccionado_nombre": despues["proveedor_seleccionado_nombre"],
        "cotizacion_numero_seleccionada": despues["cotizacion_numero_seleccionada"],
    }
    valor = sel.get("valor")
    if valor not in (None, "") and _to_float(valor) > 0:
        patch["valor_compra_unitario"] = valor
    if cot_sel_id:
        patch["cotizacion_seleccionada_id"] = cot_sel_id
    _update_solicitud_item_row(sb, int(item_id), patch)
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return {"cambio": True, "antes": antes, "despues": despues}
