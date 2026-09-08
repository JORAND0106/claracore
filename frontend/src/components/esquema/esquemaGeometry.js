/**
 * Geometría auxiliar del editor de esquema:
 * manijas de redimensionado, puntos de referencia (snap) y medidas por eje.
 */
import { resolveEsquemaUi } from './esquemaTheme.js'

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

export function formatAreaM2(m2, digits = 2) {
  const n = Number(m2)
  if (!Number.isFinite(n)) return ''
  return `${n.toFixed(digits)} m²`
}

/** Área en m² a partir del flood-fill raster del hatch: cada píxel = (1/scale)² mundo. */
export function floodPixelsToM2(count, scale) {
  const s = Number(scale)
  const n = Number(count)
  if (!Number.isFinite(n) || n < 0 || !Number.isFinite(s) || s <= 0) return 0
  return (n / (s * s)) / (PX_PER_METER * PX_PER_METER)
}

export function polygonAreaWorld(points) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (pts.length < 3) return 0
  let acc = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    acc += a.x * b.y - b.x * a.y
  }
  return Math.abs(acc) / 2
}

export function polygonAreaM2(points) {
  return polygonAreaWorld(points) / (PX_PER_METER * PX_PER_METER)
}

export function lineLineIntersection(a1, a2, b1, b2) {
  if (!a1 || !a2 || !b1 || !b2) return null
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const den = dax * dby - day * dbx
  if (Math.abs(den) < 1e-9) return null
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / den
  return { x: a1.x + t * dax, y: a1.y + t * day }
}

export function angleDegBetween(v1, v2) {
  const a = Math.atan2(v1?.y || 0, v1?.x || 0)
  const b = Math.atan2(v2?.y || 0, v2?.x || 0)
  let d = b - a
  while (d <= -Math.PI) d += Math.PI * 2
  while (d > Math.PI) d -= Math.PI * 2
  return Math.abs(d) * (180 / Math.PI)
}

export function ellipseCenterRadii(obj) {
  const cx = ((obj?.x1 || 0) + (obj?.x2 || 0)) / 2
  const cy = ((obj?.y1 || 0) + (obj?.y2 || 0)) / 2
  const rx = Math.max(0.5, Math.abs((obj?.x2 || 0) - (obj?.x1 || 0)) / 2)
  const ry = Math.max(0.5, Math.abs((obj?.y2 || 0) - (obj?.y1 || 0)) / 2)
  return { cx, cy, rx, ry }
}

/** Intersección elipse–rayo desde el centro hacia `toward` (coords locales, sin rotar). */
export function pointOnEllipseToward(obj, toward) {
  const { cx, cy, rx, ry } = ellipseCenterRadii(obj)
  const dx = (toward?.x || cx + rx) - cx
  const dy = (toward?.y || cy) - cy
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: cx + rx, y: cy }
  const ux = dx / len
  const uy = dy / len
  const den = Math.hypot(ux * ry, uy * rx)
  if (den < 1e-9) return { x: cx + rx, y: cy }
  const t = (rx * ry) / den
  return { x: cx + ux * t, y: cy + uy * t }
}

/** "2.5" | "2,5" | "3x2" | "3 x 1,20" → metros (no unidades internas). */
export function parseDynMeasure(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const polar = s.match(/^(?:([\d.,]+))?\s*<\s*(-?[\d.,]+)\s*$/)
  if (polar) {
    const w = polar[1] != null ? parsePositive(polar[1]) : null
    const deg = Number(String(polar[2]).replace(',', '.'))
    if (!Number.isFinite(deg)) return w != null ? { w, h: null } : null
    return { w, h: null, deg }
  }
  const parts = s.split(/[xX*×]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const w = parsePositive(parts[0])
  const h = parts.length >= 2 ? parsePositive(parts[1]) : null
  if (w == null && h == null) return null
  return { w, h }
}

/** Campos separados Distancia / Ángulo → mismos valores que usa pointAtPolar. */
export function polarFromFields(distRaw, angRaw) {
  const w = parsePositive(distRaw)
  const degStr = String(angRaw ?? '').trim()
  if (!degStr) return { w, deg: null }
  const deg = Number(degStr.replace(',', '.'))
  return { w, deg: Number.isFinite(deg) ? deg : null }
}

/** Teclas del HUD de Polilínea: Tab cambia de campo; cada valor se edita solo. */
export function applyPolyFieldKey({ dist = '', ang = '', field = 'dist' } = {}, key) {
  if (key === 'Tab') {
    return { dist, ang, field: field === 'dist' ? 'ang' : 'dist' }
  }
  const cur = field === 'ang' ? String(ang ?? '') : String(dist ?? '')
  let value = cur
  if (key === 'Backspace') value = cur.slice(0, -1)
  else if (/^[0-9]$/.test(key) || key === '.' || key === ',') value = cur + key
  else if (key === '-' && field === 'ang') value = cur.startsWith('-') ? cur.slice(1) : `-${cur}`
  else return null
  return field === 'ang' ? { dist, ang: value, field } : { dist: value, ang, field }
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

/** 0° = +X (derecha), 90° = +Y (abajo en el lienzo). */
export function pointAtPolar(from, toward, { meters = null, deg = null } = {}) {
  if (!from) return null
  if (deg != null && Number.isFinite(Number(deg))) {
    const ang = (Number(deg) * Math.PI) / 180
    const fallback = (toward && Math.hypot(toward.x - from.x, toward.y - from.y) > 1e-6)
      ? Math.hypot(toward.x - from.x, toward.y - from.y)
      : metersToWorld(1)
    const world = meters != null ? metersToWorld(meters) : fallback
    if (!Number.isFinite(world) || world <= 0) return null
    return { x: from.x + Math.cos(ang) * world, y: from.y + Math.sin(ang) * world }
  }
  if (meters != null) return pointAtDistance(from, toward, meters)
  return toward || null
}

export function polylineDraftPreview(points, cursor) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!cursor || !Number.isFinite(cursor.x)) return pts
  if (!pts.length) return [{ x: cursor.x, y: cursor.y }]
  return [...pts, { x: cursor.x, y: cursor.y }]
}

/** Clic en osnap discreto no debe vaciar la selección (el marcador no es un “vacío”). */
export function snapClickKeepsSelection({ hitId = null, selectedIds = [], snap = null } = {}) {
  const ids = selectedIds || []
  const discrete = snap && snap.kind && snap.kind !== 'near' && snap.kind !== 'ortho'
  if (!discrete || !ids.length) return false
  if (hitId && ids.includes(hitId)) return false
  return true
}

export function gridStepWorld(zoom) {
  const screenPerMeter = PX_PER_METER * (zoom || 1)
  if (screenPerMeter >= 90) return PX_PER_METER * 0.1
  if (screenPerMeter >= 28) return PX_PER_METER
  if (screenPerMeter >= 10) return PX_PER_METER * 5
  return PX_PER_METER * 10
}

export function drawDotGrid(ctx, view, step, zoom = 1, ui) {
  if (!ctx || !view || !step || step <= 0) return
  const { x, y, w, h } = view
  if (!w || !h) return
  const r = Math.max(0.55, 1.1 / (zoom || 1))
  const x0 = Math.floor(x / step) * step
  const y0 = Math.floor(y / step) * step
  ctx.save()
  ctx.fillStyle = resolveEsquemaUi(ui).grid
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
export function isCornerHandle(id) {
  return id === 'nw' || id === 'ne' || id === 'se' || id === 'sw'
}

export function radToDeg(rad) {
  const n = Number(rad)
  return Number.isFinite(n) ? (n * 180) / Math.PI : 0
}

export function degToRad(deg) {
  const n = Number(deg)
  return Number.isFinite(n) ? (n * Math.PI) / 180 : 0
}

/** Piso/techo en px de pantalla: siempre visibles, sin tapar figuras chicas al acercar. */
export const SNAP_MARKER_MIN_PX = 8
export const SNAP_MARKER_MAX_PX = 13
export const SNAP_MARKER_BASE_PX = 10

export function snapMarkerScreenSize(zoom) {
  const z = Math.max(0.001, Number(zoom) || 1)
  const proportional = SNAP_MARKER_BASE_PX * Math.sqrt(z)
  return Math.min(SNAP_MARKER_MAX_PX, Math.max(SNAP_MARKER_MIN_PX, proportional))
}

export function snapMarkerWorldSize(zoom) {
  const z = Math.max(0.001, Number(zoom) || 1)
  return snapMarkerScreenSize(z) / z
}

/** Umbral de detección en unidades de mundo: el marcador entero es zona caliente. */
export function snapThresholdWorld(zoom) {
  const z = Math.max(0.001, Number(zoom) || 1)
  const marker = snapMarkerScreenSize(z)
  return (marker * 0.55 + 4) / z
}

/** Cabeza de flecha proporcional al largo del cuerpo. */
export function arrowHeadLength(obj) {
  const body = Math.hypot((obj?.x2 || 0) - (obj?.x1 || 0), (obj?.y2 || 0) - (obj?.y1 || 0))
  const w = Math.max(1, obj?.width || 3)
  const scale = Number.isFinite(obj?.headScale) ? obj.headScale : 1
  if (body < 1) return (8 + w * 2) * scale
  return Math.min(body * 0.42, Math.max(body * 0.16, (8 + w * 1.6) * scale))
}

export const DEFAULT_COTA_OFFSET = 28

/** Flecha de cota: tamaño fijo en pantalla, como los marcadores de snap. */
export function cotaArrowHeadLength(zoom = 1) {
  return snapMarkerWorldSize(zoom) * 0.85
}

export function cotaKindOf(obj) {
  return obj?.kind || 'linear'
}

export const DEFAULT_ANGLE_RADIUS = 40

/** Geometría de cota: puntos de medida, línea de cota, extensiones. */
export function cotaLayout(obj) {
  if (cotaKindOf(obj) === 'angle') {
    const v = { x: obj?.x1 || 0, y: obj?.y1 || 0 }
    const p1 = { x: obj?.x2 || 0, y: obj?.y2 || 0 }
    const p2 = { x: obj?.x3 || 0, y: obj?.y3 || 0 }
    const a1 = Math.atan2(p1.y - v.y, p1.x - v.x)
    const a2 = Math.atan2(p2.y - v.y, p2.x - v.x)
    let delta = a2 - a1
    while (delta <= -Math.PI) delta += Math.PI * 2
    while (delta > Math.PI) delta -= Math.PI * 2
    const r = Math.abs(Number.isFinite(obj?.offset) ? obj.offset : DEFAULT_ANGLE_RADIUS) || DEFAULT_ANGLE_RADIUS
    const midA = a1 + delta / 2
    const d1 = { x: v.x + Math.cos(a1) * r, y: v.y + Math.sin(a1) * r }
    const d2 = { x: v.x + Math.cos(a2) * r, y: v.y + Math.sin(a2) * r }
    const mid = { x: v.x + Math.cos(midA) * r, y: v.y + Math.sin(midA) * r }
    return {
      a: v, b: v, d1, d2, mid,
      ext1a: v, ext1b: d1, ext2a: v, ext2b: d2,
      len: r, angle: midA, nx: Math.cos(midA), ny: Math.sin(midA),
      offset: r, kind: 'angle', ang1: a1, ang2: a2, delta, vertex: v,
    }
  }
  const a = { x: obj?.x1 || 0, y: obj?.y1 || 0 }
  const b = { x: obj?.x2 || 0, y: obj?.y2 || 0 }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = len > 1e-9 ? dx / len : 1
  const uy = len > 1e-9 ? dy / len : 0
  // Normal hacia "arriba" visual (+offset = -Y en trazo izquierda→derecha)
  const nx = uy
  const ny = -ux
  const off = Number.isFinite(obj?.offset) ? obj.offset : DEFAULT_COTA_OFFSET
  const sign = off < 0 ? -1 : 1
  const gap = 3
  const over = 6
  const d1 = { x: a.x + nx * off, y: a.y + ny * off }
  const d2 = { x: b.x + nx * off, y: b.y + ny * off }
  const ext1a = { x: a.x + nx * sign * gap, y: a.y + ny * sign * gap }
  const ext1b = { x: a.x + nx * (off + sign * over), y: a.y + ny * (off + sign * over) }
  const ext2a = { x: b.x + nx * sign * gap, y: b.y + ny * sign * gap }
  const ext2b = { x: b.x + nx * (off + sign * over), y: b.y + ny * (off + sign * over) }
  return {
    a, b, d1, d2, ext1a, ext1b, ext2a, ext2b,
    mid: { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 },
    len, angle: Math.atan2(dy, dx), nx, ny, offset: off,
  }
}

export function cotaSignedOffset(obj, point) {
  const a = { x: obj?.x1 || 0, y: obj?.y1 || 0 }
  const b = { x: obj?.x2 || 0, y: obj?.y2 || 0 }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9 || !point) return DEFAULT_COTA_OFFSET
  const nx = dy / len
  const ny = -dx / len
  return (point.x - a.x) * nx + (point.y - a.y) * ny
}

export function getResizeHandles(obj) {
  if (!obj) return []
  if (obj.type === 'cota') {
    const L = cotaLayout(obj)
    if (cotaKindOf(obj) !== 'linear') return [{ id: 'dim', x: L.mid.x, y: L.mid.y }]
    return [
      { id: 'a', x: L.a.x, y: L.a.y },
      { id: 'b', x: L.b.x, y: L.b.y },
      { id: 'dim', x: L.mid.x, y: L.mid.y },
    ]
  }
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

/** Manija más cercana, sin umbral: el modo Dimensionar no depende de acertar la esquina. */
export function nearestResizeHandle(p, obj) {
  return hitResizeHandle(p, obj, Number.POSITIVE_INFINITY)
}

/**
 * Aplica arrastre de manija. Conserva el lado/esquina opuesta fija.
 * Para tablas/hatchRegion ajusta x/y/w/h (o cellW/cellH de tabla).
 */
export function applyResizeHandle(origin, handleId, point) {
  if (!origin || !handleId) return origin
  if (origin.type === 'cota') {
    if (handleId === 'dim') return repositionCota(origin, point)
    if (cotaKindOf(origin) !== 'linear') return origin
    if (handleId === 'a') return { ...origin, x1: point.x, y1: point.y }
    if (handleId === 'b') return { ...origin, x2: point.x, y2: point.y }
    return origin
  }
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
    if (origin.type === 'texto' && isCornerHandle(handleId)) {
      const factor = Math.max(0.2, Math.sqrt((nw / w0) * (nh / h0)))
      next.fontSize = Math.max(8, (origin.fontSize || 16) * factor)
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

/** Extremo o esquina opuesta: origen del ⊥ al redimensionar. */
export function resizeAnchorPoint(origin, handleId) {
  if (!origin || !handleId || handleId === 'dim') return null
  if (LINE_TOOLS.has(origin.type) || origin.type === 'cota') {
    if (handleId === 'a') return objectWorldPoint(origin, { x: origin.x2, y: origin.y2 })
    if (handleId === 'b') return objectWorldPoint(origin, { x: origin.x1, y: origin.y1 })
    return null
  }
  const opp = { nw: 'se', se: 'nw', ne: 'sw', sw: 'ne', n: 's', s: 'n', e: 'w', w: 'e' }
  const otherId = opp[handleId]
  if (!otherId) return null
  const h = getResizeHandles(origin).find((x) => x.id === otherId)
  return h ? { x: h.x, y: h.y } : null
}

/** Snap al redimensionar: mismos kinds que al dibujar, excluyendo la entidad en edición. */
export function snapResizePoint(cursor, origin, handleId, others, threshold = 12) {
  if (!cursor || !origin) return null
  const fromPoint = resizeAnchorPoint(origin, handleId)
  return findSnap(cursor, others || [], {
    threshold,
    fromPoint,
    allowNear: true,
    allowPerp: handleId !== 'dim',
    excludeId: origin.id,
  })
}

/** Reposiciona la línea de cota sin alterar los puntos medidos ni el texto. */
export function repositionCota(obj, point) {
  if (!obj || obj.type !== 'cota' || !point) return obj
  const kind = cotaKindOf(obj)
  if (kind === 'angle') {
    const v = { x: obj.x1 || 0, y: obj.y1 || 0 }
    const r = Math.max(12, Math.hypot(point.x - v.x, point.y - v.y))
    return { ...obj, offset: r, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, x3: obj.x3, y3: obj.y3 }
  }
  if (kind === 'radio') {
    const c = { x: obj.x1 || 0, y: obj.y1 || 0 }
    const len = Math.hypot((obj.x2 || 0) - c.x, (obj.y2 || 0) - c.y)
    const ang = Math.atan2(point.y - c.y, point.x - c.x)
    return {
      ...obj,
      x1: c.x,
      y1: c.y,
      x2: c.x + Math.cos(ang) * len,
      y2: c.y + Math.sin(ang) * len,
    }
  }
  if (kind === 'diametro') {
    const c = { x: ((obj.x1 || 0) + (obj.x2 || 0)) / 2, y: ((obj.y1 || 0) + (obj.y2 || 0)) / 2 }
    const half = Math.hypot((obj.x2 || 0) - c.x, (obj.y2 || 0) - c.y)
    const ang = Math.atan2(point.y - c.y, point.x - c.x)
    return {
      ...obj,
      x1: c.x - Math.cos(ang) * half,
      y1: c.y - Math.sin(ang) * half,
      x2: c.x + Math.cos(ang) * half,
      y2: c.y + Math.sin(ang) * half,
    }
  }
  const offset = cotaSignedOffset(obj, point)
  return { ...obj, offset, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }
}

/** Rota todas las entidades de `ids` alrededor del mismo pivote, conservando relativas. */
export function rotateSelectionAroundPivot(objects, ids, pivot, delta) {
  const set = ids instanceof Set ? ids : new Set(ids || [])
  if (!set.size || !pivot || !Number.isFinite(delta)) return objects || []
  return (objects || []).map((o) => (
    o && set.has(o.id) ? rotateObjectAroundPivot(o, pivot, delta) : o
  ))
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
  if (handleId === 'a' || handleId === 'b' || handleId === 'dim') return 'grab'
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

function isExcludedSnapId(id, excludeId) {
  if (excludeId == null || id == null) return false
  if (Array.isArray(excludeId)) return excludeId.includes(id)
  if (excludeId instanceof Set) return excludeId.has(id)
  return id === excludeId
}

/** Segmentos, curvas y puntos de referencia de un objeto (para snap). */
export function collectSnapGeometry(objects, excludeId = null) {
  const points = []
  const segments = []
  const curves = []
  for (const obj of objects || []) {
    if (!obj || isExcludedSnapId(obj.id, excludeId)) continue
    if (obj.type === 'image' && obj.fit) continue
    if (obj.type === 'nodo') {
      points.push({ x: obj.x || 0, y: obj.y || 0, kind: 'node' })
      continue
    }
    if (LINE_TOOLS.has(obj.type) || obj.type === 'cota') {
      const a = objectWorldPoint(obj, { x: obj.x1, y: obj.y1 })
      const b = objectWorldPoint(obj, { x: obj.x2, y: obj.y2 })
      points.push({ ...a, kind: 'end' }, { ...b, kind: 'end' })
      points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
      segments.push({ a, b })
      continue
    }
    if (obj.type === 'rect' || obj.type === 'triangulo') {
      const corners = shapeCorners(obj).map((c) => objectWorldPoint(obj, c))
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
      const rot = obj.rotation || 0
      points.push({ ...objectWorldPoint(obj, { x: cx, y: cy }), kind: 'center' })
      points.push(
        { ...objectWorldPoint(obj, { x: cx + rx, y: cy }), kind: 'quad' },
        { ...objectWorldPoint(obj, { x: cx - rx, y: cy }), kind: 'quad' },
        { ...objectWorldPoint(obj, { x: cx, y: cy + ry }), kind: 'quad' },
        { ...objectWorldPoint(obj, { x: cx, y: cy - ry }), kind: 'quad' },
      )
      curves.push({ type: 'ellipse', cx, cy, rx, ry, rotation: rot })
      continue
    }
    if (obj.type === 'stroke' || obj.type === 'polilinea') {
      const pts = (obj.points || []).map((pt) => objectWorldPoint(obj, pt))
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
/** Atrae un ángulo de giro a 0/90/180/270 si cae dentro de la tolerancia. */
export function applySoftOrthoAngle(radians, toleranceDeg = SOFT_ORTHO_TOLERANCE_DEG) {
  const n = Number(radians)
  if (!Number.isFinite(n)) return 0
  const twoPi = Math.PI * 2
  const ang = ((n % twoPi) + twoPi) % twoPi
  const tol = (toleranceDeg * Math.PI) / 180
  let bestDelta = Infinity
  let best = ang
  for (let k = 0; k < 4; k += 1) {
    const target = (k * Math.PI) / 2
    const delta = angleDiffAbs(ang, target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = target
    }
  }
  if (bestDelta > tol) return n
  return best
}

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
  /** ⊥ desde fromPoint. En polilínea se apaga para no forzar el 2º segmento a 90°. */
  allowPerp = true,
  /** Alias legado: si true, fuerza nearest aunque allowNear sea false. */
  allowEdgeProject = false,
} = {}) {
  const { points, segments, curves } = collectSnapGeometry(objects, excludeId)
  const best = { score: Infinity, hit: null, threshold }

  for (const pt of points) {
    considerSnap(best, p, pt.x, pt.y, pt.kind)
  }

  if (fromPoint && allowPerp !== false) {
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
      const foot = nearestOnCurve(fromPoint, curve)
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
      const foot = nearestOnCurve(p, curve)
      if (nearDiscretePoint(foot, points, skip)) continue
      considerSnap(best, p, foot.x, foot.y, 'near')
    }
  }

  return best.hit
}

/**
 * Traslación de move con osnap de entidad.
 *
 * El arrastre no debe anclar el clic crudo: si el usuario agarra cerca de un
 * vértice, ese vértice (no el puntero) tiene que caer sobre el objetivo.
 * Causa del desfase en figuras chicas (0.20 m = 10 wu): un clic a δ del
 * vértice y un dest snappeado al objetivo dejaba el vértice en objetivo+δ.
 */
export function snapMoveDelta(cursor, originCursor, movingObjects, otherObjects, threshold = 12) {
  const ox = originCursor?.x || 0
  const oy = originCursor?.y || 0
  const cx = cursor?.x || 0
  const cy = cursor?.y || 0
  const baseDx = cx - ox
  const baseDy = cy - oy
  let bestScore = Infinity
  let best = { dx: baseDx, dy: baseDy, snap: null }

  const sources = collectSnapGeometry(movingObjects).points
  const grabTol = Math.max(1e-6, Number(threshold) * 0.4)
  const grabbed = sources.filter((src) => Math.hypot(src.x - ox, src.y - oy) <= grabTol)
  const trySources = grabbed.length ? grabbed : sources

  for (const src of trySources) {
    const hit = findSnap({ x: src.x + baseDx, y: src.y + baseDy }, otherObjects, {
      threshold,
      allowNear: true,
    })
    if (!hit) continue
    const d = Math.hypot((src.x + baseDx) - hit.x, (src.y + baseDy) - hit.y)
    const score = d + (KIND_BIAS[hit.kind] ?? 0.5)
    if (score < bestScore) {
      bestScore = score
      best = { dx: hit.x - src.x, dy: hit.y - src.y, snap: { ...hit } }
    }
  }

  if (!best.snap) {
    const cursorHit = findSnap(cursor, otherObjects, { threshold, allowNear: true })
    if (cursorHit) {
      best = {
        dx: cursorHit.x - ox,
        dy: cursorHit.y - oy,
        snap: { ...cursorHit },
      }
    }
  }

  return best
}

export function drawSnapMarker(ctx, snap, zoom = 1, ui) {
  if (!snap || !ctx) return
  const palette = resolveEsquemaUi(ui)
  const z = zoom || 1
  const s = snapMarkerWorldSize(z)
  const fill = palette.snap[snap.kind] || palette.selection
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  if (snap.guide?.a && snap.guide?.b) {
    ctx.strokeStyle = snap.kind === 'ortho' ? palette.snapOrtho : palette.snapGuide
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
    ctx.fillStyle = palette.canvas
    ctx.fill()
  }
  ctx.restore()
}

export function drawResizeHandles(ctx, obj, zoom = 1, ui) {
  const handles = getResizeHandles(obj)
  if (!handles.length) return
  const palette = resolveEsquemaUi(ui)
  const size = resizeHandleWorldSize(obj, zoom)
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  for (const h of handles) {
    ctx.fillStyle = palette.handleFill
    ctx.strokeStyle = palette.selection
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
  if (obj.type === 'nodo' || obj.type === 'areaLabel') return { x: obj.x || 0, y: obj.y || 0 }
  if (obj.type === 'cota' && cotaKindOf(obj) === 'angle') return { x: obj.x1 || 0, y: obj.y1 || 0 }
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

export function rotatePointAround(p, center, angle) {
  const a = Number(angle) || 0
  if (!p || Math.abs(a) < 1e-12) return { x: p?.x || 0, y: p?.y || 0 }
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = (p.x || 0) - (center?.x || 0)
  const dy = (p.y || 0) - (center?.y || 0)
  return {
    x: (center?.x || 0) + dx * c - dy * s,
    y: (center?.y || 0) + dx * s + dy * c,
  }
}

/** Punto de mundo vigente (tras `rotation` alrededor del centro). */
export function objectWorldPoint(obj, p) {
  if (!p) return { x: 0, y: 0 }
  const rot = obj?.rotation || 0
  if (!rot) return { x: p.x || 0, y: p.y || 0 }
  return rotatePointAround(p, objectCenterOf(obj), rot)
}

/** Segmentos de línea / polilínea en geometría vigente (post-rotación). */
export function objectWorldSegments(obj) {
  if (!obj) return []
  if (obj.type === 'linea' || obj.type === 'flecha' || obj.type === 'cota') {
    return [{
      a: objectWorldPoint(obj, { x: obj.x1 || 0, y: obj.y1 || 0 }),
      b: objectWorldPoint(obj, { x: obj.x2 || 0, y: obj.y2 || 0 }),
    }]
  }
  if (obj.type === 'polilinea' || obj.type === 'stroke') {
    const pts = (obj.points || []).map((p) => objectWorldPoint(obj, p))
    const segs = []
    for (let i = 0; i < pts.length - 1; i += 1) {
      if (!pts[i] || !pts[i + 1]) continue
      segs.push({ a: pts[i], b: pts[i + 1] })
    }
    return segs
  }
  return []
}

function nearestOnCurve(p, curve) {
  const rot = curve?.rotation || 0
  const c = { x: curve.cx, y: curve.cy }
  const local = rot ? rotatePointAround(p, c, -rot) : p
  const foot = nearestOnEllipse(local, curve.cx, curve.cy, curve.rx, curve.ry)
  return rot ? rotatePointAround(foot, c, rot) : foot
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

export function drawSelectionMarquee(ctx, from, to, zoom = 1, ui) {
  if (!ctx || !from || !to) return
  const rect = selectionRectFromDrag(from, to)
  const palette = resolveEsquemaUi(ui)
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = rect.crossing ? palette.crossingFill : palette.marqueeFill
  ctx.strokeStyle = rect.crossing ? palette.crossingStroke : palette.marqueeStroke
  ctx.lineWidth = 1.15 / z
  if (rect.crossing) ctx.setLineDash([5 / z, 3 / z])
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

export function objectBoundsOf(obj) {
  if (!obj) return null
  if (obj.type === 'areaLabel') {
    const w = obj.w || 108
    const h = obj.h || 24
    return { x: (obj.x || 0) - w / 2, y: (obj.y || 0) - h / 2, w, h }
  }
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
  if (obj.type === 'cota') {
    const L = cotaLayout(obj)
    const xs = [L.a.x, L.b.x, L.d1.x, L.d2.x, L.ext1b.x, L.ext2b.x]
    const ys = [L.a.y, L.b.y, L.d1.y, L.d2.y, L.ext1b.y, L.ext2b.y]
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
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

export function drawTransformHandles(ctx, obj, zoom = 1, ui) {
  const handles = getTransformHandles(obj, zoom)
  if (!handles.length) return
  const palette = resolveEsquemaUi(ui)
  const z = zoom || 1
  const s = Math.max(8, 10 / z)
  const c = objectCenterOf(obj)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = palette.snapGuide
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
      ctx.strokeStyle = palette.rotateStroke
      ctx.fillStyle = palette.rotateFill
      ctx.lineWidth = 1.6 / z
      ctx.arc(h.x, h.y, s * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.strokeStyle = palette.scaleStroke
      ctx.fillStyle = palette.scaleFill
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
    const next = { ...obj, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    if (obj.type === 'flecha') {
      next.width = Math.max(0.75, (obj.width || 3) * factor)
      next.headScale = (obj.headScale || 1) * factor
    }
    if (obj.type === 'cota' && Number.isFinite(obj.offset)) {
      next.offset = obj.offset * factor
    }
    return next
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

export function drawMoveGuide(ctx, from, to, zoom = 1, ui) {
  if (!ctx || !from || !to) return
  const palette = resolveEsquemaUi(ui)
  const z = zoom || 1
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = palette.guide
  ctx.lineWidth = 1.25 / z
  ctx.setLineDash([6 / z, 4 / z])
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const ah = 10 / z
  ctx.fillStyle = palette.guide
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - ah * Math.cos(ang - 0.4), to.y - ah * Math.sin(ang - 0.4))
  ctx.lineTo(to.x - ah * Math.cos(ang + 0.4), to.y - ah * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function shiftObject(obj, dx, dy) {
  if (!obj || (!dx && !dy)) return obj
  if (obj.type === 'nodo') return { ...obj, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
  if (Array.isArray(obj.points)) {
    return { ...obj, points: obj.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
  }
  if (obj.x1 != null && obj.x2 != null) {
    const next = { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
    if (obj.x3 != null) {
      next.x3 = obj.x3 + dx
      next.y3 = (obj.y3 || 0) + dy
    }
    return next
  }
  return { ...obj, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
}

/** Rota la entidad alrededor de un pivote de mundo (no solo el centro geométrico). */
export function rotateObjectAroundPivot(obj, pivot, delta) {
  if (!obj || !pivot || !Number.isFinite(delta)) return obj
  if (Math.abs(delta) < 1e-12) return obj
  const C = objectCenterOf(obj)
  const c = Math.cos(delta)
  const s = Math.sin(delta)
  const vx = C.x - pivot.x
  const vy = C.y - pivot.y
  const rx = vx * c - vy * s
  const ry = vx * s + vy * c
  const moved = shiftObject(obj, pivot.x + rx - C.x, pivot.y + ry - C.y)
  return { ...moved, rotation: (obj.rotation || 0) + delta }
}

export function drawRotatePivot(ctx, pivot, zoom = 1, ui) {
  if (!ctx || !pivot) return
  const palette = resolveEsquemaUi(ui)
  const z = zoom || 1
  const s = 7 / z
  ctx.save()
  ctx.strokeStyle = palette.rotateStroke
  ctx.lineWidth = 1.4 / z
  ctx.beginPath()
  ctx.moveTo(pivot.x - s, pivot.y)
  ctx.lineTo(pivot.x + s, pivot.y)
  ctx.moveTo(pivot.x, pivot.y - s)
  ctx.lineTo(pivot.x, pivot.y + s)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(pivot.x, pivot.y, s * 0.55, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Norte en espacio de pantalla (después de restore del mundo). +Y del lienzo = Norte. */
export function landscapeExportSize(width, height) {
  const w = Math.max(1, Number(width) || 1)
  const h = Math.max(1, Number(height) || 1)
  return { w: Math.max(w, h), h }
}

export function drawNorthIndicator(ctx, canvasW, canvasH, origin = null, ui) {
  if (!ctx || !canvasW || !canvasH) return
  const palette = resolveEsquemaUi(ui)
  const ox = origin?.x || 0
  const oy = origin?.y || 0
  const size = 34
  const cx = ox + 22 + size / 2
  const cy = oy + canvasH - 22 - size / 2
  ctx.save()
  ctx.fillStyle = palette.northFill
  ctx.strokeStyle = palette.northStroke
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = palette.northInk
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
