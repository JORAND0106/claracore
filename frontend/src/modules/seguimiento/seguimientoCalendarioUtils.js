/**
 * Mapeo bandeja/actas/bitácora → eventos FullCalendar.
 * Diferenciación visual: color de bloque + icono por tipo.
 */
import { labelEventoTipo } from './bitacoraConstants.js'
import { fechaVencimientoEfectiva, hoyBogotaDate } from './vencimientoLevels.js'
import { numeroActaLabel } from './seguimientoTheme.js'

export const CALENDARIO_KIND = {
  tarea: {
    id: 'tarea',
    label: 'Tarea personal',
    icon: '✅',
    color: '#2563eb',
    textColor: '#ffffff',
    tooltip: 'Tareas personales creadas o asignadas a usted',
  },
  compromiso: {
    id: 'compromiso',
    label: 'Compromiso de acta',
    icon: '📋',
    color: '#0f766e',
    textColor: '#ffffff',
    tooltip: 'Compromisos derivados de actas de reunión',
  },
  acta: {
    id: 'acta',
    label: 'Acta / reunión',
    icon: '📝',
    color: '#d97706',
    textColor: '#ffffff',
    tooltip: 'Actas o reuniones programadas del contrato',
  },
  /** Familia tonal violeta: diario más intenso, evento más claro. */
  bitacora_diario: {
    id: 'bitacora_diario',
    label: 'Reporte diario',
    icon: '📒',
    color: '#6d28d9',
    textColor: '#ffffff',
    tooltip: 'Bitácora de Obra · Reporte Diario del día',
  },
  bitacora_evento: {
    id: 'bitacora_evento',
    label: 'Reporte de evento',
    icon: '📎',
    color: '#a78bfa',
    textColor: '#1e1b4b',
    tooltip: 'Bitácora de Obra · Reporte de Evento',
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
  const origen = item.origen === 'compromiso' ? 'compromiso' : 'tarea'
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
  const esEvento = String(entrada.tipo || '') === 'evento'
  const kind = esEvento ? 'bitacora_evento' : 'bitacora_diario'
  const meta = CALENDARIO_KIND[kind]
  const start = buildStart(entrada.fecha, entrada.hora_inicio_labores || null)
  if (!start) return null
  const allDay = !entrada.hora_inicio_labores
  const elaborador = String(entrada.created_by_nombre || '').trim()
  let texto
  if (esEvento) {
    const tipoLabel = labelEventoTipo(entrada.evento_tipo)
    texto = elaborador ? `${tipoLabel} · ${elaborador}` : tipoLabel
  } else {
    texto = elaborador ? `Diario · ${elaborador}` : 'Reporte diario'
  }
  return {
    id: `bitacora-${entrada.id}`,
    title: titleWithIcon(meta.icon, texto),
    start,
    allDay,
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: meta.textColor,
    extendedProps: {
      kind,
      sourceId: entrada.id,
      icon: meta.icon,
      label: meta.label,
      elaborador,
      raw: entrada,
    },
  }
}

/** Une eventos de bandeja + actas + bitácora (omite nulos / sin fecha). */
export function buildCalendarioEvents(bandejaRows = [], actasRows = [], bitacoraRows = []) {
  const out = []
  for (const row of bandejaRows || []) {
    const ev = bandejaItemToEvent(row)
    if (ev) out.push(ev)
  }
  for (const row of actasRows || []) {
    const ev = actaToEvent(row)
    if (ev) out.push(ev)
  }
  for (const row of bitacoraRows || []) {
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
  return (events || []).filter((ev) => ev?.extendedProps?.kind === origen)
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
    else if (kind === 'bitacora_diario') diarios += 1
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
  if (diarios > 0) parts.push(`${diarios} diario${diarios === 1 ? '' : 's'}`)
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
  if (diarios > 0) parts.push(`${diarios}D`)
  if (eventosBit > 0) parts.push(`${eventosBit}E`)
  return parts.join(' · ')
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
