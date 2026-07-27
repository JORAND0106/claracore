/**
 * Geometría auxiliar del editor de esquema:
 * manijas de redimensionado, puntos de referencia (snap) y medidas por eje.
 */

export const BOX_TOOLS = new Set(['rect', 'elipse'])
export const LINE_TOOLS = new Set(['linea', 'flecha'])

export function parsePositive(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Manijas de redimensionado en espacio local (AABB o extremos de línea). */
export function getResizeHandles(obj) {
  if (!obj) return []
  if (LINE_TOOLS.has(obj.type)) {
    return [
      { id: 'a', x: obj.x1, y: obj.y1 },
      { id: 'b', x: obj.x2, y: obj.y2 },
    ]
  }
  if (obj.type === 'tabla') {
    const w = (obj.cols || 1) * (obj.cellW || 78)
    const h = (obj.rows || 1) * (obj.cellH || 30)
    const x = obj.x || 0
    const y = obj.y || 0
    return boxHandles(x, y, x + w, y + h)
  }
  if (obj.type === 'hatchRegion') {
    const x = obj.x || 0
    const y = obj.y || 0
    return boxHandles(x, y, x + (obj.w || 0), y + (obj.h || 0))
  }
  if (obj.x1 == null || obj.x2 == null) return []
  return boxHandles(obj.x1, obj.y1, obj.x2, obj.y2)
}

function boxHandles(x1, y1, x2, y2) {
  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)
  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return [
    { id: 'nw', x: left, y: top },
    { id: 'n', x: cx, y: top },
    { id: 'ne', x: right, y: top },
    { id: 'e', x: right, y: cy },
    { id: 'se', x: right, y: bottom },
    { id: 's', x: cx, y: bottom },
    { id: 'sw', x: left, y: bottom },
    { id: 'w', x: left, y: cy },
  ]
}

export function hitResizeHandle(p, obj, threshold = 10) {
  const handles = getResizeHandles(obj)
  let best = null
  let bestD = threshold
  for (const h of handles) {
    const d = Math.hypot(p.x - h.x, p.y - h.y)
    if (d <= bestD) {
      bestD = d
      best = h
    }
  }
  return best
}

/**
 * Aplica arrastre de manija. Conserva el lado/esquina opuesta fija.
 * Para tablas/hatchRegion ajusta x/y/w/h (o cellW/cellH de tabla).
 */
export function applyResizeHandle(origin, handleId, point) {
  if (!origin || !handleId) return origin
  if (LINE_TOOLS.has(origin.type)) {
    if (handleId === 'a') return { ...origin, x1: point.x, y1: point.y }
    if (handleId === 'b') return { ...origin, x2: point.x, y2: point.y }
    return origin
  }
  if (origin.type === 'tabla') {
    const cols = Math.max(1, origin.cols || 1)
    const rows = Math.max(1, origin.rows || 1)
    const x0 = origin.x || 0
    const y0 = origin.y || 0
    const w0 = cols * (origin.cellW || 78)
    const h0 = rows * (origin.cellH || 30)
    const box = resizeBox(x0, y0, x0 + w0, y0 + h0, handleId, point)
    const w = Math.max(cols * 24, Math.abs(box.x2 - box.x1))
    const h = Math.max(rows * 18, Math.abs(box.y2 - box.y1))
    return {
      ...origin,
      x: Math.min(box.x1, box.x2),
      y: Math.min(box.y1, box.y2),
      cellW: w / cols,
      cellH: h / rows,
    }
  }
  if (origin.type === 'hatchRegion') {
    const box = resizeBox(
      origin.x || 0,
      origin.y || 0,
      (origin.x || 0) + (origin.w || 0),
      (origin.y || 0) + (origin.h || 0),
      handleId,
      point,
    )
    return {
      ...origin,
      x: Math.min(box.x1, box.x2),
      y: Math.min(box.y1, box.y2),
      w: Math.max(4, Math.abs(box.x2 - box.x1)),
      h: Math.max(4, Math.abs(box.y2 - box.y1)),
    }
  }
  if (origin.x1 == null) return origin
  const box = resizeBox(origin.x1, origin.y1, origin.x2, origin.y2, handleId, point)
  const minSize = 2
  let { x1, y1, x2, y2 } = box
  if (Math.abs(x2 - x1) < minSize) x2 = x1 + (x2 >= x1 ? minSize : -minSize)
  if (Math.abs(y2 - y1) < minSize) y2 = y1 + (y2 >= y1 ? minSize : -minSize)
  return { ...origin, x1, y1, x2, y2 }
}

function resizeBox(x1, y1, x2, y2, handleId, point) {
  let left = Math.min(x1, x2)
  let right = Math.max(x1, x2)
  let top = Math.min(y1, y2)
  let bottom = Math.max(y1, y2)
  const flipX = x1 > x2
  const flipY = y1 > y2
  switch (handleId) {
    case 'nw': left = point.x; top = point.y; break
    case 'n': top = point.y; break
    case 'ne': right = point.x; top = point.y; break
    case 'e': right = point.x; break
    case 'se': right = point.x; bottom = point.y; break
    case 's': bottom = point.y; break
    case 'sw': left = point.x; bottom = point.y; break
    case 'w': left = point.x; break
    default: break
  }
  // Mantener el orden original de esquinas de creación
  return flipX
    ? (flipY
      ? { x1: right, y1: bottom, x2: left, y2: top }
      : { x1: right, y1: top, x2: left, y2: bottom })
    : (flipY
      ? { x1: left, y1: bottom, x2: right, y2: top }
      : { x1: left, y1: top, x2: right, y2: bottom })
}

export function cursorForHandle(handleId) {
  if (handleId === 'a' || handleId === 'b') return 'grab'
  if (handleId === 'n' || handleId === 's') return 'ns-resize'
  if (handleId === 'e' || handleId === 'w') return 'ew-resize'
  if (handleId === 'ne' || handleId === 'sw') return 'nesw-resize'
  if (handleId === 'nw' || handleId === 'se') return 'nwse-resize'
  return 'default'
}

/** Segmentos y puntos de referencia de un objeto (para snap). */
export function collectSnapGeometry(objects, excludeId = null) {
  const points = []
  const segments = []
  for (const obj of objects || []) {
    if (!obj || obj.id === excludeId) continue
    if (obj.type === 'image' && obj.fit) continue
    if (LINE_TOOLS.has(obj.type)) {
      const a = { x: obj.x1, y: obj.y1 }
      const b = { x: obj.x2, y: obj.y2 }
      points.push({ ...a, kind: 'end' }, { ...b, kind: 'end' })
      points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
      segments.push({ a, b })
      continue
    }
    if (obj.type === 'rect' || obj.type === 'triangulo') {
      const corners = shapeCorners(obj)
      for (const c of corners) points.push({ ...c, kind: 'end' })
      for (let i = 0; i < corners.length; i += 1) {
        const a = corners[i]
        const b = corners[(i + 1) % corners.length]
        points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
        segments.push({ a, b })
      }
      continue
    }
    if (obj.type === 'elipse') {
      const cx = (obj.x1 + obj.x2) / 2
      const cy = (obj.y1 + obj.y2) / 2
      const rx = Math.abs(obj.x2 - obj.x1) / 2
      const ry = Math.abs(obj.y2 - obj.y1) / 2
      points.push(
        { x: cx + rx, y: cy, kind: 'end' },
        { x: cx - rx, y: cy, kind: 'end' },
        { x: cx, y: cy + ry, kind: 'end' },
        { x: cx, y: cy - ry, kind: 'end' },
        { x: cx, y: cy, kind: 'mid' },
      )
      // Aproximación de bordes con 4 arcos → segmentos tangentes para perpendicular
      segments.push(
        { a: { x: cx - rx, y: cy - ry }, b: { x: cx + rx, y: cy - ry } },
        { a: { x: cx + rx, y: cy - ry }, b: { x: cx + rx, y: cy + ry } },
        { a: { x: cx + rx, y: cy + ry }, b: { x: cx - rx, y: cy + ry } },
        { a: { x: cx - rx, y: cy + ry }, b: { x: cx - rx, y: cy - ry } },
      )
      continue
    }
    if (obj.type === 'stroke') {
      const pts = obj.points || []
      if (pts.length) {
        points.push({ ...pts[0], kind: 'end' }, { ...pts[pts.length - 1], kind: 'end' })
        for (let i = 0; i < pts.length - 1; i += 1) {
          segments.push({ a: pts[i], b: pts[i + 1] })
        }
      }
    }
  }
  return { points, segments }
}

function shapeCorners(obj) {
  if (obj.type === 'triangulo') {
    const midX = (obj.x1 + obj.x2) / 2
    return [
      { x: midX, y: obj.y1 },
      { x: obj.x2, y: obj.y2 },
      { x: obj.x1, y: obj.y2 },
    ]
  }
  const left = Math.min(obj.x1, obj.x2)
  const right = Math.max(obj.x1, obj.x2)
  const top = Math.min(obj.y1, obj.y2)
  const bottom = Math.max(obj.y1, obj.y2)
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
}

function distPointSeg(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return { d: Math.hypot(p.x - a.x, p.y - a.y), foot: { ...a }, t: 0 }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const foot = { x: a.x + t * dx, y: a.y + t * dy }
  return { d: Math.hypot(p.x - foot.x, p.y - foot.y), foot, t }
}

/**
 * Busca el mejor snap cerca de `p`.
 * Si `fromPoint` está definido (segundo clic de línea), también evalúa pies perpendiculares.
 */
export function findSnap(p, objects, {
  excludeId = null,
  threshold = 12,
  fromPoint = null,
  /** Si true, proyecta sobre bordes al iniciar trazo (más intrusivo). Por defecto off. */
  allowEdgeProject = false,
} = {}) {
  const { points, segments } = collectSnapGeometry(objects, excludeId)
  let best = null
  let bestD = threshold

  for (const pt of points) {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y)
    // Prioridad leve a extremos sin ampliar el umbral
    const score = d - (pt.kind === 'end' ? 0.01 : 0)
    if (d <= threshold && score < bestD) {
      bestD = score
      best = { x: pt.x, y: pt.y, kind: pt.kind }
    }
  }

  if (fromPoint) {
    // ⊥ un poco más exigente que extremo/medio: requiere acercarse de forma evidente al pie
    const perpThresh = threshold * 0.85
    for (const seg of segments) {
      const { foot, t } = distPointSeg(fromPoint, seg.a, seg.b)
      if (t < 0 || t > 1) continue
      const dCursor = Math.hypot(p.x - foot.x, p.y - foot.y)
      if (dCursor > perpThresh || dCursor >= bestD) continue
      if (Math.hypot(foot.x - fromPoint.x, foot.y - fromPoint.y) < 4) continue
      bestD = dCursor
      best = {
        x: foot.x,
        y: foot.y,
        kind: 'perp',
        guide: { a: { ...fromPoint }, b: { ...foot }, seg },
      }
    }
  } else if (allowEdgeProject) {
    for (const seg of segments) {
      const { foot, d, t } = distPointSeg(p, seg.a, seg.b)
      if (d >= bestD || d > threshold) continue
      if (t <= 0.02 || t >= 0.98) continue
      bestD = d
      best = { x: foot.x, y: foot.y, kind: 'mid', guide: { a: seg.a, b: seg.b } }
    }
  }

  return best
}

export function drawSnapMarker(ctx, snap, zoom = 1) {
  if (!snap || !ctx) return
  const s = Math.max(6, 8 / (zoom || 1))
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  if (snap.guide?.a && snap.guide?.b) {
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)'
    ctx.lineWidth = 1 / (zoom || 1)
    ctx.setLineDash([4 / (zoom || 1), 3 / (zoom || 1)])
    ctx.beginPath()
    ctx.moveTo(snap.guide.a.x, snap.guide.a.y)
    ctx.lineTo(snap.guide.b.x, snap.guide.b.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.strokeStyle = '#2563eb'
  ctx.fillStyle = snap.kind === 'perp' ? '#f59e0b' : snap.kind === 'mid' ? '#22c55e' : '#2563eb'
  ctx.lineWidth = 1.5 / (zoom || 1)
  ctx.beginPath()
  if (snap.kind === 'mid') {
    ctx.rect(snap.x - s / 2, snap.y - s / 2, s, s)
  } else if (snap.kind === 'perp') {
    ctx.moveTo(snap.x, snap.y - s)
    ctx.lineTo(snap.x + s, snap.y)
    ctx.lineTo(snap.x, snap.y + s)
    ctx.lineTo(snap.x - s, snap.y)
    ctx.closePath()
  } else {
    ctx.arc(snap.x, snap.y, s / 2, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function drawResizeHandles(ctx, obj, zoom = 1) {
  const handles = getResizeHandles(obj)
  if (!handles.length) return
  const size = Math.max(7, 9 / (zoom || 1))
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  for (const h of handles) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 1.5 / (zoom || 1)
    ctx.beginPath()
    ctx.rect(h.x - size / 2, h.y - size / 2, size, size)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
