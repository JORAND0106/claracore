/** Zona horaria oficial del módulo Almacén de Obra (Colombia). */
import {
  TZ_COLOMBIA,
  parseTimestampUtc,
  formatFechaHoraColombia,
} from '../utils/fechaColombia'

export const ALMACEN_TIMEZONE = TZ_COLOMBIA

/** Interpreta ISO de API/Postgres; sin huso explícito se asume UTC. */
export function parseIsoAlmacen(iso) {
  return parseTimestampUtc(iso)
}

/** Fecha y hora en Colombia (listados, trazabilidad, salidas). */
export function fmtFechaAlmacen(iso, { withTime = true } = {}) {
  if (!iso) return null
  const txt = formatFechaHoraColombia(iso, { withTime, fallback: '' })
  if (txt) return txt
  return String(iso).slice(0, 16).replace('T', ' ')
}

/** Solo fecha (desde timestamp UTC) en Colombia. */
export function fmtFechaAlmacenCorta(iso) {
  if (!iso) return '—'
  const txt = fmtFechaAlmacen(iso, { withTime: false })
  return txt || '—'
}

/** Campo date (YYYY-MM-DD) sin componente horario. */
export function fmtFechaAlmacenSolo(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Valor inicial para input type="date" en hora Colombia. */
export function todayDateInputColombia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ALMACEN_TIMEZONE })
}

/** Valor inicial para input type="datetime-local" en hora Colombia. */
export function nowDatetimeLocalColombia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALMACEN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Convierte datetime-local (Colombia) a ISO UTC para la API. */
export function datetimeLocalColombiaToIsoUtc(localStr) {
  if (!localStr) return null
  const m = String(localStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  // Colombia = UTC-5 (sin horario de verano)
  return new Date(Date.UTC(y, mo - 1, d, h + 5, mi, 0)).toISOString()
}

/** Convierte ISO UTC de API a valor datetime-local en Colombia. */
export function isoUtcToDatetimeLocalColombia(iso) {
  const d = parseIsoAlmacen(iso)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALMACEN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
