import { useCallback, useEffect, useMemo, useState } from 'react'
import TopoErrorModal from './TopoErrorModal'
import { parseApiError, useTopografiaApi, useTopoTheme } from './topografiaShared'

const TIPOS = ['BM', 'estacion', 'auxiliar', 'PI', 'cambio']

export default function BibliiotecaPuntos({ contratoId, token, soloVerificados = false }) {
  const ui = useTopoTheme()
  const { api } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroVerificado, setFiltroVerificado] = useState('verificado')
  const [errorModal, setErrorModal] = useState(null)
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const path = soloVerificados ? '/puntos/verificados' : '/puntos'
      const data = await api(path)
      setPuntos(Array.isArray(data) ? data : [])
    } catch (e) {
      setErrorModal(parseApiError(e.message))
    } finally {
      setLoading(false)
    }
  }, [api, soloVerificados])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => puntos.filter((p) => {
    if (filtroTipo && p.tipo !== filtroTipo) return false
    if (filtroVerificado === 'verificado' && !p.verificado) return false
    if (filtroVerificado === 'pendiente' && p.verificado) return false
    return true
  }), [puntos, filtroTipo, filtroVerificado])

  if (soloVerificados) {
    return (
      <select value="" onChange={() => {}} style={ui.inputStyle} disabled={loading}>
        <option value="">— Seleccionar punto verificado —</option>
        {filtrados.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
        ))}
      </select>
    )
  }

  return (
    <div>
      <div style={{ ...ui.card, marginBottom: 16, background: ui.t?.inputBg || ui.card.background }}>
        <h3 style={{ marginTop: 0, color: ui.text }}>Biblioteca de puntos</h3>
        <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.5 }}>
          Esta biblioteca es de solo consulta. Los puntos se incorporan automaticamente al cerrar poligonales,
          nivelaciones o intersecciones admisibles. El primer BM se define en el popup de la poligonal (punto de amarre).
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={ui.inputStyle}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select>
        <select value={filtroVerificado} onChange={(e) => setFiltroVerificado(e.target.value)} style={ui.inputStyle}>
          <option value="">Todos</option>
          <option value="verificado">Verificados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <button type="button" style={ui.btnSecondary} onClick={cargar}>Actualizar</button>
      </div>

      {loading ? <div style={{ color: ui.textMuted }}>Cargando...</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr>
                <th style={ui.th}>Nombre</th>
                <th style={ui.th}>Norte</th>
                <th style={ui.th}>Este</th>
                <th style={ui.th}>Cota</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Origen</th>
                <th style={ui.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!filtrados.length && (
                <tr>
                  <td colSpan={7} style={{ ...ui.td, color: ui.textMuted, textAlign: 'center' }}>
                    No hay puntos registrados. Cree y cierre una poligonal para poblar la biblioteca.
                  </td>
                </tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>{p.nombre}</td>
                  <td style={ui.td}>{p.norte ?? '—'}</td>
                  <td style={ui.td}>{p.este ?? '—'}</td>
                  <td style={ui.td}>{p.cota ?? '—'}</td>
                  <td style={ui.td}>{p.tipo}</td>
                  <td style={ui.td}>{p.modulo_origen || '—'}</td>
                  <td style={ui.td}>
                    <span style={{ color: p.verificado ? '#16a34a' : ui.textMuted, fontWeight: 600 }}>
                      {p.verificado ? 'Verificado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}

