/**
 * Rotulado de esquema guardado: márgenes, contorno, título y tabla de coords.
 * Única fuente para Guardar desde cualquier módulo (Seguimiento, SicoeObra, Presupuesto).
 *
 * Resolución de export: el dibujo se rasteriza a ~2× la escala histórica para que
 * textos (tabla de coordenadas, cotas, etiquetas) sigan legibles al reducirse al
 * contenedor de memorias FO-EO-04 (~240 px de alto) y al hacer zoom en el PDF.
 */
import { drawNorthIndicator, landscapeExportSize, objectBoundsOf } from './esquemaGeometry.js'
import { partitionBackgroundFirst } from './esquemaZOrder.js'

export const EXPORT_MARGIN = 48
export const EXPORT_TITLE_H = 56
/** Contorno del margen / área imprimible (contenido + margen). */
export const EXPORT_MARGIN_CONTOUR_COLOR = '#1e293b'
export const EXPORT_MARGIN_CONTOUR_WIDTH = 2

/**
 * Lado máximo del área de dibujo (sin título/tabla) en el PNG exportado.
 * Histórico: 1100 → insuficiente para tipografía de tabla en memorias.
 */
export const EXPORT_MAX_INNER = 2200
/** Tope de escala mundo→export (evita PNG enormes en escenas pequeñas). */
export const EXPORT_SCALE_CAP = 3.2
/** Ancho mínimo del canvas exportado (landscape) sin tabla de coords. */
export const EXPORT_MIN_WIDTH = 1400
/**
 * Con tabla de coordenadas el ancho se acota para que el aspect ratio
 * encaje mejor en el contenedor FO-EO-04 (~380×240): un PNG muy ancho
 * queda limitado por el ancho y el texto se ve más pequeño.
 */
export const EXPORT_MIN_WIDTH_WITH_TABLE = 960
/**
 * Ancho de referencia de la tabla para tipografía base.
 * A anchos mayores se escala el texto (con tope) para legibilidad a tamaño real.
 */
export const EXPORT_TABLE_BASE_WIDTH = 1100

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

/**
 * Marco del margen en la imagen exportada: delimita el área imprimible
 * (contenido + EXPORT_MARGIN) sin alterar el tamaño del margen.
 * El trazo queda inset para no recortarse en el borde del canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {{ color?: string, lineWidth?: number }} [style]
 */
export function drawExportMarginContour(ctx, rect, style = {}) {
  if (!ctx || !rect) return
  const x = Number(rect.x)
  const y = Number(rect.y)
  const w = Number(rect.w)
  const h = Number(rect.h)
  if (![x, y, w, h].every(Number.isFinite) || w < 4 || h < 4) return
  const color = style.color || EXPORT_MARGIN_CONTOUR_COLOR
  const lineWidth = Math.max(1, Number(style.lineWidth) || EXPORT_MARGIN_CONTOUR_WIDTH)
  const hw = lineWidth / 2
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'square'
  try { ctx.setLineDash([]) } catch { /* ignore */ }
  ctx.strokeRect(x + hw, y + hw, Math.max(1, w - lineWidth), Math.max(1, h - lineWidth))
  ctx.restore()
}

/**
 * Fracción mínima del alto bajo el título que debe ocupar la tabla de
 * coordenadas. Evita que el dibujo domine el PNG y la tabla quede como
 * franja ilegible al reducir al contenedor FO-EO-04 (~240 px).
 */
export const EXPORT_TABLE_MIN_HEIGHT_FRAC = 0.36
/**
 * Alto de referencia del contenedor PLANO/ESQUEMA en FO-EO-04 (px CSS).
 * Se usa para dimensionar el PNG de modo que el texto de la tabla quede
 * legible (~8 px) tras object-fit:contain.
 */
export const EXPORT_MEMORIA_CONTAINER_H = 240
/** Tamaño mínimo deseado del texto de tabla ya reducido al contenedor. */
export const EXPORT_TABLE_MIN_SCREEN_PX = 8

/**
 * Métricas tipográficas de la tabla de coordenadas, proporcionales al ancho
 * del gráfico exportado. Factor mínimo 1.35 (≈ +35 % vs tipografía histórica
 * 11/12 px). `heightBoost` amplía filas/fuentes para alcanzar la fracción
 * mínima de alto sin deformar el dibujo.
 *
 * @param {number} tableWidth
 * @param {{ heightBoost?: number }} [opts]
 */
export function exportCoordTableMetrics(tableWidth, opts = {}) {
  const w = Number(tableWidth)
  const width = Number.isFinite(w) && w > 0 ? w : EXPORT_TABLE_BASE_WIDTH
  // 1.35 en base 1100; crece con el ancho hasta 1.9 (tipografía ~22 px)
  const raw = (width / EXPORT_TABLE_BASE_WIDTH) * 1.35
  const base = Math.min(1.9, Math.max(1.35, raw))
  const boost = Math.max(1, Number(opts.heightBoost) || 1)
  // Tope práctico: tipografía ~36 px (sigue nítida al zoom del PDF)
  const s = Math.min(3.2, base * boost)
  return {
    scale: s,
    heightBoost: boost,
    headerH: Math.round(26 * s),
    rowH: Math.round(24 * s),
    headerFontPx: Math.round(11 * s),
    bodyFontPx: Math.round(12 * s),
    titleFontPx: Math.round(13 * s),
    titleBlockH: Math.round(22 * s),
    padX: Math.round(8 * s),
    tableGap: Math.round(20 * s),
  }
}

/**
 * Calcula el `heightBoost` para que el bloque tabla sea ≥ EXPORT_TABLE_MIN_HEIGHT_FRAC
 * del alto bajo el título (dibujo + tabla).
 */
export function exportCoordTableHeightBoost(rowCount, tableWidth, drawH, margin = EXPORT_MARGIN) {
  const n = Math.max(0, Number(rowCount) || 0)
  if (!n) return 1
  const m1 = exportCoordTableMetrics(tableWidth, { heightBoost: 1 })
  const scalable = m1.tableGap + m1.titleBlockH + 8 + m1.headerH + n * m1.rowH
  const fixed = margin
  const dh = Math.max(1, Number(drawH) || 1)
  const frac = EXPORT_TABLE_MIN_HEIGHT_FRAC
  const target = (frac / (1 - frac)) * dh
  if (scalable + fixed >= target) return 1
  // Solo la parte tipográfica escala; el margen inferior es fijo.
  return Math.min(2.4, Math.max(1, (target - fixed) / Math.max(1, scalable)))
}

/** Alto total del bloque tabla (gap + título + filas + margen inferior). */
export function exportCoordTableBlockHeight(rowCount, tableWidth, margin = EXPORT_MARGIN, heightBoost = 1) {
  const n = Math.max(0, Number(rowCount) || 0)
  if (!n) return margin
  const m = exportCoordTableMetrics(tableWidth, { heightBoost })
  return m.tableGap + m.titleBlockH + 8 + m.headerH + n * m.rowH + margin
}

export function drawExportCoordTable(ctx, nodes, x, y, width, opts = {}) {
  const rows = nodes || []
  const metrics = exportCoordTableMetrics(width, opts)
  const { headerH, rowH, headerFontPx, bodyFontPx, padX } = metrics
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
  ctx.font = `700 ${headerFontPx}px sans-serif`
  ctx.textBaseline = 'middle'
  for (const col of cols) {
    const cw = tableW * col.w
    ctx.fillStyle = headerBg
    ctx.fillRect(cx, y, cw, headerH)
    ctx.strokeStyle = border
    ctx.lineWidth = Math.max(1, Math.round(metrics.scale))
    ctx.strokeRect(cx, y, cw, headerH)
    ctx.fillStyle = headerColor
    ctx.fillText(col.t, cx + padX, y + headerH / 2)
    cx += cw
  }
  ctx.font = `${bodyFontPx}px sans-serif`
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
      ctx.fillText(values[ci], cx + padX, ry + rowH / 2, cw - padX * 2)
      cx += cw
    })
  })
  ctx.restore()
  return headerH + rows.length * rowH
}

/**
 * Dimensiones del PNG rotulado (sin rasterizar). Útil para tests y presupuestos.
 * @param {{ objects?: object[], nodes?: object[] }} opts
 */
export function computeEsquemaExportSize({ objects, nodes } = {}) {
  const margin = EXPORT_MARGIN
  const titleH = EXPORT_TITLE_H
  const rows = nodes || []
  const bb = sceneExportBounds(objects)
  // Escala natural hi-res: NO aplastar el dibujo cuando hay tabla de coordenadas.
  // (Regresión 7c70e5dc: reducir scale para “ganar” alto de tabla hacía trazos/
  // achurados ilegibles en el PNG; la tipografía de tabla se agranda vía heightBoost.)
  const scale = Math.min(EXPORT_SCALE_CAP, EXPORT_MAX_INNER / bb.w, EXPORT_MAX_INNER / bb.h)
  const drawW = Math.round(bb.w * scale + margin * 2)
  const drawH = Math.round(bb.h * scale + margin * 2)
  const minW = rows.length ? EXPORT_MIN_WIDTH_WITH_TABLE : EXPORT_MIN_WIDTH
  const provisionalW = Math.max(minW, drawW)
  const wGuess = landscapeExportSize(provisionalW, titleH + drawH + margin).w
  const tableW = wGuess - margin * 2

  let heightBoost = exportCoordTableHeightBoost(rows.length, tableW, drawH, margin)
  let tableBlock = exportCoordTableBlockHeight(rows.length, tableW, margin, heightBoost)
  let h = titleH + drawH + tableBlock
  let w = landscapeExportSize(Math.max(minW, drawW), h).w
  let tableMetrics = exportCoordTableMetrics(w - margin * 2, { heightBoost })

  // Ajuste fino: tipografía efectiva en el contenedor FO-EO-04 (object-fit),
  // solo agrandando la tabla — nunca reduciendo la escala del dibujo.
  // Se itera porque al crecer la tabla cambia el fit (object-fit:contain).
  if (rows.length) {
    const memoriaW = 380
    const memoriaH = EXPORT_MEMORIA_CONTAINER_H
    for (let i = 0; i < 6; i += 1) {
      const fit0 = Math.min(memoriaW / w, memoriaH / h)
      const screen0 = tableMetrics.bodyFontPx * fit0
      if (screen0 + 0.05 >= EXPORT_TABLE_MIN_SCREEN_PX) break
      const need = EXPORT_TABLE_MIN_SCREEN_PX / Math.max(0.25, screen0)
      const nextBoost = Math.min(3.0, heightBoost * need)
      if (nextBoost <= heightBoost + 1e-4) break
      heightBoost = nextBoost
      tableBlock = exportCoordTableBlockHeight(rows.length, w - margin * 2, margin, heightBoost)
      h = titleH + drawH + tableBlock
      w = landscapeExportSize(Math.max(minW, drawW), h).w
      tableMetrics = exportCoordTableMetrics(w - margin * 2, { heightBoost })
    }
  }

  return {
    w: Math.round(w),
    h: Math.round(h),
    scale,
    drawW,
    drawH,
    tableBlock,
    heightBoost,
    tableMetrics,
  }
}

/**
 * Compone el PNG rotulado (título + márgenes + contorno + rosa + tabla).
 * `drawObject` lo inyecta el editor para no duplicar el rasterizado de entidades.
 */
export function composeEsquemaExport({ title, objects, nodes, drawObject }) {
  const margin = EXPORT_MARGIN
  const titleH = EXPORT_TITLE_H
  const rows = nodes || []
  const layout = computeEsquemaExportSize({ objects, nodes })
  const { w, h, scale, drawW, drawH, heightBoost } = layout
  const bb = sceneExportBounds(objects)
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const titleMetrics = exportCoordTableMetrics(w - margin * 2, { heightBoost })
  const mainTitlePx = Math.max(22, Math.round(20 * Math.min(1.6, titleMetrics.scale)))
  ctx.fillStyle = '#0f172a'
  ctx.font = `700 ${mainTitlePx}px sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(title || 'Esquema', margin, titleH / 2)

  const drawX = Math.round((w - drawW) / 2)
  ctx.save()
  ctx.beginPath()
  ctx.rect(drawX, titleH, drawW, drawH)
  ctx.clip()
  ctx.translate(drawX + margin - bb.x * scale, titleH + margin - bb.y * scale)
  ctx.scale(scale, scale)
  for (const obj of partitionBackgroundFirst(objects || [])) {
    if (obj?.type === 'image' && obj.fit) continue
    drawObject?.(ctx, obj, false, { skipResize: true, zoom: scale })
  }
  ctx.restore()
  // Contorno del margen / área imprimible (después del clip, sin tapar el dibujo)
  drawExportMarginContour(ctx, { x: drawX, y: titleH, w: drawW, h: drawH })
  drawNorthIndicator(ctx, drawW, drawH, { x: drawX, y: titleH })

  if (rows.length) {
    const tableX = margin
    const tableW = w - margin * 2
    const m = exportCoordTableMetrics(tableW, { heightBoost })
    const tableY = titleH + drawH + m.tableGap
    ctx.fillStyle = '#0f172a'
    ctx.font = `700 ${m.titleFontPx}px sans-serif`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('Tabla de coordenadas', tableX, tableY + Math.round(m.titleBlockH * 0.65))
    drawExportCoordTable(ctx, rows, tableX, tableY + m.titleBlockH + 4, tableW, { heightBoost })
  }
  return Promise.resolve(c.toDataURL('image/png'))
}
