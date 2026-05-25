import { useEffect, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, useTopografiaApi } from './topografiaShared'

export default function ViasRegistroForm({ contratoId, token, permisos }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [proyectos, setProyectos] = useState([])
  const [puntos, setPuntos] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState({ proyecto_id: '', capa_recibir: '', calzada: '', bm_referencia_id: '', fecha_campo: '', operador: '' })
  const [lect, setLect] = useState({ orden: 1, abscisa: '', punto_tomado: '', altura_instrumento: '', lectura_mira: '', cota_diseno: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    api('/vias/proyectos').then(setProyectos).catch(() => {})
    api('/puntos/verificados').then(setPuntos).catch(() => {})
  }, [api])

  const crearRegistro = async () => {
    try {
      const row = await api('/vias/registros', { method: 'POST', body: JSON.stringify(form) })
      setSel(row.id)
      setDetalle({ registro: row, lecturas: [] })
    } catch (e) { setError(e.message) }
  }

  const agregarLectura = async () => {
    if (!sel) return
    await api(`/vias/registros/${sel}/lecturas`, {
      method: 'POST',
      body: JSON.stringify({
        ...lect,
        orden: Number(lect.orden),
        abscisa: Number(lect.abscisa),
        altura_instrumento: lect.altura_instrumento === '' ? null : Number(lect.altura_instrumento),
        lectura_mira: lect.lectura_mira === '' ? null : Number(lect.lectura_mira),
        cota_diseno: lect.cota_diseno === '' ? null : Number(lect.cota_diseno),
      }),
    })
    const data = await api(`/vias/registros/${sel}`)
    setDetalle(data)
    setLect({ ...lect, orden: Number(lect.orden) + 1 })
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Registro de campo</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <select value={form.proyecto_id} onChange={(e) => setForm({ ...form, proyecto_id: e.target.value })} style={inputStyle}>
            <option value="">Proyecto</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={form.bm_referencia_id} onChange={(e) => setForm({ ...form, bm_referencia_id: e.target.value })} style={inputStyle}>
            <option value="">BM referencia</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input placeholder="Capa" value={form.capa_recibir} onChange={(e) => setForm({ ...form, capa_recibir: e.target.value })} style={inputStyle} />
          <input placeholder="Operador" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crearRegistro}>Crear registro</button>
      </div>
      </PermisoAviso>

      {detalle && (
        <div>
          <PermisoAviso permisos={permisos} accion="editar">
          <div style={{ ...card, marginBottom: 16 }}>
            <h4>Agregar lectura por abscisa</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
              <input placeholder="Abscisa" value={lect.abscisa} onChange={(e) => setLect({ ...lect, abscisa: e.target.value })} style={inputStyle} />
              <input placeholder="HI" value={lect.altura_instrumento} onChange={(e) => setLect({ ...lect, altura_instrumento: e.target.value })} style={inputStyle} />
              <input placeholder="Lectura mira" value={lect.lectura_mira} onChange={(e) => setLect({ ...lect, lectura_mira: e.target.value })} style={inputStyle} />
              <input placeholder="Cota diseno" value={lect.cota_diseno} onChange={(e) => setLect({ ...lect, cota_diseno: e.target.value })} style={inputStyle} />
            </div>
            <button type="button" style={{ ...btnPrimary, marginTop: 8 }} onClick={agregarLectura}>Agregar</button>
          </div>
          </PermisoAviso>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f1f5f9' }}><th>Abscisa</th><th>Cota campo</th><th>Cota diseno</th><th>Delta</th><th>OK</th></tr></thead>
              <tbody>
                {(detalle.lecturas || []).map((l) => (
                  <tr key={l.id}><td>{l.abscisa}</td><td>{l.cota_campo}</td><td>{l.cota_diseno}</td><td>{l.delta}</td><td>{l.dentro_tolerancia ? 'SI' : 'NO'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {puede(permisos, 'editar') && <button type="button" style={btnSecondary} onClick={() => api(`/vias/registros/${sel}/calcular`, { method: 'POST' })}>Calcular</button>}
            {puede(permisos, 'validar') && <button type="button" style={btnSecondary} onClick={() => api(`/vias/registros/${sel}/validar`, { method: 'POST' })}>Validar</button>}
            {puede(permisos, 'exportar') && <button type="button" style={btnSecondary} onClick={() => downloadPdf(`/vias/registros/${sel}/pdf`, 'vias.pdf')}>PDF</button>}
          </div>
          <PermisoAviso permisos={permisos} accion="editar">
          <div style={{ marginTop: 16 }}>
            <FirmaDigital onConfirm={(f) => api(`/vias/registros/${sel}/firma`, { method: 'POST', body: JSON.stringify({ nombre_firmante: 'Topografo', firma_base64: f }) })} />
          </div>
          </PermisoAviso>
        </div>
      )}
    </div>
  )
}
