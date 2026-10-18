/**
 * Dibujo de formas de varilla con cotas sobre cada segmento (editor + PNG).
 */
import { segmentDisplayLabel } from './esquemaDespiece.js'

/** Parsea un path SVG simple (M/L/A) y estima un punto de ancla para la cota. */
export function estimatePathAnchor(pathStr) {
  if (!pathStr) return null
  const nums = String(pathStr).match(/-?\d+\.?\d*/g)
  if (!nums || nums.length < 2) return null
  const pts = []
  // Tomar pares x,y de comandos M/L; para A tomar el punto final (últimos 2 del arco)
  const tokens = String(pathStr).trim().split(/(?=[MLAZ])/i).filter(Boolean)
  for (const tok of tokens) {
    const t = tok.trim()
    const cmd = t[0]
    const vals = (t.slice(1).match(/-?\d+\.?\d*/g) || []).map(Number)
    if (cmd === 'M' || cmd === 'L' || cmd === 'm' || cmd === 'l') {
      for (let i = 0; i + 1 < vals.length; i += 2) pts.push({ x: vals[i], y: vals[i + 1] })
    } else if (cmd === 'A' || cmd === 'a') {
      // A rx ry xrot large sweep x y → ancla en el extremo
      if (vals.length >= 7) pts.push({ x: vals[5], y: vals[6] })
    }
  }
  if (!pts.length) {
    // fallback: promedio de todos los números como pares
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: Number(nums[i]), y: Number(nums[i + 1]) })
    }
  }
  if (!pts.length) return null
  // Preferir punto medio del primer subtrazo (antes de un segundo M)
  const firstRun = []
  const parts = String(pathStr).split(/\s+M\s+/i)
  const first = parts[0]
  const fnums = first.match(/-?\d+\.?\d*/g) || []
  for (let i = 0; i + 1 < fnums.length; i += 2) {
    firstRun.push({ x: Number(fnums[i]), y: Number(fnums[i + 1]) })
  }
  const use = firstRun.length >= 2 ? firstRun : pts
  const mid = use[Math.floor((use.length - 1) / 2)]
  const a = use[0]
  const b = use[use.length - 1]
  // Offset perpendicular leve para no tapar el trazo
  const dx = (b?.x || 0) - (a?.x || 0)
  const dy = (b?.y || 0) - (a?.y || 0)
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * 10
  const oy = (dx / len) * 10
  return { x: mid.x + ox, y: mid.y + oy }
}

export function segmentLabelAnchor(shapeSeg) {
  if (shapeSeg?.labelAt && Number.isFinite(shapeSeg.labelAt.x) && Number.isFinite(shapeSeg.labelAt.y)) {
    return { x: shapeSeg.labelAt.x, y: shapeSeg.labelAt.y }
  }
  return estimatePathAnchor(shapeSeg?.path)
}

export function cotaLinesForSegment(posSeg) {
  const d = segmentDisplayLabel(posSeg)
  if (!d || typeof d !== 'object') return []
  if (d.varLine) return [d.varLine, d.promLine].filter(Boolean)
  if (d.value != null) return [String(d.value)]
  return []
}

/**
 * Canvas: dibuja forma + cotas sobre cada segmento.
 * @returns {{ used: boolean }}
 */
export function drawShapeWithCotasOnSegments(ctx, shape, pos, x, y, w, h, {
  stroke = '#0f766e',
  textColor = '#0f172a',
  fontPx = 12,
  highlightId = null,
} = {}) {
  if (!shape || !ctx) return { used: false }
  const vb = String(shape.viewBox || '0 0 100 40').split(/\s+/).map(Number)
  const vbW = Math.max(1, vb[2] || 100)
  const vbH = Math.max(1, vb[3] || 40)
  // Dejar margen para cotas alrededor
  const pad = Math.max(14, fontPx * 1.2)
  const scale = Math.min((w - pad * 2) / vbW, (h - pad * 2) / vbH)
  const ox = x + (w - vbW * scale) / 2
  const oy = y + (h - vbH * scale) / 2

  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const shapeSegs = shape.segments || []
  for (const seg of shapeSegs) {
    try {
      ctx.strokeStyle = highlightId && highlightId === seg.id ? '#ea580c' : stroke
      ctx.lineWidth = (highlightId && highlightId === seg.id ? 3.4 : 2.4) / scale
      ctx.stroke(new Path2D(seg.path))
    } catch { /* ignore */ }
  }
  if (shape.kind === 'spiral' && shape.thumbPath) {
    try {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2.4 / scale
      ctx.stroke(new Path2D(shape.thumbPath))
    } catch { /* ignore */ }
  }

  // Cotas en coordenadas del viewBox
  ctx.fillStyle = textColor
  ctx.font = `bold ${Math.max(9, fontPx / scale)}px "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (shape.kind === 'spiral' && pos?.spiral) {
    const dM = Number(String(pos.spiral.diametroM ?? '').replace(',', '.'))
    const pM = Number(String(pos.spiral.pasoM ?? '').replace(',', '.'))
    const dCm = Number.isFinite(dM) ? Math.round(dM * 100) : '—'
    const pCm = Number.isFinite(pM) ? Math.round(pM * 100) : '—'
    const label = `Ø${dCm}  paso ${pCm}  ×${pos.spiral.vueltas || '—'}`
    ctx.fillText(label, vbW / 2, vbH * 0.82)
  } else {
    const byId = Object.fromEntries((pos?.segments || []).map((s) => [s.id, s]))
    for (const sDef of shapeSegs) {
      const anchor = segmentLabelAnchor(sDef)
      if (!anchor) continue
      const lines = cotaLinesForSegment(byId[sDef.id] || { id: sDef.id })
      if (!lines.length) continue
      const lineH = Math.max(9, fontPx / scale) * 1.15
      const startY = anchor.y - ((lines.length - 1) * lineH) / 2
      // Halo blanco para legibilidad sobre la figura
      ctx.lineWidth = 3 / scale
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      lines.forEach((line, i) => {
        const ly = startY + i * lineH
        ctx.strokeText(line, anchor.x, ly)
        ctx.fillText(line, anchor.x, ly)
      })
    }
  }
  ctx.restore()
  return { used: true }
}

/** Datos para SVG (React): anclas + textos de cota. */
export function shapeCotaOverlays(shape, pos) {
  if (!shape) return []
  if (shape.kind === 'spiral' && pos?.spiral) {
    const vb = String(shape.viewBox || '0 0 120 100').split(/\s+/).map(Number)
    const dM = Number(String(pos.spiral.diametroM ?? '').replace(',', '.'))
    const pM = Number(String(pos.spiral.pasoM ?? '').replace(',', '.'))
    const dCm = Number.isFinite(dM) ? Math.round(dM * 100) : '—'
    const pCm = Number.isFinite(pM) ? Math.round(pM * 100) : '—'
    return [{
      id: 'spiral',
      x: (vb[2] || 120) / 2,
      y: (vb[3] || 100) * 0.82,
      lines: [`Ø${dCm} paso ${pCm} ×${pos.spiral.vueltas || '—'}`],
    }]
  }
  const byId = Object.fromEntries((pos?.segments || []).map((s) => [s.id, s]))
  const out = []
  for (const sDef of shape.segments || []) {
    const anchor = segmentLabelAnchor(sDef)
    if (!anchor) continue
    const lines = cotaLinesForSegment(byId[sDef.id] || { id: sDef.id })
    if (!lines.length) continue
    out.push({ id: sDef.id, x: anchor.x, y: anchor.y, lines })
  }
  return out
}
