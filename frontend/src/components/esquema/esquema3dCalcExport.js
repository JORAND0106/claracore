/**
 * Export de memoria de cálculo: una sola imagen PNG hi-res
 * (isométrico ~60 % + cuadro por colores ~40 %), encabezado único.
 * Misma representación de sólidos que el editor 3D.
 */
import { drawSolids3dLayered } from './esquema3dSolids.js'
import { fmtMemoria } from './esquema3dCalc.js'
import { projectWorld3dToCanvas, solidsViewCamera } from './esquema3dViews.js'

const LOGO_URL = '/CLARA.CORE.png'

/** Colores fijos de memoria (legibles en cualquier tema de plataforma). */
export const MEMORIA_COLORS = Object.freeze({
  bg: '#ffffff',
  text: '#0f172a',
  muted: '#475569',
  border: '#cbd5e1',
  headerBg: '#ecfeff',
  primary: '#0f766e',
  rowAlt: '#f8fafc',
  totalBg: '#ccfbf1',
  subtract: '#b91c1c',
})

function projectSolidPoints(solid, viewId, orbit) {
  const pts = []
  for (const cell of solid?.cells || []) {
    const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
    for (const p of cell.ring || []) {
      pts.push(projectWorld3dToCanvas({ x: p.x, y: p.y, zCota: z0 }, viewId, 0, orbit))
      pts.push(projectWorld3dToCanvas({ x: p.x, y: p.y, zCota: z1 }, viewId, 0, orbit))
    }
    for (const hole of cell.holes || []) {
      for (const p of hole) {
        pts.push(projectWorld3dToCanvas({ x: p.x, y: p.y, zCota: z0 }, viewId, 0, orbit))
        pts.push(projectWorld3dToCanvas({ x: p.x, y: p.y, zCota: z1 }, viewId, 0, orbit))
      }
    }
  }
  return pts
}

/** Bounds en el mismo espacio proyectado que drawSolid3d (iso-ne + cámara centrada). */
export function solidsIsoBounds(solids) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const viewId = 'iso-ne'
  const orbit = solidsViewCamera(viewId, list, { orbitFree: false })
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const solid of list) {
    for (const q of projectSolidPoints(solid, viewId, orbit)) {
      minX = Math.min(minX, q.x)
      minY = Math.min(minY, q.y)
      maxX = Math.max(maxX, q.x)
      maxY = Math.max(maxY, q.y)
    }
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: 400, h: 300, viewId, orbit: null }
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(40, maxX - minX),
    h: Math.max(40, maxY - minY),
    viewId,
    orbit,
  }
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Etiquetas # a partir del snapshot (orden de líneas del cálculo). */
export function labelsFromSnapshot(snapshot) {
  const labels = []
  let n = 0
  for (const line of snapshot?.lines || []) {
    if (!line?.solidId) continue
    if (line.ok === false && !(line.volumeM3 > 0)) continue
    n += 1
    labels.push({ solidId: line.solidId, num: n })
  }
  return labels
}

/**
 * Dibuja el isométrico NE de los sólidos (mismas reglas que el editor).
 * Sin encabezado de memoria (solo caption de vista opcional).
 */
export function renderCalcIsoCanvas(solids, {
  width = 1100,
  height = 900,
  viewCaption = 'Isométrica NE',
  labels = null,
} = {}) {
  if (typeof document === 'undefined') return null
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = MEMORIA_COLORS.bg
  ctx.fillRect(0, 0, width, height)

  const captionH = viewCaption ? 28 : 0
  const drawArea = {
    x: 16,
    y: 12 + captionH,
    w: width - 32,
    h: height - 24 - captionH,
  }

  if (viewCaption) {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = '13px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(viewCaption, 16, 22)
  }

  ctx.strokeStyle = MEMORIA_COLORS.border
  ctx.lineWidth = 1
  ctx.strokeRect(drawArea.x + 0.5, drawArea.y + 0.5, drawArea.w - 1, drawArea.h - 1)

  if (list.length) {
    const bb = solidsIsoBounds(list)
    const pad = 40
    const sx = (drawArea.w - pad * 2) / bb.w
    const sy = (drawArea.h - pad * 2) / bb.h
    const scale = Math.min(sx, sy)
    const ox = drawArea.x + pad + (drawArea.w - pad * 2 - bb.w * scale) / 2 - bb.x * scale
    const oy = drawArea.y + pad + (drawArea.h - pad * 2 - bb.h * scale) / 2 - bb.y * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h)
    ctx.clip()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)
    drawSolids3dLayered(ctx, list, {
      viewId: bb.viewId,
      zoom: scale,
      pixelScale: scale,
      orbit: bb.orbit,
      labels: labels || null,
    })
    ctx.restore()
  } else {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = '16px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('Sin sólidos en este cálculo', drawArea.x + 24, drawArea.y + 40)
  }
  return canvas
}

/** @deprecated */
export async function composeCalcIsoPng({
  solids = [],
  title = 'Gráfico de soporte',
  width = 1280,
  height = 900,
} = {}) {
  const canvas = renderCalcIsoCanvas(solids, { width, height, viewCaption: title })
  return canvas ? canvas.toDataURL('image/png') : null
}

/**
 * Tabla de resumen (sin encabezado de memoria — solo columnas + filas + total).
 * Columnas: # | Color | Nombre | Operación | Long | Anch | Espesor/Altura | Volumen
 */
export function renderMemoriaColorTableCanvas(snapshot, {
  width = 880,
  fontScale = 1,
} = {}) {
  if (typeof document === 'undefined') return null
  const C = MEMORIA_COLORS
  const fs = Math.max(0.85, Math.min(1.35, Number(fontScale) || 1))
  const margin = 8
  const cols = [
    { key: 'num', label: '#', w: Math.round(36 * fs) },
    { key: 'color', label: 'Color', w: Math.round(48 * fs) },
    { key: 'nombre', label: 'Nombre de la capa', w: Math.round(168 * fs) },
    { key: 'op', label: 'Operación', w: Math.round(86 * fs) },
    { key: 'long', label: 'Long', w: Math.round(64 * fs) },
    { key: 'anch', label: 'Anch', w: Math.round(64 * fs) },
    { key: 'espesor', label: 'Espesor / Altura', w: Math.round(108 * fs) },
    { key: 'vol', label: 'Volumen (m³)', w: Math.round(96 * fs) },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const canvasW = Math.max(width, tableW + margin * 2)
  const rowH = Math.round(34 * fs)
  const colHeaderH = Math.round(32 * fs)
  const totalH = Math.round(38 * fs)
  const rows = (snapshot?.lines || []).filter((l) => l.ok !== false || l.volumeM3 != null)
  const bodyH = Math.max(rowH, rows.length * rowH)
  const canvasH = colHeaderH + bodyH + totalH + margin

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, canvasW, canvasH)

  let x0 = margin
  let y0 = 0
  ctx.fillStyle = C.primary
  ctx.fillRect(x0, y0, tableW, colHeaderH)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(11 * fs)}px "Segoe UI", system-ui, sans-serif`
  let x = x0
  for (const col of cols) {
    ctx.fillText(col.label, x + 5, y0 + Math.round(21 * fs))
    x += col.w
  }
  y0 += colHeaderH

  let num = 0
  rows.forEach((line, idx) => {
    num += 1
    const d = line.detail || {}
    const isSub = line.op === 'subtract'
    ctx.fillStyle = idx % 2 === 0 ? C.bg : C.rowAlt
    ctx.fillRect(x0, y0, tableW, rowH)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0, y0, tableW, rowH)

    // #
    ctx.fillStyle = C.text
    ctx.font = `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
    const numTxt = String(num)
    ctx.fillText(numTxt, x0 + (cols[0].w - ctx.measureText(numTxt).width) / 2, y0 + Math.round(22 * fs))

    // Color swatch
    const color = d.color || '#0f766e'
    const sw = Math.round(20 * fs)
    const sh = Math.round(16 * fs)
    const cx0 = x0 + cols[0].w
    ctx.fillStyle = color
    ctx.fillRect(cx0 + (cols[1].w - sw) / 2, y0 + (rowH - sh) / 2, sw, sh)
    ctx.strokeStyle = C.border
    ctx.strokeRect(cx0 + (cols[1].w - sw) / 2 + 0.5, y0 + (rowH - sh) / 2 + 0.5, sw - 1, sh - 1)

    const cells = {
      nombre: line.nombre || 'Elemento',
      op: isSub ? 'Descuenta' : 'Suma',
      long: d.longM != null ? fmtMemoria(d.longM) : '—',
      anch: d.anchM != null ? fmtMemoria(d.anchM) : '—',
      espesor: d.espesorM != null
        ? fmtMemoria(d.espesorM)
        : (d.altura != null ? fmtMemoria(d.altura) : '—'),
      vol: fmtMemoria(line.volumeM3 || 0),
    }
    let cx = cx0 + cols[1].w
    const keys = ['nombre', 'op', 'long', 'anch', 'espesor', 'vol']
    keys.forEach((key, ki) => {
      const col = cols[ki + 2]
      const isVol = key === 'vol'
      const isOp = key === 'op'
      ctx.fillStyle = isOp && isSub ? C.subtract : C.text
      ctx.font = (isVol || isOp)
        ? `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
        : `${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
      const txt = String(cells[key])
      const tx = (isVol || key === 'long' || key === 'anch' || key === 'espesor')
        ? cx + col.w - 8 - ctx.measureText(txt).width
        : cx + 6
      ctx.fillText(txt, tx, y0 + Math.round(22 * fs))
      cx += col.w
    })
    y0 += rowH
  })

  ctx.fillStyle = C.totalBg
  ctx.fillRect(x0, y0, tableW, totalH)
  ctx.strokeStyle = C.primary
  ctx.lineWidth = 1.5
  ctx.strokeRect(x0, y0, tableW, totalH)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${Math.round(13 * fs)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('TOTAL', x0 + 10, y0 + Math.round(24 * fs))
  const tot = `${fmtMemoria(snapshot?.totalM3 || 0)} m³`
  ctx.fillText(tot, x0 + tableW - 10 - ctx.measureText(tot).width, y0 + Math.round(24 * fs))

  return canvas
}

/** Compat: tabla antigua. */
export function renderMemoriaTableCanvas(snapshot, opts = {}) {
  return renderMemoriaColorTableCanvas(snapshot, opts)
}

/**
 * Una sola PNG hi-res: encabezado único + iso (60 %) + tabla (40 %), misma altura.
 * Altura se ajusta al contenido (pocos o muchos sólidos) sin vacíos grandes.
 */
export async function composeCalcMemoriaPng({
  snapshot,
  solids = [],
  brandTitle = 'Clara Core',
  width = 2400,
} = {}) {
  if (typeof document === 'undefined' || !snapshot) return null
  const C = MEMORIA_COLORS
  const margin = 32
  const gap = 28
  const headerH = 78
  const footerH = 28
  const labels = labelsFromSnapshot(snapshot)
  const nRows = Math.max(1, (snapshot.lines || []).filter((l) => l.ok !== false || l.volumeM3 != null).length)

  // Altura del bloque de contenido: crece con filas, piso para el iso.
  const tableFontScale = nRows <= 3 ? 1.15 : (nRows <= 6 ? 1.05 : 0.95)
  const approxTableH = 32 * tableFontScale + nRows * 34 * tableFontScale + 38 * tableFontScale + 8
  const contentH = Math.max(560, Math.min(1100, Math.round(approxTableH + 80)))
  const height = headerH + contentH + footerH + margin

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)

  // Encabezado único
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, width, headerH)
  ctx.fillStyle = C.primary
  ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Memoria de cálculo de volúmenes', margin, 32)
  ctx.fillStyle = C.text
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(snapshot.nombre || 'Cálculo'), margin, 58)
  ctx.fillStyle = C.muted
  ctx.font = '13px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(brandTitle, width * 0.42, 32)
  if (snapshot.frozenAt) {
    const fecha = new Date(snapshot.frozenAt).toLocaleString('es-CO')
    ctx.fillText(fecha, width - margin - 140 - ctx.measureText(fecha).width, 58)
  }

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = 110
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, width - margin - lw, 12, lw, Math.min(lh, headerH - 18))
    } catch { /* ignore */ }
  }

  const contentY = headerH + 10
  const leftW = Math.floor((width - margin * 2 - gap) * 0.60)
  const rightW = width - margin * 2 - gap - leftW

  const iso = renderCalcIsoCanvas(solids, {
    width: leftW,
    height: contentH,
    viewCaption: 'Isométrica NE',
    labels,
  })
  if (iso) ctx.drawImage(iso, margin, contentY)

  const table = renderMemoriaColorTableCanvas(snapshot, {
    width: rightW - 8,
    fontScale: tableFontScale,
  })
  if (table) {
    // Llenar el panel derecho: escalar para ocupar alto disponible sin deformar.
    const maxW = rightW
    const maxH = contentH
    const scale = Math.min(maxW / table.width, maxH / table.height)
    const tw = table.width * scale
    const th = table.height * scale
    const tx = margin + leftW + gap + (rightW - tw) / 2
    // Alinear arriba (no centrar en vacío) para lectura inmediata.
    const ty = contentY + Math.max(0, (contentH - th) * 0.08)
    ctx.drawImage(table, tx, ty, tw, th)
  }

  ctx.fillStyle = C.muted
  ctx.font = '11px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Clara Core · Esquema 3D · PNG de alta resolución', margin, height - 12)

  const dataUri = canvas.toDataURL('image/png')
  const comma = dataUri.indexOf(',')
  let blob = null
  if (comma >= 0) {
    const bin = atob(dataUri.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: 'image/png' })
  }
  const safe = String(snapshot.nombre || 'calculo').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').trim().replace(/\s+/g, '_')
  return {
    dataUri,
    blob,
    nombre: `memoria_calculo_${safe || 'volumen'}.png`,
  }
}

/**
 * Genera el adjunto único de memoria (PNG lado a lado). Ya no emite PDF.
 */
export async function buildCalcAdjuntos(snapshot, solidsById) {
  if (!snapshot) return []
  const solidIds = new Set((snapshot.lines || []).map((l) => l.solidId).filter(Boolean))
  const solids = [...solidIds].map((id) => solidsById.get?.(id) || solidsById[id]).filter(Boolean)
  const png = await composeCalcMemoriaPng({ snapshot, solids })
  if (!png) return []
  return [{
    dataUri: png.dataUri,
    mime: 'image/png',
    nombre: png.nombre,
    kind: 'memoria-calculo',
    origen: 'esquema-calculo',
    blob: png.blob,
  }]
}

/** Compat: PDF ya no se genera. */
export async function composeCalcMemoriaPdf(opts = {}) {
  const solids = opts.solids || []
  const png = await composeCalcMemoriaPng({
    snapshot: opts.snapshot,
    solids,
    brandTitle: opts.brandTitle,
  })
  if (!png) return null
  return {
    dataUri: png.dataUri,
    blob: png.blob,
    nombre: png.nombre.replace(/\.pdf$/i, '.png'),
  }
}
