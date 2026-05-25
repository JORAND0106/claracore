import { useCallback, useEffect, useMemo, useState } from 'react'
import TopoErrorModal from './TopoErrorModal'
import { btnSecondary, card, inputStyle, parseApiError, useTopografiaApi } from './topografiaShared'

const TIPOS = ['BM', 'estacion', 'auxiliar', 'PI', 'cambio']

export default function BibliiotecaPuntos({ contratoId, token, soloVerificados = false, t: theme }) {
  const { api } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroVerificado, setFiltroVerificado] = useState(soloVerificados ? 'verificado' : '')
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
      <select value="" onChange={() => {}} style={inputStyle} disabled={loading}>
        <option value="">— Seleccionar punto verificado —</option>
        {filtrados.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
        ))}
      </select>
    )
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: 16, background: '#f8fafc' }}>
        <h3 style={{ marginTop: 0 }}>Biblioteca de puntos</h3>
        <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: '#475569', lineHeight: 1.5 }}>
          Esta biblioteca es de solo consulta. Los puntos se incorporan automaticamente al cerrar poligonales,
          nivelaciones o intersecciones admisibles. Los BM iniciales del contrato los carga el administrador.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={inputStyle}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select>
        <select value={filtroVerificado} onChange={(e) => setFiltroVerificado(e.target.value)} style={inputStyle}>
          <option value="">Todos</option>
          <option value="verificado">Verificados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <button type="button" style={btnSecondary} onClick={cargar}>Actualizar</button>
      </div>

      {loading ? <div>Cargando...</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Norte</th>
                <th style={th}>Este</th>
                <th style={th}>Cota</th>
                <th style={th}>Tipo</th>
                <th style={th}>Origen</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!filtrados.length && (
                <tr>
                  <td colSpan={7} style={{ ...td, color: '#64748b', textAlign: 'center' }}>
                    No hay puntos registrados. Cree y cierre una poligonal para poblar la biblioteca.
                  </td>
                </tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={td}>{p.nombre}</td>
                  <td style={td}>{p.norte ?? '—'}</td>
                  <td style={td}>{p.este ?? '—'}</td>
                  <td style={td}>{p.cota ?? '—'}</td>
                  <td style={td}>{p.tipo}</td>
                  <td style={td}>{p.modulo_origen || '—'}</td>
                  <td style={td}>
                    <span style={{ color: p.verificado ? '#16a34a' : '#64748b', fontWeight: 600 }}>
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
        <TopoErrorModal theme={theme} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}

const th = { textAlign: 'left', padding: 8, borderBottom: '2px solid #cbd5e1' }
const td = { padding: 8 }
