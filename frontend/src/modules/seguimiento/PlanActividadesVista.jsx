import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react'
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
import PlanActividadesEquipoVista from './PlanActividadesEquipoVista'
import PlanActividadesExportModal from './PlanActividadesExportModal'
import { resolverPeriodo } from './planActividadesEquipo'

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
  /** Moderador del acta: ve grilla/Gantt/detalle sin mutar. */
  soloLectura = false,
  /** Moderador registra a nombre del expositor (acta abierta). */
  modoDictado = false,
  expositorId = null,
  expositorNombre = '',
  dictadoSessionId = null,
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
  const [exportOpen, setExportOpen] = useState(false)
  /** Por defecto la grilla es protagonista; el Gantt se abre con la flecha. */
  const [ganttOpen, setGanttOpen] = useState(false)
  /** Pestañas (vista amplia): mi_plan | equipo */
  const [tab, setTab] = useState('mi_plan')
  const [drillColaboradorId, setDrillColaboradorId] = useState(null)
  const [equipoPeriodo, setEquipoPeriodo] = useState(() => ({
    modo: 'semana',
    ...resolverPeriodo({ modo: 'semana' }),
  }))
  const [equipoFiltro, setEquipoFiltro] = useState(null)
  const [equipoAgrupar, setEquipoAgrupar] = useState(true)
  const scrollRef = useRef(null)
  const scrollSnap = useRef({ top: 0, left: 0 })
  const equipoScrollRef = useRef(null)
  const equipoScrollSnap = useRef(0)

  const lectura = Boolean(soloLectura)
  const dictado = Boolean(modoDictado)
  const sessionDictado = dictadoSessionId || null
  const permisosUi = useMemo(() => {
    if (lectura) {
      return {
        ...(permisos || {}),
        crear: false,
        editar: false,
        eliminar: false,
        exportar: false,
      }
    }
    if (dictado) {
      return {
        ...(permisos || {}),
        crear: true,
        editar: true,
        eliminar: true,
        exportar: false,
      }
    }
    return permisos
  }, [permisos, lectura, dictado])
  const vistaAmplia = Boolean(permisos?.esVistaAmplia || permisos?.esDesarrollador)
    && !forzarPropio
    && !lectura
    && !dictado
  const enEquipo = vistaAmplia && tab === 'equipo' && !drillColaboradorId
  const colaboradorEfectivo = drillColaboradorId
    ? String(drillColaboradorId)
    : colaboradorId
  const verTodosEfectivo = Boolean(
    vistaAmplia && (
      enEquipo
      || (verTodos && !colaboradorEfectivo)
    ),
  )
  const alcanceActa = Boolean(actaId || ideaId)

  const esEditableDictado = useCallback((it) => {
    if (!dictado) return true
    const aid = Number(actaId || 0)
    const iid = Number(ideaId || 0)
    if (!aid || !iid) return false
    return Number(it?.acta_id || 0) === aid && Number(it?.idea_id || 0) === iid
  }, [dictado, actaId, ideaId])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const paramsTema = {
        incluir_cerrados: true,
        ver_todos: verTodosEfectivo || lectura || dictado,
      }
      if (colaboradorEfectivo) paramsTema.colaborador_id = Number(colaboradorEfectivo)
      if (actaId) paramsTema.acta_id = Number(actaId)
      if (ideaId) paramsTema.idea_id = Number(ideaId)

      const fetches = [
        api.listPlanActividades(paramsTema),
        api.listPlanGrupos().catch(() => []),
        api.listUsuarios().catch(() => []),
      ]
      // Dictado: también trae el resto del plan del expositor (solo lectura visual).
      if (dictado && expositorId) {
        fetches.push(
          api.listPlanActividades({
            incluir_cerrados: true,
            colaborador_id: Number(expositorId),
            ver_todos: false,
          }).catch(() => []),
        )
      }
      const results = await Promise.all(fetches)
      const listTema = Array.isArray(results[0]) ? results[0] : []
      const gs = results[1]
      const us = results[2]
      const listExtra = Array.isArray(results[3]) ? results[3] : []
      const byId = new Map()
      for (const it of listTema) byId.set(Number(it.id), { ...it, _dictadoEditable: true })
      for (const it of listExtra) {
        const id = Number(it.id)
        if (!byId.has(id)) {
          byId.set(id, { ...it, _dictadoEditable: false })
        }
      }
      setItems([...byId.values()])
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
  }, [
    api, colaboradorEfectivo, verTodosEfectivo, actaId, ideaId,
    lectura, dictado, expositorId,
  ])

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
      const g = it.grupo_nombre || 'Sin departamento'
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

  async function descargarExport(params = {}) {
    const result = await api.exportPlanActividadesBlob(params)
    const blob = result?.blob || result
    const filename = result?.filename || 'plan_actividades.xlsx'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportar() {
    try {
      if (vistaAmplia) {
        setExportOpen(true)
        return
      }
      await descargarExport({})
    } catch (e) {
      setError(e?.message || 'No se pudo exportar')
    }
  }

  function cellValue(it, key) {
    switch (key) {
      case 'actividad': {
        const marca = it.registrado_por_nombre
          ? (
            <span
              key="reg"
              title={`Registrada por ${it.registrado_por_nombre}`}
              data-cc-tooltip={`Registrada por ${it.registrado_por_nombre}`}
              data-cc-tooltip-variant="short"
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 700,
                color: t.primary || '#0284c7',
                verticalAlign: 'middle',
              }}
              aria-label={`Registrada por ${it.registrado_por_nombre}`}
            >
              ✎
            </span>
          )
          : null
        const readonlyTag = dictado && !esEditableDictado(it)
          ? (
            <span
              key="ro"
              style={{ marginLeft: 6, fontSize: 10, color: t.textMuted, fontWeight: 600 }}
            >
              · lectura
            </span>
          )
          : null
        return (
          <span>
            {it.titulo || '—'}
            {marca}
            {readonlyTag}
          </span>
        )
      }
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', minWidth: 0 }}>
          {drillColaboradorId ? (
            <button
              type="button"
              title="Equipo"
              data-cc-tooltip="Equipo"
              data-cc-tooltip-variant="short"
              aria-label="Volver a Equipo"
              onClick={() => {
                setDrillColaboradorId(null)
                setTab('equipo')
                requestAnimationFrame(() => {
                  if (equipoScrollRef.current) {
                    equipoScrollRef.current.scrollTop = equipoScrollSnap.current || 0
                  }
                })
              }}
              style={iconBtn(t)}
            >
              <ArrowLeft size={17} strokeWidth={2.3} aria-hidden />
            </button>
          ) : null}
          <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
            Plan de actividades
          </div>
          {vistaAmplia && !drillColaboradorId && (
            <div
              role="tablist"
              aria-label="Vistas del plan"
              style={{
                display: 'inline-flex',
                gap: 2,
                padding: 3,
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: `color-mix(in srgb, ${t.border} 35%, ${t.bgCard || t.bg || '#fff'})`,
              }}
            >
              {[
                { id: 'mi_plan', label: 'Mi plan' },
                { id: 'equipo', label: 'Equipo' },
              ].map((tb) => {
                const active = tab === tb.id
                return (
                  <button
                    key={tb.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={tb.label}
                    data-cc-tooltip={tb.label}
                    data-cc-tooltip-variant="short"
                    onClick={() => {
                      setDrillColaboradorId(null)
                      setTab(tb.id)
                    }}
                    style={{
                      border: 'none',
                      background: active ? (t.bgCard || t.bg || '#fff') : 'transparent',
                      color: active ? t.text : t.textMuted,
                      fontWeight: 800,
                      fontSize: 'var(--cc-sm)',
                      padding: '6px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      boxShadow: active ? `0 1px 4px color-mix(in srgb, ${t.text} 12%, transparent)` : 'none',
                      transition: 'background 160ms ease, color 160ms ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {tb.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {vistaAmplia && !enEquipo && (
            <>
              <select
                value={colaboradorEfectivo}
                disabled={Boolean(drillColaboradorId)}
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
              {!colaboradorEfectivo && (
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
          {lectura && (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600 }}>
              Solo lectura
            </span>
          )}
          {dictado && (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600 }}>
              Registrando a nombre de {expositorNombre || 'expositor'}
            </span>
          )}
          {!enEquipo && permisosUi?.crear && (
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
          {!enEquipo && permisosUi?.exportar && (
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
      {!enEquipo && loading && <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando plan…</div>}

      {enEquipo ? (
        <PlanActividadesEquipoVista
          t={t}
          items={items}
          usuarios={usuarios}
          loading={loading}
          periodoState={equipoPeriodo}
          onPeriodoChange={setEquipoPeriodo}
          filtroIndicador={equipoFiltro}
          onFiltroChange={setEquipoFiltro}
          agrupar={equipoAgrupar}
          onAgruparChange={setEquipoAgrupar}
          scrollRef={equipoScrollRef}
          puedeCrear={Boolean(permisosUi?.crear)}
          onCrear={() => {
            if (lectura) return
            setDetalleId(null)
            setEditItem(null)
            setFormOpen(true)
          }}
          onOpenColaborador={(id) => {
            if (equipoScrollRef.current) {
              equipoScrollSnap.current = equipoScrollRef.current.scrollTop
            }
            setDetalleId(null)
            setFormOpen(false)
            setDrillColaboradorId(Number(id))
          }}
        />
      ) : (
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
      )}

      {formOpen && !lectura && (
        <PlanActividadFormModal
          t={t}
          api={api}
          usuario={usuario}
          actividad={editItem}
          usuarios={usuarios}
          grupos={grupos}
          actaId={actaId}
          ideaId={ideaId}
          dictado={dictado}
          dictadoSessionId={sessionDictado}
          onClose={() => { setFormOpen(false); setEditItem(null) }}
          onSaved={() => reload()}
        />
      )}

      {detalleId && (
        <PlanActividadDetalleModal
          t={t}
          api={api}
          usuario={usuario}
          permisos={permisosUi}
          soloLectura={
            lectura
            || (dictado && !esEditableDictado(items.find((x) => Number(x.id) === Number(detalleId)) || {}))
          }
          modoDictado={dictado && esEditableDictado(items.find((x) => Number(x.id) === Number(detalleId)) || {})}
          dictadoSessionId={sessionDictado}
          actaId={actaId}
          ideaId={ideaId}
          itemId={detalleId}
          onClose={() => setDetalleId(null)}
          onChanged={() => reload()}
          onEdit={(it) => {
            if (lectura) return
            if (dictado && !esEditableDictado(it)) return
            setDetalleId(null)
            setEditItem(it)
            setFormOpen(true)
          }}
        />
      )}

      {exportOpen && (
        <PlanActividadesExportModal
          t={t}
          usuarios={usuarios.filter((u) => Number(u.id) > 0)}
          onClose={() => setExportOpen(false)}
          onExport={async ({ todos, colaborador_ids }) => {
            await descargarExport(
              todos
                ? { todos: true, colaborador_ids }
                : { colaborador_ids },
            )
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
