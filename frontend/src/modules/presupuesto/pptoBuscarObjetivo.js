/**
 * Buscar objetivo (goal seek) de presupuesto.
 *
 * Registro comodín (esta herramienta): precisión completa — sin round a 2 dp
 * en cantidad. cant_nueva = CD_objetivo / vlr; costo_directo del registro =
 * entero exacto para que el total cierre en el objetivo.
 *
 * Resto del presupuesto (edición normal) sigue con:
 *   cant_total = round(area × ancho × espesor, 2)  si ancho≠0 ó espesor≠0
 *   costo_directo = round(cant_total × vlr_unitario, 0)
 */

/** @typedef {'area_long_nod' | 'ancho' | 'espesor'} PptoDimKey */

/**
 * @param {unknown} v
 * @returns {number}
 */
export function numDim(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Cantidad con redondeo a 2 dp (edición normal / display de filas estándar).
 * @param {number|string|null|undefined} area
 * @param {number|string|null|undefined} ancho
 * @param {number|string|null|undefined} espesor
 * @returns {number}
 */
export function cantTotalFromDims(area, ancho, espesor) {
  const a = numDim(area)
  const w = numDim(ancho)
  const e = numDim(espesor)
  if (w || e) return Math.round(a * w * e * 100) / 100
  return Math.round(a * 100) / 100
}

/**
 * Cantidad sin redondeo (registro comodín de Buscar objetivo).
 * @param {number|string|null|undefined} area
 * @param {number|string|null|undefined} ancho
 * @param {number|string|null|undefined} espesor
 * @returns {number}
 */
export function cantTotalExacta(area, ancho, espesor) {
  const a = numDim(area)
  const w = numDim(ancho)
  const e = numDim(espesor)
  if (w || e) return a * w * e
  return a
}

/**
 * @param {number|string|null|undefined} cant
 * @param {number|string|null|undefined} vlr
 * @returns {number}
 */
export function costoDirectoFromCant(cant, vlr) {
  return Math.round(numDim(cant) * numDim(vlr))
}

/**
 * Etiqueta de la dimensión área_long_nod según tipo_entidad.
 * @param {string|null|undefined} tipoEntidad
 * @returns {string}
 */
export function labelAreaLongNodo(tipoEntidad) {
  const t = String(tipoEntidad || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  if (
    t.includes('nodo')
    || t === 'point'
    || t === 'punto'
    || t === 'unidad'
  ) {
    return 'Nodo'
  }
  if (
    t.includes('longitud')
    || t.includes('tramo')
    || t.includes('polyline')
    || t === 'line'
    || t === 'linea'
  ) {
    return 'Longitud'
  }
  if (
    t.includes('area')
    || t.includes('poligono')
    || t.includes('polygon')
    || t.includes('hatch')
  ) {
    return 'Área'
  }
  return 'Área/Long/Nodo'
}

/**
 * ¿Se puede despejar `dim` manteniendo fijas las otras?
 * @param {PptoDimKey} dim
 * @param {number} area
 * @param {number} ancho
 * @param {number} espesor
 * @returns {{ ok: boolean, reason?: string }}
 */
export function puedeDespejarDimension(dim, area, ancho, espesor) {
  const a = numDim(area)
  const w = numDim(ancho)
  const e = numDim(espesor)
  const productMode = !!(w || e)

  if (dim === 'area_long_nod') {
    if (!productMode) return { ok: true }
    if (w * e === 0) {
      return {
        ok: false,
        reason: 'Para ajustar Área/Long/Nodo en modo producto, Ancho y Espesor deben ser ≠ 0.',
      }
    }
    return { ok: true }
  }
  if (dim === 'ancho') {
    if (a * e === 0) {
      return {
        ok: false,
        reason: 'Para ajustar Ancho, Área/Long/Nodo y Espesor deben ser ≠ 0.',
      }
    }
    return { ok: true }
  }
  if (dim === 'espesor') {
    if (a * w === 0) {
      return {
        ok: false,
        reason: 'Para ajustar Espesor, Área/Long/Nodo y Ancho deben ser ≠ 0.',
      }
    }
    return { ok: true }
  }
  return { ok: false, reason: 'Dimensión no válida.' }
}

/**
 * Cantidad exacta (sin round a 2 dp) para alcanzar cdTarget: CD / vlr.
 * @param {number} cdTarget
 * @param {number} vlr
 * @returns {number|null}
 */
export function cantParaCostoObjetivo(cdTarget, vlr) {
  const target = Math.round(Number(cdTarget))
  const vu = numDim(vlr)
  if (!(vu > 0) || !Number.isFinite(target)) return null
  return target / vu
}

/**
 * Despeja el valor de la dimensión elegida para lograr cantTarget.
 * @param {PptoDimKey} dim
 * @param {number} cantTarget
 * @param {number} area
 * @param {number} ancho
 * @param {number} espesor
 * @returns {number|null}
 */
export function despejarDimension(dim, cantTarget, area, ancho, espesor) {
  const check = puedeDespejarDimension(dim, area, ancho, espesor)
  if (!check.ok) return null
  const a = numDim(area)
  const w = numDim(ancho)
  const e = numDim(espesor)
  const ct = numDim(cantTarget)

  if (dim === 'area_long_nod') {
    if (!(w || e)) return ct
    return ct / (w * e)
  }
  if (dim === 'ancho') return ct / (a * e)
  if (dim === 'espesor') return ct / (a * w)
  return null
}

/**
 * Cálculo completo de Buscar objetivo (precisión completa, cierre exacto).
 *
 * @param {object} opts
 * @param {number} opts.presupuestoActual
 * @param {number} opts.presupuestoObjetivo
 * @param {number} opts.costoDirectoRegistro
 * @param {number} opts.vlrUnitario
 * @param {number} opts.area
 * @param {number} opts.ancho
 * @param {number} opts.espesor
 * @param {PptoDimKey} opts.dimension
 */
export function calcularBuscarObjetivo({
  presupuestoActual,
  presupuestoObjetivo,
  costoDirectoRegistro,
  vlrUnitario,
  area,
  ancho,
  espesor,
  dimension,
}) {
  const actual = Math.round(numDim(presupuestoActual))
  const objetivo = Math.round(numDim(presupuestoObjetivo))
  const cdOld = Math.round(numDim(costoDirectoRegistro))
  const vlr = numDim(vlrUnitario)
  const a = numDim(area)
  const w = numDim(ancho)
  const e = numDim(espesor)

  if (!Number.isFinite(objetivo)) {
    return { ok: false, error: 'Indique un presupuesto objetivo válido.' }
  }
  if (!(vlr > 0)) {
    return { ok: false, error: 'El registro no tiene valor unitario > 0.' }
  }

  const delta = objetivo - actual
  const cdNew = cdOld + delta
  if (cdNew < 0) {
    return {
      ok: false,
      error: 'El objetivo exige un costo directo negativo en el registro; elija otro registro u objetivo.',
    }
  }

  const solvable = puedeDespejarDimension(dimension, a, w, e)
  if (!solvable.ok) {
    return { ok: false, error: solvable.reason || 'No se puede despejar esa dimensión.' }
  }

  const cantNew = cantParaCostoObjetivo(cdNew, vlr)
  if (cantNew == null || cantNew < 0) {
    return { ok: false, error: 'No se pudo calcular la cantidad objetivo.' }
  }

  const dimNueva = despejarDimension(dimension, cantNew, a, w, e)
  if (dimNueva == null || !Number.isFinite(dimNueva)) {
    return { ok: false, error: 'No se pudo despejar la dimensión seleccionada.' }
  }

  const dimsAfter = {
    area_long_nod: a,
    ancho: w,
    espesor: e,
    [dimension]: dimNueva,
  }
  const cantActual = cantTotalExacta(a, w, e)
  const cantVerif = cantTotalExacta(
    dimsAfter.area_long_nod,
    dimsAfter.ancho,
    dimsAfter.espesor,
  )

  const dimActual = dimension === 'area_long_nod' ? a : dimension === 'ancho' ? w : e

  return {
    ok: true,
    dimActual,
    dimNueva,
    cantActual,
    cantNueva: cantVerif,
    cdRegistroActual: cdOld,
    // CD y total exactos (no derivados de round(cant×vlr) con cant a 2 dp).
    cdRegistroNuevo: cdNew,
    totalActual: actual,
    totalNuevo: objetivo,
    deltaTotal: objetivo - actual,
  }
}
