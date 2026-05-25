import { useEffect, useState } from 'react'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, useTopografiaApi } from './topografiaShared'

export default function TuberiaForm({ contratoId, token, onSelect, permisos }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [form, setForm] = useState({ nombre: '', diametro_nominal: '', material: '', tolerancia_cm: 2 })
  const [error, setError] = useState('')

  const cargar = () => api('/tuberias').then(setLista).catch((e) => setError(e.message))

  useEffect(() => { cargar() }, [])

  const crear = async () => {
    const row = await api('/tuberias', { method: 'POST', body: JSON.stringify(form) })
    cargar()
    onSelect?.(row)
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Tramo de tuberia</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} />
          <input placeholder="Diametro" value={form.diametro_nominal} onChange={(e) => setForm({ ...form, diametro_nominal: e.target.value })} style={inputStyle} />
          <input placeholder="Material" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crear}>Crear tramo</button>
      </div>
      </PermisoAviso>
      <div style={card}>
        <h4>Tramos</h4>
        {lista.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <button type="button" style={{ ...btnSecondary, textAlign: 'left' }} onClick={() => onSelect?.(t)}>{t.nombre} ({t.estado})</button>
            {puede(permisos, 'exportar') && <button type="button" style={btnSecondary} onClick={() => downloadPdf(`/tuberias/${t.id}/pdf`, 'tuberia.pdf')}>PDF</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
