/**
 * Área de una región cerrada (tipo de acotación «Área» en la herramienta Acotado).
 *
 * Preferencia: área geométrica exacta de la entidad vectorial que contiene el
 * clic (Ancho×Alto, π·rx·ry, etc.). La rotación no altera ese valor.
 *
 * Fallback: flood-fill del hatch, usando el conteo *antes* de dilatar hacia el
 * grosor del trazo (la dilatación es solo visual para el relleno).
 */
import { detectClosedRegionFromClick } from './esquemaHatch.js'
import {
  exactClosedAreaM2AtPoint,
  floodPixelsToM2,
  formatAreaM2,
} from './esquemaGeometry.js'
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
  // 1) Entidad cerrada vectorial → área exacta (sin grosor ni raster).
  const exact = exactClosedAreaM2AtPoint(objects, worldX, worldY)
  if (exact != null && exact > 0) {
    return createAreaLabel({ x: worldX, y: worldY, areaM2: exact, color })
  }

  // 2) Región compuesta (líneas sueltas, etc.): flood-fill sin contar el trazo.
  const region = detectClosedRegionFromClick(objects, worldX, worldY)
  if (!region) return null
  const pixels = region.countInterior != null ? region.countInterior : region.count
  const areaM2 = floodPixelsToM2(pixels, region.scale)
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
