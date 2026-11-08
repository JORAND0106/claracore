/**
 * Export de memoria de cálculo: una sola imagen PNG hi-res vertical
 * (encabezado → isométrico → tabla), compacta y legible.
 * Misma representación de sólidos que el editor 3D.
 */
import { drawSolids3dLayered } from './esquema3dSolids.js'
import { fmtMemoria } from './esquema3dCalc.js'
import { projectWorld3dToCanvas, solidsViewCamera } from './esquema3dViews.js'
import { ESQUEMA_DOC_TYPE_SCALE, esquemaDocFontHierarchy } from './esquemaDocLegibility.js'
import {
  drawEsquemaSalidaHeader,
  ESQUEMA_SALIDA_BRAND,
  planEsquemaSalidaHeader,
} from './esquemaSalidaHeader.js'

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
  const ts = Math.max(0.85, Math.min(4.4, Number(textScale) || 1))
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
 * Parte texto en hasta `maxLines` líneas que caben en `maxW`.
 * Nunca parte palabras a mitad (C-OUT-03/08): solo corta en espacios o
 * separadores tipográficos (· × −). Si una sola palabra no cabe, se deja
 * entera (la columna debe ensancharse antes).
 */
export function wrapMemoriaText(ctx, text, maxW, maxLines = 2) {
  const raw = String(text ?? '')
  if (!raw) return ['']
  if (ctx.measureText(raw).width <= maxW) return [raw]
  // Solo cortes entre palabras / separadores — jamás por carácter.
  const tokens = raw.split(/(\s+|·|×|−)/).filter((t) => t.length)
  const lines = []
  let cur = ''
  const push = () => {
    if (cur) lines.push(cur)
    cur = ''
  }
  for (const tok of tokens) {
    if (lines.length >= maxLines) break
    const trial = cur + tok
    if (ctx.measureText(trial).width <= maxW || !cur) {
      // Token solo que no cabe: conservar entero (sin partir «Descuenta»).
      if (!cur && ctx.measureText(tok).width > maxW) {
        lines.push(tok)
        continue
      }
      cur = trial
      continue
    }
    push()
    if (lines.length >= maxLines) break
    const next = tok.trimStart()
    if (!next) continue
    if (ctx.measureText(next).width > maxW) {
      lines.push(next)
      cur = ''
    } else {
      cur = next
    }
  }
  if (lines.length < maxLines) push()
  return lines.length ? lines : [raw]
}

/** ¿Alguna línea devolvió una palabra partida? (solo espacios = OK). */
export function memoriaTextHasWordBreak(original, lines) {
  const joined = (lines || []).join('').replace(/\s+/g, '')
  const src = String(original ?? '').replace(/\s+/g, '')
  if (!src) return false
  // Si al juntar sin espacios no reconstruye el original, hubo corte interior.
  return joined !== src
}

/**
 * Tabla de resumen (sin encabezado de memoria — solo columnas + filas + total).
 * Soporta desglose N / N.1 / N.2 y columna "Descuenta de".
 * Columnas Dimensiones + Fórmula (fórmulas naturales por figura).
 * Filas netas: Dimensiones/Fórmula = "—"; Operación = "1 − 1.1 − …".
 * Textos completos: anchos generosos + hasta 2 líneas por celda (sin ellipsis).
 */
export function renderMemoriaColorTableCanvas(snapshot, {
  width = 880,
  fontScale = 1,
} = {}) {
  if (typeof document === 'undefined') return null
  const C = MEMORIA_COLORS
  // Tipografía × DOC_TYPE_SCALE; tope alto para tablas densas en documentos.
  let fs = Math.max(0.9, Math.min(4.4, Number(fontScale) || 1))
  // C-OUT-08: celdas ≥ ancho/55 → subir fs si hace falta (celda base ≈ 11*fs).
  {
    const hier = esquemaDocFontHierarchy(width, { cellPx: Math.round(11 * fs) })
    if (hier.cellPx > 11 * fs) {
      fs = Math.min(6.5, hier.cellPx / 11)
    }
  }
  const margin = Math.round(8 * fs)
  const baseCols = [
    { key: 'num', label: '#', w: 36 },
    // Anchos base generosos: encabezados «Descuenta de» / «Operación» / «Color» en 1 línea.
    { key: 'color', label: 'Color', w: 64 },
    { key: 'nombre', label: 'Nombre', w: 118 },
    { key: 'op', label: 'Operación', w: 110 },
    { key: 'from', label: 'Descuenta de', w: 130 },
    { key: 'dims', label: 'Dimensiones', w: 160 },
    { key: 'formula', label: 'Fórmula', w: 160 },
    { key: 'vol', label: 'Volumen (m³)', w: 110 },
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
  // Encabezados y palabras clave en UNA sola línea (nunca «Descuent/a» ni «Descuenta» cortado).
  {
    const probe = typeof document !== 'undefined' ? document.createElement('canvas') : null
    const pctx = probe ? probe.getContext('2d') : null
    if (pctx) {
      pctx.font = `bold ${Math.round(11 * fs)}px "Segoe UI", system-ui, sans-serif`
      const mustFitHeader = [
        { key: 'color', text: 'Color' },
        { key: 'op', text: 'Operación' },
        { key: 'from', text: 'Descuenta de' },
        { key: 'vol', text: 'Volumen (m³)' },
      ]
      pctx.font = `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
      const mustFitBody = [
        { key: 'op', text: 'Descuenta' },
        { key: 'op', text: 'Exterior' },
      ]
      const donorKeys = ['formula', 'dims', 'nombre']
      const grow = (key, text, fontSpec) => {
        pctx.font = fontSpec
        const need = Math.ceil(pctx.measureText(text).width) + 14
        const col = cols.find((c) => c.key === key)
        if (!col || col.w >= need) return
        let delta = need - col.w
        for (const dk of donorKeys) {
          if (delta <= 0) break
          const donor = cols.find((c) => c.key === dk)
          if (!donor || donor === col) continue
          const give = Math.min(delta, Math.max(0, donor.w - 72))
          if (give <= 0) continue
          donor.w -= give
          col.w += give
          delta -= give
        }
        if (delta > 0) col.w += delta // prioridad: no partir palabras
      }
      const hdrFont = `bold ${Math.round(11 * fs)}px "Segoe UI", system-ui, sans-serif`
      const bodyFont = `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
      for (const m of mustFitHeader) grow(m.key, m.text, hdrFont)
      for (const m of mustFitBody) grow(m.key, m.text, bodyFont)
    }
  }
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const canvasW = tableW + margin * 2
  const baseRowH = Math.round(36 * fs)
  const lineGap = Math.round(14 * fs)
  const colHeaderH = Math.round(44 * fs)
  const totalH = Math.round(40 * fs)
  const rows = memoriaDisplayRows(snapshot)

  // Medir filas (2 líneas máx) antes de fijar altura del canvas.
  const measureCanvas = typeof document !== 'undefined'
    ? document.createElement('canvas')
    : null
  const mctx = measureCanvas ? measureCanvas.getContext('2d') : null
  const rowPlans = rows.map((row) => {
    const d = row.detail || {}
    const isSub = row.op === 'subtract'
    const isNet = !!(row.isNetRow || String(row.nombre || '').includes('(neto)'))
    let opLabel = isSub ? 'Descuenta' : 'Suma'
    if (row.subIndex === 0 && String(row.nombre || '').includes('(exterior)')) opLabel = 'Exterior'
    if (isNet) opLabel = row.netOpLabel || d.formaCalculo?.split('=')[0]?.trim() || 'Neto'
    const cells = {
      nombre: row.nombre || 'Elemento',
      op: opLabel,
      from: row.discountFromNombre || '—',
      dims: isNet ? '—' : (d.dimensiones || d.formula || '—'),
      formula: isNet
        ? '—'
        : (d.formula || (d.formaCalculo ? String(d.formaCalculo).split('=')[0].trim() : '—')),
      vol: fmtMemoria(row.volumeM3 || 0),
    }
    const keys = ['nombre', 'op', 'from', 'dims', 'formula', 'vol']
    let maxLines = 1
    const wrapped = {}
    if (mctx) {
      keys.forEach((key, ki) => {
        const col = cols[ki + 2]
        const bold = key === 'vol' || key === 'op' || isNet
        mctx.font = bold
          ? `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
          : `${Math.round(11 * fs)}px "Segoe UI", system-ui, sans-serif`
        const lines = wrapMemoriaText(mctx, cells[key], Math.max(8, col.w - 10), 2)
        wrapped[key] = lines
        maxLines = Math.max(maxLines, lines.length)
      })
    } else {
      keys.forEach((key) => { wrapped[key] = [String(cells[key])] })
    }
    const h = Math.max(baseRowH, Math.round((maxLines * lineGap) + 12 * fs))
    return { row, d, isSub, isNet, cells, wrapped, h }
  })
  const bodyH = Math.max(baseRowH, rowPlans.reduce((s, p) => s + p.h, 0))
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
  // Encabezados en una sola línea (sin partir «Color» ni celdas cortas).
  let x = x0
  for (const col of cols) {
    const lines = wrapMemoriaText(ctx, col.label, Math.max(8, col.w - 8), 1)
    const blockH = lines.length * lineGap
    const yStart = y0 + (colHeaderH - blockH) / 2 + Math.round(11 * fs)
    lines.forEach((ln, li) => {
      ctx.fillText(ln, x + 4, yStart + li * lineGap)
    })
    x += col.w
  }
  y0 += colHeaderH

  rowPlans.forEach((plan, idx) => {
    const { row, d, isSub, isNet, wrapped, h: rowH } = plan
    ctx.fillStyle = idx % 2 === 0 ? C.bg : C.rowAlt
    ctx.fillRect(x0, y0, tableW, rowH)
    ctx.strokeStyle = C.border
    ctx.strokeRect(x0, y0, tableW, rowH)

    ctx.fillStyle = row.color || d.color || C.text
    ctx.font = `bold ${Math.round(13 * fs)}px "Segoe UI", system-ui, sans-serif`
    const numTxt = String(row.numLabel || row.num || '')
    ctx.fillText(numTxt, x0 + (cols[0].w - ctx.measureText(numTxt).width) / 2, y0 + rowH / 2 + 4)

    const color = row.color || d.color || '#0f766e'
    const sw = Math.round(20 * fs)
    const sh = Math.round(15 * fs)
    const cx0 = x0 + cols[0].w
    ctx.fillStyle = color
    ctx.fillRect(cx0 + (cols[1].w - sw) / 2, y0 + (rowH - sh) / 2, sw, sh)
    ctx.strokeStyle = C.border
    ctx.strokeRect(cx0 + (cols[1].w - sw) / 2 + 0.5, y0 + (rowH - sh) / 2 + 0.5, sw - 1, sh - 1)

    let cx = cx0 + cols[1].w
    const keys = ['nombre', 'op', 'from', 'dims', 'formula', 'vol']
    keys.forEach((key, ki) => {
      const col = cols[ki + 2]
      const isVol = key === 'vol'
      const isOp = key === 'op'
      ctx.fillStyle = (isOp && (isSub || isNet)) ? C.subtract : C.text
      ctx.font = (isVol || isOp || isNet)
        ? `bold ${Math.round(12 * fs)}px "Segoe UI", system-ui, sans-serif`
        : `${Math.round(11 * fs)}px "Segoe UI", system-ui, sans-serif`
      const lines = wrapped[key] || [String(plan.cells[key])]
      const blockH = lines.length * lineGap
      const yStart = y0 + (rowH - blockH) / 2 + Math.round(11 * fs)
      lines.forEach((ln, li) => {
        const tx = isVol
          ? cx + col.w - 8 - ctx.measureText(ln).width
          : cx + 4
        ctx.fillText(ln, tx, yStart + li * lineGap)
      })
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
  brandTitle = ESQUEMA_SALIDA_BRAND,
  width = null,
} = {}) {
  if (typeof document === 'undefined' || !snapshot) return null
  const C = MEMORIA_COLORS
  const rows = memoriaDisplayRows(snapshot)
  const nRows = Math.max(1, rows.length)
  const labels = labelsFromSnapshot(snapshot)

  // Iso a ancho completo; tabla a todo el ancho útil (letra ×2 en documentos).
  const baseW = width != null
    ? width
    : Math.round(1280 + Math.min(240, Math.max(0, nRows - 4) * 24))
  const textScale = (baseW / 1280) * ESQUEMA_DOC_TYPE_SCALE
  const margin = Math.round(28 * textScale)
  const headerPlan = planEsquemaSalidaHeader({
    imageWidth: baseW,
    tipoTitulo: 'Memoria de cálculo de volúmenes',
    nombre: snapshot.nombre || 'Cálculo',
    brandTitle,
    textScale,
    fechaIso: snapshot.frozenAt || null,
  })
  const headerH = headerPlan.height
  const footerH = Math.round(26 * textScale)
  const gap = Math.round(14 * textScale)

  const contentW = baseW - margin * 2
  // Tabla a todo el ancho útil: tipografía grande sin cortar ni forzar muchas líneas.
  const tableTargetW = Math.round(contentW * 1.0)
  const tableFontScale = textScale * (nRows <= 5 ? 1.12 : (nRows <= 9 ? 1.05 : 0.98))
  const table = renderMemoriaColorTableCanvas(snapshot, {
    width: tableTargetW,
    fontScale: tableFontScale,
  })
  const tableW = table ? table.width : tableTargetW
  const tableH = table ? table.height : Math.round(140 * textScale)
  const imgW = Math.max(baseW, contentW + margin * 2)
  const isoW = imgW - margin * 2

  // Iso ≤ ~½ de la altura final: isoH ≤ header + table + footer + gaps
  const maxIsoH = headerH + tableH + footerH + gap * 2
  const iso = renderCalcIsoCanvas(solids, {
    width: isoW,
    height: maxIsoH,
    viewCaption: 'Isométrica NE',
    labels,
    padRatio: 0.04,
    // Caption/rótulos del iso siguen el factor DOC; el dibujo conserva proporción.
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

  const headerMeta = await drawEsquemaSalidaHeader(ctx, {
    imageWidth: imgW,
    tipoTitulo: 'Memoria de cálculo de volúmenes',
    nombre: snapshot.nombre || 'Cálculo',
    brandTitle,
    textScale,
    fechaIso: snapshot.frozenAt || new Date().toISOString(),
  })

  let y = headerH + gap
  if (iso) {
    const ix = margin + Math.max(0, (isoW - iso.width) / 2)
    ctx.drawImage(iso, ix, y)
    y += isoH + gap
  }

  if (table) {
    // Tabla a ancho completo (o centrada si midiera menos).
    const tx = margin + Math.max(0, (isoW - table.width) / 2)
    ctx.drawImage(table, tx, y)
    y += tableH
  }

  ctx.fillStyle = C.muted
  ctx.font = `${Math.round(11 * textScale)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(`${brandTitle} · Esquema 3D · PNG de alta resolución`, margin, height - Math.round(10 * textScale))

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
      tableW,
      textScale,
      docTypeScale: ESQUEMA_DOC_TYPE_SCALE,
      tableWidthRatio: tableW / Math.max(1, isoW),
      isoRatio: isoH / height,
      header: headerMeta,
      hasHeader: true,
      hasMemoriaTable: !!table,
      columns: [
        '#', 'Color', 'Nombre', 'Operación', 'Descuenta de', 'Dimensiones', 'Fórmula', 'Volumen (m³)',
      ],
      rowCount: nRows,
      totalM3: snapshot.totalM3,
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
