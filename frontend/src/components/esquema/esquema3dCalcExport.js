/**
 * Export de memoria de cálculo: una sola imagen PNG hi-res
 * (isométrico a la izquierda + cuadro por colores a la derecha).
 * Fondo blanco / tipografía oscura (legible en cualquier tema).
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

/**
 * Dibuja el isométrico NE de los sólidos (líneas nítidas, ocultas punteadas).
 * @returns {HTMLCanvasElement|null}
 */
export function renderCalcIsoCanvas(solids, {
  width = 1100,
  height = 900,
  title = null,
} = {}) {
  if (typeof document === 'undefined') return null
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = MEMORIA_COLORS.bg
  ctx.fillRect(0, 0, width, height)

  const topPad = title ? 56 : 24
  if (title) {
    ctx.fillStyle = MEMORIA_COLORS.text
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(String(title).slice(0, 60), 24, 36)
  }

  const drawArea = {
    x: 24,
    y: topPad,
    w: width - 48,
    h: height - topPad - 28,
  }
  ctx.strokeStyle = MEMORIA_COLORS.border
  ctx.lineWidth = 1
  ctx.strokeRect(drawArea.x + 0.5, drawArea.y + 0.5, drawArea.w - 1, drawArea.h - 1)

  if (list.length) {
    const bb = solidsIsoBounds(list)
    const pad = 36
    const sx = (drawArea.w - pad * 2) / bb.w
    const sy = (drawArea.h - pad * 2) / bb.h
    // Escala generosa para líneas nítidas (sin techo artificial bajo).
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
      zoom: 1 / Math.max(scale, 0.15),
      orbit: bb.orbit,
    })
    ctx.restore()
  } else {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = '16px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('Sin sólidos en este cálculo', drawArea.x + 24, drawArea.y + 40)
  }
  return canvas
}

/** @deprecated usar renderCalcIsoCanvas / composeCalcMemoriaPng */
export async function composeCalcIsoPng({
  solids = [],
  title = 'Gráfico de soporte',
  width = 1280,
  height = 900,
} = {}) {
  const canvas = renderCalcIsoCanvas(solids, { width, height, title })
  return canvas ? canvas.toDataURL('image/png') : null
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxWidth) line = test
    else {
      if (line) lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/**
 * Cuadro de resumen por colores (Excel-like):
 * Color | Nombre capa | Operación | Long | Anch | Espesor/Altura | Volumen
 */
export function renderMemoriaColorTableCanvas(snapshot, {
  width = 720,
  brandTitle = 'Clara Core',
} = {}) {
  if (typeof document === 'undefined') return null
  const C = MEMORIA_COLORS
  const margin = 20
  const cols = [
    { key: 'color', label: 'Color', w: 52 },
    { key: 'nombre', label: 'Nombre de la capa', w: 180 },
    { key: 'op', label: 'Operación', w: 88 },
    { key: 'long', label: 'Long', w: 70 },
    { key: 'anch', label: 'Anch', w: 70 },
    { key: 'espesor', label: 'Espesor / Altura', w: 110 },
    { key: 'vol', label: 'Volumen (m³)', w: 100 },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const canvasW = Math.max(width, tableW + margin * 2)

  const measure = document.createElement('canvas').getContext('2d')
  measure.font = '12px "Segoe UI", system-ui, sans-serif'
  const rowH = 36
  const rows = (snapshot?.lines || []).filter((l) => l.ok !== false || l.volumeM3 != null)
  const headerH = 88
  const colHeaderH = 34
  const totalH = 40
  const footerH = 24
  const bodyH = Math.max(rowH, rows.length * rowH)
  const canvasH = headerH + colHeaderH + bodyH + totalH + footerH + margin

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, canvasW, canvasH)

  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, canvasW, headerH - 6)
  ctx.fillStyle = C.primary
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Memoria de cálculo de volúmenes', margin, 28)
  ctx.fillStyle = C.muted
  ctx.font = '12px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(brandTitle, margin, 48)
  ctx.fillStyle = C.text
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(snapshot?.nombre || 'Sin nombre'), margin, 70)
  if (snapshot?.frozenAt) {
    ctx.fillStyle = C.muted
    ctx.font = '11px "Segoe UI", system-ui, sans-serif'
    const fecha = `Fecha: ${new Date(snapshot.frozenAt).toLocaleString('es-CO')}`
    ctx.fillText(fecha, canvasW - margin - ctx.measureText(fecha).width, 70)
  }

  let x0 = margin
  let y0 = headerH
  ctx.fillStyle = C.primary
  ctx.fillRect(x0, y0, tableW, colHeaderH)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif'
  let x = x0
  for (const col of cols) {
    ctx.fillText(col.label, x + 6, y0 + 22)
    x += col.w
  }
  y0 += colHeaderH

  rows.forEach((line, idx) => {
    const d = line.detail || {}
    const isSub = line.op === 'subtract'
    ctx.fillStyle = idx % 2 === 0 ? C.bg : C.rowAlt
    ctx.fillRect(x0, y0, tableW, rowH)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0, y0, tableW, rowH)

    const color = d.color || '#0f766e'
    const sw = 22
    const sh = 18
    ctx.fillStyle = color
    ctx.fillRect(x0 + (cols[0].w - sw) / 2, y0 + (rowH - sh) / 2, sw, sh)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0 + (cols[0].w - sw) / 2 + 0.5, y0 + (rowH - sh) / 2 + 0.5, sw - 1, sh - 1)

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
    let cx = x0 + cols[0].w
    const keys = ['nombre', 'op', 'long', 'anch', 'espesor', 'vol']
    keys.forEach((key, ki) => {
      const col = cols[ki + 1]
      const isVol = key === 'vol'
      const isOp = key === 'op'
      ctx.fillStyle = isOp && isSub ? C.subtract : C.text
      ctx.font = (isVol || isOp) ? 'bold 12px "Segoe UI", system-ui, sans-serif' : '12px "Segoe UI", system-ui, sans-serif'
      const txt = String(cells[key])
      const tx = (isVol || key === 'long' || key === 'anch' || key === 'espesor')
        ? cx + col.w - 8 - ctx.measureText(txt).width
        : cx + 6
      ctx.fillText(txt, tx, y0 + 23)
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
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('TOTAL', x0 + 10, y0 + 26)
  const tot = `${fmtMemoria(snapshot?.totalM3 || 0)} m³`
  ctx.fillText(tot, x0 + tableW - 10 - ctx.measureText(tot).width, y0 + 26)

  ctx.fillStyle = C.muted
  ctx.font = '10px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Clara Core · Memoria PNG (fondo blanco)', margin, canvasH - 8)

  return canvas
}

/** Compat: tabla antigua (tests / callers legacy). */
export function renderMemoriaTableCanvas(snapshot, opts = {}) {
  return renderMemoriaColorTableCanvas(snapshot, opts)
}

/**
 * Una sola PNG hi-res: isométrico (izq) + cuadro por colores (der).
 * @returns {Promise<{ dataUri: string, blob: Blob, nombre: string }|null>}
 */
export async function composeCalcMemoriaPng({
  snapshot,
  solids = [],
  brandTitle = 'Clara Core',
  width = 2200,
  height = 1200,
} = {}) {
  if (typeof document === 'undefined' || !snapshot) return null
  const C = MEMORIA_COLORS
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)

  const margin = 28
  const gap = 24
  const headerH = 72

  // Encabezado
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, width, headerH)
  ctx.fillStyle = C.primary
  ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Memoria de cálculo de volúmenes', margin, 34)
  ctx.fillStyle = C.text
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(snapshot.nombre || 'Cálculo'), margin, 58)
  ctx.fillStyle = C.muted
  ctx.font = '13px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(brandTitle, width / 2 - 40, 34)
  if (snapshot.frozenAt) {
    const fecha = new Date(snapshot.frozenAt).toLocaleString('es-CO')
    ctx.fillText(fecha, width - margin - ctx.measureText(fecha).width, 58)
  }

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = 120
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, width - margin - lw, 10, lw, Math.min(lh, headerH - 14))
    } catch { /* ignore */ }
  }

  const contentY = headerH + 12
  const contentH = height - contentY - 36
  const leftW = Math.floor((width - margin * 2 - gap) * 0.52)
  const rightW = width - margin * 2 - gap - leftW

  const iso = renderCalcIsoCanvas(solids, {
    width: leftW,
    height: contentH,
    title: 'Isométrica NE',
  })
  if (iso) ctx.drawImage(iso, margin, contentY)

  const table = renderMemoriaColorTableCanvas(snapshot, {
    width: rightW,
    brandTitle,
  })
  if (table) {
    // Escalar la tabla para caber en el panel derecho sin deformar.
    const scale = Math.min(rightW / table.width, contentH / table.height, 1.25)
    const tw = table.width * scale
    const th = table.height * scale
    const tx = margin + leftW + gap + (rightW - tw) / 2
    const ty = contentY + (contentH - th) / 2
    ctx.drawImage(table, tx, ty, tw, th)
  }

  ctx.fillStyle = C.muted
  ctx.font = '11px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Clara Core · Esquema 3D · PNG de alta resolución', margin, height - 14)

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

/** Compat: PDF ya no se genera; se conserva la firma por si hay imports residuales. */
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
