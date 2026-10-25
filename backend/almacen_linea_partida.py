"""Identidad de la línea de almacén.

La línea se reconoce por su id. El número y la solicitud son solo el lugar
donde está ahora. El solicitante vive en la línea.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional, Sequence


CAMPOS_DINERO = frozenset({
    "valor_compra_unitario",
    "valor_compra_linea",
    "valor_unitario",
    "valor_total",
    "vlr_unitario_cobro",
    "valor_negociado",
    "analisis_valor",
    "analisis_rentabilidad",
})


def _entero(value) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def marcar_en_oc(items: Sequence[dict], en_oc_ids: Iterable) -> List[dict]:
    en = {int(x) for x in (en_oc_ids or []) if _entero(x)}
    out = []
    for it in items or []:
        row = dict(it)
        iid = _entero(row.get("id"))
        if iid and iid in en:
            row["en_orden_compra"] = True
        out.append(row)
    return out


def linea_elegible_oc(item: dict) -> bool:
    if (item.get("estado_validacion") or "pendiente") == "rechazado":
        return False
    if item.get("en_orden_compra"):
        return False
    return _entero(item.get("id")) is not None


def ids_elegibles_oc(items: Sequence[dict]) -> set:
    return {int(it["id"]) for it in items or [] if linea_elegible_oc(it)}


def debe_separar_para_oc(items: Sequence[dict], seleccion: Optional[Iterable]) -> bool:
    """True solo si la selección es una parte estricta de las líneas que aún pueden ir a una OC."""
    if seleccion is None:
        return False
    elegibles = ids_elegibles_oc(items)
    elegidos = {int(x) for x in seleccion if _entero(x)} & elegibles
    if not elegidos or not elegibles:
        return False
    return elegidos < elegibles


def destino_oc(items: Sequence[dict], seleccion: Optional[Iterable], hay_oc_previa: bool) -> str:
    """`derivada` mueve la selección a una solicitud nueva. `misma` deja la OC en la solicitud actual.

    Si se eligen todas las líneas que todavía no están en una OC, la orden se
    genera en la misma solicitud: no queda un documento vacío y no se tocan
    las OC ya emitidas. Una parte de esas líneas sí pasa a un grupo derivado.
    """
    if debe_separar_para_oc(items, seleccion):
        return "derivada"
    return "misma"


def filas_para_mover(items: Sequence[dict], seleccion: Iterable, destino_id: int) -> List[dict]:
    """Siguiente número libre en el destino, conservando el orden del número anterior."""
    sel = {int(x) for x in seleccion if _entero(x)}
    elegidos = [it for it in items or [] if _entero(it.get("id")) in sel]
    elegidos.sort(key=lambda it: (_entero(it.get("numero_linea")) or 0, int(it["id"])))
    filas = []
    for i, it in enumerate(elegidos, start=1):
        filas.append({
            "item_id": int(it["id"]),
            "solicitud_id": int(destino_id),
            "numero_linea": i,
            "antes": {
                "solicitud_id": _entero(it.get("solicitud_id")),
                "numero_linea": it.get("numero_linea"),
            },
        })
    return filas


def filas_para_devolver(filas: Sequence[dict]) -> List[dict]:
    vuelta = []
    for fila in filas or []:
        antes = fila.get("antes") or {}
        origen = _entero(antes.get("solicitud_id"))
        numero = _entero(antes.get("numero_linea")) or 1
        item_id = _entero(fila.get("item_id"))
        if not item_id or not origen:
            continue
        vuelta.append({
            "item_id": item_id,
            "solicitud_id": origen,
            "numero_linea": numero,
        })
    return vuelta


def sellar_solicitado_por(row: dict, user_id: int) -> dict:
    """El alta fija quién pidió la línea. El cliente no puede elegir otro."""
    row.pop("solicitado_por", None)
    uid = _entero(user_id)
    if uid:
        row["solicitado_por"] = uid
    return row


def proteger_autor_linea(row: dict) -> dict:
    """Una edición o un movimiento no reescriben al solicitante."""
    row.pop("solicitado_por", None)
    return row


def estado_si_toda_la_solicitud_rechazada(items: Sequence[dict]) -> Optional[str]:
    """`rechazada` solo cuando cada línea quedó rechazada. Si no, el documento conserva su estado."""
    filas = list(items or [])
    if not filas:
        return None
    if all((it.get("estado_validacion") or "pendiente") == "rechazado" for it in filas):
        return "rechazada"
    return None


def _detalle(evento: dict) -> dict:
    raw = evento.get("detalle")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


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


def evento_es_de_esta_linea(evento: dict, item_id: int) -> bool:
    """La línea se reconoce por su id. El número dentro de la solicitud no identifica."""
    iid = str(int(item_id))
    tipo = str(evento.get("entidad_tipo") or "")
    eid = str(evento.get("entidad_id") or "")
    if tipo in ("solicitud_item", "almacen_solicitud_item") and eid == iid:
        return True
    detalle = _detalle(evento)
    if str(detalle.get("item_id") or "") == iid:
        return True
    if str(detalle.get("solicitud_item_id") or "") == iid:
        return True
    ids = detalle.get("item_ids")
    if isinstance(ids, list) and any(str(x) == iid for x in ids):
        return True
    for lado in ("valor_anterior", "valor_nuevo"):
        blob = _json_obj(evento.get(lado))
        if str(blob.get("item_id") or "") == iid:
            return True
        if str(blob.get("solicitud_item_id") or "") == iid:
            return True
    return False


def _sin_dinero(value):
    if isinstance(value, dict):
        return {k: _sin_dinero(v) for k, v in value.items() if k not in CAMPOS_DINERO}
    if isinstance(value, list):
        return [_sin_dinero(v) for v in value]
    return value


def presentar_evento(evento: dict, *, ver_economicos: bool) -> dict:
    anterior = _json_obj(evento.get("valor_anterior")) or _detalle(evento).get("anterior")
    nuevo = _json_obj(evento.get("valor_nuevo")) or _detalle(evento).get("nuevo")
    if not isinstance(anterior, dict):
        anterior = {}
    if not isinstance(nuevo, dict):
        nuevo = {}
    if not ver_economicos:
        anterior = _sin_dinero(anterior)
        nuevo = _sin_dinero(nuevo)
    return {
        "id": evento.get("id"),
        "cuando": evento.get("created_at") or evento.get("cuando"),
        "accion": evento.get("accion") or "",
        "texto": evento.get("texto") or "",
        "anterior": anterior,
        "nuevo": nuevo,
        "origen": evento.get("origen") or "log",
    }


def ficha_linea(
    item: dict,
    solicitud: dict,
    insumo: Optional[dict],
    *,
    nombres: Dict[int, str],
    ver_economicos: bool,
) -> dict:
    material = (
        (item.get("descripcion_solicitada") or item.get("material_descripcion") or "").strip()
        or "Sin descripción"
    )
    ins = insumo or {}
    pidio_id = _entero(item.get("solicitado_por"))
    solicitud_de_id = _entero(solicitud.get("created_by"))
    ficha = {
        "item_id": _entero(item.get("id")),
        "numero_linea": item.get("numero_linea"),
        "material": material,
        "insumo_codigo": (ins.get("codigo") or item.get("insumo_codigo") or "").strip() or None,
        "insumo_descripcion": (ins.get("descripcion") or "").strip() or None,
        "observacion": (item.get("observacion_residente") or "").strip() or None,
        "justificacion": (item.get("observacion_residente") or "").strip() or None,
        "justificacion_autor_nombre": (item.get("justificacion_autor_nombre") or "").strip() or None,
        "justificacion_at": item.get("justificacion_at") or None,
        "cantidad": item.get("cantidad"),
        "unidad": item.get("unidad"),
        "proveedor": (item.get("proveedor_seleccionado_nombre") or "").strip() or None,
        "solicitud_id": _entero(solicitud.get("id")),
        "solicitud_consecutivo": solicitud.get("consecutivo"),
        "solicitud_titulo": solicitud.get("titulo"),
        "solicitado_por": pidio_id,
        "solicitado_por_nombre": nombres.get(pidio_id) if pidio_id else None,
        "solicitud_de": solicitud_de_id,
        "solicitud_de_nombre": nombres.get(solicitud_de_id) if solicitud_de_id else None,
        "estado_validacion": item.get("estado_validacion") or "pendiente",
        "motivo_rechazo_linea": (item.get("motivo_rechazo_linea") or "").strip() or None,
    }
    if not ficha["solicitado_por_nombre"]:
        ficha["solicitado_por_nombre"] = None
        ficha["solicitante_linea"] = "sin_registro"
    else:
        ficha["solicitante_linea"] = "linea"
    if ver_economicos:
        ficha["valor_compra_unitario"] = item.get("valor_compra_unitario")
    return ficha


def eventos_sinteticos(
    item_id: int,
    oc_items: Sequence[dict],
    ordenes: Sequence[dict],
    entradas: Sequence[dict],
    entrada_items: Sequence[dict],
    salidas: Sequence[dict],
) -> List[dict]:
    """Recorrido que no siempre quedó en el log de la línea: OC, entrada y salida."""
    oc_por_id = {int(o["id"]): o for o in ordenes or [] if _entero(o.get("id"))}
    oci_por_id = {}
    eventos = []
    for oci in oc_items or []:
        if _entero(oci.get("solicitud_item_id")) != int(item_id):
            continue
        oci_id = _entero(oci.get("id"))
        if oci_id:
            oci_por_id[oci_id] = oci
        oc = oc_por_id.get(_entero(oci.get("orden_compra_id")) or 0) or {}
        numero = oc.get("numero_oc")
        eventos.append({
            "id": f"oc-{oci.get('id')}",
            "created_at": oc.get("created_at"),
            "accion": "GENERAR_OC",
            "texto": f"OC #{numero}" if numero not in (None, "") else "Orden de compra",
            "origen": "orden_compra",
            "valor_nuevo": {
                "orden_compra_id": oc.get("id"),
                "numero_oc": numero,
                "cantidad": oci.get("cantidad"),
                "valor_unitario": oci.get("valor_unitario"),
            },
        })
    entrada_por_id = {int(e["id"]): e for e in entradas or [] if _entero(e.get("id"))}
    ei_por_id = {}
    for ei in entrada_items or []:
        if _entero(ei.get("orden_compra_item_id")) not in oci_por_id:
            continue
        ei_id = _entero(ei.get("id"))
        if ei_id:
            ei_por_id[ei_id] = ei
        ent = entrada_por_id.get(_entero(ei.get("entrada_id")) or 0) or {}
        eventos.append({
            "id": f"entrada-{ei.get('id')}",
            "created_at": ent.get("created_at") or ent.get("fecha_entrada"),
            "accion": "ENTRADA",
            "texto": "Entrada de material",
            "origen": "entrada",
            "valor_nuevo": {
                "entrada_id": ent.get("id"),
                "cantidad_recibida": ei.get("cantidad_recibida"),
            },
        })
    for sal in salidas or []:
        if _entero(sal.get("entrada_item_id")) not in ei_por_id:
            continue
        numero = sal.get("numero_salida")
        eventos.append({
            "id": f"salida-{sal.get('id')}",
            "created_at": sal.get("fecha_hora_salida") or sal.get("created_at"),
            "accion": "SALIDA",
            "texto": f"Salida #{numero}" if numero not in (None, "") else "Salida de material",
            "origen": "salida",
            "valor_nuevo": {
                "salida_id": sal.get("id"),
                "numero_salida": numero,
                "cantidad_salida": sal.get("cantidad_salida"),
            },
        })
    return eventos


def _candidato_origen(logs_item: Sequence[dict]) -> dict:
    """El primer Agrupar con solicitud de origen es el candidato. Si falta, no se inventa."""
    ordenados = sorted(
        list(logs_item or []),
        key=lambda row: str(row.get("created_at") or ""),
    )
    for row in ordenados:
        antes = _json_obj(row.get("valor_anterior"))
        origen = _entero(antes.get("solicitud_id"))
        if origen:
            return {
                "origen_id": origen,
                "numero_anterior": antes.get("numero_linea"),
                "cuando": row.get("created_at"),
                "cierto": True,
            }
    if ordenados:
        return {
            "origen_id": None,
            "numero_anterior": None,
            "cuando": ordenados[0].get("created_at"),
            "cierto": False,
            "motivo": "El movimiento no guardó la solicitud de origen.",
        }
    return {"origen_id": None, "cierto": False, "motivo": "No hay un movimiento de Agrupar para esta línea."}


def armar_reporte_autoria(
    items: Sequence[dict],
    solicitudes: Sequence[dict],
    logs: Sequence[dict],
    nombres: Optional[Dict[int, str]] = None,
) -> dict:
    """Qué se restauraría. No escribe. Lo incierto queda marcado y no propone un nombre."""
    nombres = nombres or {}
    sols = {int(s["id"]): s for s in solicitudes or [] if _entero(s.get("id"))}
    por_item: Dict[int, List[dict]] = {}
    for row in logs or []:
        if str(row.get("accion") or "") != "AGRUPAR":
            continue
        if str(row.get("entidad_tipo") or "") != "solicitud_item":
            continue
        iid = _entero(row.get("entidad_id"))
        if iid:
            por_item.setdefault(iid, []).append(row)

    filas = []
    for it in items or []:
        iid = _entero(it.get("id"))
        if not iid or iid not in por_item:
            continue
        actual = sols.get(_entero(it.get("solicitud_id")) or 0) or {}
        candidato = _candidato_origen(por_item[iid])
        origen = sols.get(candidato.get("origen_id") or 0) or {}
        origen_user = _entero(origen.get("created_by"))
        actual_user = _entero(actual.get("created_by"))
        ya = _entero(it.get("solicitado_por"))
        cierto = bool(candidato.get("cierto") and origen_user)
        motivo = candidato.get("motivo")
        if cierto and ya and ya != origen_user:
            cierto = False
            motivo = "La línea ya tiene un solicitante distinto al de la solicitud de origen."
        elif not cierto and not motivo:
            motivo = "No se pudo reconstruir el solicitante original."
        accion = "sin_cambio"
        restauraria = None
        if not cierto:
            accion = "marcado_incierto"
        elif ya == origen_user:
            accion = "ya_correcto"
        elif actual_user == origen_user and not ya:
            # Sigue en una solicitud del mismo autor. No se ve como otro usuario.
            accion = "ya_correcto"
        else:
            accion = "restauraria"
            restauraria = origen_user
        if accion == "ya_correcto" and (ya == origen_user or (not ya and actual_user == origen_user)):
            # Sigue en el informe para que el conteo sea completo, pero no propone escritura.
            pass
        filas.append({
            "item_id": iid,
            "material": (it.get("descripcion_solicitada") or it.get("material_descripcion") or "").strip(),
            "numero_linea": it.get("numero_linea"),
            "solicitud_actual_id": _entero(it.get("solicitud_id")),
            "consecutivo_actual": actual.get("consecutivo"),
            "solicitud_actual_de": actual_user,
            "solicitud_actual_de_nombre": nombres.get(actual_user) if actual_user else None,
            "solicitado_por": ya,
            "solicitado_por_nombre": nombres.get(ya) if ya else None,
            "origen_solicitud_id": candidato.get("origen_id"),
            "consecutivo_origen": origen.get("consecutivo"),
            "numero_anterior": candidato.get("numero_anterior"),
            "primer_movimiento": candidato.get("cuando"),
            "candidato_solicitado_por": origen_user if cierto else None,
            "candidato_nombre": nombres.get(origen_user) if cierto and origen_user else None,
            "cierto": cierto,
            "motivo": motivo if not cierto else None,
            "accion": accion,
            "restauraria_solicitado_por": restauraria,
            "oc_no_se_modifica": True,
        })
    return {
        "aplica": False,
        "lineas": filas,
        "total_movidas": len(filas),
        "restaurarian": sum(1 for f in filas if f["accion"] == "restauraria"),
        "inciertas": sum(1 for f in filas if f["accion"] == "marcado_incierto"),
        "ya_correctas": sum(1 for f in filas if f["accion"] == "ya_correcto"),
        "trazabilidad": (
            "La trazabilidad de cada línea se consulta por su id. "
            "No se reescriben logs ni órdenes de compra. "
            "Un log viejo guardado solo con el número de línea, sin el id, queda sin atribuir."
        ),
    }


def resumen_solicitantes_linea(nombres_linea: Sequence[str], nombre_solicitud: Optional[str]) -> Optional[str]:
    """Nombre de quien pidió la línea. La solicitud puede ser de otra persona."""
    distintos = []
    for nombre in nombres_linea or []:
        limpio = (nombre or "").strip()
        if limpio and limpio not in distintos:
            distintos.append(limpio)
    if not distintos:
        return None
    if len(distintos) > 1:
        return "Varios"
    return distintos[0]


def quien_pidio_de_items(items: Sequence[dict], solicitud: Optional[dict], ids_linea=None) -> str:
    """Solicitante leído de las líneas. Si la solicitud es de otro, se nombra aparte."""
    permitidos = None
    if ids_linea is not None:
        permitidos = set()
        for raw in ids_linea:
            n = _entero(raw)
            if n:
                permitidos.add(n)
    nombres = []
    for it in items or []:
        if permitidos is not None and _entero(it.get("id")) not in permitidos:
            continue
        nombre = (it.get("solicitado_por_nombre") or "").strip()
        if nombre and nombre not in nombres:
            nombres.append(nombre)
    dueno = ""
    if solicitud:
        dueno = (solicitud.get("solicitud_de_nombre") or solicitud.get("solicitante_nombre") or "").strip()
    if not nombres:
        return dueno or "—"
    if len(nombres) == 1:
        if dueno and dueno != nombres[0]:
            return f"{nombres[0]} (solicitud de {dueno})"
        return nombres[0]
    if dueno:
        return f"Varios (solicitud de {dueno})"
    return "Varios"
