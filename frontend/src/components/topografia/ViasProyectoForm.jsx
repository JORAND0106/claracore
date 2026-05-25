import { useEffect, useState } from 'react'
import { btnPrimary, card, inputStyle, PermisoAviso, useTopografiaApi } from './topografiaShared'

export default function ViasProyectoForm({ contratoId, token, onCreated, permisos }) {
  const { api } = useTopografiaApi(contratoId, token)
  const [proyectos, setProyectos] = useState([])
  const [form, setForm] = useState({ nombre: '', abscisa_inicio: '', abscisa_fin: '', ancho_calzada: '' })
  const [error, setError] = useState('')

  const cargar = () => api('/vias/proyectos').then(setProyectos).catch((e) => setError(e.message))

  useEffect(() => { cargar() }, [])

  const crear = async () => {
    try {
      const row = await api('/vias/proyectos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: form.nombre,
          abscisa_inicio: form.abscisa_inicio === '' ? null : Number(form.abscisa_inicio),
          abscisa_fin: form.abscisa_fin === '' ? null : Number(form.abscisa_fin),
          ancho_calzada: form.ancho_calzada === '' ? null : Number(form.ancho_calzada),
        }),
      })
      cargar()
      onCreated?.(row)
      setForm({ nombre: '', abscisa_inicio: '', abscisa_fin: '', ancho_calzada: '' })
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Proyecto de verificacion de vias</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} />
          <input placeholder="Abscisa inicio" value={form.abscisa_inicio} onChange={(e) => setForm({ ...form, abscisa_inicio: e.target.value })} style={inputStyle} />
          <input placeholder="Abscisa fin" value={form.abscisa_fin} onChange={(e) => setForm({ ...form, abscisa_fin: e.target.value })} style={inputStyle} />
          <input placeholder="Ancho calzada" value={form.ancho_calzada} onChange={(e) => setForm({ ...form, ancho_calzada: e.target.value })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crear}>Crear proyecto</button>
      </div>
      </PermisoAviso>
      <div style={card}>
        <h4>Proyectos existentes</h4>
        {proyectos.map((p) => (
          <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
            {p.nombre} — PK {p.abscisa_inicio} a {p.abscisa_fin}
          </div>
        ))}
      </div>
    </div>
  )
}
