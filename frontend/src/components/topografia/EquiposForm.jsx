import { useCallback, useEffect, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import FirmaDigital from './FirmaDigital'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, Semaforo, useTopografiaApi } from './topografiaShared'

function estadoEquipo(item) {
  if (item.motivo === 'Sin verificacion') return 'rojo'
  const prox = item.proxima_verificacion
  if (!prox) return 'verde'
  const delta = Math.floor((new Date(prox) - new Date()) / 86400000)
  if (delta < 0) return 'rojo'
  if (delta <= 7) return 'amarillo'
  return 'verde'
}

const colorMap = { rojo: '#dc2626', amarillo: '#ca8a04', verde: '#16a34a' }

export default function EquiposForm({ contratoId, token, onAlertasChange, permisos }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [equipos, setEquipos] = useState([])
  const [alertas, setAlertas] = useState(null)
  const [sel, setSel] = useState(null)
  const [verificaciones, setVerificaciones] = useState([])
  const [formEq, setFormEq] = useState({ nombre: '', tipo: 'nivel', marca: '', modelo: '', serie: '', propietario: '' })
  const [formVer, setFormVer] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo_verificacion: 'nivel',
    operador: '',
    condiciones: '',
    distancia_estacas: 30,
    lectura_a_pos1: '',
    lectura_b_pos1: '',
    lectura_a_pos2: '',
    lectura_b_pos2: '',
    horizontal_directa_gms: '',
    horizontal_inversa_gms: '',
    vertical_directa_gms: '',
    vertical_inversa_gms: '',
  })
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [eq, al] = await Promise.all([api('/equipos'), api('/equipos/alertas')])
      setEquipos(eq || [])
      setAlertas(al)
      onAlertasChange?.(al?.total_alertas || 0)
    } catch (e) { setError(e.message) }
  }, [api, onAlertasChange])

  useEffect(() => { cargar() }, [cargar])

  const cargarVerificaciones = async (id) => {
    setSel(id)
    const data = await api(`/equipos/${id}/verificaciones`)
    setVerificaciones(data || [])
  }

  const crearEquipo = async () => {
    await api('/equipos', { method: 'POST', body: JSON.stringify(formEq) })
    setFormEq({ nombre: '', tipo: 'nivel', marca: '', modelo: '', serie: '', propietario: '' })
    cargar()
  }

  const crearVerificacion = async () => {
    if (!sel) return
    const eq = equipos.find((e) => e.id === sel)
    const tipo = eq?.tipo === 'estacion_total' ? 'estacion_total' : 'nivel'
    const resultados = tipo === 'nivel'
      ? {
        distancia_estacas: Number(formVer.distancia_estacas),
        lectura_a_pos1: Number(formVer.lectura_a_pos1),
        lectura_b_pos1: Number(formVer.lectura_b_pos1),
        lectura_a_pos2: Number(formVer.lectura_a_pos2),
        lectura_b_pos2: Number(formVer.lectura_b_pos2),
      }
      : {
        horizontal_directa_gms: Number(formVer.horizontal_directa_gms),
        horizontal_inversa_gms: Number(formVer.horizontal_inversa_gms),
        vertical_directa_gms: Number(formVer.vertical_directa_gms),
        vertical_inversa_gms: Number(formVer.vertical_inversa_gms),
      }
    await api(`/equipos/${sel}/verificaciones`, {
      method: 'POST',
      body: JSON.stringify({
        fecha: formVer.fecha,
        tipo_verificacion: tipo,
        operador: formVer.operador,
        condiciones: formVer.condiciones,
        resultados,
      }),
    })
    cargarVerificaciones(sel)
    cargar()
  }

  const alertaItems = [...(alertas?.vencidas || []), ...(alertas?.proximas || [])]

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      {alertaItems.length > 0 && (
        <div style={{ ...card, marginBottom: 16, borderColor: '#fbbf24' }}>
          <h4 style={{ marginTop: 0 }}>Alertas de verificacion</h4>
          {alertaItems.map((a) => (
            <div key={a.id} style={{ color: colorMap[estadoEquipo(a)], marginBottom: 4 }}>
              {a.nombre} — proxima: {a.proxima_verificacion || a.motivo}
            </div>
          ))}
        </div>
      )}

      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Registrar equipo</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={formEq.nombre} onChange={(e) => setFormEq({ ...formEq, nombre: e.target.value })} style={inputStyle} />
          <select value={formEq.tipo} onChange={(e) => setFormEq({ ...formEq, tipo: e.target.value })} style={inputStyle}>
            <option value="nivel">Nivel</option>
            <option value="estacion_total">Estacion total</option>
            <option value="gps">GPS</option>
            <option value="otro">Otro</option>
          </select>
          <input placeholder="Marca" value={formEq.marca} onChange={(e) => setFormEq({ ...formEq, marca: e.target.value })} style={inputStyle} />
          <input placeholder="Modelo" value={formEq.modelo} onChange={(e) => setFormEq({ ...formEq, modelo: e.target.value })} style={inputStyle} />
          <input placeholder="Serie" value={formEq.serie} onChange={(e) => setFormEq({ ...formEq, serie: e.target.value })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crearEquipo}>Agregar equipo</button>
      </div>
      </PermisoAviso>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div style={card}>
          <h4 style={{ marginTop: 0 }}>Equipos</h4>
          {equipos.map((e) => {
            const alertItem = alertaItems.find((a) => a.id === e.id)
            const estado = alertItem ? estadoEquipo(alertItem) : 'verde'
            return (
              <button key={e.id} type="button" onClick={() => cargarVerificaciones(e.id)} style={{ ...btnSecondary, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left', borderLeft: `4px solid ${colorMap[estado]}` }}>
                {e.nombre} ({e.tipo})
              </button>
            )
          })}
        </div>

        {sel && (
          <div>
            <PermisoAviso permisos={permisos} accion="crear">
            <div style={{ ...card, marginBottom: 16 }}>
              <h4>Nueva verificacion</h4>
              <input type="date" value={formVer.fecha} onChange={(e) => setFormVer({ ...formVer, fecha: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} />
              {equipos.find((e) => e.id === sel)?.tipo === 'estacion_total' ? (
                <>
                  <TopoAngularInput label="Horizontal directa" value={formVer.horizontal_directa_gms} onChange={(_, v) => setFormVer({ ...formVer, horizontal_directa_gms: v })} />
                  <TopoAngularInput label="Horizontal inversa" value={formVer.horizontal_inversa_gms} onChange={(_, v) => setFormVer({ ...formVer, horizontal_inversa_gms: v })} />
                  <TopoAngularInput label="Vertical directa" value={formVer.vertical_directa_gms} onChange={(_, v) => setFormVer({ ...formVer, vertical_directa_gms: v })} />
                  <TopoAngularInput label="Vertical inversa" value={formVer.vertical_inversa_gms} onChange={(_, v) => setFormVer({ ...formVer, vertical_inversa_gms: v })} />
                </>
              ) : (
                <>
                  <input placeholder="Distancia estacas (m)" value={formVer.distancia_estacas} onChange={(e) => setFormVer({ ...formVer, distancia_estacas: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} />
                  <input placeholder="Lectura A pos1" value={formVer.lectura_a_pos1} onChange={(e) => setFormVer({ ...formVer, lectura_a_pos1: e.target.value })} style={inputStyle} />
                  <input placeholder="Lectura B pos1" value={formVer.lectura_b_pos1} onChange={(e) => setFormVer({ ...formVer, lectura_b_pos1: e.target.value })} style={inputStyle} />
                  <input placeholder="Lectura A pos2" value={formVer.lectura_a_pos2} onChange={(e) => setFormVer({ ...formVer, lectura_a_pos2: e.target.value })} style={inputStyle} />
                  <input placeholder="Lectura B pos2" value={formVer.lectura_b_pos2} onChange={(e) => setFormVer({ ...formVer, lectura_b_pos2: e.target.value })} style={inputStyle} />
                </>
              )}
              <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crearVerificacion}>Registrar verificacion</button>
            </div>
            </PermisoAviso>

            <div style={card}>
              <h4>Historial</h4>
              {verificaciones.map((v) => (
                <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{v.fecha} — {v.resultados?.diagnostico || (v.cumple ? 'CUMPLE' : 'NO CUMPLE')}</span>
                    <Semaforo ok={v.cumple} labelOk="CUMPLE" labelBad="NO CUMPLE" />
                  </div>
                  {puede(permisos, 'exportar') && <button type="button" style={{ ...btnSecondary, marginTop: 6 }} onClick={() => downloadPdf(`/equipos/${sel}/verificaciones/${v.id}/pdf`, 'verificacion.pdf')}>PDF</button>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
