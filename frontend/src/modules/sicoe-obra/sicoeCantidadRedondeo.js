/**
 * Redondeo dinámico de cantidad_total (SICOE Obra).
 * Regla: si ROUND(exacto, 2) >= 0.10 → 2 decimales; si no → 3 decimales.
 * costo_directo no se toca aquí (sigue a 0 decimales en el llamador).
 */

function _isEmpty(v) {
  return v === '' || v === null || v === undefined
}

function _toFactor(v) {
  if (_isEmpty(v)) return 1
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

/** Aplica la regla de redondeo dinámico a un producto ya calculado. */
export function redondearCantidadTotalDinamico(valorExacto) {
  const exact = Number(valorExacto)
  if (!Number.isFinite(exact)) return 0
  const r2 = Math.round(exact * 100) / 100
  if (r2 >= 0.1) return r2
  return Math.round(exact * 1000) / 1000
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
  const r2 = Math.round(n * 100) / 100
  return r2 >= 0.1 ? 2 : 3
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
