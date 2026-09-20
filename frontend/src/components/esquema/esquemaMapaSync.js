/**
 * Sincronización AutoCAD-style: escala del lienzo = escala real del mapa.
 * Mientras el mapa está activo, pan/zoom del editor se derivan de Mapbox
 * (metros por píxel + origen geográfico fijo ↔ origen mundo).
 */
import { PX_PER_METER } from './esquemaGeometry.js'
import { haversineMeters } from './esquemaMapaCapture.js'

/** Muestra de píxeles en pantalla para estimar m/px (más estable que 1 px). */
const SAMPLE_PX = 100

/**
 * Píxeles de pantalla por metro en el mapa (eje horizontal de pantalla).
 * Usa unproject + haversine para respetar bearing y proyección Mercator.
 *
 * @param {{ unproject: Function, project?: Function }} map
 * @param {{ x: number, y: number } | null} [screenPt] centro de la muestra
 * @returns {number | null}
 */
export function mapScreenPixelsPerMeter(map, screenPt = null) {
  if (!map || typeof map.unproject !== 'function') return null
  let x = Number(screenPt?.x)
  let y = Number(screenPt?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (typeof map.project === 'function' && typeof map.getCenter === 'function') {
      try {
        const c = map.getCenter()
        const lng = Number(c?.lng ?? c?.lon)
        const lat = Number(c?.lat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          const p = map.project([lng, lat])
          x = Number(p?.x)
          y = Number(p?.y)
        }
      } catch {
        return null
      }
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  try {
    const a = map.unproject([x, y])
    const b = map.unproject([x + SAMPLE_PX, y])
    const lng1 = Number(a?.lng)
    const lat1 = Number(a?.lat)
    const lng2 = Number(b?.lng)
    const lat2 = Number(b?.lat)
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return null
    const meters = haversineMeters(
      { lng: lng1, lat: lat1 },
      { lng: lng2, lat: lat2 },
    )
    if (!(meters > 1e-6)) return null
    return SAMPLE_PX / meters
  } catch {
    return null
  }
}

/**
 * Zoom del lienzo para que 1 m mundo (PX_PER_METER u) ocupe `ppm` px de pantalla.
 * No aplica MIN_ZOOM/MAX_ZOOM: con mapa activo la escala la dicta Mapbox.
 *
 * @param {number} pixelsPerMeter
 * @param {number} [pxPerMeter]
 * @returns {number | null}
 */
export function canvasZoomFromMapPpm(pixelsPerMeter, pxPerMeter = PX_PER_METER) {
  const ppm = Number(pixelsPerMeter)
  const base = Number(pxPerMeter)
  if (!(ppm > 0) || !(base > 0)) return null
  return ppm / base
}

/**
 * Pan del lienzo para anclar un origen geográfico a un punto mundo.
 * screen = world * zoom + pan  ⇒  pan = project(origin) - worldOrigin * zoom
 *
 * @param {{ project: Function }} map
 * @param {{ lng: number, lat: number }} originLngLat
 * @param {{ x: number, y: number }} [worldOrigin]
 * @param {number} zoom
 * @returns {{ x: number, y: number } | null}
 */
export function canvasPanFromMapOrigin(map, originLngLat, worldOrigin = { x: 0, y: 0 }, zoom = 1) {
  if (!map || typeof map.project !== 'function' || !originLngLat) return null
  const lng = Number(originLngLat.lng)
  const lat = Number(originLngLat.lat)
  const z = Number(zoom)
  if (![lng, lat, z].every(Number.isFinite) || !(z > 0)) return null
  try {
    const p = map.project([lng, lat])
    const sx = Number(p?.x)
    const sy = Number(p?.y)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
    const wx = Number(worldOrigin?.x) || 0
    const wy = Number(worldOrigin?.y) || 0
    return {
      x: sx - wx * z,
      y: sy - wy * z,
    }
  } catch {
    return null
  }
}

/**
 * Calcula pan + zoom del lienzo sincronizados con el mapa.
 *
 * @param {object} map instancia Mapbox (project/unproject/getCenter)
 * @param {{ lng: number, lat: number }} originLngLat origen geo fijo ↔ mundo (0,0)
 * @param {{ pxPerMeter?: number, screenPt?: {x,y} }} [opts]
 * @returns {{ pan: {x,y}, zoom: number, pixelsPerMeter: number } | null}
 */
export function syncCanvasTransformToMap(map, originLngLat, opts = {}) {
  const ppm = mapScreenPixelsPerMeter(map, opts.screenPt || null)
  if (ppm == null) return null
  const zoom = canvasZoomFromMapPpm(ppm, opts.pxPerMeter ?? PX_PER_METER)
  if (zoom == null) return null
  const pan = canvasPanFromMapOrigin(map, originLngLat, opts.worldOrigin || { x: 0, y: 0 }, zoom)
  if (!pan) return null
  return { pan, zoom, pixelsPerMeter: ppm }
}

/**
 * Origen geográfico a fijar en la primera sincronización (centro del mapa).
 * @param {{ getCenter: Function }} map
 * @returns {{ lng: number, lat: number } | null}
 */
export function mapCenterAsGeoOrigin(map) {
  if (!map || typeof map.getCenter !== 'function') return null
  try {
    const c = map.getCenter()
    const lng = Number(c?.lng ?? c?.lon)
    const lat = Number(c?.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { lng, lat }
  } catch {
    return null
  }
}

/**
 * Fracción de pantalla que debe ocupar una entidad de `entityMeters`
 * cuando el mapa muestra `pixelsPerMeter` px/m (para asserts numéricos).
 */
export function entityScreenPxForMeters(entityMeters, pixelsPerMeter) {
  const m = Number(entityMeters)
  const ppm = Number(pixelsPerMeter)
  if (!(m > 0) || !(ppm > 0)) return null
  return m * ppm
}
