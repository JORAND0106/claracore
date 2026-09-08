/**
 * Área de una región cerrada: reutiliza detectClosedRegionFromClick del hatch.
 */
import { detectClosedRegionFromClick } from './esquemaHatch.js'
import { floodPixelsToM2, formatAreaM2 } from './esquemaGeometry.js'
import { esquemaEntityInk, resolveEsquemaUi } from './esquemaTheme.js'

export function createAreaLabel({ x, y, areaM2, color } = {}) {
  const m2 = Number(areaM2)
  const text = formatAreaM2(m2)
  return {
    type: 'areaLabel',
    x: x || 0,
    y: y || 0,
    w: 108,
    h: 24,
    areaM2: Number.isFinite(m2) ? m2 : 0,
    text,
    color: color || undefined,
    rotation: 0,
  }
}

export function createAreaLabelFromClick(objects, worldX, worldY, color) {
  const region = detectClosedRegionFromClick(objects, worldX, worldY)
  if (!region) return null
  const areaM2 = floodPixelsToM2(region.count, region.scale)
  if (!(areaM2 > 0)) return null
  return createAreaLabel({ x: worldX, y: worldY, areaM2, color })
}

export function drawAreaLabel(ctx, obj, selected = false, zoom = 1, ui) {
  if (!ctx || !obj) return
  const palette = resolveEsquemaUi(ui)
  const color = esquemaEntityInk(obj.color, palette)
  const z = zoom || 1
  const fs = Math.max(10, Math.min(16, 12 / Math.sqrt(Math.max(z, 0.35))))
  const label = obj.text || formatAreaM2(obj.areaM2)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.font = `700 ${fs}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const x = obj.x || 0
  const y = obj.y || 0
  const padX = 7
  const padY = 4
  const w = Math.max(obj.w || 0, ctx.measureText(label).width + padX * 2)
  const h = Math.max(obj.h || 0, fs + padY * 2)
  ctx.fillStyle = selected ? palette.hudTyping : palette.hudBg
  ctx.strokeStyle = selected ? palette.selection : color
  ctx.lineWidth = 1 / z
  ctx.beginPath()
  ctx.rect(x - w / 2, y - h / 2, w, h)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = selected ? palette.selection : color
  ctx.fillText(label, x, y)
  ctx.restore()
}
