/**
 * Dibujar parrilla — sin contorno ni recubrimiento.
 * Coordenadas en metros de mundo (world px = m × PX_PER_METER).
 */
import {
  DESPIECE_BARRA_A_DIAMETRO,
  computePositionMetrics,
  despieceResolverDiametro,
  formatEspaciamiento,
  fmt2,
  normalizeDespiecePosition,
  parseNum,
  round2,
  segmentLengthM,
} from './esquemaDespiece.js'
import { worldToMeters, metersToWorld } from './esquemaGeometry.js'

export const PARRILLA_POS_COLORS = [
  '#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed',
  '#047857', '#c2410c', '#0369a1', '#9f1239', '#5b21b6',
]

/** Mensajes institucionales de una sola línea. */
export const PARRILLA_MSG = Object.freeze({
  touchStart: 'Toque el punto de inicio',
  askContinue: '¿Continuar desde la última varilla?',
  done: 'Parrilla dibujada',
  phoneOnly: 'Disponible en iPad y portátil',
  noPositions: 'El cuadro no tiene posiciones',
})

export function parseSpacingM(spacingM) {
  if (spacingM == null || String(spacingM).trim() === '') return null
  const n = parseNum(spacingM)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function diameterShortLabel(raw) {
  const frac = despieceResolverDiametro(raw)
  if (!frac) return String(raw || '—')
  for (const [bar, f] of Object.entries(DESPIECE_BARRA_A_DIAMETRO)) {
    if (f === frac) return bar
  }
  return `Ø ${frac}`
}

export function worldToMetersPoint(pt) {
  return { x: worldToMeters(pt.x), y: worldToMeters(pt.y) }
}

export function metersToWorldPoint(pt) {
  return { x: metersToWorld(pt.x), y: metersToWorld(pt.y) }
}

/** Segmento principal (el más largo) del shape. */
export function mainSegmentOf(pos) {
  const p = normalizeDespiecePosition(pos) || pos
  if (!p || p.shapeId === 'espiral' || p.spiral) return null
  let best = null
  let bestL = -1
  for (const seg of p.segments || []) {
    const L = segmentLengthM(seg)
    if (!Number.isFinite(L) || L <= 0) continue
    if (L > bestL) {
      bestL = L
      best = seg
    }
  }
  return best
}

export function mainStraightLengthM(pos) {
  const seg = mainSegmentOf(pos)
  return seg ? segmentLengthM(seg) : NaN
}

/**
 * Longitudes por pieza: si el tramo principal es variable, de mín a máx uniforme.
 */
export function barLengthsUniformM(pos, pieces) {
  const n = Math.max(0, Math.floor(Number(pieces) || 0))
  if (n < 1) return []
  const seg = mainSegmentOf(pos)
  if (!seg) return []
  const variable = seg.mode === 'variable' || seg.mode === 'var'
  if (variable) {
    let a = parseNum(seg.minM)
    let b = parseNum(seg.maxM)
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      a = parseNum(seg.minCm) / 100
      b = parseNum(seg.maxCm) / 100
    }
    if (!Number.isFinite(a) || !Number.isFinite(b)) return []
    if (n === 1) return [round2((a + b) / 2)]
    const out = []
    for (let i = 0; i < n; i += 1) {
      out.push(round2(a + ((b - a) * i) / (n - 1)))
    }
    return out
  }
  const L = segmentLengthM(seg)
  if (!Number.isFinite(L) || L <= 0) return []
  return Array.from({ length: n }, () => round2(L))
}

/**
 * @returns {{
 *   kind: 'spaced'|'single'|'skip'|'invalid',
 *   pieces: number,
 *   spacing: number|null,
 *   ubicacion: string,
 *   reason?: string,
 * }}
 */
export function classifyParrillaPosition(pos) {
  const p = normalizeDespiecePosition(pos) || pos
  const ubic = String(p?.ubicacion || '').trim()
  const metrics = computePositionMetrics(p)
  const pieces = metrics.ok ? metrics.pieces : Math.floor(parseNum(p?.pieces) || 0)
  const spacing = parseSpacingM(p?.spacingM)
  if (!pieces || pieces < 1) {
    return { kind: 'invalid', pieces: 0, spacing: null, ubicacion: ubic, reason: 'Sin piezas' }
  }
  if (!ubic) {
    return { kind: 'invalid', pieces, spacing, ubicacion: ubic, reason: 'Sin ubicación' }
  }
  if (spacing == null) {
    if (pieces === 1) return { kind: 'single', pieces: 1, spacing: null, ubicacion: ubic }
    return { kind: 'skip', pieces, spacing: null, ubicacion: ubic, reason: 'Sin espaciamiento' }
  }
  const lengths = barLengthsUniformM(p, pieces)
  if (!lengths.length) {
    return { kind: 'invalid', pieces, spacing, ubicacion: ubic, reason: 'Sin longitud' }
  }
  return { kind: 'spaced', pieces, spacing, ubicacion: ubic }
}

function hookStubs(x1, y1, x2, y2, hookLenM = 0.06) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const px = (-dy / len) * hookLenM
  const py = (dx / len) * hookLenM
  return [
    { x1, y1, x2: x1 + px, y2: y1 + py },
    { x1: x2, y1: y2, x2: x2 + px, y2: y2 + py },
  ]
}

function labelFor(pos, pieces, lengths, diamShort) {
  const variable = lengths.length > 1 && lengths[0] !== lengths[lengths.length - 1]
  const Ltxt = variable
    ? `L=${fmt2(lengths[0])}–${fmt2(lengths[lengths.length - 1])}`
    : `L=${fmt2(lengths[0] || 0)}`
  const esp = formatEspaciamiento(pos.spacingM)
  return `${pos.name || 'Pos'} · ${pieces} ${diamShort}${esp !== '—' ? ` ${esp}` : ''} ${Ltxt}`
}

/**
 * Punto de inicio al continuar desde la última varilla (+ espaciamiento).
 * @param {{ ubicacion, lastStart:{x,y}, lastEnd:{x,y}, spacingM?:number, anguloDeg?:number }} last
 * @param {number} spacingM — espaciamiento a aplicar (de la nueva posición o el de la última)
 */
export function continueStartFromLast(last, spacingM) {
  if (!last?.lastStart) return null
  const sp = Number(spacingM)
  if (!Number.isFinite(sp) || sp <= 0) return null
  const ubic = last.ubicacion
  const s = last.lastStart
  if (ubic === 'Longitudinal') {
    return { x: round2(s.x), y: round2(s.y + sp) }
  }
  if (ubic === 'Transversal') {
    return { x: round2(s.x + sp), y: round2(s.y) }
  }
  if (ubic === 'Diagonal') {
    const angDeg = parseNum(last.anguloDeg)
    const ang = Number.isFinite(angDeg) ? (angDeg * Math.PI) / 180 : Math.PI / 4
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    return { x: round2(s.x + sp * nx), y: round2(s.y + sp * ny) }
  }
  return null
}

/**
 * Dibuja una posición desde un punto de inicio (metros de mundo).
 */
export function buildBarsFromStart(pos, startM, { colorIndex = 0 } = {}) {
  const p = normalizeDespiecePosition(pos) || pos
  const cls = classifyParrillaPosition(p)
  if (cls.kind === 'skip' || cls.kind === 'invalid') {
    return {
      drawable: false,
      reason: cls.reason || 'Sin espaciamiento',
      positionId: p?.id,
      name: p?.name || '',
      ubicacion: cls.ubicacion,
    }
  }
  const pieces = cls.pieces
  const spacing = cls.spacing
  const ubic = cls.ubicacion
  const lengths = barLengthsUniformM(p, pieces)
  if (!lengths.length) {
    return { drawable: false, reason: 'Sin longitud', positionId: p?.id, name: p?.name || '', ubicacion: ubic }
  }
  if (!startM || !Number.isFinite(startM.x) || !Number.isFinite(startM.y)) {
    return { drawable: false, reason: 'Sin inicio', positionId: p?.id, name: p?.name || '', ubicacion: ubic }
  }

  const color = PARRILLA_POS_COLORS[colorIndex % PARRILLA_POS_COLORS.length]
  const diamShort = diameterShortLabel(p.diameter)
  const segments = []
  const hooks = []
  const x0 = round2(startM.x)
  const y0 = round2(startM.y)
  const sp = spacing || 0

  if (ubic === 'Longitudinal') {
    for (let i = 0; i < pieces; i += 1) {
      const y = round2(y0 + i * sp)
      const L = lengths[i]
      const x1 = x0
      const x2 = round2(x0 + L)
      segments.push({ x1, y1: y, x2, y2: y })
      hooks.push(...hookStubs(x1, y, x2, y))
    }
  } else if (ubic === 'Transversal') {
    for (let i = 0; i < pieces; i += 1) {
      const x = round2(x0 + i * sp)
      const L = lengths[i]
      const y1 = y0
      const y2 = round2(y0 + L)
      segments.push({ x1: x, y1, x2: x, y2 })
      hooks.push(...hookStubs(x, y1, x, y2))
    }
  } else if (ubic === 'Diagonal') {
    const angDeg = parseNum(p.anguloDeg)
    const ang = Number.isFinite(angDeg) ? (angDeg * Math.PI) / 180 : Math.PI / 4
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    for (let i = 0; i < pieces; i += 1) {
      const x1 = round2(x0 + i * sp * nx)
      const y1 = round2(y0 + i * sp * ny)
      const L = lengths[i]
      const x2 = round2(x1 + L * ux)
      const y2 = round2(y1 + L * uy)
      segments.push({ x1, y1, x2, y2 })
      hooks.push(...hookStubs(x1, y1, x2, y2))
    }
  } else {
    return { drawable: false, reason: 'Sin ubicación', positionId: p?.id, name: p?.name || '', ubicacion: ubic }
  }

  const mid = segments[Math.floor(segments.length / 2)] || segments[0]
  const last = segments[segments.length - 1]
  const text = labelFor(p, pieces, lengths, diamShort)
  let labelX
  let labelY
  let guideX
  let guideY
  if (ubic === 'Longitudinal') {
    guideX = mid.x2
    guideY = mid.y1
    labelX = round2(mid.x2 + 0.18)
    labelY = mid.y1
  } else if (ubic === 'Transversal') {
    guideX = mid.x1
    guideY = mid.y2
    labelX = mid.x1
    labelY = round2(mid.y2 + 0.18)
  } else {
    guideX = mid.x2
    guideY = mid.y2
    labelX = round2(mid.x2 + 0.2)
    labelY = round2(mid.y2 + 0.2)
  }

  return {
    drawable: true,
    positionId: p.id,
    name: p.name || '',
    color,
    ubicacion: ubic,
    anguloDeg: p.anguloDeg,
    pieces,
    spacingM: spacing,
    diameterLabel: diamShort,
    lengths,
    labelText: text,
    segments,
    hooks,
    label: { text, x: labelX, y: labelY, guideX, guideY },
    lastStart: { x: last.x1, y: last.y1 },
    lastEnd: { x: last.x2, y: last.y2 },
    firstStart: { x: segments[0].x1, y: segments[0].y1 },
  }
}

export function viewKeyForPosition(pos) {
  const p = String(pos?.parrilla || '').trim()
  if (p === 'Doble') {
    const cara = String(pos?.parrillaCara || '').trim()
    if (/inferior/i.test(cara)) return 'doble-inf'
    return 'doble-sup'
  }
  return 'sencilla'
}

export function viewTitleForKey(key) {
  if (key === 'doble-sup') return 'Parrilla Superior / Externa'
  if (key === 'doble-inf') return 'Parrilla Inferior / Interna'
  return 'Parrilla'
}

/** AABB en metros a partir de barras dibujadas. */
export function boundsFromBars(bars) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const bar of bars || []) {
    for (const seg of bar.segments || []) {
      minX = Math.min(minX, seg.x1, seg.x2)
      minY = Math.min(minY, seg.y1, seg.y2)
      maxX = Math.max(maxX, seg.x1, seg.x2)
      maxY = Math.max(maxY, seg.y1, seg.y2)
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, widthM: 1, heightM: 1 }
  }
  // Padding para rótulos
  minX -= 0.05
  minY -= 0.05
  maxX += 0.4
  maxY += 0.3
  return {
    minX,
    minY,
    maxX,
    maxY,
    widthM: round2(maxX - minX),
    heightM: round2(maxY - minY),
  }
}

/** Convierte barras (coords absolutas m) a coords locales del bounds. */
export function barsToLocal(bars, bounds) {
  const ox = bounds.minX
  const oy = bounds.minY
  const shift = (s) => ({
    x1: round2(s.x1 - ox),
    y1: round2(s.y1 - oy),
    x2: round2(s.x2 - ox),
    y2: round2(s.y2 - oy),
  })
  return (bars || []).map((bar) => ({
    ...bar,
    segments: (bar.segments || []).map(shift),
    hooks: (bar.hooks || []).map(shift),
    label: bar.label
      ? {
          ...bar.label,
          x: round2(bar.label.x - ox),
          y: round2(bar.label.y - oy),
          guideX: round2(bar.label.guideX - ox),
          guideY: round2(bar.label.guideY - oy),
        }
      : null,
  }))
}

/**
 * Agrupa barras dibujadas en vistas (sencilla / doble).
 */
export function buildParrillaViewsFromBars(schedule, bars, skipped = []) {
  const positions = (schedule?.positions || []).map((p) => normalizeDespiecePosition(p) || p)
  const hasDoble = positions.some((p) => String(p?.parrilla || '').trim() === 'Doble')
  const posById = Object.fromEntries(positions.map((p) => [p.id, p]))

  const buckets = new Map()
  const ensure = (key) => {
    if (!buckets.has(key)) {
      buckets.set(key, { id: key, title: viewTitleForKey(key), bars: [], skipped: [] })
    }
    return buckets.get(key)
  }
  if (hasDoble) {
    ensure('doble-sup')
    ensure('doble-inf')
  } else {
    ensure('sencilla')
  }

  for (const bar of bars || []) {
    const pos = posById[bar.positionId]
    const key = hasDoble ? viewKeyForPosition(pos || {}) : 'sencilla'
    ensure(key).bars.push(bar)
  }
  for (const sk of skipped || []) {
    const pos = posById[sk.positionId]
    const key = hasDoble ? viewKeyForPosition(pos || {}) : 'sencilla'
    ensure(key).skipped.push(sk)
  }

  const order = hasDoble ? ['doble-sup', 'doble-inf', 'sencilla'] : ['sencilla']
  const views = []
  for (const k of order) {
    const v = buckets.get(k)
    if (!v) continue
    if (!v.bars.length && !v.skipped.length) continue
    views.push(v)
  }

  const allBars = views.flatMap((v) => v.bars)
  const boundsAbs = boundsFromBars(allBars)
  const localViews = views.map((v) => ({
    ...v,
    bars: barsToLocal(v.bars, boundsAbs),
  }))

  return {
    coverM: 0,
    boundsM: boundsAbs,
    views: localViews,
  }
}

/** @deprecated compat — usa buildBarsFromStart */
export function buildBarsForPosition(pos, bounds, coverM, opts = {}) {
  const start = opts.anchorLocalM
    || (bounds ? { x: Number(coverM) || 0, y: Number(coverM) || 0 } : null)
  return buildBarsFromStart(pos, start, opts)
}

/** @deprecated compat */
export function buildParrillaViews(schedule, boundsM, coverM, anchorsLocalM = {}) {
  const positions = (schedule?.positions || []).map((p) => normalizeDespiecePosition(p) || p)
  const bars = []
  const skipped = []
  let colorIdx = 0
  for (const pos of positions) {
    const cls = classifyParrillaPosition(pos)
    if (cls.kind === 'skip' || cls.kind === 'invalid') {
      skipped.push({ positionId: pos.id, name: pos.name || '', reason: cls.reason || 'Sin espaciamiento' })
      colorIdx += 1
      continue
    }
    const anchor = anchorsLocalM?.[pos.id]
      || { x: (boundsM?.minX || 0) + (Number(coverM) || 0), y: (boundsM?.minY || 0) + (Number(coverM) || 0) }
    // Convert local anchor (relative to bounds) to absolute if bounds given
    const startAbs = boundsM
      ? { x: boundsM.minX + (anchor.x ?? 0), y: boundsM.minY + (anchor.y ?? 0) }
      : anchor
    const bar = buildBarsFromStart(pos, startAbs, { colorIndex: colorIdx })
    colorIdx += 1
    if (!bar.drawable) {
      skipped.push({ positionId: pos.id, name: pos.name || '', reason: bar.reason || 'Sin espaciamiento' })
    } else {
      bars.push(bar)
    }
  }
  return buildParrillaViewsFromBars(schedule, bars, skipped)
}

export function distributeOffsetsM(coverM, spacingM, pieces) {
  const cover = Number(coverM)
  const sp = Number(spacingM)
  const n = Math.max(0, Math.floor(Number(pieces) || 0))
  if (!Number.isFinite(cover) || cover < 0 || !Number.isFinite(sp) || sp <= 0 || n < 1) return []
  const out = []
  for (let i = 0; i < n; i += 1) out.push(round2(cover + i * sp))
  return out
}

export function serializeParrillaDraw(drawData) {
  if (!drawData) return null
  return JSON.parse(JSON.stringify(drawData))
}

export function paintParrillaViews(ctx, drawData, layout) {
  if (!ctx || !drawData?.views?.length) return { height: 0 }
  const { x: ox, y: oy, width } = layout
  const pad = 18
  let cy = oy
  const gap = 22

  for (const view of drawData.views) {
    const bw = Math.max(0.01, drawData.boundsM.widthM)
    const bh = Math.max(0.01, drawData.boundsM.heightM)
    const s = layout.scale || Math.min((width - pad * 2 - 120) / bw, 200 / bh)
    const plotW = bw * s
    const plotH = bh * s
    const labelBand = 70
    const titleH = 30
    const blockH = titleH + plotH + labelBand + 20

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(ox, cy, width, blockH)
    ctx.fillStyle = '#0f766e'
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(view.title, ox + pad, cy + 22)

    const px = ox + pad
    const py = cy + titleH + 6
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.strokeRect(px, py, plotW, plotH)

    const toX = (m) => px + m * s
    const toY = (m) => py + m * s
    const labelSlots = []

    for (const bar of view.bars) {
      ctx.strokeStyle = bar.color
      ctx.fillStyle = bar.color
      ctx.lineWidth = Math.max(2, s * 0.025)
      ctx.lineCap = 'round'
      for (const seg of bar.segments) {
        ctx.beginPath()
        ctx.moveTo(toX(seg.x1), toY(seg.y1))
        ctx.lineTo(toX(seg.x2), toY(seg.y2))
        ctx.stroke()
      }
      ctx.lineWidth = Math.max(1.2, s * 0.018)
      for (const hk of bar.hooks || []) {
        ctx.beginPath()
        ctx.moveTo(toX(hk.x1), toY(hk.y1))
        ctx.lineTo(toX(hk.x2), toY(hk.y2))
        ctx.stroke()
      }
      const lb = bar.label
      if (lb?.text) {
        let lx = toX(lb.x)
        let ly = toY(lb.y)
        for (const prev of labelSlots) {
          if (Math.abs(ly - prev.y) < 16 && Math.abs(lx - prev.x) < 200) ly = prev.y + 18
        }
        labelSlots.push({ x: lx, y: ly })
        ctx.strokeStyle = bar.color
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(toX(lb.guideX), toY(lb.guideY))
        ctx.lineTo(lx, ly)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif'
        ctx.fillStyle = bar.color
        ctx.fillText(lb.text, lx + 4, ly + 4)
      }
    }

    if (view.skipped?.length) {
      ctx.fillStyle = '#64748b'
      ctx.font = '13px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(
        view.skipped.map((sk) => `${sk.name || 'Pos'}: ${sk.reason}`).join(' · '),
        px,
        py + plotH + 40,
      )
    }

    cy += blockH + gap
  }

  return { height: Math.max(0, cy - oy - gap) }
}

export function estimateParrillaPngHeight(drawData, width = 2200) {
  if (!drawData?.views?.length) return 0
  const pad = 18
  const bw = Math.max(0.01, drawData.boundsM?.widthM || 1)
  const bh = Math.max(0.01, drawData.boundsM?.heightM || 1)
  const scale = Math.min((width - pad * 2 - 120) / bw, 200 / bh)
  const plotH = bh * scale
  const blockH = 30 + plotH + 70 + 20
  return drawData.views.length * (blockH + 22) + 28
}

export function localMToWorld(ptM, bounds) {
  return {
    x: metersToWorld(bounds.minX + ptM.x),
    y: metersToWorld(bounds.minY + ptM.y),
  }
}

export function worldPointToLocalM(ptWorld, bounds) {
  return {
    x: worldToMeters(ptWorld.x) - bounds.minX,
    y: worldToMeters(ptWorld.y) - bounds.minY,
  }
}

export function contourBoundsMetersFromRing(ringWorld) {
  if (!ringWorld?.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ringWorld) {
    const x = worldToMeters(p.x)
    const y = worldToMeters(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return null
  return {
    minX, minY, maxX, maxY,
    widthM: round2(maxX - minX),
    heightM: round2(maxY - minY),
  }
}

export function drawDespieceParrillaObject(ctx, obj, selected = false) {
  if (!ctx || !obj?.drawData?.views?.length || !obj.boundsM) return
  const bounds = obj.boundsM
  const toW = (pt) => localMToWorld(pt, bounds)
  const labelSlots = []
  const c0 = toW({ x: 0, y: 0 })
  const c1 = toW({ x: bounds.widthM, y: bounds.heightM })

  ctx.save()
  if (selected) {
    ctx.strokeStyle = '#ea580c'
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(c0.x, c0.y, c1.x - c0.x, c1.y - c0.y)
    ctx.setLineDash([])
  }

  let titleY = c0.y - 8
  for (const view of obj.drawData.views) {
    ctx.fillStyle = '#0f766e'
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(view.title, c0.x, titleY)
    titleY -= 14

    for (const bar of view.bars) {
      ctx.strokeStyle = bar.color
      ctx.fillStyle = bar.color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      for (const seg of bar.segments) {
        const a = toW({ x: seg.x1, y: seg.y1 })
        const b = toW({ x: seg.x2, y: seg.y2 })
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.lineWidth = 1.4
      for (const hk of bar.hooks || []) {
        const a = toW({ x: hk.x1, y: hk.y1 })
        const b = toW({ x: hk.x2, y: hk.y2 })
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      const lb = bar.label
      if (lb?.text) {
        let lp = toW({ x: lb.x, y: lb.y })
        for (const prev of labelSlots) {
          if (Math.hypot(lp.x - prev.x, lp.y - prev.y) < 14) lp = { x: lp.x, y: prev.y + 14 }
        }
        labelSlots.push(lp)
        const gp = toW({ x: lb.guideX, y: lb.guideY })
        ctx.strokeStyle = bar.color
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(gp.x, gp.y)
        ctx.lineTo(lp.x, lp.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif'
        ctx.fillStyle = bar.color
        ctx.fillText(lb.text, lp.x + 3, lp.y + 3)
      }
    }
    if (view.skipped?.length) {
      ctx.fillStyle = '#64748b'
      ctx.font = '10px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(
        view.skipped.map((s) => `${s.name}: ${s.reason}`).join(' · '),
        c0.x,
        c1.y + 14,
      )
    }
  }
  ctx.restore()
}

export function despieceParrillaBoundsWorld(obj) {
  if (!obj?.boundsM) return null
  const b = obj.boundsM
  const padM = 0.35
  const a = localMToWorld({ x: -padM, y: -padM }, b)
  const c = localMToWorld({ x: b.widthM + padM + 0.5, y: b.heightM + padM + 0.3 }, b)
  return {
    x: Math.min(a.x, c.x),
    y: Math.min(a.y, c.y),
    w: Math.abs(c.x - a.x),
    h: Math.abs(c.y - a.y),
  }
}

/** ¿Puede continuar desde última varilla de la misma ubicación? */
export function canContinueFromLast(lastByUbic, ubicacion) {
  return !!(lastByUbic && lastByUbic[ubicacion]?.lastStart)
}

/**
 * Cola de dibujo en orden del cuadro.
 * - spaced / single → se dibujan (single pide o hereda inicio)
 * - skip (multi sin espaciamiento) → van a skipped
 * - invalid → skipped
 */
export function prepareParrillaQueue(schedule) {
  const positions = (schedule?.positions || []).map((p) => normalizeDespiecePosition(p) || p)
  const queue = []
  const skipped = []
  positions.forEach((pos, colorIndex) => {
    const cls = classifyParrillaPosition(pos)
    if (cls.kind === 'skip' || cls.kind === 'invalid') {
      skipped.push({
        positionId: pos.id,
        name: pos.name || '',
        reason: cls.reason || 'Sin espaciamiento',
        colorIndex,
      })
      return
    }
    queue.push({
      positionId: pos.id,
      pos,
      cls,
      colorIndex,
    })
  })
  return { queue, skipped, positions }
}

/**
 * Inicio al responder «Sí»: usa el espaciamiento de la última varilla
 * de la misma ubicación. Si no hay, retorna null (pedir toque).
 */
export function resolveContinueStart(lastByUbic, ubicacion, fallbackSpacingM = null) {
  const last = lastByUbic?.[ubicacion]
  if (!last?.lastStart) return null
  const sp = Number(last.spacingM) > 0
    ? Number(last.spacingM)
    : (Number(fallbackSpacingM) > 0 ? Number(fallbackSpacingM) : null)
  if (sp == null) return null
  return continueStartFromLast(last, sp)
}

/**
 * Tras dibujar una barra, actualiza el mapa lastByUbic.
 * Si la posición no trae espaciamiento (pieza única), conserva el de la
 * última varilla de esa ubicación para poder continuar en cadena.
 */
export function recordLastByUbic(lastByUbic, bar) {
  if (!bar?.drawable || !bar.ubicacion || !bar.lastStart) return lastByUbic || {}
  const prev = lastByUbic?.[bar.ubicacion]
  const spacingM = Number(bar.spacingM) > 0
    ? bar.spacingM
    : (Number(prev?.spacingM) > 0 ? prev.spacingM : bar.spacingM)
  return {
    ...(lastByUbic || {}),
    [bar.ubicacion]: {
      ubicacion: bar.ubicacion,
      lastStart: { ...bar.lastStart },
      lastEnd: bar.lastEnd ? { ...bar.lastEnd } : null,
      spacingM,
      anguloDeg: bar.anguloDeg ?? prev?.anguloDeg,
    },
  }
}
