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
 * Valor de texto para ordenar (Tramo / Infraestructura).
 * @param {unknown} v
 * @returns {string}
 */
function textoOrden(v) {
  if (v == null) return ''
  return String(v).trim()
}

/**
 * Compara textos en ascendente (locale es, numérico).
 * Vacío al final.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compararTextoAsc(a, b) {
  const sa = textoOrden(a)
  const sb = textoOrden(b)
  if (!sa && !sb) return 0
  if (!sa) return 1
  if (!sb) return -1
  return sa.localeCompare(sb, 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Parsea Abs Inicio (p. ej. "2+900" → 2900) para orden numérico.
 * @param {unknown} v
 * @returns {number|null}
 */
export function parseAbsInicioOrden(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const n = parseFloat(s.replace(/\+/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Compara Abs Inicio en ascendente. Vacío / no numérico al final.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compararAbsInicioAsc(a, b) {
  const na = parseAbsInicioOrden(a)
  const nb = parseAbsInicioOrden(b)
  if (na == null && nb == null) return 0
  if (na == null) return 1
  if (nb == null) return -1
  return na - nb
}

/**
 * Orden interno de registros en cada subtabla:
 * Tramo → Infraestructura → Abs Inicio (todos ascendente).
 *
 * @param {Array<Record<string, unknown>>} registros
 * @returns {Array<Record<string, unknown>>}
 */
export function ordenarRegistrosSubtabla(registros) {
  const list = Array.isArray(registros) ? [...registros] : []
  list.sort((ra, rb) => {
    const byTramo = compararTextoAsc(ra?.tramo, rb?.tramo)
    if (byTramo !== 0) return byTramo
    const byInfra = compararTextoAsc(ra?.infraestructura, rb?.infraestructura)
    if (byInfra !== 0) return byInfra
    return compararAbsInicioAsc(ra?.abs_inicio, rb?.abs_inicio)
  })
  return list
}

/**
 * Agrupa registros en el orden Área → Longitud → Unidad.
 * Dentro de cada subtabla ordena por Tramo → Infraestructura → Abs Inicio.
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
      out.push({
        key: g.key,
        colLabel: g.colLabel,
        registros: ordenarRegistrosSubtabla(buckets[g.key]),
      })
    }
  }
  if (buckets.otros.length) {
    out.push({
      key: 'otros',
      colLabel: 'Área/Long/Nodo',
      registros: ordenarRegistrosSubtabla(buckets.otros),
    })
  }
  return out
}
