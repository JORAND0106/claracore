import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Filter as FilterIcon, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import ItemDetalleModal from './ItemDetalleModal'
import TareaFormModal from './TareaFormModal'
import BitacoraExportRangoBar from './BitacoraExportRangoBar'
import { MSG_ACTA_ACCESO_RESTRINGIDO } from './ActasRepositorio'
import { ESTADOS } from './seguimientoTheme'
import { buildTipoActaOptions } from './tipoActaNorm'
import { hoyBogotaDate } from './vencimientoLevels'
import {
  CALENDARIO_KIND,
  CALENDARIO_VENCIDOS_LEGEND,
  buildCalendarioEvents,
  dayHasVencidos,
  dayKindIndicators,
  eventDisplayTime,
  eventDisplayTitle,
  eventsForDate,
  filterEventsByOrigen,
  filterEventsSoloMias,
  resolveFetchRange,
  sortDayEvents,
  summarizeDayCounts,
  toDateOnly,
} from './seguimientoCalendarioUtils'

/**
 * Calendario Seguimiento (FullCalendar): vista única diaria de tareas,
 * compromisos, actas y bitácora. Filtros colapsables, menú por día y
 * convenciones de color compactas debajo del grid.
 *
 * `widgetMode`: versión compacta para Inicio (misma lógica de creación por día).
 */
export default function SeguimientoCalendario({
  t,
  api,
  usuario,
  usuarios = [],
  permisos,
  permisosBitacora = null,
  viewportCompact = false,
  refreshKey = 0,
  onNuevaActa,
  onAbrirActa,
  onNuevaBitacora,
  onAbrirBitacora,
  showFilters = true,
  widgetMode = false,
  onDataFresh = null,
}) {
  const filtersVisible = showFilters && !widgetMode
  const calendarRef = useRef(null)
  const genRef = useRef(0)
  const rangeRef = useRef({ start: null, end: null })
  const dayMenuRef = useRef(null)
  const onDataFreshRef = useRef(onDataFresh)
  onDataFreshRef.current = onDataFresh

  const [filtros, setFiltros] = useState({
    estado: '',
    origen: '',
    tipo_acta: '',
    fecha_desde: '',
    fecha_hasta: '',
    incluir_cerrados: false,
    solo_mias: false,
    q: '',
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warnBitacora, setWarnBitacora] = useState('')
  const [accesoMsg, setAccesoMsg] = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const [showTarea, setShowTarea] = useState(false)
  const [fechaTareaInicial, setFechaTareaInicial] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [dayMenu, setDayMenu] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [tiposActaOpts, setTiposActaOpts] = useState(() => buildTipoActaOptions([], { includeTodos: true, includeOtro: false }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.listTiposActa?.()
        if (cancelled) return
        const custom = Array.isArray(r?.tipos) ? r.tipos.filter((t) => !t.builtin) : []
        setTiposActaOpts(buildTipoActaOptions(custom, { includeTodos: true, includeOtro: false }))
      } catch { /* opcional */ }
    })()
    return () => { cancelled = true }
  }, [api])

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
    setWarnBitacora('')

    const origen = filtros.origen
    const includeBandeja = !origen || origen === 'tarea' || origen === 'compromiso' || origen === 'plan_actividad'
    const includeActas = !origen || origen === 'acta'
    const includeBitacora = (!origen || origen === 'bitacora_diario' || origen === 'bitacora_evento')
      && (permisosBitacora?.ver !== false)

    try {
      // Cada fuente se aísla: un fallo no borra las demás (antes bitácora
      // se tragaba con [] y el calendario parecía «sin bitácoras»).
      const jobs = []

      if (includeBandeja) {
        const bandejaParams = {
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta,
        }
        if (filtros.q) bandejaParams.q = filtros.q
        if (filtros.estado) bandejaParams.estado = filtros.estado
        if (origen === 'tarea' || origen === 'compromiso' || origen === 'plan_actividad') {
          bandejaParams.origen = origen
        }
        if (filtros.incluir_cerrados) bandejaParams.incluir_cerrados = 'true'
        if (filtros.solo_mias) bandejaParams.solo_mias = 'true'
        jobs.push(
          api.listBandeja(bandejaParams)
            .then((rows) => ({ ok: true, rows }))
            .catch((e) => ({ ok: false, error: e, rows: [] })),
        )
      } else {
        jobs.push(Promise.resolve({ ok: true, rows: [] }))
      }

      if (includeActas) {
        const actasParams = {
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta,
        }
        if (filtros.q) actasParams.q = filtros.q
        if (filtros.tipo_acta) actasParams.tipo_acta = filtros.tipo_acta
        if (filtros.solo_mias) actasParams.solo_mias = 'true'
        jobs.push(
          api.listActas(actasParams)
            .then((rows) => ({ ok: true, rows }))
            .catch((e) => ({ ok: false, error: e, rows: [] })),
        )
      } else {
        jobs.push(Promise.resolve({ ok: true, rows: [] }))
      }

      if (includeBitacora && api.listBitacora) {
        const bitParams = {
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta,
          para_calendario: true,
        }
        if (filtros.q) bitParams.q = filtros.q
        // bitacora_evento: pedir diarios+eventos (default API) para ver
        // bloques embebidos e independientes; el filtro client-side afina.
        if (origen === 'bitacora_diario') bitParams.tipo = 'diario'
        jobs.push(
          api.listBitacora(bitParams)
            .then((rows) => ({ ok: true, rows }))
            .catch((e) => ({ ok: false, error: e, rows: null })),
        )
      } else {
        jobs.push(Promise.resolve({ ok: true, rows: [] }))
      }

      const [bandejaRes, actasRes, bitacoraRes] = await Promise.all(jobs)
      if (gen !== genRef.current) return

      const bandejaRows = Array.isArray(bandejaRes.rows) ? bandejaRes.rows : []
      const actasRows = Array.isArray(actasRes.rows) ? actasRes.rows : []
      let bitacoraRows = Array.isArray(bitacoraRes.rows) ? bitacoraRes.rows : []

      if (includeBitacora && bitacoraRes.ok === false) {
        setWarnBitacora(
          bitacoraRes.error?.message
            || 'No se pudieron cargar los registros de Bitácora. Pulse Actualizar.',
        )
        // Conservar bitácoras ya en pantalla; actualizar el resto.
        setEvents((prev) => {
          const keepBit = (prev || []).filter((ev) => {
            const k = ev?.extendedProps?.kind
            return k === 'bitacora_diario' || k === 'bitacora_evento'
          })
          let mapped = buildCalendarioEvents(
            bandejaRows,
            actasRows,
            [],
            { fechaDesde: range.fecha_desde, fechaHasta: range.fecha_hasta },
          )
          mapped = [...mapped, ...keepBit]
          if (origen) mapped = filterEventsByOrigen(mapped, origen)
          if (filtros.solo_mias) mapped = filterEventsSoloMias(mapped, usuario?.id)
          return mapped
        })
        onDataFreshRef.current?.({ ok: false, partial: true })
      } else {
        let mapped = buildCalendarioEvents(
          bandejaRows,
          actasRows,
          bitacoraRows,
          { fechaDesde: range.fecha_desde, fechaHasta: range.fecha_hasta },
        )
        if (origen) mapped = filterEventsByOrigen(mapped, origen)
        if (filtros.solo_mias) mapped = filterEventsSoloMias(mapped, usuario?.id)
        setEvents(mapped)

        if (!bandejaRes.ok && includeBandeja) {
          setError(bandejaRes.error?.message || 'No se pudieron cargar tareas/compromisos')
          onDataFreshRef.current?.({ ok: false, partial: true })
        } else if (!actasRes.ok && includeActas) {
          setError(actasRes.error?.message || 'No se pudieron cargar actas')
          onDataFreshRef.current?.({ ok: false, partial: true })
        } else {
          onDataFreshRef.current?.({ ok: true })
        }
      }
    } catch (e) {
      if (gen !== genRef.current) return
      setError(e.message || 'Error al cargar el calendario')
      onDataFreshRef.current?.({ ok: false })
    } finally {
      if (gen === genRef.current) setLoading(false)
    }
  }, [api, filtros, permisosBitacora?.ver, usuario?.id])

  useEffect(() => { load() }, [load, refreshKey, reloadTick])

  useEffect(() => {
    if (!dayMenu) {
      return undefined
    }
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

  useEffect(() => {
    if (!filtersOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setFiltersOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtersOpen])

  const handleDatesSet = useCallback((info) => {
    rangeRef.current = { start: info.start, end: info.end }
    setReloadTick((n) => n + 1)
  }, [])

  const openBitacoraEntry = useCallback((sourceId, meta) => {
    setAccesoMsg('')
    onAbrirBitacora?.(sourceId, meta)
  }, [onAbrirBitacora])

  const handleEventClick = useCallback((info) => {
    info.jsEvent?.preventDefault?.()
    info.jsEvent?.stopPropagation?.()
    setDayMenu(null)
    const xp = info.event.extendedProps || {}
    const { kind, sourceId, accesoRestringido } = xp
    if (kind === 'acta') {
      if (accesoRestringido) {
        setAccesoMsg(MSG_ACTA_ACCESO_RESTRINGIDO)
        return
      }
      setAccesoMsg('')
      onAbrirActa?.(sourceId)
      return
    }
    if (kind === 'bitacora_diario' || kind === 'bitacora_evento') {
      const fecha = toDateOnly(info.event.start) || toDateOnly(xp.raw?.fecha)
      openBitacoraEntry(sourceId, {
        fecha,
        diarios: Array.isArray(xp.diarios) ? xp.diarios : null,
        grouped: Boolean(xp.grouped) || (Array.isArray(xp.diarios) && xp.diarios.length > 1),
      })
      return
    }
    if (sourceId != null) setDetalleId(sourceId)
  }, [onAbrirActa, openBitacoraEntry])

  const handleDateClick = useCallback((info) => {
    info.jsEvent?.preventDefault?.()
    const dateStr = toDateOnly(info.dateStr || info.date)
    if (!dateStr) return
    const rect = info.dayEl?.getBoundingClientRect?.()
    const x = info.jsEvent?.clientX ?? (rect ? rect.left + rect.width / 2 : 80)
    const y = info.jsEvent?.clientY ?? (rect ? rect.top + 28 : 80)
    setFiltersOpen(false)
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
    const vencido = isMonth ? dayHasVencidos(events, dateStr, hoyBogotaDate()) : false
    const indicators = (widgetMode && summary?.total > 0) || vencido
      ? dayKindIndicators(summary || {}, { hasVencidos: vencido })
      : []
    const tip = [
      summary?.label || '',
      vencido ? CALENDARIO_VENCIDOS_LEGEND.label : '',
    ].filter(Boolean).join(' · ')

    return (
      <div className={`cc-seguim-cal-daycell${widgetMode ? ' cc-seguim-cal-daycell--widget' : ''}`}>
        <span className="cc-seguim-cal-daynum">{arg.dayNumberText}</span>
        {isMonth && widgetMode && indicators.length > 0 ? (
          <span className="cc-seguim-cal-daydots" title={tip || undefined} aria-label={tip || undefined}>
            {indicators.map((ind) => (
              <span
                key={ind.id}
                className={`cc-seguim-cal-daydot${ind.id === 'vencidos' ? ' cc-seguim-cal-daydot--vencido' : ''}`}
                style={{ background: ind.color }}
                title={`${ind.label}${ind.count > 1 && ind.id !== 'vencidos' ? ` (${ind.count})` : ''}`}
              />
            ))}
          </span>
        ) : null}
        {isMonth && !widgetMode && summary?.total > 0 ? (
          <span className="cc-seguim-cal-daycount" title={summary.label}>{summary.label}</span>
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

  const legend = useMemo(
    () => Object.values(CALENDARIO_KIND).filter((k) => k.id !== 'bitacora_evento'),
    [],
  )

  const dayEvents = useMemo(() => {
    if (!dayMenu?.dateStr) return []
    return sortDayEvents(eventsForDate(events, dayMenu.dateStr))
  }, [dayMenu, events])

  const openDayEvent = useCallback((ev) => {
    const xp = ev?.extendedProps || {}
    const { kind, sourceId, accesoRestringido } = xp
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
    if (kind === 'bitacora_diario' || kind === 'bitacora_evento') {
      const fecha = toDateOnly(ev?.start) || toDateOnly(xp.raw?.fecha) || dayMenu?.dateStr
      openBitacoraEntry(sourceId, {
        fecha,
        diarios: Array.isArray(xp.diarios) ? xp.diarios : null,
        grouped: Boolean(xp.grouped) || (Array.isArray(xp.diarios) && xp.diarios.length > 1),
      })
      return
    }
    if (sourceId != null) setDetalleId(sourceId)
  }, [onAbrirActa, openBitacoraEntry, dayMenu?.dateStr])

  const canCreateSeguimiento = Boolean(permisos?.crear)
  const canCreateBitacora = Boolean(permisosBitacora?.crear)
  const canExportBitacora = Boolean(permisosBitacora?.exportar || permisosBitacora?.ver)
  const showDayCreate = canCreateSeguimiento || canCreateBitacora || canExportBitacora

  const exportPdfDia = async (dateStr, { preview = false } = {}) => {
    if (!api?.exportBitacoraPdfBlob || !dateStr) return
    setPdfBusy(true)
    setError('')
    try {
      // Un diario por fecha: exportar solo por fecha (sin picker de tramo).
      const blob = await api.exportBitacoraPdfBlob(dateStr)
      const url = URL.createObjectURL(blob)
      if (preview) {
        window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `bitacora_${dateStr}.pdf`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
      setDayMenu(null)
    } catch (e) {
      setError(e.message || 'No se pudo generar el PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  const filtrosActivos = Boolean(
    filtros.q
    || filtros.estado
    || filtros.origen
    || filtros.tipo_acta
    || filtros.fecha_desde
    || filtros.fecha_hasta
    || filtros.incluir_cerrados
    || filtros.solo_mias,
  )

  const rootClass = [
    'cc-seguim-cal',
    viewportCompact ? 'cc-seguim-cal--compact' : '',
    widgetMode ? 'cc-seguim-cal--widget' : '',
  ].filter(Boolean).join(' ')

  const openFiltersPopup = () => {
    try { document.dispatchEvent(new CustomEvent('cc-title-tooltip-hide')) } catch { /* ignore */ }
    setFiltersOpen(true)
  }

  const closeFiltersPopup = () => setFiltersOpen(false)

  const filtersBody = (
    <div className="cc-seguim-filters" style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end',
    }}>
      <FilterField t={t} label="Buscar" className="cc-seguim-filter cc-seguim-filter--wide">
        <input
          value={filtros.q}
          onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setReloadTick((n) => n + 1)
              closeFiltersPopup()
            }
          }}
          placeholder="Buscar en tareas, actas o bitácora…"
          style={{ ...inp(t), minWidth: viewportCompact ? 0 : 220, width: '100%' }}
        />
      </FilterField>
      <FilterField t={t} label="Estado" className="cc-seguim-filter">
        <select
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
          style={{ ...inp(t), width: '100%' }}
          disabled={filtros.origen === 'acta'
            || filtros.origen === 'bitacora_diario'
            || filtros.origen === 'bitacora_evento'}
          title={filtros.origen === 'acta' || String(filtros.origen).startsWith('bitacora')
            ? 'El estado de gestión aplica a tareas y compromisos'
            : undefined}
        >
          {ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
        </select>
      </FilterField>
      <FilterField t={t} label="Origen" className="cc-seguim-filter">
        <select
          value={filtros.origen}
          onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))}
          style={{ ...inp(t), width: '100%' }}
        >
          <option value="">Todos</option>
          <option value="compromiso">Compromisos</option>
          <option value="tarea">Tareas</option>
          <option value="acta">Actas</option>
          <option value="bitacora_diario">Bitácora (diario)</option>
          <option value="bitacora_evento">Bitácora (eventos)</option>
        </select>
      </FilterField>
      <FilterField t={t} label="Tipo de acta" className="cc-seguim-filter">
        <select
          value={filtros.tipo_acta}
          onChange={(e) => setFiltros((f) => ({ ...f, tipo_acta: e.target.value }))}
          style={{ ...inp(t), width: '100%' }}
          disabled={filtros.origen === 'tarea'
            || filtros.origen === 'compromiso'
            || String(filtros.origen).startsWith('bitacora')}
        >
          {tiposActaOpts.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
        </select>
      </FilterField>
      <FilterField t={t} label="Desde" className="cc-seguim-filter">
        <input
          type="date"
          className="cc-seguim-date"
          value={filtros.fecha_desde}
          onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))}
          style={{ ...inp(t), width: '100%' }}
        />
      </FilterField>
      <FilterField t={t} label="Hasta" className="cc-seguim-filter">
        <input
          type="date"
          className="cc-seguim-date"
          value={filtros.fecha_hasta}
          onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))}
          style={{ ...inp(t), width: '100%' }}
        />
      </FilterField>
      <label className="cc-seguim-filter cc-seguim-filter--check" style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4,
      }}>
        <input
          type="checkbox"
          checked={!!filtros.incluir_cerrados}
          onChange={(e) => setFiltros((f) => ({ ...f, incluir_cerrados: e.target.checked }))}
          disabled={filtros.origen === 'acta' || String(filtros.origen).startsWith('bitacora')}
        />
        Incluir cumplidos / cancelados
      </label>
      <label
        className="cc-seguim-filter cc-seguim-filter--check"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4,
        }}
        title="Tareas/compromisos creados o asignados a usted; actas donde es elaborador o asistente; bitácora que creó"
      >
        <input
          type="checkbox"
          checked={!!filtros.solo_mias}
          onChange={(e) => setFiltros((f) => ({ ...f, solo_mias: e.target.checked }))}
        />
        Solo mis actividades
      </label>
      <div className="cc-seguim-filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            setReloadTick((n) => n + 1)
            closeFiltersPopup()
          }}
          style={ghost(t)}
        >
          Buscar
        </button>
      </div>
      {canExportBitacora ? (
        <div style={{
          flex: '1 1 100%',
          marginTop: 4,
          paddingTop: 10,
          borderTop: `1px dashed ${t.border}`,
        }}>
          <BitacoraExportRangoBar
            t={t}
            api={api}
            variant="inline"
            compact={viewportCompact}
            initialDesde={filtros.fecha_desde}
            initialHasta={filtros.fecha_hasta}
          />
        </div>
      ) : null}
    </div>
  )

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
            Tareas, actas y bitácora · clic en un día para crear o abrir
            {loading ? ' · actualizando…' : ''}
          </div>
        </div>
      )}

      {filtersVisible && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={openFiltersPopup}
            title="Filtros"
            data-cc-tooltip="Filtros"
            data-cc-tooltip-variant="short"
            aria-label="Filtros"
            aria-expanded={filtersOpen}
            style={{
              width: 34,
              height: 34,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              cursor: 'pointer',
              position: 'relative',
              border: `1px solid ${filtrosActivos ? t.primary : t.border}`,
              background: filtrosActivos ? `${t.primary}22` : (t.bgCard || t.bg || 'transparent'),
              color: t.text,
            }}
          >
            <FilterIcon size={17} strokeWidth={2.4} aria-hidden />
            {filtrosActivos ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: t.primary,
                  boxShadow: `0 0 0 2px ${t.bgCard || '#fff'}`,
                }}
              />
            ) : null}
          </button>
          {loading && <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Actualizando…</span>}
        </div>
      )}

      {filtersVisible && filtersOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="presentation"
          data-cc-seguim-filtros-overlay="1"
          onClick={closeFiltersPopup}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100040,
            background: t.overlay || 'rgba(15,23,42,0.48)',
            display: 'flex',
            alignItems: viewportCompact ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: viewportCompact ? 0 : 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtros"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: viewportCompact ? '100%' : 'min(720px, 96vw)',
              maxHeight: viewportCompact ? '92dvh' : '90vh',
              overflow: 'auto',
              background: t.bgCard || t.bg || '#fff',
              border: `1px solid ${t.border}`,
              borderRadius: viewportCompact ? '14px 14px 0 0' : 14,
              boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CcModalBrandHeader theme={t} />
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>Filtros</div>
              <button
                type="button"
                title="Cerrar"
                data-cc-tooltip="Cerrar"
                data-cc-tooltip-variant="short"
                aria-label="Cerrar"
                onClick={closeFiltersPopup}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: 'transparent',
                  color: t.text,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <X size={17} strokeWidth={2.3} aria-hidden />
              </button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {filtersBody}
            </div>
          </div>
        </div>,
        document.body,
      )}

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

      {warnBitacora && (
        <div style={{
          fontSize: 'var(--cc-sm)',
          color: t.danger || '#b91c1c',
          fontWeight: 700,
          marginBottom: 8,
        }}
        >
          {warnBitacora}
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

      <div
        className="cc-seguim-cal-legend"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: widgetMode ? 6 : 8,
          marginTop: widgetMode ? 6 : 10,
          alignItems: 'center',
          padding: widgetMode ? '0 12px 8px' : '0 2px',
        }}
        aria-label="Convenciones de color"
      >
        {legend.map((k) => (
          <span
            key={k.id}
            title={k.tooltip || k.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: widgetMode ? '2px 6px' : '3px 8px',
              borderRadius: 999,
              border: `1px solid ${t.border}`,
              background: `${k.color}18`,
              fontSize: widgetMode ? 'var(--cc-xs)' : 'var(--cc-sm)',
              color: t.text,
              cursor: 'help',
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: 3, background: k.color, display: 'inline-block', flexShrink: 0,
            }}
            />
            {!widgetMode && <span>{k.label}</span>}
            {widgetMode && <span aria-hidden>{k.icon}</span>}
          </span>
        ))}
        <span
          title={CALENDARIO_VENCIDOS_LEGEND.tooltip}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: widgetMode ? '2px 6px' : '3px 8px',
            borderRadius: 999,
            border: '1px solid #facc15',
            background: 'color-mix(in srgb, #dc2626 18%, transparent)',
            fontSize: widgetMode ? 'var(--cc-xs)' : 'var(--cc-sm)',
            color: t.text,
            cursor: 'help',
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: 3,
            background: 'color-mix(in srgb, #dc2626 40%, transparent)',
            border: '1px solid #facc15',
            display: 'inline-block',
          }}
          />
          {!widgetMode && CALENDARIO_VENCIDOS_LEGEND.label}
          {widgetMode && 'Venc.'}
        </span>
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
            <CcModalBrandHeader theme={t} />
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

            {showDayCreate && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '12px 16px',
                borderBottom: `1px solid ${t.border}`,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {canCreateSeguimiento && (
                    <>
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
                    </>
                  )}
                  {canCreateBitacora && (
                    <button
                      type="button"
                      onClick={() => {
                        onNuevaBitacora?.('diario', dayMenu.dateStr)
                        setDayMenu(null)
                      }}
                      style={{
                        ...primary(t),
                        borderLeft: `3px solid ${CALENDARIO_KIND.bitacora_diario.color}`,
                      }}
                    >
                      📒 Bitácora
                    </button>
                  )}
                  {canExportBitacora && (
                    <>
                      <button
                        type="button"
                        disabled={pdfBusy}
                        onClick={() => void exportPdfDia(dayMenu.dateStr, { preview: true })}
                        style={{ ...ghost(t), opacity: pdfBusy ? 0.6 : 1 }}
                      >
                        {pdfBusy ? '…' : 'Vista previa'}
                      </button>
                      <button
                        type="button"
                        disabled={pdfBusy}
                        onClick={() => void exportPdfDia(dayMenu.dateStr, { preview: false })}
                        style={{ ...ghost(t), opacity: pdfBusy ? 0.6 : 1 }}
                      >
                        {pdfBusy ? '…' : 'Descargar'}
                      </button>
                    </>
                  )}
                </div>
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
                  No hay tareas, actas ni bitácora para este día.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {dayEvents.map((ev) => {
                    const kind = ev.extendedProps?.kind || 'tarea'
                    const meta = CALENDARIO_KIND[kind] || CALENDARIO_KIND.tarea
                    const hora = eventDisplayTime(ev)
                    const titulo = eventDisplayTitle(ev)
                    const elaborador = ev.extendedProps?.elaborador
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
                            {elaborador ? (
                              <span style={{
                                display: 'block',
                                fontSize: 'var(--cc-xs)',
                                color: t.textMuted,
                                marginTop: 2,
                              }}>
                                Elaborado por {elaborador}
                              </span>
                            ) : null}
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

function FilterField({ t, label, children, className = '' }) {
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
    background: t.bgCard, color: t.text, fontWeight: 600, fontSize: 'var(--cc-sm)',
  }
}
