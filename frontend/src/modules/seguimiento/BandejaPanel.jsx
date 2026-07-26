import { useCallback, useEffect, useState } from 'react'
import ItemDetalleModal from './ItemDetalleModal'
import { estrellasTexto } from './PriorityStars'
import TareaFormModal from './TareaFormModal'
import { ESTADOS, ORIGEN_COLOR, fmtFecha } from './seguimientoTheme'

export default function BandejaPanel({ t, api, usuario, usuarios = [], permisos, compact = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState({
    estado: '',
    origen: '',
    fecha_desde: '',
    fecha_hasta: '',
    responsable_id: '',
  })
  const [detalleId, setDetalleId] = useState(null)
  const [showTarea, setShowTarea] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v })
      const data = await api.listBandeja(params)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar bandeja')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api, filtros])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {!compact && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
        }}>
          <Filter t={t} label="Estado">
            <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={inp(t)}>
              {ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
            </select>
          </Filter>
          <Filter t={t} label="Origen">
            <select value={filtros.origen} onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))} style={inp(t)}>
              <option value="">Todos</option>
              <option value="compromiso">Compromisos</option>
              <option value="tarea">Tareas</option>
            </select>
          </Filter>
          <Filter t={t} label="Desde">
            <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))} style={inp(t)} />
          </Filter>
          <Filter t={t} label="Hasta">
            <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))} style={inp(t)} />
          </Filter>
          <button type="button" onClick={load} style={ghost(t)}>Actualizar</button>
          {permisos?.crear && (
            <button type="button" onClick={() => setShowTarea(true)} style={primary(t)}>+ Tarea personal</button>
          )}
        </div>
      )}

      {permisos?.esDesarrollador && !compact && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista Desarrollador: acceso completo a compromisos, tareas, justificaciones y aprobaciones.
        </div>
      )}
      {permisos?.esGerencial && !permisos?.esDesarrollador && !compact && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista gerencial: incluye compromisos y tareas de usuarios bajo su gestión.
        </div>
      )}

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}
      {loading ? (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>Cargando bandeja…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>No hay ítems en la bandeja.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => {
            const o = ORIGEN_COLOR[r.origen] || ORIGEN_COLOR.tarea
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetalleId(r.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${t.border}`,
                  borderLeft: `5px solid ${o.border}`,
                  background: o.bg,
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: t.text,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--cc-body)' }}>
                    {estrellasTexto(r.campos_libres?.prioridad) ? (
                      <span style={{ color: t.warning || '#D97706', marginRight: 6, fontSize: 'var(--cc-sm)' }}>
                        {estrellasTexto(r.campos_libres?.prioridad)}
                      </span>
                    ) : null}
                    {r.titulo}
                  </div>
                  <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: o.border }}>{o.label}</span>
                </div>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
                  {r.asignado_a_nombre || '—'} · {r.estado_gestion} · vence {fmtFecha(r.fecha_vencimiento)}
                  {r.acta_id ? ` · acta #${r.acta_id}` : ''}
                  {r.campos_libres?.destinatario_tentativo_nombre
                    ? ` · tentativo: ${r.campos_libres.destinatario_tentativo_nombre}`
                    : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {detalleId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleId}
          usuario={usuario}
          permisos={permisos}
          onClose={() => setDetalleId(null)}
          onChanged={load}
        />
      )}
      {showTarea && (
        <TareaFormModal
          t={t}
          api={api}
          usuario={usuario}
          usuarios={usuarios}
          onClose={() => setShowTarea(false)}
          onCreated={() => { setShowTarea(false); load() }}
        />
      )}
    </div>
  )
}

function Filter({ t, label, children }) {
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
