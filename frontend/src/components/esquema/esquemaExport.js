/**
 * Rotulado de esquema guardado: márgenes, contorno, título y tabla de coords.
 * Única fuente para Guardar desde cualquier módulo (Seguimiento, SicoeObra, Presupuesto).
 */
import { drawNorthIndicator, landscapeExportSize, objectBoundsOf } from './esquemaGeometry.js'

export const EXPORT_MARGIN = 48
export const EXPORT_TITLE_H = 56

export function sceneExportBounds(objects) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of objects || []) {
    if (!o || (o.type === 'image' && o.fit)) continue
    const b = objectBoundsOf(o)
    if (!b) continue
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + (b.w || 0))
    maxY = Math.max(maxY, b.y + (b.h || 0))
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 400, h: 280 }
  return {
    x: minX,
    y: minY,
    w: Math.max(40, maxX - minX),
    h: Math.max(40, maxY - minY),
  }
}

export function drawExportCoordTable(ctx, nodes, x, y, width) {
  const rows = nodes || []
  const headerH = 26
  const rowH = 24
  const cols = [
    { k: 'nodeNum', t: 'N°', w: 0.08 },
    { k: 'norte', t: 'Norte', w: 0.20 },
    { k: 'este', t: 'Este', w: 0.20 },
    { k: 'cota', t: 'Cota', w: 0.16 },
    { k: 'desc', t: 'Descripción', w: 0.36 },
  ]
  const border = '#94a3b8'
  const headerBg = '#D6EAF8'
  const headerColor = '#0077B6'
  const text = '#0f172a'
  const tableW = width
  let cx = x
  ctx.save()
  ctx.font = '700 11px sans-serif'
  ctx.textBaseline = 'middle'
  for (const col of cols) {
    const cw = tableW * col.w
    ctx.fillStyle = headerBg
    ctx.fillRect(cx, y, cw, headerH)
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.strokeRect(cx, y, cw, headerH)
    ctx.fillStyle = headerColor
    ctx.fillText(col.t, cx + 8, y + headerH / 2)
    cx += cw
  }
  ctx.font = '12px sans-serif'
  ctx.fillStyle = text
  rows.forEach((n, i) => {
    const ry = y + headerH + i * rowH
    cx = x
    const bg = i % 2 ? '#f8fafc' : '#ffffff'
    const values = [
      String(n.nodeNum ?? ''),
      n.norte == null ? '' : String(n.norte),
      n.este == null ? '' : String(n.este),
      n.cota == null ? '' : String(n.cota),
      String(n.desc || ''),
    ]
    cols.forEach((col, ci) => {
      const cw = tableW * col.w
      ctx.fillStyle = bg
      ctx.fillRect(cx, ry, cw, rowH)
      ctx.strokeStyle = border
      ctx.strokeRect(cx, ry, cw, rowH)
      ctx.fillStyle = text
      ctx.fillText(values[ci], cx + 8, ry + rowH / 2, cw - 14)
      cx += cw
    })
  })
  ctx.restore()
  return headerH + rows.length * rowH
}

/**
 * Compone el PNG rotulado (título + márgenes + contorno + rosa + tabla).
 * `drawObject` lo inyecta el editor para no duplicar el rasterizado de entidades.
 */
export function composeEsquemaExport({ title, objects, nodes, drawObject }) {
  const margin = EXPORT_MARGIN
  const titleH = EXPORT_TITLE_H
  const tableGap = 20
  const tableTitleH = 22
  const rows = nodes || []
  const bb = sceneExportBounds(objects)
  const maxInner = 1100
  const scale = Math.min(2.2, maxInner / bb.w, maxInner / bb.h)
  const drawW = Math.round(bb.w * scale + margin * 2)
  const drawH = Math.round(bb.h * scale + margin * 2)
  const tableBlock = rows.length ? tableGap + tableTitleH + 8 + 26 + rows.length * 24 + margin : margin
  const h = titleH + drawH + tableBlock
  const w = landscapeExportSize(Math.max(720, drawW), h).w
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 20px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(title || 'Esquema', margin, titleH / 2)

  const drawX = Math.round((w - drawW) / 2)
  ctx.save()
  ctx.beginPath()
  ctx.rect(drawX, titleH, drawW, drawH)
  ctx.clip()
  ctx.translate(drawX + margin - bb.x * scale, titleH + margin - bb.y * scale)
  ctx.scale(scale, scale)
  for (const obj of objects || []) {
    if (obj?.type === 'image' && obj.fit) continue
    drawObject?.(ctx, obj, false, { skipResize: true, zoom: scale })
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.5
  ctx.strokeRect(drawX + 0.75, titleH + 0.75, drawW - 1.5, drawH - 1.5)
  ctx.restore()
  drawNorthIndicator(ctx, drawW, drawH, { x: drawX, y: titleH })

  if (rows.length) {
    const tableX = margin
    const tableW = w - margin * 2
    const tableY = titleH + drawH + tableGap
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 13px sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('Tabla de coordenadas', tableX, tableY + 14)
    drawExportCoordTable(ctx, rows, tableX, tableY + tableTitleH + 4, tableW)
  }
  return Promise.resolve(c.toDataURL('image/png'))
}
