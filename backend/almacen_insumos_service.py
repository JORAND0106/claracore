"""
Insumos, proveedores y contexto presupuestal — módulo Almacén.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from almacen_service import _sb, _to_float


def _norm_item_key(item: Optional[str]) -> str:
    t = str(item or "").strip()
    return re.sub(r"\.+$", "", t)


def _natural_sort_key(text: Optional[str]) -> tuple:
    s = str(text or "").strip()
    parts = re.split(r"(\d+)", s)
    key: list = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part.lower()))
    return tuple(key) if key else ((1, ""),)


def _norm_pk_id(pk: Optional[str]) -> str:
    return str(pk or "").strip()


def _normalize_impuestos(raw: Any) -> List[dict]:
    if not raw:
        return []
    if not isinstance(raw, list):
        return []
    out = []
    for imp in raw:
        if not isinstance(imp, dict):
            continue
        nombre = (imp.get("nombre") or "").strip()
        tipo = (imp.get("tipo") or "porcentaje").strip().lower()
        if tipo not in ("porcentaje", "valor"):
            tipo = "porcentaje"
        valor = _to_float(imp.get("valor"))
        if not nombre or valor < 0:
            continue
        out.append({"nombre": nombre, "tipo": tipo, "valor": valor})
    return out


_IVA_SOBRE_VALIDOS = frozenset({"costo_base", "utilidad", "aiu", "costo_mas_aiu"})


def _pct_or_none(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None
    if n < 0:
        return None
    return n


TIPO_IMPUESTO_IVA_PLENO = "iva_pleno"
TIPO_IMPUESTO_IVA_SOBRE_UTILIDAD = "iva_sobre_utilidad"
TIPO_IMPUESTO_AIU_SIN_IVA = "aiu_sin_iva"

_TIPO_IMPUESTO_LABEL = {
    TIPO_IMPUESTO_IVA_PLENO: "IVA Pleno",
    TIPO_IMPUESTO_IVA_SOBRE_UTILIDAD: "IVA sobre Utilidad",
    TIPO_IMPUESTO_AIU_SIN_IVA: "AIU (sin IVA)",
}


def normalize_tributos(raw: Any) -> Dict[str, Any]:
    """
    Impuesto unificado por insumo (captura). No redefine valor_compra_referencia.

    Inferencia de tipo (no seleccionable por el usuario):
    - solo IVA → iva_pleno (sobre costo_base)
    - A/I/U + IVA → iva_sobre_utilidad (sobre utilidad)
    - solo A/I/U → aiu_sin_iva
    """
    src = raw if isinstance(raw, dict) else {}
    aiu_in = src.get("aiu") if isinstance(src.get("aiu"), dict) else {}
    iva_in = src.get("iva") if isinstance(src.get("iva"), dict) else {}

    administracion = _pct_or_none(
        src.get("administracion") if src.get("administracion") is not None else aiu_in.get("administracion")
    )
    imprevistos = _pct_or_none(
        src.get("imprevistos") if src.get("imprevistos") is not None else aiu_in.get("imprevistos")
    )
    utilidad = _pct_or_none(
        src.get("utilidad") if src.get("utilidad") is not None else aiu_in.get("utilidad")
    )

    iva_pct = None
    if not isinstance(src.get("iva"), dict) and src.get("iva") is not None:
        iva_pct = _pct_or_none(src.get("iva"))
    if iva_pct is None:
        iva_pct = _pct_or_none(iva_in.get("porcentaje"))
    if iva_pct is None:
        iva_pct = _pct_or_none(aiu_in.get("iva_utilidad"))

    tiene_aiu = any(v is not None for v in (administracion, imprevistos, utilidad))
    tiene_iva = iva_pct is not None
    if tiene_aiu and tiene_iva:
        tipo = TIPO_IMPUESTO_IVA_SOBRE_UTILIDAD
        sobre = "utilidad"
    elif not tiene_aiu and tiene_iva:
        tipo = TIPO_IMPUESTO_IVA_PLENO
        sobre = "costo_base"
    elif tiene_aiu and not tiene_iva:
        tipo = TIPO_IMPUESTO_AIU_SIN_IVA
        sobre = "costo_base"
    else:
        tipo = None
        sobre = "costo_base"

    return {
        "tipo": tipo,
        "administracion": administracion,
        "imprevistos": imprevistos,
        "utilidad": utilidad,
        "aiu": {
            "administracion": administracion,
            "imprevistos": imprevistos,
            "utilidad": utilidad,
            "iva_utilidad": iva_pct if tipo == TIPO_IMPUESTO_IVA_SOBRE_UTILIDAD else None,
        },
        "iva": {
            "porcentaje": iva_pct,
            "sobre": sobre,
        },
    }


def _aiu_tiene_datos(aiu: Optional[dict]) -> bool:
    if not isinstance(aiu, dict):
        return False
    return any(aiu.get(k) is not None for k in ("administracion", "imprevistos", "utilidad"))


def _iva_tiene_datos(iva: Optional[dict]) -> bool:
    return isinstance(iva, dict) and iva.get("porcentaje") is not None


def _tributos_etiqueta(tributos: Any) -> Optional[str]:
    t = normalize_tributos(tributos)
    tipo = t.get("tipo")
    aiu = t.get("aiu") or {}
    iva = t.get("iva") or {}
    if not tipo and not _aiu_tiene_datos(aiu) and not _iva_tiene_datos(iva):
        return None
    bits: List[str] = []
    if tipo:
        bits.append(_TIPO_IMPUESTO_LABEL.get(tipo, str(tipo)))
    if aiu.get("administracion") is not None:
        bits.append(f"A {aiu['administracion']:g}%")
    if aiu.get("imprevistos") is not None:
        bits.append(f"Í {aiu['imprevistos']:g}%")
    if aiu.get("utilidad") is not None:
        bits.append(f"U {aiu['utilidad']:g}%")
    if iva.get("porcentaje") is not None:
        bits.append(f"IVA {iva['porcentaje']:g}%")
    return " · ".join(bits) if bits else None


def compute_valor_total_insumo(costo_base: float, impuestos: Optional[List[dict]] = None) -> float:
    base = max(_to_float(costo_base), 0)
    total = base
    for imp in _normalize_impuestos(impuestos):
        if imp["tipo"] == "porcentaje":
            total += base * (imp["valor"] / 100.0)
        else:
            total += imp["valor"]
    return round(total, 2)


def compute_costo_total_insumo(
    costo_base: float,
    tipo_impuesto: Optional[str] = None,
    impuesto_porcentaje: float = 0,
    impuestos: Optional[List[dict]] = None,
) -> float:
    base = max(_to_float(costo_base), 0)
    tipo = (tipo_impuesto or "").strip().lower()
    pct = _to_float(impuesto_porcentaje)
    if tipo in ("iva", "aiu") and pct > 0:
        return round(base * (1 + pct / 100.0), 2)
    if impuestos:
        return compute_valor_total_insumo(base, impuestos)
    return round(base, 2)


def _impuesto_etiqueta(tipo_impuesto: Optional[str], impuesto_porcentaje: float, tributos: Any = None) -> str:
    trib = _tributos_etiqueta(tributos)
    if trib:
        return trib
    tipo = (tipo_impuesto or "").strip().lower()
    pct = _to_float(impuesto_porcentaje)
    if tipo == "iva" and pct:
        return f"IVA {pct:g}%"
    if tipo == "aiu" and pct:
        return f"AIU {pct:g}%"
    return "—"


def _norm_capitulo_key(s: Optional[str]) -> str:
    """Alinea capítulos con distinto espaciado (misma lógica que dashboard/listado)."""
    if s is None:
        return "Sin capítulo"
    t = str(s).strip()
    if not t:
        return "Sin capítulo"
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def _fetch_all_listado_rows(contrato_id: int, select: str = "*") -> List[dict]:
    sb = _sb()
    out: List[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("listado_precios")
            .select(select)
            .eq("contrato_id", contrato_id)
            .order("item_numero")
            .range(offset, offset + 999)
            .execute()
            .data
            or []
        )
        out.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return out


def list_listado_capitulos(contrato_id: int) -> List[str]:
    """Capítulos únicos del listado de precios del contrato (misma fuente que AdminPanel)."""
    caps = set()
    for row in _fetch_all_listado_rows(contrato_id, "capitulo"):
        cap = (row.get("capitulo") or "").strip()
        if cap:
            caps.add(cap)
    return sorted(caps, key=_natural_sort_key)


def list_listado_items_capitulo(contrato_id: int, capitulo: str) -> List[dict]:
    """Ítems del listado de precios para un capítulo (item_numero + descripción)."""
    capitulo = (capitulo or "").strip()
    if not capitulo:
        return []
    cap_key = _norm_capitulo_key(capitulo)
    seen: set = set()
    out: List[dict] = []
    for row in _fetch_all_listado_rows(contrato_id, "capitulo, item_numero, descripcion, unidad"):
        raw_cap = (row.get("capitulo") or "").strip()
        if not raw_cap:
            continue
        if raw_cap != capitulo and _norm_capitulo_key(raw_cap) != cap_key:
            continue
        key = _norm_item_key(row.get("item_numero")).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({
            "item": row.get("item_numero"),
            "descripcion": row.get("descripcion"),
            "unidad": row.get("unidad") or "UND",
        })
    return sorted(out, key=lambda r: _natural_sort_key(_norm_item_key(r.get("item"))))


def get_listado_precio_unitario(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
) -> Optional[float]:
    """Precio unitario de cobro desde listado_precios (capítulo + ítem del listado)."""
    capitulo = (capitulo or "").strip()
    item_numero = (item_numero or "").strip()
    if not capitulo or not item_numero:
        return None
    cap_key = _norm_capitulo_key(capitulo)
    want_item = _norm_item_key(item_numero).lower()
    for row in _fetch_all_listado_rows(contrato_id, "capitulo, item_numero, precio_unitario"):
        raw_cap = (row.get("capitulo") or "").strip()
        if not raw_cap:
            continue
        if raw_cap != capitulo and _norm_capitulo_key(raw_cap) != cap_key:
            continue
        if _norm_item_key(row.get("item_numero")).lower() != want_item:
            continue
        return _to_float(row.get("precio_unitario"))
    return None


def _build_analisis_valor(
    cant: float,
    valor_compra: Optional[float],
    vlr_cobro: float,
) -> dict:
    """Desglose económico de línea: cobro (listado), consumo (insumo), utilidad."""
    cant_f = _to_float(cant)
    vlr = _to_float(vlr_cobro)
    vc = _to_float(valor_compra) if valor_compra is not None else None
    tiene = vc is not None and vc > 0
    costo_linea = round(vc * cant_f, 2) if tiene else None
    cobro_linea = round(vlr * cant_f, 2) if vlr > 0 else None
    util = round(cobro_linea - costo_linea, 2) if cobro_linea is not None and costo_linea is not None else None
    pct = round((util / cobro_linea) * 100, 2) if util is not None and cobro_linea and cobro_linea > 0 else None
    return {
        "tiene_precio_compra": tiene,
        "cantidad": cant_f,
        "costo_insumo_unitario": vc if tiene else None,
        "valor_cobro_unitario": vlr if vlr > 0 else None,
        "costo_insumo_linea": costo_linea,
        "valor_cobro_linea": cobro_linea,
        "utilidad_estimada_linea": util,
        "rentabilidad_pct": pct,
    }


def _columna_rentabilidad(cant: float, vu_cobro: float, vu_costo: Optional[float]) -> dict:
    """Totales de una columna (presente, acumulado o actual)."""
    cant_f = _to_float(cant)
    vlr = _to_float(vu_cobro)
    vc = _to_float(vu_costo) if vu_costo is not None else None
    tiene_costo = vc is not None and vc > 0
    cobro_linea = round(vlr * cant_f, 2) if vlr > 0 and cant_f > 0 else None
    costo_linea = round(vc * cant_f, 2) if tiene_costo and cant_f > 0 else None
    util = (
        round(cobro_linea - costo_linea, 2)
        if cobro_linea is not None and costo_linea is not None
        else None
    )
    pct = (
        round((util / cobro_linea) * 100, 2)
        if util is not None and cobro_linea and cobro_linea > 0
        else None
    )
    return {
        "cantidad": cant_f,
        "valor_cobro_unitario": vlr if vlr > 0 else None,
        "valor_cobro_linea": cobro_linea,
        "costo_insumo_unitario": vc if tiene_costo else None,
        "costo_insumo_linea": costo_linea,
        "utilidad_estimada_linea": util,
        "rentabilidad_pct": pct,
    }


def _merge_columnas_rentabilidad(a: dict, b: dict) -> dict:
    """Suma dos columnas en Actual (total). VU = promedio ponderado por cantidad."""
    cant = _to_float(a.get("cantidad")) + _to_float(b.get("cantidad"))
    cobro_a = _to_float(a.get("valor_cobro_linea"))
    cobro_b = _to_float(b.get("valor_cobro_linea"))
    costo_a = a.get("costo_insumo_linea")
    costo_b = b.get("costo_insumo_linea")
    cobro_linea = round(cobro_a + cobro_b, 2) if (cobro_a or cobro_b) else None
    costo_linea = None
    if costo_a is not None or costo_b is not None:
        costo_linea = round(_to_float(costo_a) + _to_float(costo_b), 2)
    vu_cobro = round(cobro_linea / cant, 4) if cobro_linea is not None and cant > 0 else None
    vu_costo = round(costo_linea / cant, 4) if costo_linea is not None and cant > 0 else None
    util = (
        round(cobro_linea - costo_linea, 2)
        if cobro_linea is not None and costo_linea is not None
        else None
    )
    pct = (
        round((util / cobro_linea) * 100, 2)
        if util is not None and cobro_linea and cobro_linea > 0
        else None
    )
    return {
        "cantidad": cant,
        "valor_cobro_unitario": vu_cobro,
        "valor_cobro_linea": cobro_linea,
        "costo_insumo_unitario": vu_costo,
        "costo_insumo_linea": costo_linea,
        "utilidad_estimada_linea": util,
        "rentabilidad_pct": pct,
    }


def get_analisis_rentabilidad_acumulada(
    contrato_id: int,
    *,
    solicitud_item_id: int,
    insumo_id: Optional[int],
    capitulo: str,
    item_cobro: str,
    cantidad_presente: float,
    valor_compra_unitario: Optional[float],
    valor_cobro_unitario: float,
) -> dict:
    """
    Rentabilidad presente / acumulada anterior / actual para mismo insumo + ítem de cobro.
    Acumulado = otras líneas en solicitudes enviadas o aprobadas (excluye la línea actual).
    """
    sb = _sb()
    cap = (capitulo or "").strip()
    itm = _norm_item_key(item_cobro)
    presente = _columna_rentabilidad(
        cantidad_presente,
        valor_cobro_unitario,
        valor_compra_unitario,
    )

    q = sb.table("almacen_solicitud_item").select(
        "id, cantidad, valor_compra_unitario, vlr_unitario_cobro, solicitud_id, insumo_id, capitulo, item"
    )
    if insumo_id:
        q = q.eq("insumo_id", int(insumo_id))
    else:
        return {
            "presente": presente,
            "acumulado_anterior": _columna_rentabilidad(0, valor_cobro_unitario, valor_compra_unitario),
            "actual": presente,
        }
    hist_rows = q.execute().data or []
    hist_rows = [
        r for r in hist_rows
        if int(r.get("id") or 0) != int(solicitud_item_id)
        and (r.get("capitulo") or "").strip() == cap
        and _norm_item_key(r.get("item")) == itm
    ]
    if not hist_rows:
        acum = _columna_rentabilidad(0, valor_cobro_unitario, valor_compra_unitario)
        return {"presente": presente, "acumulado_anterior": acum, "actual": presente}

    sol_ids = list({r["solicitud_id"] for r in hist_rows if r.get("solicitud_id")})
    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    )
    sol_map = {s["id"]: s for s in sols}
    cant_acum = 0.0
    cobro_acum = 0.0
    costo_acum = 0.0
    tiene_costo = False
    for r in hist_rows:
        sol = sol_map.get(r.get("solicitud_id")) or {}
        if int(sol.get("contrato_id") or 0) != contrato_id:
            continue
        if sol.get("estado") not in ("enviada", "aprobada"):
            continue
        cant = _to_float(r.get("cantidad"))
        vlr = _to_float(r.get("vlr_unitario_cobro"))
        vc = _to_float(r.get("valor_compra_unitario"))
        cant_acum += cant
        if vlr > 0:
            cobro_acum += cant * vlr
        if vc > 0:
            costo_acum += cant * vc
            tiene_costo = True
    vu_cobro_hist = cobro_acum / cant_acum if cant_acum > 0 and cobro_acum > 0 else _to_float(valor_cobro_unitario)
    vu_costo_hist = costo_acum / cant_acum if cant_acum > 0 and tiene_costo else valor_compra_unitario
    acum = _columna_rentabilidad(cant_acum, vu_cobro_hist, vu_costo_hist if tiene_costo else None)
    actual = _merge_columnas_rentabilidad(acum, presente)
    return {"presente": presente, "acumulado_anterior": acum, "actual": actual}


def _fila_rentabilidad_oc(
    r: dict,
    *,
    es_actual: bool,
    sol: dict,
    oc: Optional[dict],
    vu_cobro_default: float,
    vc_default: Optional[float],
) -> dict:
    cant = _to_float(r.get("cantidad"))
    vlr = _to_float(r.get("vlr_unitario_cobro")) or _to_float(vu_cobro_default)
    vc_raw = r.get("valor_compra_unitario")
    vc = _to_float(vc_raw) if vc_raw not in (None, "") else None
    if (vc is None or vc <= 0) and es_actual:
        vc = _to_float(vc_default) if vc_default not in (None, "") else None
    col = _columna_rentabilidad(cant, vlr, vc if vc and vc > 0 else None)
    num_oc = oc.get("numero_oc") if oc else None
    consec = sol.get("consecutivo")
    if es_actual:
        etiqueta = "Esta solicitud"
    elif num_oc is not None:
        etiqueta = f"Sol. #{consec}" if consec else "Anterior"
    else:
        etiqueta = f"Sol. #{consec} (sin OC)" if consec else "Sin OC"
    return {
        **col,
        "numero_oc": num_oc,
        "etiqueta_fila": etiqueta,
        "es_actual": es_actual,
        "solicitud_consecutivo": consec,
        "solicitud_id": r.get("solicitud_id"),
    }


def get_analisis_rentabilidad_por_oc(
    contrato_id: int,
    *,
    solicitud_item_id: int,
    solicitud_id: int,
    insumo_id: Optional[int],
    capitulo: str,
    item_cobro: str,
    cantidad_presente: float,
    valor_compra_unitario: Optional[float],
    valor_cobro_unitario: float,
    solicitud_consecutivo: Optional[int] = None,
) -> dict:
    """
    Rentabilidad desglosada por OC / solicitud para mismo insumo + ítem de cobro.
    Una fila por cada solicitud histórica con OC (o sin OC) + fila de la solicitud actual.
    """
    sb = _sb()
    cap = (capitulo or "").strip()
    itm = _norm_item_key(item_cobro)

    if not insumo_id:
        col = _columna_rentabilidad(
            cantidad_presente,
            valor_cobro_unitario,
            valor_compra_unitario,
        )
        oc_row = (
            sb.table("almacen_orden_compra")
            .select("numero_oc")
            .eq("solicitud_id", int(solicitud_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        num_oc = oc_row[0].get("numero_oc") if oc_row else None
        return {
            "filas": [{
                **col,
                "numero_oc": num_oc,
                "etiqueta_fila": "Esta solicitud",
                "es_actual": True,
                "solicitud_consecutivo": solicitud_consecutivo,
                "solicitud_id": solicitud_id,
            }],
        }

    hist_rows = (
        sb.table("almacen_solicitud_item")
        .select(
            "id, cantidad, valor_compra_unitario, vlr_unitario_cobro, "
            "solicitud_id, insumo_id, capitulo, item"
        )
        .eq("insumo_id", int(insumo_id))
        .execute()
        .data
        or []
    )
    hist_rows = [
        r for r in hist_rows
        if (r.get("capitulo") or "").strip() == cap
        and _norm_item_key(r.get("item")) == itm
    ]

    sol_ids = list({int(r["solicitud_id"]) for r in hist_rows if r.get("solicitud_id")})
    if int(solicitud_id) not in sol_ids:
        sol_ids.append(int(solicitud_id))

    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id, consecutivo")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    )
    sol_map = {
        int(s["id"]): s for s in sols
        if int(s.get("contrato_id") or 0) == contrato_id
    }

    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("id, solicitud_id, numero_oc")
        .in_("solicitud_id", sol_ids)
        .execute()
        .data
        or []
    )
    oc_map = {int(o["solicitud_id"]): o for o in oc_rows if o.get("solicitud_id")}

    otras: list = []
    actual_tuple = None
    for r in hist_rows:
        sid = int(r.get("solicitud_id") or 0)
        sol = sol_map.get(sid)
        if not sol:
            continue
        es_actual = int(r.get("id") or 0) == int(solicitud_item_id)
        tup = (r, sol, oc_map.get(sid))
        if es_actual:
            actual_tuple = tup
        elif sol.get("estado") in ("enviada", "aprobada"):
            otras.append(tup)

    def _sort_key(t):
        _r, sol, oc = t
        n = int(oc.get("numero_oc") or 0) if oc else 0
        return (n, int(sol.get("consecutivo") or 0))

    otras.sort(key=_sort_key)

    filas = []
    for r, sol, oc in otras:
        filas.append(_fila_rentabilidad_oc(
            r,
            es_actual=False,
            sol=sol,
            oc=oc,
            vu_cobro_default=valor_cobro_unitario,
            vc_default=valor_compra_unitario,
        ))

    if actual_tuple:
        r, sol, oc = actual_tuple
        filas.append(_fila_rentabilidad_oc(
            r,
            es_actual=True,
            sol=sol,
            oc=oc,
            vu_cobro_default=valor_cobro_unitario,
            vc_default=valor_compra_unitario,
        ))
    else:
        col = _columna_rentabilidad(
            cantidad_presente,
            valor_cobro_unitario,
            valor_compra_unitario,
        )
        filas.append({
            **col,
            "numero_oc": oc_map.get(int(solicitud_id), {}).get("numero_oc"),
            "etiqueta_fila": "Esta solicitud",
            "es_actual": True,
            "solicitud_consecutivo": solicitud_consecutivo,
            "solicitud_id": solicitud_id,
        })

    return {"filas": filas}


def _insumo_label(row: dict) -> str:
    cod = (row.get("codigo") or "").strip()
    desc = (row.get("descripcion") or "").strip()
    if cod and desc:
        return f"{cod} — {desc}"
    return cod or desc or "Insumo"


def _insumo_tiene_precio_compra(row: dict) -> bool:
    """True solo si el insumo del catálogo tiene valor de compra registrado (> 0)."""
    if (row.get("origen") or "") == "listado_precios":
        return False
    if row.get("costo_base") is not None and _to_float(row.get("costo_base")) > 0:
        return True
    return _to_float(row.get("valor_compra_referencia")) > 0


def _row_from_listado(lp: dict) -> dict:
    return {
        "id": None,
        "insumo_id": None,
        "listado_precio_id": lp.get("id"),
        "proveedor_id": None,
        "proveedor_nombre": "—",
        "codigo": lp.get("item_numero") or "",
        "descripcion": lp.get("descripcion") or "",
        "unidad": lp.get("unidad") or "UND",
        "rendimiento": None,
        "costo": None,
        "tipo_impuesto": None,
        "impuesto_etiqueta": "—",
        "costo_total": None,
        "valor_compra_referencia": None,
        "tiene_precio_compra": False,
        "capitulo": lp.get("capitulo"),
        "item_numero": lp.get("item_numero"),
        "origen": "listado_precios",
        "label": _insumo_label({
            "codigo": lp.get("item_numero"),
            "descripcion": lp.get("descripcion"),
        }),
    }


def _row_from_almacen_insumo(row: dict, proveedor_nombre: str = "—") -> dict:
    costo = _to_float(row.get("costo_base") if row.get("costo_base") is not None else row.get("valor_compra_referencia"))
    tipo = row.get("tipo_impuesto")
    pct = _to_float(row.get("impuesto_porcentaje"))
    tiene = _insumo_tiene_precio_compra({**row, "origen": "almacen_insumo"})
    total = None
    if tiene:
        total = _to_float(row.get("valor_compra_referencia")) or compute_costo_total_insumo(
            costo, tipo, pct, row.get("impuestos"),
        )
    return {
        **row,
        "insumo_id": row.get("id"),
        "proveedor_nombre": proveedor_nombre,
        "rendimiento": row.get("rendimiento"),
        "costo": costo if tiene else None,
        "tipo_impuesto": tipo,
        "impuesto_etiqueta": _impuesto_etiqueta(tipo, pct, row.get("tributos")) if tiene else "—",
        "costo_total": total,
        "valor_compra_referencia": total,
        "tiene_precio_compra": tiene,
        "tributos": normalize_tributos(row.get("tributos")),
        "origen": "almacen_insumo",
        "label": _insumo_label(row),
    }


def _get_cotizaciones_minimas(contrato_id: int) -> int:
    sb = _sb()
    rows = (
        sb.table("almacen_config")
        .select("cotizaciones_minimas")
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return int(rows[0].get("cotizaciones_minimas") or 3)
    return 3


def _insumo_disponible_solicitud(row: dict, sb, min_cot: int) -> bool:
    """Insumo seleccionable en solicitudes: precio válido y cotizaciones si aplica."""
    if not _insumo_tiene_precio_compra({**row, "origen": "almacen_insumo"}):
        return False
    if row.get("requiere_cotizacion") is False:
        return True
    insumo_id = row.get("id")
    if not insumo_id:
        return False
    tiene_ganadora = bool(row.get("soporte_pdf_blob_path") or row.get("cotizacion_numero"))
    soportes = (
        sb.table("almacen_insumo_cotizacion_soporte")
        .select("id")
        .eq("insumo_id", insumo_id)
        .execute()
        .data
        or []
    )
    total = (1 if tiene_ganadora else 0) + len(soportes)
    return total >= min_cot


def search_insumos(contrato_id: int, q: str = "", limit: int = 30) -> List[dict]:
    rows, _, _ = search_insumos_solo_catalogo(contrato_id, q, limit, 0)
    return rows


def search_insumos_solo_catalogo(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[dict], int, int]:
    """Búsqueda para solicitudes: solo insumos activos del catálogo (almacen_insumo).
    Retorna (filas, total_filtrado, total_catalogo_activo)."""
    sb = _sb()
    q_raw = (q or "").strip()
    q_lower = q_raw.lower()
    query = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("codigo")
    )
    rows = query.execute().data or []
    catalog_total = len(rows)

    prov_ids = {r.get("proveedor_id") for r in rows if r.get("proveedor_id")}
    prov_map: Dict[int, str] = {}
    if prov_ids:
        provs = (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        )
        prov_map = {int(p["id"]): p.get("razon_social") or "—" for p in provs}

    min_cot = _get_cotizaciones_minimas(contrato_id)
    out: List[dict] = []
    for row in rows:
        if not _insumo_disponible_solicitud(row, sb, min_cot):
            continue
        label = _insumo_label(row)
        pname = prov_map.get(int(row.get("proveedor_id") or 0), "—")
        if q_lower:
            hay = (
                q_lower in label.lower()
                or q_lower in (row.get("codigo") or "").lower()
                or q_lower in (row.get("descripcion") or "").lower()
                or q_lower in pname.lower()
            )
            if not hay:
                continue
        out.append(_row_from_almacen_insumo(row, pname))

    total = len(out)
    return out[offset: offset + limit], total, catalog_total


def search_insumos_catalog(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[dict], int]:
    sb = _sb()
    q = (q or "").strip().lower()
    lp_rows = _fetch_all_listado_rows(
        contrato_id,
        "id, item_numero, descripcion, unidad, precio_unitario, capitulo, competencia",
    )
    ai_rows = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("codigo")
        .execute()
        .data
        or []
    )
    prov_ids = {r.get("proveedor_id") for r in ai_rows if r.get("proveedor_id")}
    prov_map: Dict[int, str] = {}
    if prov_ids:
        provs = (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        )
        prov_map = {int(p["id"]): p.get("razon_social") or "—" for p in provs}

    out: List[dict] = []
    seen_lp: set = set()
    seen_cod: set = set()

    def _match(text: str) -> bool:
        if not q:
            return True
        return q in (text or "").lower()

    for lp in lp_rows:
        lid = lp.get("id")
        if lid in seen_lp:
            continue
        label = _insumo_label({"codigo": lp.get("item_numero"), "descripcion": lp.get("descripcion")})
        hay = _match(label) or _match(lp.get("item_numero") or "") or _match(lp.get("descripcion") or "")
        if not hay:
            continue
        seen_lp.add(lid)
        seen_cod.add(_norm_item_key(lp.get("item_numero")).lower())
        out.append(_row_from_listado(lp))

    for row in ai_rows:
        cod = _norm_item_key(row.get("codigo")).lower()
        if row.get("listado_precio_id") in seen_lp or cod in seen_cod:
            continue
        label = _insumo_label(row)
        hay = _match(label) or _match(row.get("codigo") or "") or _match(row.get("descripcion") or "")
        if not hay:
            continue
        seen_cod.add(cod)
        pname = prov_map.get(int(row.get("proveedor_id") or 0), "—")
        out.append(_row_from_almacen_insumo(row, pname))

    total = len(out)
    return out[offset: offset + limit], total


def get_insumo(contrato_id: int, insumo_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("id", insumo_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Insumo no encontrado.")
    row = rows[0]
    pname = "—"
    if row.get("proveedor_id"):
        prov = (
            sb.table("almacen_proveedor")
            .select("razon_social")
            .eq("id", int(row["proveedor_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if prov:
            pname = prov[0].get("razon_social") or "—"
    return _row_from_almacen_insumo(row, pname)


def ensure_insumo_from_listado(contrato_id: int, listado_precio_id: int, user_id: int) -> dict:
    sb = _sb()
    existing = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("listado_precio_id", listado_precio_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return _row_from_almacen_insumo(existing[0])

    lp_rows = (
        sb.table("listado_precios")
        .select("id, item_numero, descripcion, unidad, precio_unitario, capitulo")
        .eq("id", listado_precio_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not lp_rows:
        raise ValueError("Ítem de listado de precios no encontrado.")
    lp = lp_rows[0]
    codigo = (lp.get("item_numero") or "").strip() or f"LP-{listado_precio_id}"
    row = {
        "contrato_id": contrato_id,
        "listado_precio_id": listado_precio_id,
        "codigo": codigo,
        "descripcion": (lp.get("descripcion") or codigo).strip(),
        "unidad": (lp.get("unidad") or "UND").strip(),
        "valor_compra_referencia": _to_float(lp.get("precio_unitario")),
        "capitulo": lp.get("capitulo"),
        "item_numero": lp.get("item_numero"),
        "created_by": user_id,
    }
    ins = sb.table("almacen_insumo").insert(row).execute().data
    if not ins:
        dup = (
            sb.table("almacen_insumo")
            .select("*")
            .eq("contrato_id", contrato_id)
            .eq("codigo", codigo)
            .limit(1)
            .execute()
            .data
            or []
        )
        if dup:
            return _row_from_almacen_insumo(dup[0])
        raise ValueError("No se pudo registrar el insumo.")
    return _row_from_almacen_insumo(ins[0])


def create_insumo(contrato_id: int, user_id: int, body: dict, soporte: Optional[tuple] = None) -> dict:
    sb = _sb()
    codigo = (body.get("codigo") or "").strip()
    descripcion = (body.get("descripcion") or "").strip()
    if not codigo or not descripcion:
        raise ValueError("Código y descripción del insumo son obligatorios.")
    tipo_imp = (body.get("tipo_impuesto") or "").strip().lower() or None
    if tipo_imp not in (None, "", "iva", "aiu"):
        raise ValueError("tipo_impuesto debe ser 'iva' o 'aiu'.")
    if tipo_imp == "":
        tipo_imp = None
    if tipo_imp and tipo_imp not in ("iva", "aiu"):
        tipo_imp = None
    impuestos = _normalize_impuestos(body.get("impuestos"))
    costo_base = _to_float(body.get("costo_base"))
    if body.get("costo_base") is None and body.get("costo") is not None:
        costo_base = _to_float(body.get("costo"))
    if body.get("costo_base") is None and body.get("valor_compra_referencia") is not None:
        costo_base = _to_float(body.get("valor_compra_referencia"))
    imp_pct = _to_float(body.get("impuesto_porcentaje"))
    valor_total = compute_costo_total_insumo(costo_base, tipo_imp, imp_pct, impuestos)
    proveedor_id = body.get("proveedor_id")
    if body.get("razon_social") and body.get("nit") and not proveedor_id:
        prov = create_proveedor(contrato_id, user_id, {
            "razon_social": body.get("razon_social"),
            "nit": body.get("nit"),
        })
        proveedor_id = prov.get("id")
    row = {
        "contrato_id": contrato_id,
        "listado_precio_id": body.get("listado_precio_id"),
        "proveedor_id": int(proveedor_id) if proveedor_id else None,
        "codigo": codigo,
        "descripcion": descripcion,
        "unidad": (body.get("unidad") or "UND").strip(),
        "rendimiento": _to_float(body.get("rendimiento")) if body.get("rendimiento") not in (None, "") else None,
        "costo_base": costo_base,
        "tipo_impuesto": tipo_imp,
        "impuesto_porcentaje": imp_pct if tipo_imp else None,
        "impuestos": impuestos if not tipo_imp else [],
        "valor_compra_referencia": valor_total,
        "created_by": user_id,
    }
    ins = sb.table("almacen_insumo").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear el insumo (¿código duplicado?).")
    insumo_id = ins[0]["id"]
    if soporte:
        data, nombre, mime = soporte
        if len(data) > 204800:
            raise ValueError("El PDF de soporte no puede superar 200 KB.")
        from almacen_service import _upload_soporte
        meta = _upload_soporte(contrato_id, "insumos-soporte", insumo_id, data, nombre, mime)
        sb.table("almacen_insumo").update({
            "soporte_pdf_blob_path": meta["blob_path"],
            "soporte_pdf_nombre": meta["nombre"],
        }).eq("id", insumo_id).execute()
    return get_insumo(contrato_id, insumo_id)


def search_proveedores(contrato_id: int, q: str = "", limit: int = 25) -> List[dict]:
    sb = _sb()
    query = (
        sb.table("almacen_proveedor")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
    )
    q = (q or "").strip()
    if q:
        query = query.or_(f"razon_social.ilike.%{q}%,nit.ilike.%{q}%")
    return query.order("razon_social").limit(limit).execute().data or []


def _proveedor_contacto_from_body(body: dict) -> dict:
    return {
        "contacto_email": (body.get("contacto_email") or "").strip() or None,
        "contacto_nombre": (body.get("contacto_nombre") or "").strip() or None,
        "contacto_telefono": (body.get("contacto_telefono") or "").strip() or None,
    }


def sync_proveedor_contacto(proveedor_id: int, body: dict) -> None:
    """Actualiza datos de contacto del proveedor si vienen en el body."""
    contact = _proveedor_contacto_from_body(body)
    upd = {k: v for k, v in contact.items() if v}
    if not proveedor_id or not upd:
        return
    _sb().table("almacen_proveedor").update(upd).eq("id", int(proveedor_id)).execute()


def create_proveedor(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    razon = (body.get("razon_social") or "").strip()
    nit = (body.get("nit") or "").strip()
    if not razon or not nit:
        raise ValueError("Razón social y NIT son obligatorios.")
    contact = _proveedor_contacto_from_body(body)
    existing = (
        sb.table("almacen_proveedor")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("nit", nit)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        upd = {k: v for k, v in contact.items() if v}
        if not existing[0].get("activo", True):
            upd["activo"] = True
        if upd:
            sb.table("almacen_proveedor").update(upd).eq("id", existing[0]["id"]).execute()
            existing[0].update(upd)
        elif not existing[0].get("activo", True):
            sb.table("almacen_proveedor").update({"activo": True}).eq("id", existing[0]["id"]).execute()
            existing[0]["activo"] = True
        return existing[0]
    row = {
        "contrato_id": contrato_id,
        "razon_social": razon,
        "nit": nit,
        "created_by": user_id,
        **contact,
    }
    ins = sb.table("almacen_proveedor").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear el proveedor.")
    return ins[0]


def upsert_insumo_proveedor_precio(
    contrato_id: int,
    insumo_id: int,
    proveedor_id: int,
    precio_venta: float,
    user_id: int,
) -> dict:
    sb = _sb()
    get_insumo(contrato_id, insumo_id)
    prov = (
        sb.table("almacen_proveedor")
        .select("id")
        .eq("id", proveedor_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not prov:
        raise ValueError("Proveedor no encontrado.")
    row = {
        "insumo_id": insumo_id,
        "proveedor_id": proveedor_id,
        "precio_venta": precio_venta,
        "created_by": user_id,
    }
    ins = sb.table("almacen_insumo_proveedor_precio").insert(row).execute().data
    return ins[0] if ins else row


def list_precios_insumo_proveedor(contrato_id: int, insumo_id: int) -> List[dict]:
    sb = _sb()
    get_insumo(contrato_id, insumo_id)
    rows = (
        sb.table("almacen_insumo_proveedor_precio")
        .select("*")
        .eq("insumo_id", insumo_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    out = []
    for r in rows:
        pid = r.get("proveedor_id")
        prov = (
            sb.table("almacen_proveedor")
            .select("razon_social, nit")
            .eq("id", pid)
            .limit(1)
            .execute()
            .data
            or []
        )
        p = prov[0] if prov else {}
        out.append({
            "proveedor_id": pid,
            "razon_social": p.get("razon_social"),
            "nit": p.get("nit"),
            "precio_venta": r.get("precio_venta"),
            "created_at": r.get("created_at"),
        })
    return out


def list_insumos_por_proveedor(
    contrato_id: int,
    proveedor_id: int,
    q: str = "",
    limit: int = 50,
) -> List[dict]:
    """Insumos del catálogo asociados a un proveedor inscrito (precio o proveedor principal)."""
    sb = _sb()
    prov = (
        sb.table("almacen_proveedor")
        .select("id, razon_social")
        .eq("id", int(proveedor_id))
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not prov:
        raise ValueError("Proveedor no inscrito en el directorio.")
    pname = prov[0].get("razon_social") or "—"

    price_rows = (
        sb.table("almacen_insumo_proveedor_precio")
        .select("insumo_id")
        .eq("proveedor_id", int(proveedor_id))
        .execute()
        .data
        or []
    )
    linked_ids = {int(r["insumo_id"]) for r in price_rows if r.get("insumo_id")}

    catalog = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("codigo")
        .execute()
        .data
        or []
    )
    q_lower = (q or "").strip().lower()
    out: List[dict] = []
    for row in catalog:
        iid = int(row["id"])
        if int(row.get("proveedor_id") or 0) != int(proveedor_id) and iid not in linked_ids:
            continue
        label = _insumo_label(row)
        if q_lower:
            hay = (
                q_lower in label.lower()
                or q_lower in (row.get("codigo") or "").lower()
                or q_lower in (row.get("descripcion") or "").lower()
            )
            if not hay:
                continue
        item = _row_from_almacen_insumo(row, pname)
        item["proveedor_id"] = int(proveedor_id)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _parse_abscisa_metros(val: Any) -> Optional[float]:
    """Convierte abscisa presupuesto (ej. 7+665.00 o K7+665.00) a metros."""
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        n = float(val)
        return n if n >= 0 else None
    s = str(val).strip().replace(",", ".")
    m = re.match(r"^K?(\d+)\+(\d+(?:\.\d+)?)$", s, re.I)
    if m:
        return int(m.group(1)) * 1000 + float(m.group(2))
    try:
        n = float(s)
        return n if n >= 0 else None
    except ValueError:
        return None


_PRESUPUESTO_ROW_SELECT = (
    "id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario, costo_directo, "
    "tramo, abs_inicio, abs_final, no_inicio, no_final, calzada"
)


def _enrich_ppto_ubicacion(row: dict) -> dict:
    return {
        **row,
        "abscisa_inicial": _parse_abscisa_metros(row.get("abs_inicio")),
        "abscisa_final": _parse_abscisa_metros(row.get("abs_final")),
        "nodo_inicio": row.get("no_inicio"),
        "nodo_final": row.get("no_final"),
    }


def list_presupuesto_rows_combo(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    pk_id: str,
) -> List[dict]:
    """Filas de presupuesto de obra que coinciden en PK-ID + capítulo + ítem."""
    sb = _sb()
    capitulo = (capitulo or "").strip()
    pk_norm = _norm_pk_id(pk_id)
    want_item = _norm_item_key(item_numero)
    if not capitulo or not want_item or not pk_norm:
        return []
    rows = (
        sb.table("presupuesto")
        .select(_PRESUPUESTO_ROW_SELECT)
        .eq("contrato_id", contrato_id)
        .eq("dado_de_baja", False)
        .eq("capitulo", capitulo)
        .eq("pk_id", pk_norm)
        .execute()
        .data
        or []
    )
    matched = [r for r in rows if _norm_item_key(r.get("item")) == want_item]
    return sorted(matched, key=lambda r: (_natural_sort_key(r.get("abs_inicio")), int(r.get("id") or 0)))


def list_presupuesto_registros(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    pk_id: str,
    exclude_solicitud_id: Optional[int] = None,
) -> dict:
    """Registros de presupuesto para un PK + capítulo + ítem, con acumulado por fila."""
    sb = _sb()
    rows = list_presupuesto_rows_combo(contrato_id, capitulo, item_numero, pk_id)
    registros: List[dict] = []
    combo_total = 0.0
    for r in rows:
        pid = int(r["id"])
        cant = _to_float(r.get("cant_total"))
        combo_total += cant
        acum = _cantidad_solicitada_acumulada(sb, contrato_id, pid, pk_id, exclude_solicitud_id)
        ubic = _enrich_ppto_ubicacion(r)
        registros.append({
            "presupuesto_id": pid,
            "cant_total": cant,
            "cant_solicitada_acumulada": acum,
            "saldo_disponible": cant - acum,
            "tramo": r.get("tramo"),
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
            "nodo_inicio": ubic.get("nodo_inicio"),
            "nodo_final": ubic.get("nodo_final"),
            "calzada": r.get("calzada"),
            "unidad": r.get("und"),
            "descripcion": r.get("descripcion"),
            "abscisa_inicial": ubic.get("abscisa_inicial"),
            "abscisa_final": ubic.get("abscisa_final"),
        })
    return {
        "registros": registros,
        "cant_presupuestada_combo": combo_total,
        "registros_count": len(registros),
    }


def resolve_presupuesto_row(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    pk_id: str,
    presupuesto_id: Optional[int] = None,
) -> dict:
    rows = list_presupuesto_rows_combo(contrato_id, capitulo, item_numero, pk_id)
    if not rows:
        raise ValueError(
            f"No hay fila de presupuesto para capítulo {capitulo}, ítem {item_numero} en PK {pk_id}."
        )
    if presupuesto_id is not None:
        for r in rows:
            if int(r.get("id") or 0) == int(presupuesto_id):
                return r
        raise ValueError("El registro de presupuesto seleccionado no coincide con capítulo, ítem y PK-ID.")
    if len(rows) == 1:
        return rows[0]
    raise ValueError(
        "Hay varios registros de presupuesto para este ítem en el PK-ID. Seleccione uno en la grilla."
    )


def _cantidad_consumida_insumo(
    sb,
    contrato_id: int,
    insumo_id: int,
    exclude_solicitud_id: Optional[int] = None,
) -> float:
    """Suma cantidades solicitadas del insumo en solicitudes no rechazadas del contrato."""
    items = (
        sb.table("almacen_solicitud_item")
        .select("cantidad, solicitud_id")
        .eq("insumo_id", insumo_id)
        .execute()
        .data
        or []
    )
    if not items:
        return 0.0
    sol_ids = list({it["solicitud_id"] for it in items if it.get("solicitud_id")})
    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    )
    sol_map = {s["id"]: s for s in sols}
    total = 0.0
    for it in items:
        sol = sol_map.get(it.get("solicitud_id")) or {}
        if int(sol.get("contrato_id") or 0) != contrato_id:
            continue
        if sol.get("estado") == "rechazada":
            continue
        if exclude_solicitud_id and int(it.get("solicitud_id") or 0) == int(exclude_solicitud_id):
            continue
        total += _to_float(it.get("cantidad"))
    return total


def get_contexto_negociado_insumo(
    contrato_id: int,
    insumo_id: int,
    cantidad_solicitada: float = 0,
    exclude_solicitud_id: Optional[int] = None,
    cantidad_extra_borrador: float = 0,
) -> dict:
    sb = _sb()
    row = get_insumo(contrato_id, int(insumo_id))
    neg = row.get("cantidad_negociada")
    if neg is None or _to_float(neg) <= 0:
        return {"tiene_negociado": False, "supera_negociado": False}
    cantidad_negociada = _to_float(neg)
    acum = _cantidad_consumida_insumo(sb, contrato_id, int(insumo_id), exclude_solicitud_id)
    cant = _to_float(cantidad_solicitada)
    extra = _to_float(cantidad_extra_borrador)
    consumo_despues = acum + cant + extra
    saldo = cantidad_negociada - consumo_despues
    return {
        "tiene_negociado": True,
        "cantidad_negociada": cantidad_negociada,
        "valor_negociado_total": (
            _to_float(row.get("valor_negociado_total"))
            if row.get("valor_negociado_total") is not None
            else None
        ),
        "cantidad_consumida_acumulada": acum,
        "cantidad_solicitada": cant,
        "cantidad_borrador_adicional": extra,
        "consumo_total_despues": consumo_despues,
        "saldo_negociado_despues": saldo,
        "supera_negociado": saldo < -0.0001,
        "unidad": row.get("unidad") or "UND",
        "insumo_codigo": row.get("codigo"),
        "insumo_descripcion": row.get("descripcion"),
    }


def _cantidad_solicitada_acumulada(
    sb,
    contrato_id: int,
    presupuesto_id: int,
    pk_id: str,
    exclude_solicitud_id: Optional[int] = None,
) -> float:
    pk_norm = _norm_pk_id(pk_id)
    if not pk_norm:
        return 0.0
    items = (
        sb.table("almacen_solicitud_item")
        .select("cantidad, solicitud_id, pk_id, presupuesto_id")
        .eq("presupuesto_id", presupuesto_id)
        .execute()
        .data
        or []
    )
    items = [it for it in items if _norm_pk_id(it.get("pk_id")) == pk_norm]
    if not items:
        return 0.0
    sol_ids = list({it["solicitud_id"] for it in items if it.get("solicitud_id")})
    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    )
    sol_map = {s["id"]: s for s in sols}
    total = 0.0
    for it in items:
        sol = sol_map.get(it.get("solicitud_id")) or {}
        if int(sol.get("contrato_id") or 0) != contrato_id:
            continue
        if sol.get("estado") == "rechazada":
            continue
        if exclude_solicitud_id and int(it.get("solicitud_id") or 0) == int(exclude_solicitud_id):
            continue
        total += _to_float(it.get("cantidad"))
    return total


def get_presupuesto_context(
    contrato_id: int,
    presupuesto_id: int,
    pk_id: str,
    cantidad_solicitada: float = 0,
    exclude_solicitud_id: Optional[int] = None,
    *,
    cantidad_extra_borrador: float = 0,
    descontar_linea_actual: bool = False,
    capitulo_listado: Optional[str] = None,
    item_listado: Optional[str] = None,
) -> dict:
    """Contexto presupuestal por ítem + PK-ID.

    - Vista de línea ya guardada: descontar_linea_actual=False (la cantidad ya está en acum).
    - Preview / borrador: descontar_linea_actual=True descuenta esta línea y cantidad_extra_borrador
      (otras líneas del mismo formulario con el mismo ítem/PK).
    """
    sb = _sb()
    ppto = (
        sb.table("presupuesto")
        .select(_PRESUPUESTO_ROW_SELECT)
        .eq("id", presupuesto_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not ppto:
        raise ValueError("Ítem de presupuesto no encontrado.")
    row = ppto[0]
    pk_norm = _norm_pk_id(pk_id)
    if _norm_pk_id(row.get("pk_id")) != pk_norm:
        raise ValueError("El PK-ID no coincide con la fila de presupuesto.")
    presupuestada = _to_float(row.get("cant_total"))
    acum = _cantidad_solicitada_acumulada(sb, contrato_id, presupuesto_id, pk_id, exclude_solicitud_id)
    cant = _to_float(cantidad_solicitada)
    extra = _to_float(cantidad_extra_borrador)
    if descontar_linea_actual:
        saldo_despues = presupuestada - acum - cant - extra
    else:
        saldo_despues = presupuestada - acum
    combo_rows = list_presupuesto_rows_combo(
        contrato_id,
        str(row.get("capitulo") or ""),
        str(row.get("item") or ""),
        pk_id,
    )
    combo_total = sum(_to_float(r.get("cant_total")) for r in combo_rows)
    cap_cobro = (capitulo_listado or row.get("capitulo") or "").strip()
    item_cobro = (item_listado or row.get("item") or "").strip()
    vlr_listado = get_listado_precio_unitario(contrato_id, cap_cobro, item_cobro)
    vlr_cobro = vlr_listado if vlr_listado is not None else 0.0
    return {
        "presupuesto_id": presupuesto_id,
        "pk_id": pk_id,
        "capitulo": row.get("capitulo"),
        "item": row.get("item"),
        "descripcion": row.get("descripcion"),
        "unidad": row.get("und"),
        "cant_presupuestada": presupuestada,
        "cant_presupuestada_combo": combo_total,
        "registros_combo_count": len(combo_rows),
        "cant_solicitada_acumulada": acum,
        "cantidad_solicitada": cant,
        "cantidad_borrador_adicional": extra if descontar_linea_actual else 0,
        "saldo_disponible_despues": saldo_despues,
        "vlr_unitario_cobro": vlr_cobro,
        "supera_presupuesto": saldo_despues < -0.0001,
        "tramo": row.get("tramo"),
        "abs_inicio": row.get("abs_inicio"),
        "abs_final": row.get("abs_final"),
        "nodo_inicio": row.get("no_inicio"),
        "nodo_final": row.get("no_final"),
    }


def resolve_insumo_for_solicitud(
    contrato_id: int,
    user_id: int,
    raw: dict,
) -> dict:
    """Resuelve insumo + ítem de cobro explícito + presupuesto + flags para una línea."""
    insumo_id = raw.get("insumo_id")
    listado_precio_id = raw.get("listado_precio_id")
    pk_id = (raw.get("pk_id") or "").strip()
    presupuesto_id = raw.get("presupuesto_id")
    capitulo_ppto = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or "").strip()
    item_ppto = (raw.get("presupuesto_item") or raw.get("item") or "").strip()
    cant = _to_float(raw.get("cantidad"))

    if cant <= 0:
        raise ValueError("La cantidad debe ser mayor a cero.")
    if not pk_id:
        raise ValueError("Seleccione la ubicación PK-ID en el mapa.")
    if not presupuesto_id and (not capitulo_ppto or not item_ppto):
        raise ValueError("Seleccione capítulo e ítem de cobro del presupuesto.")

    if insumo_id:
        insumo = get_insumo(contrato_id, int(insumo_id))
    elif listado_precio_id:
        insumo = ensure_insumo_from_listado(contrato_id, int(listado_precio_id), user_id)
        insumo_id = insumo.get("id")
    else:
        raise ValueError("Seleccione un insumo del catálogo.")

    sb = _sb()
    if presupuesto_id:
        ppto = resolve_presupuesto_row(
            contrato_id,
            capitulo_ppto,
            item_ppto,
            pk_id,
            presupuesto_id=int(presupuesto_id),
        )
    else:
        ppto = resolve_presupuesto_row(contrato_id, capitulo_ppto, item_ppto, pk_id)

    ubic = _enrich_ppto_ubicacion(ppto)
    tramo_val = (raw.get("tramo") or "").strip() or (ppto.get("tramo") or "").strip() or None
    abs_ini = raw.get("abscisa_inicial")
    if abs_ini in (None, ""):
        abs_ini = ubic.get("abscisa_inicial")
    abs_fin = raw.get("abscisa_final")
    if abs_fin in (None, ""):
        abs_fin = ubic.get("abscisa_final")

    ctx = get_presupuesto_context(
        contrato_id,
        int(ppto["id"]),
        pk_id,
        cant,
        exclude_solicitud_id=raw.get("exclude_solicitud_id"),
        cantidad_extra_borrador=_to_float(raw.get("cantidad_borrador_adicional")),
        descontar_linea_actual=True,
        capitulo_listado=capitulo_ppto,
        item_listado=item_ppto,
    )
    ctx_neg = get_contexto_negociado_insumo(
        contrato_id,
        int(insumo_id),
        cant,
        exclude_solicitud_id=raw.get("exclude_solicitud_id"),
        cantidad_extra_borrador=_to_float(raw.get("cantidad_borrador_adicional_insumo")),
    )
    valor_compra_raw = raw.get("valor_compra_unitario")
    if valor_compra_raw not in (None, ""):
        valor_compra = _to_float(valor_compra_raw)
    elif _insumo_tiene_precio_compra({**insumo, "origen": "almacen_insumo"}):
        valor_compra = _to_float(insumo.get("valor_compra_referencia"))
    else:
        valor_compra = None
    vlr_cobro = ctx.get("vlr_unitario_cobro") or 0
    costo_insumos = (valor_compra * cant) if valor_compra is not None and valor_compra > 0 else None
    utilidad_estimada = None
    if costo_insumos is not None and vlr_cobro > 0:
        utilidad_estimada = (vlr_cobro * cant) - costo_insumos

    return {
        "insumo_id": insumo_id,
        "listado_precio_id": insumo.get("listado_precio_id"),
        "presupuesto_id": int(ppto["id"]),
        "pk_id": pk_id,
        "pk_id_id": raw.get("pk_id_id"),
        "tramo": tramo_val,
        "costado": (raw.get("costado") or "").strip() or None,
        "abscisa_inicial": _to_float(abs_ini) if abs_ini not in (None, "") else None,
        "abscisa_final": _to_float(abs_fin) if abs_fin not in (None, "") else None,
        "observacion_residente": (raw.get("observacion_residente") or "").strip() or None,
        "capitulo": capitulo_ppto or ppto.get("capitulo"),
        "item": item_ppto or ppto.get("item"),
        "material_descripcion": _insumo_label(insumo),
        "unidad": insumo.get("unidad") or ppto.get("und") or "UND",
        "cantidad": cant,
        "es_recurrente": bool(raw.get("es_recurrente")),
        "cant_presupuestada": ctx.get("cant_presupuestada"),
        "valor_compra_unitario": valor_compra,
        "tiene_precio_compra": valor_compra is not None and valor_compra > 0,
        "vlr_unitario_cobro": vlr_cobro,
        "supera_presupuesto": ctx.get("supera_presupuesto"),
        "supera_negociado": ctx_neg.get("supera_negociado"),
        "contexto_presupuesto": ctx,
        "contexto_negociado": ctx_neg,
        "analisis_valor": _build_analisis_valor(cant, valor_compra, vlr_cobro),
    }
