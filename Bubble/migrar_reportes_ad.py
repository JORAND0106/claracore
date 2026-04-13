# Bubble/migrar_reportes_ad.py
"""
PASO 1: Crea en so_reportes los Grupo Reporte faltantes usando Grupo_Reportes_bubble.ndjson.
Se detiene y reporta el resumen antes de tocar so_registros.
"""

import json
import re
import time
import os
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────────
CONTRATO_ID    = 2
NDJSON_AD      = Path(__file__).parent / "registros_sicoe_ad.ndjson"
NDJSON_GRUPOS  = Path(__file__).parent / "Grupo_Reportes_bubble.ndjson"
PAUSE_S        = 0.12

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ── Helpers ────────────────────────────────────────────────────────────────────
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

MARGEN_MAP = {
    "derecho":    "Derecha",
    "izquierdo":  "Izquierda",
    "unico":      "Única",
    "unica":      "Única",
}

def normalizar_margen(v):
    """Normaliza valores de margen al formato del constraint de so_reportes."""
    s = strv(v)
    if not s:
        return None
    key = s.lower().replace("\xfa", "u")  # único -> unico
    return MARGEN_MAP.get(key, s)

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

# ── 1. Cargar lookups desde Supabase ──────────────────────────────────────────
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

reporte_lookup: set[int] = set()
for r in paginar("so_reportes", {"contrato_id": CONTRATO_ID}, "numero_reporte"):
    nr = r.get("numero_reporte")
    if nr is not None:
        reporte_lookup.add(int(nr))
print(f"  reportes    : {len(reporte_lookup)}")

# ── 2. Leer registros_sicoe_ad.ndjson → grupos únicos ─────────────────────────
print("\nLeyendo registros_sicoe_ad.ndjson...")
grupos_en_ad: set[int] = set()
with open(NDJSON_AD, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        g = intv(r.get("Grupo Reporte"))
        if g is not None:
            grupos_en_ad.add(g)
print(f"  Grupos Reporte distintos en ndjson_ad : {len(grupos_en_ad)}")

grupos_faltantes: set[int] = grupos_en_ad - reporte_lookup
print(f"  Ya existentes en so_reportes          : {len(grupos_en_ad - grupos_faltantes)}")
print(f"  Faltantes a crear                     : {len(grupos_faltantes)}")
print(f"  Faltantes: {sorted(grupos_faltantes)[:30]}{'...' if len(grupos_faltantes) > 30 else ''}\n")

if not grupos_faltantes:
    print("No hay reportes faltantes. Nada que crear.")
    exit(0)

# ── 3. Cargar Grupo_Reportes_bubble.ndjson ────────────────────────────────────
print("Cargando Grupo_Reportes_bubble.ndjson...")
grupos_dict: dict[int, dict] = {}
with open(NDJSON_GRUPOS, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        consec = intv(r.get("00_CONSECUTIVO"))
        if consec is not None:
            grupos_dict[consec] = r
print(f"  Registros cargados : {len(grupos_dict)}")

encontrados   = grupos_faltantes & set(grupos_dict.keys())
no_en_grupos  = grupos_faltantes - set(grupos_dict.keys())
print(f"  Faltantes encontrados en Grupo_Reportes : {len(encontrados)}")
print(f"  Faltantes SIN entrada en Grupo_Reportes : {len(no_en_grupos)}")
if no_en_grupos:
    print(f"    => {sorted(no_en_grupos)}\n")

# ── 4. Crear reportes faltantes ───────────────────────────────────────────────
print("\nCreando reportes faltantes en so_reportes...")
creados    = 0
ya_existe  = 0
sin_datos  = 0
errores    = 0
errores_det = []

for grupo_num in sorted(grupos_faltantes):
    raw = grupos_dict.get(grupo_num)

    if raw is None:
        # No hay entrada en Grupo_Reportes: crear reporte mínimo
        capitulo     = "Sin capitulo"
        descripcion  = f"Reporte migrado Bubble #{grupo_num}"
        pk_id_id     = None
        civ = tramo = calzada = infraestructura = margen = ubicacion = None
        abs_inicio = abs_final = nodo_ini = nodo_fin = None
        acta_rpo_id  = None
        coord_lat = coord_lng = None
        sin_datos += 1
    else:
        pk_raw      = strv(raw.get("05_PK-ID_id"))
        acta_raw    = strv(raw.get("26_ACTA_id"))
        acta_num    = parse_num_prefijo(acta_raw)

        capitulo    = strv(raw.get("04_1_CAPITULO_id")) or "Sin capitulo"
        descripcion = strv(raw.get("01_DESCRIPCION")) or f"Reporte migrado Bubble #{grupo_num}"
        pk_id_id    = pk_lookup.get(pk_raw) if pk_raw else None
        civ         = strv(raw.get("06_CIV_id"))
        tramo       = strv(raw.get("07_TRAMO"))
        calzada     = strv(raw.get("08_COSTADO"))
        infraestructura = strv(raw.get("09_INFRAESTRUCTURA"))
        margen      = normalizar_margen(raw.get("10_MARGEN"))
        ubicacion   = strv(raw.get("11_UBICACION"))
        abs_inicio  = floatv(raw.get("12_ABS INICIAL"))
        abs_final   = floatv(raw.get("13_ABS FINAL"))
        nodo_ini    = strv(raw.get("14_NODO INICIAL"))
        nodo_fin    = strv(raw.get("15_NODO FINAL"))
        acta_rpo_id = acta_lookup.get(acta_num) if acta_num else None
        coord_lat   = floatv(raw.get("47_2_COORDENADA LATITUD"))
        coord_lng   = floatv(raw.get("47_1_COORDENADA GEO"))

    payload = {
        "contrato_id":           CONTRATO_ID,
        "numero_reporte":        grupo_num,
        "descripcion_actividad": descripcion,
        "capitulo":              capitulo,
        "estado":                "Aprobados",
    }
    if pk_id_id     is not None: payload["pk_id_id"]     = pk_id_id
    if civ          is not None: payload["civ"]           = civ
    if tramo        is not None: payload["tramo"]         = tramo
    if calzada      is not None: payload["calzada"]       = calzada
    if infraestructura is not None: payload["infraestructura"] = infraestructura
    if margen       is not None: payload["margen"]        = margen
    if ubicacion    is not None: payload["ubicacion"]     = ubicacion
    if abs_inicio   is not None: payload["abs_inicio"]    = abs_inicio
    if abs_final    is not None: payload["abs_final"]     = abs_final
    if nodo_ini     is not None: payload["nodo_ini"]      = nodo_ini
    if nodo_fin     is not None: payload["nodo_fin"]      = nodo_fin
    if acta_rpo_id  is not None: payload["acta_rpo_id"]   = acta_rpo_id
    if coord_lat    is not None: payload["coord_lat"]      = coord_lat
    if coord_lng    is not None: payload["coord_lng"]      = coord_lng

    try:
        sb.table("so_reportes").insert(payload).execute()
        creados += 1
    except Exception as e:
        msg = str(e)
        if "duplicate" in msg.lower() or "23505" in msg:
            ya_existe += 1
        else:
            errores += 1
            errores_det.append(f"  #{grupo_num}: {msg[:120]}")

    time.sleep(PAUSE_S)

# ── 5. Resumen Paso 1 ─────────────────────────────────────────────────────────
print("\n========================================")
print("  PASO 1 — RESUMEN")
print("========================================")
print(f"  Grupos faltantes identificados  : {len(grupos_faltantes)}")
print(f"    Con datos en Grupo_Reportes   : {len(encontrados)}")
print(f"    Sin datos (minimo)            : {sin_datos}")
print(f"  Reportes creados exitosamente  : {creados}")
print(f"  Ya existian (skip)             : {ya_existe}")
print(f"  Errores                        : {errores}")
if errores_det:
    for d in errores_det:
        print(d)
print("========================================")
print("\nPASO 1 completado. Confirma para ejecutar PASO 2 (insertar registros huerfanos).")
