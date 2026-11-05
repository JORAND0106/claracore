/**
 * Mapeo bandeja/actas/bitácora → eventos FullCalendar.
 * Diferenciación visual: color de bloque + icono por tipo.
 */
import { labelEventoTipo } from './bitacoraConstants.js'
import { expandirOcurrencias } from './planActividadesOcurrencias.js'
import { fechaVencimientoEfectiva, hoyBogotaDate } from './vencimientoLevels.js'
import { numeroActaLabel } from './seguimientoTheme.js'

export const CALENDARIO_KIND = {
  tarea: {
    id: 'tarea',
    label: 'Tarea personal',
    icon: '✅',
    color: '#2563eb',
    textColor: '#ffffff',
    tooltip: 'Tareas personales creadas, asignadas o notificadas a usted',
  },
  compromiso: {
    id: 'compromiso',
    label: 'Compromiso de acta',
    icon: '📋',
    color: '#0f766e',
    textColor: '#ffffff',
    tooltip: 'Compromisos derivados de actas de reunión',
  },
  plan_actividad: {
    id: 'plan_actividad',
    label: 'Plan de actividades',
    icon: '🗓️',
    color: '#0284c7',
    textColor: '#ffffff',
    tooltip: 'Actividades del Plan de actividades (compromisos de Seguimiento)',
  },
  acta: {
    id: 'acta',
    label: 'Acta / reunión',
    icon: '📝',
    color: '#d97706',
    textColor: '#ffffff',
    tooltip: 'Actas o reuniones programadas del contrato',
  },
  /** Familia tonal violeta para Bitácora. */
  bitacora_diario: {
    id: 'bitacora_diario',
    label: 'Bitácora',
    icon: '📒',
    color: '#6d28d9',
    textColor: '#ffffff',
    tooltip: 'Bitácora del día (incluye eventos del documento)',
  },
  bitacora_evento: {
    id: 'bitacora_evento',
    label: 'Evento de bitácora',
    icon: '📎',
    color: '#a78bfa',
    textColor: '#1e1b4b',
    tooltip: 'Reporte de evento (actividades, recorrido, SST, novedades)',
  },
}

/** Convención aparte (no es un kind de evento). */
export const CALENDARIO_VENCIDOS_LEGEND = {
  id: 'vencidos',
  label: 'Día con vencidos',
  color: '#dc2626',
  tooltip: 'El día tiene al menos una tarea o compromiso vencido',
}

/** Formatea Date o ISO a YYYY-MM-DD (local calendar day). */
export function toDateOnly(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const s = value.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

/**
 * Intersecta el rango visible del calendario con filtros opcionales del usuario.
 * @returns {{ fecha_desde: string, fecha_hasta: string } | null} null si no hay solape
 */
export function resolveFetchRange(visibleStart, visibleEnd, filtroDesde = '', filtroHasta = '') {
  let desde = toDateOnly(visibleStart)
  let hasta = toDateOnly(visibleEnd)
  // FullCalendar end es exclusivo; para API inclusiva restamos un día si es Date
  if (visibleEnd instanceof Date) {
    const endIncl = new Date(visibleEnd.getTime() - 86400000)
    hasta = toDateOnly(endIncl) || hasta
  }
  if (filtroDesde && (!desde || filtroDesde > desde)) desde = filtroDesde
  if (filtroHasta && (!hasta || filtroHasta < hasta)) hasta = filtroHasta
  if (desde && hasta && desde > hasta) return null
  return { fecha_desde: desde || undefined, fecha_hasta: hasta || undefined }
}

function buildStart(fecha, hora) {
  const f = toDateOnly(fecha)
  if (!f) return null
  if (hora) {
    const h = String(hora).slice(0, 5)
    if (/^\d{2}:\d{2}$/.test(h)) return `${f}T${h}:00`
  }
  return f
}

function titleWithIcon(icon, text) {
  const t = String(text || '').trim() || 'Sin título'
  return `${icon} ${t}`
}

/**
 * @param {object} item fila de bandeja
 * @returns {object|null} evento FullCalendar
 */
export function bandejaItemToEvent(item) {
  if (!item?.id) return null
  const origenRaw = String(item.origen || '')
  const origen = origenRaw === 'compromiso'
    ? 'compromiso'
    : origenRaw === 'plan_actividad'
      ? 'plan_actividad'
      : 'tarea'
  // Madre con partes: no evento propio (las partes ya ocupan el calendario).
  if (
    origen === 'tarea'
    && !item.padre_id
    && (
      item.es_madre_partes
      || item.campos_libres?.es_madre_partes
      || (Array.isArray(item.partes) && item.partes.length > 0)
    )
  ) {
    return null
  }

  // Plan periódico: una barra/evento por ocurrencia en el rango visible lo resuelve
  // el calendario al mapear; aquí emitimos la fecha efectiva o la 1ª ocurrencia.
  if (origen === 'plan_actividad') {
    const plan = item.campos_libres?.plan && typeof item.campos_libres.plan === 'object'
      ? item.campos_libres.plan
      : {}
    const per = String(plan.periodicidad || item.periodicidad || 'ninguna')
    const meta = CALENDARIO_KIND.plan_actividad
    if (per !== 'ninguna') {
      // Devolver null aquí: el panel de calendario usará planActividadToEvents
      // si está disponible; fallback a fecha_vencimiento.
    }
    const due = fechaVencimientoEfectiva(item)
    const start = buildStart(due.fecha || plan.fecha_fin || plan.fecha_inicio, due.hora)
    if (!start) return null
    return {
      id: `plan_actividad-${item.id}`,
      title: titleWithIcon(meta.icon, item.titulo || `#${item.consecutivo || item.id}`),
      start,
      allDay: !due.hora,
      backgroundColor: meta.color,
      borderColor: meta.color,
      textColor: meta.textColor,
      extendedProps: {
        kind: 'plan_actividad',
        sourceId: item.id,
        icon: meta.icon,
        label: meta.label,
        raw: item,
      },
    }
  }

  const meta = CALENDARIO_KIND[origen]
  const due = fechaVencimientoEfectiva(item)
  const start = buildStart(due.fecha, due.hora)
  if (!start) return null
  const allDay = !due.hora
  return {
    id: `${origen}-${item.id}`,
    title: titleWithIcon(meta.icon, item.titulo || item.tema || `#${item.consecutivo || item.id}`),
    start,
    allDay,
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind: origen,
      sourceId: item.id,
      icon: meta.icon,
      label: meta.label,
      raw: item,
    },
  }
}

/**
 * Expande una actividad del plan a N eventos FullCalendar (ocurrencias).
 */
export function planActividadToEvents(item, { fechaDesde, fechaHasta } = {}) {
  if (!item?.id || item.origen !== 'plan_actividad') return []
  const meta = CALENDARIO_KIND.plan_actividad
  const plan = item.campos_libres?.plan && typeof item.campos_libres.plan === 'object'
    ? item.campos_libres.plan
    : {}
  let occs = Array.isArray(item.ocurrencias) ? item.ocurrencias : []
  if (!occs.length) {
    occs = expandirOcurrencias({
      fechaInicio: plan.fecha_inicio || item.fecha_inicio,
      fechaFin: plan.fecha_fin || item.fecha_fin || item.fecha_vencimiento,
      periodicidad: plan.periodicidad || item.periodicidad,
      periodicidadHasta: plan.periodicidad_hasta || item.periodicidad_hasta,
      rangoDesde: fechaDesde,
      rangoHasta: fechaHasta,
    })
  } else if (fechaDesde || fechaHasta) {
    occs = occs.filter((o) => {
      if (fechaHasta && o.fecha_inicio > fechaHasta) return false
      if (fechaDesde && o.fecha_fin < fechaDesde) return false
      return true
    })
  }
  if (!occs.length) {
    const ev = bandejaItemToEvent({ ...item, origen: 'plan_actividad' })
    return ev ? [ev] : []
  }
  return occs.map((o, idx) => ({
    id: `plan_actividad-${item.id}-${idx}-${o.fecha_fin}`,
    title: titleWithIcon(meta.icon, item.titulo || `#${item.consecutivo || item.id}`),
    start: o.fecha_inicio,
    end: o.fecha_fin === o.fecha_inicio
      ? undefined
      : (() => {
        // FullCalendar end exclusivo para allDay
        const d = new Date(`${o.fecha_fin}T12:00:00`)
        d.setDate(d.getDate() + 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      })(),
    allDay: true,
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind: 'plan_actividad',
      sourceId: item.id,
      icon: meta.icon,
      label: meta.label,
      raw: item,
      ocurrencia: o,
    },
  }))
}

/**
 * @param {object} acta fila de listActas
 * @returns {object|null}
 */
export function actaToEvent(acta) {
  if (!acta?.id) return null
  const meta = CALENDARIO_KIND.acta
  const start = buildStart(acta.fecha_reunion, acta.hora_inicio || acta.hora_reunion || null)
  if (!start) return null
  const allDay = !(acta.hora_inicio || acta.hora_reunion)
  const titulo = numeroActaLabel(acta.consecutivo)
  const sub = acta.ubicacion ? ` · ${acta.ubicacion}` : ''
  return {
    id: `acta-${acta.id}`,
    title: titleWithIcon(meta.icon, `${titulo}${sub}`),
    start,
    allDay,
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind: 'acta',
      sourceId: acta.id,
      icon: meta.icon,
      label: meta.label,
      accesoRestringido: acta?.puede_abrir === false || acta?.acceso_restringido === true,
      raw: acta,
    },
  }
}

/**
 * @param {object} entrada fila de listBitacora
 * @returns {object|null}
 */
export function bitacoraToEvent(entrada) {
  if (!entrada?.id) return null
  const tipo = String(entrada.tipo || '')
  // Eventos independientes aún no consolidados: visibles en calendario.
  if (tipo === 'evento') {
    const meta = CALENDARIO_KIND.bitacora_evento
    const start = buildStart(entrada.fecha, null)
    if (!start) return null
    const elaborador = String(entrada.created_by_nombre || '').trim()
    const tipoEv = String(entrada.evento_tipo || 'evento').replace(/_/g, ' ')
    const texto = elaborador
      ? `${tipoEv} · ${elaborador}`
      : tipoEv
    return {
      id: `bitacora-evento-${entrada.id}`,
      title: titleWithIcon(meta.icon, texto),
      start,
      allDay: true,
      backgroundColor: meta.color,
      borderColor: meta.color,
      textColor: meta.textColor,
      extendedProps: {
        kind: 'bitacora_evento',
        sourceId: entrada.id,
        icon: meta.icon,
        label: meta.label,
        elaborador,
        eventosCount: 1,
        eventoTipo: entrada.evento_tipo,
        raw: entrada,
      },
    }
  }
  const kind = 'bitacora_diario'
  const meta = CALENDARIO_KIND[kind]
  const start = buildStart(entrada.fecha, null) // agrupación por día (all-day)
  if (!start) return null
  const elaborador = String(entrada.created_by_nombre || '').trim()
  const nEv = Array.isArray(entrada.eventos)
    ? entrada.eventos.length
    : (Number(entrada.eventos_count) || 0)
  let texto = elaborador ? `Bitácora · ${elaborador}` : 'Bitácora'
  if (nEv > 0) texto += ` · ${nEv} evento${nEv === 1 ? '' : 's'}`
  return {
    id: `bitacora-${entrada.id}`,
    title: titleWithIcon(meta.icon, texto),
    start,
    allDay: true,
    backgroundColor: meta.color,
    borderColor: nEv > 0 ? (CALENDARIO_KIND.bitacora_evento?.color || meta.color) : meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind,
      sourceId: entrada.id,
      icon: meta.icon,
      label: meta.label,
      elaborador,
      eventosCount: nEv,
      tramo: entrada.tramo ?? null,
      diarios: [entrada],
      raw: entrada,
    },
  }
}

/**
 * Agrupa varios diarios de la misma fecha en un único evento «Bitácora».
 * @param {object[]} diarios
 * @returns {object|null}
 */
export function bitacoraGroupToEvent(diarios) {
  const list = (Array.isArray(diarios) ? diarios : []).filter((d) => d?.id)
  if (!list.length) return null
  if (list.length === 1) return bitacoraToEvent(list[0])
  const meta = CALENDARIO_KIND.bitacora_diario
  const fecha = String(list[0].fecha || '').slice(0, 10)
  const start = buildStart(fecha, null)
  if (!start) return null
  const nTramos = list.length
  const nEv = list.reduce((acc, d) => {
    const n = Array.isArray(d.eventos) ? d.eventos.length : (Number(d.eventos_count) || 0)
    return acc + n
  }, 0)
  let texto = `Bitácora · ${nTramos} tramo${nTramos === 1 ? '' : 's'}`
  if (nEv > 0) texto += ` · ${nEv} evento${nEv === 1 ? '' : 's'}`
  return {
    id: `bitacora-dia-${fecha}`,
    title: titleWithIcon(meta.icon, texto),
    start,
    allDay: true,
    backgroundColor: meta.color,
    borderColor: nEv > 0 ? (CALENDARIO_KIND.bitacora_evento?.color || meta.color) : meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind: 'bitacora_diario',
      sourceId: list[0].id,
      icon: meta.icon,
      label: meta.label,
      eventosCount: nEv,
      tramosCount: nTramos,
      diarios: list,
      grouped: true,
      raw: list[0],
    },
  }
}

/** Une eventos de bandeja + actas + bitácora (omite nulos / sin fecha). */
export function buildCalendarioEvents(
  bandejaRows = [],
  actasRows = [],
  bitacoraRows = [],
  { fechaDesde, fechaHasta } = {},
) {
  const out = []
  for (const row of bandejaRows || []) {
    if (row?.origen === 'plan_actividad') {
      const evs = planActividadToEvents(row, { fechaDesde, fechaHasta })
      out.push(...evs)
      continue
    }
    const ev = bandejaItemToEvent(row)
    if (ev) out.push(ev)
  }
  for (const row of actasRows || []) {
    const ev = actaToEvent(row)
    if (ev) out.push(ev)
  }
  // Bitácora: diarios agrupados por fecha + eventos independientes aún visibles.
  const byFecha = new Map()
  const eventosIndep = []
  for (const row of bitacoraRows || []) {
    if (!row?.id) continue
    if (String(row.tipo || '') === 'evento') {
      eventosIndep.push(row)
      continue
    }
    const f = String(row.fecha || '').slice(0, 10)
    if (!f) continue
    if (!byFecha.has(f)) byFecha.set(f, [])
    byFecha.get(f).push(row)
  }
  for (const [, list] of byFecha) {
    const ev = bitacoraGroupToEvent(list)
    if (ev) out.push(ev)
  }
  for (const row of eventosIndep) {
    const ev = bitacoraToEvent(row)
    if (ev) out.push(ev)
  }
  return out
}

/**
 * Filtra client-side por origen cuando el API de bandeja ya trajo ambos tipos
 * o cuando se oculta un tipo en la UI.
 */
export function filterEventsByOrigen(events, origen) {
  if (!origen) return events
  if (origen === 'bitacora_evento') {
    // Eventos independientes + diarios que ya llevan bloques embebidos.
    return (events || []).filter((ev) => {
      const kind = ev?.extendedProps?.kind
      if (kind === 'bitacora_evento') return true
      if (kind === 'bitacora_diario') {
        return Number(ev?.extendedProps?.eventosCount || 0) > 0
      }
      return false
    })
  }
  if (origen === 'bitacora_diario') {
    return (events || []).filter((ev) => ev?.extendedProps?.kind === 'bitacora_diario')
  }
  return (events || []).filter((ev) => ev?.extendedProps?.kind === origen)
}

/**
 * Filtra eventos bitácora por creador (bandeja/actas ya vienen filtrados del API con solo_mias).
 */
export function filterEventsSoloMias(events, usuarioId) {
  const uid = Number(usuarioId)
  if (!Number.isFinite(uid) || uid <= 0) return events || []
  return (events || []).filter((ev) => {
    const kind = ev?.extendedProps?.kind
    const raw = ev?.extendedProps?.raw || {}
    if (kind === 'bitacora_diario' || kind === 'bitacora_evento') {
      // Agrupados por día: basta con que alguno de los diarios sea del usuario.
      const diarios = ev?.extendedProps?.diarios
      if (Array.isArray(diarios) && diarios.length) {
        return diarios.some((d) => Number(d?.created_by) === uid)
      }
      return Number(raw.created_by) === uid
    }
    return true
  })
}

/** Eventos cuya fecha de inicio cae en `dateStr` (YYYY-MM-DD). */
export function eventsForDate(events, dateStr) {
  const d = toDateOnly(dateStr)
  if (!d) return []
  return (events || []).filter((ev) => toDateOnly(ev?.start) === d)
}

const KIND_SORT = {
  tarea: 0,
  compromiso: 1,
  acta: 2,
  bitacora_diario: 3,
  bitacora_evento: 4,
}

/**
 * Ordena elementos de un día: tipo → hora (si hay) → título.
 * Sin hora es válido; van después de los que sí tienen hora.
 */
export function sortDayEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const ka = KIND_SORT[a?.extendedProps?.kind] ?? 9
    const kb = KIND_SORT[b?.extendedProps?.kind] ?? 9
    if (ka !== kb) return ka - kb
    const sa = String(a?.start || '')
    const sb = String(b?.start || '')
    const aTime = sa.includes('T')
    const bTime = sb.includes('T')
    if (aTime && bTime) return sa.localeCompare(sb)
    if (aTime !== bTime) return aTime ? -1 : 1
    return String(a?.title || '').localeCompare(String(b?.title || ''), 'es')
  })
}

/** Título sin el emoji/icono inicial del evento. */
export function eventDisplayTitle(ev) {
  return String(ev?.title || '').replace(/^[^\s]+\s/, '').trim() || 'Sin título'
}

/** Hora HH:MM si el start es timed; null si es solo fecha. */
export function eventDisplayTime(ev) {
  const s = String(ev?.start || '')
  if (!s.includes('T')) return null
  const m = /T(\d{2}:\d{2})/.exec(s)
  return m ? m[1] : null
}

/**
 * Conteos por tipo en un día (vista mes).
 * @returns {{ tareas, compromisos, actas, diarios, eventosBit, total, label }}
 */
export function summarizeDayCounts(events, dateStr) {
  let tareas = 0
  let compromisos = 0
  let actas = 0
  let diarios = 0
  let eventosBit = 0
  for (const ev of eventsForDate(events, dateStr)) {
    const kind = ev?.extendedProps?.kind
    if (kind === 'tarea') tareas += 1
    else if (kind === 'compromiso') compromisos += 1
    else if (kind === 'acta') actas += 1
    else if (kind === 'bitacora_diario') {
      const n = Number(ev?.extendedProps?.tramosCount)
        || (Array.isArray(ev?.extendedProps?.diarios) ? ev.extendedProps.diarios.length : 0)
        || 1
      diarios += n
    }
    else if (kind === 'bitacora_evento') eventosBit += 1
  }
  return {
    tareas,
    compromisos,
    actas,
    diarios,
    eventosBit,
    total: tareas + compromisos + actas + diarios + eventosBit,
    label: formatDayCountLabel({ tareas, compromisos, actas, diarios, eventosBit }),
  }
}

export function formatDayCountLabel({
  tareas = 0, compromisos = 0, actas = 0, diarios = 0, eventosBit = 0,
} = {}) {
  const parts = []
  if (tareas > 0) parts.push(`${tareas} tarea${tareas === 1 ? '' : 's'}`)
  if (compromisos > 0) parts.push(`${compromisos} compromiso${compromisos === 1 ? '' : 's'}`)
  if (actas > 0) parts.push(`${actas} acta${actas === 1 ? '' : 's'}`)
  if (diarios > 0) {
    parts.push(diarios === 1 ? '1 bitácora' : `Bitácora · ${diarios} tramos`)
  }
  if (eventosBit > 0) parts.push(`${eventosBit} evento${eventosBit === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Etiqueta corta para widget de inicio (espacio reducido). */
export function formatDayCountLabelShort({
  tareas = 0, compromisos = 0, actas = 0, diarios = 0, eventosBit = 0,
} = {}) {
  const parts = []
  if (tareas > 0) parts.push(`${tareas}T`)
  if (compromisos > 0) parts.push(`${compromisos}C`)
  if (actas > 0) parts.push(`${actas}A`)
  if (diarios > 0) parts.push(`${diarios}B`)
  if (eventosBit > 0) parts.push(`${eventosBit}E`)
  return parts.join(' · ')
}

/**
 * Indicadores compactos (puntos de color) para el mini-calendario del widget.
 * Misma convención que la leyenda; un punto por tipo presente (+ vencidos).
 * @returns {{ id: string, color: string, label: string, count: number }[]}
 */
export function dayKindIndicators(summary = {}, { hasVencidos = false } = {}) {
  const {
    tareas = 0,
    compromisos = 0,
    actas = 0,
    diarios = 0,
    eventosBit = 0,
  } = summary
  const bitacora = Number(diarios) + Number(eventosBit)
  const out = []
  if (tareas > 0) {
    out.push({
      id: 'tarea',
      color: CALENDARIO_KIND.tarea.color,
      label: CALENDARIO_KIND.tarea.label,
      count: tareas,
    })
  }
  if (compromisos > 0) {
    out.push({
      id: 'compromiso',
      color: CALENDARIO_KIND.compromiso.color,
      label: CALENDARIO_KIND.compromiso.label,
      count: compromisos,
    })
  }
  if (actas > 0) {
    out.push({
      id: 'acta',
      color: CALENDARIO_KIND.acta.color,
      label: CALENDARIO_KIND.acta.label,
      count: actas,
    })
  }
  if (bitacora > 0) {
    out.push({
      id: 'bitacora',
      color: CALENDARIO_KIND.bitacora_diario.color,
      label: CALENDARIO_KIND.bitacora_diario.label,
      count: bitacora,
    })
  }
  if (hasVencidos) {
    out.push({
      id: 'vencidos',
      color: CALENDARIO_VENCIDOS_LEGEND.color,
      label: CALENDARIO_VENCIDOS_LEGEND.label,
      count: 1,
    })
  }
  return out
}

/**
 * Tarea/compromiso vencido: fecha del evento &lt; hoy (Bogotá) y no cumplido/cancelado.
 * Las actas no marcan el día como vencido.
 */
export function isEventoVencido(ev, hoy = hoyBogotaDate()) {
  const kind = ev?.extendedProps?.kind
  if (kind !== 'tarea' && kind !== 'compromiso') return false
  const raw = ev?.extendedProps?.raw
  const estado = String(raw?.estado_gestion || '').toLowerCase()
  if (estado === 'cumplido' || estado === 'cancelado') return false
  if (estado === 'vencido') return true
  const day = toDateOnly(ev?.start)
  const hoyStr = toDateOnly(hoy)
  return !!(day && hoyStr && day < hoyStr)
}

/** True si el día tiene al menos una tarea/compromiso vencido. */
export function dayHasVencidos(events, dateStr, hoy = hoyBogotaDate()) {
  return eventsForDate(events, dateStr).some((ev) => isEventoVencido(ev, hoy))
}
