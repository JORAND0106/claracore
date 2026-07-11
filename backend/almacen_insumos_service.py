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


def _impuesto_etiqueta(tipo_impuesto: Optional[str], impuesto_porcentaje: float) -> str:
    tipo = (tipo_impuesto or "").strip().lower()
    pct = _to_float(impuesto_porcentaje)
    if tipo == "iva" and pct:
        return f"IVA {pct:g}%"
    if tipo == "aiu" and pct:
        return f"AIU {pct:g}%"
    return "—"


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
    caps = set()
    for row in _fetch_all_listado_rows(contrato_id, "capitulo"):
        cap = (row.get("capitulo") or "").strip()
        if cap:
            caps.add(cap)
    return sorted(caps)


def list_listado_items_capitulo(contrato_id: int, capitulo: str) -> List[dict]:
    capitulo = (capitulo or "").strip()
    if not capitulo:
        return []
    seen: set = set()
    out: List[dict] = []
    for row in _fetch_all_listado_rows(contrato_id, "capitulo, item_numero, descripcion, unidad"):
        if (row.get("capitulo") or "").strip() != capitulo:
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
    return sorted(out, key=lambda r: _norm_item_key(r.get("item")))


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
        "impuesto_etiqueta": _impuesto_etiqueta(tipo, pct) if tiene else "—",
        "costo_total": total,
        "valor_compra_referencia": total,
        "tiene_precio_compra": tiene,
        "origen": "almacen_insumo",
        "label": _insumo_label(row),
    }


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

    out: List[dict] = []
    for row in rows:
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


def create_proveedor(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    razon = (body.get("razon_social") or "").strip()
    nit = (body.get("nit") or "").strip()
    if not razon or not nit:
        raise ValueError("Razón social y NIT son obligatorios.")
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
        return existing[0]
    ins = sb.table("almacen_proveedor").insert({
        "contrato_id": contrato_id,
        "razon_social": razon,
        "nit": nit,
        "created_by": user_id,
    }).execute().data
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


def resolve_presupuesto_row(
    contrato_id: int,
    capitulo: str,
    item_numero: str,
    pk_id: str,
) -> dict:
    sb = _sb()
    want_item = _norm_item_key(item_numero)
    rows = (
        sb.table("presupuesto")
        .select("id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario, costo_directo")
        .eq("contrato_id", contrato_id)
        .eq("dado_de_baja", False)
        .eq("capitulo", capitulo)
        .eq("pk_id", pk_id)
        .execute()
        .data
        or []
    )
    for r in rows:
        if _norm_item_key(r.get("item")) == want_item:
            return r
    raise ValueError(
        f"No hay fila de presupuesto para capítulo {capitulo}, ítem {item_numero} en PK {pk_id}."
    )


def _cantidad_solicitada_acumulada(
    sb,
    contrato_id: int,
    presupuesto_id: int,
    pk_id: str,
    exclude_solicitud_id: Optional[int] = None,
) -> float:
    items = (
        sb.table("almacen_solicitud_item")
        .select("cantidad, solicitud_id, pk_id, presupuesto_id")
        .eq("presupuesto_id", presupuesto_id)
        .eq("pk_id", pk_id)
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


def get_presupuesto_context(
    contrato_id: int,
    presupuesto_id: int,
    pk_id: str,
    cantidad_solicitada: float = 0,
    exclude_solicitud_id: Optional[int] = None,
) -> dict:
    sb = _sb()
    ppto = (
        sb.table("presupuesto")
        .select("id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario")
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
    if str(row.get("pk_id") or "") != str(pk_id or ""):
        raise ValueError("El PK-ID no coincide con la fila de presupuesto.")
    presupuestada = _to_float(row.get("cant_total"))
    acum = _cantidad_solicitada_acumulada(sb, contrato_id, presupuesto_id, pk_id, exclude_solicitud_id)
    cant = _to_float(cantidad_solicitada)
    if exclude_solicitud_id is not None:
        saldo_despues = presupuestada - acum - cant
    else:
        saldo_despues = presupuestada - acum
    return {
        "presupuesto_id": presupuesto_id,
        "pk_id": pk_id,
        "capitulo": row.get("capitulo"),
        "item": row.get("item"),
        "descripcion": row.get("descripcion"),
        "unidad": row.get("und"),
        "cant_presupuestada": presupuestada,
        "cant_solicitada_acumulada": acum,
        "cantidad_solicitada": cant,
        "saldo_disponible_despues": saldo_despues,
        "vlr_unitario_cobro": _to_float(row.get("vlr_unitario")),
        "supera_presupuesto": saldo_despues < -0.0001,
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
        ppto_rows = (
            sb.table("presupuesto")
            .select("id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario")
            .eq("id", int(presupuesto_id))
            .eq("contrato_id", contrato_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not ppto_rows:
            raise ValueError("Ítem de presupuesto inválido.")
        ppto = ppto_rows[0]
        cap_ok = not capitulo_ppto or str(ppto.get("capitulo") or "") == capitulo_ppto
        item_ok = not item_ppto or _norm_item_key(ppto.get("item")) == _norm_item_key(item_ppto)
        if not cap_ok or not item_ok:
            raise ValueError("El ítem de presupuesto no coincide con capítulo/ítem seleccionados.")
        if str(ppto.get("pk_id") or "") != pk_id:
            ppto = resolve_presupuesto_row(
                contrato_id,
                capitulo_ppto or ppto.get("capitulo"),
                item_ppto or ppto.get("item"),
                pk_id,
            )
    else:
        ppto = resolve_presupuesto_row(contrato_id, capitulo_ppto, item_ppto, pk_id)

    ctx = get_presupuesto_context(
        contrato_id,
        int(ppto["id"]),
        pk_id,
        cant,
        exclude_solicitud_id=raw.get("exclude_solicitud_id"),
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
    if costo_insumos is not None and vlr_cobro:
        utilidad_estimada = (vlr_cobro * cant) - costo_insumos

    return {
        "insumo_id": insumo_id,
        "listado_precio_id": insumo.get("listado_precio_id"),
        "presupuesto_id": int(ppto["id"]),
        "pk_id": pk_id,
        "pk_id_id": raw.get("pk_id_id"),
        "tramo": (raw.get("tramo") or "").strip() or None,
        "costado": (raw.get("costado") or "").strip() or None,
        "abscisa_inicial": _to_float(raw.get("abscisa_inicial")) if raw.get("abscisa_inicial") not in (None, "") else None,
        "abscisa_final": _to_float(raw.get("abscisa_final")) if raw.get("abscisa_final") not in (None, "") else None,
        "observacion_residente": (raw.get("observacion_residente") or "").strip() or None,
        "capitulo": ppto.get("capitulo"),
        "item": ppto.get("item"),
        "material_descripcion": _insumo_label(insumo),
        "unidad": insumo.get("unidad") or ppto.get("und") or "UND",
        "cantidad": cant,
        "es_recurrente": bool(raw.get("es_recurrente")),
        "cant_presupuestada": ctx.get("cant_presupuestada"),
        "valor_compra_unitario": valor_compra,
        "tiene_precio_compra": valor_compra is not None and valor_compra > 0,
        "vlr_unitario_cobro": vlr_cobro,
        "supera_presupuesto": ctx.get("supera_presupuesto"),
        "contexto_presupuesto": ctx,
        "analisis_valor": {
            "tiene_precio_compra": valor_compra is not None and valor_compra > 0,
            "costo_insumo_linea": round(costo_insumos, 2) if costo_insumos is not None else None,
            "valor_cobro_unitario": vlr_cobro,
            "valor_cobro_linea": round(vlr_cobro * cant, 2) if vlr_cobro else None,
            "utilidad_estimada_linea": round(utilidad_estimada, 2) if utilidad_estimada is not None else None,
        },
    }
