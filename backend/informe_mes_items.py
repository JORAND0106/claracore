"""Cuadro del informe de ejecución mensual desde el Listado de precios.

La lista de ítems es ``listado_precios`` del contrato: estado de precio
Aprobado, tenga o no cantidad, salvo los cuatro capítulos de PMT.

Por qué se cruzaban 2.1 con 2.1._ y 4.1 con 4.1._
-------------------------------------------------
Tres funciones tratan como un solo ítem códigos que solo se parecen:

1. ``sicoe_valor_canonico.norm_item`` (líneas 82-90) borra el sufijo ``._``
   y los puntos finales. ``norm_item("2.1._")`` y ``norm_item("4.1._")``
   devuelven ``"2.1"`` y ``"4.1"``. ``cap_item_key`` usa esa función, así
   que el índice del listado (``load_listado_vu_by_cap_item``) guarda una
   sola ficha para los dos códigos cuando el capítulo normalizado coincide,
   y se queda con la fila de mayor ``id``.

2. ``ccd_conciliacion.aggregate_items_conciliacion`` (línea 304) agrupa los
   registros solo por ``item_numero``, sin capítulo. El comentario dice que
   la clave es ``corte_sub_conciliacion.item_key``, y esa función llama a
   ``norm_item``. Dos capítulos con el mismo número caen en la misma fila.

3. ``acta_mes_conciliacion.cantidades_actualizadas_contrato`` (línea 322)
   suma ``presupuesto.cant_total`` con ``item_key`` y descarta el capítulo.
   La cantidad de Subbase 2.1 (1.363,79) se le suma también a 2.1._.
   ``main.get_listado_precios_cantidades`` repite el mismo ``norm_item``
   en ``_dash_norm_item_key_py`` al calcular la cantidad que muestra el
   panel del listado.

Este módulo no llama a ninguna de esas funciones. La identidad es el
capítulo y el código tal como están guardados.

La cantidad de Actualizadas es la del presupuesto de obra del mismo
capítulo y el mismo código: el listado no guarda cantidad, y la que
muestra el panel es esa suma. Si el ítem aprobado no tiene líneas de
presupuesto, Actualizadas queda en cero. No se usa la suma normalizada,
porque esa es la que mezcla 2.1 con 2.1._.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Tuple

from corte_sub_conciliacion import (
    _round2,
    _sf,
    sort_items_capitulo_item_asc,
    valor_por_cantidad_vu,
)
from sicoe_ultimo_nivel_item_aprobado import (
    ESTADO_PRECIO_APROBADO,
    normalizar_estado_precio,
)

_log = logging.getLogger("informe_mes_items")

ClaveItem = Tuple[str, str]
MOTIVO_PMT = "capitulo_pmt"
MOTIVO_ESTADO = "estado_distinto_aprobado"
MOTIVO_AUSENTE = "no_esta_en_listado"

CAPITULOS_PMT_EXCLUIDOS = frozenset(
    {
        "1. PERSONAL OPERATIVO",
        "2. SEÑALIZACIÓN Y CANALIZACIÓN",
        "3. COMUNICACIONES",
        "4. OPERACIÓN PMT",
    }
)
_PMT_CF = frozenset(c.casefold() for c in CAPITULOS_PMT_EXCLUIDOS)

_SELECT_LISTADO = (
    "id, capitulo, item_numero, descripcion, unidad, precio_unitario, "
    "estado_precio, especificacion_tecnica"
)
_SELECT_CANT = "capitulo, item, cant_total"
_PAGE = 1000


def clave_item_exacta(capitulo: Any, item: Any) -> ClaveItem:
    """Capítulo y código completos. No elimina puntos, ``._`` ni espacios internos."""
    return (str(capitulo or "").strip(), str(item if item is not None else "").strip())


def es_capitulo_pmt(capitulo: Any) -> bool:
    """Los cuatro capítulos de PMT. Ignora mayúsculas y espacios repetidos."""
    texto = " ".join(str(capitulo or "").split()).casefold()
    return texto in _PMT_CF


def precio_aprobado(estado: Any) -> bool:
    return normalizar_estado_precio(estado) == ESTADO_PRECIO_APROBADO


def indice_listado_exacto(filas: Optional[Iterable[dict]]) -> Dict[ClaveItem, dict]:
    """Todas las filas del listado, por capítulo y código exactos.

    Si hay dos filas con la misma clave, gana el ``id`` mayor. Incluye
    estado y si el capítulo es de PMT, para poder explicar las exclusiones.
    """
    out: Dict[ClaveItem, dict] = {}
    rank: Dict[ClaveItem, int] = {}
    for raw in filas or []:
        if not isinstance(raw, dict):
            continue
        item = raw.get("item_numero")
        if item is None or str(item).strip() == "":
            item = raw.get("item")
        clave = clave_item_exacta(raw.get("capitulo"), item)
        if not clave[0] or not clave[1]:
            continue
        try:
            rid = int(raw.get("id") or 0)
        except (TypeError, ValueError):
            rid = 0
        if clave in out and rid < rank.get(clave, 0):
            continue
        rank[clave] = rid
        estado = normalizar_estado_precio(raw.get("estado_precio"))
        out[clave] = {
            "id": rid,
            "capitulo": clave[0],
            "item_numero": clave[1],
            "descripcion": str(raw.get("descripcion") or raw.get("item_descripcion") or "").strip(),
            "unidad": str(raw.get("unidad") or raw.get("und") or "").strip(),
            "vlr_unitario": _sf(
                raw.get("precio_unitario")
                if raw.get("precio_unitario") is not None
                else raw.get("vlr_unitario")
            ),
            "especificacion_tecnica": str(raw.get("especificacion_tecnica") or "").strip(),
            "estado_precio": estado,
            "es_pmt": es_capitulo_pmt(clave[0]),
            "aprobado": estado == ESTADO_PRECIO_APROBADO,
        }
    return out


def filas_que_entran_al_informe(filas: Optional[Iterable[dict]]) -> List[dict]:
    """Aprobados que no pertenecen a un capítulo de PMT. Una ficha por clave."""
    indice = indice_listado_exacto(filas)
    return [
        ficha
        for ficha in indice.values()
        if ficha.get("aprobado") and not ficha.get("es_pmt")
    ]


def sumar_cantidad_por_clave(registros: Optional[Iterable[dict]]) -> Dict[ClaveItem, float]:
    """Suma ``cantidad_total`` solo entre filas del mismo capítulo y el mismo código."""
    acc: Dict[ClaveItem, float] = {}
    for raw in registros or []:
        if not isinstance(raw, dict):
            continue
        item = raw.get("item_numero")
        if item is None or str(item).strip() == "":
            item = raw.get("item")
        clave = clave_item_exacta(raw.get("capitulo"), item)
        if not clave[0] or not clave[1]:
            continue
        acc[clave] = acc.get(clave, 0.0) + _sf(raw.get("cantidad_total") if raw.get("cantidad_total") is not None else raw.get("cant_total"))
    return acc


def cantidades_presupuesto_exactas(filas: Optional[Iterable[dict]]) -> Dict[ClaveItem, float]:
    """Suma de cantidad del presupuesto por capítulo y código exactos.

    No llama a ``item_key`` ni a ``norm_item``. ``2.1._`` no recibe la
    cantidad de ``2.1``, ni un capítulo la de otro.
    """
    return sumar_cantidad_por_clave(filas)


def costo_linea_registro(raw: dict) -> float:
    cd = _sf(raw.get("costo_directo"))
    if abs(cd) > 1e-9:
        return cd
    return _sf(raw.get("cantidad_total")) * _sf(raw.get("vlr_unitario"))


def _motivo_exclusion(clave: ClaveItem, ficha: Optional[dict]) -> str:
    if es_capitulo_pmt(clave[0]) or (ficha or {}).get("es_pmt"):
        return MOTIVO_PMT
    if ficha is not None and not ficha.get("aprobado"):
        return MOTIVO_ESTADO
    return MOTIVO_AUSENTE


def clasificar_registros_excluidos(
    registros: Optional[Iterable[dict]],
    listado: Optional[Iterable[dict]],
    claves_informe: Iterable[ClaveItem],
) -> dict:
    """Registros del acta que no entran al cuadro, con cantidad y valor.

    Motivos: capítulo de PMT, estado distinto de Aprobado, o capítulo+código
    que no está en el listado.
    """
    claves = set(claves_informe or [])
    indice = listado if isinstance(listado, dict) else indice_listado_exacto(listado)
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
        ficha = indice.get(clave) if isinstance(indice, dict) else None
        if clave not in grupos:
            motivo = _motivo_exclusion(clave, ficha if isinstance(ficha, dict) else None)
            grupos[clave] = {
                "capitulo": clave[0],
                "item_numero": clave[1],
                "item_descripcion": str(
                    (ficha or {}).get("descripcion") or raw.get("item_descripcion") or ""
                ).strip(),
                "estado_precio": (ficha or {}).get("estado_precio") if isinstance(ficha, dict) else None,
                "motivo": motivo,
                "n_registros": 0,
                "cantidad": 0.0,
                "valor": 0.0,
            }
            orden.append(clave)
        g = grupos[clave]
        if not g["item_descripcion"] and raw.get("item_descripcion"):
            g["item_descripcion"] = str(raw.get("item_descripcion") or "").strip()
        g["n_registros"] += 1
        g["cantidad"] += _sf(raw.get("cantidad_total"))
        g["valor"] += costo_linea_registro(raw)

    items = []
    for clave in orden:
        g = grupos[clave]
        g["cantidad"] = _round2(g["cantidad"])
        g["valor"] = float(round(g["valor"], 0))
        items.append(g)
    items.sort(key=lambda r: (r["motivo"], r["capitulo"].lower(), r["item_numero"].lower()))

    def _bloque(motivo: str) -> dict:
        propios = [it for it in items if it["motivo"] == motivo]
        return {
            "n_registros": int(sum(it["n_registros"] for it in propios)),
            "cantidad": _round2(sum(_sf(it.get("cantidad")) for it in propios)),
            "valor_total": float(round(sum(_sf(it.get("valor")) for it in propios), 0)),
            "items": propios,
        }

    return {
        "n_registros": n,
        "cantidad": _round2(sum(_sf(it.get("cantidad")) for it in items)),
        "valor_total": float(round(sum(_sf(it.get("valor")) for it in items), 0)),
        "items": items,
        "por_motivo": {
            MOTIVO_PMT: _bloque(MOTIVO_PMT),
            MOTIVO_ESTADO: _bloque(MOTIVO_ESTADO),
            MOTIVO_AUSENTE: _bloque(MOTIVO_AUSENTE),
        },
    }


def construir_cuadro_mensual(
    filas_listado: Optional[Iterable[dict]],
    *,
    cantidades_por_clave: Optional[Dict[ClaveItem, float]] = None,
    cant_presente: Optional[Dict[ClaveItem, float]] = None,
    cant_anterior: Optional[Dict[ClaveItem, float]] = None,
    claves_con_registros_acta: Optional[Iterable[ClaveItem]] = None,
) -> dict:
    """Ítems aprobados del listado, sin capítulos de PMT.

    Actualizadas es la cantidad del mismo capítulo y código en el
    presupuesto (cero si no hay). Presente, acumulado y saldo solo suman
    registros de esa misma clave. Descripción, unidad, norma y valor
    unitario salen de la fila del listado.
    """
    presente = cant_presente or {}
    anterior = cant_anterior or {}
    cantidades = cantidades_por_clave or {}
    con_registros = set(claves_con_registros_acta or [])
    fichas = filas_que_entran_al_informe(filas_listado)
    claves = {(f["capitulo"], f["item_numero"]) for f in fichas}

    borrador: List[dict] = []
    for ficha in fichas:
        clave = (ficha["capitulo"], ficha["item_numero"])
        vu = _sf(ficha.get("vlr_unitario"))
        cant_act = _round2(cantidades.get(clave, 0.0))
        cant_pres = _round2(presente.get(clave, 0.0))
        cant_ant = _round2(anterior.get(clave, 0.0))
        cant_acum = _round2(cant_ant + cant_pres)
        cant_saldo = _round2(cant_act - cant_acum)
        norma = str(ficha.get("especificacion_tecnica") or "").strip()
        valor_act = valor_por_cantidad_vu(cant_act, vu)
        borrador.append(
            {
                "capitulo": ficha["capitulo"],
                "item_numero": ficha["item_numero"],
                "item_descripcion": ficha["descripcion"],
                "unidad": ficha["unidad"],
                "norma_tecnica": norma,
                "especificacion_tecnica": norma,
                "vlr_unitario": vu,
                "vlr_unitario_sub": vu,
                "cantidad": cant_pres,
                "costo_directo": valor_por_cantidad_vu(cant_pres, vu),
                "cant_actualizadas": cant_act,
                "valor_actualizadas": valor_act,
                "valor_actualizadas_literal": False,
                "cant_presente": cant_pres,
                "valor_presente": valor_por_cantidad_vu(cant_pres, vu),
                "cant_acum_anterior": cant_ant,
                "cant_acumulado": cant_acum,
                "valor_acumulado": valor_por_cantidad_vu(cant_acum, vu),
                "cant_saldo": cant_saldo,
                "valor_saldo": valor_por_cantidad_vu(cant_saldo, vu),
                "sin_precio": vu <= 0,
                "tiene_registros_acta": clave in con_registros or abs(_sf(presente.get(clave))) > 1e-12,
                "estado_precio": ESTADO_PRECIO_APROBADO,
            }
        )

    items = sort_items_capitulo_item_asc(borrador)
    total_act = float(round(sum(_sf(it.get("valor_actualizadas")) for it in items), 0))
    return {
        "items": items,
        "claves": claves,
        "costo_directo_presupuesto": total_act,
        "costo_directo_actualizadas": total_act,
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


def fetch_listado_contrato(sb, contrato_id: int) -> List[dict]:
    """Todas las filas del listado del contrato, sin filtrar estado ni capítulo."""

    def _q(ini: int, fin: int):
        return (
            sb.table("listado_precios")
            .select(_SELECT_LISTADO)
            .eq("contrato_id", int(contrato_id))
            .order("id")
            .range(ini, fin)
        )

    return _paginar(_q)


def fetch_cantidades_presupuesto_exactas(sb, contrato_id: int) -> Dict[ClaveItem, float]:
    """Cantidad del presupuesto de obra vivo, por capítulo y código exactos."""

    def _q(ini: int, fin: int):
        return (
            sb.table("presupuesto")
            .select(_SELECT_CANT)
            .eq("contrato_id", int(contrato_id))
            .eq("tipo_ejecucion", "Presupuesto de Obra")
            .eq("dado_de_baja", False)
            .order("id")
            .range(ini, fin)
        )

    return cantidades_presupuesto_exactas(_paginar(_q))
