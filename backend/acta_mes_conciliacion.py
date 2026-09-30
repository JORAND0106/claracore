"""
Conciliación del Informe de ejecución mensual (CC-MES-001).

Reutiliza la lógica de corte_sub_conciliacion (4 cols, AIU, amortización, otros)
sin duplicarla. Solo añade lo específico del acta mensual:

- Aislamiento del acumulado: mismo contrato_id, actas RPO con conciliación
  estado='enviado' y consecutivo estrictamente menor.
- Reabrir (estado→borrador) saca el acta del acumulado de posteriores hasta reenviar.
- AIU del contrato: fracción única (contratos.aiu) + IVA (contratos.iva) mapeados
  a tributos en puntos para calc_aiu_desglose / build_resumen_conciliacion_4cols.
- Anticipo / % amortización desde contratos.
- Catálogo de otros conceptos: compartido (corte_sub_conceptos_catalogo).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import corte_sub_conciliacion as csc

_log = logging.getLogger("acta_mes_conciliacion")

ESTADO_BORRADOR = csc.ESTADO_BORRADOR
ESTADO_ENVIADO = csc.ESTADO_ENVIADO
SOPORTE_MIMES = csc.SOPORTE_MIMES
SOPORTE_MAX_BYTES = csc.SOPORTE_MAX_BYTES

# Reexportar helpers puros (misma fuente de verdad que CC-SUB)
_sf = csc._sf
_round0 = csc._round0
_pct = csc._pct
_redondear_cant = csc._redondear_cant
item_key = csc.item_key
valor_por_cantidad_vu = csc.valor_por_cantidad_vu
calc_aiu_desglose = csc.calc_aiu_desglose
calc_amortizacion = csc.calc_amortizacion
build_resumen_conciliacion_4cols = csc.build_resumen_conciliacion_4cols
label_linea_resumen_4cols = csc.label_linea_resumen_4cols
enriquecer_items_bloques = csc.enriquecer_items_bloques
filtrar_items_con_cantidades = csc.filtrar_items_con_cantidades
normalizar_otros_conceptos = csc.normalizar_otros_conceptos
total_otros_conceptos = csc.total_otros_conceptos
gran_total_con_amortizacion = csc.gran_total_con_amortizacion
aiu_lineas_resumen = csc.aiu_lineas_resumen
amortizacion_lineas_resumen = csc.amortizacion_lineas_resumen
list_catalogo_descripciones = csc.list_catalogo_descripciones
upsert_catalogo_descripcion = csc.upsert_catalogo_descripcion
validate_soporte_upload = csc.validate_soporte_upload
sanitize_filename = csc.sanitize_filename
sum_valores_bloques_items = csc.sum_valores_bloques_items


def _fraccion_a_puntos(raw: Any) -> Optional[float]:
    """Panel admin AIU/IVA: 0.25 = 25 %. Si >1, asumir ya en puntos."""
    if raw is None or raw == "":
        return None
    try:
        f = float(raw)
    except (TypeError, ValueError):
        return None
    if f != f or f < 0:  # NaN
        return None
    if f <= 1.0:
        return float(round(f * 100.0, 10))
    return float(f)


def tributos_from_contrato(aiu_raw: Any = None, iva_raw: Any = None) -> Dict[str, Any]:
    """
    Mapea AIU/IVA del contrato (fracción o puntos) a tributos en puntos.

    El AIU del contrato es un único porcentaje → se modela como Utilidad para que
    «IVA sobre la Utilidad» aplique sobre el valor del AIU. Las líneas A/I quedan
    en None (se filtran al presentar). Etiquetas se renombran con
    relabel_lineas_aiu_contrato.
    """
    aiu_pts = _fraccion_a_puntos(aiu_raw)
    iva_pts = _fraccion_a_puntos(iva_raw)
    return {
        "administracion": None,
        "imprevistos": None,
        "utilidad": aiu_pts,
        "iva": iva_pts,
        "aiu": {
            "administracion": None,
            "imprevistos": None,
            "utilidad": aiu_pts,
            "iva_utilidad": iva_pts,
        },
    }


def relabel_lineas_aiu_contrato(lineas: Optional[Iterable[dict]]) -> List[dict]:
    """Renombra Utilidad→AIU y omite A/I (sin % configurado) en el resumen del contrato."""
    out: List[dict] = []
    for raw in lineas or []:
        ln = dict(raw)
        key = ln.get("key")
        if key in ("a", "i"):
            # Sin componentes A/I en el contrato principal
            continue
        if key == "u":
            ln["nombre"] = "AIU"
            ln["abrev"] = "AIU"
            ln["label"] = label_linea_resumen_4cols(ln)
            # label_linea usa nombre+abrev → «AIU AIU (X%)»; forzar etiqueta limpia
            pct = csc.pct_label(ln.get("pct")) if ln.get("pct") is not None else ""
            ln["label"] = f"AIU ({pct})" if pct and pct != "—" else "AIU"
        elif key == "iva":
            ln["label"] = label_linea_resumen_4cols(ln)
        out.append(ln)
    return out


def build_resumen_contrato_4cols(**kwargs) -> Dict[str, Any]:
    """Wrapper: build_resumen_conciliacion_4cols + etiquetas AIU del contrato."""
    r = build_resumen_conciliacion_4cols(**kwargs)
    r["lineas"] = relabel_lineas_aiu_contrato(r.get("lineas"))
    # Alinear snapshot aiu_presente con valor_aiu (utilidad del mapeo)
    for side in ("aiu_actualizadas", "aiu_presente", "aiu_anterior"):
        block = r.get(side) or {}
        if isinstance(block, dict):
            block = dict(block)
            block["pct_aiu"] = block.get("pct_utilidad")
            block["valor_aiu"] = block.get("valor_utilidad")
            r[side] = block
    return r


def fetch_anticipo_amortizacion_contrato(sb, contrato_id: int) -> Dict[str, Any]:
    try:
        rows = (
            sb.table("contratos")
            .select("anticipo, amortizacion_pct, aiu, iva")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
        ) or []
        if rows:
            return {
                "anticipo": _sf(rows[0].get("anticipo")),
                "amortizacion_pct": _pct(rows[0].get("amortizacion_pct")),
                "aiu": rows[0].get("aiu"),
                "iva": rows[0].get("iva"),
            }
    except Exception as exc:
        err = str(exc).lower()
        if "anticipo" in err or "amortizacion" in err or "column" in err:
            try:
                rows = (
                    sb.table("contratos")
                    .select("aiu, iva")
                    .eq("id", int(contrato_id))
                    .limit(1)
                    .execute()
                    .data
                ) or []
                if rows:
                    return {
                        "anticipo": 0.0,
                        "amortizacion_pct": None,
                        "aiu": rows[0].get("aiu"),
                        "iva": rows[0].get("iva"),
                    }
            except Exception as exc2:
                _log.warning("fetch_anticipo_amortizacion_contrato fallback: %s", exc2)
        else:
            _log.warning("fetch_anticipo_amortizacion_contrato: %s", exc)
    return {"anticipo": 0.0, "amortizacion_pct": None, "aiu": None, "iva": None}


def fetch_conciliacion(sb, acta_id: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("acta_mes_conciliacion")
            .select("*")
            .eq("acta_id", int(acta_id))
            .limit(1)
            .execute()
            .data
        ) or []
        return dict(rows[0]) if rows else None
    except Exception as exc:
        _log.warning("fetch_conciliacion mes: %s", exc)
        return None


def fetch_otros_conceptos(sb, conciliacion_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("acta_mes_otros_conceptos")
            .select("*")
            .eq("conciliacion_id", int(conciliacion_id))
            .order("orden")
            .execute()
            .data
        ) or []
        return [dict(r) for r in rows]
    except Exception as exc:
        _log.warning("fetch_otros_conceptos mes: %s", exc)
        return []


def actas_enviadas_anteriores(
    sb,
    *,
    contrato_id: int,
    consecutivo_actual: int,
) -> List[dict]:
    """
    Actas RPO del mismo contrato con conciliación enviada y consecutivo < actual.
    Reabrir (borrador) las excluye del acumulado.
    """
    try:
        conc_rows = (
            sb.table("acta_mes_conciliacion")
            .select("acta_id, estado, contrato_id")
            .eq("contrato_id", int(contrato_id))
            .eq("estado", ESTADO_ENVIADO)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("actas_enviadas_anteriores conc: %s", exc)
        return []

    enviados = {
        int(r["acta_id"])
        for r in conc_rows
        if r.get("acta_id") is not None
        and int(r.get("contrato_id") or 0) == int(contrato_id)
        and str(r.get("estado") or "") == ESTADO_ENVIADO
    }
    if not enviados:
        return []

    try:
        actas = (
            sb.table("actas")
            .select("id, contrato_id, consecutivo, numero_rpo, fecha_inicio, fecha_fin, tipo_grupo")
            .eq("contrato_id", int(contrato_id))
            .in_("id", list(enviados))
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("actas_enviadas_anteriores actas: %s", exc)
        return []

    out = []
    for a in actas:
        if int(a.get("contrato_id") or 0) != int(contrato_id):
            continue
        tg = str(a.get("tipo_grupo") or "").upper()
        if tg and tg != "RPO":
            continue
        try:
            cons = int(a.get("consecutivo") or 0)
        except (TypeError, ValueError):
            continue
        if cons < int(consecutivo_actual):
            out.append(dict(a))
    out.sort(key=lambda c: int(c.get("consecutivo") or 0))
    return out


def cantidades_por_item_actas(
    sb,
    *,
    contrato_id: int,
    acta_ids: List[int],
    nivel_aprobacion: Optional[int] = None,
) -> Dict[str, float]:
    """Suma cantidad_total por ítem de las actas dadas (mismo contrato)."""
    if not acta_ids:
        return {}
    acc: Dict[str, float] = {}
    idset = {int(x) for x in acta_ids}
    try:
        from ccd_conciliacion import fetch_registros_informe_cc_mes_por_acta

        for aid in acta_ids:
            regs = fetch_registros_informe_cc_mes_por_acta(
                sb, int(contrato_id), int(aid), nivel_aprobacion=nivel_aprobacion
            )
            for r in regs or []:
                if r.get("acta_rpo_id") is not None and int(r.get("acta_rpo_id")) not in idset:
                    continue
                k = item_key(r.get("item_numero"))
                acc[k] = acc.get(k, 0.0) + _sf(r.get("cantidad_total"))
    except Exception as exc:
        _log.warning("cantidades_por_item_actas via ccd: %s — fallback so_registros", exc)
        try:
            rows = (
                sb.table("so_registros")
                .select("item_numero, cantidad_total, acta_rpo_id")
                .eq("contrato_id", int(contrato_id))
                .in_("acta_rpo_id", [int(x) for x in acta_ids])
                .execute()
                .data
            ) or []
            for r in rows:
                if int(r.get("acta_rpo_id") or 0) not in idset:
                    continue
                k = item_key(r.get("item_numero"))
                acc[k] = acc.get(k, 0.0) + _sf(r.get("cantidad_total"))
        except Exception as exc2:
            _log.warning("cantidades_por_item_actas: %s", exc2)
            return {}
    return {k: _redondear_cant(v) for k, v in acc.items()}


def cantidades_actualizadas_contrato(sb, *, contrato_id: int) -> Dict[str, float]:
    """
    Cantidades actualizadas del listado/presupuesto del contrato principal
    (tipo Presupuesto de Obra, no dado de baja).
    """
    acc: Dict[str, float] = {}
    try:
        offset = 0
        while True:
            batch = (
                sb.table("presupuesto")
                .select("item, cant_total")
                .eq("contrato_id", int(contrato_id))
                .eq("tipo_ejecucion", "Presupuesto de Obra")
                .eq("dado_de_baja", False)
                .order("id")
                .range(offset, offset + 999)
                .execute()
                .data
            ) or []
            for r in batch:
                k = item_key(r.get("item"))
                if k == "SIN_ITEM":
                    continue
                acc[k] = acc.get(k, 0.0) + _sf(r.get("cant_total"))
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("cantidades_actualizadas_contrato: %s", exc)
        return {}
    return {k: _redondear_cant(v) for k, v in acc.items()}


def precios_vu_contrato(sb, *, contrato_id: int) -> Dict[str, float]:
    """Mapa item_numero → precio_unitario del listado de precios del contrato."""
    out: Dict[str, float] = {}
    try:
        offset = 0
        while True:
            batch = (
                sb.table("listado_precios")
                .select("item_numero, precio_unitario")
                .eq("contrato_id", int(contrato_id))
                .order("item_numero")
                .range(offset, offset + 999)
                .execute()
                .data
            ) or []
            for r in batch:
                k = item_key(r.get("item_numero"))
                vu = _sf(r.get("precio_unitario"))
                if k == "SIN_ITEM" or vu <= 0:
                    continue
                if k not in out:
                    out[k] = vu
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("precios_vu_contrato: %s", exc)
    return out


def aplicar_precios_contrato_a_items(
    items: List[dict],
    vu_por_item: Dict[str, float],
) -> Tuple[List[dict], List[str]]:
    """Sobrescribe vlr_unitario con listado del contrato; recalcula costo_directo = cant×VU."""
    sin_precio: List[str] = []
    out: List[dict] = []
    for it in items or []:
        row = dict(it)
        k = item_key(row.get("item_numero"))
        stamped = _sf(row.get("vlr_unitario"))
        pactado = _sf(vu_por_item.get(k)) if k in (vu_por_item or {}) else 0.0
        if pactado > 0:
            vu = pactado
            row["precio_fuente"] = "listado_precios"
        elif stamped > 0:
            vu = stamped
            row["precio_fuente"] = "stamp_registro"
        else:
            vu = 0.0
            row["precio_fuente"] = None
            row["sin_precio"] = True
            if k and k != "SIN_ITEM":
                sin_precio.append(str(row.get("item_numero") or k))
        row["vlr_unitario"] = vu
        row["vlr_unitario_sub"] = vu  # enriquecer_items_bloques lee vlr_unitario_sub
        row["sin_precio"] = bool(row.get("sin_precio")) or vu <= 0
        row["costo_directo"] = valor_por_cantidad_vu(row.get("cantidad"), vu)
        out.append(row)
    return out, sin_precio


def amortizado_en_actas_enviadas_anteriores(
    sb,
    *,
    contrato_id: int,
    consecutivo_actual: int,
) -> float:
    previos = actas_enviadas_anteriores(
        sb, contrato_id=contrato_id, consecutivo_actual=consecutivo_actual
    )
    if not previos:
        return 0.0
    ids = [int(c["id"]) for c in previos if c.get("id") is not None]
    try:
        rows = (
            sb.table("acta_mes_conciliacion")
            .select("acta_id, amortizacion_presente, estado, contrato_id")
            .eq("contrato_id", int(contrato_id))
            .eq("estado", ESTADO_ENVIADO)
            .in_("acta_id", ids)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("amortizado_en_actas_enviadas_anteriores: %s", exc)
        return 0.0
    total = 0.0
    idset = set(ids)
    for r in rows:
        if int(r.get("acta_id") or 0) not in idset:
            continue
        if int(r.get("contrato_id") or 0) != int(contrato_id):
            continue
        total += _sf(r.get("amortizacion_presente"))
    return _round0(total)


def fetch_aiu_otros_anteriores_enviados(
    sb,
    *,
    contrato_id: int,
    consecutivo_actual: int,
) -> Dict[str, float]:
    vacio = {
        "costo_directo": 0.0,
        "valor_administracion": 0.0,
        "valor_imprevistos": 0.0,
        "valor_utilidad": 0.0,
        "valor_iva_utilidad": 0.0,
        "costo_directo_mas_aiu": 0.0,
        "total_otros": 0.0,
        "amortizacion_presente": 0.0,
    }
    previos = actas_enviadas_anteriores(
        sb, contrato_id=contrato_id, consecutivo_actual=consecutivo_actual
    )
    if not previos:
        return vacio
    ids = [int(c["id"]) for c in previos if c.get("id") is not None]
    if not ids:
        return vacio
    try:
        rows = (
            sb.table("acta_mes_conciliacion")
            .select(
                "acta_id, contrato_id, estado, costo_directo, valor_administracion, "
                "valor_imprevistos, valor_utilidad, valor_iva_utilidad, valor_aiu, "
                "costo_directo_mas_aiu, total_otros_conceptos, amortizacion_presente"
            )
            .eq("contrato_id", int(contrato_id))
            .eq("estado", ESTADO_ENVIADO)
            .in_("acta_id", ids)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("fetch_aiu_otros_anteriores_enviados mes: %s", exc)
        return vacio
    idset = set(ids)
    out = dict(vacio)
    for r in rows:
        if int(r.get("acta_id") or 0) not in idset:
            continue
        if int(r.get("contrato_id") or 0) != int(contrato_id):
            continue
        for k in (
            "costo_directo",
            "valor_administracion",
            "valor_imprevistos",
            "valor_utilidad",
            "valor_iva_utilidad",
            "costo_directo_mas_aiu",
            "amortizacion_presente",
        ):
            out[k] = _round0(out[k] + _sf(r.get(k)))
        # valor_aiu legacy/alias → utilidad
        if _sf(r.get("valor_aiu")) and not _sf(r.get("valor_utilidad")):
            out["valor_utilidad"] = _round0(out["valor_utilidad"] + _sf(r.get("valor_aiu")))
        out["total_otros"] = _round0(out["total_otros"] + _sf(r.get("total_otros_conceptos")))
    return out


def guardar_conciliacion(
    sb,
    *,
    contrato_id: int,
    acta_id: int,
    aiu: dict,
    otros: List[dict],
    usuario_id: Optional[str] = None,
    enviar: bool = False,
    reabrir: bool = False,
    amortizacion: Optional[dict] = None,
) -> dict:
    """Crea/actualiza conciliación mensual y reemplaza filas de otros conceptos."""
    now = datetime.now(timezone.utc).isoformat()
    otros_n = normalizar_otros_conceptos(otros)
    tot_otros = total_otros_conceptos(otros_n)
    amort = amortizacion or {}
    base_gt = amort.get("subtotal_despues_amortizacion")
    if base_gt is None:
        base_gt = aiu.get("costo_directo_mas_aiu")
    gt = gran_total_con_amortizacion(base_gt, tot_otros)

    prev = fetch_conciliacion(sb, acta_id)
    if prev and str(prev.get("estado")) == ESTADO_ENVIADO and not reabrir and not enviar:
        raise PermissionError("El acta ya fue enviada. Reabra la conciliación para editar.")

    estado = ESTADO_ENVIADO if enviar else ESTADO_BORRADOR
    if reabrir:
        estado = ESTADO_BORRADOR

    valor_aiu = _round0(aiu.get("valor_aiu", aiu.get("valor_utilidad")))
    payload = {
        "contrato_id": int(contrato_id),
        "acta_id": int(acta_id),
        "estado": estado,
        "pct_administracion": aiu.get("pct_administracion"),
        "pct_imprevistos": aiu.get("pct_imprevistos"),
        "pct_utilidad": aiu.get("pct_utilidad"),
        "pct_iva_utilidad": aiu.get("pct_iva_utilidad"),
        "pct_aiu": aiu.get("pct_aiu", aiu.get("pct_utilidad")),
        "costo_directo": _round0(aiu.get("costo_directo")),
        "valor_administracion": _round0(aiu.get("valor_administracion")),
        "valor_imprevistos": _round0(aiu.get("valor_imprevistos")),
        "valor_utilidad": _round0(aiu.get("valor_utilidad")),
        "valor_iva_utilidad": _round0(aiu.get("valor_iva_utilidad")),
        "valor_aiu": valor_aiu,
        "costo_directo_mas_aiu": _round0(aiu.get("costo_directo_mas_aiu")),
        "anticipo_entregado": _round0(amort.get("anticipo_entregado")),
        "amortizado_anterior": _round0(amort.get("amortizado_anterior")),
        "pct_amortizacion": amort.get("pct_amortizacion"),
        "amortizacion_presente": _round0(amort.get("amortizacion_presente")),
        "saldo_por_amortizar": _round0(amort.get("saldo_por_amortizar")),
        "subtotal_despues_amortizacion": _round0(
            amort.get("subtotal_despues_amortizacion", aiu.get("costo_directo_mas_aiu"))
        ),
        "total_otros_conceptos": tot_otros,
        "gran_total": gt,
        "updated_at": now,
    }
    if enviar:
        payload["enviado_en"] = now
        if usuario_id:
            payload["enviado_por"] = usuario_id
    if reabrir:
        payload["reabierto_en"] = now
        if usuario_id:
            payload["reabierto_por"] = usuario_id
        payload["enviado_en"] = None

    try:
        if prev:
            sb.table("acta_mes_conciliacion").update(payload).eq("id", int(prev["id"])).execute()
            conc_id = int(prev["id"])
            sb.table("acta_mes_otros_conceptos").delete().eq("conciliacion_id", conc_id).execute()
        else:
            payload["created_at"] = now
            ins = sb.table("acta_mes_conciliacion").insert(payload).execute().data or []
            if not ins:
                raise RuntimeError("No se pudo crear la conciliación mensual.")
            conc_id = int(ins[0]["id"])
    except Exception as exc:
        err = str(exc).lower()
        if "pct_aiu" in err or "valor_aiu" in err or "column" in err or "schema" in err:
            payload.pop("pct_aiu", None)
            payload.pop("valor_aiu", None)
            if prev:
                sb.table("acta_mes_conciliacion").update(payload).eq("id", int(prev["id"])).execute()
                conc_id = int(prev["id"])
                sb.table("acta_mes_otros_conceptos").delete().eq("conciliacion_id", conc_id).execute()
            else:
                payload["created_at"] = now
                ins = sb.table("acta_mes_conciliacion").insert(payload).execute().data or []
                if not ins:
                    raise RuntimeError("No se pudo crear la conciliación mensual.") from exc
                conc_id = int(ins[0]["id"])
        else:
            raise

    for row in otros_n:
        if row.get("descripcion"):
            upsert_catalogo_descripcion(sb, contrato_id, row["descripcion"])
        sb.table("acta_mes_otros_conceptos").insert({
            "conciliacion_id": conc_id,
            "orden": row["orden"],
            "descripcion": row["descripcion"][:500],
            "unidad": row.get("unidad"),
            "cantidad": row["cantidad"],
            "valor_unitario": row["valor_unitario"],
            "costo_total": row["costo_total"],
            "soporte_azure_path": row.get("soporte_azure_path"),
            "soporte_nombre": row.get("soporte_nombre"),
            "soporte_mime": row.get("soporte_mime"),
        }).execute()

    saved = fetch_conciliacion(sb, acta_id) or {}
    saved["otros_conceptos"] = fetch_otros_conceptos(sb, conc_id)
    return saved
