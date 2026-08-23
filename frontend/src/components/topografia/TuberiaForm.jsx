import { useEffect, useMemo, useState } from 'react'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function TuberiaForm({ contratoId, token, onSelect, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
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
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <TopoExcelSheet
          sheet={sheet}
          title="Tramo de tubería"
          minWidth={480}
          columns={[
            { key: 'nombre', label: 'Nombre', width: '30%' },
            { key: 'diametro', label: 'Diámetro', width: '22%' },
            { key: 'material', label: 'Material', width: '24%' },
            { key: 'tol', label: 'Tol. (cm)', width: '24%' },
          ]}
          cells={[
            <input key="n" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={sheet.cellInp} />,
            <input key="d" placeholder="Diámetro" value={form.diametro_nominal} onChange={(e) => setForm({ ...form, diametro_nominal: e.target.value })} style={sheet.cellInp} />,
            <input key="m" placeholder="Material" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} style={sheet.cellInp} />,
            <input key="t" type="number" value={form.tolerancia_cm} onChange={(e) => setForm({ ...form, tolerancia_cm: e.target.value })} style={sheet.cellInp} />,
          ]}
        />
        <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={crear}>Crear tramo</button>
      </div>
      </PermisoAviso>
      <div style={ui.card}>
        <h4>Tramos</h4>
        {lista.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <button type="button" style={{ ...ui.btnSecondary, textAlign: 'left' }} onClick={() => onSelect?.(t)}>{t.nombre} ({t.estado})</button>
            {puede(permisos, 'exportar') && <button type="button" style={ui.btnSecondary} onClick={() => downloadPdf(`/tuberias/${t.id}/pdf`, 'tuberia.pdf')}>PDF</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
