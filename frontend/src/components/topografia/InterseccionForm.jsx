import { useEffect, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, Semaforo, useTopografiaApi } from './topografiaShared'

export default function InterseccionForm({ contratoId, token, permisos }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [paso, setPaso] = useState(1)
  const [form, setForm] = useState({
    nombre_punto_nuevo: '',
    punto1_id: '', azimut1_gms: '', distancia1: '',
    punto2_id: '', azimut2_gms: '', distancia2: '',
    tolerancia_lineal: 0.05,
    tolerancia_angular_seg: 30,
  })
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/puntos/verificados').then(setPuntos).catch((e) => setError(e.message))
  }, [api])

  const calcular = async () => {
    setError('')
    try {
      const body = {
        ...form,
        azimut1_gms: Number(form.azimut1_gms),
        distancia1: Number(form.distancia1),
        azimut2_gms: Number(form.azimut2_gms),
        distancia2: Number(form.distancia2),
      }
      const res = await api('/intersecciones', { method: 'POST', body: JSON.stringify(body) })
      setResultado(res)
      setPaso(4)
    } catch (e) { setError(e.message) }
  }

  const agregarBiblioteca = async () => {
    if (!resultado?.id) return
    try {
      await api(`/intersecciones/${resultado.id}/agregar-a-biblioteca`, { method: 'POST' })
      alert('Punto agregado a biblioteca verificada')
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} style={{ padding: '4px 10px', borderRadius: 999, background: paso >= n ? '#2563eb' : '#e2e8f0', color: paso >= n ? '#fff' : '#64748b', fontSize: 'var(--cc-sm)' }}>
            Paso {n}
          </span>
        ))}
      </div>

      {paso === 1 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Nombre del punto nuevo</h3>
          <input placeholder="Ej: XXX" value={form.nombre_punto_nuevo} onChange={(e) => setForm({ ...form, nombre_punto_nuevo: e.target.value })} style={inputStyle} />
          <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={() => setPaso(2)} disabled={!form.nombre_punto_nuevo}>Continuar</button>
        </div>
      )}

      {paso === 2 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Punto 1 conocido</h3>
          <select value={form.punto1_id} onChange={(e) => setForm({ ...form, punto1_id: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }}>
            <option value="">Seleccionar</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <TopoAngularInput label="Azimut desde XXX hacia P1 (GG.MMSS)" value={form.azimut1_gms} onChange={(_, v) => setForm({ ...form, azimut1_gms: v })} />
          <input placeholder="Distancia (m)" value={form.distancia1} onChange={(e) => setForm({ ...form, distancia1: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnSecondary} onClick={() => setPaso(1)}>Atras</button>
            <button type="button" style={btnPrimary} onClick={() => setPaso(3)} disabled={!form.punto1_id}>Continuar</button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Punto 2 conocido</h3>
          <select value={form.punto2_id} onChange={(e) => setForm({ ...form, punto2_id: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }}>
            <option value="">Seleccionar</option>
            {puntos.filter((p) => p.id !== form.punto1_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <TopoAngularInput label="Azimut desde XXX hacia P2 (GG.MMSS)" value={form.azimut2_gms} onChange={(_, v) => setForm({ ...form, azimut2_gms: v })} />
          <input placeholder="Distancia (m)" value={form.distancia2} onChange={(e) => setForm({ ...form, distancia2: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnSecondary} onClick={() => setPaso(2)}>Atras</button>
            {puede(permisos, 'crear') && <button type="button" style={btnPrimary} onClick={calcular} disabled={!form.punto2_id}>Calcular</button>}
          </div>
        </div>
      )}

      {paso === 4 && resultado && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Resultado — {form.nombre_punto_nuevo}</h3>
          <Semaforo ok={resultado.admisible} />
          <p style={{ marginTop: 12 }}>Norte: <strong>{resultado.norte_resultado}</strong> | Este: <strong>{resultado.este_resultado}</strong></p>
          <p>Error lineal: {resultado.error_lineal} m | Error angular: {resultado.error_angular_segundos} seg</p>
          {resultado.svg && <div dangerouslySetInnerHTML={{ __html: resultado.svg }} style={{ marginTop: 12 }} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {resultado.admisible && puede(permisos, 'editar') && <button type="button" style={btnPrimary} onClick={agregarBiblioteca}>Agregar a biblioteca</button>}
            {puede(permisos, 'exportar') && <button type="button" style={btnSecondary} onClick={() => downloadPdf(`/intersecciones/${resultado.id}/pdf`, 'interseccion.pdf')}>Generar PDF</button>}
            <button type="button" style={btnSecondary} onClick={() => { setPaso(1); setResultado(null) }}>Nuevo calculo</button>
          </div>
        </div>
      )}
    </div>
  )
}
