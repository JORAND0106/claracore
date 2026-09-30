/**
 * Reparto proporcional de cantidad entre registros de presupuesto (por saldo).
 */

export function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Redondeo a 4 decimales (misma precisión que cantidad en BD). */
export function roundCant(v, digits = 4) {
  const f = 10 ** digits
  return Math.round((toNum(v) + Number.EPSILON) * f) / f
}

/**
 * Reparte `cantidad` entre registros con peso = saldo_disponible (> 0).
 * El último tramo absorbe el residuo para que la suma sea exacta.
 *
 * @param {number|string} cantidad
 * @param {Array<{ presupuesto_id: number|string, saldo_disponible?: number }>} registros
 * @returns {Array<{ presupuesto_id: number, cantidad: number, saldo_disponible: number, peso: number }>}
 */
export function repartirCantidadProporcional(cantidad, registros) {
  const cant = toNum(cantidad)
  const rows = (registros || [])
    .map((r) => ({
      presupuesto_id: Number(r.presupuesto_id),
      saldo_disponible: Math.max(0, toNum(r.saldo_disponible)),
    }))
    .filter((r) => Number.isFinite(r.presupuesto_id) && r.presupuesto_id > 0)

  if (!rows.length || cant <= 0) return []

  const totalSaldo = rows.reduce((a, r) => a + r.saldo_disponible, 0)
  if (totalSaldo <= 0) {
    // Sin saldo positivo: reparte en partes iguales (último absorbe residuo).
    const n = rows.length
    let rest = cant
    return rows.map((r, i) => {
      const share = i === n - 1 ? roundCant(rest) : roundCant(cant / n)
      rest = roundCant(rest - share)
      return {
        presupuesto_id: r.presupuesto_id,
        cantidad: share,
        saldo_disponible: r.saldo_disponible,
        peso: 1 / n,
      }
    })
  }

  let rest = cant
  const n = rows.length
  return rows.map((r, i) => {
    const peso = r.saldo_disponible / totalSaldo
    const share = i === n - 1 ? roundCant(rest) : roundCant(cant * peso)
    rest = roundCant(rest - share)
    return {
      presupuesto_id: r.presupuesto_id,
      cantidad: share,
      saldo_disponible: r.saldo_disponible,
      peso,
    }
  })
}

/** Suma de saldos disponibles de los registros dados. */
export function totalSaldoRegistros(registros) {
  return roundCant(
    (registros || []).reduce((a, r) => a + Math.max(0, toNum(r.saldo_disponible)), 0),
  )
}

/** Normaliza lista de ids de presupuesto. */
export function normalizePresupuestoIds(ids, fallbackId = null) {
  const out = []
  const seen = new Set()
  for (const raw of ids || []) {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  if (!out.length && fallbackId != null) {
    const n = Number(fallbackId)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}
