/**
 * Helpers puros para la pestaña Resumen del Excel de presupuesto.
 *
 * Congruencia de Costo directo:
 * - Plataforma: Σ costo_directo por registro (ya redondeado por fila).
 * - Backend export (resumen[]): agrupa por (capítulo, ítem) con costo_directo = Σ CD.
 * - Excel debe usar ese costo_directo agregado, NO recalcular ROUND(vlr × Σcant),
 *   porque Σ round(cant_i × vlr_i) ≠ round(round(vlr) × Σ cant_i).
 */

/**
 * Costo directo de una fila de resumen (mismo criterio que la plataforma).
 * @param {{ costo_directo?: unknown }} row
 * @returns {number}
 */
export function costoDirectoResumenFila(row) {
  return Math.round(Number(row?.costo_directo) || 0)
}

/**
 * Cálculo incorrecto histórico del Excel: ROUND(Math.round(vlr) × cantidad, 0).
 * Se mantiene solo para tests de regresión / diagnóstico.
 * @param {{ vlr_unitario?: unknown, cantidad?: unknown }} row
 * @returns {number}
 */
export function costoDirectoResumenFilaRecalcLegacy(row) {
  const e = Math.round(Number(row?.vlr_unitario) || 0)
  const f = Number(row?.cantidad) || 0
  return Math.round(e * f)
}

/**
 * Agrupa filas de resumen (ya ordenadas por capítulo) e inserta subtotales.
 *
 * @param {Array<Record<string, unknown>>} resumen
 * @returns {Array<
 *   | { tipo: 'item', row: Record<string, unknown> }
 *   | { tipo: 'subtotal', capitulo: string, items: Array<Record<string, unknown>>, costoDirecto: number }
 * >}
 */
export function planFilasResumenConSubtotales(resumen) {
  const list = Array.isArray(resumen) ? resumen : []
  const out = []
  let capActual = null
  let itemsCap = []

  const flush = () => {
    if (capActual == null || !itemsCap.length) return
    out.push({
      tipo: 'subtotal',
      capitulo: capActual,
      items: itemsCap,
      costoDirecto: itemsCap.reduce((s, r) => s + costoDirectoResumenFila(r), 0),
    })
    itemsCap = []
  }

  for (const row of list) {
    const cap = String(row?.capitulo ?? '').trim()
    if (capActual != null && cap !== capActual) flush()
    capActual = cap
    itemsCap.push(row)
    out.push({ tipo: 'item', row })
  }
  flush()
  return out
}

/**
 * Total general = suma de subtotales de capítulo (por construcción).
 * @param {ReturnType<typeof planFilasResumenConSubtotales>} plan
 * @returns {{ costoDirecto: number, porCapitulo: Array<{ capitulo: string, costoDirecto: number }> }}
 */
export function totalesDesdeSubtotalesCapitulo(plan) {
  const porCapitulo = []
  let costoDirecto = 0
  for (const p of plan || []) {
    if (p.tipo !== 'subtotal') continue
    porCapitulo.push({ capitulo: p.capitulo, costoDirecto: p.costoDirecto })
    costoDirecto += p.costoDirecto
  }
  return { costoDirecto, porCapitulo }
}

/**
 * Formula Excel SUM sobre filas no necesariamente contiguas.
 * @param {string} colLetter
 * @param {number[]} rowNums
 * @returns {string}
 */
export function formulaSumaFilas(colLetter, rowNums) {
  const rows = (Array.isArray(rowNums) ? rowNums : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  if (!rows.length) return '0'
  if (rows.length === 1) return `${colLetter}${rows[0]}`
  let contiguous = true
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i] !== rows[i - 1] + 1) {
      contiguous = false
      break
    }
  }
  if (contiguous) {
    return `SUM(${colLetter}${rows[0]}:${colLetter}${rows[rows.length - 1]})`
  }
  return `SUM(${rows.map((r) => `${colLetter}${r}`).join(',')})`
}
