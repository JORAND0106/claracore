/** Utilidades de formato compartidas — Programación de obra */

export function fmtDateIso(s) {
  if (s == null || s === '') return ''
  const str = String(s).trim()
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function parseIsoDate(s) {
  if (!s) return null
  const x = String(s).slice(0, 10)
  const [y, m, d] = x.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function fmtDateHuman(iso) {
  const d = parseIsoDate(iso)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtCOP(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `$ ${v.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

export function fmtCant(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

export function addCalendarDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

export function eachCalendarDay(fromDate, toDate) {
  const out = []
  let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())
  while (d <= end) {
    out.push(new Date(d))
    d = addCalendarDays(d, 1)
  }
  return out
}

export function isoFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isWeekendDate(d) {
  const w = d.getDay()
  return w === 0 || w === 6
}

/** Días hábiles inclusive entre dos fechas (ISO), usando fines de semana + set de no hábiles. */
export function countDiasHabilesEnRango(fechaInicioIso, fechaFinIso, noHabilesSet = new Set()) {
  const fi = parseIsoDate(fechaInicioIso)
  const ff = parseIsoDate(fechaFinIso)
  if (!fi || !ff || ff < fi) return 0
  let n = 0
  for (const d of eachCalendarDay(fi, ff)) {
    if (!isWeekendDate(d) && !noHabilesSet.has(isoFromDate(d))) n += 1
  }
  return n
}
