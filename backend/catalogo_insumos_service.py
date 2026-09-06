"""
Catálogo de insumos — panel administrativo (CRUD, duplicados, historial, CSV, OCR).
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from almacen_insumos_service import (
    _impuesto_etiqueta,
    _insumo_label,
    _normalize_impuestos,
    _row_from_almacen_insumo,
    compute_costo_total_insumo,
    compute_valor_despues_aiu_iva,
    create_proveedor,
    get_contexto_negociado_insumo,
    get_insumo,
    normalize_tributos,
    search_proveedores,
    sync_proveedor_contacto,
    tributos_tienen_datos,
)
from almacen_service import _sb, _to_float, _upload_soporte

# Límite fijo de 200 KB eliminado: rige la cuota por contrato (+ tope técnico en pdf_prepare).

CSV_REQUIRED = ("codigo", "descripcion", "unidad", "costo_base")

CSV_COLUMN_ALIASES: Dict[str, List[str]] = {
    "codigo": ["codigo", "código", "code", "item", "item_numero", "numero item", "num item", "cod"],
    "descripcion": ["descripcion", "descripción", "desc", "nombre", "material", "detalle", "descripcion insumo"],
    "unidad": ["unidad", "und", "unit", "uom", "unidad medida"],
    "costo_base": [
        "costo_base", "costo base", "costo", "precio", "precio_unitario", "precio unitario",
        "valor", "valor unitario", "valor_compra", "valor compra", "precio compra",
        "costo (antes de aiu o iva)", "costo antes de aiu o iva",
        "costo (antes de aiu/iva)", "valor antes de aiu o iva",
        "valor (antes de aiu o iva)",
    ],
    "tipo_impuesto": ["tipo_impuesto", "tipo impuesto", "iva o aiu", "impuesto", "iva/aiu"],
    "impuesto_porcentaje": ["impuesto_porcentaje", "impuesto porcentaje", "iva_pct", "iva %", "porcentaje iva", "pct"],
    "aiu_a": ["a", "a.", "aiu_a", "administracion", "administración", "aiu administracion"],
    "aiu_i": ["i", "i.", "í", "í.", "aiu_i", "imprevistos", "aiu imprevistos"],
    "aiu_u": ["u", "u.", "aiu_u", "utilidad", "aiu utilidad"],
    # Columna unificada IVA; aliases incluyen nombres legacy de plantillas anteriores.
    "iva": [
        "iva", "iva_porcentaje", "iva porcentaje", "porcentaje_iva", "pct_iva",
        "aiu_iva_util", "iva_util", "iva/util", "iva/util.", "iva_utilidad", "iva utilidad",
    ],
    # Alias legacy (ignorado: el tipo se infiere de A/Í/U + IVA).
    "iva_sobre": [
        "iva_sobre", "iva sobre", "base_iva", "base iva", "aplica_iva_sobre",
        "sobre", "iva base",
    ],
    "cotizacion_numero": ["cotizacion_numero", "cotizacion numero", "numero cotizacion", "n cotizacion", "no cotizacion"],
    "cotizacion_fecha": ["cotizacion_fecha", "cotizacion fecha", "fecha cotizacion", "fecha"],
    "cotizacion_vigencia": ["cotizacion_vigencia", "cotizacion vigencia", "vigencia"],
    "proveedor": ["proveedor", "razon_social", "razon social", "nombre proveedor"],
    "nit": ["nit", "nit proveedor", "documento"],
    "contacto_email": ["contacto_email", "contacto email", "email", "correo", "correo contacto", "email contacto"],
    "contacto_nombre": ["contacto_nombre", "contacto nombre", "nombre comercial", "comercial", "nombre contacto"],
    "contacto_telefono": ["contacto_telefono", "contacto telefono", "telefono", "teléfono", "telefono contacto", "celular"],
    "rendimiento": ["rendimiento", "rend"],
    "requiere_cotizacion": ["requiere_cotizacion", "requiere cotizacion", "cotizacion requerida", "exige cotizacion"],
}

CSV_TEMPLATE = (
    "proveedor,nit,contacto_email,contacto_nombre,contacto_telefono,"
    "codigo,descripcion,unidad,rendimiento,"
    "\"Costo (Antes de AIU o IVA)\","
    "a,i,u,iva,"
    "requiere_cotizacion,cotizacion_numero,cotizacion_fecha,cotizacion_vigencia\n"
    "Proveedor Ejemplo SA,900123456-1,ventas@ejemplo.com,Juan Pérez,3001234567,"
    "CC-0000-001,Cemento gris 50 kg,UND,1.05,"
    "18500,"
    "0.05,0.03,0.05,0.19,"
    "false,COT-2026-001,2026-07-01,15 dias\n"
    "Proveedor Ejemplo SA,900123456-1,ventas@ejemplo.com,Juan Pérez,3001234567,"
    "CC-0000-002,Arena de río m3,M3,1,"
    "45000,"
    ",,,0.19,"
    "false,COT-2026-002,2026-07-01,15 dias\n"
)


def _csv_entrada_a_puntos_pct(raw: Any) -> Optional[float]:
    """Decimal (0.05) o puntos (5 / '5%') → puntos %. None si vacío/inválido."""
    if raw is None:
        return None
    s = str(raw).strip().replace("%", "").replace(",", ".")
    if not s:
        return None
    try:
        n = float(s)
    except (TypeError, ValueError):
        return None
    if n < 0:
        return None
    if n <= 1:
        return round(n * 100, 4)
    return round(n, 4)


def _csv_build_tributos(col_fn) -> Optional[dict]:
    """Arma tributos unificados (A|Í|U|IVA). El tipo se infiere automáticamente."""
    administracion = _csv_entrada_a_puntos_pct(col_fn("aiu_a"))
    imprevistos = _csv_entrada_a_puntos_pct(col_fn("aiu_i"))
    utilidad = _csv_entrada_a_puntos_pct(col_fn("aiu_u"))
    iva_pct = _csv_entrada_a_puntos_pct(col_fn("iva"))
    tiene_aiu = any(v is not None for v in (administracion, imprevistos, utilidad))
    tiene_iva = iva_pct is not None
    if not tiene_aiu and not tiene_iva:
        return None
    return normalize_tributos({
        "administracion": administracion,
        "imprevistos": imprevistos,
        "utilidad": utilidad,
        "iva": iva_pct,
    })



def contrato_codigo_segment(contrato_id: int) -> str:
    """Segmento numérico del contrato para codificación de insumos (ej. 1614 en ICCU-CTO-1614-2025)."""
    sb = _sb()
    rows = (
        sb.table("contratos")
        .select("numero")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    numero = (rows[0].get("numero") or "") if rows else ""
    parts = re.findall(r"\d+", numero)
    years = {str(y) for y in range(2020, 2036)}
    for part in parts:
        if part not in years and len(part) >= 3:
            return part
    return str(contrato_id)


def codigo_insumo_patron(segment: str) -> re.Pattern:
    return re.compile(rf"^CC-{re.escape(segment)}-(\d{{3,}})$", re.IGNORECASE)


def validar_codigo_insumo_contrato(codigo: str, contrato_id: int) -> str:
    seg = contrato_codigo_segment(contrato_id)
    cod = (codigo or "").strip().upper()
    if not cod:
        raise ValueError("El código del insumo es obligatorio.")
    if not codigo_insumo_patron(seg).match(cod):
        raise ValueError(
            f"El código debe tener formato CC-{seg}-NNN (ej. CC-{seg}-001) para este contrato."
        )
    return cod


def next_codigo_insumo(contrato_id: int) -> str:
    """Genera el siguiente código CC-{segmento_contrato}-NNN único dentro del contrato."""
    seg = contrato_codigo_segment(contrato_id)
    prefix = f"CC-{seg}-"
    sb = _sb()
    rows = (
        sb.table("almacen_insumo")
        .select("codigo")
        .eq("contrato_id", contrato_id)
        .ilike("codigo", f"{prefix}%")
        .execute()
        .data
        or []
    )
    pat = codigo_insumo_patron(seg)
    max_n = 0
    for row in rows:
        m = pat.match((row.get("codigo") or "").strip().upper())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{prefix}{max_n + 1:03d}"


def _resolve_codigo_insumo(body: dict, contrato_id: int, *, codigo_fijo: Optional[str] = None) -> str:
    if codigo_fijo:
        return str(codigo_fijo).strip().upper()
    codigo = (body.get("codigo") or "").strip()
    if not codigo:
        return next_codigo_insumo(contrato_id)
    return validar_codigo_insumo_contrato(codigo, contrato_id)


def _norm_csv_header(h: str) -> str:
    s = unicodedata.normalize("NFD", str(h or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower().strip())


def _resolve_csv_columns(
    fieldnames: List[str],
    aliases: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, str]:
    alias_map = aliases or CSV_COLUMN_ALIASES
    norm_to_orig = {_norm_csv_header(h): h for h in fieldnames if h}
    col_map: Dict[str, str] = {}
    for canonical, alist in alias_map.items():
        for alias in alist:
            key = _norm_csv_header(alias)
            if key in norm_to_orig:
                col_map[canonical] = norm_to_orig[key]
                break
    return col_map


def _csv_columns_error(col_map: Dict[str, str]) -> None:
    missing = [c for c in CSV_REQUIRED if c not in col_map]
    if not missing:
        return
    hints = {
        "codigo": "codigo / Código / item",
        "descripcion": "descripcion / Descripción / material",
        "unidad": "unidad / Und",
        "costo_base": "costo / Costo / costo_base / precio / valor",
    }
    raise ValueError(
        "El CSV no cumple el formato esperado.\n"
        f"Columnas obligatorias faltantes: {', '.join(hints.get(m, m) for m in missing)}.\n"
        "Columnas obligatorias: codigo, descripcion, unidad, costo / «Costo (Antes de AIU o IVA)».\n"
        "Opcionales: proveedor, nit, contacto_email, contacto_nombre, contacto_telefono, "
        "rendimiento, a / i / u / iva (decimal 0.05 = 5%; el tipo se infiere: "
        "solo IVA → IVA Pleno; A/Í/U + IVA → IVA sobre Utilidad). "
        "El valor después de AIU/IVA se calcula automáticamente al importar (no va en el CSV). "
        "tipo_impuesto / impuesto_porcentaje (legado), requiere_cotizacion (true/false), "
        "cotizacion_numero, cotizacion_fecha, cotizacion_vigencia.\n"
        "Los PDF de cotización no se importan por CSV; use el formulario para adjuntarlos.\n"
        "Use «Descargar plantilla CSV» en este módulo para ver el formato exacto."
    )


def get_csv_template() -> str:
    return CSV_TEMPLATE


def _norm_desc(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.lower().strip())
    return s


def normalize_cotizaciones_detalle(raw: Any) -> List[dict]:
    """Filas de cotización (insumo | no_previsto) para la hoja editable."""
    if raw is None or raw == "":
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
    if not isinstance(data, list):
        return []
    out: List[dict] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        tipo = (item.get("tipo") or "insumo").strip().lower()
        if tipo not in ("insumo", "no_previsto"):
            tipo = "insumo"
        proveedor = (item.get("proveedor") or "").strip() or None
        numero = (item.get("numero") or "").strip() or None
        vigencia = (item.get("vigencia") or "").strip() or None
        fecha = _parse_fecha(item.get("fecha")) if item.get("fecha") not in (None, "") else None
        valor = None
        if item.get("valor") not in (None, ""):
            valor = _to_float(item.get("valor"))
        es_ganadora = bool(item.get("es_ganadora")) and tipo == "insumo"
        impuesto_etiqueta = (item.get("impuesto_etiqueta") or "").strip() or None
        impuesto = item.get("impuesto")
        if not isinstance(impuesto, dict):
            impuesto = None
        else:
            # Conservar solo campos de form decimal (A/Í/U/IVA).
            cleaned = {}
            for key in ("administracion", "imprevistos", "utilidad", "iva"):
                raw_v = impuesto.get(key)
                if raw_v in (None, ""):
                    cleaned[key] = ""
                else:
                    cleaned[key] = str(raw_v)
            if not any(cleaned.get(k) not in (None, "", "0", "0.0") for k in cleaned):
                impuesto = None
            else:
                impuesto = cleaned
        row = {
            "id": str(item.get("id") or f"c-{i}"),
            "pair_id": str(item["pair_id"]) if item.get("pair_id") else None,
            "tipo": tipo,
            "es_ganadora": es_ganadora,
            "proveedor": proveedor,
            "valor": valor,
            "numero": numero,
            "fecha": fecha,
            "vigencia": vigencia,
            "impuesto_etiqueta": impuesto_etiqueta,
            "impuesto": impuesto,
            "pdf_nombre": (item.get("pdf_nombre") or "").strip() or None,
        }
        if not any(
            [
                es_ganadora,
                proveedor,
                numero,
                fecha,
                vigencia,
                valor is not None,
                impuesto_etiqueta,
                impuesto,
                row["pdf_nombre"],
            ]
        ):
            continue
        out.append(row)
    seen_ganadora = False
    for row in out:
        if row.get("es_ganadora"):
            if seen_ganadora:
                row["es_ganadora"] = False
            else:
                seen_ganadora = True
    return out


def cotizaciones_detalle_from_row(row: dict) -> List[dict]:
    """Detalle guardado o, si vacío, síntesis desde campos legados de ganadora."""
    detalle = normalize_cotizaciones_detalle(row.get("cotizaciones_detalle"))
    if detalle:
        return detalle
    if row.get("cotizacion_numero") or row.get("cotizacion_fecha") or row.get("cotizacion_vigencia"):
        return [
            {
                "id": "legacy-ganadora",
                "tipo": "insumo",
                "es_ganadora": True,
                "proveedor": None,
                "valor": _to_float(row.get("costo_base")) if row.get("costo_base") is not None else None,
                "numero": (row.get("cotizacion_numero") or "").strip() or None,
                "fecha": _parse_fecha(row.get("cotizacion_fecha")) if row.get("cotizacion_fecha") else None,
                "vigencia": (row.get("cotizacion_vigencia") or "").strip() or None,
            }
        ]
    return []


def _sync_legacy_cotizacion_from_detalle(payload: dict, detalle: List[dict]) -> None:
    gan = next((r for r in detalle if r.get("es_ganadora") and r.get("tipo") == "insumo"), None)
    if not gan:
        return
    if gan.get("numero"):
        payload["cotizacion_numero"] = gan["numero"]
    if gan.get("fecha"):
        payload["cotizacion_fecha"] = gan["fecha"]
    if gan.get("vigencia"):
        payload["cotizacion_vigencia"] = gan["vigencia"]


def get_almacen_config(contrato_id: int) -> dict:
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
        return {"cotizaciones_minimas": int(rows[0].get("cotizaciones_minimas") or 3)}
    return {"cotizaciones_minimas": 3}


def _snapshot_historial(
    row: dict,
    contrato_id: int,
    user_id: int,
    motivo: str = "actualizacion",
) -> None:
    sb = _sb()
    sb.table("almacen_insumo_precio_historial").insert({
        "insumo_id": row["id"],
        "contrato_id": contrato_id,
        "proveedor_id": row.get("proveedor_id"),
        "costo_base": row.get("costo_base"),
        "valor_compra_referencia": _to_float(row.get("valor_compra_referencia")),
        "tipo_impuesto": row.get("tipo_impuesto"),
        "impuesto_porcentaje": row.get("impuesto_porcentaje"),
        "impuestos": row.get("impuestos") or [],
        "tributos": normalize_tributos(row.get("tributos")),
        "cotizacion_numero": row.get("cotizacion_numero"),
        "cotizacion_fecha": row.get("cotizacion_fecha"),
        "cotizacion_vigencia": row.get("cotizacion_vigencia"),
        "motivo": motivo,
        "created_by": user_id,
    }).execute()


def list_catalogo_insumos(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[dict], int]:
    sb = _sb()
    q = (q or "").strip()
    query = (
        sb.table("almacen_insumo")
        .select("*", count="exact")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("codigo")
    )
    if q:
        query = query.or_(
            f"codigo.ilike.%{q}%,descripcion.ilike.%{q}%"
        )
    resp = query.range(offset, offset + limit - 1).execute()
    rows = resp.data or []
    total = resp.count if resp.count is not None else len(rows)

    prov_ids = {r.get("proveedor_id") for r in rows if r.get("proveedor_id")}
    prov_map: Dict[int, str] = {}
    if prov_ids:
        provs = (
            sb.table("almacen_proveedor")
            .select("id, razon_social, nit, contacto_email, contacto_nombre, contacto_telefono")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        )
        prov_map = {int(p["id"]): p for p in provs}

    out = []
    for row in rows:
        pid = row.get("proveedor_id")
        prov = prov_map.get(int(pid or 0), {})
        item = _row_from_almacen_insumo(row, prov.get("razon_social") or "—")
        item["proveedor_nit"] = prov.get("nit")
        item["contacto_email"] = prov.get("contacto_email")
        item["contacto_nombre"] = prov.get("contacto_nombre")
        item["contacto_telefono"] = prov.get("contacto_telefono")
        item["cotizacion_numero"] = row.get("cotizacion_numero")
        item["cotizacion_fecha"] = row.get("cotizacion_fecha")
        item["cotizacion_vigencia"] = row.get("cotizacion_vigencia")
        item["cotizaciones_detalle"] = cotizaciones_detalle_from_row(row)
        item["cantidad_negociada"] = row.get("cantidad_negociada")
        item["valor_negociado_total"] = row.get("valor_negociado_total")
        if row.get("cantidad_negociada") is not None and _to_float(row.get("cantidad_negociada")) > 0:
            ctx_neg = get_contexto_negociado_insumo(contrato_id, int(row["id"]), 0, None, 0)
            item["consumo_negociado"] = ctx_neg
        out.append(item)
    return out, total


def list_proveedores_catalogo(
    contrato_id: int,
    q: str = "",
    limit: int = 100,
    offset: int = 0,
) -> Tuple[List[dict], int]:
    sb = _sb()
    q = (q or "").strip()
    query = (
        sb.table("almacen_proveedor")
        .select("*", count="exact")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .order("razon_social")
    )
    if q:
        query = query.or_(f"razon_social.ilike.%{q}%,nit.ilike.%{q}%")
    resp = query.range(offset, offset + max(limit, 1) - 1).execute()
    rows = resp.data or []
    total = resp.count if resp.count is not None else len(rows)
    if rows:
        pids = [int(r["id"]) for r in rows if r.get("id")]
        insumos = (
            sb.table("almacen_insumo")
            .select("proveedor_id")
            .eq("contrato_id", contrato_id)
            .eq("activo", True)
            .in_("proveedor_id", pids)
            .execute()
            .data
            or []
        )
        from collections import defaultdict
        counts: dict = defaultdict(int)
        for ins in insumos:
            if ins.get("proveedor_id"):
                counts[int(ins["proveedor_id"])] += 1
        for r in rows:
            r["insumos_activos"] = counts.get(int(r["id"]), 0)
    return rows, total


def delete_proveedor_catalogo(contrato_id: int, proveedor_id: int) -> dict:
    """Desactiva un proveedor del directorio (soft delete)."""
    sb = _sb()
    rows = (
        sb.table("almacen_proveedor")
        .select("id, razon_social, nit, activo")
        .eq("id", proveedor_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Proveedor no encontrado.")
    row = rows[0]
    if not row.get("activo", True):
        raise ValueError("El proveedor ya está inactivo.")
    insumos = (
        sb.table("almacen_insumo")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("proveedor_id", proveedor_id)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if insumos:
        raise ValueError(
            "No se puede eliminar: el proveedor tiene insumos activos en el catálogo. "
            "Reasigne o elimine esos insumos primero."
        )
    sb.table("almacen_proveedor").update({"activo": False}).eq("id", proveedor_id).execute()
    return {"ok": True, "proveedor_id": proveedor_id, "razon_social": row.get("razon_social")}


def find_duplicados(
    contrato_id: int,
    proveedor_id: int,
    descripcion: str,
    exclude_insumo_id: Optional[int] = None,
    umbral: float = 0.82,
) -> List[dict]:
    """Duplicado solo si la descripción normalizada es exactamente igual (mismo proveedor).

    `umbral` se conserva por compatibilidad de firma y no se usa: nunca se alerta
    por similitud parcial ni por subcadena.
    """
    del umbral
    if not proveedor_id or not (descripcion or "").strip():
        return []
    sb = _sb()
    rows = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("proveedor_id", proveedor_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    target = _norm_desc(descripcion)
    out = []
    for row in rows:
        if exclude_insumo_id and int(row["id"]) == int(exclude_insumo_id):
            continue
        desc = _norm_desc(row.get("descripcion") or "")
        if desc != target:
            continue
        prov = (
            sb.table("almacen_proveedor")
            .select("razon_social, nit")
            .eq("id", proveedor_id)
            .limit(1)
            .execute()
            .data
            or [{}]
        )[0]
        item = _row_from_almacen_insumo(row, prov.get("razon_social") or "—")
        item["similitud"] = 1.0
        item["cotizaciones_detalle"] = cotizaciones_detalle_from_row(row)
        out.append(item)
    return out


def list_precio_historial(contrato_id: int, insumo_id: int) -> List[dict]:
    sb = _sb()
    get_insumo(contrato_id, insumo_id)
    rows = (
        sb.table("almacen_insumo_precio_historial")
        .select("*")
        .eq("insumo_id", insumo_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return rows


def list_cotizaciones_soporte(contrato_id: int, insumo_id: int) -> List[dict]:
    sb = _sb()
    get_insumo(contrato_id, insumo_id)
    return (
        sb.table("almacen_insumo_cotizacion_soporte")
        .select("id, nombre, tamano_bytes, created_at")
        .eq("insumo_id", insumo_id)
        .order("created_at")
        .execute()
        .data
        or []
    )


def _parse_bool(raw: Any, default: bool = True) -> bool:
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in ("true", "1", "yes", "si", "sí", "on"):
        return True
    if s in ("false", "0", "no", "off"):
        return False
    return default


def _count_cotizaciones_insumo(
    sb,
    insumo_id: Optional[int],
    *,
    existing_row: Optional[dict] = None,
    ganadora_pdf=None,
    soporte_pdfs=None,
    body: Optional[dict] = None,
) -> tuple[bool, int]:
    """Retorna (tiene_ganadora, n_soportes)."""
    tiene_ganadora = ganadora_pdf is not None
    if existing_row:
        tiene_ganadora = tiene_ganadora or bool(
            existing_row.get("soporte_pdf_blob_path") or existing_row.get("cotizacion_numero")
        )
    if body and (body.get("cotizacion_numero") or "").strip():
        tiene_ganadora = True
    if body:
        detalle = normalize_cotizaciones_detalle(body.get("cotizaciones_detalle"))
        if any(r.get("es_ganadora") and (r.get("numero") or r.get("valor") is not None) for r in detalle):
            tiene_ganadora = True
        elif existing_row:
            detalle_ex = cotizaciones_detalle_from_row(existing_row)
            if any(r.get("es_ganadora") and (r.get("numero") or r.get("valor") is not None) for r in detalle_ex):
                tiene_ganadora = True
    n_sop = len(soporte_pdfs or [])
    if insumo_id:
        n_sop += len(
            sb.table("almacen_insumo_cotizacion_soporte")
            .select("id")
            .eq("insumo_id", insumo_id)
            .execute()
            .data
            or []
        )
    return tiene_ganadora, n_sop


def _validar_cotizaciones_requeridas(
    contrato_id: int,
    requiere_cotizacion: bool,
    *,
    insumo_id: Optional[int] = None,
    existing_row: Optional[dict] = None,
    ganadora_pdf=None,
    soporte_pdfs=None,
    body: Optional[dict] = None,
) -> None:
    """Si requiere cotización, exige cotización ganadora. Los PDFs de soporte son opcionales."""
    if not requiere_cotizacion:
        return
    sb = _sb()
    tiene_ganadora, _n_sop = _count_cotizaciones_insumo(
        sb,
        insumo_id,
        existing_row=existing_row,
        ganadora_pdf=ganadora_pdf,
        soporte_pdfs=soporte_pdfs,
        body=body,
    )
    if not tiene_ganadora:
        raise ValueError(
            "Este insumo requiere cotización: registre la cotización ganadora (PDF o número de cotización)."
        )


def _parse_fecha(raw: Any) -> Optional[str]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date):
        return raw.isoformat()
    s = str(raw).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s if re.match(r"^\d{4}-\d{2}-\d{2}$", s) else None


def _build_insumo_payload(body: dict, contrato_id: int, user_id: int, *, codigo_fijo: Optional[str] = None) -> dict:
    codigo = _resolve_codigo_insumo(body, contrato_id, codigo_fijo=codigo_fijo)
    descripcion = (body.get("descripcion") or "").strip()
    if not descripcion:
        raise ValueError("La descripción del insumo es obligatoria.")
    tipo_imp = (body.get("tipo_impuesto") or "").strip().lower() or None
    if tipo_imp not in (None, "iva", "aiu"):
        raise ValueError("tipo_impuesto debe ser 'iva' o 'aiu'.")
    impuestos = _normalize_impuestos(body.get("impuestos"))
    tributos = normalize_tributos(body.get("tributos"))
    costo_base = _to_float(body.get("costo_base"))
    if body.get("costo_base") is None and body.get("costo") is not None:
        costo_base = _to_float(body.get("costo"))
    # Costo directo / valor antes de AIU-IVA: pesos COP enteros.
    costo_base = float(round(max(costo_base, 0.0)))
    imp_pct = _to_float(body.get("impuesto_porcentaje"))
    # Valor después de AIU/IVA: prioriza tributos unificados; si no hay, esquema legado.
    if tributos_tienen_datos(tributos):
        valor_total = compute_valor_despues_aiu_iva(costo_base, tributos)
    else:
        valor_total = compute_costo_total_insumo(costo_base, tipo_imp, imp_pct, impuestos)
    cantidad_negociada = (
        _to_float(body.get("cantidad_negociada"))
        if body.get("cantidad_negociada") not in (None, "")
        else None
    )
    valor_negociado_total = None
    if cantidad_negociada is not None and cantidad_negociada > 0 and valor_total > 0:
        valor_negociado_total = float(round(cantidad_negociada * valor_total))
    proveedor_id = body.get("proveedor_id")
    if body.get("razon_social") and body.get("nit") and not proveedor_id:
        prov = create_proveedor(contrato_id, user_id, {
            "razon_social": body.get("razon_social"),
            "nit": body.get("nit"),
            "contacto_email": body.get("contacto_email"),
            "contacto_nombre": body.get("contacto_nombre"),
            "contacto_telefono": body.get("contacto_telefono"),
        })
        proveedor_id = prov.get("id")
    if proveedor_id:
        from almacen_insumos_service import sync_proveedor_contacto
        sync_proveedor_contacto(int(proveedor_id), body)
    payload = {
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
        "tributos": tributos,
        "valor_compra_referencia": valor_total,
        "cotizacion_numero": (body.get("cotizacion_numero") or "").strip() or None,
        "cotizacion_fecha": _parse_fecha(body.get("cotizacion_fecha")),
        "cotizacion_vigencia": (body.get("cotizacion_vigencia") or "").strip() or None,
        "requiere_cotizacion": _parse_bool(body.get("requiere_cotizacion"), default=True),
        "cantidad_negociada": cantidad_negociada,
        "valor_negociado_total": valor_negociado_total,
    }
    # Solo persistir cotizaciones_detalle si viene en el body (evita borrar en CSV/update parcial).
    if "cotizaciones_detalle" in body:
        detalle = normalize_cotizaciones_detalle(body.get("cotizaciones_detalle"))
        payload["cotizaciones_detalle"] = detalle
        _sync_legacy_cotizacion_from_detalle(payload, detalle)
    return payload


def _save_ganadora_pdf(contrato_id: int, insumo_id: int, data: bytes, nombre: str, mime: str) -> dict:
    meta = _upload_soporte(contrato_id, "insumos-soporte", insumo_id, data, nombre, mime)
    sb = _sb()
    sb.table("almacen_insumo").update({
        "soporte_pdf_blob_path": meta["blob_path"],
        "soporte_pdf_nombre": meta["nombre"],
    }).eq("id", insumo_id).execute()
    return meta


def _save_soporte_pdfs(
    contrato_id: int,
    insumo_id: int,
    user_id: int,
    files: List[Tuple[bytes, str, str]],
) -> int:
    sb = _sb()
    count = 0
    for data, nombre, mime in files:
        if mime != "application/pdf":
            raise ValueError(f"«{nombre}» debe ser PDF.")
        meta = _upload_soporte(contrato_id, "insumos-cot-soporte", insumo_id, data, nombre, mime)
        sb.table("almacen_insumo_cotizacion_soporte").insert({
            "insumo_id": int(insumo_id),
            "blob_path": meta["blob_path"],
            "nombre": meta["nombre"],
            "tamano_bytes": meta.get("tamano_bytes") or len(data),
            "created_by": user_id,
        }).execute()
        count += 1
    return count


def create_insumo_catalogo(
    contrato_id: int,
    user_id: int,
    body: dict,
    ganadora_pdf: Optional[Tuple[bytes, str, str]] = None,
    soporte_pdfs: Optional[List[Tuple[bytes, str, str]]] = None,
    force_update_id: Optional[int] = None,
) -> dict:
    if force_update_id:
        return update_insumo_catalogo(
            contrato_id, int(force_update_id), user_id, body,
            ganadora_pdf=ganadora_pdf,
            soporte_pdfs=soporte_pdfs,
            motivo="actualizacion_precio_duplicado",
        )
    sb = _sb()
    payload = _build_insumo_payload(body, contrato_id, user_id)
    _validar_cotizaciones_requeridas(
        contrato_id,
        payload["requiere_cotizacion"],
        body=body,
        ganadora_pdf=ganadora_pdf,
        soporte_pdfs=soporte_pdfs,
    )
    payload["created_by"] = user_id
    ins = sb.table("almacen_insumo").insert(payload).execute().data
    if not ins:
        raise ValueError("No se pudo crear el insumo (¿código duplicado?).")
    insumo_id = ins[0]["id"]
    if ganadora_pdf:
        _save_ganadora_pdf(contrato_id, insumo_id, *ganadora_pdf)
    if soporte_pdfs:
        _save_soporte_pdfs(contrato_id, insumo_id, user_id, soporte_pdfs)
    return get_insumo(contrato_id, insumo_id)


def update_insumo_catalogo(
    contrato_id: int,
    insumo_id: int,
    user_id: int,
    body: dict,
    ganadora_pdf: Optional[Tuple[bytes, str, str]] = None,
    soporte_pdfs: Optional[List[Tuple[bytes, str, str]]] = None,
    motivo: str = "edicion",
) -> dict:
    sb = _sb()
    existing_rows = (
        sb.table("almacen_insumo")
        .select("*")
        .eq("id", insumo_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing_rows:
        raise ValueError("Insumo no encontrado.")
    existing = existing_rows[0]
    _snapshot_historial(existing, contrato_id, user_id, motivo)
    payload = _build_insumo_payload(body, contrato_id, user_id, codigo_fijo=existing.get("codigo"))
    if body.get("requiere_cotizacion") is None and "requiere_cotizacion" not in body:
        payload["requiere_cotizacion"] = existing.get("requiere_cotizacion", True)
    _validar_cotizaciones_requeridas(
        contrato_id,
        payload["requiere_cotizacion"],
        insumo_id=insumo_id,
        existing_row=existing,
        body=body,
        ganadora_pdf=ganadora_pdf,
        soporte_pdfs=soporte_pdfs,
    )
    payload["updated_at"] = datetime.utcnow().isoformat()
    payload["updated_by"] = user_id
    sb.table("almacen_insumo").update(payload).eq("id", insumo_id).execute()
    if ganadora_pdf:
        _save_ganadora_pdf(contrato_id, insumo_id, *ganadora_pdf)
    if soporte_pdfs:
        _save_soporte_pdfs(contrato_id, insumo_id, user_id, soporte_pdfs)
    return get_insumo(contrato_id, insumo_id)


def map_ocr_to_cotizacion(ocr_result: dict) -> dict:
    """Mapea salida de contabilidad_ocr.analyze_invoice_bytes a campos del popup."""
    sug = ocr_result.get("sugerencias") or {}
    out: Dict[str, Any] = {}
    if sug.get("proveedor_razon_social"):
        out["razon_social"] = sug["proveedor_razon_social"]
    if sug.get("proveedor_nit"):
        out["nit"] = sug["proveedor_nit"]
    if sug.get("fecha"):
        out["cotizacion_fecha"] = sug["fecha"]
    if sug.get("valor_bruto") is not None:
        out["costo_base"] = sug["valor_bruto"]
    if sug.get("iva_pct") is not None:
        out["tipo_impuesto"] = "iva"
        out["impuesto_porcentaje"] = sug["iva_pct"]
    elif sug.get("total_detectado") is not None and sug.get("valor_bruto") is not None:
        try:
            bruto = float(sug["valor_bruto"])
            total = float(sug["total_detectado"])
            if bruto > 0 and total > bruto:
                pct = round(100 * (total - bruto) / bruto, 2)
                if 0 < pct <= 100:
                    out["tipo_impuesto"] = "iva"
                    out["impuesto_porcentaje"] = pct
        except (TypeError, ValueError):
            pass
    return out


def _insumo_en_solicitudes_abiertas(sb, contrato_id: int, insumo_id: int) -> bool:
    items = (
        sb.table("almacen_solicitud_item")
        .select("solicitud_id")
        .eq("insumo_id", insumo_id)
        .execute()
        .data
        or []
    )
    if not items:
        return False
    sids = sorted({int(i["solicitud_id"]) for i in items if i.get("solicitud_id")})
    if not sids:
        return False
    abiertas = (
        sb.table("almacen_solicitud")
        .select("id")
        .eq("contrato_id", contrato_id)
        .in_("id", sids)
        .in_("estado", ["borrador", "enviada"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(abiertas)


def delete_insumo_catalogo(contrato_id: int, insumo_id: int) -> dict:
    """Desactiva un insumo del catálogo (soft delete)."""
    sb = _sb()
    rows = (
        sb.table("almacen_insumo")
        .select("id, codigo, activo")
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
    if not row.get("activo", True):
        raise ValueError("El insumo ya está inactivo.")
    if _insumo_en_solicitudes_abiertas(sb, contrato_id, insumo_id):
        raise ValueError(
            "No se puede eliminar: el insumo está en solicitudes en borrador o enviadas."
        )
    sb.table("almacen_insumo").update({"activo": False}).eq("id", insumo_id).execute()
    return {"ok": True, "insumo_id": insumo_id, "codigo": row.get("codigo")}


def clear_catalogo_insumos(contrato_id: int) -> int:
    """Desactiva todos los insumos del catálogo del contrato (reemplazo CSV)."""
    sb = _sb()
    rows = (
        sb.table("almacen_insumo")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0
    sb.table("almacen_insumo").update({"activo": False}).eq("contrato_id", contrato_id).eq("activo", True).execute()
    return len(rows)


def import_csv_insumos(contrato_id: int, user_id: int, csv_text: str, modo: str = "agregar") -> dict:
    modo = (modo or "agregar").strip().lower()
    if modo not in ("agregar", "reemplazar"):
        raise ValueError("modo debe ser 'agregar' o 'reemplazar'.")
    desactivados = 0
    if modo == "reemplazar":
        desactivados = clear_catalogo_insumos(contrato_id)
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError(
            "El CSV está vacío o no tiene encabezados.\n"
            "La primera fila debe incluir al menos: codigo, descripcion, unidad, costo / «Costo (Antes de AIU o IVA)».\n"
            "Descargue la plantilla CSV desde este módulo."
        )
    col_map = _resolve_csv_columns(list(reader.fieldnames))
    _csv_columns_error(col_map)

    def col(name: str, row: dict) -> str:
        key = col_map.get(name)
        return (row.get(key) or "").strip() if key else ""

    creados = 0
    actualizados = 0
    errores: List[str] = []
    duplicados: List[dict] = []

    for i, row in enumerate(reader, start=2):
        try:
            body = {
                "codigo": col("codigo", row),
                "descripcion": col("descripcion", row),
                "unidad": col("unidad", row) or "UND",
                "rendimiento": col("rendimiento", row) or None,
                "costo_base": col("costo_base", row),
                "cotizacion_numero": col("cotizacion_numero", row),
                "cotizacion_fecha": col("cotizacion_fecha", row),
                "cotizacion_vigencia": col("cotizacion_vigencia", row),
                "razon_social": col("proveedor", row),
                "nit": col("nit", row),
                "contacto_email": col("contacto_email", row),
                "contacto_nombre": col("contacto_nombre", row),
                "contacto_telefono": col("contacto_telefono", row),
                "requiere_cotizacion": _parse_bool(col("requiere_cotizacion", row) or "false", default=False),
            }
            tributos = _csv_build_tributos(lambda name: col(name, row))
            if tributos is not None:
                body["tributos"] = tributos
                body["tipo_impuesto"] = None
                body["impuesto_porcentaje"] = None
            else:
                # Legado: un solo tipo/porcentaje IVA|AIU
                body["tipo_impuesto"] = col("tipo_impuesto", row) or None
                body["impuesto_porcentaje"] = col("impuesto_porcentaje", row) or None
                if not body["tipo_impuesto"] and body["impuesto_porcentaje"]:
                    body["tipo_impuesto"] = "iva"
            if not body["descripcion"]:
                errores.append(f"Fila {i}: descripción obligatoria.")
                continue
            if body["codigo"]:
                try:
                    body["codigo"] = validar_codigo_insumo_contrato(body["codigo"], contrato_id)
                except ValueError as ve:
                    errores.append(f"Fila {i}: {ve}")
                    continue
            else:
                body["codigo"] = next_codigo_insumo(contrato_id)
            proveedor_id = None
            if body["nit"]:
                sb = _sb()
                prov = (
                    sb.table("almacen_proveedor")
                    .select("id")
                    .eq("contrato_id", contrato_id)
                    .eq("nit", body["nit"])
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if prov:
                    proveedor_id = prov[0]["id"]
                    sync_proveedor_contacto(proveedor_id, body)
                elif body["razon_social"]:
                    prov_new = create_proveedor(contrato_id, user_id, {
                        "razon_social": body["razon_social"],
                        "nit": body["nit"],
                        "contacto_email": body.get("contacto_email"),
                        "contacto_nombre": body.get("contacto_nombre"),
                        "contacto_telefono": body.get("contacto_telefono"),
                    })
                    proveedor_id = prov_new["id"]
            body["proveedor_id"] = proveedor_id

            dups = find_duplicados(contrato_id, proveedor_id or 0, body["descripcion"]) if proveedor_id else []
            if dups:
                duplicados.append({"fila": i, "insumo_existente": dups[0], "codigo_csv": body["codigo"]})
                update_insumo_catalogo(contrato_id, dups[0]["insumo_id"], user_id, body, motivo="import_csv_duplicado")
                actualizados += 1
            else:
                if body["requiere_cotizacion"]:
                    errores.append(
                        f"Fila {i}: requiere_cotizacion=true exige PDFs en el formulario; "
                        "use false en CSV o cree el insumo manualmente."
                    )
                    continue
                create_insumo_catalogo(contrato_id, user_id, body)
                creados += 1
        except Exception as exc:
            errores.append(f"Fila {i}: {exc}")

    return {
        "modo": modo,
        "desactivados": desactivados,
        "creados": creados,
        "actualizados": actualizados,
        "duplicados": duplicados,
        "errores": errores,
    }


PROV_CSV_REQUIRED = ("razon_social", "nit")

PROV_CSV_COLUMN_ALIASES: Dict[str, List[str]] = {
    "razon_social": [
        "razon_social", "razon social", "proveedor", "nombre", "nombre proveedor",
        "empresa", "razón social",
    ],
    "nit": [
        "nit", "nit proveedor", "documento", "identificacion", "identificación",
        "id proveedor", "cedula", "cédula",
    ],
    "contacto_email": [
        "contacto_email", "contacto email", "email", "correo", "correo contacto", "email contacto",
    ],
    "contacto_nombre": [
        "contacto_nombre", "contacto nombre", "nombre comercial", "comercial", "nombre contacto",
    ],
    "contacto_telefono": [
        "contacto_telefono", "contacto telefono", "telefono", "teléfono", "telefono contacto", "celular",
    ],
}

PROV_CSV_TEMPLATE = (
    "razon_social,nit,contacto_email,contacto_nombre,contacto_telefono\n"
    "Proveedor Ejemplo SA,900123456-1,ventas@ejemplo.com,Juan Pérez,3001234567\n"
    "Materiales del Norte Ltda,800987654-2,compras@norte.com,Ana Gómez,3105558899\n"
)


def get_csv_template_proveedores() -> str:
    return PROV_CSV_TEMPLATE


def _prov_csv_columns_error(col_map: Dict[str, str]) -> None:
    missing = [c for c in PROV_CSV_REQUIRED if c not in col_map]
    if not missing:
        return
    raise ValueError(
        "El CSV de proveedores no cumple el formato esperado.\n"
        f"Columnas obligatorias faltantes: {', '.join(missing)}.\n"
        "Columnas obligatorias: razon_social (o proveedor/nombre), nit.\n"
        "Opcionales: contacto_email, contacto_nombre, contacto_telefono.\n"
        "Use «Plantilla para Proveedores» en este módulo para ver el formato exacto."
    )


def clear_proveedores_sin_insumos(contrato_id: int) -> int:
    """
    Soft-delete de proveedores activos sin insumos activos (modo reemplazar CSV).
    Conserva proveedores que aún tienen insumos en el catálogo.
    """
    sb = _sb()
    provs = (
        sb.table("almacen_proveedor")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    if not provs:
        return 0
    insumos = (
        sb.table("almacen_insumo")
        .select("proveedor_id")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    protected = {
        int(r["proveedor_id"])
        for r in insumos
        if r.get("proveedor_id") is not None
    }
    to_clear = [int(p["id"]) for p in provs if int(p["id"]) not in protected]
    if not to_clear:
        return 0
    for pid in to_clear:
        sb.table("almacen_proveedor").update({"activo": False}).eq("id", pid).execute()
    return len(to_clear)


def import_csv_proveedores(
    contrato_id: int, user_id: int, csv_text: str, modo: str = "agregar"
) -> dict:
    modo = (modo or "agregar").strip().lower()
    if modo not in ("agregar", "reemplazar"):
        raise ValueError("modo debe ser 'agregar' o 'reemplazar'.")
    desactivados = 0
    if modo == "reemplazar":
        desactivados = clear_proveedores_sin_insumos(contrato_id)

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError(
            "El CSV está vacío o no tiene encabezados.\n"
            "La primera fila debe incluir al menos: razon_social, nit.\n"
            "Descargue la plantilla de proveedores desde este módulo."
        )
    col_map = _resolve_csv_columns(list(reader.fieldnames), PROV_CSV_COLUMN_ALIASES)
    _prov_csv_columns_error(col_map)

    def col(name: str, row: dict) -> str:
        key = col_map.get(name)
        return (row.get(key) or "").strip() if key else ""

    creados = 0
    actualizados = 0
    errores: List[str] = []
    seen_nits: set[str] = set()

    for i, row in enumerate(reader, start=2):
        try:
            razon = col("razon_social", row)
            nit = col("nit", row)
            if not razon and not nit:
                continue
            if not razon or not nit:
                errores.append(f"Fila {i}: razón social y NIT son obligatorios.")
                continue
            if nit in seen_nits:
                errores.append(f"Fila {i}: NIT duplicado en el CSV ({nit}).")
                continue
            seen_nits.add(nit)

            sb = _sb()
            existing = (
                sb.table("almacen_proveedor")
                .select("id, razon_social, activo")
                .eq("contrato_id", contrato_id)
                .eq("nit", nit)
                .limit(1)
                .execute()
                .data
                or []
            )
            body = {
                "razon_social": razon,
                "nit": nit,
                "contacto_email": col("contacto_email", row) or None,
                "contacto_nombre": col("contacto_nombre", row) or None,
                "contacto_telefono": col("contacto_telefono", row) or None,
            }
            if existing:
                create_proveedor(contrato_id, user_id, body)
                # create_proveedor no siempre actualiza razón social; forzar si cambió
                if existing[0].get("razon_social") != razon:
                    sb.table("almacen_proveedor").update({"razon_social": razon}).eq(
                        "id", existing[0]["id"]
                    ).execute()
                sync_proveedor_contacto(int(existing[0]["id"]), body)
                actualizados += 1
            else:
                create_proveedor(contrato_id, user_id, body)
                creados += 1
        except Exception as exc:
            errores.append(f"Fila {i}: {exc}")

    return {
        "modo": modo,
        "desactivados": desactivados,
        "creados": creados,
        "actualizados": actualizados,
        "errores": errores,
    }
