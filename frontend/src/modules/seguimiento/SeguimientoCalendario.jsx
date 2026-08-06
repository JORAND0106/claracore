import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import ItemDetalleModal from './ItemDetalleModal'
import TareaFormModal from './TareaFormModal'
import { MSG_ACTA_ACCESO_RESTRINGIDO } from './ActasRepositorio'
import { ACTA_TIPOS, ESTADOS } from './seguimientoTheme'
import { hoyBogotaDate } from './vencimientoLevels'
import {
  CALENDARIO_KIND,
  buildCalendarioEvents,
  dayHasVencidos,
  eventDisplayTime,
  eventDisplayTitle,
  eventsForDate,
  filterEventsByOrigen,
  formatDayCountLabelShort,
  resolveFetchRange,
  sortDayEvents,
  summarizeDayCounts,
  toDateOnly,
} from './seguimientoCalendarioUtils'

/**
 * Calendario Seguimiento (FullCalendar): mes/semana/día, filtros, CTAs,
 * contador por día, menú rápido al clic y resaltado pasivo de vencidos.
 * Reutilizable en el módulo Seguimiento y en la página de inicio.
 *
 * `widgetMode`: versión compacta para Inicio (misma fila que el carrete).
 * En mes oculta chips de eventos y muestra solo contadores por día.
 */
export default function SeguimientoCalendario({
  t,
  api,
  usuario,
  usuarios = [],
  permisos,
  viewportCompact = false,
  refreshKey = 0,
  onNuevaActa,
  onAbrirActa,
  showFilters = true,
  widgetMode = false,
}) {
  const filtersVisible = showFilters && !widgetMode
  const calendarRef = useRef(null)
  const genRef = useRef(0)
  const rangeRef = useRef({ start: null, end: null })
  const dayMenuRef = useRef(null)

  const [filtros, setFiltros] = useState({
    estado: '',
    origen: '',
    tipo_acta: '',
    fecha_desde: '',
    fecha_hasta: '',
    incluir_cerrados: false,
    q: '',
  })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accesoMsg, setAccesoMsg] = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const [showTarea, setShowTarea] = useState(false)
  const [fechaTareaInicial, setFechaTareaInicial] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [dayMenu, setDayMenu] = useState(null)

  const load = useCallback(async () => {
    const { start, end } = rangeRef.current
    if (!start || !end) return

    const range = resolveFetchRange(start, end, filtros.fecha_desde, filtros.fecha_hasta)
    if (!range) {
      setEvents([])
      setLoading(false)
      setError('')
      return
    }

    const gen = ++genRef.current
    setLoading(true)
    setError('')

    const includeBandeja = !filtros.origen || filtros.origen === 'tarea' || filtros.origen === 'compromiso'
    const includeActas = !filtros.origen || filtros.origen === 'acta'

    try {
      const jobs = []

      if (includeBandeja) {
        const bandejaParams = {
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta,
        }
        if (filtros.q) bandejaParams.q = filtros.q
        if (filtros.estado) bandejaParams.estado = filtros.estado
        if (filtros.origen === 'tarea' || filtros.origen === 'compromiso') {
          bandejaParams.origen = filtros.origen
        }
        if (filtros.incluir_cerrados) bandejaParams.incluir_cerrados = 'true'
        jobs.push(api.listBandeja(bandejaParams).catch((e) => { throw e }))
      } else {
        jobs.push(Promise.resolve([]))
      }

      if (includeActas) {
        const actasParams = {
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta,
        }
        if (filtros.q) actasParams.q = filtros.q
        if (filtros.tipo_acta) actasParams.tipo_acta = filtros.tipo_acta
        jobs.push(api.listActas(actasParams).catch((e) => { throw e }))
      } else {
        jobs.push(Promise.resolve([]))
      }

      const [bandejaRows, actasRows] = await Promise.all(jobs)
      if (gen !== genRef.current) return

      let mapped = buildCalendarioEvents(
        Array.isArray(bandejaRows) ? bandejaRows : [],
        Array.isArray(actasRows) ? actasRows : [],
      )
      if (filtros.origen) mapped = filterEventsByOrigen(mapped, filtros.origen)
      setEvents(mapped)
    } catch (e) {
      if (gen !== genRef.current) return
      setError(e.message || 'Error al cargar el calendario')
      setEvents([])
    } finally {
      if (gen === genRef.current) setLoading(false)
    }
  }, [api, filtros])

  useEffect(() => { load() }, [load, refreshKey, reloadTick])

  useEffect(() => {
    if (!dayMenu) return undefined
    const onDoc = (e) => {
      if (dayMenuRef.current && !dayMenuRef.current.contains(e.target)) {
        setDayMenu(null)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setDayMenu(null) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [dayMenu])

  const handleDatesSet = useCallback((info) => {
    rangeRef.current = { start: info.start, end: info.end }
    setReloadTick((n) => n + 1)
  }, [])

  const handleEventClick = useCallback((info) => {
    info.jsEvent?.preventDefault?.()
    info.jsEvent?.stopPropagation?.()
    setDayMenu(null)
    const { kind, sourceId, accesoRestringido } = info.event.extendedProps || {}
    if (kind === 'acta') {
      if (accesoRestringido) {
        setAccesoMsg(MSG_ACTA_ACCESO_RESTRINGIDO)
        return
      }
      setAccesoMsg('')
      onAbrirActa?.(sourceId)
      return
    }
    if (sourceId != null) setDetalleId(sourceId)
  }, [onAbrirActa])

  const handleDateClick = useCallback((info) => {
    info.jsEvent?.preventDefault?.()
    const dateStr = toDateOnly(info.dateStr || info.date)
    if (!dateStr) return
    const rect = info.dayEl?.getBoundingClientRect?.()
    const x = info.jsEvent?.clientX ?? (rect ? rect.left + rect.width / 2 : 80)
    const y = info.jsEvent?.clientY ?? (rect ? rect.top + 28 : 80)
    setDayMenu({ dateStr, x, y })
  }, [])

  const eventContent = useCallback((arg) => {
    const icon = arg.event.extendedProps?.icon || ''
    const title = arg.event.title.replace(/^[^\s]+\s/, '')
    return (
      <div className="cc-seguim-cal-event" title={arg.event.title}>
        <span className="cc-seguim-cal-event-icon" aria-hidden>{icon}</span>
        <span className="cc-seguim-cal-event-title">{arg.timeText ? `${arg.timeText} ` : ''}{title}</span>
      </div>
    )
  }, [])

  const dayCellContent = useCallback((arg) => {
    const isMonth = arg.view?.type === 'dayGridMonth'
    const dateStr = toDateOnly(arg.date)
    const summary = isMonth ? summarizeDayCounts(events, dateStr) : null
    const countText = summary?.total > 0
      ? (widgetMode
        ? formatDayCountLabelShort(summary)
        : summary.label)
      : ''
    return (
      <div className={`cc-seguim-cal-daycell${widgetMode ? ' cc-seguim-cal-daycell--widget' : ''}`}>
        <span className="cc-seguim-cal-daynum">{arg.dayNumberText}</span>
        {isMonth && countText ? (
          <span className="cc-seguim-cal-daycount" title={summary.label}>{countText}</span>
        ) : null}
      </div>
    )
  }, [events, widgetMode])

  const dayCellClassNames = useCallback((arg) => {
    const dateStr = toDateOnly(arg.date)
    if (dayHasVencidos(events, dateStr, hoyBogotaDate())) {
      return ['cc-seguim-cal-day--vencido']
    }
    return []
  }, [events])

  const legend = useMemo(() => Object.values(CALENDARIO_KIND), [])

  const dayEvents = useMemo(() => {
    if (!dayMenu?.dateStr) return []
    return sortDayEvents(eventsForDate(events, dayMenu.dateStr))
  }, [dayMenu, events])

  const openDayEvent = useCallback((ev) => {
    const { kind, sourceId, accesoRestringido } = ev?.extendedProps || {}
    setDayMenu(null)
    if (kind === 'acta') {
      if (accesoRestringido) {
        setAccesoMsg(MSG_ACTA_ACCESO_RESTRINGIDO)
        return
      }
      setAccesoMsg('')
      onAbrirActa?.(sourceId)
      return
    }
    if (sourceId != null) setDetalleId(sourceId)
  }, [onAbrirActa])

  const rootClass = [
    'cc-seguim-cal',
    viewportCompact ? 'cc-seguim-cal--compact' : '',
    widgetMode ? 'cc-seguim-cal--widget' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      {widgetMode && (
        <div className="cc-seguim-cal-widget-head" style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
          background: `${t.primary}0c`,
        }}>
          <div style={{
            fontSize: 'var(--cc-xs)', fontWeight: 800, letterSpacing: '0.5px',
            textTransform: 'uppercase', color: t.primary,
          }}>
            📅 Seguimiento
          </div>
          <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            Tareas, compromisos y actas · clic en un día para acciones
            {loading ? ' · actualizando…' : ''}
          </div>
        </div>
      )}

      {filtersVisible && (
        <div className="cc-seguim-filters" style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
        }}>
          <Filter t={t} label="Palabras clave" className="cc-seguim-filter cc-seguim-filter--wide">
            <input
              value={filtros.q}
              onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') setReloadTick((n) => n + 1) }}
              placeholder="Título, descripción, actas…"
              style={{ ...inp(t), minWidth: viewportCompact ? 0 : 200, width: '100%' }}
            />
          </Filter>
          <Filter t={t} label="Estado" className="cc-seguim-filter">
            <select
              value={filtros.estado}
              onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
              disabled={filtros.origen === 'acta'}
              title={filtros.origen === 'acta' ? 'El estado de gestión aplica a tareas y compromisos' : undefined}
            >
              {ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
            </select>
          </Filter>
          <Filter t={t} label="Origen" className="cc-seguim-filter">
            <select
              value={filtros.origen}
              onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
            >
              <option value="">Todos</option>
              <option value="compromiso">Compromisos</option>
              <option value="tarea">Tareas</option>
              <option value="acta">Actas</option>
            </select>
          </Filter>
          <Filter t={t} label="Tipo de acta" className="cc-seguim-filter">
            <select
              value={filtros.tipo_acta}
              onChange={(e) => setFiltros((f) => ({ ...f, tipo_acta: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
              disabled={filtros.origen === 'tarea' || filtros.origen === 'compromiso'}
            >
              {ACTA_TIPOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
            </select>
          </Filter>
          <Filter t={t} label="Desde" className="cc-seguim-filter">
            <input
              type="date"
              className="cc-seguim-date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
            />
          </Filter>
          <Filter t={t} label="Hasta" className="cc-seguim-filter">
            <input
              type="date"
              className="cc-seguim-date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
            />
          </Filter>
          <label className="cc-seguim-filter cc-seguim-filter--check" style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4,
          }}>
            <input
              type="checkbox"
              checked={!!filtros.incluir_cerrados}
              onChange={(e) => setFiltros((f) => ({ ...f, incluir_cerrados: e.target.checked }))}
              disabled={filtros.origen === 'acta'}
            />
            Incluir cumplidos / cancelados
          </label>
          <div className="cc-seguim-filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={() => setReloadTick((n) => n + 1)} style={ghost(t)}>Buscar</button>
            {permisos?.crear && (
              <>
                <button
                  type="button"
                  onClick={() => { setFechaTareaInicial(null); setShowTarea(true) }}
                  style={primary(t)}
                >
                  Crear Tarea
                </button>
                <button type="button" onClick={() => onNuevaActa?.()} style={primary(t)}>Crear Acta</button>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: widgetMode ? 8 : 12,
        marginBottom: widgetMode ? 6 : 10, alignItems: 'center',
        fontSize: widgetMode ? 'var(--cc-xs)' : 'var(--cc-sm)',
        color: t.textMuted,
        padding: widgetMode ? '0 12px' : 0,
      }}>
        {legend.map((k) => (
          <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: widgetMode ? 9 : 12, height: widgetMode ? 9 : 12,
              borderRadius: 3, background: k.color, display: 'inline-block',
            }}
            />
            <span aria-hidden>{k.icon}</span>
            {!widgetMode && k.label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: widgetMode ? 9 : 12, height: widgetMode ? 9 : 12, borderRadius: 3,
            background: 'color-mix(in srgb, #dc2626 28%, transparent)',
            border: '1px solid #facc15',
            display: 'inline-block',
          }}
          />
          {!widgetMode && 'Día con vencidos'}
          {widgetMode && 'Venc.'}
        </span>
        {!widgetMode && loading && <span style={{ marginLeft: 'auto' }}>Actualizando…</span>}
      </div>

      {error && (
        <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
          {error}
        </div>
      )}
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

      {filtersVisible && permisos?.esDesarrollador && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista Desarrollador: acceso completo a compromisos, tareas, justificaciones y aprobaciones.
        </div>
      )}
      {filtersVisible && permisos?.esGerencial && !permisos?.esDesarrollador && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista gerencial: incluye compromisos y tareas de usuarios bajo su gestión.
        </div>
      )}

      <div
        className="cc-seguim-cal-shell"
        style={{
          background: widgetMode ? 'transparent' : t.bgCard,
          border: widgetMode ? 'none' : `1px solid ${t.border}`,
          borderRadius: widgetMode ? 0 : 10,
          padding: widgetMode ? 8 : (viewportCompact ? 8 : 12),
          flex: widgetMode ? 1 : undefined,
          minHeight: widgetMode ? 0 : undefined,
          '--cc-seguim-fc-border': t.border,
          '--cc-seguim-fc-text': t.text,
          '--cc-seguim-fc-muted': t.textMuted,
          '--cc-seguim-fc-primary': t.primary,
          '--cc-seguim-fc-bg': t.bgCard,
          '--cc-seguim-fc-page': t.bg || t.bgCard,
        }}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={widgetMode
            ? { left: 'prev,next', center: 'title', right: 'today dayGridMonth,timeGridWeek,timeGridDay' }
            : {
              left: 'prev,next today',
              center: 'title',
              right: viewportCompact
                ? 'timeGridDay,timeGridWeek,dayGridMonth'
                : 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
          }}
          locale={esLocale}
          height={widgetMode ? '100%' : 'auto'}
          stickyHeaderDates
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventContent={eventContent}
          dayCellContent={dayCellContent}
          dayCellClassNames={dayCellClassNames}
          dayMaxEvents={widgetMode ? false : (viewportCompact ? 3 : 4)}
          moreLinkClick="popover"
          nowIndicator
          navLinks={false}
          eventDisplay="block"
          displayEventTime
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
        />
      </div>

      {dayMenu && createPortal(
        <div
          className="cc-seguim-cal-daymodal-overlay"
          role="presentation"
          onClick={() => setDayMenu(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5200,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            ref={dayMenuRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle del ${dayMenu.dateStr}`}
            className="cc-seguim-cal-daymodal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 96vw)',
              maxHeight: 'min(80vh, 640px)',
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              boxShadow: '0 16px 40px rgba(15,23,42,0.22)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '14px 16px',
              borderBottom: `1px solid ${t.border}`,
              background: `${t.primary}0c`,
            }}>
              <div>
                <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>
                  {dayMenu.dateStr.split('-').reverse().join('/')}
                </div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
                  {dayEvents.length === 0
                    ? 'Sin elementos este día'
                    : `${dayEvents.length} elemento${dayEvents.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDayMenu(null)}
                style={{ ...ghost(t), padding: '6px 10px' }}
              >
                Cerrar
              </button>
            </div>

            {permisos?.crear && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8,
                padding: '12px 16px',
                borderBottom: `1px solid ${t.border}`,
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setFechaTareaInicial(dayMenu.dateStr)
                    setShowTarea(true)
                    setDayMenu(null)
                  }}
                  style={primary(t)}
                >
                  ✅ Nueva tarea
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNuevaActa?.(dayMenu.dateStr)
                    setDayMenu(null)
                  }}
                  style={primary(t)}
                >
                  📝 Nueva acta
                </button>
              </div>
            )}

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 10px 12px',
            }}>
              {dayEvents.length === 0 ? (
                <div style={{
                  padding: '18px 12px',
                  color: t.textMuted,
                  fontSize: 'var(--cc-sm)',
                  textAlign: 'center',
                }}>
                  No hay tareas, compromisos ni actas para este día.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {dayEvents.map((ev) => {
                    const kind = ev.extendedProps?.kind || 'tarea'
                    const meta = CALENDARIO_KIND[kind] || CALENDARIO_KIND.tarea
                    const hora = eventDisplayTime(ev)
                    const titulo = eventDisplayTitle(ev)
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => openDayEvent(ev)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            border: `1px solid ${t.border}`,
                            borderRadius: 8,
                            background: t.bg || `${meta.color}10`,
                            borderLeft: `4px solid ${meta.color}`,
                            padding: '10px 12px',
                            marginBottom: 8,
                            cursor: 'pointer',
                            color: t.text,
                          }}
                        >
                          <span aria-hidden style={{ fontSize: '1.1em', lineHeight: 1.2 }}>{meta.icon}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'block',
                              fontSize: 'var(--cc-xs)',
                              fontWeight: 700,
                              color: meta.color,
                              marginBottom: 2,
                            }}>
                              {meta.label}
                              {hora ? ` · ${hora}` : ' · Sin hora'}
                            </span>
                            <span style={{
                              display: 'block',
                              fontSize: 'var(--cc-sm)',
                              fontWeight: 600,
                              lineHeight: 1.35,
                              wordBreak: 'break-word',
                            }}>
                              {titulo}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {detalleId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleId}
          usuario={usuario}
          usuarios={usuarios}
          permisos={permisos}
          viewportCompact={viewportCompact}
          onClose={() => setDetalleId(null)}
          onChanged={() => setReloadTick((n) => n + 1)}
        />
      )}
      {showTarea && (
        <TareaFormModal
          t={t}
          api={api}
          usuario={usuario}
          usuarios={usuarios}
          viewportCompact={viewportCompact}
          fechaInicial={fechaTareaInicial}
          onClose={() => { setShowTarea(false); setFechaTareaInicial(null) }}
          onCreated={() => {
            setShowTarea(false)
            setFechaTareaInicial(null)
            setReloadTick((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function Filter({ t, label, children, className = '' }) {
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
  return {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}

function ghost(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
    background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)',
  }
}

