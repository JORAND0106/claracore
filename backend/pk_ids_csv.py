"""Parseo y validación del CSV maestro PK-ID (misma estructura que Bubble/migrar_pk_id_csv_contrato.py)."""
from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional, Tuple

# Columnas esperadas (normalizadas). CAPA es obligatoria en datos; el resto opcional en filas.
PK_IDS_CSV_COLUMNAS_ESPERADAS = (
    "CAPA",
    "CIV",
    "TRAMO",
    "INFRAESTRUCTURA",
    "COSTADO",
    "UBICACION",
    "ABS_INICIO",
    "ABS_FINAL",
    "CALZADA",
)

INSERT_CHUNK = 300


def _norm_key(name: str) -> str:
    return (name or "").strip().upper().replace(" ", "_")


def _float_val(v) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _str_val(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def leer_filas_csv_text(raw: str) -> List[dict]:
    """Lee CSV desde texto; normaliza nombres de columna a MAYÚSCULAS con _."""
    if not raw or not str(raw).strip():
        return []
    text = str(raw)
    if text.startswith("\ufeff"):
        text = text[1:]
    lines = text.splitlines()
    if not lines:
        return []
    delimiter = ";" if lines[0].count(";") > lines[0].count(",") else ","
    reader = csv.DictReader(lines, delimiter=delimiter)
    if not reader.fieldnames:
        return []
    rows: List[dict] = []
    for row in reader:
        if not any((v or "").strip() for v in row.values()):
            continue
        out: dict = {}
        for k, v in row.items():
            nk = _norm_key(k)
            if nk:
                out[nk] = v
        rows.append(out)
    return rows


def validar_estructura_csv(raw: str) -> Tuple[bool, str, List[str], List[dict]]:
    """
    Valida encabezados y filas mínimas.
    Retorna: (ok, mensaje, columnas_detectadas, filas_normalizadas)
    """
    if not raw or not str(raw).strip():
        return False, "El archivo está vacío.", [], []

    text = str(raw)
    if text.startswith("\ufeff"):
        text = text[1:]
    lines = text.splitlines()
    if not lines:
        return False, "El archivo no contiene filas.", [], []

    delimiter = ";" if lines[0].count(";") > lines[0].count(",") else ","
    reader = csv.DictReader(lines, delimiter=delimiter)
    fieldnames = reader.fieldnames or []
    if not fieldnames:
        return False, "No se detectaron columnas de encabezado.", [], []

    cols_norm = {_norm_key(n) for n in fieldnames if n and str(n).strip()}
    if "CAPA" not in cols_norm:
        esperadas = ", ".join(PK_IDS_CSV_COLUMNAS_ESPERADAS)
        detectadas = ", ".join(sorted(cols_norm)) or "(ninguna)"
        return (
            False,
            f"Falta la columna obligatoria CAPA (código PK). "
            f"Columnas esperadas: {esperadas}. Detectadas: {detectadas}.",
            sorted(cols_norm),
            [],
        )

    extras = cols_norm - set(PK_IDS_CSV_COLUMNAS_ESPERADAS)
    if extras:
        esperadas = ", ".join(PK_IDS_CSV_COLUMNAS_ESPERADAS)
        return (
            False,
            f"El archivo contiene columnas no reconocidas: {', '.join(sorted(extras))}. "
            f"Use la estructura: {esperadas}.",
            sorted(cols_norm),
            [],
        )

    rows = leer_filas_csv_text(raw)
    if not rows:
        return False, "No hay filas de datos (solo encabezado o filas vacías).", sorted(cols_norm), []

    filas_sin_capa = sum(1 for r in rows if not _str_val(r.get("CAPA")))
    if filas_sin_capa == len(rows):
        return False, "Ninguna fila tiene valor en CAPA (código PK).", sorted(cols_norm), rows

    return True, "OK", sorted(cols_norm), rows


def csv_row_to_payload(contrato_id: int, row: dict) -> Optional[dict]:
    """CAPA → pk_id; incluye COSTADO y UBICACION."""
    capa = _str_val(row.get("CAPA"))
    if not capa:
        return None
    payload: dict = {
        "contrato_id": contrato_id,
        "pk_id": capa,
    }
    civ = _str_val(row.get("CIV"))
    tramo = _str_val(row.get("TRAMO"))
    infra = _str_val(row.get("INFRAESTRUCTURA"))
    costado = _str_val(row.get("COSTADO"))
    ubicacion = _str_val(row.get("UBICACION"))
    calzada = _str_val(row.get("CALZADA"))
    abs_i = _float_val(row.get("ABS_INICIO"))
    abs_f = _float_val(row.get("ABS_FINAL"))
    if civ:
        payload["civ"] = civ
    if tramo:
        payload["tramo"] = tramo
    if infra:
        payload["infraestructura"] = infra
    if costado:
        payload["costado"] = costado
    if ubicacion:
        payload["ubicacion"] = ubicacion
    if calzada:
        payload["calzada"] = calzada
    if abs_i is not None:
        payload["abs_inicio"] = abs_i
    if abs_f is not None:
        payload["abs_final"] = abs_f
    return payload


def payloads_desde_filas(contrato_id: int, rows: List[dict]) -> Tuple[List[dict], int, int]:
    """
    Convierte filas CSV a payloads únicos por pk_id (última fila gana en duplicados internos).
    Retorna: (payloads, filas_utiles, duplicados_capa_en_archivo)
    """
    by_pk: Dict[str, dict] = {}
    dupes = 0
    utiles = 0
    for r in rows:
        p = csv_row_to_payload(contrato_id, r)
        if not p:
            continue
        utiles += 1
        pk = str(p["pk_id"]).strip()
        if pk in by_pk:
            dupes += 1
        by_pk[pk] = p
    payloads = list(by_pk.values())
    payloads.sort(key=lambda x: str(x["pk_id"]))
    return payloads, utiles, dupes


def parse_and_build_payloads(contrato_id: int, raw: str) -> Tuple[Optional[List[dict]], dict]:
    """
    Valida y construye payloads listos para insert.
    Si inválido, retorna (None, info_dict con error).
    """
    ok, msg, cols, rows = validar_estructura_csv(raw)
    if not ok:
        return None, {"ok": False, "error": msg, "columnas": cols}

    payloads, filas_utiles, dupes_archivo = payloads_desde_filas(contrato_id, rows)
    if not payloads:
        return None, {
            "ok": False,
            "error": "No se generó ningún PK válido: revise que CAPA tenga valor en al menos una fila.",
            "columnas": cols,
        }

    filas_sin_capa = filas_utiles - len(payloads) + dupes_archivo
    return payloads, {
        "ok": True,
        "columnas": cols,
        "filas_csv": len(rows),
        "filas_utiles": filas_utiles,
        "pk_unicos": len(payloads),
        "duplicados_capa_en_archivo": dupes_archivo,
        "filas_sin_capa": max(0, len(rows) - filas_utiles),
    }


# Campos del maestro comparables CSV ↔ BD (db_field, etiqueta CSV)
PK_IDS_CAMPOS_COMPARABLES: Tuple[Tuple[str, str], ...] = (
    ("civ", "CIV"),
    ("tramo", "TRAMO"),
    ("infraestructura", "INFRAESTRUCTURA"),
    ("costado", "COSTADO"),
    ("ubicacion", "UBICACION"),
    ("abs_inicio", "ABS_INICIO"),
    ("abs_final", "ABS_FINAL"),
    ("calzada", "CALZADA"),
)


def _norm_cmp_valor(val, campo: str):
    if campo in ("abs_inicio", "abs_final"):
        if val is None:
            return None
        s = str(val).strip()
        if not s:
            return None
        try:
            return round(float(s.replace(",", ".")), 6)
        except ValueError:
            return None
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def diff_payload_con_maestro(payload: dict, maestro_row: Optional[dict]) -> Tuple[List[dict], dict]:
    """
    Compara payload CSV con fila del maestro.
    Solo cuenta cambio si el CSV trae valor explícito distinto al maestro.
    """
    cambios: List[dict] = []
    columnas: dict = {}
    for db_field, etiqueta in PK_IDS_CAMPOS_COMPARABLES:
        db_v = _norm_cmp_valor((maestro_row or {}).get(db_field), db_field)
        if db_field in payload:
            csv_v = _norm_cmp_valor(payload.get(db_field), db_field)
        else:
            csv_v = None
        columnas[db_field] = {"maestro": db_v, "csv": csv_v, "etiqueta": etiqueta}
        if csv_v is not None and csv_v != db_v:
            cambios.append(
                {
                    "campo": etiqueta,
                    "db_field": db_field,
                    "maestro": db_v,
                    "csv": csv_v,
                }
            )
    return cambios, columnas


def _maestro_row_resumen(row: dict) -> dict:
    out = {"id": row.get("id"), "pk_id": row.get("pk_id")}
    for db_field, _ in PK_IDS_CAMPOS_COMPARABLES:
        out[db_field] = row.get(db_field)
    return out


def _vinculos_fila(
    maestro_id: Optional[int],
    pk_code: str,
    sicoe_refs_por_db_id: Optional[Dict[int, dict]] = None,
    presupuesto_refs_por_codigo: Optional[Dict[str, dict]] = None,
) -> dict:
    """Vínculos SICOE (por id maestro) y Presupuesto (por código CAPA)."""
    sicoe_refs_por_db_id = sicoe_refs_por_db_id or {}
    presupuesto_refs_por_codigo = presupuesto_refs_por_codigo or {}
    code = str(pk_code or "").strip()
    sicoe_refs = None
    if maestro_id is not None:
        sicoe_refs = sicoe_refs_por_db_id.get(int(maestro_id))
    presupuesto_refs = presupuesto_refs_por_codigo.get(code) if code else None
    s_total = int((sicoe_refs or {}).get("total") or 0)
    p_total = int((presupuesto_refs or {}).get("total") or 0)
    en_uso = s_total > 0 or p_total > 0
    return {
        "sicoe_refs": sicoe_refs,
        "presupuesto_refs": presupuesto_refs,
        "en_uso": en_uso,
        "eliminable": maestro_id is not None and not en_uso,
    }


def _resumen_vinculos_filas(filas: List[dict]) -> dict:
    eliminables = sum(1 for f in filas if f.get("eliminable"))
    return {
        "con_sicoe_refs": sum(1 for f in filas if (f.get("sicoe_refs") or {}).get("total", 0) > 0),
        "con_presupuesto_refs": sum(1 for f in filas if (f.get("presupuesto_refs") or {}).get("total", 0) > 0),
        "en_uso": sum(1 for f in filas if f.get("en_uso")),
        "eliminables": eliminables,
        "sin_uso": eliminables,
    }


def comparar_csv_con_maestro(
    payloads: List[dict],
    maestro_rows: List[dict],
    sicoe_refs_por_db_id: Optional[Dict[int, dict]] = None,
    presupuesto_refs_por_codigo: Optional[Dict[str, dict]] = None,
) -> dict:
    """
    Panorama CSV vs maestro por CAPA (pk_id).
    estados: nuevo | actualizar | igual | solo_maestro
    """
    refs_por_db_id = sicoe_refs_por_db_id or {}
    by_code: Dict[str, dict] = {}
    for row in maestro_rows or []:
        code = str(row.get("pk_id") or "").strip()
        if code:
            by_code[code] = row

    csv_codes = {str(p.get("pk_id") or "").strip() for p in payloads if str(p.get("pk_id") or "").strip()}
    filas: List[dict] = []

    for p in payloads:
        code = str(p.get("pk_id") or "").strip()
        if not code:
            continue
        maestro = by_code.get(code)
        if maestro is None:
            filas.append(
                {
                    "pk_id": code,
                    "estado": "nuevo",
                    "maestro_id": None,
                    "sicoe_refs": None,
                    "presupuesto_refs": presupuesto_refs_por_codigo.get(code) if code else None,
                    "en_uso": False,
                    "eliminable": False,
                    "cambios": [],
                    "columnas": diff_payload_con_maestro(p, None)[1],
                }
            )
            continue
        cambios, columnas = diff_payload_con_maestro(p, maestro)
        db_id = maestro.get("id")
        vinc = _vinculos_fila(db_id, code, refs_por_db_id, presupuesto_refs_por_codigo)
        estado = "actualizar" if cambios else "igual"
        filas.append(
            {
                "pk_id": code,
                "estado": estado,
                "maestro_id": db_id,
                **vinc,
                "cambios": cambios,
                "columnas": columnas,
            }
        )

    for code, maestro in by_code.items():
        if code in csv_codes:
            continue
        db_id = maestro.get("id")
        vinc = _vinculos_fila(db_id, code, refs_por_db_id, presupuesto_refs_por_codigo)
        filas.append(
            {
                "pk_id": code,
                "estado": "solo_maestro",
                "maestro_id": db_id,
                **vinc,
                "cambios": [],
                "columnas": {
                    db_field: {
                        "maestro": _norm_cmp_valor(maestro.get(db_field), db_field),
                        "csv": None,
                        "etiqueta": etiqueta,
                    }
                    for db_field, etiqueta in PK_IDS_CAMPOS_COMPARABLES
                },
            }
        )

    filas.sort(key=lambda x: str(x.get("pk_id") or ""))

    vinc_res = _resumen_vinculos_filas(filas)
    resumen = {
        "nuevos": sum(1 for f in filas if f["estado"] == "nuevo"),
        "actualizar": sum(1 for f in filas if f["estado"] == "actualizar"),
        "igual": sum(1 for f in filas if f["estado"] == "igual"),
        "solo_maestro": sum(1 for f in filas if f["estado"] == "solo_maestro"),
        "solo_maestro_con_sicoe": sum(
            1
            for f in filas
            if f["estado"] == "solo_maestro" and (f.get("sicoe_refs") or {}).get("total", 0) > 0
        ),
        "solo_maestro_eliminables": sum(
            1 for f in filas if f["estado"] == "solo_maestro" and f.get("eliminable")
        ),
        "total_filas": len(filas),
        **vinc_res,
    }
    return {
        "filas": filas,
        "resumen": resumen,
        "columnas_csv": [e for _, e in PK_IDS_CAMPOS_COMPARABLES],
    }


def panorama_maestro_pk_ids(
    maestro_rows: List[dict],
    sicoe_refs_por_db_id: Optional[Dict[int, dict]] = None,
    presupuesto_refs_por_codigo: Optional[Dict[str, dict]] = None,
) -> dict:
    """Panorama del maestro actual (sin CSV)."""
    sicoe_refs_por_db_id = sicoe_refs_por_db_id or {}
    presupuesto_refs_por_codigo = presupuesto_refs_por_codigo or {}
    filas: List[dict] = []
    for row in maestro_rows or []:
        code = str(row.get("pk_id") or "").strip()
        if not code:
            continue
        db_id = row.get("id")
        vinc = _vinculos_fila(db_id, code, sicoe_refs_por_db_id, presupuesto_refs_por_codigo)
        filas.append(
            {
                "pk_id": code,
                "estado": "maestro",
                "maestro_id": db_id,
                **vinc,
                "cambios": [],
                "columnas": {
                    db_field: {
                        "maestro": _norm_cmp_valor(row.get(db_field), db_field),
                        "csv": None,
                        "etiqueta": etiqueta,
                    }
                    for db_field, etiqueta in PK_IDS_CAMPOS_COMPARABLES
                },
            }
        )
    filas.sort(key=lambda x: str(x.get("pk_id") or ""))
    vinc_res = _resumen_vinculos_filas(filas)
    resumen = {
        "total_maestro": len(filas),
        "total_filas": len(filas),
        **vinc_res,
    }
    return {"filas": filas, "resumen": resumen, "columnas_csv": [e for _, e in PK_IDS_CAMPOS_COMPARABLES]}
