/**
 * PNG hi-res del cuadro de despiece (encabezado + tabla legible, fondo blanco).
 * Textos proporcionales y cotas sobre cada segmento de la forma.
 */
import {
  computePositionMetrics,
  computeScheduleTotalKg,
  fmt2,
  despieceFmtPesoKgM,
  normalizeDespiecePosition,
  despieceResolverDiametro,
  formatEspaciamiento,
  formatUbicacion,
  formatParrilla,
} from './esquemaDespiece.js'
import { findDespieceShape } from './esquemaDespieceLibrary.js'
import { drawShapeWithCotasOnSegments } from './esquemaDespieceDraw.js'
import {
  estimateParrillaPngHeight,
  paintParrillaViews,
} from './esquemaDespieceParrilla.js'
import { ESQUEMA_DOC_TYPE_SCALE, esquemaDocFontHierarchy } from './esquemaDocLegibility.js'

const C = {
  bg: '#ffffff',
  headerBg: '#ecfeff',
  primary: '#0f766e',
  text: '#0f172a',
  muted: '#64748b',
  border: '#cbd5e1',
  rowAlt: '#f8fafc',
  headBg: '#0f766e',
  headFg: '#ffffff',
}

const LOGO_URL = '/CLARA.CORE.png'

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function loadLogoDataUrl() {
  try {
    const img = await loadImage(LOGO_URL)
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

function wrapFillText(ctx, text, x, y, maxW, lineH) {
  const words = String(text || '').split(/\s+/)
  let line = ''
  let cy = y
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy)
      line = w
      cy += lineH
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cy)
  return cy
}

/**
 * Compone PNG del cuadro de despiece — textos legibles sin ampliar.
 */
export async function composeDespiecePng({
  schedule,
  contratoId = null,
  brandTitle = 'Clara Core',
  // Ancho × DOC_TYPE_SCALE: tipografía y columnas crecen juntas (sin cortes).
  width = Math.round(2200 * ESQUEMA_DOC_TYPE_SCALE),
} = {}) {
  if (typeof document === 'undefined' || !schedule) return null
  const positions = schedule.positions || []
  const n = Math.max(1, positions.length)
  // textScale sigue width/1600 → con ancho ×2 la letra queda ≈×2.
  const textScale = width / 1600
  const margin = Math.round(18 * textScale)
  const headerH = Math.round(100 * textScale)
  const footerH = Math.round(36 * textScale)
  // C-OUT-08: filas/encabezado crecen con el piso de letra (≥ ancho/55).
  const hierEarly = esquemaDocFontHierarchy(width, { cellPx: Math.round(16 * textScale) })
  const rowH = Math.max(Math.round(150 * textScale), Math.round(hierEarly.cellPx * 4.2))
  const headRowH = Math.max(Math.round(52 * textScale), Math.round(hierEarly.headerPx * 2.4))
  const tableH = headRowH + n * rowH
  const imgW = width
  const parrillaDraw = schedule.parrillaDraw || null
  const parrillaH = parrillaDraw
    ? Math.round(estimateParrillaPngHeight(parrillaDraw, width, ESQUEMA_DOC_TYPE_SCALE) + 28 * textScale)
    : 0
  const imgH = headerH + Math.round(8 * textScale) + tableH + parrillaH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = imgH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, imgW, imgH)

  // C-OUT-08: celdas ≥ ancho/55; encabezados y título mayores.
  const hier = esquemaDocFontHierarchy(imgW, { cellPx: Math.round(16 * textScale) })
  const cellFont = Math.round(hier.cellPx)
  const cotaFont = Math.max(Math.round(15 * textScale), Math.round(cellFont * 0.92))
  const headFont = Math.max(Math.round(15 * textScale), hier.headerPx)
  const titleFont = Math.max(Math.round(34 * textScale), hier.titlePx)

  // Encabezado
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, imgW, headerH)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${titleFont}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Cuadro de despiece de acero', margin, Math.round(40 * textScale))
  ctx.fillStyle = C.text
  ctx.font = `bold ${Math.max(Math.round(22 * textScale), hier.headerPx)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(String(schedule.nombre || 'Cuadro'), margin, Math.round(72 * textScale))
  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(18 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(brandTitle, imgW * 0.40, Math.round(40 * textScale))
  const fecha = new Date(schedule.updatedAt || schedule.createdAt || Date.now()).toLocaleString('es-CO')
  ctx.fillText(fecha, imgW - margin - ctx.measureText(fecha).width, Math.round(72 * textScale))

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = Math.round(130 * textScale)
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, imgW - margin - lw, Math.round(12 * textScale), lw, Math.min(lh, headerH - 20))
    } catch { /* ignore */ }
  }

  // Tabla a todo el ancho útil (márgenes mínimos)
  const cols = [
    { key: 'pos', label: 'Posición', w: 0.09 },
    { key: 'n', label: 'N°', w: 0.035 },
    { key: 'esp', label: 'Espaciamiento', w: 0.07 },
    { key: 'piezas', label: 'N° piezas', w: 0.055 },
    { key: 'ubic', label: 'Ubicación', w: 0.09 },
    { key: 'parr', label: 'Parrilla', w: 0.10 },
    { key: 'parcial', label: 'Long. parcial (m)', w: 0.08 },
    { key: 'forma', label: 'Forma L=(cm)', w: 0.22 },
    { key: 'total', label: 'Long. total (m)', w: 0.08 },
    { key: 'kgm', label: 'Peso kg/m', w: 0.07 },
    { key: 'kg', label: 'Peso kg', w: 0.06 },
    { key: 'tot', label: 'Total', w: 0.05 },
  ]
  const tableX = margin
  const tableW = imgW - margin * 2
  let x = tableX
  const colXs = cols.map((c) => {
    const cw = tableW * c.w
    const left = x
    x += cw
    return { ...c, x: left, width: cw }
  })

  let y = headerH + Math.round(6 * textScale)
  ctx.fillStyle = C.headBg
  ctx.fillRect(tableX, y, tableW, headRowH)
  ctx.fillStyle = C.headFg
  ctx.font = `bold ${headFont}px "Segoe UI", system-ui, sans-serif`
  for (const c of colXs) {
    wrapFillText(ctx, c.label, c.x + 5, y + Math.round(20 * textScale), c.width - 8, Math.round(headFont * 1.05))
  }
  y += headRowH

  const totalKg = computeScheduleTotalKg(positions)
  const midY0 = y
  const midY1 = y + n * rowH

  positions.forEach((rawPos, idx) => {
    const pos = normalizeDespiecePosition(rawPos) || rawPos
    const m = computePositionMetrics(pos)
    const bg = idx % 2 ? C.rowAlt : C.bg
    ctx.fillStyle = bg
    ctx.fillRect(tableX, y, tableW, rowH)
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    ctx.strokeRect(tableX, y, tableW, rowH)

    const shape = findDespieceShape(contratoId, pos.shapeId)
    const values = {
      pos: String(pos.name || '—'),
      n: String(idx + 1),
      esp: formatEspaciamiento(pos.spacingM),
      piezas: m.ok ? String(m.pieces) : '—',
      ubic: formatUbicacion(pos),
      parr: formatParrilla(pos),
      parcial: m.ok ? fmt2(m.partialM) : '—',
      forma: '',
      total: m.ok ? fmt2(m.totalM) : '—',
      kgm: m.ok ? despieceFmtPesoKgM(m.pesoKgM) : '—',
      kg: m.ok ? fmt2(m.pesoKg) : '—',
      tot: '',
    }

    ctx.fillStyle = C.text
    ctx.font = `${cellFont}px "Segoe UI", system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    for (const c of colXs) {
      if (c.key === 'forma') {
        drawShapeWithCotasOnSegments(ctx, shape, pos, c.x + 4, y + 6, c.width - 8, rowH - 12, {
          stroke: C.primary,
          textColor: C.text,
          fontPx: cotaFont,
        })
        continue
      }
      if (c.key === 'tot') continue
      const tx = c.x + 6
      const ty = y + rowH * 0.42
      if (c.key === 'pos') {
        ctx.font = `bold ${cellFont}px "Segoe UI", system-ui, sans-serif`
        ctx.fillText(values.pos, tx, ty)
        const diam = despieceResolverDiametro(pos.diameter)
        if (diam) {
          ctx.fillStyle = C.muted
          ctx.font = `${Math.round(13 * textScale)}px "Segoe UI", system-ui, sans-serif`
          ctx.fillText(`Ø ${diam}`, tx, ty + Math.round(20 * textScale))
          ctx.fillStyle = C.text
        }
        ctx.font = `${cellFont}px "Segoe UI", system-ui, sans-serif`
        continue
      }
      if (c.key === 'ubic' || c.key === 'parr') {
        wrapFillText(ctx, values[c.key], tx, ty - 4, c.width - 10, Math.round(17 * textScale))
        continue
      }
      ctx.fillText(values[c.key], tx, ty)
    }
    y += rowH
  })

  // Total combinado
  const totCol = colXs.find((c) => c.key === 'tot')
  if (totCol) {
    ctx.fillStyle = C.headerBg
    ctx.fillRect(totCol.x, midY0, totCol.width, midY1 - midY0)
    ctx.strokeStyle = C.border
    ctx.strokeRect(totCol.x, midY0, totCol.width, midY1 - midY0)
    ctx.fillStyle = C.primary
    ctx.font = `bold ${Math.round(26 * textScale)}px "Segoe UI", system-ui, sans-serif`
    const label = fmt2(totalKg)
    const tw = ctx.measureText(label).width
    ctx.fillText(label, totCol.x + (totCol.width - tw) / 2, (midY0 + midY1) / 2 + 4)
    ctx.fillStyle = C.muted
    ctx.font = `${Math.round(16 * textScale)}px "Segoe UI", system-ui, sans-serif`
    const u = 'kg'
    ctx.fillText(u, totCol.x + (totCol.width - ctx.measureText(u).width) / 2, (midY0 + midY1) / 2 + Math.round(28 * textScale))
  }

  // Vistas de parrilla debajo del cuadro (fase 2); el cuadro de arriba no cambia.
  if (parrillaDraw?.views?.length) {
    const py = midY1 + Math.round(20 * textScale)
    ctx.fillStyle = C.primary
    ctx.font = `bold ${Math.round(22 * textScale)}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('Vistas de parrilla', margin, py)
    paintParrillaViews(ctx, parrillaDraw, {
      x: margin,
      y: py + Math.round(10 * textScale),
      width: imgW - margin * 2,
      fontScale: ESQUEMA_DOC_TYPE_SCALE,
    })
  }

  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(14 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Clara Core · Cuadro de despiece · PNG de alta resolución', margin, imgH - Math.round(12 * textScale))

  const dataUri = canvas.toDataURL('image/png')
  const comma = dataUri.indexOf(',')
  let blob = null
  if (comma >= 0) {
    const bin = atob(dataUri.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: 'image/png' })
  }
  const safe = String(schedule.nombre || 'despiece').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').trim().replace(/\s+/g, '_')
  return {
    dataUri,
    blob,
    nombre: `cuadro_despiece_${safe || 'acero'}.png`,
    meta: {
      width: imgW,
      height: imgH,
      totalKg,
      textScale,
      cellFont,
      cotaFont,
      tableWidthRatio: tableW / imgW,
    },
  }
}

export async function buildDespieceAdjuntos(schedules, { contratoId = null } = {}) {
  const out = []
  for (const schedule of schedules || []) {
    if (!String(schedule?.nombre || '').trim()) continue
    if (!(schedule.positions || []).length) continue
    const png = await composeDespiecePng({ schedule, contratoId })
    if (!png) continue
    out.push({
      dataUri: png.dataUri,
      mime: 'image/png',
      nombre: png.nombre,
      kind: 'despiece-acero',
      origen: 'esquema-calculo',
      blob: png.blob,
    })
  }
  return out
}
