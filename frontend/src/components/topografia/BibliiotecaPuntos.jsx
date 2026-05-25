import { useCallback, useEffect, useMemo, useState } from 'react'
import { btnPrimary, btnSecondary, card, inputStyle, PermisoAviso, puede, useTopografiaApi } from './topografiaShared'

const TIPOS = ['BM', 'estacion', 'auxiliar', 'PI', 'cambio']

export default function BibliiotecaPuntos({ contratoId, token, soloVerificados = false, permisos }) {
  const { api } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroVerificado, setFiltroVerificado] = useState(soloVerificados ? 'verificado' : '')
  const [form, setForm] = useState({ nombre: '', norte: '', este: '', cota: '', tipo: 'BM', verificado: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const path = soloVerificados ? '/puntos/verificados' : '/puntos'
      const data = await api(path)
      setPuntos(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
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

  const guardar = async () => {
    setError('')
    try {
      await api('/puntos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: form.nombre,
          norte: form.norte === '' ? null : Number(form.norte),
          este: form.este === '' ? null : Number(form.este),
          cota: form.cota === '' ? null : Number(form.cota),
          tipo: form.tipo,
          verificado: form.verificado,
        }),
      })
      setForm({ nombre: '', norte: '', este: '', cota: '', tipo: 'BM', verificado: false })
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  const eliminar = async (id) => {
    if (!window.confirm('Eliminar punto?')) return
    try {
      await api(`/puntos/${id}`, { method: 'DELETE' })
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

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
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nuevo punto (BM inicial)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} />
          <input placeholder="Norte" value={form.norte} onChange={(e) => setForm({ ...form, norte: e.target.value })} style={inputStyle} />
          <input placeholder="Este" value={form.este} onChange={(e) => setForm({ ...form, este: e.target.value })} style={inputStyle} />
          <input placeholder="Cota" value={form.cota} onChange={(e) => setForm({ ...form, cota: e.target.value })} style={inputStyle} />
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={form.verificado} onChange={(e) => setForm({ ...form, verificado: e.target.checked })} />
            Verificado (solo BM)
          </label>
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={guardar}>Agregar</button>
      </div>
      </PermisoAviso>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={inputStyle}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroVerificado} onChange={(e) => setFiltroVerificado(e.target.value)} style={inputStyle}>
          <option value="">Todos</option>
          <option value="verificado">Verificados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <button type="button" style={btnSecondary} onClick={cargar}>Actualizar</button>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      {loading ? <div>Cargando...</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={th}>Nombre</th><th style={th}>Norte</th><th style={th}>Este</th><th style={th}>Cota</th><th style={th}>Tipo</th><th style={th}>Estado</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={td}>{p.nombre}</td>
                  <td style={td}>{p.norte ?? '—'}</td>
                  <td style={td}>{p.este ?? '—'}</td>
                  <td style={td}>{p.cota ?? '—'}</td>
                  <td style={td}>{p.tipo}</td>
                  <td style={td}>
                    <span style={{ color: p.verificado ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                      {p.verificado ? 'Verificado' : 'Pendiente'}
                    </span>
                  </td>
                  <td style={td}>
                    {!p.circuito_id && puede(permisos, 'eliminar') && (
                      <button type="button" style={btnSecondary} onClick={() => eliminar(p.id)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th = { textAlign: 'left', padding: 8, borderBottom: '2px solid #cbd5e1' }
const td = { padding: 8 }
