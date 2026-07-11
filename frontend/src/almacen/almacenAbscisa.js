/** Convierte metros a formato K+MMM.MM (ej. K1+820.00). */
export function fmtMetrosAbscisa(metros) {
  if (metros == null || metros === '') return ''
  const m = Number(metros)
  if (!Number.isFinite(m) || m < 0) return ''
  const km = Math.floor(m / 1000)
  const rest = m - km * 1000
  const [intPart, frac = '00'] = rest.toFixed(2).split('.')
  return `K${km}+${intPart.padStart(3, '0')}.${frac}`
}

/** Parsea entrada numérica (metros) desde texto. */
export function parseAbscisaMetros(val) {
  if (val == null || val === '') return null
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const s = String(val).trim().replace(',', '.')
  const km = s.match(/^K?(\d+)\+(\d+(?:\.\d+)?)$/i)
  if (km) return parseInt(km[1], 10) * 1000 + parseFloat(km[2])
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
