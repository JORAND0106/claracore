# Bubble/actualizar_pkid_foto.py
"""
Lee registros_sicoe.ndjson, construye un lookup de pk_ids en Supabase (contrato_id=2)
y actualiza so_registros con pk_id_id y/o foto_url, uno por uno.
"""

import json
import time
import os
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────────────
CONTRATO_ID   = 2
NDJSON_PATH   = Path(__file__).parent / "registros_sicoe.ndjson"
PAUSE_SECONDS = 0.05
LOG_CADA      = 1000

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)

# ── 1. Construir diccionario pk_id_texto → pk_ids.id ────────────────────────
print("Cargando pk_ids desde Supabase...")
pk_lookup: dict[str, int] = {}
offset = 0
while True:
    rows = (
        supabase.table("pk_ids")
        .select("id, pk_id")
        .eq("contrato_id", CONTRATO_ID)
        .range(offset, offset + 999)
        .execute()
        .data
    )
    for r in rows:
        pk_lookup[str(r["pk_id"]).strip()] = r["id"]
    if len(rows) < 1000:
        break
    offset += 1000
print(f"  >> {len(pk_lookup)} pk_ids cargados\n")

# ── 2. Leer ndjson ───────────────────────────────────────────────────────────
registros = []
with open(NDJSON_PATH, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            registros.append(json.loads(line))
print(f"Registros en ndjson: {len(registros)}\n")

# ── 3. Procesar y actualizar ─────────────────────────────────────────────────
actualizados = 0
sin_pk       = 0
sin_foto     = 0
errores      = 0

for i, reg in enumerate(registros, start=1):
    numero_registro = str(reg.get("01_NUMERO REGISTRO", "")).strip()
    pk_id_texto     = str(reg.get("05_PK-ID", "")).strip()
    old_imagen      = str(reg.get("Old IMAGEN", "")).strip()

    # Resolver pk_id_id
    pk_id_id = pk_lookup.get(pk_id_texto) if pk_id_texto else None

    # Resolver foto_url
    foto_url = ("https:" + old_imagen) if old_imagen else None

    # Saltar si ambos vacíos
    if pk_id_id is None and foto_url is None:
        if not pk_id_texto:
            sin_pk += 1
        if not old_imagen:
            sin_foto += 1
        continue

    if not pk_id_texto or pk_id_id is None:
        sin_pk += 1
    if not old_imagen:
        sin_foto += 1

    # Construir payload
    payload: dict = {"contrato_id": CONTRATO_ID}
    if pk_id_id is not None:
        payload["pk_id_id"] = pk_id_id
    if foto_url is not None:
        payload["foto_url"] = foto_url

    # Ejecutar UPDATE
    try:
        supabase.table("so_registros") \
            .update(payload) \
            .eq("contrato_id", CONTRATO_ID) \
            .eq("numero_registro", numero_registro) \
            .execute()
        actualizados += 1
    except Exception as e:
        errores += 1
        print(f"  ERROR reg {numero_registro}: {e}")

    # Pausa anti-rate-limit
    time.sleep(PAUSE_SECONDS)

    # Log de progreso
    if i % LOG_CADA == 0:
        print(f"  Procesados: {i}/{len(registros)}  |  actualizados={actualizados}  errores={errores}")

# ── 4. Reporte final ─────────────────────────────────────────────────────────
print("\n======================================")
print(f"  Total registros ndjson : {len(registros)}")
print(f"  Actualizados           : {actualizados}")
print(f"  Sin pk_id en lookup    : {sin_pk}")
print(f"  Sin foto               : {sin_foto}")
print(f"  Errores                : {errores}")
print("======================================")
