import { useCallback, useEffect, useState } from 'react'
import {
  ACTA_ESTADOS,
  ACTA_TIPOS,
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'

/**
 * Repositorio consultable de actas (grilla + filtros + palabras clave).
 */
export default function ActasRepositorio({
  t,
  api,
  permisos,
  onNueva,
  onAbrir,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState({
    estado: '',
    tipo_acta: '',
    fecha_desde: '',
    fecha_hasta: '',
    q: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v })
      const data = await api.listActas(params)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar actas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api, filtros])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
      }}>
        <Field t={t} label="Palabras clave">
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') load() }}
            placeholder="Buscar en contenido del acta…"
            style={{ ...inp(t), minWidth: 220 }}
          />
        </Field>
        <Field t={t} label="Estado">
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={inp(t)}>
            {ACTA_ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Tipo">
          <select value={filtros.tipo_acta} onChange={(e) => setFiltros((f) => ({ ...f, tipo_acta: e.target.value }))} style={inp(t)}>
            {ACTA_TIPOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Desde">
          <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))} style={inp(t)} />
        </Field>
        <Field t={t} label="Hasta">
          <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))} style={inp(t)} />
        </Field>
        <button type="button" onClick={load} style={ghost(t)}>Buscar</button>
        {permisos?.crear && (
          <button type="button" onClick={onNueva} style={primary(t)}>+ Nueva acta</button>
        )}
      </div>

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando repositorio…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: t.textMuted }}>No hay actas que coincidan con la consulta.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: 860 }}>
            <thead>
              <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                <th style={th}>Consecutivo</th>
                <th style={th}>Número de acta</th>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Ubicación</th>
                <th style={th}>Elaborador</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onAbrir?.(a.id)}
                  style={{ cursor: 'pointer', borderTop: `1px solid ${t.border}`, background: t.bgCard }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${t.primary}10` }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = t.bgCard }}
                >
                  <td style={td}>{a.consecutivo ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: t.text }}>{numeroActaLabel(a.consecutivo)}</td>
                  <td style={td}>{fmtFecha(a.fecha_reunion)}</td>
                  <td style={td}>{labelTipoActa(a.tipo_acta || 'interna')}</td>
                  <td style={{ ...td, maxWidth: 220 }}>{a.ubicacion || '—'}</td>
                  <td style={td}>{a.elaborador_nombre || '—'}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                      border: `1px solid ${t.border}`, fontWeight: 600, fontSize: 'var(--cc-xs)',
                    }}>
                      {labelEstadoActa(a.estado)}
                    </span>
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

const th = { padding: '10px 8px', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '10px 8px', verticalAlign: 'middle', color: 'inherit' }

function Field({ t, label, children }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}
function inp(t) {
  return {
    fontSize: 'var(--cc-input)', padding: '6px 8px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bgCard, color: t.text,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
