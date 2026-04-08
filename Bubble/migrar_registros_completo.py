import json
import time
from datetime import datetime

# ─── CONFIGURACIÓN ───────────────────────────────────────────
SUPABASE_URL = "https://wsyukpubadxyjoxozcay.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeXVrcHViYWR4eWpveG96Y2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3ODcyNCwiZXhwIjoyMDg4NTU0NzI0fQ.txdQ_BNa_NGT3dyg-EJoUSk415Nnmn2QMOcrelWmNGU"
CONTRATO_ID = 2
LOTE = 500

BASE = r"C:\Users\JORAND\OneDrive\Aplicaciones y Macros\Programación_Visual Studio\Software ClaraCore\Bubble"
ARCHIVO_REGISTROS = BASE + r"\registros_sicoe.ndjson"

RENUMERADOS = {
    '1708514375505x924319899628077000': 51872,
    '1729560750917x924269735506694000': 51873,
    '1732288005121x524597625187473340': 51874,
    '1743533712680x581821909511169800': 51875,
    '1751032915780x983092917252774300': 51876,
    '1756217834480x187498326527049730': 51877,
    '1770309944173x363524248034607100': 51878,
}

IGNORAR_UIDS = {
    '1712322418199x935974817194836000',
    '1712322418199x965964590043889700',
}

SUB_MAP = {
    'AB Construcciones e Ingeniería SAS': 4,'AC SEMAFOROS S.A.S.': 36,
    'ANKER Consultoria Y Construccion SAS': 23,'AR Ingenieros': 3,
    'AR Ingenieros 186-189': 40,'Arquitectura PCT SAS': 2,'AUSCULTAR SAS': 24,
    'CIVILTECH Ingeniería y Construcción SAS': 29,'Concrescol S.A.S.': 5,
    'Construcciones HD SAS': 42,'CONSTRUCCIONES PRECISAS S.A.S': 39,
    'Construcciones Robledo SAS': 9,'CREATIVA ARQUITECTURA E INGENIERIA SAS': 21,
    'Diezcom - Martin Mendez': 8,
    'ESTRUMACOL  (ESTRUCTURAS MANTENIMIENTO Y CONSTRUCCIONES DE COLOMBIA S.A.S)': 35,
    'Excavaciones y Construcciones GOD S.A.S.': 6,
    'GESTIÓN Y AMBIENTE APLICACIONES AMBIENTALES SAS': 30,'GOVINCO LTDA': 7,
    'HÁBITAT INVESTIGACIÓN RESPONSABILIDAD Y AMBIENTE HIRAM SAS': 19,
    'INGEMAC - INGENIERIA CAPITAL Y DE MEDIO AMBIENTE S.A.S.': 33,'Inspector': 25,
    'LD OBRAS CIVILES REY SAS': 28,'Milling S.A.S': 31,'NEMA INGENIERIA': 34,
    'Omae Construcciones  Ltda': 32,'OSCAR ANDRES CAMACHO DIAZ': 38,'PZR S.A.S.': 13,
    'RAFASAM Topografía e Ingeniería SAS': 18,'Redes y Túneles': 14,'Soiling SAS': 43,
    'SS VIAL - SEÑALIZACION Y SEGURIDAD VIAL SAS': 37,'STONER S.A.S': 41,
    'TECNIHIDRAULICAS GUIBAR': 27,'Ultra Ingeniería S.A.S.': 10,
    'UNION TEMPORAL MURCON': 26,'Urbanismo MR SAS': 15,'UT - Alvaro Riaño': 16,
    'UT - Calidad': 20,'UT - Diego Fajardo': 17,'UT - Kevin Rodriguez': 22,
    'UT - Manuel Masmela': 12,'UT - Miguel Medina': 11,
}

ESTADO_MAP = {'Aprobado':'Aprobado','Pendiente':'Pendiente','Rechazado':'Rechazado','No Revisado':'Pendiente','':None}

def safe_num(v):
    try: return float(v) if v and str(v).strip() else None
    except: return None

def safe_int(v):
    try: return int(float(v)) if v and str(v).strip() else None
    except: return None

def safe_str(v):
    s = (v or '').strip(); return s if s else None

def parse_date(s):
    if not s or not s.strip(): return None
    try: return datetime.strptime(s.strip(), '%b %d, %Y %I:%M %p').isoformat()
    except: return None

def get_semana_id(s):
    if not s or '_' not in s: return None
    try:
        partes = s.split('_')
        num = int(partes[0]) if partes[0].isdigit() else int(partes[-1])
        return (num + 322) if num > 0 else None
    except: return None

# ─── CONECTAR ────────────────────────────────────────────────
from supabase import create_client
print("🚀 Conectando a Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
print("   ✅ Conexión establecida")

def cargar_mapa_reportes():
    mapa = {}
    offset = 0
    while True:
        res = supabase.table('so_reportes').select('id,numero_reporte')\
            .eq('contrato_id', CONTRATO_ID).range(offset, offset+999).execute()
        if not res.data: break
        for row in res.data: mapa[row['numero_reporte']] = row['id']
        if len(res.data) < 1000: break
        offset += 1000
    return mapa

print("📋 Cargando mapa de reportes...")
reporte_map = cargar_mapa_reportes()
print(f"   ✅ {len(reporte_map)} reportes en mapa")

acta_map = {}
res = supabase.table('actas').select('id,numero_rpo')\
    .eq('contrato_id', CONTRATO_ID).not_.is_('numero_rpo','null').execute()
for row in res.data:
    if row['numero_rpo']: acta_map[row['numero_rpo']] = row['id']

print("🔍 Consultando registros ya insertados...")
existentes = set()
offset = 0
while True:
    res = supabase.table('so_registros').select('numero_registro')\
        .eq('contrato_id', CONTRATO_ID).range(offset, offset+999).execute()
    if not res.data: break
    for row in res.data: existentes.add(row['numero_registro'])
    if len(res.data) < 1000: break
    offset += 1000
print(f"   ✅ {len(existentes)} registros ya existen")

max_reporte = max(reporte_map.keys()) if reporte_map else 51878
contador_reporte = max_reporte + 1

# ─── PROCESAR ────────────────────────────────────────────────
print("\n📂 Procesando registros_sicoe...")
rows = []
reportes_nuevos = []
sin_reporte_count = 0

with open(ARCHIVO_REGISTROS, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        r = json.loads(line)
        uid = r.get('unique id','').strip()
        if uid in IGNORAR_UIDS: continue

        num_reg = RENUMERADOS.get(uid) or safe_int(r.get('01_NUMERO REGISTRO'))
        if not num_reg: continue
        if num_reg in existentes: continue

        gr = str(r.get('Grupo Reporte','')).strip()
        reporte_id = reporte_map.get(int(gr)) if gr and gr.isdigit() and int(gr) > 0 else None

        if not reporte_id:
            sin_reporte_count += 1
            # Usar numero_registro como numero_reporte si no colisiona
            # Si colisiona, usar ese reporte existente directamente
            if num_reg in reporte_map:
                reporte_id = reporte_map[num_reg]
            else:
                # Crear reporte nuevo con numero_registro
                nr = num_reg
                reportes_nuevos.append({
                    '_nr': nr,
                    'contrato_id': CONTRATO_ID,
                    'numero_reporte': nr,
                    'descripcion_actividad': safe_str(r.get('20_OBSERVACION')) or 'Sin descripción',
                    'capitulo': safe_str(r.get('04_1_CAPITULO_id')) or 'Sin capítulo',
                    'estado': 'Aprobados',
                })
                reporte_id = f'PENDING_{nr}'

        acta_id = None
        acta_raw = r.get('26_ACTA','')
        if acta_raw and '_' in acta_raw:
            try: acta_id = acta_map.get(int(acta_raw.split('_')[0]))
            except: pass

        sub_id = SUB_MAP.get((r.get('02_SUB CONTRATISTA') or '').strip())
        lat = safe_num(r.get('47_2_COORDENADA LATITUD'))
        coord_raw = (r.get('47_1_COORDENADA GEO') or '').strip()
        lng = None
        if coord_raw and ',' in coord_raw:
            try: lng = float(coord_raw.split(',')[0].strip())
            except: pass

        n1e = ESTADO_MAP.get(r.get('30_1_ESTADO INSPECTOR','').strip())
        n2e = ESTADO_MAP.get(r.get('31_1_ESTADO RESIDENTE','').strip())
        n3e = ESTADO_MAP.get(r.get('32_1_ESTADO INTERVENTORIA','').strip())
        se  = ESTADO_MAP.get(r.get('33_1_ESTADO SUB CONTRATISTA','').strip())

        rows.append({
            '_reporte_id': reporte_id,
            'contrato_id': CONTRATO_ID,
            'reporte_id': reporte_id if not str(reporte_id).startswith('PENDING') else None,
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
            'foto_url': safe_str(r.get('Old IMAGEN')),
            'foto_numero': safe_int(r.get('42_NUM IMAGEN')),
            'civ': safe_str(r.get('06_CIV')),
            'tramo': safe_str(r.get('07_TRAMO')),
            'infraestructura': safe_str(r.get('09_INFRAESTRUCTURA')),
            'calzada': safe_str(r.get('08_COSTADO')),
            'ubicacion': safe_str(r.get('11_UBICACION')),
            'abs_inicio': safe_num(r.get('12_ABS INICIAL')),
            'abs_final': safe_num(r.get('13_ABS FINAL')),
            'nodo_ini': safe_str(r.get('14_NODO INICIAL')),
            'nodo_fin': safe_str(r.get('15_NODO FINAL')),
            'coord_lat': lat, 'coord_lng': lng,
            'semana_id': get_semana_id(r.get('27_SEMANA','')),
            'acta_rpo_id': acta_id,
            'subcontratista_id': sub_id,
            'nivel1_estado': n1e, 'nivel1_fecha': parse_date(r.get('30_2_FECHA REVISION INSPECTOR')),
            'nivel2_estado': n2e, 'nivel2_fecha': parse_date(r.get('31_2_FECHA REVISION RESIDENTE')),
            'nivel3_estado': n3e, 'nivel3_fecha': parse_date(r.get('32_2_FECHA REVISION INTERVENTORIA')),
            'sub_estado': se,   'sub_fecha': parse_date(r.get('33_2_FECHA REVISION SUB CONTRATISTA')),
            'bloqueado': n3e == 'Aprobado',
            'solicitud_reversion': False,
        })

print(f"   ✅ {len(rows)} registros pendientes")
print(f"   ⚠️  Sin reporte: {sin_reporte_count} ({len(reportes_nuevos)} crearán reporte nuevo)")

# ─── CREAR REPORTES NUEVOS ───────────────────────────────────
if reportes_nuevos:
    print(f"\n📋 Creando {len(reportes_nuevos)} reportes nuevos...")
    insertados_rep = 0
    for i in range(0, len(reportes_nuevos), LOTE):
        lote = reportes_nuevos[i:i+LOTE]
        lote_limpio = [{k:v for k,v in r.items() if k != '_nr'} for r in lote]
        try:
            supabase.table('so_reportes').insert(lote_limpio).execute()
            insertados_rep += len(lote)
        except Exception as e:
            # Insertar uno por uno para no perder los buenos
            for rep in lote_limpio:
                try:
                    supabase.table('so_reportes').insert(rep).execute()
                    insertados_rep += 1
                except: pass
        time.sleep(0.2)
    print(f"   ✅ {insertados_rep} reportes creados")

    # Recargar mapa
    print("   🔄 Recargando mapa de reportes...")
    reporte_map = cargar_mapa_reportes()

    # Asignar reporte_id a los PENDING
    for row in rows:
        if str(row['_reporte_id']).startswith('PENDING_'):
            nr = int(row['_reporte_id'].replace('PENDING_',''))
            row['reporte_id'] = reporte_map.get(nr)

# ─── LIMPIAR E INSERTAR ──────────────────────────────────────
for r in rows: r.pop('_reporte_id', None)
rows_ok = [r for r in rows if r['reporte_id']]
rows_sin = [r for r in rows if not r['reporte_id']]

print(f"\n📤 Insertando {len(rows_ok)} registros uno por uno...")
insertados = 0
errores = 0

for registro in rows_ok:
    try:
        supabase.table('so_registros').insert(registro).execute()
        insertados += 1
        if insertados % 200 == 0:
            print(f"   ✅ {insertados}/{len(rows_ok)} insertados...")
    except Exception as e:
        if '23505' not in str(e):
            print(f"   ❌ Nº{registro.get('numero_registro')} Error: {e}")
        errores += 1
    time.sleep(0.05)

print(f"\n{'='*50}")
print(f"✅ MIGRACIÓN COMPLETADA")
print(f"   Insertados  : {insertados}")
print(f"   Errores     : {errores}")
print(f"   Sin reporte : {len(rows_sin)}")
print(f"{'='*50}")