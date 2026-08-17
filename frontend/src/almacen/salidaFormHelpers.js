/**
 * Helpers de presentación / saldo del formulario de salida.
 */

/** Escapa texto para usar en RegExp. */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Separa código y descripción sin duplicar el código cuando
 * ``material_descripcion`` ya viene como "CC-1614-003 — Acero…".
 */
export function splitInsumoCodigoDescripcion(codigo, descripcion) {
  const cod = String(codigo || '').trim()
  let desc = String(descripcion || '').trim()
  if (cod && desc) {
    const re = new RegExp(`^${escapeRegExp(cod)}\\s*[·\\-—:\\|]+\\s*`, 'i')
    const stripped = desc.replace(re, '').trim()
    if (stripped && stripped.toLowerCase() !== desc.toLowerCase()) {
      desc = stripped
    } else if (desc.toLowerCase() === cod.toLowerCase()) {
      desc = ''
    }
  }
  return {
    codigo: cod || null,
    descripcion: desc || (cod ? '' : '—'),
  }
}

export function disponibleEntradaItem(recibida, despachada) {
  return Math.max(0, Math.round((Number(recibida) - Number(despachada)) * 10000) / 10000)
}

export function cantidadExcedeSaldo(cantidad, disponible) {
  const n = Number(String(cantidad).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return true
  return n > Number(disponible) + 1e-9
}

export function saldoTrasDespacho(disponible, cantidad) {
  const n = Number(String(cantidad).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > Number(disponible) + 1e-9) return null
  return Math.max(0, Number(disponible) - n)
}

/** Mensaje de exceso de cantidad vs disponible. */
export function mensajeExcesoCantidadDespachar(cantidad, disponible, unidad = '') {
  const und = unidad ? ` ${unidad}` : ''
  const n = Number(String(cantidad).replace(',', '.'))
  const disp = Number(disponible)
  const fmt = (v) => {
    const x = Number(v)
    if (!Number.isFinite(x)) return '—'
    return x.toLocaleString('es-CO', { maximumFractionDigits: 4 })
  }
  return (
    `La cantidad a despachar (${fmt(n)}${und}) supera el disponible para salida `
    + `(${fmt(disp)}${und}). Máximo permitido: ${fmt(disp)}${und}.`
  )
}

export function labelSaldoDespues(disponible, cantidad, unidad = 'KG') {
  const saldo = saldoTrasDespacho(disponible, cantidad)
  const valor = saldo == null
    ? '—'
    : `${saldo.toLocaleString('es-CO', { maximumFractionDigits: 4 })} ${unidad}`
  return `Saldo después de esta salida: ${valor}`
}
