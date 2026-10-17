/**
 * Export de memoria de cálculo: una sola imagen PNG hi-res vertical
 * (encabezado → isométrico → tabla), compacta y legible.
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

/** Filas de memoria: prioriza desglose (memoriaRows); fallback a lines. */
export function memoriaDisplayRows(snapshot) {
  if (Array.isArray(snapshot?.memoriaRows) && snapshot.memoriaRows.length) {
    return snapshot.memoriaRows
  }
  const rows = []
  let n = 0
  for (const line of snapshot?.lines || []) {
    if (line.ok === false && !(line.volumeM3 > 0)) continue
    n += 1
    rows.push({
      numLabel: String(n),
      num: n,
      solidId: line.solidId,
      nombre: line.nombre,
      op: line.op,
      volumeM3: line.volumeM3 || 0,
      signedM3: line.signedM3 || 0,
      countsInTotal: true,
      color: line.detail?.color || '#0f766e',
      discountFromNombre: line.discountFromNombre || null,
      detail: line.detail,
    })
  }
  return rows
}

/** Etiquetas # a partir del snapshot (un número por sólido principal). */
export function labelsFromSnapshot(snapshot) {
  const labels = []
  const seen = new Set()
  for (const row of memoriaDisplayRows(snapshot)) {
    if (!row?.solidId || seen.has(row.solidId)) continue
    if (row.subIndex != null && row.subIndex > 0) continue
    seen.add(row.solidId)
    labels.push({ solidId: row.solidId, num: row.num })
  }
  if (labels.length) return labels
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
 * `height` fija el alto del bloque; el contenido se escala para caber.
 * `textScale` / `labelScale` hacen números y caption proporcionales a la imagen.
 */
export function renderCalcIsoCanvas(solids, {
  width = 1100,
  height = null,
  viewCaption = 'Isométrica NE',
  labels = null,
  padRatio = 0.05,
  textScale = 1,
  labelScale = 1,
} = {}) {
  if (typeof document === 'undefined') return null
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const ts = Math.max(0.85, Math.min(2.2, Number(textScale) || 1))
  const captionH = viewCaption ? Math.round(22 * ts) : 0
  const bb = list.length ? solidsIsoBounds(list) : { w: 400, h: 300, viewId: 'iso-ne', orbit: null, x: 0, y: 0 }
  const aspect = bb.w / Math.max(1, bb.h)
  const pad = Math.max(12, Math.round(width * padRatio))
  const innerW = Math.max(80, width - pad * 2)
  const naturalH = Math.round(captionH + pad * 2 + innerW / aspect)
  const isoH = height != null ? Math.max(80, Math.round(height)) : naturalH
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = isoH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = MEMORIA_COLORS.bg
  ctx.fillRect(0, 0, width, isoH)

  const drawArea = {
    x: pad,
    y: pad * 0.4 + captionH,
    w: width - pad * 2,
    h: Math.max(40, isoH - pad - captionH - pad * 0.4),
  }

  if (viewCaption) {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = `${Math.round(12 * ts)}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(viewCaption, pad, Math.round(16 * ts))
  }

  if (list.length) {
    const sx = drawArea.w / bb.w
    const sy = drawArea.h / bb.h
    const scale = Math.min(sx, sy)
    const ox = drawArea.x + (drawArea.w - bb.w * scale) / 2 - bb.x * scale
    const oy = drawArea.y + (drawArea.h - bb.h * scale) / 2 - bb.y * scale
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
      labelScale: labelScale * ts,
    })
    ctx.restore()
  } else {
    ctx.fillStyle = MEMORIA_COLORS.muted
    ctx.font = `${Math.round(15 * ts)}px "Segoe UI", system-ui, sans-serif`
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
 * Soporta desglose N / N.1 / N.2 y columna "Descuenta de".
 * `fontScale` y anchos crecen con el tamaño de la imagen (legibilidad prioritaria).
 * Filas netas: Long/Anch/Espesor = "—"; Operación = "3 − 3.1".
 */
export function renderMemoriaColorTableCanvas(snapshot, {
  width = 880,
  fontScale = 1,
} = {}) {
  if (typeof document === 'undefined') return null
  const C = MEMORIA_COLORS
  const fs = Math.max(0.9, Math.min(2.0, Number(fontScale) || 1))
  const margin = Math.round(8 * fs)
  const baseCols = [
    { key: 'num', label: '#', w: 44 },
    { key: 'color', label: 'Color', w: 48 },
    { key: 'nombre', label: 'Nombre', w: 168 },
    { key: 'op', label: 'Operación', w: 100 },
    { key: 'from', label: 'Descuenta de', w: 120 },
    { key: 'long', label: 'Long', w: 64 },
    { key: 'anch', label: 'Anch', w: 64 },
    { key: 'espesor', label: 'Espesor', w: 78 },
    { key: 'vol', label: 'Volumen (m³)', w: 108 },
  ]
  const baseW = baseCols.reduce((s, c) => s + c.w, 0)
  // Mismo ancho que el isométrico: estirar columnas al ancho pedido (fs solo tipografía).
  const avail = Math.max(baseW, Math.round(width) - margin * 2)
  const stretch = avail / baseW
  const cols = baseCols.map((c) => ({ ...c, w: Math.round(c.w * stretch) }))
  let sumW = cols.reduce((s, c) => s + c.w, 0)
  const targetW = Math.round(avail)
  if (sumW !== targetW && cols.length) {
    cols[cols.length - 1].w += (targetW - sumW)
  }
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const canvasW = tableW + margin * 2
  const rowH = Math.round(36 * fs)
  const colHeaderH = Math.round(34 * fs)
  const totalH = Math.round(40 * fs)
  const rows = memoriaDisplayRows(snapshot)
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
  ctx.font = `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
  let x = x0
  for (const col of cols) {
    ctx.fillText(col.label, x + 5, y0 + Math.round(22 * fs))
    x += col.w
  }
  y0 += colHeaderH

  rows.forEach((row, idx) => {
    const d = row.detail || {}
    const isSub = row.op === 'subtract'
    const isNet = !!(row.isNetRow || String(row.nombre || '').includes('(neto)'))
    ctx.fillStyle = idx % 2 === 0 ? C.bg : C.rowAlt
    ctx.fillRect(x0, y0, tableW, rowH)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0, y0, tableW, rowH)

    ctx.fillStyle = row.color || d.color || C.text
    ctx.font = `bold ${Math.round(13 * fs)}px "Segoe UI", system-ui, sans-serif`
    const numTxt = String(row.numLabel || row.num || '')
    ctx.fillText(numTxt, x0 + (cols[0].w - ctx.measureText(numTxt).width) / 2, y0 + Math.round(24 * fs))

    const color = row.color || d.color || '#0f766e'
    const sw = Math.round(20 * fs)
    const sh = Math.round(15 * fs)
    const cx0 = x0 + cols[0].w
    ctx.fillStyle = color
    ctx.fillRect(cx0 + (cols[1].w - sw) / 2, y0 + (rowH - sh) / 2, sw, sh)
    ctx.strokeStyle = C.border
    ctx.strokeRect(cx0 + (cols[1].w - sw) / 2 + 0.5, y0 + (rowH - sh) / 2 + 0.5, sw - 1, sh - 1)

    let opLabel = isSub ? 'Descuenta' : 'Suma'
    if (row.subIndex === 0 && String(row.nombre || '').includes('(exterior)')) opLabel = 'Exterior'
    if (isNet) opLabel = row.netOpLabel || d.formaCalculo?.split('=')[0]?.trim() || 'Neto'

    const cells = {
      nombre: row.nombre || 'Elemento',
      op: opLabel,
      from: row.discountFromNombre || '—',
      long: isNet ? '—' : (d.longM != null ? fmtMemoria(d.longM) : '—'),
      anch: isNet ? '—' : (d.anchM != null ? fmtMemoria(d.anchM) : '—'),
      espesor: isNet
        ? '—'
        : (d.espesorM != null
          ? fmtMemoria(d.espesorM)
          : (d.altura != null ? fmtMemoria(d.altura) : '—')),
      vol: fmtMemoria(row.volumeM3 || 0),
    }
    let cx = cx0 + cols[1].w
    const keys = ['nombre', 'op', 'from', 'long', 'anch', 'espesor', 'vol']
    keys.forEach((key, ki) => {
      const col = cols[ki + 2]
      const isVol = key === 'vol'
      const isOp = key === 'op'
      ctx.fillStyle = (isOp && (isSub || isNet)) ? C.subtract : C.text
      ctx.font = (isVol || isOp || isNet)
        ? `bold ${Math.round(13 * fs)}px "Segoe UI", system-ui, sans-serif`
        : `${Math.round(13 * fs)}px "Segoe UI", system-ui, sans-serif`
      let txt = String(cells[key])
      const maxChars = Math.max(8, Math.floor(col.w / (7 * fs)))
      if (txt.length > maxChars && (key === 'nombre' || key === 'from' || key === 'op')) {
        txt = `${txt.slice(0, Math.max(4, maxChars - 1))}…`
      }
      const tx = (isVol || key === 'long' || key === 'anch' || key === 'espesor')
        ? cx + col.w - 8 - ctx.measureText(txt).width
        : cx + 5
      ctx.fillText(txt, tx, y0 + Math.round(24 * fs))
      cx += col.w
    })
    y0 += rowH
  })

  ctx.fillStyle = C.totalBg
  ctx.fillRect(x0, y0, tableW, totalH)
  ctx.strokeStyle = C.primary
  ctx.lineWidth = 1.5 * fs
  ctx.strokeRect(x0, y0, tableW, totalH)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${Math.round(15 * fs)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('TOTAL', x0 + 10, y0 + Math.round(26 * fs))
  const tot = `${fmtMemoria(snapshot?.totalM3 || 0)} m³`
  ctx.fillText(tot, x0 + tableW - 10 - ctx.measureText(tot).width, y0 + Math.round(26 * fs))

  return canvas
}

/** Compat: tabla antigua. */
export function renderMemoriaTableCanvas(snapshot, opts = {}) {
  return renderMemoriaColorTableCanvas(snapshot, opts)
}

/**
 * Una sola PNG hi-res vertical:
 * encabezado → isométrico → tabla (misma anchura).
 * Prioridad: tabla legible; textos proporcionales al tamaño de la imagen;
 * isométrico ≤ ~½ de la altura total.
 */
export async function composeCalcMemoriaPng({
  snapshot,
  solids = [],
  brandTitle = 'Clara Core',
  width = null,
} = {}) {
  if (typeof document === 'undefined' || !snapshot) return null
  const C = MEMORIA_COLORS
  const rows = memoriaDisplayRows(snapshot)
  const nRows = Math.max(1, rows.length)
  const labels = labelsFromSnapshot(snapshot)

  // Ancho base legible a pantalla completa; crece un poco con muchas filas.
  const baseW = width != null
    ? width
    : Math.round(1480 + Math.min(400, Math.max(0, nRows - 4) * 40))
  const textScale = baseW / 1400
  const margin = Math.round(28 * textScale)
  const headerH = Math.round(78 * textScale)
  const footerH = Math.round(26 * textScale)
  const gap = Math.round(14 * textScale)

  // Tabla primero (prioridad de legibilidad): mismo ancho que el bloque de contenido.
  const contentW = baseW - margin * 2
  const tableFontScale = textScale * (nRows <= 5 ? 1.08 : (nRows <= 9 ? 1.0 : 0.94))
  const table = renderMemoriaColorTableCanvas(snapshot, {
    width: contentW,
    fontScale: tableFontScale,
  })
  const tableW = table ? table.width : contentW
  const tableH = table ? table.height : Math.round(140 * textScale)
  const imgW = Math.max(baseW, tableW + margin * 2)
  const isoW = imgW - margin * 2

  // Iso ≤ ~½ de la altura final: isoH ≤ header + table + footer + gaps
  const maxIsoH = headerH + tableH + footerH + gap * 2
  const iso = renderCalcIsoCanvas(solids, {
    width: isoW,
    height: maxIsoH,
    viewCaption: 'Isométrica NE',
    labels,
    padRatio: 0.04,
    textScale,
    labelScale: 1.15,
  })
  const isoH = iso ? iso.height : Math.round(maxIsoH * 0.85)
  const height = headerH + gap + isoH + gap + tableH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, imgW, height)

  // Encabezado (tipografía proporcional)
  ctx.fillStyle = C.headerBg
  ctx.fillRect(0, 0, imgW, headerH)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${Math.round(26 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Memoria de cálculo de volúmenes', margin, Math.round(32 * textScale))
  ctx.fillStyle = C.text
  ctx.font = `bold ${Math.round(16 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(String(snapshot.nombre || 'Cálculo'), margin, Math.round(58 * textScale))
  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(13 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(brandTitle, imgW * 0.42, Math.round(32 * textScale))
  if (snapshot.frozenAt) {
    const fecha = new Date(snapshot.frozenAt).toLocaleString('es-CO')
    ctx.fillText(fecha, imgW - margin - 20 - ctx.measureText(fecha).width, Math.round(58 * textScale))
  }

  const logo = await loadLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = Math.round(110 * textScale)
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(img, imgW - margin - lw, Math.round(10 * textScale), lw, Math.min(lh, headerH - Math.round(16 * textScale)))
    } catch { /* ignore */ }
  }

  let y = headerH + gap
  if (iso) {
    const ix = margin + Math.max(0, (isoW - iso.width) / 2)
    ctx.drawImage(iso, ix, y)
    y += isoH + gap
  }

  if (table) {
    const tx = margin + Math.max(0, (isoW - table.width) / 2)
    ctx.drawImage(table, tx, y)
    y += tableH
  }

  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(11 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Clara Core · Esquema 3D · PNG de alta resolución', margin, height - Math.round(10 * textScale))

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
    meta: {
      width: imgW,
      height,
      isoH,
      tableH,
      textScale,
      isoRatio: isoH / height,
    },
  }
}

/**
 * Genera el adjunto único de memoria (PNG vertical). Ya no emite PDF.
 */
export async function buildCalcAdjuntos(snapshot, solidsById) {
  if (!snapshot) return []
  const solidIds = new Set()
  for (const l of snapshot.lines || []) {
    if (l.solidId) solidIds.add(l.solidId)
  }
  for (const r of snapshot.memoriaRows || []) {
    if (r.solidId) solidIds.add(r.solidId)
  }
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
