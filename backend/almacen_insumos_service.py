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


def _insumo_label(row: dict) -> str:
    cod = (row.get("codigo") or "").strip()
    desc = (row.get("descripcion") or "").strip()
    if cod and desc:
        return f"{cod} — {desc}"
    return cod or desc or "Insumo"


def _row_from_listado(lp: dict) -> dict:
    return {
        "id": None,
        "listado_precio_id": lp.get("id"),
        "codigo": lp.get("item_numero") or "",
        "descripcion": lp.get("descripcion") or "",
        "unidad": lp.get("unidad") or "UND",
        "valor_compra_referencia": _to_float(lp.get("precio_unitario")),
        "capitulo": lp.get("capitulo"),
        "item_numero": lp.get("item_numero"),
        "origen": "listado_precios",
        "label": _insumo_label({
            "codigo": lp.get("item_numero"),
            "descripcion": lp.get("descripcion"),
        }),
    }


def _row_from_almacen_insumo(row: dict) -> dict:
    return {
        **row,
        "origen": "almacen_insumo",
        "label": _insumo_label(row),
    }


def search_insumos(contrato_id: int, q: str = "", limit: int = 30) -> List[dict]:
    sb = _sb()
    q = (q or "").strip()
    out: List[dict] = []
    seen_lp: set = set()
    seen_cod: set = set()

    if q:
        lp_q = (
            sb.table("listado_precios")
            .select("id, item_numero, descripcion, unidad, precio_unitario, capitulo, competencia")
            .eq("contrato_id", contrato_id)
            .or_(f"descripcion.ilike.%{q}%,item_numero.ilike.%{q}%")
            .limit(limit)
            .execute()
            .data
            or []
        )
    else:
        lp_q = (
            sb.table("listado_precios")
            .select("id, item_numero, descripcion, unidad, precio_unitario, capitulo, competencia")
            .eq("contrato_id", contrato_id)
            .order("item_numero")
            .limit(limit)
            .execute()
            .data
            or []
        )

    ai_q = sb.table("almacen_insumo").select("*").eq("contrato_id", contrato_id).eq("activo", True)
    if q:
        ai_q = ai_q.or_(f"descripcion.ilike.%{q}%,codigo.ilike.%{q}%")
    ai_rows = ai_q.order("codigo").limit(limit).execute().data or []

    for lp in lp_q:
        lid = lp.get("id")
        if lid in seen_lp:
            continue
        seen_lp.add(lid)
        cod = _norm_item_key(lp.get("item_numero"))
        seen_cod.add(cod.lower())
        out.append(_row_from_listado(lp))

    for row in ai_rows:
        cod = _norm_item_key(row.get("codigo")).lower()
        if row.get("listado_precio_id") in seen_lp:
            continue
        if cod in seen_cod:
            continue
        seen_cod.add(cod)
        out.append(_row_from_almacen_insumo(row))

    return out[:limit]


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
    return _row_from_almacen_insumo(rows[0])


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


def create_insumo(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    codigo = (body.get("codigo") or "").strip()
    descripcion = (body.get("descripcion") or "").strip()
    if not codigo or not descripcion:
        raise ValueError("Código y descripción del insumo son obligatorios.")
    row = {
        "contrato_id": contrato_id,
        "listado_precio_id": body.get("listado_precio_id"),
        "codigo": codigo,
        "descripcion": descripcion,
        "unidad": (body.get("unidad") or "UND").strip(),
        "valor_compra_referencia": _to_float(body.get("valor_compra_referencia")),
        "capitulo": body.get("capitulo"),
        "item_numero": body.get("item_numero") or codigo,
        "created_by": user_id,
    }
    ins = sb.table("almacen_insumo").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo crear el insumo (¿código duplicado?).")
    return _row_from_almacen_insumo(ins[0])


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
    """Resuelve insumo + presupuesto + flags para una línea de solicitud."""
    insumo_id = raw.get("insumo_id")
    listado_precio_id = raw.get("listado_precio_id")
    pk_id = (raw.get("pk_id") or "").strip()
    presupuesto_id = raw.get("presupuesto_id")
    cant = _to_float(raw.get("cantidad"))

    if cant <= 0:
        raise ValueError("La cantidad debe ser mayor a cero.")
    if not pk_id:
        raise ValueError("Seleccione la ubicación PK-ID en el mapa.")

    if insumo_id:
        insumo = get_insumo(contrato_id, int(insumo_id))
    elif listado_precio_id:
        insumo = ensure_insumo_from_listado(contrato_id, int(listado_precio_id), user_id)
        insumo_id = insumo.get("id")
    else:
        raise ValueError("Seleccione un insumo del catálogo.")

    capitulo = insumo.get("capitulo")
    item_numero = insumo.get("item_numero") or insumo.get("codigo")
    if not capitulo or not item_numero:
        raise ValueError("El insumo no tiene capítulo/ítem para cruzar con presupuesto.")

    if presupuesto_id:
        sb = _sb()
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
        if str(ppto.get("pk_id") or "") != pk_id:
            ppto = resolve_presupuesto_row(contrato_id, capitulo, item_numero, pk_id)
    else:
        ppto = resolve_presupuesto_row(contrato_id, capitulo, item_numero, pk_id)

    ctx = get_presupuesto_context(
        contrato_id,
        int(ppto["id"]),
        pk_id,
        cant,
        exclude_solicitud_id=raw.get("exclude_solicitud_id"),
    )
    valor_compra = _to_float(raw.get("valor_compra_unitario") or insumo.get("valor_compra_referencia"))
    vlr_cobro = ctx.get("vlr_unitario_cobro") or 0
    costo_insumos = valor_compra * cant
    utilidad_estimada = (vlr_cobro * cant) - costo_insumos if vlr_cobro else None

    return {
        "insumo_id": insumo_id,
        "listado_precio_id": insumo.get("listado_precio_id"),
        "presupuesto_id": int(ppto["id"]),
        "pk_id": pk_id,
        "capitulo": ppto.get("capitulo"),
        "item": ppto.get("item"),
        "material_descripcion": _insumo_label(insumo),
        "unidad": insumo.get("unidad") or ppto.get("und") or "UND",
        "cantidad": cant,
        "es_recurrente": bool(raw.get("es_recurrente")),
        "cant_presupuestada": ctx.get("cant_presupuestada"),
        "valor_compra_unitario": valor_compra,
        "vlr_unitario_cobro": vlr_cobro,
        "supera_presupuesto": ctx.get("supera_presupuesto"),
        "contexto_presupuesto": ctx,
        "analisis_valor": {
            "costo_insumo_linea": round(costo_insumos, 2),
            "valor_cobro_unitario": vlr_cobro,
            "valor_cobro_linea": round(vlr_cobro * cant, 2) if vlr_cobro else None,
            "utilidad_estimada_linea": round(utilidad_estimada, 2) if utilidad_estimada is not None else None,
        },
    }
