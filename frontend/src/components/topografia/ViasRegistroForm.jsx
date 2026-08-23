import { useEffect, useMemo, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function ViasRegistroForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
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
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <TopoExcelSheet
          sheet={sheet}
          title="Registro de campo"
          minWidth={640}
          columns={[
            { key: 'proyecto', label: 'Proyecto', width: '22%' },
            { key: 'bm', label: 'BM referencia', width: '20%' },
            { key: 'capa', label: 'Capa', width: '14%' },
            { key: 'operador', label: 'Operador', width: '18%' },
            { key: 'fecha', label: 'Fecha', width: '14%' },
            { key: 'calzada', label: 'Calzada', width: '12%' },
          ]}
          cells={[
            <select key="p" value={form.proyecto_id} onChange={(e) => setForm({ ...form, proyecto_id: e.target.value })} style={sheet.cellSelect}>
              <option value="">Proyecto</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>,
            <select key="b" value={form.bm_referencia_id} onChange={(e) => setForm({ ...form, bm_referencia_id: e.target.value })} style={sheet.cellSelect}>
              <option value="">BM referencia</option>
              {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>,
            <input key="c" placeholder="Capa" value={form.capa_recibir} onChange={(e) => setForm({ ...form, capa_recibir: e.target.value })} style={sheet.cellInp} />,
            <input key="o" placeholder="Operador" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} style={sheet.cellInp} />,
            <input key="f" type="date" value={form.fecha_campo} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={sheet.cellInp} />,
            <input key="cal" placeholder="Calzada" value={form.calzada} onChange={(e) => setForm({ ...form, calzada: e.target.value })} style={sheet.cellInp} />,
          ]}
        />
        <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={crearRegistro}>Crear registro</button>
      </div>
      </PermisoAviso>

      {detalle && (
        <div>
          <PermisoAviso permisos={permisos} accion="editar">
          <div style={{ ...ui.card, marginBottom: 16 }}>
            <TopoExcelSheet
              sheet={sheet}
              title="Agregar lectura por abscisa"
              minWidth={480}
              columns={[
                { key: 'abscisa', label: 'Abscisa' },
                { key: 'hi', label: 'HI' },
                { key: 'mira', label: 'Lectura mira' },
                { key: 'cota', label: 'Cota diseño' },
              ]}
              cells={[
                <input key="a" placeholder="Abscisa" value={lect.abscisa} onChange={(e) => setLect({ ...lect, abscisa: e.target.value })} style={sheet.cellInp} />,
                <input key="h" placeholder="HI" value={lect.altura_instrumento} onChange={(e) => setLect({ ...lect, altura_instrumento: e.target.value })} style={sheet.cellInp} />,
                <input key="m" placeholder="Lectura mira" value={lect.lectura_mira} onChange={(e) => setLect({ ...lect, lectura_mira: e.target.value })} style={sheet.cellInp} />,
                <input key="c" placeholder="Cota diseno" value={lect.cota_diseno} onChange={(e) => setLect({ ...lect, cota_diseno: e.target.value })} style={sheet.cellInp} />,
              ]}
            />
            <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={agregarLectura}>Agregar</button>
          </div>
          </PermisoAviso>
          <div style={sheet.sheetWrap} className="cc-topo-table-scroll">
            <table style={{ ...sheet.sheetTable, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={sheet.th}>Abscisa</th>
                  <th style={sheet.th}>Cota campo</th>
                  <th style={sheet.th}>Cota diseno</th>
                  <th style={sheet.th}>Delta</th>
                  <th style={sheet.th}>OK</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.lecturas || []).map((l) => (
                  <tr key={l.id}>
                    <td style={sheet.td}>{l.abscisa}</td>
                    <td style={sheet.td}>{l.cota_campo}</td>
                    <td style={sheet.td}>{l.cota_diseno}</td>
                    <td style={sheet.td}>{l.delta}</td>
                    <td style={sheet.td}>{l.dentro_tolerancia ? 'SI' : 'NO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {puede(permisos, 'editar') && <button type="button" style={ui.btnSecondary} onClick={() => api(`/vias/registros/${sel}/calcular`, { method: 'POST' })}>Calcular</button>}
            {puede(permisos, 'validar') && <button type="button" style={ui.btnSecondary} onClick={() => api(`/vias/registros/${sel}/validar`, { method: 'POST' })}>Validar</button>}
            {puede(permisos, 'exportar') && <button type="button" style={ui.btnSecondary} onClick={() => downloadPdf(`/vias/registros/${sel}/pdf`, 'vias.pdf')}>PDF</button>}
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
