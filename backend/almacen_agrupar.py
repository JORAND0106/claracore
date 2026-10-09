"""Agrupa solicitudes de materiales por proveedor, sin tocar las que ya tienen OC.

El nombre queda «Solicitud # XXX - Fecha - Proveedor - Estado» y se
recalcula cuando cambia el proveedor del grupo o el estado.
"""
from __future__ import annotations

import logging
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


def _proveedor_linea(it: dict) -> tuple:
    pid = it.get("proveedor_seleccionado_id")
    nombre = (it.get("proveedor_seleccionado_nombre") or it.get("proveedor_nombre") or "").strip()
    try:
        pid_i = int(pid) if pid not in (None, "") else None
    except (TypeError, ValueError):
        pid_i = None
    if pid_i:
        return f"id:{pid_i}", (nombre or f"Proveedor {pid_i}")
    if nombre:
        return f"nombre:{nombre.casefold()}", nombre
    return "sin_seleccion", "Sin proveedor seleccionado"


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
            "estado": "aprobada",
            "orden": (0, etiqueta.casefold()),
        }
    return {
        "clave": f"pendiente:{clave_p}",
        "proveedor": etiqueta,
        "estado": "enviada",
        "orden": (1, etiqueta.casefold()),
    }


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

    items_libres = []
    for it in items or []:
        try:
            sid = int(it.get("solicitud_id") or 0)
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if not sid or not iid or sid in congeladas or sid not in por_id:
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

    por_sol: Dict[int, List[dict]] = {}
    for it in items_libres:
        por_sol.setdefault(int(it["solicitud_id"]), []).append(it)

    candidatos: Dict[str, List[dict]] = {}
    for sol in libres:
        sid = int(sol["id"])
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
    huecos = [s for s in libres if int(s["id"]) not in usadas]
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
        for it in g["items"]:
            origen = int(it["solicitud_id"])
            if dest_id is None or origen != dest_id:
                se_mueven += 1
                origen_sol = por_id.get(origen) or {}
                movimientos.append({
                    "item_id": int(it["id"]),
                    "estado_validacion": it.get("estado_validacion"),
                    "antes": {
                        "solicitud_id": origen,
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
            if (dest.get("estado") or "") != g["estado"]:
                ajustes.append({
                    "solicitud_id": dest_id,
                    "campo": "estado",
                    "antes": dest.get("estado"),
                    "despues": g["estado"],
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
            "estado_label": etiqueta_estado(g["estado"]),
            "lineas": len(g["items"]),
            "se_mueven": se_mueven,
            "solicitud_id": dest_id,
            "consecutivo": dest.get("consecutivo") if dest else None,
            "crear": dest is None,
            "titulo": titulo,
            "item_ids": [int(it["id"]) for it in g["items"]],
        })

    vacias = []
    for sol in libres:
        sid = int(sol["id"])
        if sid in usadas:
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
    return {
        "grupos": filas,
        "vacias": vacias,
        "por_crear": por_crear,
        "se_mueven": se_mueven,
        "movimientos": movimientos,
        "ajustes": ajustes,
        "sin_cambios": sin_cambios,
        "congeladas": len(congeladas),
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
    return (
        sb.table("almacen_solicitud")
        .select("id, contrato_id, consecutivo, titulo, estado, created_at, motivo_rechazo, validada_at")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )


def _select_items(sb, solicitud_ids: List[int]) -> List[dict]:
    if not solicitud_ids:
        return []
    selects = (
        "id, solicitud_id, insumo_id, estado_validacion, proveedor_seleccionado_id, "
        "proveedor_seleccionado_nombre, cantidad, valor_compra_unitario, "
        "cotizacion_numero_seleccionada, cotizacion_seleccionada_id",
        "id, solicitud_id, insumo_id, estado_validacion, proveedor_seleccionado_id, "
        "proveedor_seleccionado_nombre, cantidad, valor_compra_unitario",
        "id, solicitud_id, insumo_id, estado_validacion",
    )
    last = None
    for select in selects:
        try:
            return (
                sb.table("almacen_solicitud_item")
                .select(select)
                .in_("solicitud_id", solicitud_ids)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            last = exc
            if not _objeto_ausente(exc):
                raise
    if last:
        raise ValueError("No se pudieron leer las líneas de las solicitudes.") from last
    return []


def _ids_con_oc(sb, contrato_id: int) -> set:
    rows = (
        sb.table("almacen_orden_compra")
        .select("solicitud_id")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return {int(r["solicitud_id"]) for r in rows if r.get("solicitud_id")}


def _anexar_totales(sb, plan: dict, items: List[dict], *, ver_economicos: bool) -> None:
    if not ver_economicos:
        for g in plan["grupos"]:
            g.pop("total", None)
        return
    from almacen_service import (
        _hidratar_proveedor_desde_cotizacion,
        _ofertas_insumos_batch,
        valor_linea_proveedor,
    )

    try:
        _hidratar_proveedor_desde_cotizacion(sb, items)
    except Exception:
        _log.exception("No se pudo hidratar el proveedor para la vista previa")
    insumo_ids = []
    for it in items:
        if it.get("insumo_id"):
            try:
                insumo_ids.append(int(it["insumo_id"]))
            except (TypeError, ValueError):
                pass
    ofertas = _ofertas_insumos_batch(sb, insumo_ids) if insumo_ids else {}
    por_item: Dict[int, Optional[float]] = {}
    for it in items:
        try:
            iid = int(it.get("id") or 0)
        except (TypeError, ValueError):
            continue
        of = None
        if it.get("insumo_id"):
            try:
                of = ofertas.get(int(it["insumo_id"]))
            except (TypeError, ValueError):
                of = None
        por_item[iid] = valor_linea_proveedor(it, of)
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
    }


def vista_previa_agrupacion(contrato_id: int, *, ver_economicos: bool = False) -> dict:
    from almacen_service import _sb

    sb = _sb()
    sols = _select_head(sb, contrato_id)
    ids = [int(s["id"]) for s in sols if s.get("id")]
    items = _select_items(sb, ids)
    oc_ids = _ids_con_oc(sb, contrato_id)
    plan = planificar_agrupacion(sols, items, oc_ids)
    _anexar_totales(sb, plan, items, ver_economicos=ver_economicos)
    return vista_publica(plan, ver_economicos=ver_economicos)


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

    sb = _sb()
    sols = _select_head(sb, contrato_id)
    ids = [int(s["id"]) for s in sols if s.get("id")]
    oc_ids = _ids_con_oc(sb, contrato_id)
    elegibles = [i for i in ids if i not in oc_ids]
    bloqueo = _adquirir_bloqueo(sb, contrato_id, user_id, elegibles)
    try:
        items = _select_items(sb, ids)
        plan = planificar_agrupacion(sols, items, oc_ids)
        tope = max(0, int(crear_hasta or 0))
        creadas: List[dict] = []
        while plan["por_crear"] > 0:
            if not confirmar_creacion:
                raise ValueError(
                    "Faltan solicitudes para los grupos. Confirme en la vista previa "
                    "la creación solo de las que hagan falta."
                )
            if len(creadas) >= tope:
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

        if plan["sin_cambios"] and not creadas:
            publica = vista_publica(plan, ver_economicos=ver_economicos)
            publica.update({
                "creadas": 0,
                "bloqueo_persistido": bloqueo,
                "resumen": "Sin cambios. Las solicitudes ya estaban agrupadas.",
                "movimientos": [],
                "ajustes": [],
            })
            return publica

        por_id = {int(s["id"]): s for s in sols if s.get("id")}
        antes_cabecera = {
            sid: {"estado": sol.get("estado"), "titulo": sol.get("titulo")}
            for sid, sol in por_id.items()
        }
        movidos = []
        for mov in plan["movimientos"]:
            dest_id = mov["despues"].get("solicitud_id")
            if not dest_id:
                continue
            (
                sb.table("almacen_solicitud_item")
                .update({"solicitud_id": int(dest_id)})
                .eq("id", int(mov["item_id"]))
                .execute()
            )
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

        for g in plan["grupos"]:
            sid = g.get("solicitud_id")
            if not sid:
                continue
            actual = por_id.get(int(sid)) or {}
            if (actual.get("estado") or "") == g["estado"]:
                continue
            payload = _payload_estado(g["estado"], user_id, actual)
            sb.table("almacen_solicitud").update(payload).eq("id", int(sid)).execute()
            actual.update(payload)

        for vac in plan["vacias"]:
            sid = int(vac["solicitud_id"])
            actual = por_id.get(sid) or {}
            if (actual.get("estado") or "") == "borrador" and not (actual.get("motivo_rechazo") or ""):
                continue
            payload = _payload_estado("borrador", user_id, actual)
            sb.table("almacen_solicitud").update(payload).eq("id", sid).execute()
            actual.update(payload)

        tocadas = set()
        for g in plan["grupos"]:
            if g.get("solicitud_id"):
                tocadas.add(int(g["solicitud_id"]))
        for vac in plan["vacias"]:
            tocadas.add(int(vac["solicitud_id"]))
        for creada in creadas:
            tocadas.add(int(creada["id"]))

        ajustes = []
        for sid in sorted(tocadas):
            previo = antes_cabecera.get(sid) or {}
            titulo_antes = previo.get("titulo")
            estado_antes = previo.get("estado")
            nuevo = sincronizar_titulo_solicitud(sb, sid)
            actual = por_id.get(sid) or {}
            estado_despues = actual.get("estado") or estado_antes
            titulo_despues = nuevo or titulo_antes
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

        _anexar_totales(sb, plan, items, ver_economicos=ver_economicos)
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
        })
        return publica
    finally:
        _liberar_bloqueo(sb, contrato_id, user_id)
