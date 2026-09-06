"""
Insumos, proveedores y contexto presupuestal — módulo Almacén.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from almacen_service import _sb, _to_float

# Caché en proceso del listado de precios (escaneo paginado es costoso).
_LISTADO_CACHE: Dict[Tuple[int, str], Tuple[float, List[dict]]] = {}
_LISTADO_TTL_SEC = 90.0
_LISTADO_LOOKUP_CACHE: Dict[int, Tuple[float, Dict[Tuple[str, str], dict]]] = {}


def clear_listado_cache(contrato_id: Optional[int] = None) -> None:
    """Invalida caché de listado (tests / tras cambios de precios)."""
    if contrato_id is None:
        _LISTADO_CACHE.clear()
        _LISTADO_LOOKUP_CACHE.clear()
        return
    cid = int(contrato_id)
    for key in list(_LISTADO_CACHE.keys()):
        if key[0] == cid:
            _LISTADO_CACHE.pop(key, None)
    _LISTADO_LOOKUP_CACHE.pop(cid, None)


def _norm_item_key(item: Optional[str]) -> str:
    t = str(item or "").strip()
    return re.sub(r"\.+$", "", t)


def _item_key_variants(item: Optional[str]) -> List[str]:
    """
    Variantes de código de ítem para emparejar listado ↔ presupuesto.
    Ej.: NP-01 / NP.01 / NP 01 / np01.
    """
    base = _norm_item_key(item).lower()
    if not base:
        return []
    variants = {base}
    variants.add(re.sub(r"[-_\s]+", ".", base))
    variants.add(re.sub(r"[.\s_]+", "-", base))
    variants.add(re.sub(r"[-._\s]+", "", base))
    # Mantener orden estable: base primero.
    out = [base]
    for v in variants:
        if v and v not in out:
            out.append(v)
    return out


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
    Impuesto unificado por insumo (captura).

    Inferencia de tipo (no seleccionable por el usuario):
    - solo IVA → iva_pleno (sobre costo_base)
    - A/I/U + IVA → iva_sobre_utilidad (sobre utilidad)
    - solo A/I/U → aiu_sin_iva

    El valor unitario después de AIU/IVA se calcula con
    ``compute_valor_despues_aiu_iva`` (costo_base + estos componentes).
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


def _pct_frac(puntos: Any) -> float:
    """Puntos porcentuales (5 = 5%) → fracción (0.05)."""
    n = _pct_or_none(puntos)
    if n is None:
        return 0.0
    return n / 100.0


def compute_valor_despues_aiu_iva(costo_base: float, tributos: Any = None) -> float:
    """
    Valor unitario después de aplicar A/Í/U e IVA según tipo inferido.
    Resultado en pesos COP enteros (0 decimales).

    - IVA Pleno: base × (1 + IVA%)
    - AIU sin IVA: base × (1 + A% + Í% + U%)
    - IVA sobre Utilidad: base × (1 + A% + Í% + U%) + (base × U% × IVA%)
    - Sin tributos: base
    """
    base = max(_to_float(costo_base), 0.0)
    t = normalize_tributos(tributos)
    tipo = t.get("tipo")
    a = _pct_frac(t.get("administracion"))
    i = _pct_frac(t.get("imprevistos"))
    u = _pct_frac(t.get("utilidad"))
    iva = _pct_frac((t.get("iva") or {}).get("porcentaje"))

    if tipo == TIPO_IMPUESTO_IVA_PLENO:
        return float(round(base * (1.0 + iva)))
    if tipo == TIPO_IMPUESTO_AIU_SIN_IVA:
        return float(round(base * (1.0 + a + i + u)))
    if tipo == TIPO_IMPUESTO_IVA_SOBRE_UTILIDAD:
        aiu_total = base * (a + i + u)
        iva_util = base * u * iva
        return float(round(base + aiu_total + iva_util))
    return float(round(base))


def tributos_tienen_datos(tributos: Any) -> bool:
    t = normalize_tributos(tributos)
    return bool(t.get("tipo")) or _aiu_tiene_datos(t.get("aiu")) or _iva_tiene_datos(t.get("iva"))


def compute_valor_total_insumo(costo_base: float, impuestos: Optional[List[dict]] = None) -> float:
    base = max(_to_float(costo_base), 0)
    total = base
    for imp in _normalize_impuestos(impuestos):
        if imp["tipo"] == "porcentaje":
            total += base * (imp["valor"] / 100.0)
        else:
            total += imp["valor"]
    return float(round(total))


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
        return float(round(base * (1 + pct / 100.0)))
    if impuestos:
        return compute_valor_total_insumo(base, impuestos)
    return float(round(base))


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
    """Escaneo paginado de listado_precios con TTL corto (evita N× full-scan por línea)."""
    cid = int(contrato_id)
    cache_key = (cid, select)
    now = time.monotonic()
    hit = _LISTADO_CACHE.get(cache_key)
    if hit and hit[0] > now:
        return hit[1]
    sb = _sb()
    out: List[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("listado_precios")
            .select(select)
            .eq("contrato_id", cid)
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
    _LISTADO_CACHE[cache_key] = (now + _LISTADO_TTL_SEC, out)
    return out


def get_listado_precio_meta_lookup(contrato_id: int) -> Dict[Tuple[str, str], dict]:
    """
    Mapa (capitulo_norm, item_norm) → {precio_unitario, estado_precio, item_numero, capitulo}.
    Incluye variantes de ítem (NP-01 / NP.01) y capítulo literal en minúsculas.
    """
    cid = int(contrato_id)
    now = time.monotonic()
    hit = _LISTADO_LOOKUP_CACHE.get(cid)
    if hit and hit[0] > now:
        return hit[1]
    lookup: Dict[Tuple[str, str], dict] = {}
    for row in _fetch_all_listado_rows(
        cid, "capitulo, item_numero, precio_unitario, estado_precio",
    ):
        raw_cap = (row.get("capitulo") or "").strip()
        if not raw_cap:
            continue
        item_raw = row.get("item_numero")
        variants = _item_key_variants(item_raw)
        if not variants:
            continue
        price = _to_float(row.get("precio_unitario"))
        estado = (row.get("estado_precio") or "").strip() or "Pendiente"
        payload = {
            "precio_unitario": price,
            "estado_precio": estado,
            "item_numero": (item_raw or "").strip(),
            "capitulo": raw_cap,
        }
        cap_norm = _norm_capitulo_key(raw_cap)
        for item_k in variants:
            lookup.setdefault((cap_norm, item_k), payload)
            lookup.setdefault((raw_cap.lower(), item_k), payload)
    _LISTADO_LOOKUP_CACHE[cid] = (now + _LISTADO_TTL_SEC, lookup)
    return lookup


def get_listado_precio_lookup(contrato_id: int) -> Dict[Tuple[str, str], float]:
    """Mapa (capitulo_norm, item_norm) → precio_unitario (compat)."""
    meta = get_listado_precio_meta_lookup(contrato_id)
    return {k: float(v.get("precio_unitario") or 0) for k, v in meta.items()}


def _listado_item_only_index(
    meta: Dict[Tuple[str, str], dict],
) -> Dict[str, List[dict]]:
    by_item: Dict[str, List[dict]] = {}
    seen: set = set()
    for (_cap, item_k), payload in meta.items():
        ident = (
            _norm_capitulo_key(payload.get("capitulo")),
            _norm_item_key(payload.get("item_numero")).lower(),
        )
        if ident in seen:
            continue
        seen.add(ident)
        by_item.setdefault(item_k, []).append(payload)
    return by_item


def _detalle_from_listado_hit(hit: dict, *, match: str) -> dict:
    price = _to_float(hit.get("precio_unitario"))
    estado = (hit.get("estado_precio") or "").strip() or "Pendiente"
    if price > 0:
        motivo = None
    elif estado.lower() != "aprobado":
        motivo = "pendiente_aprobacion"
    else:
        motivo = "sin_valor_asignado"
    return {
        "encontrado": True,
        "precio_unitario": price if price > 0 else None,
        "estado_precio": estado,
        "motivo": motivo,
        "match": match,
        "capitulo_listado": hit.get("capitulo"),
        "item_listado": hit.get("item_numero"),
    }


def lookup_listado_precio_detalle(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    *,
    lookup: Optional[Dict[Tuple[str, str], float]] = None,
) -> dict:
    """
    Resuelve cobro del listado con fallbacks robustos.
    Retorna: encontrado, precio_unitario, estado_precio, motivo, match.
    """
    capitulo = (capitulo or "").strip()
    item_numero = (item_numero or "").strip()
    empty = {
        "encontrado": False,
        "precio_unitario": None,
        "estado_precio": None,
        "motivo": (
            "sin_item" if not item_numero
            else ("sin_capitulo" if not capitulo else "sin_valor_listado")
        ),
        "match": None,
    }
    if not item_numero:
        return empty

    meta = get_listado_precio_meta_lookup(contrato_id)
    _ = lookup  # compat firma; meta es la fuente de verdad
    variants = _item_key_variants(item_numero)
    cap_keys = []
    if capitulo:
        cap_keys = [_norm_capitulo_key(capitulo), capitulo.lower()]

    for cap_key in cap_keys:
        for item_k in variants:
            hit = meta.get((cap_key, item_k))
            if hit is not None:
                return _detalle_from_listado_hit(hit, match="capitulo_item")

    by_item = _listado_item_only_index(meta)
    candidates: List[dict] = []
    seen_ids: set = set()
    for item_k in variants:
        for hit in by_item.get(item_k) or []:
            ident = (
                _norm_capitulo_key(hit.get("capitulo")),
                _norm_item_key(hit.get("item_numero")).lower(),
            )
            if ident in seen_ids:
                continue
            seen_ids.add(ident)
            candidates.append(hit)

    if len(candidates) == 1:
        return _detalle_from_listado_hit(candidates[0], match="item_unico")

    if len(candidates) > 1 and capitulo:
        cap_l = capitulo.lower()
        scored = []
        for hit in candidates:
            hc = (hit.get("capitulo") or "").lower()
            score = 0
            if hc == cap_l or _norm_capitulo_key(hc) == _norm_capitulo_key(capitulo):
                score = 3
            elif cap_l in hc or hc in cap_l:
                score = 2
            elif any(tok and tok in hc for tok in re.split(r"\W+", cap_l) if len(tok) > 2):
                score = 1
            scored.append((score, hit))
        scored.sort(key=lambda x: -x[0])
        if scored and scored[0][0] > 0:
            return _detalle_from_listado_hit(scored[0][1], match="item_capitulo_parcial")

    if not capitulo:
        empty["motivo"] = "sin_capitulo"
    return empty


def lookup_listado_precio(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    lookup: Optional[Dict[Tuple[str, str], float]] = None,
) -> Optional[float]:
    """Precio unitario; None si no hay coincidencia usable (>0) ni fila encontrada."""
    det = lookup_listado_precio_detalle(
        contrato_id, capitulo, item_numero, lookup=lookup,
    )
    if not det.get("encontrado"):
        return None
    # Compat: si la fila existe con precio 0, devolver 0 (antes setdefault guardaba 0).
    precio = det.get("precio_unitario")
    if precio is None:
        return 0.0
    return float(precio)


def resolver_vlr_cobro_listado(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
) -> dict:
    """VU cobro usable o motivo explícito cuando no aplica."""
    det = lookup_listado_precio_detalle(contrato_id, capitulo, item_numero)
    precio = det.get("precio_unitario")
    if precio is not None and _to_float(precio) > 0:
        return {
            "vlr_unitario_cobro": _to_float(precio),
            "cobro_motivo": None,
            "estado_precio": det.get("estado_precio"),
            "match": det.get("match"),
        }
    motivo = det.get("motivo") or "sin_valor_listado"
    return {
        "vlr_unitario_cobro": 0.0,
        "cobro_motivo": motivo,
        "estado_precio": det.get("estado_precio"),
        "match": det.get("match"),
    }


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
    return lookup_listado_precio(contrato_id, capitulo, item_numero)


def _build_analisis_valor(
    cant: float,
    valor_compra: Optional[float],
    vlr_cobro: float,
    cobro_motivo: Optional[str] = None,
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
    motivo = None if vlr > 0 else (cobro_motivo or "sin_valor_listado")
    return {
        "tiene_precio_compra": tiene,
        "cantidad": cant_f,
        "costo_insumo_unitario": vc if tiene else None,
        "valor_cobro_unitario": vlr if vlr > 0 else None,
        "costo_insumo_linea": costo_linea,
        "valor_cobro_linea": cobro_linea,
        "utilidad_estimada_linea": util,
        "rentabilidad_pct": pct,
        "cobro_motivo": motivo,
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


def _etiqueta_insumo_rentabilidad(r: dict) -> str:
    """Etiqueta de fila: código/descripción del insumo."""
    mat = (r.get("material_descripcion") or "").strip()
    if mat:
        return mat
    cod = (r.get("insumo_codigo") or r.get("codigo") or "").strip()
    if cod:
        return cod
    return "Insumo asociado" if r.get("es_principal") is False else "Insumo principal"


def _aplicar_override_lineas(
    rows: list,
    override_actual: Optional[dict] = None,
) -> list:
    by_id: Dict[Any, dict] = {}
    for r in rows:
        rid = int(r.get("id") or 0)
        by_id[rid if rid else id(r)] = dict(r)
    if override_actual:
        oid = int(override_actual.get("id") or 0)
        if oid and oid in by_id:
            by_id[oid] = {**by_id[oid], **override_actual}
        elif oid:
            by_id[oid] = dict(override_actual)
        else:
            by_id[id(override_actual)] = dict(override_actual)
    merged = list(by_id.values())

    def _sort_key(r: dict):
        principal = 0 if r.get("es_principal") is not False else 1
        return (principal, int(r.get("numero_linea") or 0), int(r.get("id") or 0))

    merged.sort(key=_sort_key)
    return merged


def filas_rentabilidad_por_insumo(
    rows: list,
    *,
    numero_oc: Optional[int] = None,
    solicitud_id: Optional[int] = None,
    solicitud_consecutivo: Optional[int] = None,
    override_actual: Optional[dict] = None,
) -> dict:
    """
    Una fila por insumo (principal + asociados) + fila Total del ítem.

    - Cant. / VU costo / Tot. costo: propios de cada insumo.
    - VU cobro / Tot. cobro: solo en el principal (los asociados no generan cobro).
    - Utilidad y % rent.: solo en la fila Total (cobro principal − suma de costos).
    """
    merged = _aplicar_override_lineas(rows, override_actual)
    if not merged:
        return {"filas": [], "modo": "por_insumo"}

    filas: list = []
    sum_costo = 0.0
    tiene_costo = False
    cobro_total = None
    vu_cobro_total = None
    cant_principal = None
    cobro_motivo_total = None

    for r in merged:
        cant = _to_float(r.get("cantidad"))
        vc = _to_float(r.get("valor_compra_unitario"))
        es_principal = r.get("es_principal") is not False
        costo_linea = round(cant * vc, 2) if cant > 0 and vc > 0 else None
        if costo_linea is not None:
            sum_costo += costo_linea
            tiene_costo = True

        vu_cobro = None
        cobro_linea = None
        cobro_motivo = None
        if es_principal:
            vlr = _to_float(r.get("vlr_unitario_cobro"))
            if vlr > 0 and cant > 0:
                vu_cobro = vlr
                cobro_linea = round(cant * vlr, 2)
                cobro_total = cobro_linea
                vu_cobro_total = vu_cobro
                cant_principal = cant
            elif cant > 0:
                cant_principal = cant
                cobro_motivo = r.get("cobro_motivo") or "sin_valor_listado"
                cobro_motivo_total = cobro_motivo_total or cobro_motivo
        else:
            cobro_motivo = "insumo_asociado"

        filas.append({
            "etiqueta_fila": _etiqueta_insumo_rentabilidad(r),
            "numero_oc": numero_oc,
            "solicitud_id": solicitud_id if solicitud_id is not None else r.get("solicitud_id"),
            "solicitud_consecutivo": solicitud_consecutivo,
            "solicitud_item_id": r.get("id"),
            "insumo_id": r.get("insumo_id"),
            "es_principal": es_principal,
            "es_actual": True,
            "es_total": False,
            "cantidad": cant if cant > 0 else None,
            "valor_cobro_unitario": vu_cobro,
            "valor_cobro_linea": cobro_linea,
            "cobro_motivo": cobro_motivo,
            "costo_insumo_unitario": vc if vc > 0 else None,
            "costo_insumo_linea": costo_linea,
            # Utilidad/% solo en Total (rentabilidad real del ítem).
            "utilidad_estimada_linea": None,
            "rentabilidad_pct": None,
        })

    costo_total = round(sum_costo, 2) if tiene_costo else None
    util = (
        round((cobro_total or 0) - costo_total, 2)
        if cobro_total is not None and costo_total is not None
        else None
    )
    pct = (
        round((util / cobro_total) * 100, 2)
        if util is not None and cobro_total and cobro_total > 0
        else None
    )
    filas.append({
        "etiqueta_fila": "Total ítem",
        "numero_oc": numero_oc,
        "solicitud_id": solicitud_id,
        "solicitud_consecutivo": solicitud_consecutivo,
        "es_principal": None,
        "es_actual": True,
        "es_total": True,
        "cantidad": cant_principal,
        "valor_cobro_unitario": vu_cobro_total,
        "valor_cobro_linea": cobro_total,
        "cobro_motivo": cobro_motivo_total if cobro_total is None else None,
        "costo_insumo_unitario": None,
        "costo_insumo_linea": costo_total,
        "utilidad_estimada_linea": util,
        "rentabilidad_pct": pct,
    })
    return {"filas": filas, "modo": "por_insumo"}


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
    presupuesto_id: Optional[int] = None,
) -> dict:
    """
    Rentabilidad del ítem de presupuesto en la solicitud actual:
    una fila por insumo (principal + asociados) + fila Total.

    Cobro solo del principal; costo = suma de todos los insumos del ítem.
    """
    sb = _sb()
    cap = (capitulo or "").strip()
    itm = _norm_item_key(item_cobro)
    pid = int(presupuesto_id) if presupuesto_id else None

    select_cols = (
        "id, cantidad, valor_compra_unitario, vlr_unitario_cobro, "
        "solicitud_id, insumo_id, capitulo, item, presupuesto_id, "
        "es_principal, material_descripcion, numero_linea"
    )

    # Solo líneas de la solicitud actual vinculadas al mismo ítem.
    q = (
        sb.table("almacen_solicitud_item")
        .select(select_cols)
        .eq("solicitud_id", int(solicitud_id))
    )
    if pid:
        q = q.eq("presupuesto_id", pid)
    rows = q.execute().data or []

    if not pid and cap and itm:
        rows = [
            r for r in rows
            if (r.get("capitulo") or "").strip() == cap
            and _norm_item_key(r.get("item")) == itm
        ]
    elif not pid and not (cap and itm):
        # Fallback: la línea actual sola.
        rows = [r for r in rows if int(r.get("id") or 0) == int(solicitud_item_id)]

    # Completar etiqueta desde catálogo si falta material_descripcion.
    need_ids = [
        int(r["insumo_id"]) for r in rows
        if r.get("insumo_id") and not (r.get("material_descripcion") or "").strip()
    ]
    if need_ids:
        meta = {
            int(m["id"]): m
            for m in (
                sb.table("almacen_insumo")
                .select("id, codigo, descripcion")
                .in_("id", sorted(set(need_ids)))
                .execute()
                .data
                or []
            )
        }
        for r in rows:
            iid = r.get("insumo_id")
            if not iid or (r.get("material_descripcion") or "").strip():
                continue
            m = meta.get(int(iid))
            if m:
                r["material_descripcion"] = _insumo_label(m)
                r["insumo_codigo"] = (m.get("codigo") or "").strip() or None

    # Preservar es_principal del override si la línea ya está en rows.
    existing = next(
        (r for r in rows if int(r.get("id") or 0) == int(solicitud_item_id)),
        None,
    )
    override_actual = {
        "id": int(solicitud_item_id),
        "cantidad": cantidad_presente,
        "vlr_unitario_cobro": valor_cobro_unitario,
        "valor_compra_unitario": valor_compra_unitario,
        "solicitud_id": int(solicitud_id),
        "es_principal": (
            existing.get("es_principal")
            if existing is not None
            else True
        ),
        "material_descripcion": (
            (existing or {}).get("material_descripcion")
            or "Esta línea"
        ),
        "numero_linea": (existing or {}).get("numero_linea"),
        "insumo_id": (existing or {}).get("insumo_id") or insumo_id,
    }

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

    if not rows and not (cantidad_presente > 0):
        return {"filas": [], "modo": "por_insumo"}

    return filas_rentabilidad_por_insumo(
        rows,
        numero_oc=num_oc,
        solicitud_id=int(solicitud_id),
        solicitud_consecutivo=solicitud_consecutivo,
        override_actual=override_actual,
    )


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
    costo_raw = _to_float(row.get("costo_base") if row.get("costo_base") is not None else row.get("valor_compra_referencia"))
    costo = float(round(max(costo_raw, 0.0)))
    tipo = row.get("tipo_impuesto")
    pct = _to_float(row.get("impuesto_porcentaje"))
    tributos = normalize_tributos(row.get("tributos"))
    tiene = _insumo_tiene_precio_compra({**row, "origen": "almacen_insumo"})
    total = None
    if tiene:
        if tributos_tienen_datos(tributos):
            total = compute_valor_despues_aiu_iva(costo, tributos)
        else:
            stored = _to_float(row.get("valor_compra_referencia"))
            total = float(round(stored)) if stored else compute_costo_total_insumo(
                costo, tipo, pct, row.get("impuestos"),
            )
    return {
        **row,
        "insumo_id": row.get("id"),
        "proveedor_nombre": proveedor_nombre,
        "rendimiento": row.get("rendimiento"),
        "costo": costo if tiene else None,
        "costo_base": costo if tiene else row.get("costo_base"),
        "tipo_impuesto": tipo,
        "impuesto_etiqueta": _impuesto_etiqueta(tipo, pct, tributos) if tiene else "—",
        "costo_total": total,
        "valor_compra_referencia": total,
        "tiene_precio_compra": tiene,
        "tributos": tributos,
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


def _insumo_disponible_solicitud(row: dict, sb, min_cot: int, soportes_count: Optional[int] = None) -> bool:
    """Insumo seleccionable en solicitudes: precio válido y cotización ganadora si aplica.

    Los PDFs de soporte/comparativas son opcionales; no bloquean la selección.
    `min_cot` y `soportes_count` se conservan por compatibilidad con callers.
    """
    del min_cot, soportes_count  # ya no se exige umbral de soportes
    if not _insumo_tiene_precio_compra({**row, "origen": "almacen_insumo"}):
        return False
    if row.get("requiere_cotizacion") is False:
        return True
    if not row.get("id"):
        return False
    return bool(row.get("soporte_pdf_blob_path") or row.get("cotizacion_numero"))


def search_insumos(contrato_id: int, q: str = "", limit: int = 30) -> List[dict]:
    rows, _, _ = search_insumos_solo_catalogo(contrato_id, q, limit, 0)
    return rows


def _tokenize_busqueda_insumo(q: str) -> List[str]:
    """Tokens relevantes para ranking (ignora stopwords cortas)."""
    raw = (q or "").strip().lower()
    if not raw:
        return []
    parts = re.findall(r"[a-záéíóúñü0-9]+(?:[./-][a-záéíóúñü0-9]+)?", raw, flags=re.IGNORECASE)
    stop = {
        "de", "la", "el", "los", "las", "un", "una", "unos", "unas",
        "y", "o", "en", "para", "con", "del", "al", "por", "tipo", "und",
    }
    out: List[str] = []
    for p in parts:
        t = p.lower()
        if t in stop or len(t) < 2:
            continue
        out.append(t)
    return out


def score_insumo_contra_consulta(
    query: str,
    codigo: str = "",
    descripcion: str = "",
    proveedor: str = "",
) -> float:
    """Puntúa coincidencia semántica entre texto solicitado y un insumo del catálogo.

    Números de producto (p. ej. 2400 vs 2500) pesan fuerte. Sin solapamiento de
    palabras clave relevantes devuelve score negativo (descartable).
    """
    tokens = _tokenize_busqueda_insumo(query)
    if not tokens:
        return 0.0
    hay = f"{codigo or ''} {descripcion or ''} {proveedor or ''}".lower()
    hay_tokens = set(_tokenize_busqueda_insumo(hay))
    score = 0.0
    matched = 0
    for t in tokens:
        exact = t in hay_tokens
        substr = t in hay
        is_num = bool(re.search(r"\d", t))
        if exact:
            matched += 1
            score += 45.0 if is_num else 28.0
        elif substr:
            matched += 1
            score += 18.0 if is_num else 12.0
        elif is_num:
            score -= 40.0  # producto numéricamente distinto
        else:
            score -= 6.0
    if matched == 0:
        return -100.0
    score += (matched / len(tokens)) * 35.0
    phrase = " ".join(tokens)
    if phrase and phrase in hay:
        score += 20.0
    return score


def search_insumos_solo_catalogo(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[dict], int, int]:
    """Búsqueda para solicitudes: solo insumos activos del catálogo (almacen_insumo).
    Retorna (filas, total_filtrado, total_catalogo_activo).

    Con ``q`` no vacío prioriza coincidencias por palabras clave (números de
    producto, términos distintivos) y omite insumos sin relación semántica.
    """
    sb = _sb()
    q_raw = (q or "").strip()
    q_lower = q_raw.lower()
    query = (
        sb.table("almacen_insumo")
        .select(
            "id, codigo, descripcion, unidad, rendimiento, costo_base, valor_compra_referencia, "
            "proveedor_id, activo, requiere_cotizacion, soporte_pdf_blob_path, cotizacion_numero, "
            "tipo_impuesto, impuesto_porcentaje, impuestos, tributos"
        )
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

    scored: List[Tuple[float, dict]] = []
    if q_lower:
        for r in rows:
            pname = prov_map.get(int(r.get("proveedor_id") or 0), "—")
            label = _insumo_label(r)
            sc = score_insumo_contra_consulta(
                q_raw,
                codigo=r.get("codigo") or "",
                descripcion=r.get("descripcion") or "",
                proveedor=pname if pname != "—" else "",
            )
            # Respaldo: coincidencia cruda de substring (código/proveedor) si score débil
            # pero hay overlap literal del query completo.
            if sc <= -50:
                blob = f"{label} {r.get('codigo') or ''} {r.get('descripcion') or ''} {pname}".lower()
                if q_lower in blob:
                    sc = 5.0
                else:
                    continue
            scored.append((sc, r))
        scored.sort(key=lambda x: (-x[0], str(x[1].get("codigo") or "")))
        rows = [r for _, r in scored]
    else:
        rows = list(rows)

    # Batch de soportes de cotización (1 query) en lugar de 1 por insumo.
    min_cot = _get_cotizaciones_minimas(contrato_id)
    soportes_by_insumo: Dict[int, int] = {}
    cand_ids = [int(r["id"]) for r in rows if r.get("id") and r.get("requiere_cotizacion") is not False]
    if cand_ids:
        for i in range(0, len(cand_ids), 200):
            chunk = cand_ids[i: i + 200]
            sop_rows = (
                sb.table("almacen_insumo_cotizacion_soporte")
                .select("id, insumo_id")
                .in_("insumo_id", chunk)
                .execute()
                .data
                or []
            )
            for s in sop_rows:
                iid = int(s.get("insumo_id") or 0)
                soportes_by_insumo[iid] = soportes_by_insumo.get(iid, 0) + 1

    out: List[dict] = []
    for row in rows:
        iid = int(row.get("id") or 0)
        if not _insumo_disponible_solicitud(row, sb, min_cot, soportes_by_insumo.get(iid, 0)):
            continue
        pname = prov_map.get(int(row.get("proveedor_id") or 0), "—")
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
    costo_base = float(round(max(costo_base, 0.0)))
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
    key = (int(presupuesto_id), _norm_pk_id(pk_id))
    if not key[1]:
        return 0.0
    return batch_cantidad_solicitada_acumulada(
        sb, contrato_id, [key], exclude_solicitud_id
    ).get(key, 0.0)


def _item_es_principal(it: dict) -> bool:
    """Insumo principal (default) consume presupuesto; asociado no.

    Acepta booleanos y strings típicos de PostgREST/CSV (``false``/``0``/``f``).
    """
    if it is None:
        return True
    if "es_principal" not in it or it.get("es_principal") is None:
        return True
    v = it.get("es_principal")
    if isinstance(v, str):
        return v.strip().lower() not in ("false", "0", "f", "no", "n", "off")
    if isinstance(v, (int, float)):
        return v != 0
    return bool(v)


def batch_cantidad_solicitada_acumulada(
    sb,
    contrato_id: int,
    keys: Sequence[Tuple[int, str]],
    exclude_solicitud_id: Optional[int] = None,
) -> Dict[Tuple[int, str], float]:
    """Acumulado de cantidades solicitadas por (presupuesto_id, pk_id) en una o dos queries.

    Solo suma líneas de insumo principal (``es_principal`` distinto de false).
    """
    norm_keys: List[Tuple[int, str]] = []
    seen = set()
    for pid, pk in keys:
        k = (int(pid), _norm_pk_id(pk))
        if not k[1] or k in seen:
            continue
        seen.add(k)
        norm_keys.append(k)
    if not norm_keys:
        return {}
    pids = list({k[0] for k in norm_keys})
    select_cols = "cantidad, solicitud_id, pk_id, presupuesto_id, es_principal"
    items: List[dict] = []
    try:
        # Preferir excluir asociados en el servidor cuando la columna existe.
        q = (
            sb.table("almacen_solicitud_item")
            .select(select_cols)
            .in_("presupuesto_id", pids)
        )
        if hasattr(q, "or_"):
            q = q.or_("es_principal.eq.true,es_principal.is.null")
        items = q.execute().data or []
    except Exception:
        try:
            items = (
                sb.table("almacen_solicitud_item")
                .select(select_cols)
                .in_("presupuesto_id", pids)
                .execute()
                .data
                or []
            )
        except Exception:
            # Columna es_principal aún no migrada: tratar todas como principales.
            items = (
                sb.table("almacen_solicitud_item")
                .select("cantidad, solicitud_id, pk_id, presupuesto_id")
                .in_("presupuesto_id", pids)
                .execute()
                .data
                or []
            )
    want = set(norm_keys)
    filtered = []
    for it in items:
        # Defensa en profundidad: aunque el filtro or_ falle / no aplique.
        if not _item_es_principal(it):
            continue
        k = (int(it.get("presupuesto_id") or 0), _norm_pk_id(it.get("pk_id")))
        if k in want:
            filtered.append((k, it))
    if not filtered:
        return {k: 0.0 for k in norm_keys}
    sol_ids = list({it["solicitud_id"] for _, it in filtered if it.get("solicitud_id")})
    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    ) if sol_ids else []
    sol_map = {s["id"]: s for s in sols}
    totals: Dict[Tuple[int, str], float] = {k: 0.0 for k in norm_keys}
    for k, it in filtered:
        sol = sol_map.get(it.get("solicitud_id")) or {}
        if int(sol.get("contrato_id") or 0) != int(contrato_id):
            continue
        if sol.get("estado") == "rechazada":
            continue
        if exclude_solicitud_id and int(it.get("solicitud_id") or 0) == int(exclude_solicitud_id):
            continue
        totals[k] = totals.get(k, 0.0) + _to_float(it.get("cantidad"))
    return totals


def batch_cantidad_consumida_insumo(
    sb,
    contrato_id: int,
    insumo_ids: Sequence[int],
    exclude_solicitud_id: Optional[int] = None,
) -> Dict[int, float]:
    ids = sorted({int(i) for i in insumo_ids if i})
    if not ids:
        return {}
    items = (
        sb.table("almacen_solicitud_item")
        .select("cantidad, solicitud_id, insumo_id")
        .in_("insumo_id", ids)
        .execute()
        .data
        or []
    )
    if not items:
        return {i: 0.0 for i in ids}
    sol_ids = list({it["solicitud_id"] for it in items if it.get("solicitud_id")})
    sols = (
        sb.table("almacen_solicitud")
        .select("id, estado, contrato_id")
        .in_("id", sol_ids)
        .execute()
        .data
        or []
    ) if sol_ids else []
    sol_map = {s["id"]: s for s in sols}
    totals: Dict[int, float] = {i: 0.0 for i in ids}
    for it in items:
        iid = int(it.get("insumo_id") or 0)
        if iid not in totals:
            continue
        sol = sol_map.get(it.get("solicitud_id")) or {}
        if int(sol.get("contrato_id") or 0) != int(contrato_id):
            continue
        if sol.get("estado") == "rechazada":
            continue
        if exclude_solicitud_id and int(it.get("solicitud_id") or 0) == int(exclude_solicitud_id):
            continue
        totals[iid] += _to_float(it.get("cantidad"))
    return totals


def apply_saldo_flags_batch(
    contrato_id: int,
    items: List[dict],
    exclude_solicitud_id: Optional[int] = None,
    *,
    descontar_linea_actual: bool = True,
    refresh_listado: bool = True,
) -> None:
    """
    Marca supera_presupuesto / vlr cobro / cant_presupuestada sin N× get_presupuesto_context
    (sin combo ni listado por línea). Mutates items in place.

    - Guardado/preview: descontar_linea_actual=True (+ exclude_solicitud_id al editar).
    - Lectura de líneas ya persistidas: descontar_linea_actual=False (la qty ya está en acum).
    - refresh_listado=False: no escanea listado_precios (usar vlr ya guardado en el ítem).
      Crítico en GET detalle: el full-scan del listado era ~5s incluso con 1 línea.
    """
    from collections import defaultdict

    sb = _sb()
    keys = [
        (int(it["presupuesto_id"]), str(it.get("pk_id") or ""))
        for it in items
        if it.get("presupuesto_id") and it.get("pk_id")
    ]
    acum_map = batch_cantidad_solicitada_acumulada(sb, contrato_id, keys, exclude_solicitud_id)
    lookup = None
    if refresh_listado:
        # Buscar precios cuando hay insumo mapeado y falta cobro usable (None o 0).
        needs_price = any(
            it.get("insumo_id")
            and _item_es_principal(it)
            and _to_float(it.get("vlr_unitario_cobro")) <= 0
            for it in items
        )
        if needs_price:
            lookup = get_listado_precio_lookup(contrato_id)
    batch_qty: dict = defaultdict(float)
    for it in items:
        if it.get("presupuesto_id") and it.get("pk_id") and _item_es_principal(it):
            key = (int(it["presupuesto_id"]), str(it.get("pk_id") or ""))
            batch_qty[key] += _to_float(it.get("cantidad"))

    for it in items:
        if lookup is not None and it.get("insumo_id") and _item_es_principal(it):
            cap = (it.get("capitulo") or "").strip()
            item_n = (it.get("item") or "").strip()
            resolved = resolver_vlr_cobro_listado(contrato_id, cap, item_n)
            vlr = _to_float(resolved.get("vlr_unitario_cobro"))
            if vlr > 0 and _to_float(it.get("vlr_unitario_cobro")) <= 0:
                prev = _to_float(it.get("vlr_unitario_cobro"))
                it["vlr_unitario_cobro"] = vlr
                it["cobro_motivo"] = None
                if prev <= 0:
                    it["_cobro_sanado"] = True
            else:
                if it.get("vlr_unitario_cobro") is None:
                    it["vlr_unitario_cobro"] = 0
                if _to_float(it.get("vlr_unitario_cobro")) <= 0:
                    it["cobro_motivo"] = resolved.get("cobro_motivo") or "sin_valor_listado"
        elif it.get("vlr_unitario_cobro") is None:
            it["vlr_unitario_cobro"] = 0
            if it.get("insumo_id") and _item_es_principal(it):
                it.setdefault("cobro_motivo", "sin_valor_listado")

        if not it.get("pk_id") or not it.get("presupuesto_id"):
            it["supera_presupuesto"] = False
            continue
        key = (int(it["presupuesto_id"]), str(it.get("pk_id") or ""))
        presupuestada = _to_float(it.get("cant_presupuestada"))
        acum = acum_map.get((key[0], _norm_pk_id(key[1])), 0.0)
        cant = _to_float(it.get("cantidad"))
        # Asociados no descuentan ni generan alerta de sobrepresupuesto.
        if not _item_es_principal(it):
            it["supera_presupuesto"] = False
            it["contexto_presupuesto"] = {
                "presupuesto_id": key[0],
                "pk_id": key[1],
                "cant_presupuestada": presupuestada,
                "cant_solicitada_acumulada": acum,
                "cantidad_solicitada": cant,
                "cantidad_borrador_adicional": 0,
                "saldo_disponible_despues": presupuestada - acum - (
                    batch_qty[key] if descontar_linea_actual else 0
                ),
                "vlr_unitario_cobro": it.get("vlr_unitario_cobro") or 0,
                "supera_presupuesto": False,
                "es_principal": False,
                "capitulo": it.get("capitulo"),
                "item": it.get("item"),
            }
            continue
        extra = batch_qty[key] - cant
        if descontar_linea_actual:
            saldo = presupuestada - acum - cant - extra
        else:
            saldo = presupuestada - acum
        it["supera_presupuesto"] = saldo < -0.0001
        it["contexto_presupuesto"] = {
            "presupuesto_id": key[0],
            "pk_id": key[1],
            "cant_presupuestada": presupuestada,
            "cant_solicitada_acumulada": acum,
            "cantidad_solicitada": cant,
            "cantidad_borrador_adicional": extra if descontar_linea_actual else 0,
            "saldo_disponible_despues": saldo,
            "vlr_unitario_cobro": it.get("vlr_unitario_cobro") or 0,
            "supera_presupuesto": it["supera_presupuesto"],
            "es_principal": True,
            "capitulo": it.get("capitulo"),
            "item": it.get("item"),
        }

    batch_insumo: dict = defaultdict(float)
    for it in items:
        if it.get("insumo_id"):
            batch_insumo[int(it["insumo_id"])] += _to_float(it.get("cantidad"))
    if not batch_insumo:
        for it in items:
            it.setdefault("supera_negociado", False)
        return

    consumido = batch_cantidad_consumida_insumo(
        sb, contrato_id, list(batch_insumo.keys()), exclude_solicitud_id
    )
    # Una query de insumos con negociado
    ins_rows = (
        sb.table("almacen_insumo")
        .select("id, cantidad_negociada, valor_negociado_total, unidad, codigo, descripcion")
        .in_("id", list(batch_insumo.keys()))
        .execute()
        .data
        or []
    )
    ins_map = {int(r["id"]): r for r in ins_rows}
    for it in items:
        iid = it.get("insumo_id")
        if not iid:
            it["supera_negociado"] = False
            continue
        row = ins_map.get(int(iid)) or {}
        neg = row.get("cantidad_negociada")
        if neg is None or _to_float(neg) <= 0:
            it["supera_negociado"] = False
            it["contexto_negociado"] = {"tiene_negociado": False, "supera_negociado": False}
            continue
        cantidad_negociada = _to_float(neg)
        acum = consumido.get(int(iid), 0.0)
        cant = _to_float(it.get("cantidad"))
        extra = batch_insumo[int(iid)] - cant
        if descontar_linea_actual:
            consumo_despues = acum + cant + extra
        else:
            consumo_despues = acum
        saldo = cantidad_negociada - consumo_despues
        supera = saldo < -0.0001
        it["supera_negociado"] = supera
        it["contexto_negociado"] = {
            "tiene_negociado": True,
            "cantidad_negociada": cantidad_negociada,
            "valor_negociado_total": (
                _to_float(row.get("valor_negociado_total"))
                if row.get("valor_negociado_total") is not None
                else None
            ),
            "cantidad_consumida_acumulada": acum,
            "cantidad_solicitada": cant,
            "cantidad_borrador_adicional": extra if descontar_linea_actual else 0,
            "consumo_total_despues": consumo_despues,
            "saldo_negociado_despues": saldo,
            "supera_negociado": supera,
            "unidad": row.get("unidad") or "UND",
            "insumo_codigo": row.get("codigo"),
            "insumo_descripcion": row.get("descripcion"),
        }


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
    cobro_res = resolver_vlr_cobro_listado(contrato_id, cap_cobro, item_cobro)
    vlr_cobro = _to_float(cobro_res.get("vlr_unitario_cobro"))
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
        "cobro_motivo": cobro_res.get("cobro_motivo"),
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
    *,
    skip_context: bool = False,
) -> dict:
    """Resuelve insumo + ítem de cobro explícito + presupuesto + flags para una línea.

    ``skip_context=True`` omite get_presupuesto_context / negociado (útil en validación
    por lote donde ``apply_saldo_flags_batch`` rellena los flags una sola vez).
    """
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

    ctx = None
    ctx_neg = None
    if not skip_context:
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
    if ctx is not None:
        vlr_cobro = ctx.get("vlr_unitario_cobro") or 0
        cobro_motivo = ctx.get("cobro_motivo")
        cant_presupuestada = ctx.get("cant_presupuestada")
        supera_presupuesto = ctx.get("supera_presupuesto")
        supera_negociado = (ctx_neg or {}).get("supera_negociado")
    else:
        cobro_res = resolver_vlr_cobro_listado(
            contrato_id,
            capitulo_ppto or ppto.get("capitulo") or "",
            item_ppto or ppto.get("item") or "",
        )
        vlr_cobro = _to_float(cobro_res.get("vlr_unitario_cobro"))
        cobro_motivo = cobro_res.get("cobro_motivo")
        cant_presupuestada = _to_float(ppto.get("cant_total"))
        supera_presupuesto = False
        supera_negociado = False
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
        "es_principal": _item_es_principal(raw),
        "cant_presupuestada": cant_presupuestada,
        "valor_compra_unitario": valor_compra,
        "tiene_precio_compra": valor_compra is not None and valor_compra > 0,
        "vlr_unitario_cobro": vlr_cobro,
        "cobro_motivo": cobro_motivo if _to_float(vlr_cobro) <= 0 else None,
        "supera_presupuesto": supera_presupuesto,
        "supera_negociado": supera_negociado,
        "contexto_presupuesto": ctx,
        "contexto_negociado": ctx_neg,
        "analisis_valor": _build_analisis_valor(
            cant, valor_compra, vlr_cobro,
            cobro_motivo=cobro_motivo if _to_float(vlr_cobro) <= 0 else None,
        ),
    }
