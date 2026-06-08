import { useCallback, useEffect, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import { PermisoAviso, puede, Semaforo, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function NivelacionForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [puntos, setPuntos] = useState([])
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', tipo: 'abierta', bm_inicial_id: '', bm_final_id: '', tolerancia_mm_km: 12 })
  const [lect, setLect] = useState({ orden: 1, nombre_punto: '', tipo_punto: 'TP', lectura_atras: '', lectura_adelante: '', distancia_atras: '', distancia_adelante: '' })

  const cargarLista = useCallback(async () => {
    const data = await api('/nivelaciones')
    setLista(data || [])
  }, [api])

  const cargarDetalle = useCallback(async (id) => {
    const data = await api(`/nivelaciones/${id}`)
    setDetalle(data)
    setSel(id)
  }, [api])

  useEffect(() => {
    cargarLista().catch((e) => setError(e.message))
    api('/puntos/verificados').then(setPuntos).catch(() => {})
  }, [api, cargarLista])

  const crear = async () => {
    try {
      const row = await api('/nivelaciones', { method: 'POST', body: JSON.stringify(form) })
      await cargarLista()
      if (row?.id) cargarDetalle(row.id)
    } catch (e) { setError(e.message) }
  }

  const agregarLectura = async () => {
    if (!sel) return
    await api(`/nivelaciones/${sel}/lecturas`, {
      method: 'POST',
      body: JSON.stringify({
        ...lect,
        orden: Number(lect.orden),
        lectura_atras: lect.lectura_atras === '' ? null : Number(lect.lectura_atras),
        lectura_adelante: lect.lectura_adelante === '' ? null : Number(lect.lectura_adelante),
        distancia_atras: lect.distancia_atras === '' ? null : Number(lect.distancia_atras),
        distancia_adelante: lect.distancia_adelante === '' ? null : Number(lect.distancia_adelante),
      }),
    })
    setLect({ ...lect, orden: Number(lect.orden) + 1 })
    cargarDetalle(sel)
  }

  const calcular = async () => {
    const res = await api(`/nivelaciones/${sel}/calcular`, { method: 'POST' })
    setResultado(res)
    cargarDetalle(sel)
  }

  const cerrar = async () => {
    const res = await api(`/nivelaciones/${sel}/cerrar`, { method: 'POST' })
    setResultado(res.resultado)
    cargarDetalle(sel)
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nueva nivelacion</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={ui.inputStyle} />
          <select value={form.bm_inicial_id} onChange={(e) => setForm({ ...form, bm_inicial_id: e.target.value })} style={ui.inputStyle}>
            <option value="">BM inicial</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={form.bm_final_id} onChange={(e) => setForm({ ...form, bm_final_id: e.target.value })} style={ui.inputStyle}>
            <option value="">BM final</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crear}>Crear</button>
      </div>
      </PermisoAviso>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div style={ui.card}>
          {lista.map((n) => (
            <button key={n.id} type="button" onClick={() => cargarDetalle(n.id)} style={{ ...btnSecondary, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}>
              {n.nombre}
            </button>
          ))}
        </div>
        {detalle && (
          <div>
            <div style={{ ...ui.card, marginBottom: 16 }}>
              <h3>{detalle.nivelacion?.nombre}</h3>
              <p>Error cierre: {detalle.nivelacion?.error_cierre ?? '—'} | Tolerancia: {detalle.nivelacion?.tolerancia_calculada ?? '—'}</p>
              {resultado && <Semaforo ok={resultado.admisible} />}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {puede(permisos, 'editar') && <button type="button" style={ui.btnPrimary} onClick={calcular}>Calcular</button>}
                {puede(permisos, 'editar') && <button type="button" style={ui.btnSecondary} onClick={cerrar}>Cerrar</button>}
                {puede(permisos, 'validar') && <button type="button" style={ui.btnSecondary} onClick={() => api(`/nivelaciones/${sel}/validar`, { method: 'POST' }).then(() => cargarDetalle(sel))}>Validar</button>}
                {puede(permisos, 'exportar') && <button type="button" style={ui.btnSecondary} onClick={() => downloadPdf(`/nivelaciones/${sel}/pdf`, 'nivelacion.pdf')}>PDF</button>}
              </div>
            </div>
            <PermisoAviso permisos={permisos} accion="editar">
            <div style={{ ...ui.card, marginBottom: 16 }}>
              <h4>Agregar lectura</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                <input type="number" placeholder="Orden" value={lect.orden} onChange={(e) => setLect({ ...lect, orden: e.target.value })} style={ui.inputStyle} />
                <input placeholder="Punto" value={lect.nombre_punto} onChange={(e) => setLect({ ...lect, nombre_punto: e.target.value })} style={ui.inputStyle} />
                <input placeholder="Atras" value={lect.lectura_atras} onChange={(e) => setLect({ ...lect, lectura_atras: e.target.value })} style={ui.inputStyle} />
                <input placeholder="Adelante" value={lect.lectura_adelante} onChange={(e) => setLect({ ...lect, lectura_adelante: e.target.value })} style={ui.inputStyle} />
              </div>
              <button type="button" style={{ ...btnPrimary, marginTop: 8 }} onClick={agregarLectura}>Agregar</button>
            </div>
            </PermisoAviso>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                <thead><tr style={{ background: '#f1f5f9' }}><th>Punto</th><th>Atras</th><th>Adelante</th><th>Cota aj.</th></tr></thead>
                <tbody>
                  {(detalle.lecturas || []).map((l) => (
                    <tr key={l.id}><td>{l.nombre_punto}</td><td>{l.lectura_atras}</td><td>{l.lectura_adelante}</td><td>{l.cota_ajustada}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PermisoAviso permisos={permisos} accion="editar">
            <div style={{ marginTop: 16 }}><FirmaDigital onConfirm={(f) => api(`/nivelaciones/${sel}/firma`, { method: 'POST', body: JSON.stringify({ nombre_firmante: 'Topografo', firma_base64: f }) })} /></div>
            </PermisoAviso>
          </div>
        )}
      </div>
    </div>
  )
}
