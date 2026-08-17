/**
 * Helpers compartidos para filtros cliente de Almacén.
 */

export function normTxt(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function includesTxt(haystack, needle) {
  const n = normTxt(needle)
  if (!n) return true
  return normTxt(haystack).includes(n)
}

/** Extrae YYYY-MM-DD de un ISO (o fecha) para comparar con inputs type=date. */
export function dateKeyFromIso(iso) {
  if (!iso) return ''
  const s = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  try {
    const utc = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`
    const d = new Date(utc)
    if (Number.isNaN(d.getTime())) return ''
    // America/Bogota ≈ UTC-5 sin DST
    const bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
    const y = bogota.getUTCFullYear()
    const m = String(bogota.getUTCMonth() + 1).padStart(2, '0')
    const day = String(bogota.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}

export function inDateRange(iso, desde, hasta) {
  const key = dateKeyFromIso(iso)
  if (!key) {
    if (desde || hasta) return false
    return true
  }
  if (desde && key < desde) return false
  if (hasta && key > hasta) return false
  return true
}

export function countActiveFilters(filtros, empty) {
  if (!filtros) return 0
  let n = 0
  for (const [k, emptyVal] of Object.entries(empty)) {
    const v = filtros[k]
    if (v == null || v === '') continue
    if (typeof emptyVal === 'string' && String(v).trim() === '') continue
    if (v !== emptyVal) n += 1
  }
  return n
}
