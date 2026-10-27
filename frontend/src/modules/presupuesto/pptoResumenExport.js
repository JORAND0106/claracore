/**
 * Helpers puros para la pestaña Resumen del Excel de presupuesto.
 *
 * Costo directo en Excel (diseño original restaurado):
 * - Cada fila de ítem escribe la fórmula visible ROUND(VU×Cantidad, 0).
 * - Cantidad enlaza al TOTAL CANT. de la hoja de memoria del ítem (si existe).
 * - Subtotales / totales del informe = SUM de esas celdas formuladas.
 *
 * Nota: ROUND(VU×Σcant) puede diferir del Σ costo_directo de la plataforma
 * (redondeo por registro). El informe Excel prioriza trazabilidad formulada.
 *
 * Desglose por competencia (funcional, no solo etiqueta):
 * - Si el capítulo tiene ≥2 competencias (o ≥1 nombrada), el plan emite por cada
 *   competencia: cabecera COMPETENCIA · … y luego solo los ítems de esa competencia
 *   (cantidades/costos no consolidados entre ESP/IDU). Luego SUBTOTAL de capítulo.
 */

import {
  compararCompetenciaAsc,
  debeMostrarDesgloseCompetencia,
  etiquetaCompetencia,
  indexCompetenciasPorCapitulo,
  normalizarCompetenciaKey,
} from './pptoCompetenciaExport.js'

/**
 * Costo directo agregado del backend/plataforma (Σ por registro).
 * Útil para plan de filas / diagnósticos; el Excel escribe fórmula, no este valor.
 * @param {{ costo_directo?: unknown }} row
 * @returns {number}
 */
export function costoDirectoResumenFila(row) {
  return Math.round(Number(row?.costo_directo) || 0)
}

/**
 * Valor que produce la fórmula Excel ROUND(round(VU)×Cantidad, 0).
 * @param {{ vlr_unitario?: unknown, cantidad?: unknown }} row
 * @returns {number}
 */
export function costoDirectoResumenFilaRecalcLegacy(row) {
  const e = Math.round(Number(row?.vlr_unitario) || 0)
  const f = Number(row?.cantidad) || 0
  return Math.round(e * f)
}

/**
 * Fórmula Excel de costo directo en Resumen: ROUND(VU×Cantidad, 0).
 * Columnas fijas de plantilla: E = valor unitario, F = cantidad.
 * @param {number} rowNum
 * @returns {string}
 */
export function formulaCostoDirectoResumen(rowNum) {
  const r = Number(rowNum)
  if (!Number.isFinite(r) || r < 1) return '0'
  return `ROUND(E${r}*F${r},0)`
}

/**
 * Fórmula Excel de costo directo en memorias: ROUND(Cant×VU, 0).
 * @param {string} cantRef  p. ej. "L12"
 * @param {string} vuRef    p. ej. "$E$8" (celda fijada del VU del ítem)
 * @returns {string}
 */
export function formulaCostoDirectoCantVu(cantRef, vuRef) {
  const cant = String(cantRef || '').trim()
  const vu = String(vuRef || '').trim()
  if (!cant || !vu) return '0'
  return `ROUND(${cant}*${vu},0)`
}

/**
 * @param {Array<Record<string, unknown>>} itemsCap
 * @returns {string[]}
 */
function competenciasEnItems(itemsCap) {
  const keys = new Set()
  for (const row of itemsCap || []) {
    keys.add(normalizarCompetenciaKey(row?.competencia))
  }
  return [...keys].sort(compararCompetenciaAsc)
}

/**
 * Agrupa filas de resumen (ordenadas por capítulo) e inserta desglose real por
 * competencia + subtotal de capítulo.
 *
 * @param {Array<Record<string, unknown>>} resumen  filas con grano (cap, ítem[, competencia])
 * @param {Array<{ capitulo?: unknown, competencia?: unknown, cantidad?: unknown, costo_directo?: unknown }>} [competencias]
 * @returns {Array<
 *   | { tipo: 'item', row: Record<string, unknown>, cantidadAbsoluta: boolean }
 *   | { tipo: 'competencia', capitulo: string, competencia: string, label: string, cantidad: number, costoDirecto: number }
 *   | { tipo: 'subtotal', capitulo: string, items: Array<Record<string, unknown>>, costoDirecto: number }
 * >}
 */
export function planFilasResumenConSubtotales(resumen, competencias = []) {
  const list = Array.isArray(resumen) ? resumen : []
  const byCapRollup = indexCompetenciasPorCapitulo(competencias)
  const out = []
  let capActual = null
  let itemsCap = []

  const flush = () => {
    if (capActual == null || !itemsCap.length) return

    const compsFromItems = competenciasEnItems(itemsCap)
    const rollup = byCapRollup.get(capActual) || []
    const desglose = debeMostrarDesgloseCompetencia(
      compsFromItems.map((c) => ({ competencia: c })),
    ) || debeMostrarDesgloseCompetencia(rollup)

    if (desglose) {
      const ordenComps = compsFromItems.length
        ? compsFromItems
        : (rollup.map((c) => c.competencia) || [''])
      for (const compKey of ordenComps) {
        const itemsComp = itemsCap.filter(
          (r) => normalizarCompetenciaKey(r?.competencia) === compKey,
        )
        if (!itemsComp.length) continue
        const cant = itemsComp.reduce((s, r) => s + (Number(r?.cantidad) || 0), 0)
        const cd = itemsComp.reduce((s, r) => s + costoDirectoResumenFila(r), 0)
        out.push({
          tipo: 'competencia',
          capitulo: capActual,
          competencia: compKey,
          label: etiquetaCompetencia(compKey),
          cantidad: cant,
          costoDirecto: cd,
        })
        for (const row of itemsComp) {
          // Cantidad del ítem ya es solo de esta competencia: no usar fórmula a memoria completa.
          out.push({ tipo: 'item', row, cantidadAbsoluta: true })
        }
      }
    } else {
      for (const row of itemsCap) {
        out.push({ tipo: 'item', row, cantidadAbsoluta: false })
      }
    }

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
