import { useCallback, useEffect, useMemo, useState } from 'react'
import TopoErrorModal from './TopoErrorModal'
import {
  parseApiError,
  puede,
  TopoTableScroll,
  useTopografiaApi,
  useTopoTheme,
} from './topografiaShared'

const TIPOS = ['BM', 'estacion', 'auxiliar', 'PI', 'cambio']

const EMPTY_FORM = {
  nombre: '',
  norte: '',
  este: '',
  cota: '',
  tipo: 'BM',
  verificado: true,
  operador: '',
  fecha_campo: '',
}

function fmtFechaPunto(p) {
  const raw = p.fecha_campo || p.created_at
  if (!raw) return '—'
  const d = String(raw).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }
  try {
    return new Date(raw).toLocaleDateString('es-CO')
  } catch {
    return '—'
  }
}

export default function BibliiotecaPuntos({ contratoId, token, soloVerificados = false, permisos = {} }) {
  const ui = useTopoTheme()
  const { api, efectivoOffline } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroVerificado, setFiltroVerificado] = useState('verificado')
  const [errorModal, setErrorModal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

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

  const abrirNuevo = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setFormOpen(true)
  }

  const abrirEditar = (p) => {
    if (p.verificado && p.circuito_id) {
      setErrorModal({
        titulo: 'No editable',
        mensaje: 'Este punto proviene de un circuito sellado y no puede editarse manualmente.',
      })
      return
    }
    setEditId(p.id)
    setForm({
      nombre: p.nombre || '',
      norte: p.norte ?? '',
      este: p.este ?? '',
      cota: p.cota ?? '',
      tipo: p.tipo || 'BM',
      verificado: Boolean(p.verificado),
      operador: p.operador || '',
      fecha_campo: p.fecha_campo || '',
    })
    setFormOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre?.trim()) {
      setErrorModal({ titulo: 'Datos incompletos', mensaje: 'Indique el nombre del punto.' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        norte: form.norte === '' ? null : Number(form.norte),
        este: form.este === '' ? null : Number(form.este),
        cota: form.cota === '' ? null : Number(form.cota),
        tipo: form.tipo,
        verificado: form.tipo === 'BM' ? Boolean(form.verificado) : false,
        operador: form.operador || null,
        fecha_campo: form.fecha_campo || null,
      }
      if (editId) {
        await api(`/puntos/${editId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/puntos', { method: 'POST', body: JSON.stringify(payload) })
      }
      setFormOpen(false)
      // Tras verificar un BM pendiente, mostrar verificados para que el estado se vea al instante.
      if (payload.verificado && filtroVerificado === 'pendiente') {
        setFiltroVerificado('verificado')
      }
      await cargar()
    } catch (e) {
      setErrorModal(parseApiError(e.message))
    } finally {
      setBusy(false)
    }
  }

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

  const puedeCrear = puede(permisos, 'crear')
  const puedeEditar = puede(permisos, 'editar')

  return (
    <div>
      <div style={{ ...ui.card, marginBottom: 16, background: ui.t?.inputBg || ui.card.background }}>
        <h3 style={{ marginTop: 0, color: ui.text }}>Biblioteca de puntos</h3>
        <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.5 }}>
          Consulta puntos verificados del contrato. Puede crear BM manualmente {efectivoOffline ? '(se sincronizarán al recuperar señal)' : ''}.
          Los demás puntos se incorporan al sellar poligonales o aprobar NewPoint en interventoría.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={ui.inputStyle}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select>
        <select value={filtroVerificado} onChange={(e) => setFiltroVerificado(e.target.value)} style={ui.inputStyle}>
          <option value="">Todos</option>
          <option value="verificado">Verificados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={cargar}>Actualizar</button>
        {puedeCrear && (
          <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} onClick={abrirNuevo}>
            + Punto manual
          </button>
        )}
      </div>

      {formOpen && (
        <div style={{ ...ui.card, marginBottom: 16 }}>
          <h4 style={{ marginTop: 0 }}>{editId ? 'Editar punto' : 'Nuevo punto manual'}</h4>
          <div className="cc-topo-compact-row" style={ui.compactFieldRow}>
            <label style={ui.compactFieldCol()}>
              <span style={ui.fieldCaption}>Nombre *</span>
              <input style={ui.compactInput} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label style={ui.compactFieldCol()}>
              <span style={ui.fieldCaption}>Tipo</span>
              <select style={ui.compactInput} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={ui.compactFieldCol()}>
              <span style={ui.fieldCaption}>Norte</span>
              <input style={ui.compactInput} value={form.norte} onChange={(e) => setForm({ ...form, norte: e.target.value })} />
            </label>
            <label style={ui.compactFieldCol()}>
              <span style={ui.fieldCaption}>Este</span>
              <input style={ui.compactInput} value={form.este} onChange={(e) => setForm({ ...form, este: e.target.value })} />
            </label>
            <label style={ui.compactFieldCol()}>
              <span style={ui.fieldCaption}>Cota</span>
              <input style={ui.compactInput} value={form.cota} onChange={(e) => setForm({ ...form, cota: e.target.value })} />
            </label>
          </div>
          {form.tipo === 'BM' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 'var(--cc-sm)' }}>
              <input type="checkbox" checked={form.verificado} onChange={(e) => setForm({ ...form, verificado: e.target.checked })} />
              Marcar como verificado (solo BM iniciales)
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} onClick={guardar} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={() => setFormOpen(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: ui.textMuted }}>Cargando...</div> : (
        <TopoTableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr>
                <th style={ui.th}>Nombre</th>
                <th style={ui.th}>Norte</th>
                <th style={ui.th}>Este</th>
                <th style={ui.th}>Cota</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Origen</th>
                <th style={ui.th}>Operador</th>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>Estado</th>
                {puedeEditar && <th style={ui.th} />}
              </tr>
            </thead>
            <tbody>
              {!filtrados.length && (
                <tr>
                  <td colSpan={puedeEditar ? 10 : 9} style={{ ...ui.td, color: ui.textMuted, textAlign: 'center' }}>
                    No hay puntos registrados.
                  </td>
                </tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>
                    {p.nombre}
                    {p._pending_sync && <span title="Pendiente sync" style={{ marginLeft: 4, color: '#2563eb' }}>⏳</span>}
                  </td>
                  <td style={ui.td}>{p.norte ?? '—'}</td>
                  <td style={ui.td}>{p.este ?? '—'}</td>
                  <td style={ui.td}>{p.cota ?? '—'}</td>
                  <td style={ui.td}>{p.tipo}</td>
                  <td style={ui.td}>{p.modulo_origen || (p._local ? 'manual offline' : '—')}</td>
                  <td style={ui.td}>{p.operador || '—'}</td>
                  <td style={ui.td}>{fmtFechaPunto(p)}</td>
                  <td style={ui.td}>
                    <span style={{ color: p.verificado ? (ui.t?.success || 'var(--cc-color-success)') : ui.textMuted, fontWeight: 600 }}>
                      {p.verificado ? 'Verificado' : 'Pendiente'}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td style={ui.td}>
                      <button type="button" style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }} onClick={() => abrirEditar(p)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TopoTableScroll>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
