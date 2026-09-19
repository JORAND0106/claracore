/**
 * Captura de vista Mapbox como imagen de fondo del editor de esquema.
 * No modifica Mapbox; solo recorta el canvas del mapa con opacidad sobre blanco.
 * Además calcula el span geográfico del área de impresión para escalar el fondo
 * a la misma convención del lienzo (PX_PER_METER).
 */
import { metersToWorld, PX_PER_METER } from './esquemaGeometry.js'

/** Centro por defecto (Bogotá) cuando el reporte no trae coordenadas. */
export const ESQUEMA_MAPA_CENTER_DEFAULT = Object.freeze({ lat: 4.6097, lng: -74.0817 })
export const ESQUEMA_MAPA_ZOOM_DEFAULT = 12
export const ESQUEMA_MAPA_ZOOM_CON_UBICACION = 16

/**
 * @param {unknown} raw
 * @returns {{ lat: number, lng: number } | null}
 */
export function normalizeMapLocation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const lat = Number(
    raw.lat ?? raw.latitude ?? raw.coord_lat ?? raw.coordLat ?? raw.y,
  )
  const lng = Number(
    raw.lng ?? raw.lon ?? raw.longitude ?? raw.coord_lng ?? raw.coordLng ?? raw.x,
  )
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Rectángulo de impresión en píxeles CSS del canvas (origen arriba-izquierda).
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ w: number, h: number }} bounds tamaño útil del lienzo
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function normalizePrintAreaRect(a, b, bounds) {
  if (!a || !b || !bounds) return null
  const maxW = Math.max(1, Number(bounds.w) || 0)
  const maxH = Math.max(1, Number(bounds.h) || 0)
  let x0 = Math.min(a.x, b.x)
  let y0 = Math.min(a.y, b.y)
  let x1 = Math.max(a.x, b.x)
  let y1 = Math.max(a.y, b.y)
  x0 = Math.max(0, Math.min(maxW, x0))
  y0 = Math.max(0, Math.min(maxH, y0))
  x1 = Math.max(0, Math.min(maxW, x1))
  y1 = Math.max(0, Math.min(maxH, y1))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 8 || h < 8) return null
  return { x: x0, y: y0, w, h }
}

/**
 * Distancia ortodrómica en metros entre dos puntos WGS84.
 * @param {{ lng: number, lat: number }} a
 * @param {{ lng: number, lat: number }} b
 */
export function haversineMeters(a, b) {
  if (!a || !b) return 0
  const lng1 = Number(a.lng)
  const lat1 = Number(a.lat)
  const lng2 = Number(b.lng)
  const lat2 = Number(b.lat)
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return 0
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Ancho/alto reales (m) del rectángulo geográfico definido por 4 esquinas.
 * Promedia bordes opuestos para amortiguar la distorsión Mercator.
 * @param {{ nw: {lng,lat}, ne: {lng,lat}, sw: {lng,lat}, se: {lng,lat} }} corners
 * @returns {{ widthM: number, heightM: number } | null}
 */
export function geoSpanMetersFromLngLatCorners(corners) {
  if (!corners?.nw || !corners?.ne || !corners?.sw || !corners?.se) return null
  const widthM = (haversineMeters(corners.nw, corners.ne) + haversineMeters(corners.sw, corners.se)) / 2
  const heightM = (haversineMeters(corners.nw, corners.sw) + haversineMeters(corners.ne, corners.se)) / 2
  if (!(widthM > 0.05) || !(heightM > 0.05)) return null
  return { widthM, heightM }
}

/**
 * Esquinas WGS84 del área de impresión en píxeles CSS del contenedor Mapbox.
 * @param {{ unproject: (pt: [number, number]) => { lng: number, lat: number } }} map
 * @param {{ x: number, y: number, w: number, h: number }} area
 */
export function mapCssRectToLngLatCorners(map, area) {
  if (!map || typeof map.unproject !== 'function' || !area) return null
  try {
    const unp = (x, y) => {
      const p = map.unproject([x, y])
      const lng = Number(p?.lng)
      const lat = Number(p?.lat)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return { lng, lat }
    }
    const nw = unp(area.x, area.y)
    const ne = unp(area.x + area.w, area.y)
    const sw = unp(area.x, area.y + area.h)
    const se = unp(area.x + area.w, area.y + area.h)
    if (!nw || !ne || !sw || !se) return null
    return { nw, ne, sw, se }
  } catch {
    return null
  }
}

/**
 * Compone un recorte del canvas Mapbox sobre fondo blanco con opacidad.
 * @param {HTMLCanvasElement | null} mapCanvas
 * @param {{ x: number, y: number, w: number, h: number }} area CSS px relativos al canvas del mapa
 * @param {number} opacity 0 = blanco, 1 = mapa nítido
 * @param {{ mime?: string, quality?: number }} [opts]
 * @returns {string | null} data URL
 */
export function captureMapAreaToDataUrl(mapCanvas, area, opacity, opts = {}) {
  if (!mapCanvas || !area) return null
  const cw = mapCanvas.width
  const ch = mapCanvas.height
  const cssW = mapCanvas.clientWidth || cw
  const cssH = mapCanvas.clientHeight || ch
  if (!cw || !ch || !cssW || !cssH) return null

  const ratioX = cw / cssW
  const ratioY = ch / cssH
  const sx = Math.max(0, Math.floor(area.x * ratioX))
  const sy = Math.max(0, Math.floor(area.y * ratioY))
  const sw = Math.max(1, Math.min(cw - sx, Math.floor(area.w * ratioX)))
  const sh = Math.max(1, Math.min(ch - sy, Math.floor(area.h * ratioY)))
  if (sw < 2 || sh < 2) return null

  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const ctx = out.getContext('2d')
  if (!ctx) return null

  const alpha = Math.max(0, Math.min(1, Number(opacity)))
  if (!Number.isFinite(alpha)) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sw, sh)
  if (alpha > 0) {
    ctx.globalAlpha = alpha
    try {
      ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
    } catch {
      return null
    }
    ctx.globalAlpha = 1
  }

  const mime = opts.mime || 'image/png'
  if (mime === 'image/jpeg') {
    return out.toDataURL('image/jpeg', opts.quality ?? 0.92)
  }
  return out.toDataURL('image/png')
}

/**
 * Convierte un rectángulo en píxeles de pantalla del lienzo a coordenadas mundo
 * (pan/zoom del editor), sin ajustar a metros reales.
 * @param {{ x: number, y: number, w: number, h: number }} area
 * @param {{ x: number, y: number }} pan
 * @param {number} zoom
 */
export function printAreaToWorldRect(area, pan, zoom) {
  const z = zoom > 0 ? zoom : 1
  const px = pan?.x || 0
  const py = pan?.y || 0
  return {
    x: (area.x - px) / z,
    y: (area.y - py) / z,
    w: area.w / z,
    h: area.h / z,
  }
}

/**
 * Coloca el fondo de mapa en unidades mundo del lienzo (PX_PER_METER),
 * de modo que widthM/heightM reales coincidan con metersToWorld(...).
 * El zoom del editor no entra en el tamaño: solo centra el rectángulo
 * sobre el área de impresión en pantalla.
 *
 * @param {{ x: number, y: number, w: number, h: number }} area
 * @param {{ x: number, y: number }} pan
 * @param {number} zoom
 * @param {{ widthM: number, heightM: number }} spanMeters
 * @returns {{ x: number, y: number, w: number, h: number, widthM: number, heightM: number, pxPerMeter: number } | null}
 */
export function printAreaToScaledWorldRect(area, pan, zoom, spanMeters) {
  if (!area || !spanMeters) return null
  const widthM = Number(spanMeters.widthM)
  const heightM = Number(spanMeters.heightM)
  if (!(widthM > 0) || !(heightM > 0)) return null
  const base = printAreaToWorldRect(area, pan, zoom)
  const w = metersToWorld(widthM)
  const h = metersToWorld(heightM)
  if (!(w > 0) || !(h > 0)) return null
  const cx = base.x + base.w / 2
  const cy = base.y + base.h / 2
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    widthM,
    heightM,
    pxPerMeter: PX_PER_METER,
  }
}

/**
 * Factor: cuánto mide en el mapa una entidad de `meters` metros,
 * como fracción del ancho del fondo escalado (para pruebas numéricas).
 */
export function entityFractionOfMapWidth(entityMeters, mapWidthMeters) {
  const em = Number(entityMeters)
  const mw = Number(mapWidthMeters)
  if (!(em > 0) || !(mw > 0)) return null
  return em / mw
}
