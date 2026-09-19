/**
 * Escala de imagen pegada por distancia real de referencia.
 * El lienzo usa PX_PER_METER (world = metros * PX_PER_METER).
 */
import { metersToWorld, objectBoundsOf, scaleObjectUniform } from './esquemaGeometry.js'

export function distWorld(a, b) {
  if (!a || !b) return 0
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0))
}

/**
 * Factor world: (metros reales → world) / distancia world entre los dos clics.
 * @returns {number|null}
 */
export function imageScaleFactorFromReference(p1, p2, meters) {
  const d = distWorld(p1, p2)
  const m = Number(String(meters ?? '').trim().replace(',', '.'))
  if (!(d > 1e-6) || !Number.isFinite(m) || m <= 0) return null
  return metersToWorld(m) / d
}

function boundsOverlap(a, b, pad = 2) {
  if (!a || !b) return false
  return !(
    a.x + a.w < b.x - pad
    || b.x + b.w < a.x - pad
    || a.y + a.h < b.y - pad
    || b.y + b.h < a.y - pad
  )
}

export function imageCenterOf(img) {
  if (!img) return { x: 0, y: 0 }
  return {
    x: (img.x || 0) + (img.w || 0) / 2,
    y: (img.y || 0) + (img.h || 0) / 2,
  }
}

/**
 * Escala la imagen y las entidades que se solapan con ella (dibujos encima),
 * alrededor del centro de la imagen, para conservar posiciones relativas.
 */
export function scaleSceneByImageReference(objects, imageId, p1, p2, meters) {
  const list = Array.isArray(objects) ? objects : []
  const img = list.find((o) => o && o.id === imageId && o.type === 'image' && !o.fit)
  const factor = imageScaleFactorFromReference(p1, p2, meters)
  if (!img || factor == null || !Number.isFinite(factor) || factor <= 0.02) return list
  const center = imageCenterOf(img)
  const imgBB = objectBoundsOf(img)
  return list.map((o) => {
    if (!o) return o
    if (o.id === imageId) {
      return { ...scaleObjectUniform(o, factor, center), fit: false }
    }
    if (o.type === 'image' && o.fit) return o
    if (boundsOverlap(objectBoundsOf(o), imgBB)) {
      return scaleObjectUniform(o, factor, center)
    }
    return o
  })
}
