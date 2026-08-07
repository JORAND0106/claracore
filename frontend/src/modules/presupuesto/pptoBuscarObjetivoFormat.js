/**
 * Formato COP en vivo para el campo Presupuesto objetivo (solo enteros).
 */

/** Extrae dígitos (opcional signo) del texto tecleado. */
export function digitosObjetivoCop(raw) {
  const s = String(raw ?? '')
  const neg = s.trimStart().startsWith('-')
  const digits = s.replace(/\D/g, '')
  if (!digits) return neg ? '-' : ''
  // Evitar ceros a la izquierda salvo "0"
  const norm = digits.replace(/^0+(?=\d)/, '')
  return neg ? `-${norm}` : norm
}

/**
 * Formatea dígitos como moneda es-CO sin decimales: "$ 20.000.000".
 * Cadena vacía o solo "-" → "".
 */
export function formatObjetivoCopDisplay(raw) {
  const digits = digitosObjetivoCop(raw)
  if (!digits || digits === '-') return digits === '-' ? '-' : ''
  const neg = digits.startsWith('-')
  const abs = digits.replace(/^-/, '')
  if (!abs) return neg ? '-' : ''
  const n = Number(abs)
  if (!Number.isFinite(n)) return ''
  const body = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
  return `${neg ? '-' : ''}$ ${body}`
}

/** Valor numérico entero (COP) para el cálculo; NaN si vacío/inválido. */
export function parseObjetivoCopNumber(raw) {
  const digits = digitosObjetivoCop(raw)
  if (!digits || digits === '-') return NaN
  const n = Number(digits)
  return Number.isFinite(n) ? Math.round(n) : NaN
}
