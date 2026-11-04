import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react'
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

const COLS = [
  { key: 'actividad', label: 'Actividad', min: 200 },
  { key: 'descripcion', label: 'Descripción', min: 180 },
  { key: 'comentario', label: 'Comentario comité', min: 160 },
  { key: 'solicitante', label: 'Solicitante', min: 120 },
  { key: 'asignados', label: 'Asignado(s)', min: 140 },
  { key: 'prioridad', label: 'Prioridad', min: 88 },
  { key: 'estado', label: 'Estado', min: 100 },
  { key: 'fi', label: 'Fecha inicio', min: 110 },
  { key: 'ff', label: 'Fecha fin', min: 110 },
  { key: 'periodicidad', label: 'Periodicidad', min: 110 },
]

/**
 * Grilla tipo Excel del Plan de actividades + Gantt diario desplegable.
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
  /** Por defecto la grilla es protagonista; el Gantt se abre con la flecha. */
  const [ganttOpen, setGanttOpen] = useState(false)
  const scrollRef = useRef(null)
  const scrollSnap = useRef({ top: 0, left: 0 })

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
      const msg = String(e?.message || '').trim()
      setError(
        msg
        || 'No se pudo cargar el Plan de actividades. Verifique su permiso Ver en Control de accesos.',
      )
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api, colaboradorId, verTodos, vistaAmplia])

  useEffect(() => { reload() }, [reload])

  const overlapIds = useMemo(() => idsConSolapePorAsignado(items), [items])
  const gantt = useMemo(() => rangeDaysFromActividades(items, 21), [items])

  const visibleCols = useMemo(
    () => (ganttOpen ? COLS.filter((c) => c.key === 'actividad') : COLS),
    [ganttOpen],
  )

  const grouped = useMemo(() => {
    const map = new Map()
    for (const it of items) {
      const g = it.grupo_nombre || 'Sin grupo'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(it)
    }
    return [...map.entries()]
  }, [items])

  const colSpan = visibleCols.length + (ganttOpen ? gantt.days.length : 0)

  const tableMinWidth = useMemo(() => {
    const dataW = visibleCols.reduce((s, c) => s + c.min, 0)
    const ganttW = ganttOpen ? gantt.days.length * 28 : 0
    return dataW + ganttW
  }, [visibleCols, ganttOpen, gantt.days.length])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = scrollSnap.current.top
    el.scrollLeft = scrollSnap.current.left
  }, [ganttOpen])

  function toggleGantt() {
    const el = scrollRef.current
    if (el) {
      scrollSnap.current = { top: el.scrollTop, left: el.scrollLeft }
    }
    setGanttOpen((v) => !v)
  }

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

  function cellValue(it, key) {
    switch (key) {
      case 'actividad': return it.titulo
      case 'descripcion': return htmlToPlainText(it.descripcion || '').slice(0, 120) || '—'
      case 'comentario': return htmlToPlainText(it.comentario_comite || '').slice(0, 100) || '—'
      case 'solicitante': return it.solicitante_nombre || '—'
      case 'asignados': return it.asignado_a_nombre || '—'
      case 'prioridad': return it.prioridad ?? '—'
      case 'estado': return it.estado_gestion || '—'
      case 'fi': return fmtFecha(it.fecha_inicio) || '—'
      case 'ff': return fmtFecha(it.fecha_fin) || '—'
      case 'periodicidad': return it.periodicidad || 'ninguna'
      default: return '—'
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
        <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
          Plan de actividades
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
                title="Colaborador"
                data-cc-tooltip="Colaborador"
                data-cc-tooltip-variant="short"
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
              data-cc-tooltip="Crear actividad"
              data-cc-tooltip-variant="short"
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
              title="Exportar Excel"
              data-cc-tooltip="Exportar Excel"
              data-cc-tooltip-variant="short"
              aria-label="Exportar a Excel"
              onClick={exportar}
              style={iconBtn(t)}
            >
              <Download size={17} strokeWidth={2.3} aria-hidden />
            </button>
          )}
          {modo === 'popup' && onClose && (
            <button type="button" title="Cerrar" data-cc-tooltip="Cerrar" data-cc-tooltip-variant="short" aria-label="Cerrar" onClick={onClose} style={iconBtn(t)}>
              <X size={17} strokeWidth={2.3} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>
      )}
      {loading && <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando plan…</div>}

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, minHeight: 0 }}>
        <div
          ref={scrollRef}
          style={{
            ...ui.sheetWrap,
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            maxHeight: modo === 'popup' ? '70vh' : '70vh',
            transition: 'box-shadow 180ms ease',
          }}
        >
          <table
            style={{
              ...ui.sheetTable,
              tableLayout: ganttOpen ? 'auto' : 'fixed',
              minWidth: tableMinWidth,
              transition: 'min-width 220ms ease',
            }}
          >
            <thead>
              <tr>
                {visibleCols.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      ...ui.th,
                      whiteSpace: 'nowrap',
                      minWidth: c.min,
                      width: ganttOpen && c.key === 'actividad' ? 220 : undefined,
                    }}
                  >
                    {c.label}
                  </th>
                ))}
                {ganttOpen && gantt.days.map((d) => (
                  <th
                    key={d}
                    style={{
                      ...ui.th,
                      minWidth: 28,
                      width: 28,
                      maxWidth: 36,
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
                      colSpan={Math.max(colSpan, 1)}
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
                        title="Abrir detalle"
                        data-cc-tooltip="Abrir detalle"
                        data-cc-tooltip-variant="short"
                      >
                        {visibleCols.map((c) => (
                          <td
                            key={c.key}
                            style={{
                              ...ui.td,
                              whiteSpace: c.key === 'actividad' ? 'normal' : 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textAlign: c.key === 'prioridad' ? 'center' : undefined,
                              minWidth: c.min,
                            }}
                          >
                            {cellValue(it, c.key)}
                          </td>
                        ))}
                        {ganttOpen && gantt.days.map((d) => {
                          const hit = occs.some((o) => o.fecha_inicio <= d && d <= o.fecha_fin)
                          return (
                            <td
                              key={`${it.id}-${d}`}
                              style={{
                                ...ui.td,
                                padding: 0,
                                minWidth: 28,
                                width: 28,
                                background: hit
                                  ? (solape
                                    ? 'color-mix(in srgb, #f97316 70%, transparent)'
                                    : 'color-mix(in srgb, #38bdf8 65%, transparent)')
                                  : 'transparent',
                                transition: 'background 160ms ease',
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
                  <td colSpan={Math.max(colSpan, 1)} style={{ ...ui.td, color: t.textMuted, textAlign: 'center', padding: 16 }}>
                    No hay actividades en este ambiente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={toggleGantt}
          title={ganttOpen ? 'Ocultar Gantt' : 'Ver Gantt'}
          data-cc-tooltip={ganttOpen ? 'Ocultar Gantt' : 'Ver Gantt'}
          data-cc-tooltip-variant="short"
          aria-label={ganttOpen ? 'Ocultar Gantt' : 'Ver Gantt'}
          aria-pressed={ganttOpen}
          style={{
            flexShrink: 0,
            width: 36,
            alignSelf: 'stretch',
            minHeight: 120,
            marginLeft: 4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: ganttOpen ? `${t.primary}18` : (t.bgCard || t.bg || '#fff'),
            color: t.text,
            cursor: 'pointer',
            transition: 'background 180ms ease, border-color 180ms ease',
          }}
        >
          {ganttOpen
            ? <ChevronLeft size={20} strokeWidth={2.4} aria-hidden />
            : <ChevronRight size={20} strokeWidth={2.4} aria-hidden />}
        </button>
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
