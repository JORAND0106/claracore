"""
Conciliación del Corte de subcontratista (CC-SUB-001).

Aislamiento crítico del acumulado:
- Solo cortes del mismo subcontratista_id.
- Solo cortes con conciliación estado='enviado'.
- Solo cortes con consecutivo estrictamente menor al corte actual.
- Reabrir un corte (estado→borrador) lo saca del acumulado de posteriores hasta reenviarlo.
"""
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

_log = logging.getLogger("corte_sub_conciliacion")

ESTADO_BORRADOR = "borrador"
ESTADO_ENVIADO = "enviado"

SOPORTE_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
})
SOPORTE_MAX_BYTES = 20 * 1024 * 1024


def _sf(n: Any, default: float = 0.0) -> float:
    if n is None or n == "":
        return float(default)
    try:
        x = float(n)
        if math.isnan(x) or math.isinf(x):
            return float(default)
        return x
    except (TypeError, ValueError):
        try:
            return float(str(n).replace(",", "").replace(" ", "").strip())
        except Exception:
            return float(default)


def _round0(n: Any) -> float:
    return float(round(_sf(n), 0))


def _pct(n: Any) -> Optional[float]:
    if n is None or n == "":
        return None
    try:
        x = float(n)
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    except (TypeError, ValueError):
        return None


def _pct_from(raw: Any, *keys: str) -> Optional[float]:
    if not isinstance(raw, dict):
        return None
    for k in keys:
        if raw.get(k) is not None and raw.get(k) != "":
            return _pct(raw.get(k))
    return None


def _extract_tributos_pcts(tributos: Any) -> Dict[str, Optional[float]]:
    """Extrae A/I/U/IVA (misma forma que normalize_tributos, sin dependencia azure)."""
    src = tributos if isinstance(tributos, dict) else {}
    aiu_in = src.get("aiu") if isinstance(src.get("aiu"), dict) else {}
    iva_in = src.get("iva") if isinstance(src.get("iva"), dict) else {}
    a = _pct_from(src, "administracion") or _pct_from(aiu_in, "administracion")
    i = _pct_from(src, "imprevistos") or _pct_from(aiu_in, "imprevistos")
    u = _pct_from(src, "utilidad") or _pct_from(aiu_in, "utilidad")
    iva = None
    if not isinstance(src.get("iva"), dict) and src.get("iva") is not None:
        iva = _pct(src.get("iva"))
    if iva is None:
        iva = _pct_from(iva_in, "porcentaje") or _pct_from(aiu_in, "iva_utilidad")
    return {"administracion": a, "imprevistos": i, "utilidad": u, "iva": iva}


def _redondear_cant(valor: Any) -> float:
    try:
        from sicoe_cantidad_redondeo import redondear_cantidad_total_dinamico

        return redondear_cantidad_total_dinamico(valor)
    except Exception:
        return float(round(_sf(valor), 2))


def valor_por_cantidad_vu(cantidad: Any, vlr_unitario: Any) -> float:
    """
    Cantidad × VU, redondeado a 0 dp (nunca sumar valores almacenados).

    La cantidad ya debe venir agregada a nivel de registro (suma de
    ``cantidad_total`` persistidos, cada uno con redondeo de plataforma).
    No se re-aplica el redondeo dinámico sobre la suma: eso divergía de
    SicoeObra ``agruparRegistrosPorItem`` / ``sumCant``.
    """
    return _round0(_sf(cantidad) * _sf(vlr_unitario))


def calc_aiu_desglose(costo_directo: float, tributos: Any = None) -> Dict[str, Any]:
    """
    AIU e IVA sobre Utilidad, cada componente en su propia línea, redondeado a 0 dp.
    IVA aplica sobre el valor de Utilidad ya redondeado.
    """
    t = _extract_tributos_pcts(tributos)
    cd = _round0(costo_directo)
    a_pct = t.get("administracion")
    i_pct = t.get("imprevistos")
    u_pct = t.get("utilidad")
    iva_pct = t.get("iva")

    val_a = _round0(cd * ((a_pct or 0.0) / 100.0)) if a_pct is not None else 0.0
    val_i = _round0(cd * ((i_pct or 0.0) / 100.0)) if i_pct is not None else 0.0
    val_u = _round0(cd * ((u_pct or 0.0) / 100.0)) if u_pct is not None else 0.0
    val_iva = _round0(val_u * ((iva_pct or 0.0) / 100.0)) if iva_pct is not None else 0.0

    cd_aiu = _round0(cd + val_a + val_i + val_u + val_iva)
    return {
        "pct_administracion": a_pct,
        "pct_imprevistos": i_pct,
        "pct_utilidad": u_pct,
        "pct_iva_utilidad": iva_pct,
        "costo_directo": cd,
        "valor_administracion": val_a,
        "valor_imprevistos": val_i,
        "valor_utilidad": val_u,
        "valor_iva_utilidad": val_iva,
        "costo_directo_mas_aiu": cd_aiu,
    }


def costo_total_otro_concepto(cantidad: Any, valor_unitario: Any) -> float:
    """Otros conceptos: solo cantidad × VU, sin AIU/IVA, 0 dp."""
    return _round0(_sf(cantidad) * _sf(valor_unitario))


def normalizar_otros_conceptos(filas: Optional[Iterable[dict]]) -> List[dict]:
    out: List[dict] = []
    for i, raw in enumerate(filas or []):
        if not isinstance(raw, dict):
            continue
        desc = str(raw.get("descripcion") or "").strip()
        und = str(raw.get("unidad") or "").strip() or None
        cant = _sf(raw.get("cantidad"))
        vu = _sf(raw.get("valor_unitario"))
        costo = costo_total_otro_concepto(cant, vu)
        out.append({
            "orden": int(raw.get("orden") if raw.get("orden") is not None else i),
            "descripcion": desc,
            "unidad": und,
            "cantidad": cant,
            "valor_unitario": vu,
            "costo_total": costo,
            "soporte_azure_path": raw.get("soporte_azure_path") or None,
            "soporte_nombre": raw.get("soporte_nombre") or None,
            "soporte_mime": raw.get("soporte_mime") or None,
            "id": raw.get("id"),
        })
    out.sort(key=lambda r: (r["orden"], str(r.get("descripcion") or "")))
    return out


def total_otros_conceptos(filas: Optional[Iterable[dict]]) -> float:
    return _round0(sum(_sf(r.get("costo_total")) for r in normalizar_otros_conceptos(filas)))


def gran_total(costo_directo_mas_aiu: float, total_otros: float) -> float:
    """Legacy: CD+AIU + otros (sin amortización). Preferir gran_total_con_amortizacion."""
    return _round0(_sf(costo_directo_mas_aiu) + _sf(total_otros))


def guardar_conciliacion(
    sb,
    *,
    contrato_id: int,
    corte_id: int,
    subcontratista_id: int,
    aiu: dict,
    otros: List[dict],
    usuario_id: Optional[str] = None,
    enviar: bool = False,
    reabrir: bool = False,
    amortizacion: Optional[dict] = None,
) -> dict:
    """Crea/actualiza conciliación y reemplaza filas de otros conceptos."""
    now = datetime.now(timezone.utc).isoformat()
    otros_n = normalizar_otros_conceptos(otros)
    tot_otros = total_otros_conceptos(otros_n)
    amort = amortizacion or {}
    base_gt = amort.get("subtotal_despues_amortizacion")
    if base_gt is None:
        base_gt = aiu.get("costo_directo_mas_aiu")
    gt = gran_total_con_amortizacion(base_gt, tot_otros)

    prev = fetch_conciliacion(sb, corte_id)
    if prev and str(prev.get("estado")) == ESTADO_ENVIADO and not reabrir and not enviar:
        raise PermissionError("El corte ya fue enviado. Reabra la conciliación para editar.")

    estado = ESTADO_ENVIADO if enviar else ESTADO_BORRADOR
    if reabrir:
        estado = ESTADO_BORRADOR

    payload = {
        "contrato_id": int(contrato_id),
        "corte_id": int(corte_id),
        "subcontratista_id": int(subcontratista_id),
        "estado": estado,
        "pct_administracion": aiu.get("pct_administracion"),
        "pct_imprevistos": aiu.get("pct_imprevistos"),
        "pct_utilidad": aiu.get("pct_utilidad"),
        "pct_iva_utilidad": aiu.get("pct_iva_utilidad"),
        "costo_directo": _round0(aiu.get("costo_directo")),
        "valor_administracion": _round0(aiu.get("valor_administracion")),
        "valor_imprevistos": _round0(aiu.get("valor_imprevistos")),
        "valor_utilidad": _round0(aiu.get("valor_utilidad")),
        "valor_iva_utilidad": _round0(aiu.get("valor_iva_utilidad")),
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
        # Al reabrir, la amortización deja de contar en posteriores hasta reenviar.
        # Se mantienen los valores en borrador para edición; estado=borrador los excluye del histórico.

    # Degradación si columnas de amortización aún no migradas
    try:
        if prev:
            sb.table("corte_sub_conciliacion").update(payload).eq("id", int(prev["id"])).execute()
            conc_id = int(prev["id"])
            sb.table("corte_sub_otros_conceptos").delete().eq("conciliacion_id", conc_id).execute()
        else:
            payload["created_at"] = now
            ins = sb.table("corte_sub_conciliacion").insert(payload).execute().data or []
            if not ins:
                raise RuntimeError("No se pudo crear la conciliación.")
            conc_id = int(ins[0]["id"])
    except Exception as exc:
        err = str(exc).lower()
        if "amortiz" in err or "anticipo_entregado" in err or "column" in err or "schema" in err:
            for k in (
                "anticipo_entregado",
                "amortizado_anterior",
                "pct_amortizacion",
                "amortizacion_presente",
                "saldo_por_amortizar",
                "subtotal_despues_amortizacion",
            ):
                payload.pop(k, None)
            if prev:
                sb.table("corte_sub_conciliacion").update(payload).eq("id", int(prev["id"])).execute()
                conc_id = int(prev["id"])
                sb.table("corte_sub_otros_conceptos").delete().eq("conciliacion_id", conc_id).execute()
            else:
                payload["created_at"] = now
                ins = sb.table("corte_sub_conciliacion").insert(payload).execute().data or []
                if not ins:
                    raise RuntimeError("No se pudo crear la conciliación.") from exc
                conc_id = int(ins[0]["id"])
        else:
            raise

    for row in otros_n:
        if row.get("descripcion"):
            upsert_catalogo_descripcion(sb, contrato_id, row["descripcion"])
        sb.table("corte_sub_otros_conceptos").insert({
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

    saved = fetch_conciliacion(sb, corte_id) or {}
    saved["otros_conceptos"] = fetch_otros_conceptos(sb, conc_id)
    return saved


def validate_soporte_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > SOPORTE_MAX_BYTES:
        raise ValueError(f"El archivo supera el máximo de {SOPORTE_MAX_BYTES // (1024 * 1024)} MB.")
    mime = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime not in SOPORTE_MIMES:
        raise ValueError("Formato no permitido. Use PDF, JPG, JPEG o PNG (no documentos Office).")
    return mime


def item_key(item_numero: Any) -> str:
    return str(item_numero or "").strip() or "SIN_ITEM"


def enriquecer_items_bloques(
    items_presente: List[dict],
    *,
    cant_actualizadas: Dict[str, float],
    cant_acum_anterior: Dict[str, float],
    vu_por_item: Optional[Dict[str, float]] = None,
) -> List[dict]:
    """
    Añade bloques Actualizadas / Presente / Acumulado / Saldo (cant + valor) por ítem.
    Acumulado = anterior (solo enviados del mismo sub) + presente.
    Saldo = actualizadas − acumulado.
    """
    vu_por_item = vu_por_item or {}
    keys = set(cant_actualizadas) | set(cant_acum_anterior)
    for it in items_presente or []:
        keys.add(item_key(it.get("item_numero")))

    by_presente = {item_key(it.get("item_numero")): it for it in (items_presente or [])}
    out: List[dict] = []
    for k in sorted(keys, key=lambda x: (x == "SIN_ITEM", x)):
        base = dict(by_presente.get(k) or {})
        if not base:
            base = {
                "item_numero": "" if k == "SIN_ITEM" else k,
                "item_descripcion": "",
                "unidad": "",
                "capitulo": "",
                "cantidad": 0.0,
                "vlr_unitario_sub": vu_por_item.get(k, 0.0),
                "costo_directo": 0.0,
            }
        vu = _sf(base.get("vlr_unitario_sub"))
        if vu == 0.0 and k in vu_por_item:
            vu = _sf(vu_por_item[k])
            base["vlr_unitario_sub"] = vu

        # Suma de cantidad_total ya redondeada por registro (misma regla que
        # SicoeObra sumCant). No re-aplicar redondeo dinámico sobre el agregado.
        cant_pres = _sf(base.get("cantidad") or 0.0)
        cant_act = _sf(cant_actualizadas.get(k, 0.0))
        cant_ant = _sf(cant_acum_anterior.get(k, 0.0))
        cant_acum = cant_ant + cant_pres
        cant_saldo = cant_act - cant_acum

        base["cantidad"] = cant_pres
        base["costo_directo"] = valor_por_cantidad_vu(cant_pres, vu)
        base["cant_actualizadas"] = cant_act
        base["valor_actualizadas"] = valor_por_cantidad_vu(cant_act, vu)
        base["cant_presente"] = cant_pres
        base["valor_presente"] = base["costo_directo"]
        base["cant_acum_anterior"] = cant_ant
        base["cant_acumulado"] = cant_acum
        base["valor_acumulado"] = valor_por_cantidad_vu(cant_acum, vu)
        base["cant_saldo"] = cant_saldo
        base["valor_saldo"] = valor_por_cantidad_vu(cant_saldo, vu)
        out.append(base)
    return out


def filtrar_items_con_cantidades(items: Optional[Iterable[dict]]) -> List[dict]:
    """
    Incluye todo ítem con cantidad en Actualizadas, Presente acta o Acumulado.
    Solo excluye filas sin cantidad en ninguno de esos bloques.
    """
    out: List[dict] = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        cant_p = _sf(it.get("cant_presente"), _sf(it.get("cantidad")))
        cant_a = _sf(it.get("cant_acumulado"))
        cant_act = _sf(it.get("cant_actualizadas"))
        if cant_p > 0 or cant_a > 0 or cant_act > 0:
            out.append(it)
    return out


# ── Persistencia / consultas (Supabase) ──────────────────────────────────────

def _table_ok(sb, name: str) -> bool:
    try:
        sb.table(name).select("id").limit(1).execute()
        return True
    except Exception:
        return False


def fetch_conciliacion(sb, corte_id: int) -> Optional[dict]:
    try:
        rows = (
            sb.table("corte_sub_conciliacion")
            .select("*")
            .eq("corte_id", int(corte_id))
            .limit(1)
            .execute()
            .data
        ) or []
        return dict(rows[0]) if rows else None
    except Exception as exc:
        _log.warning("fetch_conciliacion: %s", exc)
        return None


def fetch_otros_conceptos(sb, conciliacion_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("corte_sub_otros_conceptos")
            .select("*")
            .eq("conciliacion_id", int(conciliacion_id))
            .order("orden")
            .execute()
            .data
        ) or []
        return [dict(r) for r in rows]
    except Exception as exc:
        _log.warning("fetch_otros_conceptos: %s", exc)
        return []


def cortes_enviados_anteriores(
    sb,
    *,
    subcontratista_id: int,
    consecutivo_actual: int,
) -> List[dict]:
    """
    Cortes del mismo sub con conciliación enviada y consecutivo < actual.
    Garantiza aislamiento: nunca mezcla otros subcontratistas ni borradores.
    """
    try:
        conc_rows = (
            sb.table("corte_sub_conciliacion")
            .select("corte_id, estado, subcontratista_id")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_ENVIADO)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("cortes_enviados_anteriores conc: %s", exc)
        return []

    enviados = {
        int(r["corte_id"])
        for r in conc_rows
        if r.get("corte_id") is not None
        and int(r.get("subcontratista_id") or 0) == int(subcontratista_id)
        and str(r.get("estado") or "") == ESTADO_ENVIADO
    }
    if not enviados:
        return []

    try:
        cortes = (
            sb.table("subcontratista_cortes")
            .select("id, subcontratista_id, consecutivo, fecha_inicio, fecha_fin")
            .eq("subcontratista_id", int(subcontratista_id))
            .in_("id", list(enviados))
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("cortes_enviados_anteriores cortes: %s", exc)
        return []

    out = []
    for c in cortes:
        if int(c.get("subcontratista_id") or 0) != int(subcontratista_id):
            continue
        try:
            cons = int(c.get("consecutivo") or 0)
        except (TypeError, ValueError):
            continue
        if cons < int(consecutivo_actual):
            out.append(dict(c))
    out.sort(key=lambda c: int(c.get("consecutivo") or 0))
    return out


def cantidades_por_item_cortes(
    sb,
    *,
    contrato_id: int,
    subcontratista_id: int,
    corte_ids: List[int],
    solo_aprobados: bool = True,
) -> Dict[str, float]:
    """
    Suma cantidad_total por ítem solo de los corte_ids dados (mismo contrato/sub implícito).

    Filtra a nivel de registro (``sub_estado=Aprobado`` si aplica) y suma los
    ``cantidad_total`` ya redondeados en origen — sin re-redondear el agregado.
    """
    if not corte_ids:
        return {}
    acc: Dict[str, float] = {}
    idset = {int(x) for x in corte_ids}
    rows: List[dict] = []
    try:
        offset = 0
        while True:
            q = (
                sb.table("so_registros")
                .select("item_numero, cantidad_total, corte_id, subcontratista_id")
                .eq("contrato_id", int(contrato_id))
                .in_("corte_id", [int(x) for x in corte_ids])
                .order("id")
                .range(offset, offset + 999)
            )
            if solo_aprobados:
                q = q.eq("sub_estado", "Aprobado")
            batch = q.execute().data or []
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception:
        try:
            offset = 0
            rows = []
            while True:
                q = (
                    sb.table("so_registros")
                    .select("item_numero, cantidad_total, corte_id")
                    .eq("contrato_id", int(contrato_id))
                    .in_("corte_id", [int(x) for x in corte_ids])
                    .order("id")
                    .range(offset, offset + 999)
                )
                if solo_aprobados:
                    q = q.eq("sub_estado", "Aprobado")
                batch = q.execute().data or []
                rows.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
        except Exception as exc:
            _log.warning("cantidades_por_item_cortes: %s", exc)
            return {}

    for r in rows:
        # Defensa extra: si la fila trae subcontratista_id, debe coincidir.
        sid = r.get("subcontratista_id")
        if sid is not None and int(sid) != int(subcontratista_id):
            continue
        if int(r.get("corte_id") or 0) not in idset:
            continue
        k = item_key(r.get("item_numero"))
        acc[k] = acc.get(k, 0.0) + _sf(r.get("cantidad_total"))
    return acc


def cantidades_actualizadas_sub(sb, *, contrato_id: int, subcontratista_id: int) -> Dict[str, float]:
    """
    Cantidades cargadas para el sub en panel administrativo:
    Presupuesto asignado + filas manuales de subcontratista_precios.
    """
    from subcontratistas_items_cobro import (
        aggregate_presupuesto_cant_map,
        build_precios_sheet,
    )

    ppto_rows: List[dict] = []
    try:
        offset = 0
        while True:
            batch = (
                sb.table("presupuesto")
                .select("capitulo, competencia, item, cant_total")
                .eq("contrato_id", int(contrato_id))
                .eq("subcontratista_id", int(subcontratista_id))
                .eq("tipo_ejecucion", "Presupuesto de Obra")
                .eq("dado_de_baja", False)
                .order("id")
                .range(offset, offset + 999)
                .execute()
                .data
            )
            ppto_rows.extend(batch or [])
            if len(batch or []) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("cantidades_actualizadas_sub ppto: %s", exc)
        ppto_rows = []

    cant_map = aggregate_presupuesto_cant_map(ppto_rows)

    listado: List[dict] = []
    try:
        offset = 0
        while True:
            batch = (
                sb.table("listado_precios")
                .select("id, capitulo, competencia, item_numero, descripcion, unidad, precio_unitario")
                .eq("contrato_id", int(contrato_id))
                .order("item_numero")
                .range(offset, offset + 999)
                .execute()
                .data
            )
            listado.extend(batch or [])
            if len(batch or []) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("cantidades_actualizadas_sub listado: %s", exc)
        return {}

    try:
        precios_rows = (
            sb.table("subcontratista_precios")
            .select("id, listado_precio_id, precio_unitario_sub, origen, cantidad_manual")
            .eq("subcontratista_id", int(subcontratista_id))
            .execute()
            .data
        ) or []
    except Exception:
        precios_rows = []

    sheet = build_precios_sheet(listado, cant_map, precios_rows)
    acc: Dict[str, float] = {}
    for row in sheet:
        k = item_key(row.get("item_numero"))
        acc[k] = acc.get(k, 0.0) + _sf(row.get("cantidad"))
    return acc


def resolve_tributos_sub(sb, subcontratista_id: int) -> dict:
    from subcontratistas_items_cobro import resolve_tributos_subcontratista

    tributos_sub = {}
    try:
        row = (
            sb.table("subcontratistas")
            .select("tributos")
            .eq("id", int(subcontratista_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if row:
            tributos_sub = row[0].get("tributos") or {}
    except Exception:
        tributos_sub = {}

    precios_rows: List[dict] = []
    try:
        precios_rows = (
            sb.table("subcontratista_precios")
            .select("tributos")
            .eq("subcontratista_id", int(subcontratista_id))
            .execute()
            .data
        ) or []
    except Exception:
        precios_rows = []
    return resolve_tributos_subcontratista(tributos_sub, precios_rows)


def upsert_catalogo_descripcion(sb, contrato_id: int, descripcion: str) -> None:
    desc = str(descripcion or "").strip()
    if not desc:
        return
    try:
        existing = (
            sb.table("corte_sub_conceptos_catalogo")
            .select("id")
            .eq("contrato_id", int(contrato_id))
            .eq("descripcion", desc)
            .limit(1)
            .execute()
            .data
        ) or []
        if existing:
            return
        sb.table("corte_sub_conceptos_catalogo").insert({
            "contrato_id": int(contrato_id),
            "descripcion": desc[:500],
        }).execute()
    except Exception as exc:
        _log.warning("upsert_catalogo_descripcion: %s", exc)


def list_catalogo_descripciones(sb, contrato_id: int, q: str = "") -> List[str]:
    try:
        rows = (
            sb.table("corte_sub_conceptos_catalogo")
            .select("descripcion")
            .eq("contrato_id", int(contrato_id))
            .order("descripcion")
            .limit(200)
            .execute()
            .data
        ) or []
    except Exception:
        return []
    qq = str(q or "").strip().lower()
    out = []
    for r in rows:
        d = str(r.get("descripcion") or "").strip()
        if not d:
            continue
        if qq and qq not in d.lower():
            continue
        out.append(d)
    return out


def pct_label(pct: Any) -> str:
    if pct is None:
        return "—"
    try:
        x = float(pct)
        if abs(x - int(x)) < 1e-9:
            return f"{int(x)}%"
        return f"{x:g}%"
    except (TypeError, ValueError):
        return "—"


def aiu_lineas_resumen(aiu: dict) -> List[Dict[str, Any]]:
    """Líneas del resumen de conciliación en orden requerido (hasta CD+AIU)."""
    return [
        {"key": "cd", "nombre": "Costo Directo", "abrev": "CD", "pct": None, "valor": aiu.get("costo_directo")},
        {
            "key": "a",
            "nombre": "Administración",
            "abrev": "A",
            "pct": aiu.get("pct_administracion"),
            "valor": aiu.get("valor_administracion"),
        },
        {
            "key": "i",
            "nombre": "Imprevistos",
            "abrev": "I",
            "pct": aiu.get("pct_imprevistos"),
            "valor": aiu.get("valor_imprevistos"),
        },
        {
            "key": "u",
            "nombre": "Utilidad",
            "abrev": "U",
            "pct": aiu.get("pct_utilidad"),
            "valor": aiu.get("valor_utilidad"),
        },
        {
            "key": "iva",
            "nombre": "IVA sobre la Utilidad",
            "abrev": "IVA",
            "pct": aiu.get("pct_iva_utilidad"),
            "valor": aiu.get("valor_iva_utilidad"),
        },
        {
            "key": "cd_aiu",
            "nombre": "Costo Directo + AIU",
            "abrev": "CD+AIU",
            "pct": None,
            "valor": aiu.get("costo_directo_mas_aiu"),
        },
    ]


def calc_amortizacion(
    costo_directo_mas_aiu: float,
    *,
    anticipo: Any = None,
    amortizacion_pct: Any = None,
    amortizado_anterior: Any = None,
) -> Dict[str, Any]:
    """
    Amortización del anticipo sobre CD+AIU, con tope por saldo pendiente.

    - Si no hay anticipo: todo en 0 y no afecta el subtotal.
    - Si el % supera el saldo: se amortiza solo el saldo (nunca más del anticipo).
    - Si saldo ya es 0: amortización presente = 0.
    """
    cd_aiu = _round0(costo_directo_mas_aiu)
    ant = _round0(anticipo)
    pct = _pct(amortizacion_pct)
    amort_ant = _round0(amortizado_anterior)
    if ant <= 0:
        return {
            "anticipo_entregado": 0.0,
            "amortizado_anterior": 0.0,
            "pct_amortizacion": pct,
            "amortizacion_presente": 0.0,
            "saldo_por_amortizar": 0.0,
            "subtotal_despues_amortizacion": cd_aiu,
            "tope_por_saldo": False,
        }
    saldo_pend = max(0.0, ant - amort_ant)
    if saldo_pend <= 0:
        return {
            "anticipo_entregado": ant,
            "amortizado_anterior": amort_ant,
            "pct_amortizacion": pct,
            "amortizacion_presente": 0.0,
            "saldo_por_amortizar": 0.0,
            "subtotal_despues_amortizacion": cd_aiu,
            "tope_por_saldo": False,
        }
    bruto = _round0(cd_aiu * ((pct or 0.0) / 100.0)) if pct is not None else 0.0
    tope = bruto > saldo_pend
    presente = min(bruto, saldo_pend)
    saldo = _round0(saldo_pend - presente)
    return {
        "anticipo_entregado": ant,
        "amortizado_anterior": amort_ant,
        "pct_amortizacion": pct,
        "amortizacion_presente": presente,
        "saldo_por_amortizar": saldo,
        "subtotal_despues_amortizacion": _round0(cd_aiu - presente),
        "tope_por_saldo": tope,
    }


def amortizacion_lineas_resumen(amort: Optional[dict]) -> List[Dict[str, Any]]:
    """Líneas tras CD+AIU: anticipo, amortizado anterior, presente, saldo, subtotal."""
    a = amort or {}
    pct = a.get("pct_amortizacion")
    return [
        {
            "key": "anticipo",
            "nombre": "Anticipo entregado",
            "abrev": "ANT",
            "pct": None,
            "valor": a.get("anticipo_entregado"),
        },
        {
            "key": "amort_ant",
            "nombre": "Amortizado en cortes anteriores",
            "abrev": "AM-ANT",
            "pct": None,
            "valor": a.get("amortizado_anterior"),
        },
        {
            "key": "amort_pres",
            "nombre": "Amortización del anticipo",
            "abrev": "AM",
            "pct": pct,
            "valor": a.get("amortizacion_presente"),
            "tope_por_saldo": bool(a.get("tope_por_saldo")),
        },
        {
            "key": "saldo_amort",
            "nombre": "Saldo por amortizar",
            "abrev": "SALDO",
            "pct": None,
            "valor": a.get("saldo_por_amortizar"),
        },
        {
            "key": "sub_amort",
            "nombre": "Subtotal después de amortización",
            "abrev": "SUB-AM",
            "pct": None,
            "valor": a.get("subtotal_despues_amortizacion"),
        },
    ]


def gran_total_con_amortizacion(subtotal_despues_amortizacion: float, total_otros: float) -> float:
    return _round0(_sf(subtotal_despues_amortizacion) + _sf(total_otros))


def sum_valores_bloques_items(items: Optional[Iterable[dict]]) -> Dict[str, float]:
    """Suma valor_actualizadas / presente / acumulado / saldo de los ítems del cuadro."""
    act = pres = acum = saldo = 0.0
    for it in items or []:
        if not isinstance(it, dict):
            continue
        act += _sf(it.get("valor_actualizadas"))
        pres += _sf(it.get("valor_presente"), it.get("costo_directo"))
        acum += _sf(it.get("valor_acumulado"))
        saldo += _sf(it.get("valor_saldo"))
    return {
        "actualizadas": _round0(act),
        "presente": _round0(pres),
        "acumulado": _round0(acum),
        "saldo": _round0(saldo),
    }


def _cols4(act: Any, pres: Any, acum: Any, saldo: Any) -> Dict[str, Optional[float]]:
    def _opt(v: Any) -> Optional[float]:
        if v is None:
            return None
        return _round0(v)

    return {
        "actualizadas": _opt(act),
        "presente": _opt(pres),
        "acumulado": _opt(acum),
        "saldo": _opt(saldo),
    }


def fetch_aiu_otros_anteriores_enviados(
    sb,
    *,
    subcontratista_id: int,
    consecutivo_actual: int,
) -> Dict[str, float]:
    """
    Suma de CD/AIU/otros de conciliaciones enviadas del mismo sub con consecutivo < actual.
    Aislamiento crítico: solo enviados del mismo subcontratista_id.
    """
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
    previos = cortes_enviados_anteriores(
        sb, subcontratista_id=subcontratista_id, consecutivo_actual=consecutivo_actual
    )
    if not previos:
        return vacio
    ids = [int(c["id"]) for c in previos if c.get("id") is not None]
    if not ids:
        return vacio
    try:
        rows = (
            sb.table("corte_sub_conciliacion")
            .select(
                "corte_id, subcontratista_id, estado, costo_directo, valor_administracion, "
                "valor_imprevistos, valor_utilidad, valor_iva_utilidad, costo_directo_mas_aiu, "
                "total_otros_conceptos, amortizacion_presente"
            )
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_ENVIADO)
            .in_("corte_id", ids)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("fetch_aiu_otros_anteriores_enviados: %s", exc)
        return vacio
    idset = set(ids)
    out = dict(vacio)
    for r in rows:
        if int(r.get("corte_id") or 0) not in idset:
            continue
        if int(r.get("subcontratista_id") or 0) != int(subcontratista_id):
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
        out["total_otros"] = _round0(out["total_otros"] + _sf(r.get("total_otros_conceptos")))
    return out


def build_resumen_conciliacion_4cols(
    *,
    items: Optional[Iterable[dict]] = None,
    tributos: Any = None,
    anticipo: Any = None,
    amortizacion_pct: Any = None,
    amortizado_anterior: Any = None,
    otros_presente: Any = None,
    aiu_otros_anterior: Optional[Dict[str, Any]] = None,
    aiu_presente_override: Optional[Dict[str, Any]] = None,
    amort_presente_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Resumen de conciliación en 4 columnas: Actualizadas | Presente | Acumulado | Saldo.

    Fuente única para PDF, Excel y popup. Reglas:
    - CD: suma de valores de ítems por bloque.
    - A/I/U/IVA: % sobre CD de Actualizadas y Presente; Acumulado = ant(enviados) + presente;
      Saldo = Actualizadas − Acumulado.
    - Anticipo/amortización: Act=anticipo; Pres=amort presente (tope); Acum=ant+pres; Saldo=ant−acum.
    - Otros: solo Presente y Acumulado (ant+pres); Actualizadas/Saldo vacíos.
    """
    cds = sum_valores_bloques_items(items)
    cd_act = cds["actualizadas"]
    cd_pres = cds["presente"]
    cd_acum_items = cds["acumulado"]
    # Saldo CD = Actualizadas − Acumulado (alineado a la regla del resumen)
    cd_saldo = _round0(cd_act - cd_acum_items)

    aiu_act = calc_aiu_desglose(cd_act, tributos)
    aiu_pres = calc_aiu_desglose(cd_pres, tributos)
    if aiu_presente_override:
        # Snapshot enviado: respeta CD/AIU persistidos del presente
        merged = dict(aiu_pres)
        for k, v in aiu_presente_override.items():
            if v is not None:
                merged[k] = v
        aiu_pres = merged

    ant = aiu_otros_anterior or {}
    aiu_ant = {
        "costo_directo": _round0(ant.get("costo_directo")),
        "valor_administracion": _round0(ant.get("valor_administracion")),
        "valor_imprevistos": _round0(ant.get("valor_imprevistos")),
        "valor_utilidad": _round0(ant.get("valor_utilidad")),
        "valor_iva_utilidad": _round0(ant.get("valor_iva_utilidad")),
        "costo_directo_mas_aiu": _round0(ant.get("costo_directo_mas_aiu")),
    }
    # Si no hay snapshot anterior, Acumulado CD de ítems − presente da el CD anterior implícito
    if aiu_ant["costo_directo"] == 0.0 and cd_acum_items > cd_pres:
        aiu_ant = calc_aiu_desglose(_round0(cd_acum_items - cd_pres), tributos)

    def _acum(key: str) -> float:
        return _round0(_sf(aiu_ant.get(key)) + _sf(aiu_pres.get(key)))

    def _saldo_aiu(key: str) -> float:
        return _round0(_sf(aiu_act.get(key)) - _acum(key))

    # Amortización presente sobre CD+AIU presente (con tope)
    amort_live = calc_amortizacion(
        aiu_pres.get("costo_directo_mas_aiu") or 0,
        anticipo=anticipo,
        amortizacion_pct=amortizacion_pct,
        amortizado_anterior=amortizado_anterior if amortizado_anterior is not None else ant.get("amortizacion_presente"),
    )
    if amort_presente_override:
        amort_live = {**amort_live, **{k: v for k, v in amort_presente_override.items() if v is not None}}

    anticipo_val = _round0(amort_live.get("anticipo_entregado"))
    amort_pres = _round0(amort_live.get("amortizacion_presente"))
    amort_ant = _round0(amort_live.get("amortizado_anterior"))
    amort_acum = _round0(amort_ant + amort_pres)
    amort_saldo = _round0(anticipo_val - amort_acum)  # = saldo_por_amortizar

    tot_otros_pres = _round0(otros_presente)
    tot_otros_ant = _round0(ant.get("total_otros"))
    tot_otros_acum = _round0(tot_otros_ant + tot_otros_pres)

    cd_aiu_act = _round0(aiu_act.get("costo_directo_mas_aiu"))
    cd_aiu_pres = _round0(aiu_pres.get("costo_directo_mas_aiu"))
    cd_aiu_acum = _acum("costo_directo_mas_aiu")
    cd_aiu_saldo = _round0(cd_aiu_act - cd_aiu_acum)

    # Subtotal después de amortización por columna
    # Act: CD+AIU − anticipo (valor total a amortizar en esa columna)
    # Pres: CD+AIU − amort presente
    # Acum: CD+AIU acum − amort acum
    # Saldo: Act − Acum del subtotal (o CD+AIU saldo − amort saldo)
    sub_act = _round0(cd_aiu_act - anticipo_val)
    sub_pres = _round0(cd_aiu_pres - amort_pres)
    sub_acum = _round0(cd_aiu_acum - amort_acum)
    sub_saldo = _round0(sub_act - sub_acum)

    gt_act = sub_act  # sin otros en Actualizadas
    gt_pres = _round0(sub_pres + tot_otros_pres)
    gt_acum = _round0(sub_acum + tot_otros_acum)
    gt_saldo = sub_saldo  # otros no aplican en Saldo

    pct_a = aiu_pres.get("pct_administracion", aiu_act.get("pct_administracion"))
    pct_i = aiu_pres.get("pct_imprevistos", aiu_act.get("pct_imprevistos"))
    pct_u = aiu_pres.get("pct_utilidad", aiu_act.get("pct_utilidad"))
    pct_iva = aiu_pres.get("pct_iva_utilidad", aiu_act.get("pct_iva_utilidad"))
    pct_am = amort_live.get("pct_amortizacion")

    lineas: List[Dict[str, Any]] = [
        {
            "key": "cd",
            "nombre": "Costo Directo",
            "abrev": "CD",
            "pct": None,
            "valores": _cols4(cd_act, cd_pres, cd_acum_items, cd_saldo),
            "strong": False,
        },
        {
            "key": "a",
            "nombre": "Administración",
            "abrev": "A",
            "pct": pct_a,
            "valores": _cols4(
                aiu_act.get("valor_administracion"),
                aiu_pres.get("valor_administracion"),
                _acum("valor_administracion"),
                _saldo_aiu("valor_administracion"),
            ),
            "strong": False,
        },
        {
            "key": "i",
            "nombre": "Imprevistos",
            "abrev": "I",
            "pct": pct_i,
            "valores": _cols4(
                aiu_act.get("valor_imprevistos"),
                aiu_pres.get("valor_imprevistos"),
                _acum("valor_imprevistos"),
                _saldo_aiu("valor_imprevistos"),
            ),
            "strong": False,
        },
        {
            "key": "u",
            "nombre": "Utilidad",
            "abrev": "U",
            "pct": pct_u,
            "valores": _cols4(
                aiu_act.get("valor_utilidad"),
                aiu_pres.get("valor_utilidad"),
                _acum("valor_utilidad"),
                _saldo_aiu("valor_utilidad"),
            ),
            "strong": False,
        },
        {
            "key": "iva",
            "nombre": "IVA sobre la Utilidad",
            "abrev": "IVA",
            "pct": pct_iva,
            "valores": _cols4(
                aiu_act.get("valor_iva_utilidad"),
                aiu_pres.get("valor_iva_utilidad"),
                _acum("valor_iva_utilidad"),
                _saldo_aiu("valor_iva_utilidad"),
            ),
            "strong": False,
        },
        {
            "key": "cd_aiu",
            "nombre": "Costo Directo + AIU",
            "abrev": "CD+AIU",
            "pct": None,
            "valores": _cols4(cd_aiu_act, cd_aiu_pres, cd_aiu_acum, cd_aiu_saldo),
            "strong": True,
        },
        {
            "key": "amort",
            "nombre": "Amortización del anticipo",
            "abrev": "AM",
            "pct": pct_am,
            "tope_por_saldo": bool(amort_live.get("tope_por_saldo")),
            "valores": _cols4(anticipo_val, amort_pres, amort_acum, amort_saldo),
            "strong": False,
            "hint": "Actualizadas=anticipo; Presente=amort. corte; Acumulado=ant+pres; Saldo=anticipo−acum",
        },
        {
            "key": "sub_amort",
            "nombre": "Subtotal después de amortización",
            "abrev": "SUB-AM",
            "pct": None,
            "valores": _cols4(sub_act, sub_pres, sub_acum, sub_saldo),
            "strong": True,
        },
        {
            "key": "otros",
            "nombre": "Otros conceptos",
            "abrev": "OTR",
            "pct": None,
            "valores": _cols4(None, tot_otros_pres, tot_otros_acum, None),
            "strong": False,
        },
        {
            "key": "gran_total",
            "nombre": "Gran total",
            "abrev": "GT",
            "pct": None,
            "valores": _cols4(gt_act, gt_pres, gt_acum, gt_saldo),
            "strong": True,
        },
    ]

    for ln in lineas:
        ln["label"] = label_linea_resumen_4cols(ln)

    return {
        "lineas": lineas,
        "cd_bloques": cds,
        "aiu_actualizadas": aiu_act,
        "aiu_presente": aiu_pres,
        "aiu_anterior": aiu_ant,
        "amortizacion": amort_live,
        "total_otros_presente": tot_otros_pres,
        "total_otros_anterior": tot_otros_ant,
        "total_otros_acumulado": tot_otros_acum,
        "gran_total_presente": gt_pres,
    }


def label_linea_resumen_4cols(line: dict) -> str:
    """Etiqueta visible de una línea del resumen 4 columnas.

    AIU: «Nombre Abrev (X%)». Amortización: «Amortización del anticipo (X%)»
    y, si el presente se topó por saldo pendiente, «(X% · por saldo)».
    """
    key = line.get("key")
    pct = pct_label(line.get("pct")) if line.get("pct") is not None else ""
    if key == "cd":
        return "Costo Directo"
    if key == "cd_aiu":
        return "Costo Directo + AIU"
    if key == "amort":
        tope = bool(line.get("tope_por_saldo"))
        if pct and pct != "—":
            if tope:
                return f"Amortización del anticipo ({pct} · por saldo)"
            return f"Amortización del anticipo ({pct})"
        if tope:
            return "Amortización del anticipo (por saldo)"
        return "Amortización del anticipo"
    if key == "sub_amort":
        return "Subtotal después de amortización"
    if key == "otros":
        return "Otros conceptos"
    if key == "gran_total":
        return "Gran total"
    nombre = str(line.get("nombre") or "")
    abrev = str(line.get("abrev") or "")
    if pct and pct != "—":
        return f"{nombre} {abrev} ({pct})".strip()
    return f"{nombre} {abrev}".strip()


def sanitize_filename(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", (name or "soporte").strip())[:120]


def precios_vu_sub_por_item(sb, *, contrato_id: int, subcontratista_id: int) -> Dict[str, float]:
    """
    Mapa item_numero → precio_unitario_sub del listado del subcontratista.
    Fuente: subcontratista_precios (+ listado_precios), nunca precios del contrato principal.
    """
    out: Dict[str, float] = {}
    rows: List[dict] = []
    selects = (
        "listado_precio_id, precio_unitario_sub, listado_precios(item_numero)",
        "listado_precio_id, precio_unitario_sub",
    )
    for sel in selects:
        try:
            rows = (
                sb.table("subcontratista_precios")
                .select(sel)
                .eq("subcontratista_id", int(subcontratista_id))
                .execute()
                .data
            ) or []
            break
        except Exception as exc:
            _log.debug("precios_vu_sub_por_item select falló (%s): %s", sel[:40], exc)
            rows = []
    if not rows:
        return out

    # Si no vino el join, resolver item_numero vía listado_precios del contrato.
    need_lp: List[int] = []
    for r in rows:
        lp = r.get("listado_precios")
        if isinstance(lp, list):
            lp = lp[0] if lp else {}
        if not isinstance(lp, dict) or not str(lp.get("item_numero") or "").strip():
            try:
                need_lp.append(int(r.get("listado_precio_id")))
            except (TypeError, ValueError):
                pass
    lp_map: Dict[int, str] = {}
    if need_lp:
        try:
            uniq = list({int(x) for x in need_lp})
            # PostgREST in_ limitado: por lotes
            for i in range(0, len(uniq), 200):
                batch = uniq[i : i + 200]
                lrows = (
                    sb.table("listado_precios")
                    .select("id, item_numero")
                    .eq("contrato_id", int(contrato_id))
                    .in_("id", batch)
                    .execute()
                    .data
                ) or []
                for lr in lrows:
                    try:
                        lp_map[int(lr["id"])] = str(lr.get("item_numero") or "").strip()
                    except (TypeError, ValueError, KeyError):
                        continue
        except Exception as exc:
            _log.warning("precios_vu_sub_por_item listado: %s", exc)

    for r in rows:
        vu = _sf(r.get("precio_unitario_sub"))
        if vu <= 0:
            continue
        item_n = ""
        lp = r.get("listado_precios")
        if isinstance(lp, list):
            lp = lp[0] if lp else {}
        if isinstance(lp, dict):
            item_n = str(lp.get("item_numero") or "").strip()
        if not item_n:
            try:
                item_n = lp_map.get(int(r.get("listado_precio_id")), "") or ""
            except (TypeError, ValueError):
                item_n = ""
        if not item_n:
            continue
        k = item_key(item_n)
        # Si hay varios (p. ej. competencias), conserva el primero > 0; no promedia.
        if k not in out:
            out[k] = vu
    return out


def aplicar_precios_sub_a_items(
    items: List[dict],
    vu_por_item: Dict[str, float],
) -> Tuple[List[dict], List[str]]:
    """
    Sobrescribe vlr_unitario_sub con el pactado del sub cuando existe.
    Marca sin_precio=True si el ítem del corte no tiene VU en el listado del sub.
    Recalcula costo_directo = cant × VU (0 dp).
    """
    sin_precio: List[str] = []
    out: List[dict] = []
    for it in items or []:
        row = dict(it)
        k = item_key(row.get("item_numero"))
        stamped = _sf(row.get("vlr_unitario_sub"))
        pactado = _sf(vu_por_item.get(k)) if k in (vu_por_item or {}) else 0.0
        if pactado > 0:
            vu = pactado
            row["precio_fuente"] = "subcontratista_precios"
        elif stamped > 0:
            vu = stamped
            row["precio_fuente"] = "stamp_registro"
        else:
            vu = 0.0
            row["precio_fuente"] = None
            row["sin_precio"] = True
            if k and k != "SIN_ITEM":
                sin_precio.append(str(row.get("item_numero") or k))
        row["vlr_unitario_sub"] = vu
        row["sin_precio"] = bool(row.get("sin_precio")) or vu <= 0
        if vu <= 0 and k and k != "SIN_ITEM" and str(row.get("item_numero") or k) not in sin_precio:
            sin_precio.append(str(row.get("item_numero") or k))
        row["costo_directo"] = valor_por_cantidad_vu(row.get("cantidad"), vu)
        out.append(row)
    return out, sin_precio


def amortizado_en_cortes_enviados_anteriores(
    sb,
    *,
    subcontratista_id: int,
    consecutivo_actual: int,
) -> float:
    """
    Suma amortizacion_presente de conciliaciones enviadas del mismo sub con consecutivo < actual.
    Reabrir (estado→borrador) saca ese corte del histórico hasta reenviar.
    """
    previos = cortes_enviados_anteriores(
        sb, subcontratista_id=subcontratista_id, consecutivo_actual=consecutivo_actual
    )
    if not previos:
        return 0.0
    ids = [int(c["id"]) for c in previos if c.get("id") is not None]
    try:
        rows = (
            sb.table("corte_sub_conciliacion")
            .select("corte_id, amortizacion_presente, estado, subcontratista_id")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_ENVIADO)
            .in_("corte_id", ids)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("amortizado_en_cortes_enviados_anteriores: %s", exc)
        return 0.0
    total = 0.0
    idset = set(ids)
    for r in rows:
        if int(r.get("corte_id") or 0) not in idset:
            continue
        if int(r.get("subcontratista_id") or 0) != int(subcontratista_id):
            continue
        total += _sf(r.get("amortizacion_presente"))
    return _round0(total)


def fetch_anticipo_amortizacion_sub(sb, subcontratista_id: int) -> Dict[str, Any]:
    try:
        rows = (
            sb.table("subcontratistas")
            .select("anticipo, amortizacion_pct")
            .eq("id", int(subcontratista_id))
            .limit(1)
            .execute()
            .data
        ) or []
        if rows:
            return {
                "anticipo": _sf(rows[0].get("anticipo")),
                "amortizacion_pct": _pct(rows[0].get("amortizacion_pct")),
            }
    except Exception as exc:
        _log.warning("fetch_anticipo_amortizacion_sub: %s", exc)
    return {"anticipo": 0.0, "amortizacion_pct": None}
