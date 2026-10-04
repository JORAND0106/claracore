/**
 * Sincronización AutoCAD-style: escala del lienzo = escala real del mapa.
 * Mientras el mapa está activo, pan/zoom del editor se derivan de Mapbox
 * (metros por píxel + origen geográfico fijo ↔ origen mundo).
 *
 * El zoom *visual* del usuario se aplica zoomando el mapa (misma escala
 * compartida); la escala real de las entidades (metros → world) no cambia.
 */
import { PX_PER_METER } from './esquemaGeometry.js'
import { haversineMeters } from './esquemaMapaCapture.js'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'

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
 * Mundo del lienzo para que `project(lng,lat)` caiga exactamente en pantalla
 * con el pan/zoom actuales: world = (project − pan) / zoom.
 * Corrige el desfase GK-planar vs haversine/Mercator a kilómetros del origen.
 */
export function lngLatToCanvasWorld(map, lng, lat, pan, zoom) {
  if (!map || typeof map.project !== 'function') return null
  const z = Number(zoom)
  if (!(z > 0) || !pan) return null
  const Lng = Number(lng)
  const Lat = Number(lat)
  if (![Lng, Lat].every(Number.isFinite)) return null
  try {
    const p = map.project([Lng, Lat])
    const sx = Number(p?.x)
    const sy = Number(p?.y)
    if (![sx, sy].every(Number.isFinite)) return null
    return {
      x: (sx - Number(pan.x)) / z,
      y: (sy - Number(pan.y)) / z,
    }
  } catch {
    return null
  }
}

export function gkToCanvasWorld(map, este, norte, pan, zoom) {
  const ll = gkBogotaToWgs84(Number(este), Number(norte))
  if (!ll) return null
  return lngLatToCanvasWorld(map, ll.lng, ll.lat, pan, zoom)
}

/** Invierte topoToWorld: mundo planar → Gauss del ancla de tabla. */
export function canvasWorldToGkIntent(wx, wy, gkOrigin, pxPerMeter = PX_PER_METER) {
  const o = gkOrigin || { este0: 0, norte0: 0 }
  const ppm = Number(pxPerMeter) || PX_PER_METER
  return {
    este: Number(o.este0) + Number(wx) / ppm,
    norte: Number(o.norte0) - Number(wy) / ppm,
  }
}

function reprojectXy(x, y, map, pan, zoom, gkOrigin) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const intent = canvasWorldToGkIntent(x, y, gkOrigin)
  return gkToCanvasWorld(map, intent.este, intent.norte, pan, zoom)
}

/**
 * Reubica objetos anclados a Gauss/geo para que coincidan con project() del mapa.
 * No toca trazos libres (sin sentidoEje / fromCoordTable / fromJoinSequence / nodo GK).
 *
 * @param {object[]} objects
 * @param {object} map
 * @param {{x:number,y:number}} pan
 * @param {number} zoom
 * @param {{este0:number,norte0:number}} gkOrigin
 * @returns {object[]}
 */
export function reprojectSceneObjectsToMap(objects, map, pan, zoom, gkOrigin) {
  if (!map || !gkOrigin || !Array.isArray(objects)) return objects
  const z = Number(zoom)
  if (!(z > 0) || !pan) return objects

  const isGeoAnchored = (obj) => (
    obj?.type === 'nodo'
    || obj?.sentidoEje === true
    || obj?.fromCoordTable === true
    || obj?.fromJoinSequence === true
    || obj?.fromLibraryOnNode === true
    || (Number.isFinite(Number(obj?.este)) && Number.isFinite(Number(obj?.norte)))
  )

  const mapPoint = (x, y, este, norte) => {
    if (Number.isFinite(Number(este)) && Number.isFinite(Number(norte))) {
      return gkToCanvasWorld(map, Number(este), Number(norte), pan, z)
    }
    return reprojectXy(x, y, map, pan, z, gkOrigin)
  }

  return objects.map((obj) => {
    if (!obj || typeof obj !== 'object' || !isGeoAnchored(obj)) return obj
    if (obj.type === 'nodo') {
      const w = mapPoint(obj.x, obj.y, obj.este, obj.norte)
      if (!w) return obj
      return { ...obj, x: w.x, y: w.y }
    }
    if (obj.type === 'linea' || obj.type === 'flecha') {
      const a = mapPoint(obj.x1, obj.y1, obj.este1, obj.norte1)
      const b = mapPoint(obj.x2, obj.y2, obj.este2, obj.norte2)
      if (!a || !b) return obj
      return { ...obj, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    }
    if (obj.type === 'polilinea' || obj.type === 'stroke') {
      const pts = Array.isArray(obj.points) ? obj.points : []
      const next = pts.map((p) => {
        if (!p) return p
        if (Number.isFinite(Number(p.lng)) && Number.isFinite(Number(p.lat))) {
          const w = lngLatToCanvasWorld(map, p.lng, p.lat, pan, z)
          return w ? { ...p, x: w.x, y: w.y } : p
        }
        if (Number.isFinite(Number(p.este)) && Number.isFinite(Number(p.norte))) {
          const w = gkToCanvasWorld(map, p.este, p.norte, pan, z)
          return w ? { ...p, x: w.x, y: w.y } : p
        }
        // Primera pasada (mundo aún planar): sellar lng/lat desde Gauss implícito.
        const intent = canvasWorldToGkIntent(p.x, p.y, gkOrigin)
        const ll = gkBogotaToWgs84(intent.este, intent.norte)
        const w = ll
          ? lngLatToCanvasWorld(map, ll.lng, ll.lat, pan, z)
          : reprojectXy(p.x, p.y, map, pan, z, gkOrigin)
        if (!w) return p
        return {
          ...p,
          x: w.x,
          y: w.y,
          ...(ll ? { lng: ll.lng, lat: ll.lat, este: intent.este, norte: intent.norte } : {}),
        }
      })
      return { ...obj, points: next }
    }
    if (obj.type === 'bloque') {
      const cx = (Number(obj.x) || 0) + (Number(obj.w) || 0) / 2
      const cy = (Number(obj.y) || 0) + (Number(obj.h) || 0) / 2
      const c1 = mapPoint(cx, cy, obj.este, obj.norte)
      const corner = reprojectXy(obj.x, obj.y, map, pan, z, gkOrigin)
      if (!c1 || !corner) return obj
      const oldDx = cx - (Number(obj.x) || 0)
      const oldDy = cy - (Number(obj.y) || 0)
      const oldR = Math.hypot(oldDx, oldDy) || 1
      const newR = Math.hypot(c1.x - corner.x, c1.y - corner.y) || oldR
      const s = newR / oldR
      const w = Math.max(1, (Number(obj.w) || 0) * s)
      const h = Math.max(1, (Number(obj.h) || 0) * s)
      const children = Array.isArray(obj.children)
        ? obj.children.map((ch) => scaleLocalChild(ch, s))
        : obj.children
      return {
        ...obj,
        x: c1.x - w / 2,
        y: c1.y - h / 2,
        w,
        h,
        children,
      }
    }
    return obj
  })
}

function scaleLocalChild(ch, s) {
  if (!ch || !(s > 0) || Math.abs(s - 1) < 1e-9) return ch
  if (ch.type === 'linea' || ch.type === 'flecha') {
    return {
      ...ch,
      x1: Number(ch.x1) * s,
      y1: Number(ch.y1) * s,
      x2: Number(ch.x2) * s,
      y2: Number(ch.y2) * s,
    }
  }
  if (ch.type === 'polilinea' || ch.type === 'stroke') {
    return {
      ...ch,
      points: (ch.points || []).map((p) => (p ? { ...p, x: Number(p.x) * s, y: Number(p.y) * s } : p)),
    }
  }
  if (ch.type === 'rect' || ch.type === 'elipse' || ch.type === 'triangulo') {
    return {
      ...ch,
      x1: Number(ch.x1) * s,
      y1: Number(ch.y1) * s,
      x2: Number(ch.x2) * s,
      y2: Number(ch.y2) * s,
    }
  }
  if (ch.x != null || ch.y != null) {
    return {
      ...ch,
      x: Number(ch.x || 0) * s,
      y: Number(ch.y || 0) * s,
      w: ch.w != null ? Number(ch.w) * s : ch.w,
      h: ch.h != null ? Number(ch.h) * s : ch.h,
    }
  }
  return ch
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

/**
 * Convierte un factor de zoom visual del lienzo (p. ej. 1.25 = +25 %)
 * en el nuevo nivel de zoom de Mapbox. Independiente del zoomRef del lienzo
 * (que puede ser ≪ 1 tras sync) para que in/out nunca queden bloqueados.
 *
 * @param {number} mapZoom nivel actual Mapbox
 * @param {number} factor >0 (1.25 acercar, 0.8 alejar)
 * @returns {number | null}
 */
export function mapZoomAfterVisualFactor(mapZoom, factor) {
  const z = Number(mapZoom)
  const f = Number(factor)
  if (!Number.isFinite(z) || !Number.isFinite(f) || !(f > 0)) return null
  return z + Math.log2(f)
}

/**
 * Porcentaje de zoom visual relativo al nivel Mapbox de referencia (encuadre
 * inicial). 100 = vista al fijar el origen; no usa zoomRef del lienzo.
 *
 * @param {number} mapZoom
 * @param {number} mapZoomBaseline
 * @returns {number}
 */
export function mapRelativeZoomPercent(mapZoom, mapZoomBaseline) {
  const z = Number(mapZoom)
  const z0 = Number(mapZoomBaseline)
  if (!Number.isFinite(z) || !Number.isFinite(z0)) return 100
  const rel = 2 ** (z - z0)
  if (!Number.isFinite(rel) || rel <= 0) return 100
  const pct = rel * 100
  return pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
}

/**
 * Tras dibujar, el zoom visual debe seguir respondiendo: un factor ≠ 1
 * siempre produce un nivel Mapbox distinto (no se “traba” en MIN_ZOOM del lienzo).
 */
export function visualZoomStillResponsive(mapZoom, factor) {
  const next = mapZoomAfterVisualFactor(mapZoom, factor)
  if (next == null) return false
  return Math.abs(next - Number(mapZoom)) > 1e-9
}
