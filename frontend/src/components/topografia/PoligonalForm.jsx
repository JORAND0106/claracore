import { useCallback, useEffect, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import PoligonalGrafico from './PoligonalGrafico'
import FirmaDigital from './FirmaDigital'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, Semaforo, useTopografiaApi } from './topografiaShared'

export default function PoligonalForm({ contratoId, token, permisos }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', tipo: 'cerrada', tolerancia_relativa: 3000, punto_inicial_id: '', punto_final_id: '' })
  const [estForm, setEstForm] = useState({ orden: 1, nombre_punto: '', angulo_gms: '', distancia: '' })
  const [puntosVerificados, setPuntosVerificados] = useState([])

  const cargarLista = useCallback(async () => {
    try {
      const data = await api('/poligonales')
      setLista(data || [])
    } catch (e) { setError(e.message) }
  }, [api])

  const cargarDetalle = useCallback(async (id) => {
    try {
      const data = await api(`/poligonales/${id}`)
      setDetalle(data)
      setSel(id)
    } catch (e) { setError(e.message) }
  }, [api])

  useEffect(() => {
    cargarLista()
    api('/puntos/verificados').then(setPuntosVerificados).catch(() => {})
  }, [api, cargarLista])

  const crear = async () => {
    setError('')
    try {
      const row = await api('/poligonales', { method: 'POST', body: JSON.stringify(form) })
      await cargarLista()
      if (row?.id) cargarDetalle(row.id)
    } catch (e) { setError(e.message) }
  }

  const agregarEstacion = async () => {
    if (!sel) return
    try {
      await api(`/poligonales/${sel}/estaciones`, {
        method: 'POST',
        body: JSON.stringify({
          orden: Number(estForm.orden),
          nombre_punto: estForm.nombre_punto,
          angulo_gms: Number(estForm.angulo_gms),
          distancia: Number(estForm.distancia),
        }),
      })
      setEstForm({ ...estForm, orden: Number(estForm.orden) + 1, nombre_punto: '', angulo_gms: '', distancia: '' })
      cargarDetalle(sel)
    } catch (e) { setError(e.message) }
  }

  const calcular = async () => {
    if (!sel) return
    try {
      const res = await api(`/poligonales/${sel}/calcular`, { method: 'POST' })
      setResultado(res)
      cargarDetalle(sel)
    } catch (e) { setError(e.message) }
  }

  const cerrar = async () => {
    if (!sel) return
    try {
      const res = await api(`/poligonales/${sel}/cerrar`, { method: 'POST' })
      setResultado(res.resultado)
      cargarDetalle(sel)
      cargarLista()
    } catch (e) { setError(e.message) }
  }

  const validar = async () => {
    if (!sel) return
    await api(`/poligonales/${sel}/validar`, { method: 'POST' })
    cargarDetalle(sel)
  }

  const guardarFirma = async (firma) => {
    if (!sel) return
    await api(`/poligonales/${sel}/firma`, {
      method: 'POST',
      body: JSON.stringify({
        nombre_firmante: 'Topografo',
        cargo_firmante: 'Topografo',
        firma_base64: firma,
      }),
    })
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nueva poligonal</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} />
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
            <option value="cerrada">Cerrada</option>
            <option value="abierta">Abierta</option>
          </select>
          <select value={form.punto_inicial_id} onChange={(e) => setForm({ ...form, punto_inicial_id: e.target.value })} style={inputStyle}>
            <option value="">Punto inicial</option>
            {puntosVerificados.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={form.punto_final_id} onChange={(e) => setForm({ ...form, punto_final_id: e.target.value })} style={inputStyle}>
            <option value="">Punto final</option>
            {puntosVerificados.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input type="number" placeholder="Tolerancia 1:N" value={form.tolerancia_relativa} onChange={(e) => setForm({ ...form, tolerancia_relativa: Number(e.target.value) })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crear}>Crear</button>
      </div>
      </PermisoAviso>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div style={card}>
          <h4 style={{ marginTop: 0 }}>Circuitos</h4>
          {lista.map((p) => (
            <button key={p.id} type="button" onClick={() => cargarDetalle(p.id)} style={{ ...btnSecondary, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left', background: sel === p.id ? '#eff6ff' : '#fff' }}>
              {p.nombre} <small>({p.estado})</small>
            </button>
          ))}
        </div>

        {detalle && (
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{detalle.poligonal?.nombre}</h3>
              <p>Precision: 1:{Math.round(detalle.poligonal?.precision_relativa || 0)} | Error: {detalle.poligonal?.error_lineal ?? '—'} m</p>
              {resultado && <Semaforo ok={resultado.admisible} labelOk="Cierre admisible" labelBad="Cierre inadmisible" />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {puede(permisos, 'editar') && <button type="button" style={btnPrimary} onClick={calcular}>Calcular</button>}
                {puede(permisos, 'editar') && <button type="button" style={btnSecondary} onClick={cerrar}>Cerrar circuito</button>}
                {puede(permisos, 'validar') && <button type="button" style={btnSecondary} onClick={validar}>Validar</button>}
                {puede(permisos, 'exportar') && <button type="button" style={btnSecondary} onClick={() => downloadPdf(`/poligonales/${sel}/pdf`, 'poligonal.pdf')}>PDF</button>}
              </div>
            </div>

            <PermisoAviso permisos={permisos} accion="editar">
            <div style={{ ...card, marginBottom: 16 }}>
              <h4>Agregar estacion</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                <input type="number" placeholder="Orden" value={estForm.orden} onChange={(e) => setEstForm({ ...estForm, orden: e.target.value })} style={inputStyle} />
                <input placeholder="Nombre punto" value={estForm.nombre_punto} onChange={(e) => setEstForm({ ...estForm, nombre_punto: e.target.value })} style={inputStyle} />
                <TopoAngularInput label="Angulo (GG.MMSS)" value={estForm.angulo_gms} onChange={(_, v) => setEstForm({ ...estForm, angulo_gms: v })} />
                <input placeholder="Distancia (m)" value={estForm.distancia} onChange={(e) => setEstForm({ ...estForm, distancia: e.target.value })} style={inputStyle} />
              </div>
              <button type="button" style={{ ...btnPrimary, marginTop: 8 }} onClick={agregarEstacion}>Agregar</button>
            </div>
            </PermisoAviso>

            <PoligonalGrafico estaciones={detalle.estaciones} />

            <PermisoAviso permisos={permisos} accion="editar">
            <div style={{ marginTop: 16 }}>
              <FirmaDigital onConfirm={guardarFirma} />
            </div>
            </PermisoAviso>
          </div>
        )}
      </div>
    </div>
  )
}
