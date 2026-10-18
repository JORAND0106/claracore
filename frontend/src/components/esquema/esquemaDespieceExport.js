/**
 * PNG hi-res del cuadro de despiece (encabezado + tabla legible, fondo blanco).
 * Misma vía de adjuntos que la memoria de cálculo (`origen: esquema-calculo`).
 */
import {
  computePositionMetrics,
  computeScheduleTotalKg,
  fmt2,
  despieceFmtPesoKgM,
  normalizeDespiecePosition,
  segmentDisplayLabel,
  despieceResolverDiametro,
} from './esquemaDespiece.js'
import { findDespieceShape } from './esquemaDespieceLibrary.js'

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

/** Dibuja miniatura de forma con cotas de segmentos. */
function drawShapeWithCotas(ctx, shape, pos, x, y, w, h) {
  if (!shape) return
  ctx.save()
  ctx.translate(x, y)
  const vb = String(shape.viewBox || '0 0 100 40').split(/\s+/).map(Number)
  const vbW = vb[2] || 100
  const vbH = vb[3] || 40
  const scale = Math.min(w / vbW, (h * 0.55) / vbH)
  ctx.translate((w - vbW * scale) / 2, 4)
  ctx.scale(scale, scale)
  ctx.lineWidth = 2.2 / scale
  ctx.strokeStyle = C.primary
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const seg of shape.segments || []) {
    try {
      const p = new Path2D(seg.path)
      ctx.stroke(p)
    } catch { /* ignore bad path */ }
  }
  if (shape.kind === 'spiral' && shape.thumbPath) {
    try {
      ctx.stroke(new Path2D(shape.thumbPath))
    } catch { /* ignore */ }
  }
  ctx.restore()

  // Cotas bajo el dibujo
  ctx.fillStyle = C.text
  ctx.font = '10px "Segoe UI", system-ui, sans-serif'
  const segs = pos.segments || []
  let ty = y + h * 0.58
  const labels = []
  if (shape.kind === 'spiral' && pos.spiral) {
    const dM = Number(String(pos.spiral.diametroM ?? '').replace(',', '.'))
    const pM = Number(String(pos.spiral.pasoM ?? '').replace(',', '.'))
    const dCm = Number.isFinite(dM) ? Math.round(dM * 100) : (pos.spiral.diametroCm ?? '—')
    const pCm = Number.isFinite(pM) ? Math.round(pM * 100) : (pos.spiral.pasoCm ?? '—')
    labels.push(`Ø${dCm} paso ${pCm} ×${pos.spiral.vueltas}`)
  } else {
    for (const seg of segs) {
      const d = segmentDisplayLabel(seg)
      if (d && typeof d === 'object') {
        if (d.varLine) {
          labels.push(`${seg.name}: ${d.varLine}`)
          labels.push(d.promLine)
        } else if (d.value != null) {
          labels.push(`${d.value}`)
        }
      }
    }
  }
  for (const line of labels.slice(0, 6)) {
    ctx.fillText(line, x + 4, ty)
    ty += 12
  }
}

/**
 * Compone PNG del cuadro de despiece.
 */
export async function composeDespiecePng({
  schedule,
  contratoId = null,
  brandTitle = 'Clara Core',
  width = 1600,
} = {}) {
  if (typeof document === 'undefined' || !schedule) return null
  const positions = schedule.positions || []
  const n = Math.max(1, positions.length)
  const textScale = width / 1600
  const margin = Math.round(28 * textScale)
  const headerH = Math.round(86 * textScale)
  const footerH = Math.round(28 * textScale)
  const rowH = Math.round(96 * textScale)
  const headRowH = Math.round(36 * textScale)
  const tableH = headRowH + n * rowH
  const imgW = width
  const imgH = headerH + margin + tableH + footerH + margin

  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = imgH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, imgW, imgH)

  // Encabezado
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, imgW, headerH)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${Math.round(24 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Cuadro de despiece de acero', margin, Math.round(32 * textScale))
  ctx.fillStyle = C.text
  ctx.font = `bold ${Math.round(16 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(String(schedule.nombre || 'Cuadro'), margin, Math.round(58 * textScale))
  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(13 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(brandTitle, imgW * 0.42, Math.round(32 * textScale))
  const fecha = new Date(schedule.updatedAt || schedule.createdAt || Date.now()).toLocaleString('es-CO')
  ctx.fillText(fecha, imgW - margin - 20 - ctx.measureText(fecha).width, Math.round(58 * textScale))

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = Math.round(110 * textScale)
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, imgW - margin - lw, Math.round(10 * textScale), lw, Math.min(lh, headerH - 16))
    } catch { /* ignore */ }
  }

  // Tabla
  const cols = [
    { key: 'pos', label: 'Posición', w: 0.09 },
    { key: 'n', label: 'N°', w: 0.05 },
    { key: 'piezas', label: 'N° piezas', w: 0.07 },
    { key: 'parcial', label: 'Long. parcial (m)', w: 0.10 },
    { key: 'forma', label: 'Forma L=(cm)', w: 0.28 },
    { key: 'total', label: 'Long. total (m)', w: 0.10 },
    { key: 'kgm', label: 'Peso kg/m', w: 0.09 },
    { key: 'kg', label: 'Peso kg', w: 0.09 },
    { key: 'tot', label: 'Total', w: 0.13 },
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

  let y = headerH + Math.round(12 * textScale)
  // Header row
  ctx.fillStyle = C.headBg
  ctx.fillRect(tableX, y, tableW, headRowH)
  ctx.fillStyle = C.headFg
  ctx.font = `bold ${Math.round(11 * textScale)}px "Segoe UI", system-ui, sans-serif`
  for (const c of colXs) {
    ctx.fillText(c.label, c.x + 6, y + headRowH * 0.65)
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
    ctx.strokeRect(tableX, y, tableW, rowH)

    const shape = findDespieceShape(contratoId, pos.shapeId)
    const values = {
      pos: String(pos.name || '—'),
      n: String(idx + 1),
      piezas: m.ok ? String(m.pieces) : '—',
      parcial: m.ok ? fmt2(m.partialM) : '—',
      forma: '',
      total: m.ok ? fmt2(m.totalM) : '—',
      kgm: m.ok ? despieceFmtPesoKgM(m.pesoKgM) : '—',
      kg: m.ok ? fmt2(m.pesoKg) : '—',
      tot: '',
    }

    ctx.fillStyle = C.text
    ctx.font = `${Math.round(12 * textScale)}px "Segoe UI", system-ui, sans-serif`
    for (const c of colXs) {
      if (c.key === 'forma') {
        drawShapeWithCotas(ctx, shape, pos, c.x + 4, y + 4, c.width - 8, rowH - 8)
        continue
      }
      if (c.key === 'tot') continue
      ctx.fillText(values[c.key], c.x + 6, y + rowH * 0.55)
    }
    // Ø hint under posición
    const diam = despieceResolverDiametro(pos.diameter)
    if (diam) {
      ctx.fillStyle = C.muted
      ctx.font = `${Math.round(10 * textScale)}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(`Ø ${diam}`, colXs[0].x + 6, y + rowH * 0.78)
    }
    y += rowH
  })

  // Celda Total combinada
  const totCol = colXs.find((c) => c.key === 'tot')
  if (totCol) {
    ctx.fillStyle = C.headerBg
    ctx.fillRect(totCol.x, midY0, totCol.width, midY1 - midY0)
    ctx.strokeStyle = C.border
    ctx.strokeRect(totCol.x, midY0, totCol.width, midY1 - midY0)
    ctx.fillStyle = C.primary
    ctx.font = `bold ${Math.round(18 * textScale)}px "Segoe UI", system-ui, sans-serif`
    const label = fmt2(totalKg)
    const tw = ctx.measureText(label).width
    ctx.fillText(label, totCol.x + (totCol.width - tw) / 2, (midY0 + midY1) / 2 + 6)
    ctx.fillStyle = C.muted
    ctx.font = `${Math.round(11 * textScale)}px "Segoe UI", system-ui, sans-serif`
    const u = 'kg'
    ctx.fillText(u, totCol.x + (totCol.width - ctx.measureText(u).width) / 2, (midY0 + midY1) / 2 + 24)
  }

  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(11 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Clara Core · Cuadro de despiece · PNG de alta resolución', margin, imgH - Math.round(10 * textScale))

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
    meta: { width: imgW, height: imgH, totalKg },
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
