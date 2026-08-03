import { useCallback, useEffect, useState } from 'react'
import {
  ACTA_ESTADOS,
  ACTA_TIPOS,
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'

export const MSG_ACTA_ACCESO_RESTRINGIDO =
  'No tiene acceso a esta acta. Solo el elaborador, los asistentes registrados y los roles Administrador o Desarrollador pueden consultarla.'

/**
 * Repositorio consultable de actas (grilla + filtros + palabras clave).
 * Las actas sin permiso de contenido siguen visibles pero bloqueadas al abrir.
 */
export default function ActasRepositorio({
  t,
  api,
  permisos,
  viewportCompact = false,
  onNueva,
  onAbrir,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accesoMsg, setAccesoMsg] = useState('')
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

  const handleAbrir = (a) => {
    const bloqueada = a?.puede_abrir === false || a?.acceso_restringido === true
    if (bloqueada) {
      setAccesoMsg(MSG_ACTA_ACCESO_RESTRINGIDO)
      return
    }
    setAccesoMsg('')
    onAbrir?.(a.id)
  }

  return (
    <div className={viewportCompact ? 'cc-seguim-actas cc-seguim-actas--compact' : 'cc-seguim-actas'}>
      <div className="cc-seguim-filters" style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
      }}>
        <Field t={t} label="Palabras clave" className="cc-seguim-filter cc-seguim-filter--wide">
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') load() }}
            placeholder="Buscar en actas con acceso; en bloqueadas solo metadatos…"
            style={{ ...inp(t), minWidth: viewportCompact ? 0 : 220, width: '100%' }}
          />
        </Field>
        <Field t={t} label="Estado" className="cc-seguim-filter">
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={{ ...inp(t), width: '100%' }}>
            {ACTA_ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Tipo" className="cc-seguim-filter">
          <select value={filtros.tipo_acta} onChange={(e) => setFiltros((f) => ({ ...f, tipo_acta: e.target.value }))} style={{ ...inp(t), width: '100%' }}>
            {ACTA_TIPOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Desde" className="cc-seguim-filter">
          <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))} style={{ ...inp(t), width: '100%' }} />
        </Field>
        <Field t={t} label="Hasta" className="cc-seguim-filter">
          <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))} style={{ ...inp(t), width: '100%' }} />
        </Field>
        <div className="cc-seguim-filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={load} style={ghost(t)}>Buscar</button>
          {permisos?.crear && (
            <button type="button" onClick={onNueva} style={primary(t)}>+ Nueva acta</button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>}
      {accesoMsg && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid color-mix(in srgb, ${t.primary} 45%, ${t.border})`,
            background: `${t.primary}12`,
            color: t.text,
            fontSize: 'var(--cc-sm)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <span>{accesoMsg}</span>
          <button type="button" onClick={() => setAccesoMsg('')} style={{ ...ghost(t), padding: '4px 8px', flexShrink: 0 }}>
            Cerrar
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando repositorio…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: t.textMuted }}>No hay actas que coincidan con la consulta.</div>
      ) : (
        <div className="cc-seguim-table-scroll" style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
          <table className="cc-seguim-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: viewportCompact ? 0 : 860 }}>
            <thead>
              <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                <th style={th}>Consecutivo</th>
                <th style={th}>Número de acta</th>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Ubicación</th>
                <th style={th}>Elaborador</th>
                <th style={th}>Estado</th>
                <th style={th}>Acceso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const bloqueada = a?.puede_abrir === false || a?.acceso_restringido === true
                return (
                  <tr
                    key={a.id}
                    onClick={() => handleAbrir(a)}
                    title={bloqueada ? MSG_ACTA_ACCESO_RESTRINGIDO : 'Abrir acta'}
                    style={{
                      cursor: bloqueada ? 'not-allowed' : 'pointer',
                      borderTop: `1px solid ${t.border}`,
                      background: t.bgCard,
                      opacity: bloqueada ? 0.78 : 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${t.primary}10` }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = t.bgCard }}
                  >
                    <td data-label="Consecutivo" style={td}>{a.consecutivo ?? '—'}</td>
                    <td data-label="Número de acta" style={{ ...td, fontWeight: 700, color: t.text }}>{numeroActaLabel(a.consecutivo)}</td>
                    <td data-label="Fecha" style={td}>{fmtFecha(a.fecha_reunion)}</td>
                    <td data-label="Tipo" style={td}>{labelTipoActa(a.tipo_acta || 'interna')}</td>
                    <td data-label="Ubicación" style={{ ...td, maxWidth: 220 }}>{a.ubicacion || '—'}</td>
                    <td data-label="Elaborador" style={td}>{a.elaborador_nombre || '—'}</td>
                    <td data-label="Estado" style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                        border: `1px solid ${t.border}`, fontWeight: 600, fontSize: 'var(--cc-xs)',
                      }}>
                        {labelEstadoActa(a.estado)}
                      </span>
                    </td>
                    <td data-label="Acceso" style={td}>
                      {bloqueada ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          border: `1px solid ${t.border}`, fontWeight: 600, fontSize: 'var(--cc-xs)',
                          color: t.textMuted,
                        }}>
                          Bloqueada
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          border: `1px solid ${t.border}`, fontWeight: 600, fontSize: 'var(--cc-xs)',
                          color: t.text,
                        }}>
                          Disponible
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th = { padding: '10px 8px', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '10px 8px', verticalAlign: 'middle', color: 'inherit' }

function Field({ t, label, children, className = '' }) {
  return (
    <div className={className}>
      <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}
function inp(t) {
  return {
    fontSize: 'var(--cc-input)', padding: '6px 8px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bgCard, color: t.text,
    boxSizing: 'border-box',
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
