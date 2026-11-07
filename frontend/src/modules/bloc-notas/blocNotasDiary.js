/**
 * Bitácora por día (hora Colombia) + semanario.
 * Fechas automáticas no editables por el usuario.
 */

const TZ = 'America/Bogota'
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** YYYY-MM-DD en America/Bogota */
export function colombiaDateKey(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const day = parts.find((p) => p.type === 'day')?.value
    return `${y}-${m}-${day}`
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** «07 de noviembre de 2026» */
export function formatColombiaLongDate(isoOrDate = new Date()) {
  const key = colombiaDateKey(isoOrDate)
  if (!key) return ''
  const [y, m, day] = key.split('-').map(Number)
  return `${String(day).padStart(2, '0')} de ${MONTHS[m - 1]} de ${y}`
}

/** DD/MM */
export function formatColombiaShortDay(isoOrDate = new Date()) {
  const key = colombiaDateKey(isoOrDate)
  if (!key) return ''
  const [, m, day] = key.split('-')
  return `${day}/${m}`
}

export function formatColombiaLongDateFromKey(dateKey) {
  const [y, m, day] = String(dateKey || '').split('-').map(Number)
  if (!y || !m || !day) return ''
  return `${String(day).padStart(2, '0')} de ${MONTHS[m - 1]} de ${y}`
}

export function dayMarkerHtml(dateKey, label = formatColombiaLongDateFromKey(dateKey)) {
  const safeKey = String(dateKey || '').replace(/"/g, '')
  const safeLabel = String(label || '').replace(/</g, '')
  return `<p class="bloc-day-marker" data-bloc-day="${safeKey}" contenteditable="false"><strong>${safeLabel}</strong></p>`
}

export function extractDayKeysFromHtml(html) {
  const keys = []
  const re = /data-bloc-day="([^"]+)"/g
  let m
  while ((m = re.exec(String(html || '')))) {
    if (m[1] && !keys.includes(m[1])) keys.push(m[1])
  }
  return keys
}

/**
 * Garantiza el encabezado del día de hoy al final si aún no existe.
 * Restaura marcadores conocidos si el usuario los borró.
 */
export function ensureDiaryDayInHtml(html, {
  now = new Date(),
  knownDays = null,
} = {}) {
  const today = colombiaDateKey(now)
  const label = formatColombiaLongDate(now)
  let out = String(html || '')
  const present = extractDayKeysFromHtml(out)
  const wanted = Array.isArray(knownDays) && knownDays.length
    ? [...knownDays]
    : [...present]
  if (!wanted.includes(today)) wanted.push(today)

  for (const key of wanted) {
    if (extractDayKeysFromHtml(out).includes(key)) continue
    const lab = key === today ? label : formatColombiaLongDateFromKey(key)
    out = `${out}${dayMarkerHtml(key, lab)}`
  }
  // Si hoy no estaba, ya se agregó; asegurar un párrafo editable al final
  if (!/<p(?![^>]*bloc-day-marker)[^>]*>\s*(<br\s*\/?>)?\s*<\/p>\s*$/i.test(out)) {
    out = `${out}<p></p>`
  }
  return out
}

export function initialDiaryHtml(now = new Date()) {
  const key = colombiaDateKey(now)
  return `${dayMarkerHtml(key, formatColombiaLongDate(now))}<p></p>`
}

/** Lunes 00:00 Colombia de la semana que contiene `date`. */
export function mondayOfWeek(isoOrDate = new Date()) {
  const key = colombiaDateKey(isoOrDate)
  const [y, m, d] = key.split('-').map(Number)
  // Mediodía UTC-5 approx
  const utc = new Date(Date.UTC(y, m - 1, d, 17, 0, 0))
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(utc)
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const offset = map[wd] ?? 0
  const monday = new Date(utc)
  monday.setUTCDate(monday.getUTCDate() - offset)
  return monday
}

export function shiftWeek(mondayDate, weeks) {
  const d = new Date(mondayDate)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d
}

/** Filas de encabezado Lunes DD/MM … Domingo DD/MM */
export function weekDayHeaders(mondayDate) {
  const headers = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate)
    d.setUTCDate(d.getUTCDate() + i)
    headers.push(`${WEEKDAYS[i]} ${formatColombiaShortDay(d)}`)
  }
  return headers
}

/** HTML TipTap tabla 7 columnas con encabezados de la semana + 1 fila vacía */
export function buildSemanarioTableHtml(mondayDate) {
  const headers = weekDayHeaders(mondayDate)
  const th = headers.map((h) => `<th colspan="1" rowspan="1"><p>${h}</p></th>`).join('')
  const td = headers.map(() => `<td colspan="1" rowspan="1"><p></p></td>`).join('')
  return [
    '<table class="tema-rich-table"><tbody>',
    `<tr>${th}</tr>`,
    `<tr>${td}</tr>`,
    '</tbody></table>',
    '<p></p>',
  ].join('')
}

/**
 * Marcas de día para escritura a mano.
 * Si el último día registrado ≠ hoy, agrega una marca en Y.
 */
export function ensureHandDayMark(dayMarks, strokes, now = new Date()) {
  const today = colombiaDateKey(now)
  const marks = Array.isArray(dayMarks) ? [...dayMarks] : []
  if (marks.some((m) => m.dateKey === today)) return marks
  let y = 40
  for (const m of marks) {
    if (Number(m.y) >= y) y = Number(m.y) + 36
  }
  for (const s of strokes || []) {
    for (const p of s.points || []) {
      if (Number(p.y) + 40 > y) y = Number(p.y) + 40
    }
  }
  marks.push({
    dateKey: today,
    label: formatColombiaLongDate(now),
    y,
  })
  return marks
}

export const HAND_GUIDES = ['none', 'dots', 'lines', 'grid', 'rail']
