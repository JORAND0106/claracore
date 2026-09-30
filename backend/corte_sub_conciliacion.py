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
    """Cantidad × VU del subcontratista, redondeado a 0 dp (nunca sumar valores almacenados)."""
    cant = _redondear_cant(cantidad)
    return _round0(cant * _sf(vlr_unitario))


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
    return _round0(_sf(costo_directo_mas_aiu) + _sf(total_otros))


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

        cant_pres = _redondear_cant(base.get("cantidad") or 0.0)
        cant_act = _redondear_cant(cant_actualizadas.get(k, 0.0))
        cant_ant = _redondear_cant(cant_acum_anterior.get(k, 0.0))
        cant_acum = _redondear_cant(cant_ant + cant_pres)
        cant_saldo = _redondear_cant(cant_act - cant_acum)

        base["cantidad"] = cant_pres
        base["costo_directo"] = valor_por_cantidad_vu(cant_pres, vu)
        base["cant_actualizadas"] = cant_act
        base["valor_actualizadas"] = valor_por_cantidad_vu(cant_act, vu)
        base["cant_presente"] = cant_pres
        base["valor_presente"] = base["costo_directo"]
        base["cant_acumulado"] = cant_acum
        base["valor_acumulado"] = valor_por_cantidad_vu(cant_acum, vu)
        base["cant_saldo"] = cant_saldo
        base["valor_saldo"] = valor_por_cantidad_vu(cant_saldo, vu)
        out.append(base)
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
    """Suma cantidad_total por ítem solo de los corte_ids dados (mismo contrato/sub implícito)."""
    if not corte_ids:
        return {}
    acc: Dict[str, float] = {}
    try:
        q = (
            sb.table("so_registros")
            .select("item_numero, cantidad_total, corte_id, subcontratista_id")
            .eq("contrato_id", int(contrato_id))
            .in_("corte_id", [int(x) for x in corte_ids])
        )
        if solo_aprobados:
            q = q.eq("sub_estado", "Aprobado")
        rows = q.execute().data or []
    except Exception:
        try:
            q = (
                sb.table("so_registros")
                .select("item_numero, cantidad_total, corte_id")
                .eq("contrato_id", int(contrato_id))
                .in_("corte_id", [int(x) for x in corte_ids])
            )
            if solo_aprobados:
                q = q.eq("sub_estado", "Aprobado")
            rows = q.execute().data or []
        except Exception as exc:
            _log.warning("cantidades_por_item_cortes: %s", exc)
            return {}

    for r in rows:
        # Defensa extra: si la fila trae subcontratista_id, debe coincidir.
        sid = r.get("subcontratista_id")
        if sid is not None and int(sid) != int(subcontratista_id):
            continue
        if int(r.get("corte_id") or 0) not in {int(x) for x in corte_ids}:
            continue
        k = item_key(r.get("item_numero"))
        acc[k] = acc.get(k, 0.0) + _sf(r.get("cantidad_total"))
    return {k: _redondear_cant(v) for k, v in acc.items()}


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
    return {k: _redondear_cant(v) for k, v in acc.items()}


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
) -> dict:
    """Crea/actualiza conciliación y reemplaza filas de otros conceptos."""
    now = datetime.now(timezone.utc).isoformat()
    otros_n = normalizar_otros_conceptos(otros)
    tot_otros = total_otros_conceptos(otros_n)
    gt = gran_total(aiu.get("costo_directo_mas_aiu"), tot_otros)

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
    """Líneas del resumen de conciliación en orden requerido."""
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


def sanitize_filename(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", (name or "soporte").strip())[:120]
