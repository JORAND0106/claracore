"""
Catálogo de insumos — panel administrativo (CRUD, duplicados, historial, CSV, OCR).
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from almacen_insumos_service import (
    _impuesto_etiqueta,
    _insumo_label,
    _normalize_impuestos,
    _row_from_almacen_insumo,
    compute_costo_total_insumo,
    create_proveedor,
    get_insumo,
)
from almacen_service import _sb, _to_float, _upload_soporte

PDF_MAX_BYTES = 204800

CSV_REQUIRED = ("codigo", "descripcion", "unidad", "costo_base")

CSV_COLUMN_ALIASES: Dict[str, List[str]] = {
    "codigo": ["codigo", "código", "code", "item", "item_numero", "numero item", "num item", "cod"],
    "descripcion": ["descripcion", "descripción", "desc", "nombre", "material", "detalle", "descripcion insumo"],
    "unidad": ["unidad", "und", "unit", "uom", "unidad medida"],
    "costo_base": [
        "costo_base", "costo base", "costo", "precio", "precio_unitario", "precio unitario",
        "valor", "valor unitario", "valor_compra", "valor compra", "precio compra",
    ],
    "tipo_impuesto": ["tipo_impuesto", "tipo impuesto", "iva o aiu", "impuesto", "iva/aiu"],
    "impuesto_porcentaje": ["impuesto_porcentaje", "impuesto porcentaje", "iva_pct", "iva %", "porcentaje iva", "pct"],
    "cotizacion_numero": ["cotizacion_numero", "cotizacion numero", "numero cotizacion", "n cotizacion", "no cotizacion"],
    "cotizacion_fecha": ["cotizacion_fecha", "cotizacion fecha", "fecha cotizacion", "fecha"],
    "cotizacion_vigencia": ["cotizacion_vigencia", "cotizacion vigencia", "vigencia"],
    "proveedor": ["proveedor", "razon_social", "razon social", "nombre proveedor"],
    "nit": ["nit", "nit proveedor", "documento"],
}

CSV_TEMPLATE = (
    "codigo,descripcion,unidad,costo,proveedor,nit,tipo_impuesto,impuesto_porcentaje,"
    "cotizacion_numero,cotizacion_fecha,cotizacion_vigencia\n"
    "INS-001,Cemento gris 50 kg,UND,18500,Proveedor Ejemplo SA,900123456-1,iva,19,"
    "COT-2026-001,2026-07-01,15 dias\n"
)


def _norm_csv_header(h: str) -> str:
    s = unicodedata.normalize("NFD", str(h or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower().strip())


def _resolve_csv_columns(fieldnames: List[str]) -> Dict[str, str]:
    norm_to_orig = {_norm_csv_header(h): h for h in fieldnames if h}
    col_map: Dict[str, str] = {}
    for canonical, aliases in CSV_COLUMN_ALIASES.items():
        for alias in aliases:
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
        "Columnas obligatorias: codigo, descripcion, unidad, costo (o costo_base).\n"
        "Opcionales: proveedor, nit, tipo_impuesto (iva/aiu), impuesto_porcentaje, "
        "cotizacion_numero, cotizacion_fecha, cotizacion_vigencia.\n"
        "Use «Descargar plantilla CSV» en este módulo para ver el formato exacto."
    )


def get_csv_template() -> str:
    return CSV_TEMPLATE


def _norm_desc(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.lower().strip())
    return s


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


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
            .select("id, razon_social, nit")
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
        item["cotizacion_numero"] = row.get("cotizacion_numero")
        item["cotizacion_fecha"] = row.get("cotizacion_fecha")
        item["cotizacion_vigencia"] = row.get("cotizacion_vigencia")
        out.append(item)
    return out, total


def find_duplicados(
    contrato_id: int,
    proveedor_id: int,
    descripcion: str,
    exclude_insumo_id: Optional[int] = None,
    umbral: float = 0.82,
) -> List[dict]:
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
        sim = _similarity(target, desc)
        if sim >= umbral or target in desc or desc in target:
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
            item["similitud"] = round(sim, 3)
            out.append(item)
    out.sort(key=lambda x: x.get("similitud") or 0, reverse=True)
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


def _build_insumo_payload(body: dict, contrato_id: int, user_id: int) -> dict:
    codigo = (body.get("codigo") or "").strip()
    descripcion = (body.get("descripcion") or "").strip()
    if not codigo or not descripcion:
        raise ValueError("Código y descripción del insumo son obligatorios.")
    tipo_imp = (body.get("tipo_impuesto") or "").strip().lower() or None
    if tipo_imp not in (None, "iva", "aiu"):
        raise ValueError("tipo_impuesto debe ser 'iva' o 'aiu'.")
    impuestos = _normalize_impuestos(body.get("impuestos"))
    costo_base = _to_float(body.get("costo_base"))
    if body.get("costo_base") is None and body.get("costo") is not None:
        costo_base = _to_float(body.get("costo"))
    imp_pct = _to_float(body.get("impuesto_porcentaje"))
    valor_total = compute_costo_total_insumo(costo_base, tipo_imp, imp_pct, impuestos)
    proveedor_id = body.get("proveedor_id")
    if body.get("razon_social") and body.get("nit") and not proveedor_id:
        prov = create_proveedor(contrato_id, user_id, {
            "razon_social": body.get("razon_social"),
            "nit": body.get("nit"),
        })
        proveedor_id = prov.get("id")
    return {
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
        "cotizacion_numero": (body.get("cotizacion_numero") or "").strip() or None,
        "cotizacion_fecha": _parse_fecha(body.get("cotizacion_fecha")),
        "cotizacion_vigencia": (body.get("cotizacion_vigencia") or "").strip() or None,
    }


def _save_ganadora_pdf(contrato_id: int, insumo_id: int, data: bytes, nombre: str, mime: str) -> dict:
    if len(data) > PDF_MAX_BYTES:
        raise ValueError("El PDF de la cotización ganadora no puede superar 200 KB.")
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
        if len(data) > PDF_MAX_BYTES:
            raise ValueError(f"El PDF «{nombre}» supera 200 KB.")
        if mime != "application/pdf":
            raise ValueError(f"«{nombre}» debe ser PDF.")
        meta = _upload_soporte(contrato_id, "insumos-cot-soporte", insumo_id, data, nombre, mime)
        sb.table("almacen_insumo_cotizacion_soporte").insert({
            "insumo_id": insumo_id,
            "blob_path": meta["blob_path"],
            "nombre": meta["nombre"],
            "tamano_bytes": len(data),
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
    payload = _build_insumo_payload(body, contrato_id, user_id)
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
            "La primera fila debe incluir al menos: codigo, descripcion, unidad, costo.\n"
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
                "costo_base": col("costo_base", row),
                "tipo_impuesto": col("tipo_impuesto", row) or "iva",
                "impuesto_porcentaje": col("impuesto_porcentaje", row) or "19",
                "cotizacion_numero": col("cotizacion_numero", row),
                "cotizacion_fecha": col("cotizacion_fecha", row),
                "cotizacion_vigencia": col("cotizacion_vigencia", row),
                "razon_social": col("proveedor", row),
                "nit": col("nit", row),
            }
            if not body["codigo"] or not body["descripcion"]:
                errores.append(f"Fila {i}: código y descripción obligatorios.")
                continue
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
                elif body["razon_social"]:
                    prov_new = create_proveedor(contrato_id, user_id, {
                        "razon_social": body["razon_social"],
                        "nit": body["nit"],
                    })
                    proveedor_id = prov_new["id"]
            body["proveedor_id"] = proveedor_id

            dups = find_duplicados(contrato_id, proveedor_id or 0, body["descripcion"]) if proveedor_id else []
            if dups:
                duplicados.append({"fila": i, "insumo_existente": dups[0], "codigo_csv": body["codigo"]})
                update_insumo_catalogo(contrato_id, dups[0]["insumo_id"], user_id, body, motivo="import_csv_duplicado")
                actualizados += 1
            else:
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
