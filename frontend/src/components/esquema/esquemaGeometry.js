/**
 * Geometría auxiliar del editor de esquema:
 * manijas de redimensionado, puntos de referencia (snap) y medidas por eje.
 */

export const BOX_TOOLS = new Set(['rect', 'elipse'])
export const LINE_TOOLS = new Set(['linea', 'flecha'])

/**
 * Escala de presentación hacia adelante: 1 m real = PX_PER_METER unidades
 * internas del lienzo (px a zoom 1). Los esquemas ya rasterizados (PNG)
 * no se reescalan. Grosor, hatch y umbrales de snap siguen en unidades internas.
 */
export const PX_PER_METER = 50
/** Zoom 1 = 100 %. Máximo 4000 % para trabajar cotas de 1 m o menos. */
export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 40

export function clampZoom(z) {
  const n = Number(z)
  if (!Number.isFinite(n)) return 1
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, n))
}

export const SNAP_KINDS_FASE1 = ['end', 'mid', 'center', 'quad', 'node', 'near', 'perp']

export function parsePositive(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function worldToMeters(world) {
  const n = Number(world)
  return Number.isFinite(n) ? n / PX_PER_METER : 0
}

export function metersToWorld(meters) {
  const n = Number(meters)
  return Number.isFinite(n) ? n * PX_PER_METER : 0
}

export function formatMeters(world, digits) {
  const m = worldToMeters(world)
  if (!Number.isFinite(m)) return ''
  const abs = Math.abs(m)
  const d = digits != null ? digits : (abs >= 10 ? 1 : abs >= 1 ? 2 : 3)
  return `${m.toFixed(d)} m`
}

/** "2.5" | "2,5" | "3x2" | "3 x 1,20" → metros (no unidades internas). */
export function parseDynMeasure(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const parts = s.split(/[xX*×]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const w = parsePositive(parts[0])
  const h = parts.length >= 2 ? parsePositive(parts[1]) : null
  if (w == null && h == null) return null
  return { w, h }
}

/** Extremo a `meters` de `from` en la dirección hacia `toward`. */
export function pointAtDistance(from, toward, meters) {
  if (!from || !toward) return null
  const world = metersToWorld(meters)
  if (!Number.isFinite(world) || world <= 0) return null
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: from.x + world, y: from.y }
  const s = world / len
  return { x: from.x + dx * s, y: from.y + dy * s }
}

export function gridStepWorld(zoom) {
  const screenPerMeter = PX_PER_METER * (zoom || 1)
  if (screenPerMeter >= 90) return PX_PER_METER * 0.1
  if (screenPerMeter >= 28) return PX_PER_METER
  if (screenPerMeter >= 10) return PX_PER_METER * 5
  return PX_PER_METER * 10
}

export function drawDotGrid(ctx, view, step, zoom = 1) {
  if (!ctx || !view || !step || step <= 0) return
  const { x, y, w, h } = view
  if (!w || !h) return
  const r = Math.max(0.55, 1.1 / (zoom || 1))
  const x0 = Math.floor(x / step) * step
  const y0 = Math.floor(y / step) * step
  ctx.save()
  ctx.fillStyle = 'rgba(100, 116, 139, 0.42)'
  for (let gx = x0; gx <= x + w + step; gx += step) {
    for (let gy = y0; gy <= y + h + step; gy += step) {
      ctx.beginPath()
      ctx.arc(gx, gy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
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
  if (obj.type === 'hatchRegion' || obj.type === 'texto' || obj.type === 'bloque') {
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

/** Lado de la manija en unidades de mundo: ~7 px de pantalla, nunca mayor que ~22 % del lado menor. */
export const RESIZE_HANDLE_SCREEN_PX = 7

export function resizeHandleWorldSize(obj, zoom = 1) {
  const z = Math.max(0.001, Number(zoom) || 1)
  const screenWorld = RESIZE_HANDLE_SCREEN_PX / z
  const bb = objectBoundsOf(obj)
  const minDim = Math.min(bb?.w || Infinity, bb?.h || Infinity)
  if (!Number.isFinite(minDim) || minDim <= 0) return screenWorld
  const cap = Math.max(minDim * 0.22, 0.8 / z)
  return Math.min(screenWorld, cap)
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
  if (origin.type === 'hatchRegion' || origin.type === 'texto' || origin.type === 'bloque') {
    const w0 = Math.max(1, origin.w || 1)
    const h0 = Math.max(1, origin.h || 1)
    const box = resizeBox(
      origin.x || 0,
      origin.y || 0,
      (origin.x || 0) + w0,
      (origin.y || 0) + h0,
      handleId,
      point,
    )
    const nw = Math.max(origin.type === 'bloque' ? 8 : 24, Math.abs(box.x2 - box.x1))
    const nh = Math.max(origin.type === 'bloque' ? 8 : 20, Math.abs(box.y2 - box.y1))
    const next = {
      ...origin,
      x: Math.min(box.x1, box.x2),
      y: Math.min(box.y1, box.y2),
      w: nw,
      h: nh,
    }
    if (origin.type === 'bloque') {
      next.children = (origin.children || []).map((ch) => scaleLocalXY(ch, nw / w0, nh / h0))
    }
    return next
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

/** Margen angular (grados) para atraer a 0/90/180/270 sin bloquear ángulos intermedios. */
export const SOFT_ORTHO_TOLERANCE_DEG = 8

/** Etiquetas cortas tipo CAD junto al marcador. */
export const SNAP_KIND_LABEL = {
  end: 'Extremo',
  mid: 'Medio',
  center: 'Centro',
  quad: 'Cuad.',
  node: 'Nodo',
  near: 'Cercano',
  perp: '⊥',
  ortho: 'Ortho',
}

const KIND_BIAS = {
  end: 0,
  node: 0.2,
  mid: 0.25,
  center: 0.25,
  quad: 0.3,
  perp: 0.35,
  near: 1.15,
}

/** Segmentos, curvas y puntos de referencia de un objeto (para snap). */
export function collectSnapGeometry(objects, excludeId = null) {
  const points = []
  const segments = []
  const curves = []
  for (const obj of objects || []) {
    if (!obj || obj.id === excludeId) continue
    if (obj.type === 'image' && obj.fit) continue
    if (obj.type === 'nodo') {
      points.push({ x: obj.x || 0, y: obj.y || 0, kind: 'node' })
      continue
    }
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
      let sx = 0
      let sy = 0
      for (let i = 0; i < corners.length; i += 1) {
        const a = corners[i]
        const b = corners[(i + 1) % corners.length]
        sx += a.x
        sy += a.y
        points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
        segments.push({ a, b })
      }
      if (corners.length) {
        points.push({ x: sx / corners.length, y: sy / corners.length, kind: 'center' })
      }
      continue
    }
    if (obj.type === 'elipse') {
      const cx = (obj.x1 + obj.x2) / 2
      const cy = (obj.y1 + obj.y2) / 2
      const rx = Math.abs(obj.x2 - obj.x1) / 2
      const ry = Math.abs(obj.y2 - obj.y1) / 2
      points.push({ x: cx, y: cy, kind: 'center' })
      points.push(
        { x: cx + rx, y: cy, kind: 'quad' },
        { x: cx - rx, y: cy, kind: 'quad' },
        { x: cx, y: cy + ry, kind: 'quad' },
        { x: cx, y: cy - ry, kind: 'quad' },
      )
      curves.push({ type: 'ellipse', cx, cy, rx, ry })
      continue
    }
    if (obj.type === 'stroke' || obj.type === 'polilinea') {
      const pts = obj.points || []
      if (pts.length) {
        points.push({ ...pts[0], kind: 'end' }, { ...pts[pts.length - 1], kind: 'end' })
        for (let i = 1; i < pts.length - 1; i += 1) {
          const pt = pts[i]
          if (!pt) continue
          points.push({ x: pt.x, y: pt.y, kind: 'node' })
        }
        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i]
          const b = pts[i + 1]
          if (!a || !b) continue
          segments.push({ a, b })
          points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
        }
      }
    }
  }
  return { points, segments, curves }
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

/** Proyección radial sobre elipse alineada a ejes (exacta en circunferencia). */
export function nearestOnEllipse(p, cx, cy, rx, ry) {
  const safeRx = Math.max(rx, 1e-6)
  const safeRy = Math.max(ry, 1e-6)
  const u = (p.x - cx) / safeRx
  const v = (p.y - cy) / safeRy
  const d = Math.hypot(u, v)
  if (d < 1e-9) return { x: cx + safeRx, y: cy }
  return { x: cx + (u / d) * safeRx, y: cy + (v / d) * safeRy }
}

function angleDiffAbs(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = (Math.PI * 2) - d
  return d
}

/**
 * Ángulo de la última línea/flecha (eje de referencia). Si no hay, 0 (ejes del lienzo).
 */
export function lastLineReferenceAngle(objects) {
  const list = objects || []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const o = list[i]
    if (!o || !LINE_TOOLS.has(o.type)) continue
    const dx = (o.x2 || 0) - (o.x1 || 0)
    const dy = (o.y2 || 0) - (o.y1 || 0)
    if (Math.hypot(dx, dy) < 1e-6) continue
    return Math.atan2(dy, dx)
  }
  return 0
}

/**
 * Atrae el extremo hacia 0/90/180/270 relativos al eje de referencia
 * si el ángulo cae dentro de `toleranceDeg`. No es un forzado rígido.
 * Devuelve null si el usuario está claramente en un ángulo intermedio.
 */
export function applySoftOrtho(from, to, {
  referenceAngle = 0,
  toleranceDeg = SOFT_ORTHO_TOLERANCE_DEG,
} = {}) {
  if (!from || !to) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 6) return null
  const ang = Math.atan2(dy, dx)
  const tol = (toleranceDeg * Math.PI) / 180
  let bestDelta = Infinity
  let bestTarget = ang
  for (let k = 0; k < 4; k += 1) {
    const target = referenceAngle + (k * Math.PI) / 2
    const delta = angleDiffAbs(ang, target)
    if (delta < bestDelta) {
      bestDelta = delta
      bestTarget = target
    }
  }
  if (bestDelta > tol) return null
  const x = from.x + Math.cos(bestTarget) * len
  const y = from.y + Math.sin(bestTarget) * len
  return {
    x,
    y,
    kind: 'ortho',
    guide: { a: { ...from }, b: { x, y } },
  }
}

function considerSnap(best, p, x, y, kind, extra = {}) {
  const d = Math.hypot(p.x - x, p.y - y)
  const bias = KIND_BIAS[kind] ?? 0.5
  const score = d + bias
  if (d > best.threshold) return
  if (score >= best.score) return
  best.score = score
  best.hit = { x, y, kind, ...extra }
}

function nearDiscretePoint(foot, points, minDist) {
  for (const pt of points) {
    if (Math.hypot(foot.x - pt.x, foot.y - pt.y) < minDist) return true
  }
  return false
}

/**
 * Busca el mejor snap cerca de `p`.
 * Si `fromPoint` está definido (segundo clic de línea), también evalúa pies perpendiculares.
 * Nearest (proyección sobre borde/curva) está activo por defecto.
 */
export function findSnap(p, objects, {
  excludeId = null,
  threshold = 12,
  fromPoint = null,
  allowNear = true,
  /** Alias legado: si true, fuerza nearest aunque allowNear sea false. */
  allowEdgeProject = false,
} = {}) {
  const { points, segments, curves } = collectSnapGeometry(objects, excludeId)
  const best = { score: Infinity, hit: null, threshold }

  for (const pt of points) {
    considerSnap(best, p, pt.x, pt.y, pt.kind)
  }

  if (fromPoint) {
    const perpThresh = threshold * 0.85
    const prevThresh = best.threshold
    best.threshold = perpThresh
    for (const seg of segments) {
      const { foot, t } = distPointSeg(fromPoint, seg.a, seg.b)
      if (t < 0 || t > 1) continue
      if (Math.hypot(foot.x - fromPoint.x, foot.y - fromPoint.y) < 4) continue
      considerSnap(best, p, foot.x, foot.y, 'perp', {
        guide: { a: { ...fromPoint }, b: { ...foot }, seg },
      })
    }
    for (const curve of curves) {
      const foot = nearestOnEllipse(fromPoint, curve.cx, curve.cy, curve.rx, curve.ry)
      if (Math.hypot(foot.x - fromPoint.x, foot.y - fromPoint.y) < 4) continue
      considerSnap(best, p, foot.x, foot.y, 'perp', {
        guide: { a: { ...fromPoint }, b: { ...foot } },
      })
    }
    best.threshold = prevThresh
  }

  const wantNear = allowNear || allowEdgeProject
  if (wantNear) {
    const skip = Math.max(4, threshold * 0.45)
    for (const seg of segments) {
      const { foot, t } = distPointSeg(p, seg.a, seg.b)
      if (t <= 0.08 || t >= 0.92) continue
      if (nearDiscretePoint(foot, points, skip)) continue
      considerSnap(best, p, foot.x, foot.y, 'near', { guide: { a: seg.a, b: seg.b } })
    }
    for (const curve of curves) {
      const foot = nearestOnEllipse(p, curve.cx, curve.cy, curve.rx, curve.ry)
      if (nearDiscretePoint(foot, points, skip)) continue
      considerSnap(best, p, foot.x, foot.y, 'near')
    }
  }

  return best.hit
}

const SNAP_FILL = {
  end: '#2563eb',
  mid: '#22c55e',
  center: '#a855f7',
  quad: '#06b6d4',
  node: '#ec4899',
  near: '#64748b',
  perp: '#f59e0b',
  ortho: '#94a3b8',
}

export function drawSnapMarker(ctx, snap, zoom = 1) {
  if (!snap || !ctx) return
  const z = zoom || 1
  const s = Math.max(6, 8 / z)
  const fill = SNAP_FILL[snap.kind] || '#2563eb'
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  if (snap.guide?.a && snap.guide?.b) {
    ctx.strokeStyle = snap.kind === 'ortho' ? 'rgba(148, 163, 184, 0.7)' : 'rgba(37, 99, 235, 0.55)'
    ctx.lineWidth = 1 / z
    ctx.setLineDash([4 / z, 3 / z])
    ctx.beginPath()
    ctx.moveTo(snap.guide.a.x, snap.guide.a.y)
    ctx.lineTo(snap.guide.b.x, snap.guide.b.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.strokeStyle = fill
  ctx.fillStyle = fill
  ctx.lineWidth = 1.5 / z
  ctx.beginPath()
  if (snap.kind === 'end') {
    ctx.rect(snap.x - s / 2, snap.y - s / 2, s, s)
  } else if (snap.kind === 'mid') {
    ctx.moveTo(snap.x, snap.y - s * 0.7)
    ctx.lineTo(snap.x + s * 0.65, snap.y + s * 0.5)
    ctx.lineTo(snap.x - s * 0.65, snap.y + s * 0.5)
    ctx.closePath()
  } else if (snap.kind === 'center') {
    ctx.arc(snap.x, snap.y, s * 0.55, 0, Math.PI * 2)
  } else if (snap.kind === 'quad' || snap.kind === 'perp') {
    ctx.moveTo(snap.x, snap.y - s)
    ctx.lineTo(snap.x + s, snap.y)
    ctx.lineTo(snap.x, snap.y + s)
    ctx.lineTo(snap.x - s, snap.y)
    ctx.closePath()
  } else if (snap.kind === 'node') {
    ctx.arc(snap.x, snap.y, s * 0.45, 0, Math.PI * 2)
  } else if (snap.kind === 'near') {
    ctx.moveTo(snap.x - s * 0.55, snap.y - s * 0.7)
    ctx.lineTo(snap.x + s * 0.55, snap.y - s * 0.15)
    ctx.lineTo(snap.x - s * 0.55, snap.y + s * 0.15)
    ctx.lineTo(snap.x + s * 0.55, snap.y + s * 0.7)
  } else if (snap.kind === 'ortho') {
    ctx.rect(snap.x - s * 0.25, snap.y - s * 0.25, s * 0.5, s * 0.5)
  } else {
    ctx.arc(snap.x, snap.y, s / 2, 0, Math.PI * 2)
  }
  if (snap.kind === 'near' || snap.kind === 'ortho') {
    ctx.stroke()
  } else {
    ctx.fill()
    ctx.stroke()
  }
  if (snap.kind === 'node') {
    ctx.beginPath()
    ctx.moveTo(snap.x - s * 0.35, snap.y - s * 0.35)
    ctx.lineTo(snap.x + s * 0.35, snap.y + s * 0.35)
    ctx.moveTo(snap.x + s * 0.35, snap.y - s * 0.35)
    ctx.lineTo(snap.x - s * 0.35, snap.y + s * 0.35)
    ctx.stroke()
  }
  if (snap.kind === 'center') {
    ctx.beginPath()
    ctx.arc(snap.x, snap.y, s * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }
  ctx.restore()
}

export function drawResizeHandles(ctx, obj, zoom = 1) {
  const handles = getResizeHandles(obj)
  if (!handles.length) return
  const size = resizeHandleWorldSize(obj, zoom)
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  for (const h of handles) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = Math.min(1.25 / z, size * 0.18)
    ctx.beginPath()
    ctx.rect(h.x - size / 2, h.y - size / 2, size, size)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** Elipse/círculo desde el centro: `a` es el centro, `b` un punto del borde. */
export function ellipseFromCenter(cx, cy, px, py, {
  circle = false,
  rxWorld = null,
  ryWorld = null,
} = {}) {
  let rx = Math.abs((px ?? cx) - cx)
  let ry = Math.abs((py ?? cy) - cy)
  if (circle) {
    const r = Math.hypot((px ?? cx) - cx, (py ?? cy) - cy)
    rx = r
    ry = r
  }
  if (rxWorld != null) rx = rxWorld
  if (ryWorld != null) ry = ryWorld
  else if (rxWorld != null && circle) ry = rxWorld
  rx = Math.max(rx, 0.5)
  ry = Math.max(ry, 0.5)
  return {
    x1: cx - rx,
    y1: cy - ry,
    x2: cx + rx,
    y2: cy + ry,
  }
}

export function objectCenterOf(obj) {
  if (!obj) return { x: 0, y: 0 }
  if (obj.type === 'nodo') return { x: obj.x || 0, y: obj.y || 0 }
  if (Array.isArray(obj.points) && obj.points.length) {
    const sx = obj.points.reduce((s, p) => s + (p.x || 0), 0)
    const sy = obj.points.reduce((s, p) => s + (p.y || 0), 0)
    return { x: sx / obj.points.length, y: sy / obj.points.length }
  }
  if (obj.x1 != null && obj.x2 != null) {
    return { x: (obj.x1 + obj.x2) / 2, y: ((obj.y1 || 0) + (obj.y2 || 0)) / 2 }
  }
  const w = obj.w || (obj.cols ? (obj.cols * (obj.cellW || 78)) : 0)
  const h = obj.h || (obj.rows ? (obj.rows * (obj.cellH || 30)) : 0)
  return { x: (obj.x || 0) + w / 2, y: (obj.y || 0) + h / 2 }
}

export function nodeMarkerWorldRadius(zoom = 1) {
  const z = Math.max(0.001, Number(zoom) || 1)
  return Math.min(2.6 / z, 2.2)
}

export function selectionRectFromDrag(from, to) {
  const x1 = from?.x || 0
  const y1 = from?.y || 0
  const x2 = to?.x || 0
  const y2 = to?.y || 0
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    crossing: x2 < x1,
  }
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

function rectContainsRect(outer, inner) {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function objectMatchesSelectionRect(obj, rect, crossing) {
  if (!obj || (obj.type === 'image' && obj.fit)) return false
  if (obj.type === 'nodo') {
    return pointInRect({ x: obj.x || 0, y: obj.y || 0 }, rect)
  }
  const bb = objectBoundsOf(obj)
  if (!bb) return false
  if (crossing) return rectsIntersect(rect, bb)
  return rectContainsRect(rect, bb)
}

export function selectIdsInDrag(objects, from, to) {
  const rect = selectionRectFromDrag(from, to)
  if (rect.w < 2 && rect.h < 2) return []
  return (objects || [])
    .filter((o) => objectMatchesSelectionRect(o, rect, rect.crossing))
    .map((o) => o.id)
    .filter(Boolean)
}

export function drawSelectionMarquee(ctx, from, to, zoom = 1) {
  if (!ctx || !from || !to) return
  const rect = selectionRectFromDrag(from, to)
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = rect.crossing ? 'rgba(22, 163, 74, 0.10)' : 'rgba(37, 99, 235, 0.10)'
  ctx.strokeStyle = rect.crossing ? '#16a34a' : '#2563eb'
  ctx.lineWidth = 1.15 / z
  if (rect.crossing) ctx.setLineDash([5 / z, 3 / z])
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

export function objectBoundsOf(obj) {
  if (!obj) return null
  if (obj.type === 'nodo') {
    return { x: (obj.x || 0) - 6, y: (obj.y || 0) - 6, w: 12, h: 12 }
  }
  if (Array.isArray(obj.points) && obj.points.length) {
    let minX = obj.points[0].x
    let maxX = obj.points[0].x
    let minY = obj.points[0].y
    let maxY = obj.points[0].y
    for (const p of obj.points) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  if (obj.x1 != null && obj.x2 != null) {
    return {
      x: Math.min(obj.x1, obj.x2),
      y: Math.min(obj.y1, obj.y2),
      w: Math.abs(obj.x2 - obj.x1),
      h: Math.abs(obj.y2 - obj.y1),
    }
  }
  const w = obj.w || (obj.cols ? (obj.cols * (obj.cellW || 78)) : 0)
  const h = obj.h || (obj.rows ? (obj.rows * (obj.cellH || 30)) : 0)
  return { x: obj.x || 0, y: obj.y || 0, w, h }
}

/** Manijas dedicadas: rotación (arriba del centro) y escala uniforme (esquina NE). */
export function getTransformHandles(obj, zoom = 1) {
  const bb = objectBoundsOf(obj)
  const c = objectCenterOf(obj)
  if (!bb || !c) return []
  const lift = Math.max(22, 26 / (zoom || 1))
  return [
    { id: 'rotate', x: c.x, y: bb.y - lift },
    { id: 'scale', x: bb.x + bb.w, y: bb.y },
  ]
}

export function hitTransformHandle(p, obj, threshold = 12, zoom = 1) {
  const handles = getTransformHandles(obj, zoom)
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

export function drawTransformHandles(ctx, obj, zoom = 1) {
  const handles = getTransformHandles(obj, zoom)
  if (!handles.length) return
  const z = zoom || 1
  const s = Math.max(8, 10 / z)
  const c = objectCenterOf(obj)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)'
  ctx.lineWidth = 1 / z
  ctx.setLineDash([3 / z, 3 / z])
  const rot = handles.find((h) => h.id === 'rotate')
  if (rot) {
    ctx.beginPath()
    ctx.moveTo(c.x, c.y)
    ctx.lineTo(rot.x, rot.y)
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (const h of handles) {
    ctx.beginPath()
    if (h.id === 'rotate') {
      ctx.strokeStyle = '#7c3aed'
      ctx.fillStyle = '#ede9fe'
      ctx.lineWidth = 1.6 / z
      ctx.arc(h.x, h.y, s * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.strokeStyle = '#059669'
      ctx.fillStyle = '#d1fae5'
      ctx.lineWidth = 1.6 / z
      ctx.rect(h.x - s / 2, h.y - s / 2, s, s)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function scaleLocalXY(obj, sx, sy) {
  if (!obj) return obj
  const fx = Number.isFinite(sx) ? sx : 1
  const fy = Number.isFinite(sy) ? sy : 1
  if (obj.type === 'bloque') {
    return {
      ...obj,
      x: (obj.x || 0) * fx,
      y: (obj.y || 0) * fy,
      w: (obj.w || 0) * fx,
      h: (obj.h || 0) * fy,
      children: (obj.children || []).map((ch) => scaleLocalXY(ch, fx, fy)),
    }
  }
  if (Array.isArray(obj.points)) {
    return {
      ...obj,
      points: obj.points.map((p) => ({ ...p, x: p.x * fx, y: p.y * fy })),
      width: obj.width != null ? obj.width * Math.max(fx, fy) : obj.width,
    }
  }
  if (obj.type === 'nodo') {
    return { ...obj, x: (obj.x || 0) * fx, y: (obj.y || 0) * fy }
  }
  if (obj.x1 != null && obj.x2 != null) {
    return {
      ...obj,
      x1: obj.x1 * fx,
      y1: obj.y1 * fy,
      x2: obj.x2 * fx,
      y2: obj.y2 * fy,
      width: obj.width != null ? obj.width * Math.max(fx, fy) : obj.width,
    }
  }
  if (obj.type === 'tabla') {
    return {
      ...obj,
      x: (obj.x || 0) * fx,
      y: (obj.y || 0) * fy,
      cellW: (obj.cellW || 78) * fx,
      cellH: (obj.cellH || 30) * fy,
    }
  }
  if (obj.w != null || obj.h != null) {
    const next = {
      ...obj,
      x: (obj.x || 0) * fx,
      y: (obj.y || 0) * fy,
      w: (obj.w || 0) * fx,
      h: (obj.h || 0) * fy,
    }
    if (obj.fontSize) next.fontSize = Math.max(8, obj.fontSize * Math.max(fx, fy))
    return next
  }
  return obj
}

export function scaleObjectUniform(obj, factor, center) {
  if (!obj || !Number.isFinite(factor) || factor <= 0.02) return obj
  const c = center || objectCenterOf(obj)
  const sc = (x, y) => ({
    x: c.x + (x - c.x) * factor,
    y: c.y + (y - c.y) * factor,
  })
  if (obj.type === 'bloque') {
    const w = Math.max(8, (obj.w || 0) * factor)
    const h = Math.max(8, (obj.h || 0) * factor)
    return {
      ...obj,
      w,
      h,
      x: c.x - w / 2,
      y: c.y - h / 2,
      children: (obj.children || []).map((ch) => scaleLocalXY(ch, factor, factor)),
    }
  }
  if (obj.type === 'nodo') return { ...obj }
  if (Array.isArray(obj.points)) {
    return { ...obj, points: obj.points.map((p) => sc(p.x, p.y)) }
  }
  if (obj.x1 != null && obj.x2 != null) {
    const a = sc(obj.x1, obj.y1)
    const b = sc(obj.x2, obj.y2)
    return { ...obj, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }
  if (obj.type === 'tabla') {
    const cols = Math.max(1, obj.cols || 1)
    const rows = Math.max(1, obj.rows || 1)
    const w0 = cols * (obj.cellW || 78)
    const h0 = rows * (obj.cellH || 30)
    const nw = Math.max(cols * 24, w0 * factor)
    const nh = Math.max(rows * 18, h0 * factor)
    return {
      ...obj,
      x: c.x - nw / 2,
      y: c.y - nh / 2,
      cellW: nw / cols,
      cellH: nh / rows,
    }
  }
  if (obj.w != null || obj.h != null) {
    const w = Math.max(16, (obj.w || 0) * factor)
    const h = Math.max(16, (obj.h || 0) * factor)
    const next = { ...obj, w, h, x: c.x - w / 2, y: c.y - h / 2 }
    if (obj.fontSize) next.fontSize = Math.max(8, obj.fontSize * factor)
    return next
  }
  return obj
}

export function drawMoveGuide(ctx, from, to, zoom = 1) {
  if (!ctx || !from || !to) return
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.7)'
  ctx.lineWidth = 1.25 / z
  ctx.setLineDash([6 / z, 4 / z])
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const ah = 10 / z
  ctx.fillStyle = 'rgba(37, 99, 235, 0.8)'
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - ah * Math.cos(ang - 0.4), to.y - ah * Math.sin(ang - 0.4))
  ctx.lineTo(to.x - ah * Math.cos(ang + 0.4), to.y - ah * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Norte en espacio de pantalla (después de restore del mundo). +Y del lienzo = Norte. */
export function landscapeExportSize(width, height) {
  const w = Math.max(1, Number(width) || 1)
  const h = Math.max(1, Number(height) || 1)
  return { w: Math.max(w, h), h }
}

export function drawNorthIndicator(ctx, canvasW, canvasH, origin = null) {
  if (!ctx || !canvasW || !canvasH) return
  const ox = origin?.x || 0
  const oy = origin?.y || 0
  const size = 34
  const cx = ox + 22 + size / 2
  const cy = oy + canvasH - 22 - size / 2
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(cx, cy - size * 0.36)
  ctx.lineTo(cx + 5.5, cy + 4)
  ctx.lineTo(cx, cy - 3)
  ctx.lineTo(cx - 5.5, cy + 4)
  ctx.closePath()
  ctx.fill()
  ctx.font = '700 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', cx, cy + size * 0.28)
  ctx.restore()
}
