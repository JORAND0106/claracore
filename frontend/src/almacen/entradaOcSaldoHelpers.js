/**
 * Saldo de OC en captura: progreso, saldo resultante y alertas de agotamiento.
 * Tolerancia de consumido: 0.0001 (alineada con el servidor).
 */

export const TOLERANCIA_SALDO_OC = 0.0001

export const DEFAULT_UMBRAL_AMARILLO = 20
export const DEFAULT_UMBRAL_ROJO = 5

export function esInsumoConsumido(saldoCantidad, tolerancia = TOLERANCIA_SALDO_OC) {
  const s = Number(saldoCantidad)
  if (!Number.isFinite(s)) return true
  return s <= tolerancia
}

export function saldoResultante(saldoActual, cantidadEntrada) {
  const saldo = Number(saldoActual) || 0
  const cant = Number(cantidadEntrada) || 0
  return Math.max(0, Math.round((saldo - cant) * 10000) / 10000)
}

/** % restante respecto a lo pedido en la OC (cantidad). */
export function porcentajeSaldoOcRestante(saldoRestante, cantidadPedida) {
  const pedida = Number(cantidadPedida) || 0
  if (pedida <= TOLERANCIA_SALDO_OC) return 0
  const rest = Math.max(0, Number(saldoRestante) || 0)
  return Math.round((rest / pedida) * 10000) / 100
}

/**
 * @returns {'rojo'|'amarillo'|'normal'}
 */
export function alertaAgotamientoOc(saldoRestante, cantidadPedida, {
  amarilloPct = DEFAULT_UMBRAL_AMARILLO,
  rojoPct = DEFAULT_UMBRAL_ROJO,
} = {}) {
  const pct = porcentajeSaldoOcRestante(saldoRestante, cantidadPedida)
  const rest = Number(saldoRestante) || 0
  if (rest <= TOLERANCIA_SALDO_OC || pct <= Number(rojoPct)) return 'rojo'
  if (pct <= Number(amarilloPct)) return 'amarillo'
  return 'normal'
}

export function mensajeAlertaAgotamiento(nivel, saldoRestante, cantidadPedida, unidad = '') {
  const und = unidad ? ` ${unidad}` : ''
  const rest = Number(saldoRestante) || 0
  const pedida = Number(cantidadPedida) || 0
  if (nivel === 'rojo') {
    if (rest <= TOLERANCIA_SALDO_OC) {
      return 'OC por consumirse · haga una nueva solicitud'
    }
    return `OC por consumirse · quedan ${fmt2(rest)} de ${fmt2(pedida)}${und} · haga una nueva solicitud`
  }
  if (nivel === 'amarillo') {
    return `Quedan ${fmt2(rest)} de ${fmt2(pedida)}${und} · se está acabando la OC`
  }
  return ''
}

function fmt2(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  return x.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function textoSaldoProgreso(saldo, cantidadPedida, unidad = '') {
  const s = Number(saldo) || 0
  const p = Number(cantidadPedida) || 0
  const und = unidad ? ` ${unidad}` : ''
  if (p > TOLERANCIA_SALDO_OC) {
    const recibido = Math.max(0, p - s)
    return `${fmt2(s)} · ${fmt2(recibido)} de ${fmt2(p)}${und}`
  }
  return `${fmt2(s)}${und}`
}

/** Fingerprint estable de OC + líneas (oci + cantidad) para soft-duplicado. */
export function fingerprintEntradaOcItems(ordenCompraId, items) {
  const oid = Number(ordenCompraId) || 0
  const parts = (Array.isArray(items) ? items : [])
    .map((it) => {
      const oci = Number(it.orden_compra_item_id) || 0
      const cant = Math.round((Number(it.cantidad_recibida) || 0) * 10000) / 10000
      return `${oci}:${cant}`
    })
    .filter((x) => !x.startsWith('0:'))
    .sort()
  return `${oid}|${parts.join(',')}`
}
