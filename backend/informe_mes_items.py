"""Cuadro del informe de ejecución mensual a partir del presupuesto de obra.

La lista de ítems es la versión vigente del presupuesto de obra: la versión
actualizada de mayor ``numero_version`` o, si el contrato solo tiene la
inicial, la V0. Cada fila se identifica por el capítulo y el código de ítem
tal como están guardados (sin quitar sufijos ni unir capítulos distintos).

El cruce que mezclaba 2.1 con 2.1._ ocurría porque el informe anterior no
partía de este presupuesto: agregaba los registros SicoeObra solo por
``item_numero`` y les pegaba la cantidad del presupuesto con esa misma clave.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from corte_sub_conciliacion import (
    _round2,
    _sf,
    sort_items_capitulo_item_asc,
    valor_por_cantidad_vu,
)
from presupuesto_helpers import sum_costo_directo_capitulos

_log = logging.getLogger("informe_mes_items")

ClaveItem = Tuple[str, str]
PPTO_TIPO_OBRA = "Presupuesto de Obra"
_SELECT_FILA = "capitulo, item, descripcion, und, vlr_unitario, cant_total, costo_directo"
_PAGE = 1000


def clave_item_exacta(capitulo: Any, item: Any) -> ClaveItem:
    """Capítulo y código completos. No elimina puntos, ``._`` ni espacios internos."""
    return (str(capitulo or "").strip(), str(item if item is not None else "").strip())


def elegir_version_obra_vigente(versiones: Optional[Sequence[dict]]) -> Optional[dict]:
    """Versión actualizada más reciente; si no hay ninguna posterior, la V0.

    V0 es la de menor ``numero_version``. Cualquier número mayor es una
    actualización. Entre actualizaciones gana el número más alto.
    """
    rows = [v for v in (versiones or []) if isinstance(v, dict)]
    if not rows:
        return None

    def _num(v: dict) -> int:
        try:
            return int(v.get("numero_version"))
        except (TypeError, ValueError):
            return 0

    ordered = sorted(rows, key=lambda v: (_num(v), str(v.get("id") or "")))
    inicial = _num(ordered[0])
    actualizadas = [v for v in ordered if _num(v) > inicial]
    return actualizadas[-1] if actualizadas else ordered[0]


def fuente_de_version(version: Optional[dict]) -> str:
    """La versión en borrador (``es_vigente``) vive en ``presupuesto``; la sellada, en su snapshot."""
    if version is None or bool(version.get("es_vigente")):
        return "presupuesto_vivo"
    return "presupuesto_version_items"


def indice_listado_exacto(filas: Optional[Iterable[dict]]) -> Dict[ClaveItem, dict]:
    """(capítulo, ítem) exactos → ficha. Si hay duplicado, gana el id mayor."""
    out: Dict[ClaveItem, dict] = {}
    rank: Dict[ClaveItem, int] = {}
    for raw in filas or []:
        if not isinstance(raw, dict):
            continue
        clave = clave_item_exacta(raw.get("capitulo"), raw.get("item_numero"))
        if not clave[0] or not clave[1]:
            continue
        try:
            rid = int(raw.get("id") or 0)
        except (TypeError, ValueError):
            rid = 0
        if clave in out and rid < rank.get(clave, 0):
            continue
        rank[clave] = rid
        out[clave] = {
            "capitulo": clave[0],
            "item_numero": clave[1],
            "descripcion": str(raw.get("descripcion") or "").strip(),
            "unidad": str(raw.get("unidad") or "").strip(),
            "vlr_unitario": _sf(raw.get("precio_unitario") if raw.get("precio_unitario") is not None else raw.get("vlr_unitario")),
            "especificacion_tecnica": str(raw.get("especificacion_tecnica") or "").strip(),
        }
    return out


def agrupar_filas_presupuesto(filas: Optional[Iterable[dict]]) -> List[dict]:
    """Una ficha por capítulo + código. Suma cantidad y costo directo de sus tramos."""
    grupos: Dict[ClaveItem, dict] = {}
    orden: List[ClaveItem] = []
    for raw in filas or []:
        if not isinstance(raw, dict):
            continue
        item = raw.get("item")
        if item is None or str(item).strip() == "":
            item = raw.get("item_numero")
        clave = clave_item_exacta(raw.get("capitulo"), item)
        if not clave[0] or not clave[1]:
            continue
        if clave not in grupos:
            grupos[clave] = {
                "capitulo": clave[0],
                "item_numero": clave[1],
                "item_descripcion": "",
                "unidad": "",
                "vlr_unitario": 0.0,
                "cant_sum": 0.0,
                "costo_sum": 0.0,
            }
            orden.append(clave)
        g = grupos[clave]
        desc = str(raw.get("descripcion") or raw.get("item_descripcion") or "").strip()
        und = str(raw.get("und") or raw.get("unidad") or "").strip()
        if desc and not g["item_descripcion"]:
            g["item_descripcion"] = desc
        if und and not g["unidad"]:
            g["unidad"] = und
        vu = _sf(raw.get("vlr_unitario"))
        if vu > 0 and g["vlr_unitario"] <= 0:
            g["vlr_unitario"] = vu
        g["cant_sum"] += _sf(raw.get("cant_total"))
        g["costo_sum"] += _sf(raw.get("costo_directo"))
    return [grupos[k] for k in orden]


def sumar_cantidad_por_clave(registros: Optional[Iterable[dict]]) -> Dict[ClaveItem, float]:
    """Suma ``cantidad_total`` solo entre filas del mismo capítulo y el mismo código."""
    acc: Dict[ClaveItem, float] = {}
    for raw in registros or []:
        if not isinstance(raw, dict):
            continue
        clave = clave_item_exacta(raw.get("capitulo"), raw.get("item_numero"))
        if not clave[0] or not clave[1]:
            continue
        acc[clave] = acc.get(clave, 0.0) + _sf(raw.get("cantidad_total"))
    return acc


def costo_linea_registro(raw: dict) -> float:
    cd = _sf(raw.get("costo_directo"))
    if abs(cd) > 1e-9:
        return cd
    return _sf(raw.get("cantidad_total")) * _sf(raw.get("vlr_unitario"))


def resumir_registros_fuera(
    registros: Optional[Iterable[dict]],
    claves_presupuesto: Iterable[ClaveItem],
) -> dict:
    """Registros del acta cuyo capítulo+código no está en el presupuesto de obra."""
    claves = set(claves_presupuesto or [])
    grupos: Dict[ClaveItem, dict] = {}
    orden: List[ClaveItem] = []
    n = 0
    for raw in registros or []:
        if not isinstance(raw, dict):
            continue
        clave = clave_item_exacta(raw.get("capitulo"), raw.get("item_numero"))
        if not clave[1]:
            continue
        if clave in claves:
            continue
        n += 1
        if clave not in grupos:
            grupos[clave] = {
                "capitulo": clave[0],
                "item_numero": clave[1],
                "item_descripcion": str(raw.get("item_descripcion") or "").strip(),
                "n_registros": 0,
                "valor": 0.0,
            }
            orden.append(clave)
        g = grupos[clave]
        if not g["item_descripcion"] and raw.get("item_descripcion"):
            g["item_descripcion"] = str(raw.get("item_descripcion") or "").strip()
        g["n_registros"] += 1
        g["valor"] += costo_linea_registro(raw)
    items = []
    for clave in orden:
        g = grupos[clave]
        g["valor"] = float(round(g["valor"], 0))
        items.append(g)
    items.sort(key=lambda r: (r["capitulo"].lower(), r["item_numero"].lower()))
    total = float(round(sum(_sf(it.get("valor")) for it in items), 0))
    return {"n_registros": n, "valor_total": total, "items": items}


def costo_directo_filas_presupuesto(filas: Optional[Iterable[dict]]) -> float:
    """Mismo total del módulo Presupuesto: Σ costo_directo almacenado, redondeo final a pesos."""
    por_cap: Dict[str, float] = {}
    for raw in filas or []:
        if not isinstance(raw, dict):
            continue
        cap = str(raw.get("capitulo") or "").strip()
        if not cap:
            continue
        item = raw.get("item")
        if item is None or str(item).strip() == "":
            item = raw.get("item_numero")
        if not str(item or "").strip():
            continue
        por_cap[cap] = por_cap.get(cap, 0.0) + _sf(raw.get("costo_directo"))
    return sum_costo_directo_capitulos([{"costo_total": v} for v in por_cap.values()])


def construir_cuadro_mensual(
    filas_presupuesto: Optional[Iterable[dict]],
    *,
    cant_presente: Optional[Dict[ClaveItem, float]] = None,
    cant_anterior: Optional[Dict[ClaveItem, float]] = None,
    listado_por_clave: Optional[Dict[ClaveItem, dict]] = None,
    claves_con_registros_acta: Optional[Iterable[ClaveItem]] = None,
) -> dict:
    """Todas las filas del presupuesto y solo esas.

    Actualizadas (cantidad) = cantidad del presupuesto.
    Presente, acumulado y saldo siguen la regla ya usada en el informe, pero
    solo con registros del mismo capítulo y el mismo código.
    El costo directo de Actualizadas suma el costo directo almacenado del
    presupuesto. Si ``ROUND(cantidad × valor unitario)`` ya da ese costo, la
    celda conserva la fórmula; si el presupuesto tiene varios tramos y el
    redondeo no coincide, la celda lleva el costo almacenado para que el total
    no se desvíe.
    """
    presente = cant_presente or {}
    anterior = cant_anterior or {}
    listado = listado_por_clave or {}
    con_registros = set(claves_con_registros_acta or [])
    grupos = agrupar_filas_presupuesto(filas_presupuesto)
    claves = {(g["capitulo"], g["item_numero"]) for g in grupos}

    borrador: List[dict] = []
    for g in grupos:
        clave = (g["capitulo"], g["item_numero"])
        meta = listado.get(clave) or {}
        desc = str(meta.get("descripcion") or "").strip() or g["item_descripcion"]
        und = str(meta.get("unidad") or "").strip() or g["unidad"]
        norma = str(meta.get("especificacion_tecnica") or "").strip()
        vu = _sf(g.get("vlr_unitario"))
        if vu <= 0:
            vu = _sf(meta.get("vlr_unitario"))
        cant_act = _round2(g["cant_sum"])
        cant_pres = _round2(presente.get(clave, 0.0))
        cant_ant = _round2(anterior.get(clave, 0.0))
        cant_acum = _round2(cant_ant + cant_pres)
        cant_saldo = _round2(cant_act - cant_acum)
        formula_act = valor_por_cantidad_vu(cant_act, vu)
        almacenado = float(round(_sf(g["costo_sum"]), 0))
        literal = formula_act != almacenado
        valor_act = almacenado if literal else formula_act
        borrador.append(
            {
                "capitulo": g["capitulo"],
                "item_numero": g["item_numero"],
                "item_descripcion": desc,
                "unidad": und,
                "norma_tecnica": norma,
                "especificacion_tecnica": norma,
                "vlr_unitario": vu,
                "vlr_unitario_sub": vu,
                "cantidad": cant_pres,
                "costo_directo": valor_por_cantidad_vu(cant_pres, vu),
                "cant_actualizadas": cant_act,
                "valor_actualizadas": valor_act,
                "valor_actualizadas_literal": literal,
                "cant_presente": cant_pres,
                "valor_presente": valor_por_cantidad_vu(cant_pres, vu),
                "cant_acum_anterior": cant_ant,
                "cant_acumulado": cant_acum,
                "valor_acumulado": valor_por_cantidad_vu(cant_acum, vu),
                "cant_saldo": cant_saldo,
                "valor_saldo": valor_por_cantidad_vu(cant_saldo, vu),
                "sin_precio": vu <= 0 and almacenado == 0.0,
                "tiene_registros_acta": clave in con_registros or abs(_sf(presente.get(clave))) > 1e-12,
            }
        )

    items = sort_items_capitulo_item_asc(borrador)
    # El redondeo por ítem puede diferir en un peso del redondeo único del módulo.
    objetivo = costo_directo_filas_presupuesto(filas_presupuesto)
    suma = float(round(sum(_sf(it.get("valor_actualizadas")) for it in items), 0))
    diff = float(round(objetivo - suma, 0))
    if items and diff != 0.0:
        ultimo = items[-1]
        ultimo["valor_actualizadas"] = float(round(_sf(ultimo.get("valor_actualizadas")) + diff, 0))
        ultimo["valor_actualizadas_literal"] = True

    return {
        "items": items,
        "claves": claves,
        "costo_directo_presupuesto": objetivo,
    }


def _paginar(q_builder) -> List[dict]:
    rows: List[dict] = []
    offset = 0
    while True:
        batch = q_builder(offset, offset + _PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        offset += _PAGE
    return rows


def fetch_presupuesto_obra_vigente(sb, contrato_id: int) -> Tuple[List[dict], dict]:
    """Filas y metadatos de la versión vigente (actualizada más reciente, o V0)."""
    versiones: List[dict] = []
    try:
        versiones = (
            sb.table("presupuesto_versiones")
            .select("id, numero_version, etiqueta, es_vigente")
            .eq("contrato_id", int(contrato_id))
            .order("numero_version")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("presupuesto_versiones contrato %s: %s", contrato_id, exc)
        versiones = []

    elegida = elegir_version_obra_vigente(versiones)
    fuente = fuente_de_version(elegida)
    meta = {
        "id": (elegida or {}).get("id"),
        "numero_version": (elegida or {}).get("numero_version"),
        "etiqueta": (elegida or {}).get("etiqueta"),
        "es_vigente": bool((elegida or {}).get("es_vigente")) if elegida else None,
        "fuente": fuente,
    }
    try:
        if fuente == "presupuesto_version_items":
            vid = str(elegida.get("id"))

            def _q(ini: int, fin: int):
                return (
                    sb.table("presupuesto_version_items")
                    .select(_SELECT_FILA)
                    .eq("contrato_id", int(contrato_id))
                    .eq("version_id", vid)
                    .eq("dado_de_baja", False)
                    .order("id")
                    .range(ini, fin)
                )

            filas = _paginar(_q)
        else:
            def _q(ini: int, fin: int):
                return (
                    sb.table("presupuesto")
                    .select(_SELECT_FILA)
                    .eq("contrato_id", int(contrato_id))
                    .eq("tipo_ejecucion", PPTO_TIPO_OBRA)
                    .eq("dado_de_baja", False)
                    .order("id")
                    .range(ini, fin)
                )

            filas = _paginar(_q)
    except Exception as exc:
        _log.warning("filas presupuesto vigente contrato %s: %s", contrato_id, exc)
        raise
    meta["n_filas"] = len(filas)
    return filas, meta


def fetch_listado_exacto(sb, contrato_id: int) -> Dict[ClaveItem, dict]:
    """Ficha del listado indexada por capítulo y código exactos."""
    try:
        def _q(ini: int, fin: int):
            return (
                sb.table("listado_precios")
                .select("id, capitulo, item_numero, descripcion, unidad, precio_unitario, especificacion_tecnica")
                .eq("contrato_id", int(contrato_id))
                .order("id")
                .range(ini, fin)
            )

        return indice_listado_exacto(_paginar(_q))
    except Exception as exc:
        _log.warning("listado exacto contrato %s: %s", contrato_id, exc)
        return {}
