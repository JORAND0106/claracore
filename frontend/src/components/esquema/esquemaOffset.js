/**
 * Offset / equidistancia: copia paralela de línea, polilínea, rectángulo o elipse.
 */
export const OFFSETABLE_TYPES = new Set(['linea', 'flecha', 'polilinea', 'rect', 'elipse'])

export function canOffsetEntity(obj) {
  return !!(obj && OFFSETABLE_TYPES.has(obj.type))
}

function unitNormal(a, b) {
  const dx = (b?.x || 0) - (a?.x || 0)
  const dy = (b?.y || 0) - (a?.y || 0)
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: 0, y: -1 }
  return { x: -dy / len, y: dx / len }
}

function lineIntersect(a1, a2, b1, b2) {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const den = dax * dby - day * dbx
  if (Math.abs(den) < 1e-9) return null
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / den
  return { x: a1.x + t * dax, y: a1.y + t * day }
}

function offsetPolylinePoints(points, dist) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (pts.length < 2) return pts.map((p) => ({ ...p }))
  const segs = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const n = unitNormal(pts[i], pts[i + 1])
    segs.push({
      a: { x: pts[i].x + n.x * dist, y: pts[i].y + n.y * dist },
      b: { x: pts[i + 1].x + n.x * dist, y: pts[i + 1].y + n.y * dist },
    })
  }
  const out = [segs[0].a]
  for (let i = 0; i < segs.length - 1; i += 1) {
    const hit = lineIntersect(segs[i].a, segs[i].b, segs[i + 1].a, segs[i + 1].b)
    out.push(hit || segs[i].b)
  }
  out.push(segs[segs.length - 1].b)
  return out
}

function nearestSegSigned(points, point) {
  const pts = points || []
  let best = { d: Infinity, signed: 0 }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-9) continue
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const foot = { x: a.x + t * dx, y: a.y + t * dy }
    const d = Math.hypot(point.x - foot.x, point.y - foot.y)
    const n = unitNormal(a, b)
    const signed = (point.x - a.x) * n.x + (point.y - a.y) * n.y
    if (d < best.d) best = { d, signed }
  }
  return best.signed
}

/** Distancia con signo (lado del cursor) en unidades de mundo. */
export function signedOffsetDistance(obj, point) {
  if (!obj || !point) return 0
  if (obj.type === 'linea' || obj.type === 'flecha') {
    const n = unitNormal({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 })
    return (point.x - obj.x1) * n.x + (point.y - obj.y1) * n.y
  }
  if (obj.type === 'polilinea') {
    return nearestSegSigned(obj.points, point)
  }
  if (obj.type === 'rect') {
    const left = Math.min(obj.x1, obj.x2)
    const right = Math.max(obj.x1, obj.x2)
    const top = Math.min(obj.y1, obj.y2)
    const bottom = Math.max(obj.y1, obj.y2)
    const dx = Math.max(left - point.x, 0, point.x - right)
    const dy = Math.max(top - point.y, 0, point.y - bottom)
    const outside = dx > 0 || dy > 0
    const inwardX = Math.min(point.x - left, right - point.x)
    const inwardY = Math.min(point.y - top, bottom - point.y)
    const inward = Math.min(inwardX, inwardY)
    return outside ? Math.hypot(dx, dy) : -Math.max(0, inward)
  }
  if (obj.type === 'elipse') {
    const cx = (obj.x1 + obj.x2) / 2
    const cy = (obj.y1 + obj.y2) / 2
    const rx = Math.max(0.5, Math.abs(obj.x2 - obj.x1) / 2)
    const ry = Math.max(0.5, Math.abs(obj.y2 - obj.y1) / 2)
    const u = (point.x - cx) / rx
    const v = (point.y - cy) / ry
    const d = Math.hypot(u, v)
    const radial = Math.hypot(point.x - cx, point.y - cy)
    const rim = Math.hypot(u !== 0 || v !== 0 ? (u / (d || 1)) * rx : rx, u !== 0 || v !== 0 ? (v / (d || 1)) * ry : 0)
    return radial - rim
  }
  return 0
}

/** Copia paralela. `signedWorld` > 0 sigue la normal (izquierda del sentido de trazo). */
export function offsetEntity(obj, signedWorld) {
  if (!canOffsetEntity(obj) || !Number.isFinite(signedWorld)) return null
  const d = signedWorld
  if (Math.abs(d) < 0.4) return null
  if (obj.type === 'linea' || obj.type === 'flecha') {
    const n = unitNormal({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 })
    return {
      ...obj,
      x1: obj.x1 + n.x * d,
      y1: obj.y1 + n.y * d,
      x2: obj.x2 + n.x * d,
      y2: obj.y2 + n.y * d,
    }
  }
  if (obj.type === 'polilinea') {
    const points = offsetPolylinePoints(obj.points, d)
    if (points.length < 2) return null
    return { ...obj, points }
  }
  if (obj.type === 'rect') {
    const left = Math.min(obj.x1, obj.x2)
    const right = Math.max(obj.x1, obj.x2)
    const top = Math.min(obj.y1, obj.y2)
    const bottom = Math.max(obj.y1, obj.y2)
    const nl = left - d
    const nr = right + d
    const nt = top - d
    const nb = bottom + d
    if (nr - nl < 2 || nb - nt < 2) return null
    const flipX = obj.x1 > obj.x2
    const flipY = obj.y1 > obj.y2
    return {
      ...obj,
      x1: flipX ? nr : nl,
      y1: flipY ? nb : nt,
      x2: flipX ? nl : nr,
      y2: flipY ? nt : nb,
    }
  }
  if (obj.type === 'elipse') {
    const cx = (obj.x1 + obj.x2) / 2
    const cy = (obj.y1 + obj.y2) / 2
    const rx = Math.max(0.5, Math.abs(obj.x2 - obj.x1) / 2 + d)
    const ry = Math.max(0.5, Math.abs(obj.y2 - obj.y1) / 2 + d)
    if (rx < 1 || ry < 1) return null
    return {
      ...obj,
      x1: cx - rx,
      y1: cy - ry,
      x2: cx + rx,
      y2: cy + ry,
    }
  }
  return null
}
