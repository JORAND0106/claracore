"""
Metadatos de ítem (número, descripción, unidad) resueltos en vivo desde listado_precios.

Sigue el mismo principio que V.U. vía _dash_listado_vu / listado_vu_for_cap_item:
la UI y los agregados deben mostrar la ficha vigente del listado, no la copia fija
guardada al asignar el ítem en presupuesto / SicoeObra.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

ItemKey = Tuple[str, str]

NormItemFn = Callable[[Optional[str]], str]
NormCapFn = Callable[[Optional[str]], str]


def merge_listado_ficha_prefer_newer(prev: Optional[dict], new: Optional[dict]) -> dict:
    """Combina fichas duplicadas (mismo cap+ítem).

    Alineado con SQL ``_dash_listado_vu`` (``ORDER BY lp.id DESC LIMIT 1``):
    gana la fila de mayor ``id``. Campos vacíos se rellenan desde la otra fila
    (p. ej. competencia solo en una de las copias).
    """
    if not prev and not new:
        return {}
    if not prev:
        return dict(new or {})
    if not new:
        return dict(prev)
    try:
        id_prev = int(prev.get("id") or 0)
    except (TypeError, ValueError):
        id_prev = 0
    try:
        id_new = int(new.get("id") or 0)
    except (TypeError, ValueError):
        id_new = 0
    if id_new >= id_prev:
        base, other = dict(new), prev
    else:
        base, other = dict(prev), new
    for field in (
        "descripcion",
        "unidad",
        "item_numero",
        "competencia",
        "capitulo",
        "especificacion_tecnica",
    ):
        if not str(base.get(field) or "").strip() and str(other.get(field) or "").strip():
            base[field] = other.get(field)
    if base.get("precio_unitario") in (None, "") and other.get("precio_unitario") not in (None, ""):
        base["precio_unitario"] = other.get("precio_unitario")
    return base


def listado_meta_for_cap_item(
    cap_key: str,
    item_key: str,
    *,
    full_listado_by_cap_item: Optional[Dict[ItemKey, dict]] = None,
) -> Optional[dict]:
    """Fila listado vigente para (capítulo_norm, ítem_norm), o None."""
    if not full_listado_by_cap_item or not item_key:
        return None
    row = full_listado_by_cap_item.get((cap_key or "", item_key))
    if isinstance(row, dict):
        return row
    # Filas sin capítulo (p. ej. selects de Informes): si el ítem es único en el índice, usarlo.
    if (cap_key or "") in ("", "Sin capítulo"):
        hits = [
            v
            for (ck, ik), v in full_listado_by_cap_item.items()
            if ik == item_key and isinstance(v, dict)
        ]
        if len(hits) == 1:
            return hits[0]
    return None


def overlay_presupuesto_row(
    row: dict,
    listado_idx: Dict[ItemKey, dict],
    *,
    norm_cap: NormCapFn,
    norm_item: NormItemFn,
) -> dict:
    """Inyecta item / descripcion / und desde listado cuando hay match por cap+ítem."""
    if not row or not listado_idx:
        return row
    ck = norm_cap(row.get("capitulo"))
    ik = norm_item(row.get("item"))
    meta = listado_meta_for_cap_item(ck, ik, full_listado_by_cap_item=listado_idx)
    if not meta:
        return row
    out = dict(row)
    if meta.get("item_numero") not in (None, ""):
        out["item"] = meta["item_numero"]
    if meta.get("descripcion") not in (None, ""):
        out["descripcion"] = meta["descripcion"]
    if meta.get("unidad") not in (None, ""):
        out["und"] = meta["unidad"]
    out["_listado_meta_vivo"] = True
    return out


def overlay_sicoe_row(
    row: dict,
    listado_idx: Dict[ItemKey, dict],
    *,
    norm_cap: NormCapFn,
    norm_item: NormItemFn,
) -> dict:
    """Inyecta item_numero / item_descripcion / unidad (y descripcion alias) desde listado."""
    if not row or not listado_idx:
        return row
    ck = norm_cap(row.get("capitulo"))
    ik = norm_item(row.get("item_numero") or row.get("item"))
    meta = listado_meta_for_cap_item(ck, ik, full_listado_by_cap_item=listado_idx)
    if not meta:
        return row
    out = dict(row)
    if meta.get("item_numero") not in (None, ""):
        out["item_numero"] = meta["item_numero"]
    desc = meta.get("descripcion")
    if desc not in (None, ""):
        out["item_descripcion"] = desc
        # Algunos payloads offline usan `descripcion` como alias de ficha.
        if "descripcion" in out or out.get("descripcion") in (None, ""):
            out["descripcion"] = desc
    if meta.get("unidad") not in (None, ""):
        out["unidad"] = meta["unidad"]
    # Norma técnica del informe = especificación técnica del listado.
    # No se copia acta_fijacion ni ningún otro campo.
    if "especificacion_tecnica" in meta or "norma_tecnica" in meta:
        esp = str(meta.get("especificacion_tecnica") or "").strip()
        out["especificacion_tecnica"] = esp
        out["norma_tecnica"] = esp
    out["_listado_meta_vivo"] = True
    return out


def aplicar_identificacion_listado(
    rows: Sequence[dict],
    listado_idx: Optional[Dict[ItemKey, dict]],
    *,
    aplicar_vu: bool = False,
) -> List[dict]:
    """Pisa capítulo, ítem, descripción, unidad y norma con el texto del listado.

    La clave es (capítulo, ítem) normalizada. El texto que se muestra es el
    almacenado en la fila vigente (mayor id), sin cambiar mayúsculas.
    ``aplicar_vu`` copia ``vlr_unitario`` del listado del contrato a
    ``vlr_unitario`` y ``vlr_unitario_sub``. Si no hay cruce, no conserva
    el precio copiado en el registro.
    No lee ``acta_fijacion``.
    """
    from sicoe_valor_canonico import cap_item_key

    idx = listado_idx or {}
    out: List[dict] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        k = cap_item_key(item.get("capitulo"), item.get("item_numero") or item.get("item"))
        meta = idx.get(k) if isinstance(idx.get(k), dict) else None
        if meta is None and not k[0]:
            hits = [
                v
                for (ck, ik), v in idx.items()
                if ik == k[1] and isinstance(v, dict)
            ]
            if len(hits) == 1:
                meta = hits[0]
        if not meta:
            if aplicar_vu:
                item["vlr_unitario"] = 0.0
                item["vlr_unitario_sub"] = 0.0
                item["sin_precio"] = True
                item["precio_fuente"] = None
            item["_identificacion_listado"] = False
            out.append(item)
            continue
        cap = str(meta.get("capitulo") or "").strip()
        num = str(meta.get("item_numero") or "").strip()
        desc = str(meta.get("descripcion") or "")
        und = str(meta.get("unidad") or "").strip()
        esp = str(meta.get("especificacion_tecnica") or "").strip()
        if cap:
            item["capitulo"] = cap
        if num:
            item["item_numero"] = num
            if "item" in item:
                item["item"] = num
        item["item_descripcion"] = desc
        item["descripcion"] = desc
        item["unidad"] = und
        if "und" in item:
            item["und"] = und
        item["especificacion_tecnica"] = esp
        item["norma_tecnica"] = esp
        item["_identificacion_listado"] = True
        if aplicar_vu:
            vu = meta.get("vlr_unitario")
            if vu in (None, ""):
                vu = meta.get("precio_unitario")
            try:
                vu_n = float(vu or 0)
            except (TypeError, ValueError):
                vu_n = 0.0
            item["vlr_unitario"] = vu_n
            item["vlr_unitario_sub"] = vu_n
            item["precio_unitario"] = vu_n
            item["precio_fuente"] = "listado_precios" if vu_n > 0 else None
            item["sin_precio"] = vu_n <= 0
        elif meta.get("precio_unitario") not in (None, "") or meta.get("vlr_unitario") not in (None, ""):
            bruto = meta.get("precio_unitario")
            if bruto in (None, ""):
                bruto = meta.get("vlr_unitario")
            item["precio_unitario_listado"] = bruto
        out.append(item)
    return out


def overlay_presupuesto_rows(
    rows: Sequence[dict],
    listado_idx: Dict[ItemKey, dict],
    *,
    norm_cap: NormCapFn,
    norm_item: NormItemFn,
) -> List[dict]:
    return [
        overlay_presupuesto_row(r, listado_idx, norm_cap=norm_cap, norm_item=norm_item)
        for r in (rows or [])
    ]


def overlay_sicoe_rows(
    rows: Sequence[dict],
    listado_idx: Dict[ItemKey, dict],
    *,
    norm_cap: NormCapFn,
    norm_item: NormItemFn,
) -> List[dict]:
    return [
        overlay_sicoe_row(r, listado_idx, norm_cap=norm_cap, norm_item=norm_item)
        for r in (rows or [])
    ]


def meta_fields_changed(antes: dict, despues: dict) -> List[str]:
    """Campos de ficha (ítem / descripción / unidad) que cambian entre dos estados."""
    changed: List[str] = []
    pairs = (
        ("item_numero", "item_numero"),
        ("descripcion", "descripcion"),
        ("unidad", "unidad"),
    )
    for key, _ in pairs:
        a = str((antes or {}).get(key) or "").strip()
        b = str((despues or {}).get(key) or "").strip()
        if a != b:
            changed.append(key)
    return changed


def build_impacto_edicion_meta(
    *,
    precio: dict,
    ppto_rows: Iterable[dict],
    sicoe_rows: Iterable[dict],
    actas_by_id: Dict[int, dict],
    reportes_by_id: Dict[int, dict],
    firmadas_ids: set,
    norm_cap: NormCapFn,
    norm_item: NormItemFn,
    campos_cambiados: Optional[Sequence[str]] = None,
) -> dict:
    """
    Cuenta registros de presupuesto y SicoeObra ligados al ítem del listado
    y lista actas RPO / reportes específicos afectados.
    """
    cap_k = norm_cap(precio.get("capitulo"))
    it_k = norm_item(precio.get("item_numero"))
    comp_f = (precio.get("competencia") or "").strip()

    ppto_ids: List[int] = []
    for r in ppto_rows or []:
        if it_k and norm_item(r.get("item")) != it_k:
            continue
        if cap_k and norm_cap(r.get("capitulo")) != cap_k:
            continue
        if comp_f and (r.get("competencia") or "").strip() != comp_f:
            continue
        try:
            ppto_ids.append(int(r["id"]))
        except (TypeError, ValueError, KeyError):
            continue

    sicoe_ids: List[int] = []
    acta_ids: set = set()
    reporte_ids: set = set()
    for r in sicoe_rows or []:
        if it_k and norm_item(r.get("item_numero")) != it_k:
            continue
        if cap_k and norm_cap(r.get("capitulo")) != cap_k:
            continue
        if comp_f and (r.get("competencia") or "").strip() != comp_f:
            continue
        try:
            sicoe_ids.append(int(r["id"]))
        except (TypeError, ValueError, KeyError):
            continue
        if r.get("acta_rpo_id") is not None:
            try:
                acta_ids.add(int(r["acta_rpo_id"]))
            except (TypeError, ValueError):
                pass
        if r.get("reporte_id") is not None:
            try:
                reporte_ids.add(int(r["reporte_id"]))
            except (TypeError, ValueError):
                pass

    actas_out = []
    for aid in sorted(acta_ids):
        a = actas_by_id.get(aid) or {}
        actas_out.append({
            "id": aid,
            "numero_rpo": a.get("numero_rpo"),
            "firmada": aid in (firmadas_ids or set()),
        })

    reportes_out = []
    for rid in sorted(reporte_ids):
        rep = reportes_by_id.get(rid) or {}
        acta_id = rep.get("acta_rpo_id")
        try:
            acta_id_i = int(acta_id) if acta_id is not None else None
        except (TypeError, ValueError):
            acta_id_i = None
        numero_rpo = None
        if acta_id_i is not None and acta_id_i in actas_by_id:
            numero_rpo = actas_by_id[acta_id_i].get("numero_rpo")
        reportes_out.append({
            "id": rid,
            "numero_reporte": rep.get("numero_reporte"),
            "acta_rpo_id": acta_id_i,
            "numero_rpo": numero_rpo,
            "estado": rep.get("estado"),
        })

    return {
        "item_id": precio.get("id"),
        "contrato_id": precio.get("contrato_id"),
        "item_numero": precio.get("item_numero"),
        "capitulo": precio.get("capitulo"),
        "campos_cambiados": list(campos_cambiados or []),
        "presupuesto_count": len(ppto_ids),
        "sicoe_registros_count": len(sicoe_ids),
        "actas_rpo_count": len(actas_out),
        "reportes_count": len(reportes_out),
        "actas_rpo": actas_out,
        "reportes": reportes_out,
        "mensaje": (
            "Al guardar, ítem, descripción y unidad se resolverán en vivo desde el listado "
            "en Presupuesto y SicoeObra. Esta acción no se puede deshacer."
        ),
    }
