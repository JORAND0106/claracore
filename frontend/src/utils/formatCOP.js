/**
 * Formato monetario ClaraCore: COP sin decimales (evita centavos en UI y totales).
 * ICU a veces fuerza 2 decimales en COP si no se fijan minimumFractionDigits y maximumFractionDigits.
 */
export function formatCOP(n) {
  if (n == null || n === '') return '—'
  const x = Math.round(Number(n))
  if (Number.isNaN(x)) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(x)
}

/** Eje / leyendas: $76M, $15B, sin fracciones decimales. */
export function formatCOPShort(n) {
  if (n == null || n === '') return '—'
  const v = Math.round(Number(n))
  if (Number.isNaN(v)) return '—'
  if (v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  let body
  if (abs >= 1e9) body = `${Math.round(abs / 1e9)}B`
  else if (abs >= 1e6) body = `${Math.round(abs / 1e6)}M`
  else if (abs >= 1e3) body = `${Math.round(abs / 1e3)}K`
  else body = String(abs)
  return `${sign}$${body}`
}
