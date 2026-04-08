import json
import time

# ─── CONFIGURACIÓN ───────────────────────────────────────────
SUPABASE_URL = "https://wsyukpubadxyjoxozcay.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeXVrcHViYWR4eWpveG96Y2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3ODcyNCwiZXhwIjoyMDg4NTU0NzI0fQ.txdQ_BNa_NGT3dyg-EJoUSk415Nnmn2QMOcrelWmNGU"  # Reemplaza antes de ejecutar
CONTRATO_ID = 2
LOTE = 500

# Rutas de archivos
BASE = r"C:\Users\JORAND\OneDrive\Aplicaciones y Macros\Programación_Visual Studio\Software ClaraCore\Bubble"
ARCHIVO_REPORTES = BASE + r"\Grupo_Reportes_bubble.ndjson"
ARCHIVO_REGISTROS = BASE + r"\registros_sicoe.ndjson"

# ─── MAPEO SUBCONTRATISTAS ───────────────────────────────────
SUB_MAP = {
    'AB Construcciones e Ingeniería SAS': 4,
    'AC SEMAFOROS S.A.S.': 36,
    'ANKER Consultoria Y Construccion SAS': 23,
    'AR Ingenieros': 3,
    'AR Ingenieros 186-189': 40,
    'Arquitectura PCT SAS': 2,
    'AUSCULTAR SAS': 24,
    'CIVILTECH Ingeniería y Construcción SAS': 29,
    'Concrescol S.A.S.': 5,
    'Construcciones HD SAS': 42,
    'CONSTRUCCIONES PRECISAS S.A.S': 39,
    'Construcciones Robledo SAS': 9,
    'CREATIVA ARQUITECTURA E INGENIERIA SAS': 21,
    'Diezcom - Martin Mendez': 8,
    'ESTRUMACOL  (ESTRUCTURAS MANTENIMIENTO Y CONSTRUCCIONES DE COLOMBIA S.A.S)': 35,
    'Excavaciones y Construcciones GOD S.A.S.': 6,
    'GESTIÓN Y AMBIENTE APLICACIONES AMBIENTALES SAS': 30,
    'GOVINCO LTDA': 7,
    'HÁBITAT INVESTIGACIÓN RESPONSABILIDAD Y AMBIENTE HIRAM SAS': 19,
    'INGEMAC - INGENIERIA CAPITAL Y DE MEDIO AMBIENTE S.A.S.': 33,
    'Inspector': 25,
    'LD OBRAS CIVILES REY SAS': 28,
    'Milling S.A.S': 31,
    'NEMA INGENIERIA': 34,
    'Omae Construcciones  Ltda': 32,
    'OSCAR ANDRES CAMACHO DIAZ': 38,
    'PZR S.A.S.': 13,
    'RAFASAM Topografía e Ingeniería SAS': 18,
    'Redes y Túneles': 14,
    'Soiling SAS': 43,
    'SS VIAL - SEÑALIZACION Y SEGURIDAD VIAL SAS': 37,
    'STONER S.A.S': 41,
    'TECNIHIDRAULICAS GUIBAR': 27,
    'Ultra Ingeniería S.A.S.': 10,
    'UNION TEMPORAL MURCON': 26,
    'Urbanismo MR SAS': 15,
    'UT - Alvaro Riaño': 16,
    'UT - Calidad': 20,
    'UT - Diego Fajardo': 17,
    'UT - Kevin Rodriguez': 22,
    'UT - Manuel Masmela': 12,
    'UT - Miguel Medina': 11,
}

def normalizar_margen(m):
    m = (m or '').strip().upper()
    if m in ('DERECHO',): return 'Derecha'
    if m in ('IZQUIERDO',): return 'Izquierda'
    if m in ('ÚNICO', 'UNICO'): return 'Única'
    if m == 'CENTRAL': return 'Central'
    if m == '': return None
    return 'Otro'

def safe_num(v):
    try:
        return float(v) if v and str(v).strip() else None
    except:
        return None

def safe_str(v):
    s = (v or '').strip()
    return s if s else None

# ─── PASO 1: Cargar índice de registros_sicoe ────────────────
print("📂 Cargando índice de registros_sicoe...")
idx_registros = {}  # {grupo_reporte → primer registro}
with open(ARCHIVO_REGISTROS, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        gr = str(r.get('Grupo Reporte', '')).strip()
        if gr and gr not in idx_registros:
            idx_registros[gr] = r

print(f"   ✅ {len(idx_registros)} grupos de reporte indexados")

# ─── PASO 2: Cargar reportes ─────────────────────────────────
print("📂 Cargando Grupo_Reportes_bubble...")
reportes = []
with open(ARCHIVO_REPORTES, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        reportes.append(json.loads(line))

print(f"   ✅ {len(reportes)} reportes cargados")

# ─── PASO 3: Homologar datos ─────────────────────────────────
print("🔄 Homologando datos...")
rows = []
sin_subcon = 0
sin_semana = 0
sin_mapeo_sub = []

for r in reportes:
    consecutivo = str(r.get('00_CONSECUTIVO', '')).strip()
    if not consecutivo:
        continue

    # Cruzar con registros_sicoe
    reg = idx_registros.get(consecutivo, {})

    # Subcontratista
    sub_nombre = (reg.get('02_SUB CONTRATISTA') or '').strip()
    sub_id = SUB_MAP.get(sub_nombre)
    if not sub_id:
        sin_subcon += 1
        if sub_nombre and sub_nombre not in sin_mapeo_sub:
            sin_mapeo_sub.append(sub_nombre)

    # Semana
    semana_raw = (reg.get('27_SEMANA') or '').strip()
    semana_id = None
    if semana_raw and '_' in semana_raw:
        try:
            num_semana = int(semana_raw.split('_')[0])
            semana_id = num_semana + 322
        except:
            pass
    if not semana_id:
        sin_semana += 1

    # Acta — extraer número de "34_IDU-1551-2017"
    acta_raw = (r.get('26_ACTA_id') or '').strip()
    # No tenemos acta_rpo_id por ahora — se puede agregar después

    # Descripcion
    desc = safe_str(r.get('01_DESCRIPCION')) or safe_str(r.get('04_1_CAPITULO_id')) or 'Sin descripción'

    # Coordenadas
    lat = safe_num(r.get('47_2_COORDENADA LATITUD'))
    lng = safe_num(r.get('47_3_COORDENADA LONGITUD'))

    row = {
        'contrato_id': CONTRATO_ID,
        'numero_reporte': int(consecutivo),
        'descripcion_actividad': desc,
        'capitulo': safe_str(r.get('04_1_CAPITULO_id')) or 'Sin capítulo',
        'civ': safe_str(r.get('06_CIV_id')),
        'tramo': safe_str(r.get('07_TRAMO')),
        'infraestructura': safe_str(r.get('09_INFRAESTRUCTURA')),
        'calzada': safe_str(r.get('08_COSTADO')),
        'ubicacion': safe_str(r.get('11_UBICACION')),
        'margen': normalizar_margen(r.get('10_MARGEN')),
        'abs_inicio': safe_num(r.get('12_ABS INICIAL')),
        'abs_final': safe_num(r.get('13_ABS FINAL')),
        'nodo_ini': safe_str(r.get('14_NODO INICIAL')),
        'nodo_fin': safe_str(r.get('15_NODO FINAL')),
        'coord_lat': lat,
        'coord_lng': lng,
        'estado': 'Aprobados',
        'subcontratista_id': sub_id,
        'semana_id': semana_id,
    }
    rows.append(row)

print(f"   ✅ {len(rows)} filas homologadas")
print(f"   ⚠️  Sin subcontratista: {sin_subcon}")
print(f"   ⚠️  Sin semana: {sin_semana}")
if sin_mapeo_sub:
    print(f"   ❓ Subcontratistas sin mapeo: {sin_mapeo_sub}")

# ─── PASO 4: Insertar en Supabase ───────────────────────────
from supabase import create_client

print(f"\n🚀 Conectando a Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
print("   ✅ Conexión establecida")

total_lotes = (len(rows) + LOTE - 1) // LOTE
insertados = 0
errores = 0

print(f"\n📤 Insertando {len(rows)} reportes en lotes de {LOTE}...")
for i in range(0, len(rows), LOTE):
    lote = rows[i:i+LOTE]
    lote_num = (i // LOTE) + 1
    try:
        supabase.table('so_reportes').insert(lote).execute()
        insertados += len(lote)
        print(f"   Lote {lote_num}/{total_lotes} ✅ — Total: {insertados}/{len(rows)}")
    except Exception as e:
        errores += len(lote)
        print(f"   Lote {lote_num}/{total_lotes} ❌ Error: {e}")
    time.sleep(0.3)  # Pausa para no saturar Supabase

print(f"\n{'='*50}")
print(f"✅ MIGRACIÓN COMPLETADA")
print(f"   Insertados : {insertados}")
print(f"   Errores    : {errores}")
print(f"   Sin subcon : {sin_subcon}")
print(f"   Sin semana : {sin_semana}")
print(f"{'='*50}")