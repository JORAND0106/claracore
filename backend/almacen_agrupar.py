"""Agrupa solicitudes de materiales por proveedor, sin tocar las que ya tienen OC.

El nombre queda «Solicitud # XXX - Fecha - Proveedor - Estado» y se
recalcula cuando cambia el proveedor del grupo o el estado.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from almacen_datetime import BOGOTA, fmt_fecha_bogota

_log = logging.getLogger("claracore.almacen.agrupar")

ETIQUETA_ESTADO = {
    "borrador": "Borrador",
    "enviada": "Enviada",
    "aprobada": "Aprobada",
    "rechazada": "Rechazada",
}

BLOQUEO_TTL = timedelta(minutes=3)
_TABLA_BLOQUEO = "almacen_agrupacion_bloqueo"


def etiqueta_estado(estado: Optional[str]) -> str:
    return ETIQUETA_ESTADO.get((estado or "").strip(), (estado or "").strip() or "—")


def format_titulo_grupo(consecutivo, created_at, proveedor: str, estado: str) -> str:
    """Solicitud # XXX - Fecha - Proveedor - Estado. La fecha es la de la solicitud."""
    fecha = fmt_fecha_bogota(created_at) if created_at else "—"
    if fecha == "—":
        fecha = datetime.now(BOGOTA).strftime("%d/%m/%Y")
    num = consecutivo if consecutivo is not None and consecutivo != "" else "…"
    prov = (proveedor or "").strip() or "Sin proveedor"
    return f"Solicitud #{num} - {fecha} - {prov} - {etiqueta_estado(estado)}"


# Nombres que no identifican un proveedor. No agrupan líneas entre sí.
_NOMBRES_SIN_PROVEEDOR = {
    "proveedor",
    "proveedor catálogo",
    "proveedor catalogo",
    "sin proveedor",
    "sin proveedor seleccionado",
    "sin proveedor asignado",
    "varios proveedores",
}


def _nombre_generico(nombre: str) -> bool:
    return (nombre or "").strip().casefold() in _NOMBRES_SIN_PROVEEDOR


def _proveedor_linea(it: dict) -> tuple:
    """Proveedor guardado en la línea.

    Agrupar, el título, Prov. y la OC leen este mismo dato. No se calcula otro.
    """
    if it.get("_proveedor_hidratado"):
        pid = it.get("proveedor_efectivo_id")
        nombre = (it.get("proveedor_efectivo_nombre") or "").strip()
    else:
        pid = it.get("proveedor_seleccionado_id")
        nombre = (it.get("proveedor_seleccionado_nombre") or it.get("proveedor_nombre") or "").strip()
    try:
        pid_i = int(pid) if pid not in (None, "") else None
    except (TypeError, ValueError):
        pid_i = None
    if pid_i:
        return f"id:{pid_i}", (nombre or f"Proveedor {pid_i}")
    if nombre and not _nombre_generico(nombre):
        return f"nombre:{nombre.casefold()}", nombre
    return "sin_proveedor", "Sin proveedor asignado"


def contar_insumos_sin_proveedor(items: List[dict]) -> int:
    """Líneas con insumo cuyo proveedor sigue sin poder leerse."""
    n = 0
    for it in items or []:
        if not it.get("insumo_id") or it.get("es_recurrente"):
            continue
        if (it.get("estado_validacion") or "").strip() == "rechazado":
            continue
        clave, _etiqueta = _proveedor_linea(it)
        if clave == "sin_proveedor":
            n += 1
    return n


def bucket_de_linea(it: dict) -> dict:
    """Clasifica una línea. Rechazadas y sin insumo no se mezclan con un proveedor."""
    ev = (it.get("estado_validacion") or "").strip()
    if ev == "rechazado":
        return {
            "clave": "rechazadas",
            "proveedor": "Rechazadas",
            "estado": "rechazada",
            "orden": (3, "rechazadas"),
        }
    if not it.get("insumo_id"):
        return {
            "clave": "sin_insumo",
            "proveedor": "Sin proveedor",
            "estado": "enviada",
            "orden": (2, "sin_insumo"),
        }
    clave_p, etiqueta = _proveedor_linea(it)
    if ev == "aprobado":
        return {
            "clave": f"aprobada:{clave_p}",
            "proveedor": etiqueta,
            # El título distingue las líneas ya aprobadas. La cabecera sigue
            # enviada: aprobada en la solicitud significa que la OC ya se generó.
            "estado": "aprobada",
            "estado_cabecera": "enviada",
            "orden": (0, etiqueta.casefold()),
        }
    return {
        "clave": f"pendiente:{clave_p}",
        "proveedor": etiqueta,
        "estado": "enviada",
        "orden": (1, etiqueta.casefold()),
    }


def _linea_agrupable(it: dict) -> bool:
    """Solo pendiente o aprobado, y que no esté ya en una orden de compra."""
    if not it or it.get("en_orden_compra"):
        return False
    ev = (it.get("estado_validacion") or "").strip()
    return ev in ("", "pendiente", "aprobado")


def _cabecera_grupo(g: dict) -> str:
    return g.get("estado_cabecera") or g.get("estado") or "enviada"


def estado_abierto(lineas: List[dict]) -> str:
    """Borrador si ninguna línea entró a validación. Si hay pendientes, la solicitud queda enviada."""
    marcas = [(it.get("estado_validacion") or "").strip() for it in lineas]
    if marcas and all(m == "" for m in marcas):
        return "borrador"
    return "enviada"


def etiqueta_proveedor(items: List[dict]) -> str:
    if not items:
        return "Vacía"
    claves = []
    etiqueta = ""
    for it in items:
        b = bucket_de_linea(it)
        claves.append(b["clave"])
        etiqueta = b["proveedor"]
    if len(set(claves)) == 1:
        return etiqueta
    return "Varios proveedores"


def titulo_para_solicitud(sol: dict, items: List[dict]) -> str:
    return format_titulo_grupo(
        sol.get("consecutivo"),
        sol.get("created_at"),
        etiqueta_proveedor(items),
        sol.get("estado") or "borrador",
    )


def _sort_sol(sol: dict) -> tuple:
    try:
        consec = int(sol.get("consecutivo") or 0)
    except (TypeError, ValueError):
        consec = 0
    try:
        sid = int(sol.get("id") or 0)
    except (TypeError, ValueError):
        sid = 0
    return (consec, sid)


def planificar_agrupacion(
    solicitudes: List[dict],
    items: List[dict],
    solicitudes_con_oc: Optional[set] = None,
) -> dict:
    """Plan estable. La segunda pasada, con el resultado ya aplicado, no mueve nada.

    Las solicitudes con OC quedan fuera: ni sus líneas ni ellas como destino.
    """
    congeladas = {int(x) for x in (solicitudes_con_oc or set()) if x}
    libres = [dict(s) for s in solicitudes if int(s.get("id") or 0) not in congeladas]
    libres.sort(key=_sort_sol)
    por_id = {int(s["id"]): s for s in libres if s.get("id")}

    anclas = set()
    n_ancla = 0
    items_libres = []
    for it in items or []:
        try:
            sid = int(it.get("solicitud_id") or 0)
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if not sid or not iid or sid in congeladas or sid not in por_id:
            continue
        if not _linea_agrupable(it):
            # Rechazada o ya comprada: se queda. Esa solicitud no recibe otras líneas.
            anclas.add(sid)
            n_ancla += 1
            continue
        row = dict(it)
        row["solicitud_id"] = sid
        row["id"] = iid
        items_libres.append(row)

    grupos: Dict[str, dict] = {}
    for it in items_libres:
        b = bucket_de_linea(it)
        g = grupos.get(b["clave"])
        if not g:
            g = {**b, "items": []}
            grupos[b["clave"]] = g
        g["items"].append(it)
    for g in grupos.values():
        if g["clave"] == "sin_insumo" or str(g["clave"]).startswith("pendiente:"):
            g["estado"] = estado_abierto(g["items"])
            g["estado_cabecera"] = g["estado"]

    por_sol: Dict[int, List[dict]] = {}
    for it in items_libres:
        por_sol.setdefault(int(it["solicitud_id"]), []).append(it)

    candidatos: Dict[str, List[dict]] = {}
    for sol in libres:
        sid = int(sol["id"])
        if sid in anclas:
            continue
        its = por_sol.get(sid) or []
        if not its:
            continue
        claves = {bucket_de_linea(it)["clave"] for it in its}
        if len(claves) == 1:
            candidatos.setdefault(next(iter(claves)), []).append(sol)

    asignacion: Dict[str, Optional[dict]] = {}
    usadas = set()
    for clave, sols in candidatos.items():
        if clave not in grupos:
            continue
        sols.sort(key=_sort_sol)
        asignacion[clave] = sols[0]
        usadas.add(int(sols[0]["id"]))

    restantes = [g for g in grupos.values() if g["clave"] not in asignacion]
    restantes.sort(key=lambda g: g["orden"])
    huecos = [s for s in libres if int(s["id"]) not in usadas and int(s["id"]) not in anclas]
    por_crear = 0
    for g in restantes:
        if huecos:
            sol = huecos.pop(0)
            asignacion[g["clave"]] = sol
            usadas.add(int(sol["id"]))
        else:
            por_crear += 1
            asignacion[g["clave"]] = None

    movimientos = []
    filas = []
    ajustes = []
    for g in sorted(grupos.values(), key=lambda x: x["orden"]):
        dest = asignacion.get(g["clave"])
        dest_id = int(dest["id"]) if dest else None
        se_mueven = 0
        detalle = []
        for it in g["items"]:
            origen = int(it["solicitud_id"])
            origen_sol = por_id.get(origen) or {}
            se_mueve = dest_id is None or origen != dest_id
            desc = (it.get("descripcion_solicitada") or it.get("material_descripcion") or "").strip()
            detalle.append({
                "item_id": int(it["id"]),
                "numero_linea": it.get("numero_linea"),
                "descripcion": desc[:90],
                "se_mueve": se_mueve,
                "desde": origen_sol.get("consecutivo"),
            })
            if se_mueve:
                se_mueven += 1
                movimientos.append({
                    "item_id": int(it["id"]),
                    "estado_validacion": it.get("estado_validacion"),
                    "antes": {
                        "solicitud_id": origen,
                        "numero_linea": it.get("numero_linea"),
                        "consecutivo": origen_sol.get("consecutivo"),
                        "titulo": origen_sol.get("titulo"),
                        "estado": origen_sol.get("estado"),
                    },
                    "despues": {
                        "solicitud_id": dest_id,
                        "consecutivo": dest.get("consecutivo") if dest else None,
                        "estado": g["estado"],
                        "proveedor": g["proveedor"],
                    },
                })
        titulo = None
        if dest:
            titulo = format_titulo_grupo(
                dest.get("consecutivo"), dest.get("created_at"), g["proveedor"], g["estado"],
            )
            cabecera = _cabecera_grupo(g)
            if (dest.get("estado") or "") != cabecera:
                ajustes.append({
                    "solicitud_id": dest_id,
                    "campo": "estado",
                    "antes": dest.get("estado"),
                    "despues": cabecera,
                })
            if (dest.get("titulo") or "") != titulo:
                ajustes.append({
                    "solicitud_id": dest_id,
                    "campo": "titulo",
                    "antes": dest.get("titulo"),
                    "despues": titulo,
                })
        filas.append({
            "clave": g["clave"],
            "proveedor": g["proveedor"],
            "estado": g["estado"],
            "estado_cabecera": _cabecera_grupo(g),
            "estado_label": etiqueta_estado(g["estado"]),
            "lineas": len(g["items"]),
            "se_mueven": se_mueven,
            "solicitud_id": dest_id,
            "consecutivo": dest.get("consecutivo") if dest else None,
            "crear": dest is None,
            "titulo": titulo,
            "item_ids": [int(it["id"]) for it in g["items"]],
            "lineas_detalle": detalle,
        })

    vacias = []
    for sol in libres:
        sid = int(sol["id"])
        if sid in usadas or sid in anclas:
            continue
        titulo = format_titulo_grupo(sol.get("consecutivo"), sol.get("created_at"), "Vacía", "borrador")
        if (sol.get("estado") or "") != "borrador":
            ajustes.append({
                "solicitud_id": sid,
                "campo": "estado",
                "antes": sol.get("estado"),
                "despues": "borrador",
            })
        if (sol.get("titulo") or "") != titulo:
            ajustes.append({
                "solicitud_id": sid,
                "campo": "titulo",
                "antes": sol.get("titulo"),
                "despues": titulo,
            })
        vacias.append({
            "solicitud_id": sid,
            "consecutivo": sol.get("consecutivo"),
            "titulo": titulo,
            "lineas": len(por_sol.get(sid) or []),
        })

    se_mueven = len(movimientos)
    sin_cambios = se_mueven == 0 and por_crear == 0 and not ajustes
    en_grupos = sum(len(g.get("item_ids") or []) for g in filas)
    lineas_congeladas = 0
    for it in items or []:
        try:
            sid = int(it.get("solicitud_id") or 0)
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if sid and iid and sid in congeladas:
            lineas_congeladas += 1
    return {
        "grupos": filas,
        "vacias": vacias,
        "por_crear": por_crear,
        "se_mueven": se_mueven,
        "movimientos": movimientos,
        "ajustes": ajustes,
        "sin_cambios": sin_cambios,
        "congeladas": len(congeladas),
        "lineas_libres": len(items_libres),
        "lineas_en_grupos": en_grupos,
        "lineas_congeladas": lineas_congeladas,
        "lineas_total": len(items_libres) + lineas_congeladas + n_ancla,
    }


def _objeto_ausente(exc: BaseException) -> bool:
    low = str(exc).lower()
    return any(
        tok in low
        for tok in ("does not exist", "pgrst205", "schema cache", "could not find", "42703")
    )


def _parse_expira(raw) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def exigir_solicitud_libre(sb, contrato_id: int, solicitud_id: int, user_id: int) -> None:
    """Mientras otro usuario agrupa, no se editan las solicitudes incluidas."""
    try:
        rows = (
            sb.table(_TABLA_BLOQUEO)
            .select("usuario_id, solicitud_ids, expires_at")
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _objeto_ausente(exc):
            return
        _log.warning("No se pudo leer el bloqueo de agrupación: %s", exc)
        return
    if not rows:
        return
    row = rows[0]
    expira = _parse_expira(row.get("expires_at"))
    if not expira or expira <= datetime.now(timezone.utc):
        return
    try:
        dueno = int(row.get("usuario_id") or 0)
    except (TypeError, ValueError):
        dueno = 0
    if dueno and dueno == int(user_id or 0):
        return
    ids = row.get("solicitud_ids") or []
    if isinstance(ids, str):
        return
    try:
        marcadas = {int(x) for x in ids}
    except (TypeError, ValueError):
        return
    if int(solicitud_id) not in marcadas:
        return
    raise ValueError(
        "Esta solicitud se está agrupando. Espere a que termine para editarla."
    )


def _adquirir_bloqueo(sb, contrato_id: int, user_id: int, solicitud_ids: List[int]) -> bool:
    now = datetime.now(timezone.utc)
    payload = {
        "contrato_id": int(contrato_id),
        "usuario_id": int(user_id),
        "solicitud_ids": [int(x) for x in solicitud_ids],
        "started_at": now.isoformat(),
        "expires_at": (now + BLOQUEO_TTL).isoformat(),
    }
    try:
        rows = (
            sb.table(_TABLA_BLOQUEO)
            .select("usuario_id, expires_at")
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _objeto_ausente(exc):
            return False
        raise ValueError("No se pudo bloquear la edición de las solicitudes.") from exc
    if rows:
        expira = _parse_expira(rows[0].get("expires_at"))
        dueno = int(rows[0].get("usuario_id") or 0)
        if expira and expira > now and dueno and dueno != int(user_id):
            raise ValueError(
                "Otro usuario está agrupando estas solicitudes. Espere a que termine."
            )
    try:
        sb.table(_TABLA_BLOQUEO).upsert(payload, on_conflict="contrato_id").execute()
        check = (
            sb.table(_TABLA_BLOQUEO)
            .select("usuario_id, expires_at")
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _objeto_ausente(exc):
            return False
        raise ValueError("No se pudo bloquear la edición de las solicitudes.") from exc
    if check:
        dueno = int(check[0].get("usuario_id") or 0)
        expira = _parse_expira(check[0].get("expires_at"))
        if dueno and dueno != int(user_id) and expira and expira > datetime.now(timezone.utc):
            raise ValueError(
                "Otro usuario está agrupando estas solicitudes. Espere a que termine."
            )
    return True


def _liberar_bloqueo(sb, contrato_id: int, user_id: int) -> None:
    try:
        (
            sb.table(_TABLA_BLOQUEO)
            .delete()
            .eq("contrato_id", int(contrato_id))
            .eq("usuario_id", int(user_id))
            .execute()
        )
    except Exception as exc:
        if not _objeto_ausente(exc):
            _log.warning("No se pudo soltar el bloqueo de agrupación: %s", exc)


def _trozos(seq, n: int):
    lista = list(seq or [])
    paso = max(1, int(n))
    for i in range(0, len(lista), paso):
        yield lista[i:i + paso]


def _paginar(make, page: int = 1000) -> List[dict]:
    """Lee todas las filas. En producción pagina; el doble de pruebas no tiene range."""
    out: List[dict] = []
    start = 0
    while start < 200000:
        q = make()
        ranger = getattr(q, "range", None)
        if callable(ranger):
            q = ranger(start, start + page - 1)
        rows = q.execute().data or []
        out.extend(rows)
        if not callable(ranger) or len(rows) < page:
            break
        start += page
    return out


def hidratar_proveedor_lineas(sb, items: List[dict], *, estricto: bool = False) -> int:
    """Guarda el proveedor que faltaba y deja en memoria solo ese dato.

    ``estricto`` hace fallar Agrupar si el guardado no se pudo escribir.
    El nombre de una sola solicitud sigue aunque esa escritura falle.
    """
    if not items:
        return 0
    n = 0
    try:
        from almacen_service import completar_proveedor_guardado

        n = int(completar_proveedor_guardado(sb, items) or 0)
    except Exception as exc:
        _log.exception("No se pudo guardar el proveedor del insumo")
        if estricto:
            motivo = " ".join(str(exc or "").split())[:220]
            raise ValueError(
                "No se pudo guardar el proveedor de las líneas que ya tenían insumo. "
                "No se movió ninguna línea."
                + (f" Motivo: {motivo}" if motivo else "")
            ) from exc
    for it in items:
        pid = it.get("proveedor_seleccionado_id")
        nombre = (it.get("proveedor_seleccionado_nombre") or "").strip()
        if pid not in (None, "") or (nombre and not _nombre_generico(nombre)):
            it["proveedor_efectivo_id"] = pid
            it["proveedor_efectivo_nombre"] = nombre
        elif it.get("es_recurrente"):
            it["proveedor_efectivo_id"] = None
            it["proveedor_efectivo_nombre"] = "Compra recurrente"
        else:
            it["proveedor_efectivo_id"] = None
            it["proveedor_efectivo_nombre"] = ""
        it["_proveedor_hidratado"] = True
    return n


def sincronizar_titulo_solicitud(sb, solicitud_id: int) -> Optional[str]:
    """Deja el nombre al día. No escribe si el proveedor y el estado no cambiaron el texto."""
    try:
        heads = (
            sb.table("almacen_solicitud")
            .select("id, consecutivo, created_at, estado, titulo")
            .eq("id", int(solicitud_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("No se pudo leer la solicitud %s para el nombre: %s", solicitud_id, exc)
        return None
    if not heads:
        return None
    sol = heads[0]
    items: List[dict] = []
    selects = (
        "id, insumo_id, estado_validacion, proveedor_seleccionado_id, proveedor_seleccionado_nombre",
        "id, insumo_id, estado_validacion",
        "id, estado_validacion",
    )
    for select in selects:
        try:
            items = (
                sb.table("almacen_solicitud_item")
                .select(select)
                .eq("solicitud_id", int(solicitud_id))
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:
            if not _objeto_ausente(exc):
                _log.warning("Ítems de solicitud %s: %s", solicitud_id, exc)
                return None
    if items and "insumo_id" not in items[0]:
        return None
    if items:
        hidratar_proveedor_lineas(sb, items)
    nuevo = titulo_para_solicitud(sol, items)
    if (sol.get("titulo") or "") == nuevo:
        return nuevo
    try:
        sb.table("almacen_solicitud").update({"titulo": nuevo}).eq("id", int(solicitud_id)).execute()
    except Exception as exc:
        _log.warning("No se pudo guardar el nombre de la solicitud %s: %s", solicitud_id, exc)
        return None
    return nuevo


def _select_head(sb, contrato_id: int) -> List[dict]:
    def make():
        return (
            sb.table("almacen_solicitud")
            .select("id, contrato_id, consecutivo, titulo, estado, created_at, motivo_rechazo, validada_at")
            .eq("contrato_id", int(contrato_id))
        )

    return _paginar(make)


def _select_items(sb, solicitud_ids: List[int]) -> List[dict]:
    if not solicitud_ids:
        return []
    selects = (
        "id, solicitud_id, numero_linea, descripcion_solicitada, insumo_id, estado_validacion, "
        "proveedor_seleccionado_id, proveedor_seleccionado_nombre, cantidad, valor_compra_unitario, "
        "cotizacion_numero_seleccionada, cotizacion_seleccionada_id",
        "id, solicitud_id, numero_linea, insumo_id, estado_validacion, proveedor_seleccionado_id, "
        "proveedor_seleccionado_nombre, cantidad, valor_compra_unitario",
        "id, solicitud_id, numero_linea, insumo_id, estado_validacion",
    )
    last = None
    for select in selects:
        try:
            rows: List[dict] = []
            for chunk in _trozos(solicitud_ids, 120):
                rows.extend(_paginar(lambda chunk=chunk, select=select: (
                    sb.table("almacen_solicitud_item")
                    .select(select)
                    .in_("solicitud_id", chunk)
                )))
            return rows
        except Exception as exc:
            last = exc
            if not _objeto_ausente(exc):
                raise
    if last:
        raise ValueError("No se pudieron leer las líneas de las solicitudes.") from last
    return []


def _select_items_por_id(sb, item_ids: List[int]) -> List[dict]:
    if not item_ids:
        return []
    rows: List[dict] = []
    for chunk in _trozos(item_ids, 120):
        rows.extend(_paginar(lambda chunk=chunk: (
            sb.table("almacen_solicitud_item")
            .select("id, solicitud_id, numero_linea, insumo_id, estado_validacion")
            .in_("id", chunk)
        )))
    return rows


def _marcar_lineas_en_oc(sb, items: List[dict]) -> None:
    """Marca las líneas que ya están en una OC para que Agrupar no las mueva.

    La solicitud cerrada se congela por su id. Esta marca cubre la línea
    aunque la orden no traiga ese solicitud_id: no se puede volver a comprar.
    """
    ids = []
    for it in items or []:
        try:
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if iid:
            ids.append(iid)
    if not ids:
        return
    encontrados = set()
    for chunk in _trozos(ids, 120):
        try:
            rows = (
                sb.table("almacen_orden_compra_item")
                .select("solicitud_item_id")
                .in_("solicitud_item_id", list(chunk))
                .execute()
                .data
                or []
            )
        except Exception as exc:
            if _objeto_ausente(exc):
                return
            raise
        for row in rows:
            try:
                encontrados.add(int(row.get("solicitud_item_id") or 0))
            except (TypeError, ValueError):
                continue
    if not encontrados:
        return
    for it in items:
        try:
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if iid in encontrados:
            it["en_orden_compra"] = True


def _ids_con_oc(sb, contrato_id: int, solicitud_ids: Optional[List[int]] = None) -> set:
    """Solicitudes con OC. También las busca por id, no solo por contrato.

    La grilla muestra Reabrir OC con la orden ligada a la solicitud. Si esa
    orden no trae el mismo contrato_id, Agrupar igual no debe moverla.
    """
    encontrados = set()

    def tomar(rows) -> None:
        for row in rows or []:
            if row.get("solicitud_id") in (None, ""):
                continue
            try:
                encontrados.add(int(row["solicitud_id"]))
            except (TypeError, ValueError):
                continue

    consultas = [
        lambda: (
            sb.table("almacen_orden_compra")
            .select("solicitud_id")
            .eq("contrato_id", int(contrato_id))
        )
    ]
    ids = [int(x) for x in (solicitud_ids or []) if x]
    for chunk in _trozos(ids, 120):
        consultas.append(
            lambda chunk=chunk: (
                sb.table("almacen_orden_compra")
                .select("solicitud_id")
                .in_("solicitud_id", list(chunk))
            )
        )
    for make in consultas:
        try:
            tomar(make().execute().data or [])
        except Exception as exc:
            if not _objeto_ausente(exc):
                raise
    return encontrados


def _anexar_totales(plan: dict, items: List[dict], *, ver_economicos: bool) -> None:
    """Suma cantidad × valor ya guardado en la línea. No vuelve a leer cotizaciones."""
    if not ver_economicos:
        for g in plan["grupos"]:
            g.pop("total", None)
        return
    por_item: Dict[int, Optional[float]] = {}
    for it in items:
        try:
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        try:
            cant = float(it.get("cantidad") or 0)
            unit = float(it.get("valor_compra_unitario") or 0)
        except (TypeError, ValueError):
            por_item[iid] = None
            continue
        por_item[iid] = round(cant * unit, 2) if cant > 0 and unit > 0 else None
    for g in plan["grupos"]:
        total = 0.0
        alguno = False
        for iid in g.get("item_ids") or []:
            val = por_item.get(int(iid))
            if val is None:
                continue
            total += val
            alguno = True
        g["total"] = round(total, 2) if alguno else None


def frase_accion_agrupar(plan: dict) -> str:
    """Una o dos frases: qué hará Agrupar, sin el detalle de cada línea."""
    if plan.get("sin_cambios"):
        return "Ejecutar de nuevo no cambia nada: las solicitudes ya están agrupadas."
    n = int(plan.get("se_mueven") or 0)
    destinos = sum(1 for g in plan.get("grupos") or [] if int(g.get("se_mueven") or 0) > 0)
    frase = f"Se mueven {n} línea(s) hacia {destinos} destino(s)."
    por_crear = int(plan.get("por_crear") or 0)
    if por_crear:
        frase += (
            f" Faltan {por_crear} solicitud(es); solo se crean si lo confirma, ninguna de más."
        )
    else:
        frase += " No se crea ninguna solicitud nueva."
    return frase


def _texto_excepcion(exc: BaseException) -> str:
    partes = [str(exc or "")]
    for attr in ("message", "details", "hint", "code"):
        val = getattr(exc, attr, None)
        if val not in (None, ""):
            partes.append(str(val))
    return " ".join(partes)


def _es_choque_numero(exc: BaseException) -> bool:
    low = _texto_excepcion(exc).lower()
    return any(tok in low for tok in ("23505", "duplicate key", "idx_almacen_solicitud_item_linea", "unique"))


def _motivo_publico(exc: BaseException) -> str:
    texto = (getattr(exc, "message", None) or str(exc) or "").strip()
    texto = " ".join(texto.split())
    if texto.startswith("{") and getattr(exc, "message", None):
        texto = " ".join(str(exc.message).split())
    return texto[:220]


def mensaje_error_agrupar(exc: BaseException) -> str:
    """Texto para la persona. El choque de números se traduce; el resto deja el motivo."""
    if _es_choque_numero(exc):
        return (
            "No se pudo agrupar porque una línea iba a repetir el número dentro de la solicitud "
            "de destino. No quedó ningún movimiento aplicado. Intente de nuevo."
        )
    if isinstance(exc, ValueError):
        texto = str(exc).strip()
        low = texto.lower()
        if texto and not any(tok in low for tok in ("pgrst", "postgres", "sql", "constraint", "column")):
            return texto
    motivo = _motivo_publico(exc)
    base = "No se pudo agrupar las solicitudes. No quedó ningún movimiento aplicado."
    if not motivo:
        return base + " Intente de nuevo."
    return f"{base} Motivo: {motivo}"


def _numero_entero(raw) -> Optional[int]:
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def asignar_numeros_destino(items: List[dict], movimientos: List[dict]) -> None:
    """Cada línea que cambia de solicitud recibe el siguiente número libre en el destino.

    Los números que ya existen se reservan, también los de líneas que saldrán:
    así el update no choca con el índice único (solicitud_id, numero_linea).
    """
    ocupados: Dict[int, set] = {}
    for it in items or []:
        sid = _numero_entero(it.get("solicitud_id"))
        num = _numero_entero(it.get("numero_linea"))
        if sid and num and num > 0:
            ocupados.setdefault(sid, set()).add(num)
    for mov in movimientos or []:
        dest = _numero_entero((mov.get("despues") or {}).get("solicitud_id"))
        if not dest:
            continue
        usados = ocupados.setdefault(dest, set())
        n = 1
        while n in usados:
            n += 1
            if n > 100000:
                raise ValueError("No hay un número de línea libre en la solicitud de destino.")
        usados.add(n)
        antes = mov.setdefault("antes", {})
        antes.setdefault("numero_linea", None)
        mov.setdefault("despues", {})["numero_linea"] = n


def _rpc_ausente(exc: BaseException) -> bool:
    low = str(exc or "").lower()
    if "pgrst202" in low or "could not find the function" in low or "42883" in low:
        return True
    return "function" in low and "does not exist" in low


def _restaurar_lineas(sb, originales: List[dict]) -> None:
    for row in originales or []:
        item_id = row.get("item_id")
        if not item_id or row.get("solicitud_id") in (None, ""):
            continue
        payload: Dict[str, Any] = {"solicitud_id": int(row["solicitud_id"])}
        numero = _numero_entero(row.get("numero_linea"))
        if numero:
            payload["numero_linea"] = numero
        try:
            (
                sb.table("almacen_solicitud_item")
                .update(payload)
                .eq("id", int(item_id))
                .execute()
            )
            _reasignar_mensajes_linea(sb, int(item_id), int(row["solicitud_id"]))
        except Exception:
            _log.exception("No se pudo devolver la línea %s a su solicitud", item_id)


def _descartar_solicitudes_creadas(sb, creadas: List[dict]) -> None:
    for creada in creadas or []:
        sid = creada.get("id")
        if not sid:
            continue
        try:
            sb.table("almacen_solicitud").delete().eq("id", int(sid)).execute()
        except Exception:
            _log.exception("No se pudo descartar la solicitud creada %s", sid)


def _mover_lineas_rpc(sb, filas: List[dict]) -> bool:
    """True si la función de la base movió todo. Si falla, no dejó filas a medias."""
    rpc = getattr(sb, "rpc", None)
    if not callable(rpc) or not filas:
        return False
    try:
        rpc("almacen_agrupar_mover_lineas", {"p_moves": filas}).execute()
        return True
    except Exception as exc:
        # La función va en una sola transacción: si responde error, no dejó filas a medias.
        _log.warning("La función de mover líneas no aplicó (%s). Se usa UPDATE.", exc)
        return False


def _aplicar_update_linea(sb, item_id: int, payload: dict) -> None:
    sb.table("almacen_solicitud_item").update(payload).eq("id", int(item_id)).execute()


def _mover_lineas_update(sb, filas: List[dict]) -> None:
    """Aparta el número y después mueve. Así no choca el índice (solicitud, número)."""
    preparados = []
    for fila in filas or []:
        item_id = fila.get("item_id") if fila.get("item_id") not in (None, "") else fila.get("id")
        sid = fila.get("solicitud_id")
        numero = fila.get("numero_linea")
        if item_id in (None, "") or sid in (None, "") or not numero:
            continue
        preparados.append((int(item_id), int(sid), int(numero)))
    for i, (item_id, _sid, _numero) in enumerate(preparados, start=1):
        # Número alto y temporal. El índice único es (solicitud, número):
        # apartar primero deja libre el número viejo antes de ocupar el nuevo.
        _aplicar_update_linea(sb, item_id, {"numero_linea": 1_500_000_000 + i})
    for item_id, sid, numero in preparados:
        _aplicar_update_linea(sb, item_id, {
            "solicitud_id": sid,
            "numero_linea": numero,
        })


def _mover_lineas_bloque(sb, filas: List[dict]) -> None:
    if not filas:
        return
    if _mover_lineas_rpc(sb, filas):
        return
    _mover_lineas_update(sb, filas)


def _reasignar_mensajes_bloque(sb, filas: List[dict]) -> None:
    """Los mensajes que citan la línea siguen con ella. Una lectura y un update por destino."""
    dest_por_item: Dict[int, int] = {}
    for fila in filas or []:
        try:
            dest_por_item[int(fila["item_id"])] = int(fila["solicitud_id"])
        except (TypeError, ValueError, KeyError):
            continue
    if not dest_por_item:
        return
    mensajes: List[dict] = []
    try:
        for chunk in _trozos(list(dest_por_item), 120):
            mensajes.extend(
                sb.table("almacen_solicitud_mensaje")
                .select("id, solicitud_item_id")
                .in_("solicitud_item_id", chunk)
                .execute()
                .data
                or []
            )
    except Exception as exc:
        if _objeto_ausente(exc):
            return
        raise
    por_dest: Dict[int, List[int]] = {}
    for row in mensajes:
        try:
            mid = int(row["id"])
            item_id = int(row["solicitud_item_id"])
        except (TypeError, ValueError, KeyError):
            continue
        dest = dest_por_item.get(item_id)
        if dest:
            por_dest.setdefault(dest, []).append(mid)
    for dest, ids in por_dest.items():
        for chunk in _trozos(ids, 120):
            (
                sb.table("almacen_solicitud_mensaje")
                .update({"solicitud_id": int(dest)})
                .in_("id", chunk)
                .execute()
            )
            try:
                (
                    sb.table("almacen_solicitud_mensaje_destinatario")
                    .update({"solicitud_id": int(dest)})
                    .in_("mensaje_id", chunk)
                    .execute()
                )
            except Exception as exc:
                if not _objeto_ausente(exc):
                    raise


def _aplicar_cabeceras(sb, cambios: List[dict]) -> None:
    if not cambios:
        return

    def uno(cambio: dict) -> None:
        (
            sb.table("almacen_solicitud")
            .update(cambio["payload"])
            .eq("id", int(cambio["solicitud_id"]))
            .execute()
        )

    if len(cambios) < 24:
        for cambio in cambios:
            uno(cambio)
        return
    errores: List[BaseException] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futuros = [pool.submit(uno, cambio) for cambio in cambios]
        for fut in as_completed(futuros):
            exc = fut.exception()
            if exc:
                errores.append(exc)
    if errores:
        raise errores[0]


def _restaurar_cabeceras(sb, antes: Dict[int, dict], tocadas: List[int]) -> None:
    for sid in tocadas or []:
        previo = antes.get(int(sid)) or {}
        payload = {}
        if "estado" in previo:
            payload["estado"] = previo.get("estado")
        if "titulo" in previo:
            payload["titulo"] = previo.get("titulo")
        if not payload:
            continue
        try:
            sb.table("almacen_solicitud").update(payload).eq("id", int(sid)).execute()
        except Exception:
            _log.exception("No se pudo devolver el nombre de la solicitud %s", sid)


def _reasignar_mensajes_linea(sb, item_id: int, dest_id: int) -> None:
    """Los mensajes que citan la línea siguen con ella, en la solicitud de destino."""
    try:
        rows = (
            sb.table("almacen_solicitud_mensaje")
            .select("id")
            .eq("solicitud_item_id", int(item_id))
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _objeto_ausente(exc):
            return
        raise
    if not rows:
        return
    ids = [int(r["id"]) for r in rows if r.get("id")]
    sb.table("almacen_solicitud_mensaje").update(
        {"solicitud_id": int(dest_id)}
    ).eq("solicitud_item_id", int(item_id)).execute()
    if ids:
        sb.table("almacen_solicitud_mensaje_destinatario").update(
            {"solicitud_id": int(dest_id)}
        ).in_("mensaje_id", ids).execute()


def vista_publica(plan: dict, *, ver_economicos: bool) -> dict:
    grupos = []
    for g in plan["grupos"]:
        fila = {
            "proveedor": g["proveedor"],
            "estado": g["estado"],
            "estado_label": g["estado_label"],
            "lineas": g["lineas"],
            "se_mueven": g["se_mueven"],
            "solicitud_id": g["solicitud_id"],
            "consecutivo": g["consecutivo"],
            "crear": g["crear"],
            "titulo": g["titulo"],
            "lineas_detalle": g.get("lineas_detalle") or [],
        }
        if ver_economicos:
            fila["total"] = g.get("total")
        grupos.append(fila)
    return {
        "grupos": grupos,
        "vacias": [
            {
                "solicitud_id": v["solicitud_id"],
                "consecutivo": v["consecutivo"],
                "titulo": v["titulo"],
                "lineas": v["lineas"],
            }
            for v in plan["vacias"]
        ],
        "por_crear": plan["por_crear"],
        "se_mueven": plan["se_mueven"],
        "sin_cambios": plan["sin_cambios"],
        "congeladas": plan["congeladas"],
        "ver_economicos": ver_economicos,
        "resumen_accion": frase_accion_agrupar(plan),
        "lineas_total": plan.get("lineas_total"),
    }


def diagnostico_actual(
    solicitudes: List[dict],
    items: List[dict],
    solicitudes_con_oc: Optional[set] = None,
) -> dict:
    """Estado actual: mezclas, vacías y títulos que no coinciden con el proveedor."""
    congeladas = {int(x) for x in (solicitudes_con_oc or set()) if x}
    por_sol: Dict[int, List[dict]] = {}
    lineas_total = 0
    for it in items or []:
        try:
            sid = int(it.get("solicitud_id") or 0)
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if not sid or not iid:
            continue
        lineas_total += 1
        if sid in congeladas:
            continue
        por_sol.setdefault(sid, []).append(it)
    por_id: Dict[int, dict] = {}
    for sol in solicitudes or []:
        try:
            por_id[int(sol["id"])] = sol
        except (TypeError, ValueError, KeyError):
            continue
    mezcladas = []
    vacias = []
    titulos = []
    for sid, sol in por_id.items():
        if sid in congeladas:
            continue
        its = por_sol.get(sid) or []
        if not its:
            vacias.append({
                "solicitud_id": sid,
                "consecutivo": sol.get("consecutivo"),
                "titulo": sol.get("titulo") or "",
            })
            continue
        vistos: List[str] = []
        claves = set()
        for it in its:
            b = bucket_de_linea(it)
            claves.add(b["clave"])
            if b["proveedor"] not in vistos:
                vistos.append(b["proveedor"])
        if len(claves) > 1:
            mezcladas.append({
                "solicitud_id": sid,
                "consecutivo": sol.get("consecutivo"),
                "titulo": sol.get("titulo") or "",
                "proveedores": vistos,
            })
        esperado = titulo_para_solicitud(sol, its)
        if (sol.get("titulo") or "") != esperado:
            titulos.append({
                "solicitud_id": sid,
                "consecutivo": sol.get("consecutivo"),
                "titulo": sol.get("titulo") or "",
                "esperado": esperado,
            })
    return {
        "lineas_total": lineas_total,
        "mezcladas": mezcladas,
        "vacias": vacias,
        "titulos_distintos": titulos,
    }


def frase_diagnostico(diag: dict) -> str:
    n = len(diag.get("mezcladas") or [])
    v = len(diag.get("vacias") or [])
    t = len(diag.get("titulos_distintos") or [])
    total = int(diag.get("lineas_total") or 0)
    if n == 0 and t == 0:
        extra = f" {v} solicitud(es) están vacías." if v else ""
        return f"Ninguna solicitud libre mezcla proveedores.{extra} Hay {total} líneas en total."
    return (
        f"Hay {n} solicitud(es) con líneas de más de un proveedor, "
        f"{v} vacía(s) y {t} con el nombre distinto al de sus líneas. "
        f"El total de líneas es {total}."
    )


def vista_previa_agrupacion(contrato_id: int, *, ver_economicos: bool = False) -> dict:
    from almacen_service import _sb

    t0 = time.perf_counter()
    sb = _sb()
    sols = _select_head(sb, contrato_id)
    ids = [int(s["id"]) for s in sols if s.get("id")]
    items = _select_items(sb, ids)
    oc_ids = _ids_con_oc(sb, contrato_id, ids)
    completados = hidratar_proveedor_lineas(sb, items, estricto=True)
    _marcar_lineas_en_oc(sb, items)
    plan = planificar_agrupacion(sols, items, oc_ids)
    _anexar_totales(plan, items, ver_economicos=ver_economicos)
    publica = vista_publica(plan, ver_economicos=ver_economicos)
    publica["proveedores_completados"] = completados
    sin_reconocer = contar_insumos_sin_proveedor(items)
    publica["lineas_sin_reconocer"] = sin_reconocer
    if sin_reconocer and publica.get("sin_cambios"):
        publica["resumen_accion"] = (
            f"Hay {sin_reconocer} línea(s) con insumo cuyo proveedor no se pudo leer. "
            "Esas solicitudes no se pueden separar todavía."
        )
    diag = diagnostico_actual(sols, items, oc_ids)
    publica["diagnostico"] = {
        "mezcladas": diag["mezcladas"],
        "vacias": diag["vacias"],
        "titulos_distintos": diag["titulos_distintos"],
        "lineas_total": diag["lineas_total"],
    }
    publica["diagnostico_texto"] = frase_diagnostico(diag)
    publica["duracion_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return publica


def _crear_solicitud_vacia(sb, contrato_id: int, user_id: int) -> dict:
    from almacen_datetime import format_solicitud_titulo
    from almacen_service import _next_consecutivo, _now_iso

    consecutivo = _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")
    created_at = _now_iso()
    row = {
        "contrato_id": int(contrato_id),
        "consecutivo": consecutivo,
        "estado": "borrador",
        "titulo": format_solicitud_titulo(consecutivo, created_at),
        "created_by": int(user_id),
        "created_at": created_at,
    }
    ins = sb.table("almacen_solicitud").insert(row).execute().data or []
    if not ins:
        raise ValueError("No se pudo crear la solicitud que faltaba.")
    creada = dict(ins[0])
    creada.setdefault("consecutivo", consecutivo)
    creada.setdefault("estado", "borrador")
    creada.setdefault("created_at", created_at)
    creada.setdefault("titulo", row["titulo"])
    return creada


def _payload_estado(estado: str, user_id: int, actual: dict) -> dict:
    from almacen_service import _now_iso

    payload: Dict[str, Any] = {"estado": estado, "motivo_rechazo": None}
    if estado == "aprobada":
        if not actual.get("validada_at"):
            payload["validada_at"] = _now_iso()
            payload["validada_by"] = int(user_id)
    elif estado == "rechazada":
        payload["motivo_rechazo"] = actual.get("motivo_rechazo") or "Líneas rechazadas reunidas al agrupar."
        if not actual.get("validada_at"):
            payload["validada_at"] = _now_iso()
            payload["validada_by"] = int(user_id)
    else:
        payload["validada_at"] = None
        payload["validada_by"] = None
    return payload


def ejecutar_agrupacion(
    contrato_id: int,
    user_id: int,
    *,
    confirmar_creacion: bool = False,
    crear_hasta: int = 0,
    ver_economicos: bool = False,
) -> dict:
    """Mueve líneas entre solicitudes existentes. Crea solo las que falten, si se confirmó."""
    from almacen_service import _sb

    t0 = time.perf_counter()
    sb = _sb()
    sols = _select_head(sb, contrato_id)
    ids = [int(s["id"]) for s in sols if s.get("id")]
    oc_ids = _ids_con_oc(sb, contrato_id, ids)
    elegibles = [i for i in ids if i not in oc_ids]
    bloqueo = _adquirir_bloqueo(sb, contrato_id, user_id, elegibles)
    try:
        items = _select_items(sb, ids)
        completados = hidratar_proveedor_lineas(sb, items, estricto=True)
        _marcar_lineas_en_oc(sb, items)
        plan = planificar_agrupacion(sols, items, oc_ids)
        if plan["lineas_en_grupos"] != plan["lineas_libres"]:
            raise ValueError(
                "Agrupar se detuvo porque el conteo de líneas no cuadra. No se movió ninguna."
            )
        tope = max(0, int(crear_hasta or 0))
        creadas: List[dict] = []
        while plan["por_crear"] > 0:
            if not confirmar_creacion:
                raise ValueError(
                    "Faltan solicitudes para los grupos. Confirme en la vista previa "
                    "la creación solo de las que hagan falta."
                )
            if len(creadas) >= tope:
                _descartar_solicitudes_creadas(sb, creadas)
                raise ValueError(
                    "La cantidad de grupos cambió. Abra de nuevo la vista previa y confirme."
                )
            nueva = _crear_solicitud_vacia(sb, contrato_id, user_id)
            creadas.append({
                "id": int(nueva["id"]),
                "consecutivo": nueva.get("consecutivo"),
                "antes": None,
                "despues": {
                    "solicitud_id": int(nueva["id"]),
                    "consecutivo": nueva.get("consecutivo"),
                    "estado": "borrador",
                    "titulo": nueva.get("titulo"),
                },
            })
            sols.append(nueva)
            plan = planificar_agrupacion(sols, items, oc_ids)
        if plan["lineas_en_grupos"] != plan["lineas_libres"]:
            _descartar_solicitudes_creadas(sb, creadas)
            raise ValueError(
                "Agrupar se detuvo porque el conteo de líneas no cuadra. No se movió ninguna."
            )

        if plan["sin_cambios"] and not creadas:
            publica = vista_publica(plan, ver_economicos=ver_economicos)
            publica.update({
                "creadas": 0,
                "bloqueo_persistido": bloqueo,
                "resumen": "Sin cambios. Las solicitudes ya estaban agrupadas.",
                "movimientos": [],
                "ajustes": [],
                "proveedores_completados": completados,
                "duracion_ms": round((time.perf_counter() - t0) * 1000, 1),
            })
            return publica

        por_id = {int(s["id"]): s for s in sols if s.get("id")}
        antes_cabecera = {
            sid: {"estado": sol.get("estado"), "titulo": sol.get("titulo")}
            for sid, sol in por_id.items()
        }
        por_item = {int(it["id"]): it for it in items if it.get("id")}
        for mov in plan["movimientos"]:
            it = por_item.get(int(mov["item_id"])) or {}
            mov.setdefault("antes", {})["numero_linea"] = it.get("numero_linea")
            mov["antes"]["solicitud_id"] = it.get("solicitud_id") or mov["antes"].get("solicitud_id")
        try:
            asignar_numeros_destino(items, plan["movimientos"])
        except ValueError:
            _descartar_solicitudes_creadas(sb, creadas)
            raise

        originales = []
        for mov in plan["movimientos"]:
            it = por_item.get(int(mov["item_id"])) or {}
            originales.append({
                "item_id": int(mov["item_id"]),
                "solicitud_id": it.get("solicitud_id"),
                "numero_linea": it.get("numero_linea"),
            })
        filas_rpc = []
        for mov in plan["movimientos"]:
            dest_id = (mov.get("despues") or {}).get("solicitud_id")
            numero = (mov.get("despues") or {}).get("numero_linea")
            if not dest_id or not numero:
                continue
            filas_rpc.append({
                "item_id": int(mov["item_id"]),
                "solicitud_id": int(dest_id),
                "numero_linea": int(numero),
            })

        movidos = []
        try:
            _mover_lineas_bloque(sb, filas_rpc)
            _reasignar_mensajes_bloque(sb, filas_rpc)
            for mov in plan["movimientos"]:
                dest_id = mov["despues"].get("solicitud_id")
                if not dest_id:
                    continue
                dest = por_id.get(int(dest_id)) or {}
                despues = dict(mov["despues"])
                despues["consecutivo"] = dest.get("consecutivo")
                despues["titulo"] = format_titulo_grupo(
                    dest.get("consecutivo"),
                    dest.get("created_at"),
                    mov["despues"].get("proveedor") or "",
                    mov["despues"].get("estado") or dest.get("estado") or "",
                )
                movidos.append({
                    "item_id": mov["item_id"],
                    "antes": mov["antes"],
                    "despues": despues,
                })
        except Exception as exc:
            _restaurar_lineas(sb, originales)
            _descartar_solicitudes_creadas(sb, creadas)
            raise ValueError(mensaje_error_agrupar(exc)) from exc

        cambios_cabecera = []
        try:
            for g in plan["grupos"]:
                sid = g.get("solicitud_id")
                if not sid:
                    continue
                actual = por_id.get(int(sid)) or {}
                payload: Dict[str, Any] = {}
                cabecera = _cabecera_grupo(g)
                if (actual.get("estado") or "") != cabecera:
                    payload.update(_payload_estado(cabecera, user_id, actual))
                titulo = g.get("titulo") or ""
                if titulo and (actual.get("titulo") or "") != titulo:
                    payload["titulo"] = titulo
                if payload:
                    cambios_cabecera.append({"solicitud_id": int(sid), "payload": payload})
                    actual.update(payload)

            for vac in plan["vacias"]:
                sid = int(vac["solicitud_id"])
                actual = por_id.get(sid) or {}
                payload = {}
                if (actual.get("estado") or "") != "borrador" or (actual.get("motivo_rechazo") or ""):
                    payload.update(_payload_estado("borrador", user_id, actual))
                titulo = vac.get("titulo") or ""
                if titulo and (actual.get("titulo") or "") != titulo:
                    payload["titulo"] = titulo
                if payload:
                    cambios_cabecera.append({"solicitud_id": sid, "payload": payload})
                    actual.update(payload)

            _aplicar_cabeceras(sb, cambios_cabecera)

            ajustes = []
            for cambio in cambios_cabecera:
                sid = int(cambio["solicitud_id"])
                previo = antes_cabecera.get(sid) or {}
                actual = por_id.get(sid) or {}
                titulo_antes = previo.get("titulo")
                estado_antes = previo.get("estado")
                titulo_despues = actual.get("titulo") if "titulo" in (cambio["payload"]) else titulo_antes
                estado_despues = actual.get("estado") if "estado" in cambio["payload"] else estado_antes
                if titulo_despues != titulo_antes or estado_despues != estado_antes:
                    ajustes.append({
                        "solicitud_id": sid,
                        "antes": {"estado": estado_antes, "titulo": titulo_antes},
                        "despues": {"estado": estado_despues, "titulo": titulo_despues},
                    })

            for mov in movidos:
                dest_id = mov["despues"].get("solicitud_id")
                if not dest_id:
                    continue
                titulo = None
                for aj in ajustes:
                    if int(aj["solicitud_id"]) == int(dest_id):
                        titulo = (aj["despues"] or {}).get("titulo")
                if titulo:
                    mov["despues"]["titulo"] = titulo

            n_mov = len(movidos)
            n_new = len(creadas)
            n_vac = len(plan["vacias"])
            if n_mov == 0 and n_new == 0 and not ajustes:
                resumen = "Sin cambios. Las solicitudes ya estaban agrupadas."
            else:
                partes = [f"Se movieron {n_mov} línea(s)."]
                if n_new:
                    partes.append(f"Se crearon {n_new} solicitud(es), solo las que faltaban.")
                if n_vac:
                    partes.append(f"{n_vac} solicitud(es) quedaron vacías y se conservan.")
                resumen = " ".join(partes)

            _anexar_totales(plan, items, ver_economicos=ver_economicos)
            publica = vista_publica(plan, ver_economicos=ver_economicos)
            publica.update({
                "creadas": n_new,
                "creadas_detalle": [
                    {"id": c["id"], "consecutivo": c["consecutivo"]} for c in creadas
                ],
                "bloqueo_persistido": bloqueo,
                "resumen": resumen,
                "movimientos": movidos,
                "ajustes": ajustes,
                "sin_cambios": n_mov == 0 and n_new == 0 and not ajustes,
                "ejecucion_id": uuid.uuid4().hex,
                "proveedores_completados": completados,
                "duracion_ms": round((time.perf_counter() - t0) * 1000, 1),
            })
            return publica
        except Exception as exc:
            _restaurar_lineas(sb, originales)
            _restaurar_cabeceras(
                sb,
                antes_cabecera,
                [int(c["solicitud_id"]) for c in cambios_cabecera],
            )
            _descartar_solicitudes_creadas(sb, creadas)
            raise ValueError(mensaje_error_agrupar(exc)) from exc
    finally:
        _liberar_bloqueo(sb, contrato_id, user_id)


def _como_dict(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            val = json.loads(raw)
            return val if isinstance(val, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _leer_logs_agrupar(sb, contrato_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("logs")
            .select(
                "id, accion, entidad_tipo, entidad_id, detalle, valor_anterior, "
                "valor_nuevo, created_at, contrato_id"
            )
            .eq("modulo", "ALMACEN")
            .eq("contrato_id", int(contrato_id))
            .in_("accion", ["AGRUPAR", "AGRUPAR_DESHACER"])
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise ValueError("No se pudo leer el historial de Agrupar.") from exc
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return rows


def _cluster_ultima_ejecucion(rows: List[dict]) -> List[dict]:
    """La última Agrupar. Con ejecucion_id, solo esa. Sin él, la ráfaga de los últimos 3 minutos."""
    if not rows or (rows[0].get("accion") or "") != "AGRUPAR":
        return []
    eid = (_como_dict(rows[0].get("detalle")).get("ejecucion_id") or "").strip()
    ancla = _parse_expira(rows[0].get("created_at"))
    out = []
    for row in rows:
        if (row.get("accion") or "") != "AGRUPAR":
            break
        este = (_como_dict(row.get("detalle")).get("ejecucion_id") or "").strip()
        if eid:
            if este != eid:
                break
        else:
            if este:
                break
            ts = _parse_expira(row.get("created_at"))
            if ancla and ts and abs((ancla - ts).total_seconds()) > 180:
                break
        out.append(row)
    return out


def _etiqueta_solicitud(sol: Optional[dict], sid) -> str:
    consec = (sol or {}).get("consecutivo")
    if consec not in (None, ""):
        return f"#{consec}"
    return f"id {sid}"


def _plan_deshacer(sb, contrato_id: int) -> dict:
    """Qué devolvería Deshacer. No escribe."""
    t0 = time.perf_counter()
    rows = _leer_logs_agrupar(sb, contrato_id)

    def cerrar(plan: dict) -> dict:
        plan["duracion_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return plan

    vacio = {
        "puede": False,
        "bloqueos": [],
        "lineas": 0,
        "solicitudes": 0,
        "creadas": [],
        "ejemplos": [],
        "movimientos": [],
        "ajustes": [],
        "ejecucion_origen": None,
        "resumen": "No hay una agrupación registrada para deshacer.",
    }
    if not rows:
        return cerrar(vacio)
    if (rows[0].get("accion") or "") == "AGRUPAR_DESHACER":
        vacio["resumen"] = (
            "La última agrupación ya se deshizo. Solo se puede deshacer la más reciente."
        )
        return cerrar(vacio)
    cluster = _cluster_ultima_ejecucion(rows)
    if not cluster:
        return cerrar(vacio)

    eid = (_como_dict(cluster[0].get("detalle")).get("ejecucion_id") or "").strip() or None
    movimientos = []
    ajustes = []
    creadas = []
    vistos_items = set()
    vistos_ajustes = set()
    bloqueos: List[str] = []
    for row in cluster:
        tipo = (row.get("entidad_tipo") or "").strip()
        det = _como_dict(row.get("detalle"))
        antes = _como_dict(row.get("valor_anterior"))
        despues = _como_dict(row.get("valor_nuevo"))
        if tipo == "solicitud_item":
            item_id = _numero_entero(row.get("entidad_id"))
            if not item_id or item_id in vistos_items:
                continue
            vistos_items.add(item_id)
            origen_sid = _numero_entero(antes.get("solicitud_id"))
            origen_num = _numero_entero(antes.get("numero_linea"))
            destino_sid = _numero_entero(despues.get("solicitud_id"))
            destino_num = _numero_entero(despues.get("numero_linea"))
            if not origen_sid or not origen_num or not destino_sid or not destino_num:
                bloqueos.append(
                    f"La línea {item_id} no tiene en el historial la solicitud y el número "
                    "de origen y de destino. No se puede comprobar que sigue donde Agrupar "
                    "la dejó, así que no se deshace nada."
                )
            movimientos.append({
                "item_id": item_id,
                "origen_sid": origen_sid,
                "origen_num": origen_num,
                "destino_sid": destino_sid,
                "destino_num": destino_num,
                "origen_titulo": antes.get("titulo"),
                "origen_estado": antes.get("estado"),
                "destino_titulo": despues.get("titulo"),
                "destino_estado": despues.get("estado"),
            })
        elif tipo == "solicitud" and "creada" in (det.get("motivo") or "").lower():
            cid = _numero_entero(despues.get("id")) or _numero_entero(row.get("entidad_id"))
            if cid and cid not in creadas:
                creadas.append(cid)
        elif tipo == "solicitud":
            sid = _numero_entero(row.get("entidad_id"))
            if not sid or sid in vistos_ajustes:
                continue
            if "estado" not in antes and "titulo" not in antes:
                continue
            vistos_ajustes.add(sid)
            ajustes.append({
                "solicitud_id": sid,
                "estado": antes.get("estado"),
                "titulo": antes.get("titulo"),
            })

    sols = _select_head(sb, contrato_id)
    por_sol = {int(s["id"]): s for s in sols if s.get("id")}

    def etiqueta(sid) -> str:
        return _etiqueta_solicitud(por_sol.get(int(sid)) if sid else None, sid)

    tocadas = set()
    for mov in movimientos:
        if mov["origen_sid"]:
            tocadas.add(int(mov["origen_sid"]))
        if mov["destino_sid"]:
            tocadas.add(int(mov["destino_sid"]))
    for cid in creadas:
        tocadas.add(int(cid))
    for aj in ajustes:
        tocadas.add(int(aj["solicitud_id"]))

    oc_ids = _ids_con_oc(sb, contrato_id, list(tocadas))
    con_oc = sorted(tocadas & oc_ids)
    if con_oc:
        nombres = ", ".join(etiqueta(sid) for sid in con_oc)
        bloqueos.append(
            f"No se puede deshacer: la solicitud {nombres} ya tiene una orden de compra. "
            "No se revierte una parte."
        )

    item_ids = [m["item_id"] for m in movimientos]
    actuales = _select_items_por_id(sb, item_ids) if item_ids else []
    por_item = {int(r["id"]): r for r in actuales if r.get("id")}
    en_sols = _select_items(sb, list(tocadas)) if tocadas else []
    restauran = {m["item_id"] for m in movimientos}
    ocupante: Dict[tuple, int] = {}
    for it in en_sols:
        sid = _numero_entero(it.get("solicitud_id"))
        num = _numero_entero(it.get("numero_linea"))
        iid = _numero_entero(it.get("id"))
        if sid and num and iid:
            ocupante[(sid, num)] = iid

    objetivos: Dict[tuple, int] = {}
    for mov in movimientos:
        it = por_item.get(mov["item_id"])
        if not it:
            bloqueos.append(f"La línea {mov['item_id']} ya no existe. No se deshace nada.")
            continue
        if not mov["destino_sid"] or not mov["destino_num"]:
            continue
        if (
            _numero_entero(it.get("solicitud_id")) != int(mov["destino_sid"])
            or _numero_entero(it.get("numero_linea")) != int(mov["destino_num"])
        ):
            bloqueos.append(
                f"La línea {mov['item_id']} cambió después de agrupar: ahora está en la "
                f"solicitud {etiqueta(it.get('solicitud_id'))}, línea {it.get('numero_linea')}. "
                "No se deshace una parte."
            )
        if not mov["origen_sid"] or not mov["origen_num"]:
            continue
        key = (int(mov["origen_sid"]), int(mov["origen_num"]))
        if key in objetivos:
            bloqueos.append(
                "Dos líneas volverían al mismo número. No se deshace nada."
            )
        else:
            objetivos[key] = mov["item_id"]
        occ = ocupante.get(key)
        if occ and occ not in restauran:
            bloqueos.append(
                f"El número {mov['origen_num']} de la solicitud {etiqueta(mov['origen_sid'])} "
                "ya lo usa otra línea que no salió de esta agrupación. No se deshace nada."
            )

    for cid in creadas:
        quedan = [
            it for it in en_sols
            if _numero_entero(it.get("solicitud_id")) == int(cid)
            and _numero_entero(it.get("id")) not in restauran
        ]
        if quedan:
            bloqueos.append(
                f"La solicitud {etiqueta(cid)} creada al agrupar tiene otras líneas. "
                "No se deshace nada."
            )
        try:
            msgs = (
                sb.table("almacen_solicitud_mensaje")
                .select("id, solicitud_item_id")
                .eq("solicitud_id", int(cid))
                .limit(20)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            if _objeto_ausente(exc):
                msgs = []
            else:
                raise
        ajenos = [
            m for m in msgs
            if _numero_entero(m.get("solicitud_item_id")) not in restauran
        ]
        if ajenos:
            bloqueos.append(
                f"La solicitud {etiqueta(cid)} creada al agrupar tiene mensajes que no "
                "viajan con las líneas de esa ejecución. No se deshace nada."
            )

    # Quitar bloqueos repetidos, conservando el orden.
    unicos = []
    ya = set()
    for texto in bloqueos:
        if texto in ya:
            continue
        ya.add(texto)
        unicos.append(texto)
    bloqueos = unicos

    ejemplos = []
    for mov in movimientos[:12]:
        ejemplos.append({
            "item_id": mov["item_id"],
            "desde": etiqueta(mov["destino_sid"]),
            "hacia": etiqueta(mov["origen_sid"]),
            "numero_actual": mov["destino_num"],
            "numero_original": mov["origen_num"],
        })
    solicitudes_n = len({
        *(m["origen_sid"] for m in movimientos if m["origen_sid"]),
        *(m["destino_sid"] for m in movimientos if m["destino_sid"]),
        *(a["solicitud_id"] for a in ajustes),
    })
    puede = not bloqueos and bool(movimientos or ajustes or creadas)
    if bloqueos:
        resumen = bloqueos[0] if len(bloqueos) == 1 else (
            "No se puede deshacer esta agrupación. " + " ".join(bloqueos)
        )
    elif not puede:
        resumen = "Esa agrupación no dejó movimientos que se puedan devolver."
    else:
        resumen = (
            f"Se devolverían {len(movimientos)} línea(s) a su solicitud y número originales"
            f" y se restaurarían {len(ajustes)} solicitud(es)."
        )
        if creadas:
            resumen += (
                f" Se eliminarían {len(creadas)} solicitud(es) creadas por esa agrupación."
            )
        resumen += " El total de líneas no cambia."
    return cerrar({
        "puede": puede,
        "bloqueos": bloqueos,
        "lineas": len(movimientos),
        "solicitudes": solicitudes_n,
        "creadas": [
            {"id": cid, "consecutivo": (por_sol.get(cid) or {}).get("consecutivo")}
            for cid in creadas
        ],
        "ejemplos": ejemplos,
        "movimientos": movimientos,
        "ajustes": ajustes,
        "ejecucion_origen": eid,
        "resumen": resumen,
        "cabeceras_actuales": {
            sid: {
                "estado": (por_sol.get(sid) or {}).get("estado"),
                "titulo": (por_sol.get(sid) or {}).get("titulo"),
            }
            for sid in tocadas
            if sid in por_sol
        },
    })


def vista_previa_deshacer(contrato_id: int) -> dict:
    from almacen_service import _sb

    plan = _plan_deshacer(_sb(), contrato_id)
    return {
        "puede": plan["puede"],
        "bloqueos": plan["bloqueos"],
        "lineas": plan["lineas"],
        "solicitudes": plan["solicitudes"],
        "creadas": plan["creadas"],
        "ejemplos": plan["ejemplos"],
        "ejecucion_origen": plan["ejecucion_origen"],
        "resumen": plan["resumen"],
        "duracion_ms": plan["duracion_ms"],
    }


def ejecutar_deshacer(contrato_id: int, user_id: int, *, confirmar: bool = False) -> dict:
    """Devuelve la última Agrupar. Todo o nada, y solo si nada cambió después."""
    if not confirmar:
        raise ValueError("Confirme el resumen antes de deshacer la agrupación.")
    from almacen_service import _sb

    t0 = time.perf_counter()
    sb = _sb()
    plan = _plan_deshacer(sb, contrato_id)
    if not plan["puede"]:
        raise ValueError(plan["resumen"])
    tocadas = []
    for mov in plan["movimientos"]:
        if mov["origen_sid"]:
            tocadas.append(int(mov["origen_sid"]))
        if mov["destino_sid"]:
            tocadas.append(int(mov["destino_sid"]))
    for creada in plan["creadas"]:
        tocadas.append(int(creada["id"]))
    bloqueo = _adquirir_bloqueo(sb, contrato_id, user_id, list(dict.fromkeys(tocadas)))
    try:
        plan = _plan_deshacer(sb, contrato_id)
        if not plan["puede"]:
            raise ValueError(plan["resumen"])
        ida = [
            {
                "item_id": mov["item_id"],
                "solicitud_id": mov["origen_sid"],
                "numero_linea": mov["origen_num"],
            }
            for mov in plan["movimientos"]
        ]
        vuelta = [
            {
                "item_id": mov["item_id"],
                "solicitud_id": mov["destino_sid"],
                "numero_linea": mov["destino_num"],
            }
            for mov in plan["movimientos"]
        ]
        cabeceras = []
        for aj in plan["ajustes"]:
            payload: Dict[str, Any] = {}
            if "estado" in aj:
                payload["estado"] = aj.get("estado")
            if "titulo" in aj:
                payload["titulo"] = aj.get("titulo")
            if payload:
                cabeceras.append({"solicitud_id": int(aj["solicitud_id"]), "payload": payload})
        try:
            _mover_lineas_bloque(sb, ida)
            _reasignar_mensajes_bloque(sb, ida)
            _aplicar_cabeceras(sb, cabeceras)
            for creada in plan["creadas"]:
                cid = int(creada["id"])
                quedan = _select_items(sb, [cid])
                if quedan:
                    raise ValueError(
                        "La solicitud creada al agrupar no quedó vacía. No se deshace nada."
                    )
                sb.table("almacen_solicitud").delete().eq("id", cid).execute()
        except Exception as exc:
            try:
                _mover_lineas_bloque(sb, vuelta)
            except Exception:
                _log.exception("No se pudieron devolver las líneas tras fallar Deshacer")
            actuales = plan.get("cabeceras_actuales") or {}
            _restaurar_cabeceras(
                sb,
                {int(k): v for k, v in actuales.items()},
                [int(c["solicitud_id"]) for c in cabeceras],
            )
            if isinstance(exc, ValueError) and "No se deshace" in str(exc):
                raise
            raise ValueError(
                "No se pudo deshacer la agrupación. No quedó ningún cambio aplicado."
            ) from exc
        n = len(plan["movimientos"])
        resumen = (
            f"Se devolvieron {n} línea(s) a su solicitud y número originales"
            f" y se restauraron {len(plan['ajustes'])} solicitud(es)."
        )
        if plan["creadas"]:
            resumen += f" Se eliminaron {len(plan['creadas'])} solicitud(es) creadas por Agrupar."
        return {
            "puede": True,
            "deshecho": True,
            "resumen": resumen,
            "lineas": n,
            "solicitudes": plan["solicitudes"],
            "creadas": plan["creadas"],
            "ejecucion_origen": plan["ejecucion_origen"],
            "ejecucion_id": uuid.uuid4().hex,
            "bloqueo_persistido": bloqueo,
            "duracion_ms": round((time.perf_counter() - t0) * 1000, 1),
            "movimientos": [
                {
                    "item_id": mov["item_id"],
                    "antes": {
                        "solicitud_id": mov["destino_sid"],
                        "numero_linea": mov["destino_num"],
                        "titulo": mov.get("destino_titulo"),
                        "estado": mov.get("destino_estado"),
                    },
                    "despues": {
                        "solicitud_id": mov["origen_sid"],
                        "numero_linea": mov["origen_num"],
                        "titulo": mov.get("origen_titulo"),
                        "estado": mov.get("origen_estado"),
                    },
                }
                for mov in plan["movimientos"]
            ],
            "ajustes": [
                {
                    "solicitud_id": aj["solicitud_id"],
                    "antes": (plan.get("cabeceras_actuales") or {}).get(aj["solicitud_id"])
                    or (plan.get("cabeceras_actuales") or {}).get(str(aj["solicitud_id"])),
                    "despues": {"estado": aj.get("estado"), "titulo": aj.get("titulo")},
                }
                for aj in plan["ajustes"]
            ],
        }
    finally:
        _liberar_bloqueo(sb, contrato_id, user_id)
