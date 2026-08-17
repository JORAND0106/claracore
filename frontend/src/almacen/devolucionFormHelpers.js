/**
 * Helpers de devolución (cantidad pendiente / tope).
 */

export function pendienteDevolver(cantidadSalida, cantidadDevuelta) {
  const desp = Number(cantidadSalida) || 0
  const dev = Number(cantidadDevuelta) || 0
  return Math.max(0, Math.round((desp - dev) * 10000) / 10000)
}

export function cantidadExcedePendiente(cantidad, pendiente) {
  const n = Number(String(cantidad).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return true
  return n > Number(pendiente) + 1e-9
}

export function mensajeExcesoDevolucion(cantidad, pendiente, unidad = '') {
  const und = unidad ? ` ${unidad}` : ''
  const fmt = (v) => {
    const x = Number(v)
    if (!Number.isFinite(x)) return '—'
    return x.toLocaleString('es-CO', { maximumFractionDigits: 4 })
  }
  const n = Number(String(cantidad).replace(',', '.'))
  return (
    `La cantidad a devolver (${fmt(n)}${und}) supera el pendiente de la salida `
    + `(${fmt(pendiente)}${und}). Máximo permitido: ${fmt(pendiente)}${und}.`
  )
}
