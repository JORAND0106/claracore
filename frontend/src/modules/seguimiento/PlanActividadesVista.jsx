import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, X } from 'lucide-react'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'
import {
  idsConSolapePorAsignado,
  rangeDaysFromActividades,
  expandirOcurrencias,
} from './planActividadesOcurrencias'
import { htmlToPlainText } from './richTextUtils'
import { fmtFecha } from './seguimientoTheme'
import PlanActividadFormModal from './PlanActividadFormModal'
import PlanActividadDetalleModal from './PlanActividadDetalleModal'

function iconBtn(t, active = false) {
  return {
    width: 34,
    height: 34,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${active ? t.primary : t.border}`,
    background: active ? `${t.primary}22` : 'transparent',
    color: t.text,
  }
}

function nombreUsuario(u) {
  if (!u) return ''
  return (
    u.nombre_completo
    || `${u.nombre || ''} ${u.apellidos || ''}`.trim()
    || u.nombre
    || u.email
    || `#${u.id}`
  )
}

/**
 * Grilla tipo Excel del Plan de actividades + Gantt diario.
 * mode='page' | 'popup'
 */
export default function PlanActividadesVista({
  t,
  api,
  usuario,
  permisos,
  modo = 'page',
  onClose,
  actaId = null,
  ideaId = null,
  forzarPropio = false,
}) {
  const ui = useMemo(() => bitacoraSheetStyles(t), [t])
  const [items, setItems] = useState([])
  const [grupos, setGrupos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [colaboradorId, setColaboradorId] = useState('')
  const [verTodos, setVerTodos] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [detalleId, setDetalleId] = useState(null)

  const vistaAmplia = Boolean(permisos?.esVistaAmplia || permisos?.esDesarrollador) && !forzarPropio

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {
        incluir_cerrados: true,
        ver_todos: vistaAmplia && verTodos && !colaboradorId,
      }
      if (colaboradorId) params.colaborador_id = Number(colaboradorId)
      const [list, gs, us] = await Promise.all([
        api.listPlanActividades(params),
        api.listPlanGrupos().catch(() => []),
        api.listUsuarios().catch(() => []),
      ])
      setItems(Array.isArray(list) ? list : [])
      setGrupos(Array.isArray(gs) ? gs : [])
      setUsuarios(Array.isArray(us) ? us : [])
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el Plan de actividades')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api, colaboradorId, verTodos, vistaAmplia])

  useEffect(() => { reload() }, [reload])

  const overlapIds = useMemo(() => idsConSolapePorAsignado(items), [items])
  const gantt = useMemo(() => rangeDaysFromActividades(items, 21), [items])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const it of items) {
      const g = it.grupo_nombre || 'Sin grupo'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(it)
    }
    return [...map.entries()]
  }, [items])

  async function exportar() {
    try {
      const q = {
        ver_todos: vistaAmplia && verTodos && !colaboradorId,
      }
      if (colaboradorId) q.colaborador_id = Number(colaboradorId)
      const blob = await api.exportPlanActividadesBlob(q)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `plan_actividades.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e?.message || 'No se pudo exportar')
    }
  }

  const wrapStyle = modo === 'popup'
    ? {
      position: 'fixed',
      inset: 0,
      zIndex: 100060,
      background: t.overlay || 'rgba(15,23,42,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    }
    : null

  const panel = (
    <div
      className="cc-plan-actividades"
      style={{
        width: modo === 'popup' ? 'min(1280px, 100%)' : '100%',
        maxHeight: modo === 'popup' ? '94vh' : undefined,
        overflow: modo === 'popup' ? 'auto' : undefined,
        background: t.bgCard || t.bg || '#fff',
        border: modo === 'popup' ? `1px solid ${t.border}` : undefined,
        borderRadius: modo === 'popup' ? 12 : undefined,
        padding: modo === 'popup' ? 14 : 0,
        boxSizing: 'border-box',
      }}
      onClick={modo === 'popup' ? (e) => e.stopPropagation() : undefined}
    >
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
      >
        <div>
          <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
            Plan de actividades
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Grilla tipo Excel · Gantt por días · hora Colombia
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {vistaAmplia && (
            <>
              <select
                value={colaboradorId}
                onChange={(e) => {
                  setColaboradorId(e.target.value)
                  if (e.target.value) setVerTodos(false)
                }}
                title="Ver plan de un colaborador"
                aria-label="Selector de colaborador"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg || '#fff',
                  color: t.text,
                  fontSize: 'var(--cc-sm)',
                  maxWidth: 220,
                }}
              >
                <option value="">Todos los colaboradores</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
                ))}
              </select>
              {!colaboradorId && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text }}>
                  <input
                    type="checkbox"
                    checked={verTodos}
                    onChange={(e) => setVerTodos(e.target.checked)}
                  />
                  Ver todos
                </label>
              )}
            </>
          )}
          {permisos?.crear && (
            <button
              type="button"
              title="Crear actividad"
              aria-label="Crear actividad"
              onClick={() => { setEditItem(null); setFormOpen(true) }}
              style={iconBtn(t)}
            >
              <Plus size={18} strokeWidth={2.4} aria-hidden />
            </button>
          )}
          {permisos?.exportar && (
            <button
              type="button"
              title="Exportar Plan de actividades a Excel"
              aria-label="Exportar a Excel"
              onClick={exportar}
              style={iconBtn(t)}
            >
              <Download size={17} strokeWidth={2.3} aria-hidden />
            </button>
          )}
          {modo === 'popup' && onClose && (
            <button type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose} style={iconBtn(t)}>
              <X size={17} strokeWidth={2.3} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>
      )}
      {loading && <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando plan…</div>}

      <div style={{ ...ui.sheetWrap, overflow: 'auto', maxHeight: modo === 'popup' ? '70vh' : '70vh' }}>
        <table style={{ ...ui.sheetTable, minWidth: 960 + gantt.days.length * 22 }}>
          <thead>
            <tr>
              {[
                'Actividad', 'Descripción', 'Comentario comité', 'Solicitante', 'Asignado(s)',
                'Prioridad', 'Estado', 'Fecha inicio', 'Fecha fin', 'Periodicidad',
              ].map((h) => (
                <th key={h} style={{ ...ui.th, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
              {gantt.days.map((d) => (
                <th
                  key={d}
                  style={{
                    ...ui.th,
                    minWidth: 22,
                    maxWidth: 22,
                    padding: '4px 0',
                    textAlign: 'center',
                    fontSize: 9,
                  }}
                  title={d}
                >
                  {d.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([grupoNombre, rows]) => (
              <Fragment key={`g-${grupoNombre}`}>
                <tr>
                  <td
                    colSpan={10 + gantt.days.length}
                    style={{
                      ...ui.td,
                      background: 'color-mix(in srgb, #fbbf24 55%, var(--cc-bg-card, #fff))',
                      fontWeight: 800,
                      color: t.text,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {grupoNombre}
                  </td>
                </tr>
                {rows.map((it) => {
                  const occs = (it.ocurrencias && it.ocurrencias.length)
                    ? it.ocurrencias
                    : expandirOcurrencias({
                      fechaInicio: it.fecha_inicio,
                      fechaFin: it.fecha_fin,
                      periodicidad: it.periodicidad,
                      periodicidadHasta: it.periodicidad_hasta,
                    })
                  const solape = overlapIds.has(Number(it.id))
                  return (
                    <tr
                      key={it.id}
                      onClick={() => setDetalleId(it.id)}
                      style={{ cursor: 'pointer' }}
                      title="Abrir detalle de la actividad"
                    >
                      <td style={ui.td}>{it.titulo}</td>
                      <td style={{ ...ui.td, maxWidth: 160 }}>
                        {htmlToPlainText(it.descripcion || '').slice(0, 80) || '—'}
                      </td>
                      <td style={{ ...ui.td, maxWidth: 140 }}>
                        {htmlToPlainText(it.comentario_comite || '').slice(0, 60) || '—'}
                      </td>
                      <td style={ui.td}>{it.solicitante_nombre || '—'}</td>
                      <td style={ui.td}>{it.asignado_a_nombre || '—'}</td>
                      <td style={{ ...ui.td, textAlign: 'center' }}>{it.prioridad ?? '—'}</td>
                      <td style={ui.td}>{it.estado_gestion || '—'}</td>
                      <td style={ui.td}>{fmtFecha(it.fecha_inicio) || '—'}</td>
                      <td style={ui.td}>{fmtFecha(it.fecha_fin) || '—'}</td>
                      <td style={ui.td}>{it.periodicidad || 'ninguna'}</td>
                      {gantt.days.map((d) => {
                        const hit = occs.some((o) => o.fecha_inicio <= d && d <= o.fecha_fin)
                        return (
                          <td
                            key={`${it.id}-${d}`}
                            style={{
                              ...ui.td,
                              padding: 0,
                              background: hit
                                ? (solape
                                  ? 'color-mix(in srgb, #f97316 70%, transparent)'
                                  : 'color-mix(in srgb, #38bdf8 65%, transparent)')
                                : 'transparent',
                            }}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            {!loading && !items.length && (
              <tr>
                <td colSpan={10 + gantt.days.length} style={{ ...ui.td, color: t.textMuted, textAlign: 'center', padding: 16 }}>
                  No hay actividades en este ambiente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <PlanActividadFormModal
          t={t}
          api={api}
          usuario={usuario}
          actividad={editItem}
          usuarios={usuarios}
          grupos={grupos}
          actaId={actaId}
          ideaId={ideaId}
          onClose={() => { setFormOpen(false); setEditItem(null) }}
          onSaved={() => reload()}
        />
      )}

      {detalleId && (
        <PlanActividadDetalleModal
          t={t}
          api={api}
          usuario={usuario}
          permisos={permisos}
          itemId={detalleId}
          onClose={() => setDetalleId(null)}
          onChanged={() => reload()}
          onEdit={(it) => {
            setDetalleId(null)
            setEditItem(it)
            setFormOpen(true)
          }}
        />
      )}
    </div>
  )

  if (modo === 'popup') {
    return (
      <div style={wrapStyle} onClick={onClose}>
        {panel}
      </div>
    )
  }
  return panel
}
