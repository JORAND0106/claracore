/**
 * Espejo y matriz (rectangular / polar) sobre una selección del editor de esquema.
 */
import {
  cotaLayout,
  cotaSignedOffset,
  metersToWorld,
  objectCenterOf,
  objectWorldPoint,
  rotateObjectAroundPivot,
  shiftObject,
} from './esquemaGeometry.js'

export function mirrorPoint(p, a, b) {
  if (!p || !a || !b) return p
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return { x: p.x, y: p.y }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  const fx = a.x + t * dx
  const fy = a.y + t * dy
  return { x: 2 * fx - p.x, y: 2 * fy - p.y }
}

function axisAngle(a, b) {
  return Math.atan2((b?.y || 0) - (a?.y || 0), (b?.x || 0) - (a?.x || 0))
}

function mirrorWorldPair(obj, a, b) {
  const p1 = mirrorPoint(objectWorldPoint(obj, { x: obj.x1, y: obj.y1 }), a, b)
  const p2 = mirrorPoint(objectWorldPoint(obj, { x: obj.x2, y: obj.y2 }), a, b)
  return { ...obj, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rotation: 0 }
}

export function mirrorObject(obj, a, b) {
  if (!obj || !a || !b) return obj
  if (obj.type === 'image' && obj.fit) return obj
  if (obj.type === 'nodo') {
    const p = mirrorPoint({ x: obj.x || 0, y: obj.y || 0 }, a, b)
    return { ...obj, x: p.x, y: p.y }
  }
  if (Array.isArray(obj.points)) {
    const points = (obj.points || []).map((p) => mirrorPoint(objectWorldPoint(obj, p), a, b))
    return { ...obj, points, rotation: 0 }
  }
  if (obj.x1 != null && obj.x2 != null) {
    if (obj.type === 'linea' || obj.type === 'flecha' || obj.type === 'cota') {
      const next = mirrorWorldPair(obj, a, b)
      if (obj.type === 'cota') {
        const L = cotaLayout(obj)
        const dim = mirrorPoint(objectWorldPoint(obj, L.d1), a, b)
        next.offset = cotaSignedOffset(next, dim)
      }
      return next
    }
    const c = objectCenterOf(obj)
    const c2 = mirrorPoint(c, a, b)
    const moved = shiftObject(obj, c2.x - c.x, c2.y - c.y)
    let next = { ...moved, rotation: 2 * axisAngle(a, b) - (obj.rotation || 0) }
    if (obj.type === 'triangulo') {
      next = { ...next, x1: next.x2, x2: next.x1 }
    }
    return next
  }
  const c = objectCenterOf(obj)
  const c2 = mirrorPoint({ x: c.x, y: c.y }, a, b)
  return {
    ...shiftObject(obj, c2.x - c.x, c2.y - c.y),
    rotation: 2 * axisAngle(a, b) - (obj.rotation || 0),
  }
}

export function mirrorSelection(objects, { a, b, keepOriginal = true } = {}) {
  const src = (objects || []).filter((o) => o && !(o.type === 'image' && o.fit))
  const copies = src.map((o) => mirrorObject(o, a, b))
  if (keepOriginal) return { objects: copies, removed: [] }
  return { objects: copies, removed: src.map((o) => o.id) }
}

export function arrayRectangular(objects, { rows = 1, cols = 1, dxMeters = 1, dyMeters = 1 } = {}) {
  const r = Math.max(1, Math.floor(Number(rows) || 1))
  const c = Math.max(1, Math.floor(Number(cols) || 1))
  const dx = metersToWorld(Number(dxMeters) || 0)
  const dy = metersToWorld(Number(dyMeters) || 0)
  const src = objects || []
  const copies = []
  for (let i = 0; i < r; i += 1) {
    for (let j = 0; j < c; j += 1) {
      if (i === 0 && j === 0) continue
      for (const o of src) copies.push(shiftObject({ ...o }, j * dx, i * dy))
    }
  }
  return copies
}

export function arrayPolar(objects, { center, count = 4, angleDeg = 360 } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const total = Number(angleDeg)
  const src = objects || []
  if (!center || !Number.isFinite(total) || n < 2) return []
  const step = (total * Math.PI) / 180 / n
  const copies = []
  for (let i = 1; i < n; i += 1) {
    const delta = step * i
    for (const o of src) copies.push(rotateObjectAroundPivot({ ...o }, center, delta))
  }
  return copies
}
