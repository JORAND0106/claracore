import json
import time
from datetime import datetime

# ─── CONFIGURACIÓN ───────────────────────────────────────────
SUPABASE_URL = "https://wsyukpubadxyjoxozcay.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeXVrcHViYWR4eWpveG96Y2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3ODcyNCwiZXhwIjoyMDg4NTU0NzI0fQ.txdQ_BNa_NGT3dyg-EJoUSk415Nnmn2QMOcrelWmNGU"  # Reemplaza antes de ejecutar
CONTRATO_ID = 2
LOTE = 500

BASE = r"C:\Users\JORAND\OneDrive\Aplicaciones y Macros\Programación_Visual Studio\Software ClaraCore\Bubble"
ARCHIVO_REGISTROS = BASE + r"\registros_sicoe.ndjson"

# Mapeo de subcontratistas
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

# Mapeo estados de validación
ESTADO_MAP = {
    'Aprobado': 'Aprobado',
    'Pendiente': 'Pendiente',
    'Rechazado': 'Rechazado',
    'No Revisado': 'Pendiente',
    '': None,
}

def safe_num(v):
    try: return float(v) if v and str(v).strip() else None
    except: return None

def safe_int(v):
    try: return int(float(v)) if v and str(v).strip() else None
    except: return None

def safe_str(v):
    s = (v or '').strip()
    return s if s else None

def parse_date(s):
    if not s or not s.strip(): return None
    for fmt in ['%b %d, %Y %I:%M %p', '%b %d, %Y %I:%M %p']:
        try:
            return datetime.strptime(s.strip(), fmt).isoformat()
        except: pass
    return None

def get_semana_id(semana_raw):
    if not semana_raw or '_' not in semana_raw: return None
    try:
        num = int(semana_raw.split('_')[0])
        return (num + 322) if num > 0 else None
    except: return None

def get_acta_id(acta_raw, acta_map):
    if not acta_raw or '_' not in acta_raw: return None
    try:
        num = int(acta_raw.split('_')[0])
        return acta_map.get(num)
    except: return None

# ─── PASO 1: Cargar mapa reporte_numero → reporte_id ────────
print("🚀 Conectando a Supabase...")
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
print("   ✅ Conexión establecida")

print("📋 Cargando mapa de reportes...")
reporte_map = {}  # {numero_reporte → id}
offset = 0
while True:
    res = supabase.table('so_reportes')\
        .select('id, numero_reporte')\
        .eq('contrato_id', CONTRATO_ID)\
        .range(offset, offset + 999)\
        .execute()
    if not res.data: break
    for row in res.data:
        reporte_map[row['numero_reporte']] = row['id']
    if len(res.data) < 1000: break
    offset += 1000
print(f"   ✅ {len(reporte_map)} reportes en mapa")

print("📋 Cargando mapa de actas RPO...")
acta_map = {}  # {numero_rpo → id}
res = supabase.table('actas')\
    .select('id, numero_rpo')\
    .eq('contrato_id', CONTRATO_ID)\
    .not_.is_('numero_rpo', 'null')\
    .execute()
for row in res.data:
    if row['numero_rpo']:
        acta_map[row['numero_rpo']] = row['id']
print(f"   ✅ {len(acta_map)} actas RPO en mapa")

# ─── PASO 2: Cargar y homologar registros ───────────────────
print("\n📂 Cargando registros_sicoe...")
rows = []
sin_reporte = 0
sin_semana = 0
sin_subcon = 0

with open(ARCHIVO_REGISTROS, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        r = json.loads(line)

        # Reporte ID — obligatorio
        gr = str(r.get('Grupo Reporte', '')).strip()
        reporte_id = reporte_map.get(int(gr)) if gr and gr.isdigit() else None
        if not reporte_id:
            sin_reporte += 1
            continue

        # Numero registro
        num_reg = safe_int(r.get('01_NUMERO REGISTRO'))
        if not num_reg:
            continue

        # Semana
        semana_id = get_semana_id(r.get('27_SEMANA', ''))
        if not semana_id:
            sin_semana += 1

        # Acta
        acta_id = get_acta_id(r.get('26_ACTA', ''), acta_map)

        # Subcontratista
        sub_nombre = (r.get('02_SUB CONTRATISTA') or '').strip()
        sub_id = SUB_MAP.get(sub_nombre)
        if not sub_id:
            sin_subcon += 1

        # Coordenadas
        lat = safe_num(r.get('47_2_COORDENADA LATITUD'))
        coord_raw = (r.get('47_1_COORDENADA GEO') or '').strip()
        lng = None
        if coord_raw and ',' in coord_raw:
            try: lng = float(coord_raw.split(',')[0].strip())
            except: pass

        # Foto
        foto_url = safe_str(r.get('Old IMAGEN'))
        foto_num = safe_int(r.get('42_NUM IMAGEN'))

        # Estados de validación
        nivel1_estado = ESTADO_MAP.get(r.get('30_1_ESTADO INSPECTOR', '').strip())
        nivel2_estado = ESTADO_MAP.get(r.get('31_1_ESTADO RESIDENTE', '').strip())
        nivel3_estado = ESTADO_MAP.get(r.get('32_1_ESTADO INTERVENTORIA', '').strip())
        sub_estado = ESTADO_MAP.get(r.get('33_1_ESTADO SUB CONTRATISTA', '').strip())

        # Bloqueado si interventoría aprobó
        bloqueado = nivel3_estado == 'Aprobado'

        row = {
            'contrato_id': CONTRATO_ID,
            'reporte_id': reporte_id,
            'numero_registro': num_reg,
            'observacion': safe_str(r.get('20_OBSERVACION')),
            'item_numero': safe_str(r.get('21_ITEM')),
            'item_descripcion': safe_str(r.get('24_DESCRIPCION ITEM')),
            'cantidad': safe_num(r.get('19_CANTIDAD')),
            'unidad': safe_str(r.get('23_UNIDAD')),
            'vlr_unitario': safe_num(r.get('22_VALOR UNITARIO')),
            'costo_directo': safe_num(r.get('25_COSTO DIRECTO')),
            'longitud': safe_num(r.get('16_LONGITUD')),
            'ancho': safe_num(r.get('17_ANCHO')),
            'espesor': safe_num(r.get('18_ESPESOR')),
            'competencia': safe_str(r.get('40_COMPETENCIA')),
            'enlace_soporte': safe_str(r.get('29_SOPORTE')),
            'foto_url': foto_url,
            'foto_numero': foto_num,
            'civ': safe_str(r.get('06_CIV')),
            'tramo': safe_str(r.get('07_TRAMO')),
            'infraestructura': safe_str(r.get('09_INFRAESTRUCTURA')),
            'calzada': safe_str(r.get('08_COSTADO')),
            'ubicacion': safe_str(r.get('11_UBICACION')),
            'abs_inicio': safe_num(r.get('12_ABS INICIAL')),
            'abs_final': safe_num(r.get('13_ABS FINAL')),
            'nodo_ini': safe_str(r.get('14_NODO INICIAL')),
            'nodo_fin': safe_str(r.get('15_NODO FINAL')),
            'coord_lat': lat,
            'coord_lng': lng,
            'semana_id': semana_id,
            'acta_rpo_id': acta_id,
            'subcontratista_id': sub_id,
            'nivel1_estado': nivel1_estado,
            'nivel1_fecha': parse_date(r.get('30_2_FECHA REVISION INSPECTOR')),
            'nivel2_estado': nivel2_estado,
            'nivel2_fecha': parse_date(r.get('31_2_FECHA REVISION RESIDENTE')),
            'nivel3_estado': nivel3_estado,
            'nivel3_fecha': parse_date(r.get('32_2_FECHA REVISION INTERVENTORIA')),
            'sub_estado': sub_estado,
            'sub_fecha': parse_date(r.get('33_2_FECHA REVISION SUB CONTRATISTA')),
            'bloqueado': bloqueado,
            'solicitud_reversion': False,
        }
        rows.append(row)

print(f"   ✅ {len(rows)} registros homologados")
print(f"   ⚠️  Sin reporte: {sin_reporte}")
print(f"   ⚠️  Sin semana: {sin_semana}")
print(f"   ⚠️  Sin subcontratista: {sin_subcon}")

# ─── PASO 3: Insertar en Supabase ───────────────────────────
total_lotes = (len(rows) + LOTE - 1) // LOTE
insertados = 0
errores = 0

print(f"\n📤 Insertando {len(rows)} registros en lotes de {LOTE}...")
for i in range(0, len(rows), LOTE):
    lote = rows[i:i+LOTE]
    lote_num = (i // LOTE) + 1
    try:
        supabase.table('so_registros').insert(lote).execute()
        insertados += len(lote)
        print(f"   Lote {lote_num}/{total_lotes} ✅ — Total: {insertados}/{len(rows)}")
    except Exception as e:
        errores += len(lote)
        print(f"   Lote {lote_num}/{total_lotes} ❌ Error: {e}")
    time.sleep(0.3)

print(f"\n{'='*50}")
print(f"✅ MIGRACIÓN REGISTROS COMPLETADA")
print(f"   Insertados : {insertados}")
print(f"   Errores    : {errores}")
print(f"   Sin reporte: {sin_reporte}")
print(f"   Sin semana : {sin_semana}")
print(f"   Sin subcon : {sin_subcon}")
print(f"{'='*50}")