# Bubble/migrar_registros_ad.py
"""
Lee registros_sicoe_ad.ndjson, salta los que ya existen en so_registros
(contrato_id=2) por numero_registro, e inserta los restantes en lotes de 500.

Mapeo idéntico a migrar_registros_completo.py + 5 campos nuevos:
  capitulo, margen, semana_aprobacion_id,
  vlr_unitario_subcontratista, costo_directo_subcontratista
"""

import json
import time
import re
import os
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
CONTRATO_ID = 2
NDJSON_PATH = Path(__file__).parent / "registros_sicoe_ad.ndjson"
LOTE        = 500
PAUSE_S     = 0.15   # pausa entre lotes (anti-rate-limit)

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ── Helpers ───────────────────────────────────────────────────────────────────
def floatv(v):
    try:
        return float(v) if v not in (None, "", "null") else None
    except Exception:
        return None

def intv(v):
    try:
        return int(float(v)) if v not in (None, "", "null") else None
    except Exception:
        return None

def strv(v):
    s = str(v).strip() if v is not None else ""
    return s if s else None

def parse_num_prefijo(s):
    """'09_IDU-1551-2017' -> 9  |  '40_IDU-1551-2017' -> 40  |  None si no parsea."""
    if not s:
        return None
    m = re.match(r"^(\d+)", str(s).strip())
    return int(m.group(1)) if m else None

def paginar(tabla, filtros: dict, columnas: str = "*"):
    """Devuelve todos los registros de una tabla con paginacion de 1000."""
    todos, off = [], 0
    while True:
        q = sb.table(tabla).select(columnas)
        for k, v in filtros.items():
            q = q.eq(k, v)
        rows = q.range(off, off + 999).execute().data
        todos.extend(rows)
        if len(rows) < 1000:
            break
        off += 1000
    return todos

# ── 1. Pre-cargar lookups ─────────────────────────────────────────────────────
print("Cargando lookups desde Supabase...")

# pk_ids: pk_id texto -> id
pk_lookup: dict[str, int] = {}
for r in paginar("pk_ids", {"contrato_id": CONTRATO_ID}, "id, pk_id"):
    pk_lookup[str(r["pk_id"]).strip()] = r["id"]
print(f"  pk_ids             : {len(pk_lookup)}")

# actas: numero_rpo (int) -> actas.id
acta_lookup: dict[int, int] = {}
for r in paginar("actas", {"contrato_id": CONTRATO_ID}, "id, numero_rpo"):
    if r.get("numero_rpo") is not None:
        acta_lookup[int(r["numero_rpo"])] = r["id"]
print(f"  actas              : {len(acta_lookup)}")

# so_semanas: numero_semana -> id
semana_lookup: dict[int, int] = {}
for r in paginar("so_semanas", {"contrato_id": CONTRATO_ID}, "id, numero_semana"):
    semana_lookup[int(r["numero_semana"])] = r["id"]
print(f"  semanas            : {len(semana_lookup)}")

# so_reportes: numero_reporte -> {id, subcontratista_id, inspector_id}
reporte_lookup: dict[int, dict] = {}
for r in paginar(
    "so_reportes",
    {"contrato_id": CONTRATO_ID},
    "id, numero_reporte, subcontratista_id, inspector_id",
):
    nr = r.get("numero_reporte")
    if nr is not None:
        reporte_lookup[int(nr)] = {
            "id":               r["id"],
            "subcontratista_id": r.get("subcontratista_id"),
            "inspector_id":      r.get("inspector_id"),
        }
print(f"  reportes           : {len(reporte_lookup)}")

# numero_registro ya existentes en so_registros
existentes: set[int] = set()
for r in paginar("so_registros", {"contrato_id": CONTRATO_ID}, "numero_registro"):
    if r.get("numero_registro") is not None:
        existentes.add(int(r["numero_registro"]))
print(f"  existentes en BD   : {len(existentes)}\n")

# ── 2. Leer ndjson ────────────────────────────────────────────────────────────
registros_raw = []
with open(NDJSON_PATH, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            registros_raw.append(json.loads(line))
print(f"Registros en ndjson  : {len(registros_raw)}\n")

# ── 3. Mapear y filtrar ───────────────────────────────────────────────────────
a_insertar   = []
saltados_dup = 0   # ya existen en BD
sin_reporte  = 0   # no se encontro reporte_id

for r in registros_raw:
    num_reg = intv(r.get("01_NUMERO REGISTRO"))
    if num_reg is None:
        saltados_dup += 1
        continue

    # Saltar duplicados
    if num_reg in existentes:
        saltados_dup += 1
        continue

    # Resolver reporte_id (Grupo Reporte = numero_reporte del so_reporte)
    grupo       = intv(r.get("Grupo Reporte"))
    rep_data    = reporte_lookup.get(grupo) if grupo else None
    if rep_data is None:
        sin_reporte += 1
        continue
    reporte_id     = rep_data["id"]
    subcontratista_id = rep_data["subcontratista_id"]
    inspector_id      = rep_data["inspector_id"]

    # Resolver FKs de tiempo
    pk_id_texto = strv(r.get("05_PK-ID"))
    acta_num    = parse_num_prefijo(r.get("26_ACTA"))
    sem_num     = parse_num_prefijo(r.get("27_SEMANA"))
    sem_apr_num = parse_num_prefijo(r.get("27_SEMANA_APROBACION"))

    # Foto URL
    old_imagen = strv(r.get("Old IMAGEN"))
    foto_url   = ("https:" + old_imagen) if old_imagen else None

    row = {
        # ── Claves obligatorias ────────────────────────────────────────────
        "contrato_id":      CONTRATO_ID,
        "reporte_id":       reporte_id,
        "numero_registro":  num_reg,

        # ── Localización ──────────────────────────────────────────────────
        "pk_id_id":         pk_lookup.get(pk_id_texto) if pk_id_texto else None,
        "civ":              strv(r.get("06_CIV")),
        "tramo":            strv(r.get("07_TRAMO")),
        "calzada":          strv(r.get("08_COSTADO")),
        "infraestructura":  strv(r.get("09_INFRAESTRUCTURA")),
        "margen":           strv(r.get("10_MARGEN")),           # NUEVO
        "ubicacion":        strv(r.get("11_UBICACION")),
        "abs_inicio":       floatv(r.get("12_ABS INICIAL")),
        "abs_final":        floatv(r.get("13_ABS FINAL")),
        "nodo_ini":         strv(r.get("14_NODO INICIAL")),
        "nodo_fin":         strv(r.get("15_NODO FINAL")),

        # ── Medición ──────────────────────────────────────────────────────
        "longitud":         floatv(r.get("16_LONGITUD")),
        "ancho":            floatv(r.get("17_ANCHO")),
        "espesor":          floatv(r.get("18_ESPESOR")),
        "cantidad":         floatv(r.get("19_CANTIDAD")),
        "cantidad_total":   floatv(r.get("19_CANTIDAD")),
        "observacion":      strv(r.get("20_OBSERVACION")),

        # ── Ítem ──────────────────────────────────────────────────────────
        "item_numero":          strv(r.get("21_ITEM")),
        "vlr_unitario":         floatv(r.get("22_VALOR UNITARIO")),
        "unidad":               strv(r.get("23_UNIDAD")),
        "item_descripcion":     strv(r.get("24_DESCRIPCION ITEM")),
        "costo_directo":        floatv(r.get("25_COSTO DIRECTO")),

        # ── Subcontratista (valores económicos) ───────────────────────────
        "vlr_unitario_subcontratista":  floatv(r.get("45_VALOR UNITARIO SUB CONTRATISTA")),  # NUEVO
        "costo_directo_subcontratista": floatv(r.get("46_COSTO DIRECTO SUB CONTRATISTA")),   # NUEVO

        # ── FK temporales ─────────────────────────────────────────────────
        "acta_rpo_id":          acta_lookup.get(acta_num)    if acta_num    else None,
        "semana_id":            semana_lookup.get(sem_num)   if sem_num     else None,
        "semana_aprobacion_id": semana_lookup.get(sem_apr_num) if sem_apr_num else None,  # NUEVO

        # ── Clasificación ────────────────────────────────────────────────
        "capitulo":         strv(r.get("04_1_CAPITULO")),          # NUEVO
        "subcontratista_id": subcontratista_id,
        "inspector_id":     inspector_id,

        # ── Estados de validación ─────────────────────────────────────────
        "nivel1_estado":    strv(r.get("30_1_ESTADO INSPECTOR")),
        "nivel2_estado":    strv(r.get("31_1_ESTADO RESIDENTE")),
        "nivel3_estado":    strv(r.get("32_1_ESTADO INTERVENTORIA")),
        "sub_estado":       strv(r.get("33_1_ESTADO SUB CONTRATISTA")),

        # ── Foto y soporte ────────────────────────────────────────────────
        "foto_url":         foto_url,
        "enlace_soporte":   strv(r.get("29_SOPORTE")),

        # ── Coordenadas ───────────────────────────────────────────────────
        "coord_lat":        floatv(r.get("47_2_COORDENADA LATITUD")),
        "coord_lng":        floatv(r.get("47_1_COORDENADA GEO")),
    }

    # Eliminar Nones para no pisar defaults de la BD
    row = {k: v for k, v in row.items() if v is not None}
    a_insertar.append(row)

saltados_total = saltados_dup + sin_reporte
print(f"A insertar           : {len(a_insertar)}")
print(f"Saltados total       : {saltados_total}")
print(f"  Duplicados (en BD) : {saltados_dup}")
print(f"  Sin reporte_id     : {sin_reporte}")
print()

# ── 4. Insertar en lotes de 500 ───────────────────────────────────────────────
insertados = 0
errores    = 0

for i in range(0, len(a_insertar), LOTE):
    lote = a_insertar[i:i + LOTE]
    try:
        sb.table("so_registros").insert(lote).execute()
        insertados += len(lote)
    except Exception as e:
        errores += len(lote)
        print(f"  ERROR lote {i // LOTE + 1}: {e}")

    time.sleep(PAUSE_S)

    done = min(i + LOTE, len(a_insertar))
    print(f"  Progreso: {done}/{len(a_insertar)}  insertados={insertados}  errores={errores}")

# ── 5. Resumen final ──────────────────────────────────────────────────────────
print("\n======================================")
print(f"  Total en ndjson          : {len(registros_raw)}")
print(f"  Insertados               : {insertados}")
print(f"  Saltados total           : {saltados_total}")
print(f"    Duplicados (ya en BD)  : {saltados_dup}")
print(f"    Sin reporte_id         : {sin_reporte}")
print(f"  Errores                  : {errores}")
print("======================================")
