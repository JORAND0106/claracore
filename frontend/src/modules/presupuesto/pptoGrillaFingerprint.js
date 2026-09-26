/**
 * Huella estable de la grilla de Presupuesto para decidir si un refresco
 * en segundo plano debe aplicar setState (cambio real) o ignorarse.
 *
 * No incluye campos puramente de UI. Orden = orden de filas en pantalla
 * (el API ordena por updated_at desc).
 */

/** Campos que el usuario ve o que cambian entre sesiones / validaciones. */
export const PPTO_GRILLA_FP_KEYS = Object.freeze([
  'id',
  'updated_at',
  'revisado',
  'pre_interv_estado',
  'sellado',
  'cant_total',
  'costo_directo',
  'vlr_unitario',
  'area_long_nod',
  'ancho',
  'espesor',
  'descripcion',
  'observacion_externa',
  'tramo',
  'calzada',
  'tipo_ejecucion',
  'item',
  'und',
  'capitulo',
  'competencia',
  'id_pol',
  'pk_id',
])

function cellFp(v) {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v)
}

/**
 * @param {object[]|null|undefined} rows
 * @param {number|null|undefined} total  total servidor (puede ser > rows.length si hay paginación)
 * @returns {string}
 */
export function pptoFingerprintGrilla(rows, total) {
  const list = Array.isArray(rows) ? rows : []
  const n = typeof total === 'number' && Number.isFinite(total) ? total : list.length
  const parts = [`t:${n}`, `n:${list.length}`]
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i]
    if (!r || typeof r !== 'object') {
      parts.push('|')
      continue
    }
    let row = ''
    for (let k = 0; k < PPTO_GRILLA_FP_KEYS.length; k += 1) {
      if (k) row += '\u001f'
      row += cellFp(r[PPTO_GRILLA_FP_KEYS[k]])
    }
    parts.push(row)
  }
  return parts.join('\u001e')
}

/**
 * @param {object[]|null|undefined} aRows
 * @param {number|null|undefined} aTotal
 * @param {object[]|null|undefined} bRows
 * @param {number|null|undefined} bTotal
 */
export function pptoGrillaDatosIguales(aRows, aTotal, bRows, bTotal) {
  return pptoFingerprintGrilla(aRows, aTotal) === pptoFingerprintGrilla(bRows, bTotal)
}
