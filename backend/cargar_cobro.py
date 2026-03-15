import pandas as pd
from supabase import create_client
import os
from dotenv import load_dotenv
import math

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

CONTRATO_ID = 2
ARCHIVO_CSV = "cobro.txt"  # pon aquí el nombre de tu archivo
BATCH = 500

# Leer CSV detectando encoding
try:
    df = pd.read_csv(ARCHIVO_CSV, encoding='utf-8', 
                     engine='python', 
                     quotechar='"',
                     quoting=0,
                     sep=',',
                     on_bad_lines='warn')
except:
    df = pd.read_csv(ARCHIVO_CSV, encoding='latin-1',
                 sep='\t',
                 engine='python',
                 on_bad_lines='skip')

# Renombrar columnas
RENAME = {
    'REGISTRO':'registro', 'ACTA RPO':'acta', 'ACTA':'acta',
    'SEMANA':'semana', 'CAPITULO':'capitulo', 'COMPETENCIA':'competencia',
    'ABS INCIAL':'abs_inicial', 'ABS INICIAL':'abs_inicial', 'ABS FINAL':'abs_final',
    'CIV':'civ', 'ITEM':'item', 'DESCRIPCION':'descripcion', 'DESCRIPCIÓN':'descripcion',
    'UND':'und', 'LONGITUD':'longitud', 'ANCHO':'ancho', 'ESPESOR':'espesor',
    'CANTIDAD':'cantidad', 'VALOR UNITARIO':'valor_unitario', 'COSTO DIRECTO':'costo_directo',
    'CALZADA':'calzada', 'TRAMO INICIO':'tramo_inicio', 'TRAMO FINAL':'tramo_final',
    'PK_ID':'pk_id', 'TRAMO':'tramo', 'OBSERVACIONES':'observaciones'
}
df.rename(columns={k:v for k,v in RENAME.items() if k in df.columns}, inplace=True)

# Limpiar columnas numéricas
NUMS = ['acta','longitud','ancho','espesor','cantidad','valor_unitario','costo_directo']
for col in NUMS:
    if col in df.columns:
        df[col] = df[col].astype(str).str.replace('[$,]','',regex=True).str.strip()
        df[col] = pd.to_numeric(df[col], errors='coerce')

# Limpiar saltos de línea en texto
for col in df.select_dtypes(include='object').columns:
    df[col] = df[col].astype(str).str.replace('\n',' ').str.replace('\r',' ').str.strip()
    df[col] = df[col].replace('nan', None)

# Eliminar columnas que no existen en la tabla
COLUMNAS_VALIDAS = {'registro','acta','semana','capitulo','competencia','abs_inicial',
    'abs_final','civ','item','descripcion','und','longitud','ancho','espesor',
    'cantidad','valor_unitario','costo_directo','calzada','tramo_inicio','tramo_final',
    'pk_id','tramo','observaciones'}
df = df[[c for c in df.columns if c in COLUMNAS_VALIDAS]]
df['contrato_id'] = CONTRATO_ID

# Limpiar tabla
print("Limpiando tabla cobro...")
while True:
    ids = supabase.table("cobro").select("id").eq("contrato_id", CONTRATO_ID).limit(1000).execute().data
    if not ids: break
    supabase.table("cobro").delete().in_("id", [r["id"] for r in ids]).execute()
    print(f"  Eliminados {len(ids)} registros...")

# Insertar en batches
total = len(df)
print(f"Insertando {total} registros en batches de {BATCH}...")
for i in range(0, total, BATCH):
    import json, math
    slice_df = df.iloc[i:i+BATCH]
    batch = []
    for record in slice_df.to_dict('records'):
        clean = {}
        for k, v in record.items():
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            clean[k] = v
        batch.append(clean)
    supabase.table("cobro").insert(batch).execute()
    pct = min(100, round((i+BATCH)/total*100))
    print(f"  {pct}% — batch {i//BATCH+1}/{math.ceil(total/BATCH)}")

print(f"✅ Listo — {total} registros cargados.")