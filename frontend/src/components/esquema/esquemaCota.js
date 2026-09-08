/**
 * Línea de cota de dibujo técnico: extensiones, flechas y texto en metros.
 */
import { cotaArrowHeadLength, cotaLayout, DEFAULT_COTA_OFFSET, formatMeters } from './esquemaGeometry.js'
import { esquemaEntityInk, resolveEsquemaUi } from './esquemaTheme.js'

export { DEFAULT_COTA_OFFSET }

export function cotaText(obj) {
  const L = cotaLayout(obj)
  return formatMeters(L.len)
}

export function createCota(a, b, extras = {}) {
  const obj = {
    type: 'cota',
    x1: a?.x || 0,
    y1: a?.y || 0,
    x2: b?.x || 0,
    y2: b?.y || 0,
    offset: Number.isFinite(extras.offset) ? extras.offset : DEFAULT_COTA_OFFSET,
    color: extras.color || extras.ink || undefined,
    width: extras.width != null ? extras.width : 1,
    rotation: 0,
  }
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

export function drawCota(ctx, obj, selected = false, zoom = 1, ui) {
  if (!ctx || !obj) return
  const palette = resolveEsquemaUi(ui)
  const L = cotaLayout(obj)
  if (L.len < 0.8) return
  const z = zoom || 1
  const color = esquemaEntityInk(obj.color, palette)
  const lw = Math.max(0.7, obj.width || 1)
  const head = Math.min(cotaArrowHeadLength(z), L.len * 0.45)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
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
  const label = obj.text || cotaText(obj)
  const fs = Math.max(9, Math.min(16, 12 / Math.sqrt(Math.max(z, 0.35))))
  ctx.font = `600 ${fs}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lift = 8 + fs * 0.15
  ctx.translate(L.mid.x, L.mid.y)
  let rot = L.angle
  if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI
  ctx.rotate(rot)
  ctx.fillStyle = selected ? palette.selection : color
  ctx.fillText(label, 0, -lift)
  ctx.restore()
}
