/**
 * Bitácora por día (hora Colombia) + semanario.
 * Una sola fecha automática por día calendario; se inserta solo al escribir
 * en un día distinto al de la última fecha. TipTap puede despojar atributos:
 * se reetiquetan y deduplican por texto / data-bloc-day.
 */

const TZ = 'America/Bogota'
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const LONG_DATE_RE = new RegExp(
  `^\\s*(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})\\s+de\\s+(\\d{4})\\s*$`,
  'i',
)

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

/** Texto «07 de noviembre de 2026» → YYYY-MM-DD (o null). */
export function parseLongDateLabelToKey(label) {
  const m = String(label || '').replace(/\u00a0/g, ' ').trim().match(LONG_DATE_RE)
  if (!m) return null
  const day = Number(m[1])
  const monthName = m[2].toLowerCase()
  const year = Number(m[3])
  const mi = MONTHS.indexOf(monthName)
  if (mi < 0 || day < 1 || day > 31 || year < 2000) return null
  return `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function dayMarkerHtml(dateKey, label = formatColombiaLongDateFromKey(dateKey)) {
  const safeKey = String(dateKey || '').replace(/"/g, '')
  const safeLabel = String(label || '').replace(/</g, '')
  return `<p class="bloc-day-marker" data-bloc-day="${safeKey}" contenteditable="false"><strong>${safeLabel}</strong></p>`
}

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Claves de día presentes (data-bloc-day y/o párrafos que son solo la fecha larga).
 * Conserva el orden de aparición; sin duplicados.
 */
export function extractDayKeysFromHtml(html) {
  const keys = []
  const seen = new Set()
  const push = (k) => {
    if (!k || seen.has(k)) return
    seen.add(k)
    keys.push(k)
  }
  const reAttr = /data-bloc-day="([^"]+)"/g
  let m
  while ((m = reAttr.exec(String(html || '')))) push(m[1])

  const reP = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi
  let pm
  while ((pm = reP.exec(String(html || '')))) {
    const attrs = pm[1] || ''
    const attrKey = /data-bloc-day="([^"]+)"/.exec(attrs)?.[1]
    if (attrKey) {
      push(attrKey)
      continue
    }
    const textKey = parseLongDateLabelToKey(stripTags(pm[2]))
    if (textKey) push(textKey)
  }
  return keys
}

/**
 * Reetiqueta marcadores (atributo o texto de fecha) y elimina fechas repetidas
 * del mismo día: queda la primera; el contenido no-marcador se conserva en orden.
 */
export function dedupeDiaryDaysInHtml(html) {
  const src = String(html || '')
  if (!src.trim()) return src

  const reP = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi
  const parts = []
  let last = 0
  let match
  const seenDays = new Set()

  while ((match = reP.exec(src))) {
    if (match.index > last) {
      parts.push(src.slice(last, match.index))
    }
    const full = match[0]
    const attrs = match[1] || ''
    const inner = match[2]
    const attrKey = /data-bloc-day="([^"]+)"/.exec(attrs)?.[1] || null
    const textKey = parseLongDateLabelToKey(stripTags(inner))
    const dateKey = attrKey || textKey

    // Párrafo que es (solo) un marcador de día
    const isMarker = Boolean(
      dateKey
      && (
        /bloc-day-marker/.test(attrs)
        || attrKey
        || (textKey && stripTags(inner).length <= 48)
      ),
    )

    if (isMarker && dateKey) {
      if (seenDays.has(dateKey)) {
        // Fecha repetida del mismo día → se omite
        last = match.index + full.length
        continue
      }
      seenDays.add(dateKey)
      parts.push(dayMarkerHtml(dateKey, formatColombiaLongDateFromKey(dateKey)))
    } else {
      parts.push(full)
    }
    last = match.index + full.length
  }
  if (last < src.length) parts.push(src.slice(last))
  return parts.join('')
}

/**
 * Tras escribir: deduplica y, si el día de hoy aún no tiene fecha en la nota,
 * inserta una sola vez la fecha del nuevo día al final.
 * Abrir sin escribir no llama a esta función (solo onChange).
 *
 * `knownDays` se ignora a propósito: restaurar días borrados al final
 * duplicaba fechas cuando TipTap despojaba data-bloc-day.
 */
export function ensureDiaryDayInHtml(html, {
  now = new Date(),
  insertToday = true,
} = {}) {
  const today = colombiaDateKey(now)
  let out = dedupeDiaryDaysInHtml(html)
  const present = extractDayKeysFromHtml(out)

  if (insertToday && today && !present.includes(today)) {
    out = `${out}${dayMarkerHtml(today, formatColombiaLongDate(now))}`
  }

  if (!/<p(?![^>]*bloc-day-marker)[^>]*>\s*(<br\s*\/?>)?\s*<\/p>\s*$/i.test(out)) {
    // Tras un marcador nuevo o contenido sin párrafo editable final
    if (insertToday && today && !present.includes(today)) {
      out = `${out}<p></p>`
    } else if (!out.trim()) {
      out = '<p></p>'
    }
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
 * Deduplica por dateKey (queda la primera).
 */
export function dedupeHandDayMarks(dayMarks) {
  const marks = Array.isArray(dayMarks) ? dayMarks : []
  const seen = new Set()
  const out = []
  for (const m of marks) {
    const k = String(m?.dateKey || '')
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(m)
  }
  return out
}

export function ensureHandDayMark(dayMarks, strokes, now = new Date()) {
  const today = colombiaDateKey(now)
  const marks = dedupeHandDayMarks(dayMarks)
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
