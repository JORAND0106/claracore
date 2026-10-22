/** Dinero de Almacén: se calcula exacto y al mostrar se corta el decimal. */

export function truncarDinero(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Math.trunc(v)
}

/** Un valor entre 0 y 1 peso (o negativo equivalente) se ve como $0. */
export function unitarioSeVeEnCero(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return false
  return Math.trunc(v) === 0
}

export function fmtDinero(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '—'
  const t = Math.trunc(v)
  const signo = t < 0 ? '-' : ''
  const abs = Math.abs(t).toLocaleString('es-CO')
  return `${signo}$\u00a0${abs}`
}
