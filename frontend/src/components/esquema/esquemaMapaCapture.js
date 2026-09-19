/**
 * Captura de vista Mapbox como imagen de fondo del editor de esquema.
 * No modifica Mapbox; solo recorta el canvas del mapa con opacidad sobre blanco.
 */

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
 * (pan/zoom del editor), para colocar la imagen de fondo alineada al área capturada.
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
