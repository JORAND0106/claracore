import time
from datetime import datetime

SUPABASE_URL = "https://wsyukpubadxyjoxozcay.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeXVrcHViYWR4eWpveG96Y2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3ODcyNCwiZXhwIjoyMDg4NTU0NzI0fQ.txdQ_BNa_NGT3dyg-EJoUSk415Nnmn2QMOcrelWmNGU"
CONTRATO_ID = 2

# Semana 65 → id 387, Semana 171 → id 493
# Acta 14 → buscar en acta_map, Acta 41 → buscar, Acta 43 → buscar

REGISTROS = [
    # Grupo 1 — Semana 65, Acta 14, UNION TEMPORAL MURCON (sub_id=26)
    {'numero_registro':8181,'observacion':'excavación mecanica para tuberia - abs 833-851','item_numero':'NP-035','cantidad':28.71,'semana_num':65,'acta_num':14,'sub_id':26},
    {'numero_registro':8182,'observacion':'perfilación manual para tuberia 20" - abs 833-851','item_numero':'7.01.','cantidad':0.99,'semana_num':65,'acta_num':14,'sub_id':26},
    {'numero_registro':8183,'observacion':'instalación de material triturado - abs 833-851','item_numero':'NP-177','cantidad':2.97,'semana_num':65,'acta_num':14,'sub_id':26},
    {'numero_registro':8184,'observacion':'instalación de tuberia 20" - abs 833-851','item_numero':'NP-043','cantidad':18,'semana_num':65,'acta_num':14,'sub_id':26},
    {'numero_registro':8185,'observacion':'lleno con material triturado - abs 833-851','item_numero':'NP-177','cantidad':2.12,'semana_num':65,'acta_num':14,'sub_id':26},
    {'numero_registro':8186,'observacion':'instalación de material b-200 - abs 833-851','item_numero':'7.10.','cantidad':4.24,'semana_num':65,'acta_num':14,'sub_id':26},
    # Grupo 2 — Semana 171, UNION TEMPORAL MURCON (sub_id=26)
    {'numero_registro':30139,'observacion':'Instalación de concreto 4000 PSI box culvert cll 180 - abs 893-896','item_numero':'5.09.','cantidad':32.52,'semana_num':171,'acta_num':41,'sub_id':26},
    {'numero_registro':30140,'observacion':'Instalación de acero box culvert cll 189 - abs 893-896','item_numero':'7.49.','cantidad':3613.5,'semana_num':171,'acta_num':41,'sub_id':26},
    {'numero_registro':30224,'observacion':'Excavación manual caja domiciliaria - abs 2046-2047','item_numero':'7.01.','cantidad':2.7,'semana_num':171,'acta_num':41,'sub_id':26},
    {'numero_registro':30251,'observacion':'Bombeo periodos 3hrs - abs 895','item_numero':'NP-284','cantidad':22.5,'semana_num':171,'acta_num':41,'sub_id':26},
    {'numero_registro':30253,'observacion':'Bombeo periodos 3hrs - abs 895','item_numero':'NP-284','cantidad':22.5,'semana_num':171,'acta_num':41,'sub_id':26},
    # AR Ingenieros (sub_id=3)
    {'numero_registro':30391,'observacion':'Excavación manual cámara ETB T13 - abs 1807-1810','item_numero':'8.34.','cantidad':9.94,'semana_num':171,'acta_num':41,'sub_id':3},
    {'numero_registro':30392,'observacion':'Construcción mampostería cámara ETB T13 - abs 1807-1810','item_numero':'8.50.','cantidad':0.7,'semana_num':171,'acta_num':43,'sub_id':3},
    {'numero_registro':30394,'observacion':'Relleno cámara ETB T13 con B200 - abs 1807-1810','item_numero':'8.07.','cantidad':1.6,'semana_num':171,'acta_num':41,'sub_id':3},
]

from supabase import create_client
print("🚀 Conectando a Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
print("   ✅ Conexión establecida")

# Cargar mapa de actas
acta_map = {}
res = supabase.table('actas').select('id,numero_rpo')\
    .eq('contrato_id', CONTRATO_ID).not_.is_('numero_rpo','null').execute()
for row in res.data:
    if row['numero_rpo']: acta_map[row['numero_rpo']] = row['id']

# Cargar mapa de reportes
reporte_map = {}
offset = 0
while True:
    res = supabase.table('so_reportes').select('id,numero_reporte')\
        .eq('contrato_id', CONTRATO_ID).range(offset, offset+999).execute()
    if not res.data: break
    for row in res.data: reporte_map[row['numero_reporte']] = row['id']
    if len(res.data) < 1000: break
    offset += 1000

# Verificar cuáles ya existen
existentes = set()
res = supabase.table('so_registros').select('numero_registro')\
    .eq('contrato_id', CONTRATO_ID)\
    .in_('numero_registro', [r['numero_registro'] for r in REGISTROS]).execute()
for row in res.data: existentes.add(row['numero_registro'])
print(f"   Ya existen: {len(existentes)} de 14")

# Agrupar por semana para crear reportes
# Semana 65 → 6 registros → 1 reporte
# Semana 171 → 8 registros → según subcontratista
grupos = {
    'sem65_murcon': [r for r in REGISTROS if r['semana_num']==65],
    'sem171_murcon': [r for r in REGISTROS if r['semana_num']==171 and r['sub_id']==26],
    'sem171_ar': [r for r in REGISTROS if r['semana_num']==171 and r['sub_id']==3],
}

max_reporte = max(reporte_map.keys()) if reporte_map else 51878

reportes_crear = [
    {'numero_reporte': max_reporte+1, 'descripcion_actividad': 'Instalación tubería 20" abs 833-851', 'capitulo': 'Sin capítulo', 'contrato_id': CONTRATO_ID, 'semana_id': 65+322, 'subcontratista_id': 26, 'estado': 'Aprobados'},
    {'numero_reporte': max_reporte+2, 'descripcion_actividad': 'Box culvert y obras cll 180 abs 893-896', 'capitulo': 'Sin capítulo', 'contrato_id': CONTRATO_ID, 'semana_id': 171+322, 'subcontratista_id': 26, 'estado': 'Aprobados'},
    {'numero_reporte': max_reporte+3, 'descripcion_actividad': 'Cámara ETB T13 abs 1807-1810', 'capitulo': 'Sin capítulo', 'contrato_id': CONTRATO_ID, 'semana_id': 171+322, 'subcontratista_id': 3, 'estado': 'Aprobados'},
]

reporte_ids = {}
print("\n📋 Creando 3 reportes...")
for rep in reportes_crear:
    try:
        res = supabase.table('so_reportes').insert(rep).execute()
        nr = rep['numero_reporte']
        reporte_ids[nr] = res.data[0]['id']
        print(f"   ✅ Reporte {nr} creado → id {reporte_ids[nr]}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    time.sleep(0.2)

# Asignar reporte a cada registro
asignacion = {}
for r in grupos['sem65_murcon']:    asignacion[r['numero_registro']] = reporte_ids.get(max_reporte+1)
for r in grupos['sem171_murcon']:   asignacion[r['numero_registro']] = reporte_ids.get(max_reporte+2)
for r in grupos['sem171_ar']:       asignacion[r['numero_registro']] = reporte_ids.get(max_reporte+3)

print("\n📤 Insertando 14 registros...")
insertados = 0
for r in REGISTROS:
    if r['numero_registro'] in existentes:
        print(f"   ⏭️  {r['numero_registro']} ya existe — saltando")
        continue
    row = {
        'contrato_id': CONTRATO_ID,
        'reporte_id': asignacion.get(r['numero_registro']),
        'numero_registro': r['numero_registro'],
        'observacion': r['observacion'],
        'item_numero': r['item_numero'],
        'cantidad': r['cantidad'],
        'semana_id': r['semana_num'] + 322,
        'acta_rpo_id': acta_map.get(r['acta_num']),
        'subcontratista_id': r['sub_id'],
        'nivel3_estado': 'Aprobado',
        'bloqueado': True,
        'solicitud_reversion': False,
    }
    try:
        supabase.table('so_registros').insert(row).execute()
        insertados += 1
        print(f"   ✅ Registro {r['numero_registro']} insertado")
    except Exception as e:
        print(f"   ❌ Registro {r['numero_registro']} Error: {e}")
    time.sleep(0.1)

print(f"\n{'='*50}")
print(f"✅ COMPLETADO — {insertados} registros insertados")
print(f"{'='*50}")