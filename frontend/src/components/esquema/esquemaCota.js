/**
 * Cotas de dibujo técnico: lineal, ángulo, radio y diámetro.
 */
import {
  angleDegBetween,
  cotaArrowHeadLength,
  cotaKindOf,
  cotaLayout,
  DEFAULT_ANGLE_RADIUS,
  DEFAULT_COTA_OFFSET,
  ellipseCenterRadii,
  formatMeters,
  lineLineIntersection,
  pointOnEllipseToward,
} from './esquemaGeometry.js'
import { esquemaEntityInk, resolveEsquemaUi } from './esquemaTheme.js'

export { DEFAULT_COTA_OFFSET, DEFAULT_ANGLE_RADIUS }

export function formatAngleDeg(deg) {
  const n = Number(deg)
  if (!Number.isFinite(n)) return ''
  const abs = Math.abs(n)
  const d = abs >= 10 ? 1 : 2
  return `${n.toFixed(d)}°`
}

export function cotaText(obj) {
  const kind = cotaKindOf(obj)
  if (kind === 'angle') {
    const v = { x: obj.x1 || 0, y: obj.y1 || 0 }
    const d1 = { x: (obj.x2 || 0) - v.x, y: (obj.y2 || 0) - v.y }
    const d2 = { x: (obj.x3 || 0) - v.x, y: (obj.y3 || 0) - v.y }
    return formatAngleDeg(angleDegBetween(d1, d2))
  }
  const L = cotaLayout(obj)
  if (kind === 'radio') return `R ${formatMeters(L.len)}`
  if (kind === 'diametro') return `⌀ ${formatMeters(L.len)}`
  return formatMeters(L.len)
}

export function createCota(a, b, extras = {}) {
  const obj = {
    type: 'cota',
    kind: extras.kind || 'linear',
    x1: a?.x || 0,
    y1: a?.y || 0,
    x2: b?.x || 0,
    y2: b?.y || 0,
    offset: Number.isFinite(extras.offset) ? extras.offset : DEFAULT_COTA_OFFSET,
    color: extras.color || extras.ink || undefined,
    width: extras.width != null ? extras.width : 1,
    rotation: 0,
  }
  if (extras.x3 != null) {
    obj.x3 = extras.x3
    obj.y3 = extras.y3
  }
  obj.text = extras.text || cotaText(obj)
  return obj
}

export function createCotaAngle(vertex, a, b, extras = {}) {
  const obj = createCota(vertex, a, {
    ...extras,
    kind: 'angle',
    offset: Number.isFinite(extras.offset) ? extras.offset : DEFAULT_ANGLE_RADIUS,
    x3: b?.x,
    y3: b?.y,
  })
  obj.text = cotaText(obj)
  return obj
}

export function createCotaFromSegments(segA, segB, extras = {}) {
  const v = lineLineIntersection(segA.a, segA.b, segB.a, segB.b)
  if (!v) return null
  const pick = extras.pickA || segA.a
  const pickB = extras.pickB || segB.a
  const p1 = Math.hypot(pick.x - v.x, pick.y - v.y) > 2 ? pick : segA.b
  const p2 = Math.hypot(pickB.x - v.x, pickB.y - v.y) > 2 ? pickB : segB.b
  return createCotaAngle(v, p1, p2, extras)
}

export function createCotaRadio(ellipse, toward, extras = {}) {
  const { cx, cy } = ellipseCenterRadii(ellipse)
  const rim = pointOnEllipseToward(ellipse, toward || { x: cx + 1, y: cy })
  const obj = createCota({ x: cx, y: cy }, rim, { ...extras, kind: 'radio', offset: 0 })
  obj.text = cotaText(obj)
  return obj
}

export function createCotaDiametro(ellipse, toward, extras = {}) {
  const { cx, cy } = ellipseCenterRadii(ellipse)
  const rim = pointOnEllipseToward(ellipse, toward || { x: cx + 1, y: cy })
  const a = { x: cx * 2 - rim.x, y: cy * 2 - rim.y }
  const obj = createCota(a, rim, { ...extras, kind: 'diametro', offset: 0 })
  obj.text = cotaText(obj)
  return obj
}

function drawHead(ctx, tip, from, len) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x)
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(tip.x - len * Math.cos(ang - 0.38), tip.y - len * Math.sin(ang - 0.38))
  ctx.lineTo(tip.x - len * Math.cos(ang + 0.38), tip.y - len * Math.sin(ang + 0.38))
  ctx.closePath()
  ctx.fill()
}

function drawLabel(ctx, obj, selected, zoom, color, palette, at, rot) {
  const z = zoom || 1
  const label = obj.text || cotaText(obj)
  const fs = Math.max(9, Math.min(16, 12 / Math.sqrt(Math.max(z, 0.35))))
  ctx.save()
  ctx.translate(at.x, at.y)
  let r = rot || 0
  if (r > Math.PI / 2 || r < -Math.PI / 2) r += Math.PI
  ctx.rotate(r)
  ctx.font = `600 ${fs}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = selected ? palette.selection : color
  ctx.fillText(label, 0, -(8 + fs * 0.15))
  ctx.restore()
}

export function drawCota(ctx, obj, selected = false, zoom = 1, ui) {
  if (!ctx || !obj) return
  const palette = resolveEsquemaUi(ui)
  const kind = cotaKindOf(obj)
  const L = cotaLayout(obj)
  const z = zoom || 1
  const color = esquemaEntityInk(obj.color, palette)
  const lw = Math.max(0.7, obj.width || 1)
  const head = Math.min(cotaArrowHeadLength(z), Math.max(4, L.len * 0.45))
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  if (kind === 'angle') {
    if (L.len < 4) { ctx.restore(); return }
    ctx.beginPath()
    ctx.arc(L.vertex.x, L.vertex.y, L.len, L.ang1, L.ang2, L.delta < 0)
    ctx.stroke()
    const t1 = L.ang1 + (L.delta < 0 ? -0.18 : 0.18)
    const t2 = L.ang2 + (L.delta < 0 ? 0.18 : -0.18)
    drawHead(ctx, L.d1, {
      x: L.vertex.x + Math.cos(t1) * L.len,
      y: L.vertex.y + Math.sin(t1) * L.len,
    }, head)
    drawHead(ctx, L.d2, {
      x: L.vertex.x + Math.cos(t2) * L.len,
      y: L.vertex.y + Math.sin(t2) * L.len,
    }, head)
    drawLabel(ctx, obj, selected, z, color, palette, L.mid, L.angle)
    ctx.restore()
    return
  }

  if (L.len < 0.8) { ctx.restore(); return }

  if (kind === 'radio') {
    ctx.beginPath()
    ctx.moveTo(L.a.x, L.a.y)
    ctx.lineTo(L.b.x, L.b.y)
    ctx.stroke()
    drawHead(ctx, L.b, L.a, head)
    drawLabel(ctx, obj, selected, z, color, palette, L.mid, L.angle)
    ctx.restore()
    return
  }

  if (kind === 'diametro') {
    ctx.beginPath()
    ctx.moveTo(L.a.x, L.a.y)
    ctx.lineTo(L.b.x, L.b.y)
    ctx.stroke()
    drawHead(ctx, L.d1, L.d2, head)
    drawHead(ctx, L.d2, L.d1, head)
    drawLabel(ctx, obj, selected, z, color, palette, L.mid, L.angle)
    ctx.restore()
    return
  }

  ctx.beginPath()
  ctx.moveTo(L.ext1a.x, L.ext1a.y)
  ctx.lineTo(L.ext1b.x, L.ext1b.y)
  ctx.moveTo(L.ext2a.x, L.ext2a.y)
  ctx.lineTo(L.ext2b.x, L.ext2b.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(L.d1.x, L.d1.y)
  ctx.lineTo(L.d2.x, L.d2.y)
  ctx.stroke()
  drawHead(ctx, L.d1, L.d2, head)
  drawHead(ctx, L.d2, L.d1, head)
  drawLabel(ctx, obj, selected, z, color, palette, L.mid, L.angle)
  ctx.restore()
}
