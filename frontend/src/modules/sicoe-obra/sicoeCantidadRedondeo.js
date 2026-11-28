/**
 * Redondeo de Cant. Total (SICOE Obra) — regla única de plataforma.
 *
 * - Si el resultado (tras round a 2 dp) es entero → sin decimales (p. ej. 24).
 * - Si no → 2 decimales.
 * - Si el resultado exacto es < 0,01 y round a 2 quedaría 0 → se conservan
 *   los decimales necesarios para que no quede en cero.
 *
 * Aplica al resultado (cantidad_total). Datos de entrada (p. ej. peso varilla
 * a 3 dp) conservan sus propios decimales.
 */

function _isEmpty(v) {
  return v === '' || v === null || v === undefined
}

function _toFactor(v) {
  if (_isEmpty(v)) return 1
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

function _roundN(exact, dec) {
  const f = 10 ** dec
  return Math.round(exact * f) / f
}

/** Máximo de decimales persistidos en longitud/ancho/espesor/cantidad. */
export const SICOE_DIM_DECIMALES = 3

/** Redondea un factor dimensional a 3 decimales (null si vacío/inválido). */
export function redondearDimension(valor) {
  if (_isEmpty(valor)) return null
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 1000) / 1000
}

/** Visualización de dimensión (hasta 3 decimales, sin forzar ceros). */
export function formatearDimension(valor, opts = {}) {
  const empty = opts.empty !== undefined ? opts.empty : '—'
  if (_isEmpty(valor)) return empty
  const n = redondearDimension(valor)
  if (n == null) return String(valor)
  if (opts.locale === false) {
    return String(n)
  }
  try {
    return n.toLocaleString('es-CO', {
      maximumFractionDigits: SICOE_DIM_DECIMALES,
    })
  } catch {
    return String(n)
  }
}

/**
 * Aplica la regla única a un producto ya calculado.
 * @returns {number}
 */
export function redondearCantidadTotalDinamico(valorExacto) {
  const exact = Number(valorExacto)
  if (!Number.isFinite(exact)) return 0
  if (exact === 0) return 0

  const abs = Math.abs(exact)
  const r2 = _roundN(exact, 2)

  if (abs < 0.01) {
    if (r2 !== 0) return r2
    for (let d = 3; d <= 12; d += 1) {
      const rd = _roundN(exact, d)
      if (rd !== 0) return rd
    }
    return exact
  }

  if (Number.isInteger(r2) || Math.abs(r2 - Math.round(r2)) < 1e-9) {
    return Math.round(r2)
  }
  return r2
}

/**
 * Producto longitud × ancho × espesor [× cantidad], con factores vacíos = 1.
 * Si todos vacíos → 0.
 */
export function calcularCantidadConRedondeo(longitud, ancho, espesor, cantidad) {
  if (
    _isEmpty(longitud)
    && _isEmpty(ancho)
    && _isEmpty(espesor)
    && _isEmpty(cantidad)
  ) {
    return 0
  }
  const lv = _toFactor(longitud)
  const av = _toFactor(ancho)
  const ev = _toFactor(espesor)
  const cv = _toFactor(cantidad)
  if ([lv, av, ev, cv].some((n) => Number.isNaN(n))) return 0
  return redondearCantidadTotalDinamico(lv * av * ev * cv)
}

/** Decimales a mostrar para un cantidad_total ya persistido. */
export function decimalesCantidadTotal(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return 2
  if (n === 0) return 0
  const abs = Math.abs(n)
  if (abs < 0.01) {
    for (let d = 2; d <= 12; d += 1) {
      if (_roundN(n, d) !== 0) return d
    }
    return 12
  }
  const r2 = _roundN(n, 2)
  if (Number.isInteger(r2) || Math.abs(r2 - Math.round(r2)) < 1e-9) return 0
  return 2
}

/**
 * Formato de visualización (reportes / UI).
 * @param {object} [opts]
 * @param {string} [opts.empty='—']
 * @param {boolean} [opts.locale=true] usar es-CO
 */
export function formatearCantidadTotal(valor, opts = {}) {
  const empty = opts.empty !== undefined ? opts.empty : '—'
  if (valor == null || valor === '') return empty
  const n = Number(valor)
  if (!Number.isFinite(n)) return String(valor)
  const dec = decimalesCantidadTotal(n)
  if (opts.locale === false) {
    return n.toFixed(dec)
  }
  try {
    return n.toLocaleString('es-CO', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })
  } catch {
    return n.toFixed(dec)
  }
}
