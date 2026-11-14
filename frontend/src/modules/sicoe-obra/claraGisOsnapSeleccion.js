/**
 * Selección asistida tipo osnap en ClaraGIS: tolerancia en píxeles de pantalla,
 * dedupe por reporte y opciones del listado cuando hay superposición.
 */

export const CLARAGIS_OSNAP_LAYERS = Object.freeze([
  'sicoe-huellas-fill',
  'sicoe-huellas-line',
  'sicoe-calor-puntos',
])

/** Radio de atracción en píxeles (escritorio). */
export const CLARAGIS_OSNAP_PX_MOUSE = 12
/** Radio de atracción en píxeles (táctil). */
export const CLARAGIS_OSNAP_PX_TOUCH = 24

/**
 * @param {{ touch?: boolean, coarsePointer?: boolean }} [opts]
 * @returns {number}
 */
export function claragisOsnapTolerancePx(opts = {}) {
  if (opts.touch || opts.coarsePointer) return CLARAGIS_OSNAP_PX_TOUCH
  return CLARAGIS_OSNAP_PX_MOUSE
}

/**
 * @param {{ x: number, y: number }} point
 * @param {number} radiusPx
 * @returns {[[number, number], [number, number]]}
 */
export function claragisOsnapBbox(point, radiusPx) {
  const r = Math.max(1, Number(radiusPx) || CLARAGIS_OSNAP_PX_MOUSE)
  const x = Number(point?.x) || 0
  const y = Number(point?.y) || 0
  return [
    [x - r, y - r],
    [x + r, y + r],
  ]
}

/**
 * Detecta interacción táctil / puntero grueso a partir del evento de Mapbox.
 * @param {object} [mapEvent]
 * @returns {boolean}
 */
export function claragisEventoEsTactil(mapEvent) {
  const oe = mapEvent?.originalEvent
  if (!oe) {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        return window.matchMedia('(pointer: coarse)').matches
      } catch { /* ignore */ }
    }
    return false
  }
  const pt = String(oe.pointerType || '').toLowerCase()
  if (pt === 'touch' || pt === 'pen') return true
  if (typeof oe.touches === 'object' && oe.touches?.length > 0) return true
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(pointer: coarse)').matches
    } catch { /* ignore */ }
  }
  return false
}

/**
 * ¿La feature de huella es seleccionable (calor / dibujo del filtro)?
 * Los puntos de calor no llevan color_mode.
 * @param {object} feature
 */
export function claragisFeatureOsnapValida(feature) {
  if (!feature || typeof feature !== 'object') return false
  const layerId = feature.layer?.id || feature.sourceLayer || ''
  const p = feature.properties || {}
  if (layerId === 'sicoe-calor-puntos' || feature.source === 'sicoe-calor') {
    return p.reporte_id != null || p.id != null
  }
  // Huellas: solo las del filtro de calor (mismo criterio que el click previo).
  if (p.color_mode != null && p.color_mode !== 'calor') return false
  return p.reporte_id != null || p.id != null
}

/**
 * Deduplica features por reporte (un reporte = una opción).
 * Conserva la de mayor weight / más específica.
 * @param {object[]} features
 * @returns {object[]}
 */
export function claragisDeduplicarHitsPorReporte(features = []) {
  const byRep = new Map()
  for (const f of features || []) {
    if (!claragisFeatureOsnapValida(f)) continue
    const p = f.properties || {}
    const rid = String(p.reporte_id ?? '')
    if (!rid) continue
    const prev = byRep.get(rid)
    if (!prev) {
      byRep.set(rid, f)
      continue
    }
    const wNew = Number(p.weight) || 0
    const wOld = Number(prev.properties?.weight) || 0
    // Preferir geometría de dibujo (huellas) frente a punto suelto.
    const newHuella = String(f.source || f.layer?.source || '').includes('huellas')
      || String(f.layer?.id || '').includes('huellas')
    const oldHuella = String(prev.source || prev.layer?.source || '').includes('huellas')
      || String(prev.layer?.id || '').includes('huellas')
    if (newHuella && !oldHuella) {
      byRep.set(rid, f)
      continue
    }
    if (!newHuella && oldHuella) continue
    if (wNew >= wOld) byRep.set(rid, f)
  }
  return [...byRep.values()].sort((a, b) => {
    const na = Number(a.properties?.numero_reporte) || 0
    const nb = Number(b.properties?.numero_reporte) || 0
    if (na !== nb) return na - nb
    return String(a.properties?.reporte_id).localeCompare(String(b.properties?.reporte_id))
  })
}

/**
 * @param {object} feature
 * @returns {{
 *   reporteId: string,
 *   numeroReporte: string|number|null,
 *   descripcion: string,
 *   itemNumero: string,
 *   registroId: any,
 *   props: object,
 *   geometry: object|null,
 * }}
 */
export function claragisHitAOpcionPicker(feature) {
  const p = { ...(feature?.properties || {}) }
  const desc = String(
    p.descripcion_actividad
    || p.item_descripcion
    || p.capitulo
    || '',
  ).trim()
  const registroId = p.registro_id != null ? p.registro_id : p.id
  return {
    reporteId: String(p.reporte_id),
    numeroReporte: p.numero_reporte ?? null,
    descripcion: desc || `Reporte ${p.numero_reporte ?? p.reporte_id}`,
    itemNumero: String(p.item_numero || '').trim(),
    registroId,
    props: p,
    geometry: feature?.geometry || null,
  }
}

/**
 * @param {object[]} features
 * @returns {ReturnType<typeof claragisHitAOpcionPicker>[]}
 */
export function claragisHitsAOpcionesPicker(features = []) {
  return claragisDeduplicarHitsPorReporte(features).map(claragisHitAOpcionPicker)
}

/**
 * Centroide aproximado [lng, lat] para pan (sin zoom).
 * @param {object|null} geometry
 * @returns {[number, number]|null}
 */
export function claragisCentroideLngLat(geometry) {
  if (!geometry || typeof geometry !== 'object') return null
  const t = geometry.type
  const c = geometry.coordinates
  if (!c) return null
  if (t === 'Point' && Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0])
    const lat = Number(c[1])
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  const pts = []
  const walk = (node) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      pts.push([Number(node[0]), Number(node[1])])
      return
    }
    for (const child of node) walk(child)
  }
  walk(c)
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const [lng, lat] of pts) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    sx += lng
    sy += lat
    n += 1
  }
  if (!n) return null
  return [sx / n, sy / n]
}
