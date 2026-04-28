# Bubble/migrar_sicoe_73.py
"""
Migración Bubble → ClaraCore (Supabase) para:
  - registros_sicoe_73    (obligatorio; mismo mapeo que migrar_registros_ad.py)
  - reportes_sicoe_ad73   (opcional; ndjson Grupo_Reportes si lo exportaste aparte)

Los reportes en ClaraCore corresponden a «Grupo Reporte» en Bubble (carpeta → so_reportes).
  Siempre se hace upsert de un reporte por cada Grupo distinto en los registros (metadatos
  tomados de un registro representativo del grupo). El archivo de reportes, si existe, enriquece
  o sustituye datos por número de grupo.

Comportamiento:
  - Duplicados dentro del mismo archivo: gana la última línea leída.
  - Filas ya existentes en BD: se actualizan (upsert) con los datos del archivo.

  Si el export incluye «42_NUM IMAGEN» o «42_IMAGEN», se guarda también en so_registros.foto_numero.
  Para un archivo aparte «nombre_fotos», usar Bubble/migrar_foto_numero_nombre_fotos.py

Orden: primero reportes (derivados de registros ± archivo opcional), luego registros (FK reporte_id).

Nota sobre el nombre «73»: es el número RPO del acta (filtro de negocio), no el contrato.
  contrato_id en ClaraCore = 2 para este lote.

Variables de entorno:
  SICOE_CONTRATO_ID       — contrato destino (default: 2)
  SICOE_FILTRO_NUMERO_RPO — ej. 73 para solo ese acta. Si no se define: sin filtro (todo el archivo).
  SICOE_73_DRY_RUN        — si es "1", solo valida archivos y muestra conteos (sin escribir en BD)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
CONTRATO_ID = int(os.environ.get("SICOE_CONTRATO_ID", "2"))


def _parse_filtro_numero_rpo() -> int | None:
    """Por defecto sin filtro (importar todo el archivo). Acta RPO 73: SICOE_FILTRO_NUMERO_RPO=73"""
    raw = os.environ.get("SICOE_FILTRO_NUMERO_RPO")
    if raw is None:
        return None
    v = raw.strip().lower()
    if v in ("", "all", "ninguno", "no", "0"):
        return None
    try:
        return int(v)
    except ValueError:
        print(
            f"Advertencia: SICOE_FILTRO_NUMERO_RPO inválido {raw!r}; sin filtro RPO.",
            file=sys.stderr,
        )
        return None


FILTRO_NUMERO_RPO = _parse_filtro_numero_rpo()
DRY_RUN = os.environ.get("SICOE_73_DRY_RUN", "").strip() in ("1", "true", "yes")

BUBBLE_DIR = Path(__file__).resolve().parent
REPORTES_BASENAME = "reportes_sicoe_ad73"
REGISTROS_BASENAME = "registros_sicoe_73"

LOTE = 300
PAUSE_S = 0.12

load_dotenv(BUBBLE_DIR.parent / "backend" / ".env")

MARGEN_MAP = {
    "derecho": "Derecha",
    "izquierdo": "Izquierda",
    "unico": "Única",
    "unica": "Única",
}


def floatv(v):
    """Números JSON o texto con formato CO: miles con punto, decimales con coma (2.239.671,17)."""
    if v in (None, "", "null"):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("\xa0", " ").replace(" ", "")
    if not s or s.lower() in ("null", "nan"):
        return None
    neg = s.startswith("-")
    if neg:
        s = s[1:].strip()
    try:
        # Coma = decimal (estilo CO)
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
            return -float(s) if neg else float(s)
        parts = s.split(".")
        if len(parts) > 2:
            # 2.239.671.017 → miles
            return -float("".join(parts)) if neg else float("".join(parts))
        if len(parts) == 2:
            left, right = parts
            # Un solo punto: miles si la parte derecha tiene 3 dígitos (1.234 → 1234)
            if right.isdigit() and len(right) == 3 and left.isdigit() and len(left) <= 3:
                return -float(left + right) if neg else float(left + right)
            return -float(s) if neg else float(s)
        return -float(s) if neg else float(s)
    except (ValueError, TypeError):
        return None


def intv(v):
    if v in (None, "", "null"):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int) and not isinstance(v, bool):
        return int(v)
    if isinstance(v, float):
        return int(v)
    s = str(v).strip().replace("\xa0", " ").replace(" ", "")
    if not s:
        return None
    neg = s.startswith("-")
    if neg:
        s = s[1:].strip()
    try:
        if "," in s:
            s = s.replace(".", "").split(",")[0]
        parts = s.split(".")
        if len(parts) > 2:
            return int(-int("".join(parts))) if neg else int("".join(parts))
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit() and len(parts[1]) == 3:
            return int(-int(parts[0] + parts[1])) if neg else int(parts[0] + parts[1])
        n = float(s) if "." in s else int(s)
        return int(-n) if neg else int(n)
    except (ValueError, TypeError):
        return None


def strv(v):
    s = str(v).strip() if v is not None else ""
    return s if s else None


def normalizar_margen(v):
    s = strv(v)
    if not s:
        return None
    key = s.lower().replace("\xfa", "u")
    return MARGEN_MAP.get(key, s)


def normalizar_estado_validacion(v):
    """
    Alineado con backend _matriz_validacion_norm_estado: el dashboard cuenta
    «Obra aprobada» solo con Interventoría (N3) = Aprobado exacto en BD.
    """
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    sl = s.lower()
    if sl == "aprobado":
        return "Aprobado"
    if sl == "pendiente":
        return "Pendiente"
    if sl == "rechazado":
        return "Rechazado"
    if "no revis" in sl or sl == "no revisado":
        return "No Revisado"
    return s


def parse_num_prefijo(s):
    if not s:
        return None
    m = re.match(r"^(\d+)", str(s).strip())
    return int(m.group(1)) if m else None


def pasa_filtro_rpo(raw: dict, campo_acta: str) -> bool:
    """Solo aplica si FILTRO_NUMERO_RPO está definido (no None)."""
    if FILTRO_NUMERO_RPO is None:
        return True
    n = parse_num_prefijo(raw.get(campo_acta))
    return n == FILTRO_NUMERO_RPO


def resolve_data_file(basename: str, optional: bool = False) -> Path | None:
    for cand in (basename, f"{basename}.ndjson", f"{basename}.jsonl"):
        p = BUBBLE_DIR / cand
        if p.is_file():
            return p
    if optional:
        return None
    raise FileNotFoundError(
        f"No se encontró '{basename}' (.ndjson / .jsonl / sin extensión) en {BUBBLE_DIR}"
    )


def paginar(sb, tabla: str, filtros: dict, columnas: str = "*"):
    todos, off = [], 0
    while True:
        q = sb.table(tabla).select(columnas)
        for k, v in filtros.items():
            q = q.eq(k, v)
        rows = q.range(off, off + 999).execute().data
        todos.extend(rows or [])
        if len(rows or []) < 1000:
            break
        off += 1000
    return todos


def estadisticas_previas_registros(path_reg: Path) -> dict:
    """Conteos y suma de costo en archivo (antes de deduplicar por número registro)."""
    total_lineas = 0
    lineas_tras_filtro = 0
    suma_costo_tras_filtro = 0.0
    por_num: dict[int, int] = {}
    sin_numero = 0
    sin_acta_coincide = 0
    with open(path_reg, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total_lineas += 1
            r = json.loads(line)
            if FILTRO_NUMERO_RPO is not None and not pasa_filtro_rpo(r, "26_ACTA"):
                sin_acta_coincide += 1
                continue
            lineas_tras_filtro += 1
            cd = floatv(r.get("25_COSTO DIRECTO"))
            if cd is not None:
                suma_costo_tras_filtro += cd
            nr = intv(r.get("01_NUMERO REGISTRO"))
            if nr is None:
                sin_numero += 1
            else:
                por_num[nr] = por_num.get(nr, 0) + 1
    duplicados_extra = sum(c - 1 for c in por_num.values() if c > 1)
    return {
        "total_lineas": total_lineas,
        "lineas_tras_filtro": lineas_tras_filtro,
        "excluidas_por_filtro_rpo": sin_acta_coincide,
        "unicos_numero_registro": len(por_num),
        "lineas_duplicadas_mismo_num": duplicados_extra,
        "sin_numero_en_linea_filtrada": sin_numero,
        "suma_costo_directo_parseado": suma_costo_tras_filtro,
    }


def ndjson_last_wins(path: Path | None, key_fn, filter_fn=None):
    """Varias líneas con la misma clave: conserva la última. filter_fn(r) opcional."""
    if path is None:
        return {}
    by_key: dict = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if filter_fn is not None and not filter_fn(r):
                continue
            k = key_fn(r)
            if k is None:
                continue
            by_key[k] = r
    return by_key


def build_reporte_payload(
    grupo_num: int,
    raw: dict | None,
    pk_lookup: dict[str, int],
    acta_lookup: dict[int, int],
) -> dict:
    if raw is None:
        return {
            "contrato_id": CONTRATO_ID,
            "numero_reporte": grupo_num,
            "descripcion_actividad": f"Reporte migrado Bubble #{grupo_num}",
            "capitulo": "Sin capitulo",
            "estado": "Aprobados",
        }

    pk_raw = strv(raw.get("05_PK-ID_id"))
    acta_raw = strv(raw.get("26_ACTA_id"))
    acta_num = parse_num_prefijo(acta_raw)

    capitulo = strv(raw.get("04_1_CAPITULO_id")) or "Sin capitulo"
    descripcion = strv(raw.get("01_DESCRIPCION")) or f"Reporte migrado Bubble #{grupo_num}"
    pk_id_id = pk_lookup.get(pk_raw) if pk_raw else None

    payload = {
        "contrato_id": CONTRATO_ID,
        "numero_reporte": grupo_num,
        "descripcion_actividad": descripcion,
        "capitulo": capitulo,
        "estado": "Aprobados",
    }
    opt = {
        "civ": strv(raw.get("06_CIV_id")),
        "tramo": strv(raw.get("07_TRAMO")),
        "calzada": strv(raw.get("08_COSTADO")),
        "infraestructura": strv(raw.get("09_INFRAESTRUCTURA")),
        "margen": normalizar_margen(raw.get("10_MARGEN")),
        "ubicacion": strv(raw.get("11_UBICACION")),
        "abs_inicio": floatv(raw.get("12_ABS INICIAL")) if abs(floatv(raw.get("12_ABS INICIAL")) or 0) < 10000 else None,
        "abs_final": floatv(raw.get("13_ABS FINAL")) if abs(floatv(raw.get("13_ABS FINAL")) or 0) < 10000 else None,
        "nodo_ini": strv(raw.get("14_NODO INICIAL")),
        "nodo_fin": strv(raw.get("15_NODO FINAL")),
        "acta_rpo_id": acta_lookup.get(acta_num) if acta_num else None,
        "coord_lat": floatv(raw.get("47_2_COORDENADA LATITUD")) if abs(floatv(raw.get("47_2_COORDENADA LATITUD")) or 0) < 10000 else None,
        "coord_lng": floatv(str(raw.get("47_1_COORDENADA GEO") or "").split(",")[-1].strip()) if raw.get("47_1_COORDENADA GEO") else None,
    }
    if pk_id_id is not None:
        payload["pk_id_id"] = pk_id_id
    for k, v in opt.items():
        if v is not None:
            payload[k] = v
    return payload


def build_reporte_payload_from_registro(
    grupo_num: int,
    raw: dict,
    pk_lookup: dict[str, int],
    acta_lookup: dict[int, int],
) -> dict:
    """Cabecera de reporte inferida desde una línea de registro (misma obra / grupo)."""
    pk_raw = strv(raw.get("05_PK-ID"))
    acta_num = parse_num_prefijo(raw.get("26_ACTA"))

    capitulo = strv(raw.get("04_1_CAPITULO")) or "Sin capitulo"
    descripcion = (
        strv(raw.get("24_DESCRIPCION ITEM"))
        or strv(raw.get("20_OBSERVACION"))
        or f"Reporte migrado Bubble #{grupo_num}"
    )
    pk_id_id = pk_lookup.get(pk_raw) if pk_raw else None

    payload = {
        "contrato_id": CONTRATO_ID,
        "numero_reporte": grupo_num,
        "descripcion_actividad": descripcion,
        "capitulo": capitulo,
        "estado": "Aprobados",
    }
    opt = {
        "civ": strv(raw.get("06_CIV")),
        "tramo": strv(raw.get("07_TRAMO")),
        "calzada": strv(raw.get("08_COSTADO")),
        "infraestructura": strv(raw.get("09_INFRAESTRUCTURA")),
        "margen": normalizar_margen(raw.get("10_MARGEN")),
        "ubicacion": strv(raw.get("11_UBICACION")),
        "abs_inicio": floatv(raw.get("12_ABS INICIAL")) if abs(floatv(raw.get("12_ABS INICIAL")) or 0) < 10000 else None,
        "abs_final": floatv(raw.get("13_ABS FINAL")) if abs(floatv(raw.get("13_ABS FINAL")) or 0) < 10000 else None,
        "nodo_ini": strv(raw.get("14_NODO INICIAL")),
        "nodo_fin": strv(raw.get("15_NODO FINAL")),
        "acta_rpo_id": acta_lookup.get(acta_num) if acta_num else None,
        "coord_lat": floatv(raw.get("47_2_COORDENADA LATITUD")),
        "coord_lng": floatv(str(raw.get("47_1_COORDENADA GEO") or "").split(",")[-1].strip()) if raw.get("47_1_COORDENADA GEO") else None,
    }
    if pk_id_id is not None:
        payload["pk_id_id"] = pk_id_id
    for k, v in opt.items():
        if v is not None:
            payload[k] = v
    return payload


def reporte_key(raw: dict):
    k = intv(raw.get("00_CONSECUTIVO"))
    if k is not None:
        return k
    return intv(raw.get("numero_reporte"))


def map_registro_row(
    r: dict,
    reporte_lookup: dict[int, dict],
    pk_lookup: dict[str, int],
    acta_lookup: dict[int, int],
    semana_lookup: dict[int, int],
) -> dict | None:
    num_reg = intv(r.get("01_NUMERO REGISTRO"))
    if num_reg is None:
        return None
    grupo = intv(r.get("Grupo Reporte"))
    rep_data = reporte_lookup.get(grupo) if grupo is not None else None
    if rep_data is None:
        return None

    pk_id_texto = strv(r.get("05_PK-ID"))
    acta_num = parse_num_prefijo(r.get("26_ACTA"))
    sem_num = parse_num_prefijo(r.get("27_SEMANA"))
    sem_apr_num = parse_num_prefijo(r.get("27_SEMANA_APROBACION"))

    old_imagen = strv(r.get("Old IMAGEN"))
    foto_url = ("https:" + old_imagen) if old_imagen else None
    foto_numero = intv(r.get("42_NUM IMAGEN"))
    if foto_numero is None:
        foto_numero = intv(r.get("42_IMAGEN"))
    if foto_numero is None:
        foto_numero = intv(r.get("42_imagen"))

    row = {
        "contrato_id": CONTRATO_ID,
        "reporte_id": rep_data["id"],
        "numero_registro": num_reg,
        "pk_id_id": pk_lookup.get(pk_id_texto) if pk_id_texto else None,
        "civ": strv(r.get("06_CIV")),
        "tramo": strv(r.get("07_TRAMO")),
        "calzada": strv(r.get("08_COSTADO")),
        "infraestructura": strv(r.get("09_INFRAESTRUCTURA")),
        "margen": strv(r.get("10_MARGEN")),
        "ubicacion": strv(r.get("11_UBICACION")),
        "abs_inicio": floatv(r.get("12_ABS INICIAL")) if abs(floatv(r.get("12_ABS INICIAL")) or 0) < 10000 else None,
        "abs_final": floatv(r.get("13_ABS FINAL")) if abs(floatv(r.get("13_ABS FINAL")) or 0) < 10000 else None,
        "nodo_ini": strv(r.get("14_NODO INICIAL")),
        "nodo_fin": strv(r.get("15_NODO FINAL")),
        "longitud": floatv(r.get("16_LONGITUD")) if abs(floatv(r.get("16_LONGITUD")) or 0) < 10000 else None,
        "ancho": floatv(r.get("17_ANCHO")),
        "espesor": floatv(r.get("18_ESPESOR")),
        "cantidad_total": floatv(r.get("19_CANTIDAD")),
        "observacion": strv(r.get("20_OBSERVACION")),
        "item_numero": strv(r.get("21_ITEM")),
        "vlr_unitario": floatv(r.get("22_VALOR UNITARIO")),
        "unidad": strv(r.get("23_UNIDAD")),
        "item_descripcion": strv(r.get("24_DESCRIPCION ITEM")),
        "costo_directo": floatv(r.get("25_COSTO DIRECTO")),
        "vlr_unitario_subcontratista": floatv(r.get("45_VALOR UNITARIO SUB CONTRATISTA")),
        "costo_directo_subcontratista": floatv(r.get("46_COSTO DIRECTO SUB CONTRATISTA")),
        "acta_rpo_id": acta_lookup.get(acta_num) if acta_num else None,
        "semana_id": semana_lookup.get(sem_num) if sem_num else None,
        "semana_aprobacion_id": semana_lookup.get(sem_apr_num) if sem_apr_num else None,
        "capitulo": strv(r.get("04_1_CAPITULO")),
        "subcontratista_id": rep_data.get("subcontratista_id"),
        "inspector_id": rep_data.get("inspector_id"),
        "nivel1_estado": normalizar_estado_validacion(r.get("30_1_ESTADO INSPECTOR")),
        "nivel2_estado": normalizar_estado_validacion(r.get("31_1_ESTADO RESIDENTE")),
        "nivel3_estado": normalizar_estado_validacion(r.get("32_1_ESTADO INTERVENTORIA")),
        "sub_estado": normalizar_estado_validacion(r.get("33_1_ESTADO SUB CONTRATISTA")),
        "foto_url": foto_url,
        "foto_numero": foto_numero,
        "enlace_soporte": strv(r.get("29_SOPORTE")),
        "coord_lat": floatv(r.get("47_2_COORDENADA LATITUD")) if abs(floatv(r.get("47_2_COORDENADA LATITUD")) or 0) < 10000 else None,
        "coord_lng": floatv(str(r.get("47_1_COORDENADA GEO") or "").split(",")[-1].strip()) if r.get("47_1_COORDENADA GEO") else None,
    }
    return {k: v for k, v in row.items() if v is not None}


def load_reporte_lookup(sb) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for r in paginar(
        sb,
        "so_reportes",
        {"contrato_id": CONTRATO_ID},
        "id, numero_reporte, subcontratista_id, inspector_id",
    ):
        nr = r.get("numero_reporte")
        if nr is not None:
            out[int(nr)] = {
                "id": r["id"],
                "subcontratista_id": r.get("subcontratista_id"),
                "inspector_id": r.get("inspector_id"),
            }
    return out


def main():
    print(f"Contrato destino (ClaraCore): {CONTRATO_ID}")
    if FILTRO_NUMERO_RPO is not None:
        print(
            f"Filtro por número RPO del acta (campos 26_ACTA / 26_ACTA_id): {FILTRO_NUMERO_RPO}"
        )
    else:
        print("Filtro por RPO: desactivado (se procesan todas las filas del archivo)")
    print(f"Directorio datos: {BUBBLE_DIR}")
    print(f"DRY_RUN={DRY_RUN}\n")

    path_rep = resolve_data_file(REPORTES_BASENAME, optional=True)
    path_reg = resolve_data_file(REGISTROS_BASENAME, optional=False)
    if path_rep:
        print(f"  Reportes (opcional, enriquece cabeceras por grupo): {path_rep.name}")
    else:
        print(
            "  Reportes: (archivo opcional no encontrado — cabeceras solo desde registros por Grupo Reporte)"
        )
    print(f"  Registros: {path_reg.name}\n")

    stats_pre = estadisticas_previas_registros(path_reg)
    print("Auditoría del archivo (registros) — antes de deduplicar por número:")
    print(f"  Líneas totales en archivo:        {stats_pre['total_lineas']}")
    print(f"  Tras filtro RPO (si aplica):      {stats_pre['lineas_tras_filtro']} líneas")
    if stats_pre["excluidas_por_filtro_rpo"]:
        print(f"  Excluidas solo por filtro RPO:    {stats_pre['excluidas_por_filtro_rpo']}")
    print(f"  Números de registro únicos:       {stats_pre['unicos_numero_registro']}")
    print(f"  Líneas duplicadas (mismo #):      {stats_pre['lineas_duplicadas_mismo_num']}")
    print(f"  Suma «25_COSTO DIRECTO» parseada: {stats_pre['suma_costo_directo_parseado']:,.2f}")
    print()

    # Archivo de grupos: sin filtro RPO (Bubble a veces no trae 26_ACTA_id igual que en registros).
    reportes_by_key = ndjson_last_wins(path_rep, reporte_key, None)

    registros_by_key = ndjson_last_wins(
        path_reg,
        lambda r: intv(r.get("01_NUMERO REGISTRO")),
        lambda r: pasa_filtro_rpo(r, "26_ACTA"),
    )

    # Un registro representativo por Grupo Reporte (mayor número de registro en el lote).
    rep_por_grupo: dict[int, dict] = {}
    for num_key in sorted(registros_by_key.keys()):
        r = registros_by_key[num_key]
        g = intv(r.get("Grupo Reporte"))
        if g is None:
            continue
        prev = rep_por_grupo.get(g)
        if prev is None:
            rep_por_grupo[g] = r
            continue
        prev_n = intv(prev.get("01_NUMERO REGISTRO")) or 0
        if num_key > prev_n:
            rep_por_grupo[g] = r

    grupos_desde_registros = set(rep_por_grupo.keys())
    grupos_union = sorted(grupos_desde_registros | set(reportes_by_key.keys()))

    print(
        f"Líneas únicas tras deduplicar (última gana): "
        f"filas archivo grupos={len(reportes_by_key)} registros={len(registros_by_key)}"
    )
    print(
        f"Grupos reporte distintos (desde registros): {len(grupos_desde_registros)} | "
        f"Total grupos a upsert en so_reportes: {len(grupos_union)}"
    )
    suma_costo_dedupe = sum(
        floatv(r.get("25_COSTO DIRECTO")) or 0 for r in registros_by_key.values()
    )
    print(
        f"Suma costo (deduplicado por # registro, última línea gana): {suma_costo_dedupe:,.2f}\n"
    )

    if DRY_RUN:
        print("SICOE_73_DRY_RUN activo — no se escribe en Supabase.")
        return 0

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    pk_lookup: dict[str, int] = {}
    for r in paginar(sb, "pk_ids", {"contrato_id": CONTRATO_ID}, "id, pk_id"):
        pk_lookup[str(r["pk_id"]).strip()] = r["id"]

    acta_lookup: dict[int, int] = {}
    for r in paginar(sb, "actas", {"contrato_id": CONTRATO_ID}, "id, numero_rpo"):
        if r.get("numero_rpo") is not None:
            acta_lookup[int(r["numero_rpo"])] = r["id"]

    semana_lookup: dict[int, int] = {}
    for r in paginar(sb, "so_semanas", {"contrato_id": CONTRATO_ID}, "id, numero_semana"):
        semana_lookup[int(r["numero_semana"])] = r["id"]

    # ── 1. Upsert reportes (uno por Grupo; archivo opcional pisa metadatos del registro) ──
    payloads_rep = []
    for g in grupos_union:
        if g in reportes_by_key:
            payloads_rep.append(
                build_reporte_payload(g, reportes_by_key[g], pk_lookup, acta_lookup)
            )
        elif g in rep_por_grupo:
            payloads_rep.append(
                build_reporte_payload_from_registro(
                    g, rep_por_grupo[g], pk_lookup, acta_lookup
                )
            )

    ok_rep = 0
    err_rep = 0
    if payloads_rep:
        for i in range(0, len(payloads_rep), LOTE):
            lote = payloads_rep[i : i + LOTE]
            try:
                sb.table("so_reportes").upsert(
                    lote, on_conflict="contrato_id,numero_reporte"
                ).execute()
                ok_rep += len(lote)
            except Exception as e:
                err_rep += len(lote)
                print(f"ERROR upsert reportes lote {i // LOTE + 1}: {e}")
            time.sleep(PAUSE_S)
            print(f"  Reportes: {min(i + LOTE, len(payloads_rep))}/{len(payloads_rep)}")
    desd_archivo = sum(1 for g in grupos_union if g in reportes_by_key)
    desd_reg = sum(1 for g in grupos_union if g not in reportes_by_key)
    print(
        f"\nReportes upsert: total={len(payloads_rep)} "
        f"(desde archivo grupos={desd_archivo}, inferidos desde registros={desd_reg}) | "
        f"filas_ok={ok_rep} filas_con_error={err_rep}"
    )

    reporte_lookup = load_reporte_lookup(sb)

    # ── 2. Upsert registros ───────────────────────────────────────────────────
    rows_reg: list[dict] = []
    sin_numero_registro = 0
    sin_grupo_o_reporte = 0
    for r in registros_by_key.values():
        if intv(r.get("01_NUMERO REGISTRO")) is None:
            sin_numero_registro += 1
            continue
        grupo = intv(r.get("Grupo Reporte"))
        if grupo is None or grupo not in reporte_lookup:
            sin_grupo_o_reporte += 1
            continue
        row = map_registro_row(r, reporte_lookup, pk_lookup, acta_lookup, semana_lookup)
        if row is None:
            sin_grupo_o_reporte += 1
            continue
        rows_reg.append(row)

    suma_costo_payload = sum(float(r.get("costo_directo") or 0) for r in rows_reg)
    print(
        f"Suma costo_directo en filas a upsert (tras mapeo): {suma_costo_payload:,.2f} "
        f"({len(rows_reg)} filas)\n"
    )

    ok_r = 0
    err_r = 0
    errs_det: list[tuple] = []
    for i in range(0, len(rows_reg), LOTE):
        lote = rows_reg[i : i + LOTE]
        try:
            sb.table("so_registros").upsert(
                lote, on_conflict="contrato_id,numero_registro"
            ).execute()
            ok_r += len(lote)
        except Exception as e:
            print(f"WARN lote registros {i // LOTE + 1} falló ({str(e)[:180]}); reintento fila a fila…")
            for row in lote:
                try:
                    sb.table("so_registros").upsert(
                        [row], on_conflict="contrato_id,numero_registro"
                    ).execute()
                    ok_r += 1
                except Exception as e2:
                    err_r += 1
                    errs_det.append((row.get("numero_registro"), str(e2)[:220]))
        time.sleep(PAUSE_S)
        print(f"  Registros: {min(i + LOTE, len(rows_reg))}/{len(rows_reg)}  ok={ok_r} err={err_r}")

    print("\n========================================")
    print("  Resumen migración sicoe_73")
    print("========================================")
    print(f"  Grupos en so_reportes (upsert): {len(grupos_union)}")
    print(f"  Filas archivo grupos (opcional): {len(reportes_by_key)}")
    print(f"  Registros (líneas únicas archivo): {len(registros_by_key)}")
    print(f"  Registros mapeados a upsert: {len(rows_reg)}")
    print(f"  Omitidos sin número registro: {sin_numero_registro}")
    print(f"  Omitidos sin grupo / reporte en BD: {sin_grupo_o_reporte}")
    print(f"  Registros upsert OK: {ok_r}  errores puntuales: {err_r}")
    print(f"  Suma costo en payload enviado: {suma_costo_payload:,.2f}")
    if errs_det:
        print("  Primeros errores por número registro:")
        for num, msg in errs_det[:15]:
            print(f"    #{num}: {msg}")
        if len(errs_det) > 15:
            print(f"    … y {len(errs_det) - 15} más")
    print("========================================")
    return 0 if err_rep == 0 and err_r == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        sys.exit(2)