import { useEffect, useMemo, useState } from 'react'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

function svgFromPuntos(puntos, ancho = 480, alto = 320) {
  if (!puntos || puntos.length < 2) return null
  const valid = puntos.filter((p) => Number.isFinite(Number(p.norte)) && Number.isFinite(Number(p.este)))
  if (valid.length < 2) return null
  const nortes = valid.map((p) => Number(p.norte))
  const estes = valid.map((p) => Number(p.este))
  let minN = Math.min(...nortes), maxN = Math.max(...nortes)
  let minE = Math.min(...estes), maxE = Math.max(...estes)
  const pad = Math.max(maxN - minN, maxE - minE, 1) * 0.15
  minN -= pad; maxN += pad; minE -= pad; maxE += pad
  const tx = (e) => 30 + ((e - minE) / Math.max(maxE - minE, 0.001)) * (ancho - 60)
  const ty = (n) => alto - 30 - ((n - minN) / Math.max(maxN - minN, 0.001)) * (alto - 60)
  const coords = valid.map((p) => `${tx(Number(p.este))},${ty(Number(p.norte))}`).join(' ')
  return { coords, valid, tx, ty, ancho, alto }
}

export default function AreasForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { api, downloadPdf, online, saveDraft, loadDraft, syncDraft } = useTopografiaApi(contratoId, token)
  const [nombre, setNombre] = useState('')
  const [vertices, setVertices] = useState([{ nombre: 'P1', norte: '', este: '' }])
  const [resultado, setResultado] = useState(null)
  const [lista, setLista] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api('/areas').then(setLista).catch(() => {})
    const draft = loadDraft('areas')
    if (draft?.data) {
      setNombre(draft.data.nombre || '')
      setVertices(draft.data.puntos || [{ nombre: 'P1', norte: '', este: '' }])
    }
  }, [api, loadDraft])

  useEffect(() => {
    if (!online) saveDraft('areas', { nombre, puntos: vertices })
  }, [nombre, vertices, online, saveDraft])

  useEffect(() => {
    if (online) syncDraft('areas', '/areas').then((r) => { if (r) { setResultado(r); api('/areas').then(setLista) } }).catch(() => {})
  }, [online, syncDraft, api])

  const svg = useMemo(() => svgFromPuntos(vertices), [vertices])

  const agregarFila = () => setVertices([...vertices, { nombre: `P${vertices.length + 1}`, norte: '', este: '' }])
  const quitarFila = (i) => setVertices(vertices.filter((_, idx) => idx !== i))
  const update = (i, k, v) => setVertices(vertices.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))

  const calcular = async () => {
    setError('')
    try {
      const puntos = vertices.map((v) => ({ nombre: v.nombre, norte: Number(v.norte), este: Number(v.este) }))
      if (!online) {
        saveDraft('areas', { nombre, puntos, operador: '' })
        setError('Guardado localmente. Se sincronizara al reconectar.')
        return
      }
      const res = await api('/areas', { method: 'POST', body: JSON.stringify({ nombre, puntos }) })
      setResultado(res)
      api('/areas').then(setLista)
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      {error && <div style={{ color: '#92400e', marginBottom: 8 }}>{error}</div>}
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <TopoExcelSheet
          sheet={sheet}
          title="Datos del área"
          columns={[{ key: 'nombre', label: 'Nombre', ayuda: 'Identificador del polígono de área.' }]}
          cells={[
            <input key="n" placeholder="Nombre del area" value={nombre} onChange={(e) => setNombre(e.target.value)} style={sheet.cellInp} />,
          ]}
        />
        <div style={sheet.sectionTitle}>Vértices</div>
        <div style={sheet.sheetWrap} className="cc-topo-table-scroll">
          <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: 420 }}>
            <thead>
              <tr>
                <th style={sheet.th}>Vértice</th>
                <th style={sheet.th}>Norte</th>
                <th style={sheet.th}>Este</th>
                <th style={sheet.th} />
              </tr>
            </thead>
            <tbody>
              {vertices.map((v, i) => (
                <tr key={i}>
                  <td style={sheet.td}><input value={v.nombre} onChange={(e) => update(i, 'nombre', e.target.value)} style={sheet.cellInp} /></td>
                  <td style={sheet.td}><input value={v.norte} onChange={(e) => update(i, 'norte', e.target.value)} style={sheet.cellInp} /></td>
                  <td style={sheet.td}><input value={v.este} onChange={(e) => update(i, 'este', e.target.value)} style={sheet.cellInp} /></td>
                  <td style={sheet.td}>
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={() => quitarFila(i)}>X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cc-topo-actions-bar" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {puede(permisos, 'editar') && <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={agregarFila}>+ Vertice</button>}
          {(puede(permisos, 'crear') || puede(permisos, 'editar')) && <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} onClick={calcular}>Calcular</button>}
        </div>
      </div>

      {resultado && (
        <div style={{ ...ui.card, marginBottom: 16 }}>
          <p><strong>Area:</strong> {Number(resultado.area_m2).toFixed(4)} m² | {Number(resultado.area_ha).toFixed(6)} ha</p>
          <p><strong>Perimetro:</strong> {Number(resultado.perimetro).toFixed(3)} m</p>
          {resultado.id && puede(permisos, 'exportar') && <button type="button" style={ui.btnSecondary} onClick={() => downloadPdf(`/areas/${resultado.id}/pdf`, 'area.pdf')}>Generar PDF</button>}
        </div>
      )}

      {svg && (
        <div style={ui.card}>
          <svg width="100%" viewBox={`0 0 ${svg.ancho} ${svg.alto}`} style={{ background: '#f8fafc', borderRadius: 8 }}>
            <polygon points={svg.coords} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="2" />
            {svg.valid.map((p, i) => (
              <g key={i}>
                <circle cx={svg.tx(Number(p.este))} cy={svg.ty(Number(p.norte))} r="4" fill="#2563eb" />
                <text x={svg.tx(Number(p.este)) + 5} y={svg.ty(Number(p.norte)) - 5} fontSize="10">{p.nombre}</text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {lista.length > 0 && (
        <div style={{ ...ui.card, marginTop: 16 }}>
          <h4>Areas guardadas</h4>
          {lista.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
              <span>{a.nombre} — {Number(a.area_m2).toFixed(2)} m²</span>
              {puede(permisos, 'exportar') && <button type="button" style={ui.btnSecondary} onClick={() => downloadPdf(`/areas/${a.id}/pdf`, `${a.nombre}.pdf`)}>PDF</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
