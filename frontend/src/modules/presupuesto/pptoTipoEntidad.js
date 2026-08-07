/**
 * Clasificación de registros de presupuesto por tipo de entidad
 * para subtablas de memorias Excel.
 *
 * Orden fijo de subtablas: Área → Longitud → Unidad.
 */

/** @typedef {'area' | 'longitud' | 'unidad'} PptoGrupoEntidadKey */

export const PPTO_GRUPOS_ENTIDAD = Object.freeze([
  { key: 'area', colLabel: 'Área' },
  { key: 'longitud', colLabel: 'Longitud' },
  { key: 'unidad', colLabel: 'Unidad' },
])

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * @param {string|null|undefined} tipoEntidad
 * @returns {PptoGrupoEntidadKey|null}
 */
export function clasificarTipoEntidad(tipoEntidad) {
  const t = norm(tipoEntidad)
  if (!t) return null

  // Nodo / Nodo RSP / punto
  if (
    t.includes('nodo')
    || t === 'point'
    || t === 'punto'
    || t === 'circle'
    || t === 'block'
    || t === 'insert'
    || t === 'unidad'
  ) {
    return 'unidad'
  }

  // Longitud / Tramo / línea
  if (
    t.includes('longitud')
    || t.includes('tramo')
    || t.includes('polyline')
    || t === 'line'
    || t === 'linea'
    || t === 'lwpolyline'
  ) {
    return 'longitud'
  }

  // Área / polígono / hatch
  if (
    t.includes('area')
    || t.includes('poligono')
    || t.includes('polygon')
    || t.includes('hatch')
    || t.includes('region')
  ) {
    return 'area'
  }

  return null
}

/**
 * Agrupa registros en el orden Área → Longitud → Unidad.
 * Los sin clasificar van al final en un grupo residual (columna ambigua original).
 *
 * @param {Array<Record<string, unknown>>} registros
 * @returns {Array<{ key: string, colLabel: string, registros: Array }>}
 */
export function agruparRegistrosPorTipoEntidad(registros) {
  const buckets = {
    area: [],
    longitud: [],
    unidad: [],
    otros: [],
  }
  for (const r of registros || []) {
    const key = clasificarTipoEntidad(r?.tipo_entidad)
    if (key && buckets[key]) buckets[key].push(r)
    else buckets.otros.push(r)
  }

  const out = []
  for (const g of PPTO_GRUPOS_ENTIDAD) {
    if (buckets[g.key].length) {
      out.push({ key: g.key, colLabel: g.colLabel, registros: buckets[g.key] })
    }
  }
  if (buckets.otros.length) {
    out.push({
      key: 'otros',
      colLabel: 'Área/Long/Nodo',
      registros: buckets.otros,
    })
  }
  return out
}
