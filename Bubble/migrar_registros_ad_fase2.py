# Bubble/migrar_registros_ad_fase2.py
"""
Fase 2 de la migracion registros_sicoe_ad.ndjson:
  1. Detecta Grupo Reporte sin reporte en so_reportes (contrato_id=2)
  2. Crea esos reportes minimos en so_reportes
  3. Inserta los registros que antes fueron saltados por sin_reporte_id
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
PAUSE_S     = 0.15

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
    if not s:
        return None
    m = re.match(r"^(\d+)", str(s).strip())
    return int(m.group(1)) if m else None

def paginar(tabla, filtros: dict, columnas: str = "*"):
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

pk_lookup: dict[str, int] = {}
for r in paginar("pk_ids", {"contrato_id": CONTRATO_ID}, "id, pk_id"):
    pk_lookup[str(r["pk_id"]).strip()] = r["id"]
print(f"  pk_ids      : {len(pk_lookup)}")

acta_lookup: dict[int, int] = {}
for r in paginar("actas", {"contrato_id": CONTRATO_ID}, "id, numero_rpo"):
    if r.get("numero_rpo") is not None:
        acta_lookup[int(r["numero_rpo"])] = r["id"]
print(f"  actas       : {len(acta_lookup)}")

semana_lookup: dict[int, int] = {}
for r in paginar("so_semanas", {"contrato_id": CONTRATO_ID}, "id, numero_semana"):
    semana_lookup[int(r["numero_semana"])] = r["id"]
print(f"  semanas     : {len(semana_lookup)}")

reporte_lookup: dict[int, dict] = {}
for r in paginar("so_reportes", {"contrato_id": CONTRATO_ID}, "id, numero_reporte, subcontratista_id, inspector_id"):
    nr = r.get("numero_reporte")
    if nr is not None:
        reporte_lookup[int(nr)] = {
            "id":                r["id"],
            "subcontratista_id": r.get("subcontratista_id"),
            "inspector_id":      r.get("inspector_id"),
        }
print(f"  reportes    : {len(reporte_lookup)}")

existentes: set[int] = set()
for r in paginar("so_registros", {"contrato_id": CONTRATO_ID}, "numero_registro"):
    if r.get("numero_registro") is not None:
        existentes.add(int(r["numero_registro"]))
print(f"  existentes  : {len(existentes)}\n")

# ── 2. Leer ndjson ────────────────────────────────────────────────────────────
registros_raw = []
with open(NDJSON_PATH, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            registros_raw.append(json.loads(line))
print(f"Registros en ndjson : {len(registros_raw)}\n")

# ── 3. Identificar registros sin reporte_id ───────────────────────────────────
sin_reporte_rows = []
for r in registros_raw:
    num_reg = intv(r.get("01_NUMERO REGISTRO"))
    if num_reg is None or num_reg in existentes:
        continue
    grupo = intv(r.get("Grupo Reporte"))
    if grupo is None or grupo in reporte_lookup:
        continue
    sin_reporte_rows.append(r)

# Grupos unicos faltantes con metadata del primer registro de cada grupo
grupos_faltantes: dict[int, dict] = {}
for r in sin_reporte_rows:
    grupo = intv(r.get("Grupo Reporte"))
    if grupo not in grupos_faltantes:
        grupos_faltantes[grupo] = r  # primer registro como referencia

print(f"Registros sin reporte_id : {len(sin_reporte_rows)}")
print(f"Grupos Reporte faltantes : {len(grupos_faltantes)}")
print(f"  Grupos: {sorted(grupos_faltantes.keys())}\n")

# ── 4. Crear reportes faltantes en so_reportes ────────────────────────────────
print("Creando reportes faltantes en so_reportes...")
reportes_creados = 0
reportes_error   = 0

for grupo_num, ref in sorted(grupos_faltantes.items()):
    capitulo = strv(ref.get("04_1_CAPITULO")) or "Sin capitulo"
    descripcion = f"Reporte migrado Bubble #{grupo_num}"

    payload = {
        "contrato_id":           CONTRATO_ID,
        "numero_reporte":        grupo_num,
        "descripcion_actividad": descripcion,
        "capitulo":              capitulo,
    }

    try:
        result = sb.table("so_reportes").insert(payload).execute().data
        if result:
            new_id = result[0]["id"]
            reporte_lookup[grupo_num] = {
                "id":                new_id,
                "subcontratista_id": None,
                "inspector_id":      None,
            }
            reportes_creados += 1
            print(f"  Creado reporte #{grupo_num}  cap={capitulo}  id={new_id}")
        else:
            reportes_error += 1
            print(f"  ERROR creando reporte #{grupo_num}: resultado vacio")
    except Exception as e:
        reportes_error += 1
        print(f"  ERROR creando reporte #{grupo_num}: {e}")

    time.sleep(0.1)

print(f"\nReportes creados : {reportes_creados}")
print(f"Errores          : {reportes_error}\n")

if reportes_error > 0:
    print("Hay errores en la creacion de reportes. Abortando insercion.")
    exit(1)

# ── 5. Mapear e insertar registros antes saltados ─────────────────────────────
print("Mapeando registros a insertar...")
a_insertar   = []
sin_reporte2 = 0

for r in sin_reporte_rows:
    num_reg  = intv(r.get("01_NUMERO REGISTRO"))
    grupo    = intv(r.get("Grupo Reporte"))
    rep_data = reporte_lookup.get(grupo) if grupo else None
    if rep_data is None:
        sin_reporte2 += 1
        continue

    reporte_id        = rep_data["id"]
    subcontratista_id = rep_data["subcontratista_id"]
    inspector_id      = rep_data["inspector_id"]

    pk_id_texto = strv(r.get("05_PK-ID"))
    acta_num    = parse_num_prefijo(r.get("26_ACTA"))
    sem_num     = parse_num_prefijo(r.get("27_SEMANA"))
    sem_apr_num = parse_num_prefijo(r.get("27_SEMANA_APROBACION"))

    old_imagen = strv(r.get("Old IMAGEN"))
    foto_url   = ("https:" + old_imagen) if old_imagen else None

    row = {
        "contrato_id":      CONTRATO_ID,
        "reporte_id":       reporte_id,
        "numero_registro":  num_reg,

        "pk_id_id":         pk_lookup.get(pk_id_texto) if pk_id_texto else None,
        "civ":              strv(r.get("06_CIV")),
        "tramo":            strv(r.get("07_TRAMO")),
        "calzada":          strv(r.get("08_COSTADO")),
        "infraestructura":  strv(r.get("09_INFRAESTRUCTURA")),
        "margen":           strv(r.get("10_MARGEN")),
        "ubicacion":        strv(r.get("11_UBICACION")),
        "abs_inicio":       floatv(r.get("12_ABS INICIAL")),
        "abs_final":        floatv(r.get("13_ABS FINAL")),
        "nodo_ini":         strv(r.get("14_NODO INICIAL")),
        "nodo_fin":         strv(r.get("15_NODO FINAL")),

        "longitud":         floatv(r.get("16_LONGITUD")),
        "ancho":            floatv(r.get("17_ANCHO")),
        "espesor":          floatv(r.get("18_ESPESOR")),
        "cantidad":         floatv(r.get("19_CANTIDAD")),
        "cantidad_total":   floatv(r.get("19_CANTIDAD")),
        "observacion":      strv(r.get("20_OBSERVACION")),

        "item_numero":          strv(r.get("21_ITEM")),
        "vlr_unitario":         floatv(r.get("22_VALOR UNITARIO")),
        "unidad":               strv(r.get("23_UNIDAD")),
        "item_descripcion":     strv(r.get("24_DESCRIPCION ITEM")),
        "costo_directo":        floatv(r.get("25_COSTO DIRECTO")),

        "vlr_unitario_subcontratista":  floatv(r.get("45_VALOR UNITARIO SUB CONTRATISTA")),
        "costo_directo_subcontratista": floatv(r.get("46_COSTO DIRECTO SUB CONTRATISTA")),

        "acta_rpo_id":          acta_lookup.get(acta_num)      if acta_num      else None,
        "semana_id":            semana_lookup.get(sem_num)     if sem_num       else None,
        "semana_aprobacion_id": semana_lookup.get(sem_apr_num) if sem_apr_num   else None,

        "capitulo":          strv(r.get("04_1_CAPITULO")),
        "subcontratista_id": subcontratista_id,
        "inspector_id":      inspector_id,

        "nivel1_estado":    strv(r.get("30_1_ESTADO INSPECTOR")),
        "nivel2_estado":    strv(r.get("31_1_ESTADO RESIDENTE")),
        "nivel3_estado":    strv(r.get("32_1_ESTADO INTERVENTORIA")),
        "sub_estado":       strv(r.get("33_1_ESTADO SUB CONTRATISTA")),

        "foto_url":         foto_url,
        "enlace_soporte":   strv(r.get("29_SOPORTE")),

        "coord_lat":        floatv(r.get("47_2_COORDENADA LATITUD")),
        "coord_lng":        floatv(r.get("47_1_COORDENADA GEO")),
    }

    row = {k: v for k, v in row.items() if v is not None}
    a_insertar.append(row)

print(f"A insertar           : {len(a_insertar)}")
if sin_reporte2:
    print(f"Aun sin reporte_id   : {sin_reporte2}")
print()

# ── 6. Insertar uno por uno, saltando duplicados ──────────────────────────────
insertados = 0
saltados   = 0
errores    = 0
LOG_CADA   = 100

for i, row in enumerate(a_insertar, start=1):
    try:
        sb.table("so_registros").insert(row).execute()
        insertados += 1
    except Exception as e:
        msg = str(e)
        if "23505" in msg or "duplicate key" in msg.lower():
            saltados += 1
        else:
            errores += 1
            print(f"  ERROR reg {row.get('numero_registro')}: {msg[:120]}")

    time.sleep(PAUSE_S)

    if i % LOG_CADA == 0:
        print(f"  Progreso: {i}/{len(a_insertar)}  insertados={insertados}  saltados={saltados}  errores={errores}")

# ── 7. Resumen final ──────────────────────────────────────────────────────────
print("\n======================================")
print(f"  Reportes nuevos creados  : {reportes_creados}")
print(f"  Registros insertados     : {insertados}")
print(f"  Saltados (duplicados)    : {saltados}")
print(f"  Errores                  : {errores}")
print("======================================")
