/**
 * Export de memoria de cálculo: PNG isométrico de soporte + PDF legible.
 * Siempre fondo blanco / texto oscuro (independiente del tema de la UI).
 * Caracteres Unicode (π, ², ³, Ø, ×) se dibujan en canvas (fuentes del sistema).
 */
import { jsPDF } from 'jspdf'
import { drawSolid3d } from './esquema3dSolids.js'
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
 * PNG isométrico de los sólidos del cálculo, fondo blanco, sólidos centrados.
 * @returns {Promise<string|null>} data URL PNG
 */
export async function composeCalcIsoPng({
  solids = [],
  title = 'Gráfico de soporte',
  width = 1280,
  height = 900,
} = {}) {
  if (typeof document === 'undefined') return null
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Fondo siempre blanco (legible en cualquier tema)
  ctx.fillStyle = MEMORIA_COLORS.bg
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = MEMORIA_COLORS.primary
  ctx.lineWidth = 3
  ctx.strokeRect(12, 12, width - 24, height - 24)

  ctx.fillStyle = MEMORIA_COLORS.text
  ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(title || 'Gráfico de soporte').slice(0, 80), 36, 52)
  ctx.font = '14px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = MEMORIA_COLORS.muted
  ctx.fillText('Vista isométrica NE · memoria de cálculo', 36, 76)

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = 160
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, width - lw - 36, 28, lw, lh)
    } catch { /* ignore */ }
  }

  const drawArea = {
    x: 48,
    y: 110,
    w: width - 96,
    h: height - 160,
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h)
  ctx.clip()
  ctx.fillStyle = MEMORIA_COLORS.bg
  ctx.fillRect(drawArea.x, drawArea.y, drawArea.w, drawArea.h)
  ctx.strokeStyle = MEMORIA_COLORS.border
  ctx.lineWidth = 1
  ctx.strokeRect(drawArea.x + 0.5, drawArea.y + 0.5, drawArea.w - 1, drawArea.h - 1)

  if (list.length) {
    const bb = solidsIsoBounds(list)
    const pad = 48
    const sx = (drawArea.w - pad * 2) / bb.w
    const sy = (drawArea.h - pad * 2) / bb.h
    const scale = Math.min(sx, sy, 3)
    const ox = drawArea.x + pad + (drawArea.w - pad * 2 - bb.w * scale) / 2 - bb.x * scale
    const oy = drawArea.y + pad + (drawArea.h - pad * 2 - bb.h * scale) / 2 - bb.y * scale
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)
    for (const solid of list) {
      drawSolid3d(ctx, solid, {
        viewId: bb.viewId,
        selected: false,
        zoom: 1 / Math.max(scale, 0.25),
        orbit: bb.orbit,
      })
    }
    ctx.restore()
  } else {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = '16px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('Sin sólidos en este cálculo', drawArea.x + 24, drawArea.y + 40)
  }
  ctx.restore()

  ctx.fillStyle = MEMORIA_COLORS.muted
  ctx.font = '12px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Clara Core · Esquema 3D', 36, height - 28)

  return canvas.toDataURL('image/png')
}

function dataUrlToUint8(dataUrl) {
  const comma = String(dataUrl || '').indexOf(',')
  if (comma < 0) return null
  const b64 = dataUrl.slice(comma + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
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
 * Dibuja la tabla tipo Excel de la memoria en un canvas (Unicode OK).
 * @returns {HTMLCanvasElement}
 */
export function renderMemoriaTableCanvas(snapshot, {
  width = 1100,
  brandTitle = 'Clara Core',
} = {}) {
  if (typeof document === 'undefined') return null
  const C = MEMORIA_COLORS
  const margin = 28
  const cols = [
    { key: 'elemento', label: 'Elemento', w: 120 },
    { key: 'op', label: 'Operación', w: 78 },
    { key: 'forma', label: 'Forma', w: 110 },
    { key: 'dims', label: 'Dimensiones', w: 110 },
    { key: 'cotaSup', label: 'Cota sup.', w: 72 },
    { key: 'cotaInf', label: 'Cota inf.', w: 72 },
    { key: 'altura', label: 'Altura', w: 62 },
    { key: 'formula', label: 'Forma de cálculo', w: 260 },
    { key: 'vol', label: 'Volumen (m³)', w: 90 },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const canvasW = Math.max(width, tableW + margin * 2)

  // Medir filas
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = '11px "Segoe UI", system-ui, sans-serif'
  const rowPads = 8
  const lineH = 14
  const rowsMeta = []
  for (const line of snapshot?.lines || []) {
    const d = line.detail || {}
    const cells = {
      elemento: line.nombre || 'Elemento',
      op: line.op === 'subtract' ? 'Descuenta' : 'Suma',
      forma: d.forma || '—',
      dims: d.dimensiones || '—',
      cotaSup: d.cotaSuperior != null ? fmtMemoria(d.cotaSuperior) : '—',
      cotaInf: d.cotaInferior != null ? fmtMemoria(d.cotaInferior) : '—',
      altura: d.altura != null ? fmtMemoria(d.altura) : (
        d.cotaSuperior != null && d.cotaInferior != null
          ? fmtMemoria(Math.abs(Number(d.cotaSuperior) - Number(d.cotaInferior)))
          : '—'
      ),
      formula: d.formaCalculo || line.error || '—',
      vol: fmtMemoria(line.volumeM3 || 0),
    }
    let maxLines = 1
    cols.forEach((col) => {
      const wrapped = wrapText(measure, cells[col.key], col.w - 10)
      maxLines = Math.max(maxLines, wrapped.length)
    })
    rowsMeta.push({ cells, h: Math.max(28, maxLines * lineH + rowPads) })
  }

  const headerH = 96
  const colHeaderH = 32
  const totalH = 36
  const footerH = 28
  const bodyH = rowsMeta.reduce((s, r) => s + r.h, 0)
  const canvasH = headerH + colHeaderH + bodyH + totalH + footerH + margin

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Encabezado
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, canvasW, headerH - 8)
  ctx.fillStyle = C.primary
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Memoria de cálculo de volúmenes', margin, 32)
  ctx.fillStyle = C.muted
  ctx.font = '12px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(brandTitle, margin, 52)
  ctx.fillStyle = C.text
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(snapshot?.nombre || 'Sin nombre'), margin, 74)
  if (snapshot?.frozenAt) {
    ctx.fillStyle = C.muted
    ctx.font = '11px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(`Fecha: ${new Date(snapshot.frozenAt).toLocaleString('es-CO')}`, margin, 90)
  }

  // Cabecera de columnas
  let x0 = margin
  let y0 = headerH
  ctx.fillStyle = C.primary
  ctx.fillRect(x0, y0, tableW, colHeaderH)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif'
  let x = x0
  for (const col of cols) {
    ctx.fillText(col.label, x + 5, y0 + 20)
    x += col.w
  }
  y0 += colHeaderH

  // Filas
  rowsMeta.forEach((row, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? C.bg : C.rowAlt
    ctx.fillRect(x0, y0, tableW, row.h)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0, y0, tableW, row.h)
    let cx = x0
    ctx.font = '11px "Segoe UI", system-ui, sans-serif'
    for (const col of cols) {
      const isVol = col.key === 'vol'
      const isOp = col.key === 'op'
      const isSub = row.cells.op === 'Descuenta'
      ctx.fillStyle = isOp && isSub
        ? C.subtract
        : (isVol ? C.text : C.text)
      if (isVol || isOp) ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif'
      else ctx.font = '11px "Segoe UI", system-ui, sans-serif'
      const wrapped = wrapText(ctx, row.cells[col.key], col.w - 10)
      wrapped.forEach((ln, li) => {
        const tx = isVol ? cx + col.w - 6 - ctx.measureText(ln).width : cx + 5
        ctx.fillText(ln, tx, y0 + 16 + li * lineH)
      })
      cx += col.w
    }
    y0 += row.h
  })

  // Total
  ctx.fillStyle = C.totalBg
  ctx.fillRect(x0, y0, tableW, totalH)
  ctx.strokeStyle = C.primary
  ctx.strokeRect(x0, y0, tableW, totalH)
  ctx.fillStyle = C.primary
  ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('TOTAL', x0 + 8, y0 + 23)
  const tot = `${fmtMemoria(snapshot?.totalM3 || 0)} m³`
  ctx.fillText(tot, x0 + tableW - 8 - ctx.measureText(tot).width, y0 + 23)

  ctx.fillStyle = C.muted
  ctx.font = '10px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Clara Core · Documento generado con fondo blanco (legible en cualquier tema)', margin, canvasH - 10)

  return canvas
}

/**
 * PDF de memoria: tabla Excel (canvas Unicode) + isometría.
 * Fondo blanco / texto oscuro siempre.
 */
export async function composeCalcMemoriaPdf({
  snapshot,
  isoPngDataUrl = null,
  brandTitle = 'Clara Core',
} = {}) {
  if (!snapshot) return null
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 36

  // Fondo blanco explícito (por si el viewer hereda tema oscuro)
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageW, pageH, 'F')

  const tableCanvas = renderMemoriaTableCanvas(snapshot, { brandTitle })
  if (tableCanvas) {
    const dataUrl = tableCanvas.toDataURL('image/png')
    const maxW = pageW - margin * 2
    const scale = maxW / tableCanvas.width
    const imgH = tableCanvas.height * scale
    const fitH = Math.min(imgH, pageH - margin * 2 - 20)
    const fitW = (fitH / tableCanvas.height) * tableCanvas.width
    doc.addImage(dataUrl, 'PNG', margin, margin, Math.min(maxW, fitW), fitH)
  }

  if (isoPngDataUrl) {
    doc.addPage()
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageW, pageH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text('Grafico de soporte (isometria NE)', margin, margin)
    const imgW = pageW - margin * 2
    const imgH = Math.min(imgW * 0.72, pageH - margin * 2 - 24)
    try {
      doc.addImage(isoPngDataUrl, 'PNG', margin, margin + 16, imgW, imgH)
    } catch { /* ignore */ }
  }

  const dataUri = doc.output('datauristring')
  const bytes = dataUrlToUint8(dataUri)
  const blob = bytes
    ? new Blob([bytes], { type: 'application/pdf' })
    : doc.output('blob')
  const safe = String(snapshot.nombre || 'calculo').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').trim().replace(/\s+/g, '_')
  return {
    dataUri,
    blob,
    nombre: `memoria_calculo_${safe || 'volumen'}.pdf`,
  }
}

/**
 * Genera adjuntos (PDF + PNG) para un snapshot de cálculo.
 */
export async function buildCalcAdjuntos(snapshot, solidsById) {
  if (!snapshot) return []
  const solidIds = new Set((snapshot.lines || []).map((l) => l.solidId).filter(Boolean))
  const solids = [...solidIds].map((id) => solidsById.get?.(id) || solidsById[id]).filter(Boolean)
  const isoPng = await composeCalcIsoPng({
    solids,
    title: snapshot.nombre || 'Cálculo',
  })
  const adjuntos = []
  if (isoPng) {
    const safe = String(snapshot.nombre || 'calculo').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').trim().replace(/\s+/g, '_')
    adjuntos.push({
      dataUri: isoPng,
      mime: 'image/png',
      nombre: `grafico_isometrico_${safe || 'volumen'}.png`,
      kind: 'grafico-isometrico',
      origen: 'esquema-calculo',
    })
  }
  const pdf = await composeCalcMemoriaPdf({ snapshot, isoPngDataUrl: isoPng })
  if (pdf) {
    adjuntos.push({
      dataUri: pdf.dataUri,
      mime: 'application/pdf',
      nombre: pdf.nombre,
      kind: 'memoria-calculo',
      origen: 'esquema-calculo',
      blob: pdf.blob,
    })
  }
  return adjuntos
}
