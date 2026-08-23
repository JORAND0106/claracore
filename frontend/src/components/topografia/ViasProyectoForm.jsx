import { useEffect, useMemo, useState } from 'react'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function ViasProyectoForm({ contratoId, token, onCreated, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
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
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <TopoExcelSheet
          sheet={sheet}
          title="Proyecto de verificación de vías"
          minWidth={480}
          columns={[
            { key: 'nombre', label: 'Nombre', width: '30%' },
            { key: 'ini', label: 'Abscisa inicio', width: '23%' },
            { key: 'fin', label: 'Abscisa fin', width: '23%' },
            { key: 'ancho', label: 'Ancho calzada', width: '24%' },
          ]}
          cells={[
            <input key="n" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={sheet.cellInp} />,
            <input key="i" placeholder="Abscisa inicio" value={form.abscisa_inicio} onChange={(e) => setForm({ ...form, abscisa_inicio: e.target.value })} style={sheet.cellInp} />,
            <input key="f" placeholder="Abscisa fin" value={form.abscisa_fin} onChange={(e) => setForm({ ...form, abscisa_fin: e.target.value })} style={sheet.cellInp} />,
            <input key="a" placeholder="Ancho calzada" value={form.ancho_calzada} onChange={(e) => setForm({ ...form, ancho_calzada: e.target.value })} style={sheet.cellInp} />,
          ]}
        />
        <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={crear}>Crear proyecto</button>
      </div>
      </PermisoAviso>
      <div style={ui.card}>
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
