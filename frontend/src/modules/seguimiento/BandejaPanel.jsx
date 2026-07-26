import { useCallback, useEffect, useMemo, useState } from 'react'
import ItemDetalleModal from './ItemDetalleModal'
import TareaFormModal from './TareaFormModal'
import VencimientoIcon from './VencimientoIcon'
import { ESTADOS, ORIGEN_COLOR, fmtFecha, fmtFechaHora } from './seguimientoTheme'
import {
  fechaVencimientoEfectiva,
  nivelVencimientoItem,
  origenRemitenteLabel,
  sortByProximidadVencimiento,
  tipoLaborLabel,
} from './vencimientoLevels'

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
    incluir_cerrados: false,
    q: '',
  })
  const [detalleId, setDetalleId] = useState(null)
  const [showTarea, setShowTarea] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(filtros).forEach(([k, v]) => {
        if (v === true || v === false) {
          if (v) params[k] = 'true'
          return
        }
        if (v) params[k] = v
      })
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

  const sorted = useMemo(() => sortByProximidadVencimiento(rows), [rows])
  const uid = usuario?.id

  return (
    <div>
      {!compact && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
        }}>
          <Filter t={t} label="Palabras clave">
            <input
              value={filtros.q}
              onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') load() }}
              placeholder="Título, descripción, notas…"
              style={{ ...inp(t), minWidth: 200 }}
            />
          </Filter>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={!!filtros.incluir_cerrados}
              onChange={(e) => setFiltros((f) => ({ ...f, incluir_cerrados: e.target.checked }))}
            />
            Incluir cumplidos / cancelados
          </label>
          <button type="button" onClick={load} style={ghost(t)}>Buscar</button>
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
      ) : sorted.length === 0 ? (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>No hay ítems en la bandeja.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: 900 }}>
            <thead>
              <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                <th style={th}>#</th>
                <th style={th}>Creación</th>
                <th style={th}>Vencimiento</th>
                <th style={th}>Nivel</th>
                <th style={th}>Tema</th>
                <th style={th}>Destinatario</th>
                <th style={th}>Origen / remitente</th>
                <th style={th}>Tipo de labor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const nivel = nivelVencimientoItem(r)
                const due = fechaVencimientoEfectiva(r)
                const o = ORIGEN_COLOR[r.origen] || ORIGEN_COLOR.tarea
                const dest = r.relacion_destinatario === 'referencia'
                  ? (r.referido_a_nombre || r.asignado_a_nombre || '—')
                  : (r.asignado_a_nombre || '—')
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetalleId(r.id)}
                    style={{ cursor: 'pointer', borderTop: `1px solid ${t.border}`, background: o.bg }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.98)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
                  >
                    <td style={td}>{r.consecutivo ?? r.id}</td>
                    <td style={td}>{fmtFecha(r.created_at)}</td>
                    <td style={td}>{fmtFechaHora(due.fecha || r.fecha_vencimiento, due.hora || r.hora_vencimiento)}</td>
                    <td style={td}><VencimientoIcon nivel={nivel} t={t} /></td>
                    <td style={{ ...td, fontWeight: 600, color: t.text, maxWidth: 260 }}>
                      <span style={{ color: o.border, fontSize: 'var(--cc-xs)', marginRight: 6 }}>{o.label}</span>
                      {r.titulo}
                    </td>
                    <td style={td}>{dest}</td>
                    <td style={td}>{origenRemitenteLabel(r, uid)}</td>
                    <td style={td}>{tipoLaborLabel(r, uid)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalleId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleId}
          usuario={usuario}
          usuarios={usuarios}
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

const th = { padding: '10px 8px', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '10px 8px', verticalAlign: 'middle', color: 'inherit' }

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
