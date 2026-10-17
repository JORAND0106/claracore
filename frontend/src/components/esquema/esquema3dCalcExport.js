/**
 * Export de memoria de cálculo: PNG isométrico de soporte + PDF.
 */
import { jsPDF } from 'jspdf'
import { drawSolid3d } from './esquema3dSolids.js'
import { formatVolumeM3 } from './esquema3dCalc.js'

const LOGO_URL = '/CLARA.CORE.png'

function solidsBounds(solids) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const solid of solids || []) {
    for (const cell of solid.cells || []) {
      const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
      const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
      for (const p of cell.ring || []) {
        // iso-ne projection (same as drawSolid3d)
        const pts = [
          projectIso(p.x, p.y, z0),
          projectIso(p.x, p.y, z1),
        ]
        for (const q of pts) {
          minX = Math.min(minX, q.x)
          minY = Math.min(minY, q.y)
          maxX = Math.max(maxX, q.x)
          maxY = Math.max(maxY, q.y)
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 400, h: 300 }
  return {
    x: minX,
    y: minY,
    w: Math.max(40, maxX - minX),
    h: Math.max(40, maxY - minY),
  }
}

function projectIso(x, y, zCota) {
  const z = -(zCota * 50) // PX_PER_METER
  const cos = Math.SQRT1_2
  const sin = Math.SQRT1_2
  return { x: (x - y) * cos, y: (x + y) * sin * 0.5 + z }
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

/**
 * PNG isométrico de los sólidos del cálculo, con marca Clara Core.
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
  // Fondo institucional
  const g = ctx.createLinearGradient(0, 0, width, height)
  g.addColorStop(0, '#f8fafc')
  g.addColorStop(1, '#e2e8f0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  // Marco
  ctx.strokeStyle = '#0f766e'
  ctx.lineWidth = 3
  ctx.strokeRect(12, 12, width - 24, height - 24)

  // Título
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText(String(title || 'Gráfico de soporte').slice(0, 80), 36, 52)
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('Vista isométrica · memoria de cálculo', 36, 76)

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = 160
      const lh = (img.height / img.width) * lw
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
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(drawArea.x, drawArea.y, drawArea.w, drawArea.h)

  if (list.length) {
    const bb = solidsBounds(list)
    const pad = 40
    const sx = (drawArea.w - pad * 2) / bb.w
    const sy = (drawArea.h - pad * 2) / bb.h
    const scale = Math.min(sx, sy, 2.5)
    const ox = drawArea.x + pad + (drawArea.w - pad * 2 - bb.w * scale) / 2 - bb.x * scale
    const oy = drawArea.y + pad + (drawArea.h - pad * 2 - bb.h * scale) / 2 - bb.y * scale
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)
    for (const solid of list) {
      drawSolid3d(ctx, solid, { viewId: 'iso-ne', selected: false, zoom: scale })
    }
    ctx.restore()
  } else {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText('Sin sólidos en este cálculo', drawArea.x + 24, drawArea.y + 40)
  }
  ctx.restore()

  ctx.fillStyle = '#64748b'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText('Clara Core · Esquema 3D', 36, height - 28)

  return canvas.toDataURL('image/png')
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
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

/**
 * PDF de memoria de cálculo a partir de un snapshot congelado.
 * @returns {Promise<{ dataUri: string, blob: Blob, nombre: string }|null>}
 */
export async function composeCalcMemoriaPdf({
  snapshot,
  isoPngDataUrl = null,
  brandTitle = 'Clara Core',
} = {}) {
  if (!snapshot) return null
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  let y = margin

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', pageW - margin - 110, margin - 8, 110, 32)
    } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Memoria de cálculo de volúmenes', margin, y)
  y += 22
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(brandTitle, margin, y)
  y += 18
  doc.setDrawColor(15, 118, 110)
  doc.setLineWidth(1.2)
  doc.line(margin, y, pageW - margin, y)
  y += 22

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(`Cálculo: ${snapshot.nombre || 'Sin nombre'}`, margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  if (snapshot.frozenAt) {
    doc.text(`Fecha: ${new Date(snapshot.frozenAt).toLocaleString('es-CO')}`, margin, y)
    y += 18
  }

  // Tabla de elementos
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Elementos', margin, y)
  y += 14

  for (const line of snapshot.lines || []) {
    if (y > pageH - 120) {
      doc.addPage()
      y = margin
    }
    const sign = line.op === 'subtract' ? 'Descuenta' : 'Suma'
    const vol = formatVolumeM3(line.volumeM3 || 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text(`• ${line.nombre || 'Elemento'}  [${sign}]  ${vol}`, margin, y)
    y += 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    const d = line.detail
    if (d) {
      const rows = [
        `Forma: ${d.forma}`,
        `Dimensiones: ${d.dimensiones}`,
        `Cota superior: ${fmtNum(d.cotaSuperior)} m · Cota inferior: ${fmtNum(d.cotaInferior)} m`,
        `Forma de cálculo: ${d.formaCalculo}`,
      ]
      for (const row of rows) {
        const wrapped = doc.splitTextToSize(row, pageW - margin * 2)
        doc.text(wrapped, margin + 12, y)
        y += wrapped.length * 11
      }
    } else if (line.error) {
      doc.setTextColor(185, 28, 28)
      doc.text(String(line.error), margin + 12, y)
      y += 12
    }
    y += 8
  }

  if (y > pageH - 80) {
    doc.addPage()
    y = margin
  }
  doc.setDrawColor(15, 118, 110)
  doc.line(margin, y, pageW - margin, y)
  y += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text(`Total: ${formatVolumeM3(snapshot.totalM3 || 0)}`, margin, y)
  y += 24

  // Gráfico isométrico
  if (isoPngDataUrl) {
    if (y > pageH - 280) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Gráfico de soporte (isometría)', margin, y)
    y += 10
    const imgW = pageW - margin * 2
    const imgH = imgW * 0.7
    try {
      doc.addImage(isoPngDataUrl, 'PNG', margin, y, imgW, Math.min(imgH, pageH - y - margin))
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

function fmtNum(n) {
  const x = Number(n)
  return Number.isFinite(x) ? x.toFixed(2) : '—'
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
