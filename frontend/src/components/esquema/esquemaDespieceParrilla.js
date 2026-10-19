/**
 * Fase 2 — dibujo en plano de la parrilla a partir del cuadro de despiece.
 * Geometría en metros locales del contorno (origen = esquina superior izquierda).
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

/** Paleta fija por índice de posición. */
export const PARRILLA_POS_COLORS = [
  '#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed',
  '#047857', '#c2410c', '#0369a1', '#9f1239', '#5b21b6',
]

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

/** Tramo recto principal = segmento más largo (m). */
export function mainStraightLengthM(pos) {
  const p = normalizeDespiecePosition(pos) || pos
  if (!p) return NaN
  if (p.shapeId === 'espiral' || p.spiral) return NaN
  let best = NaN
  for (const seg of p.segments || []) {
    const L = segmentLengthM(seg)
    if (!Number.isFinite(L) || L <= 0) continue
    if (!Number.isFinite(best) || L > best) best = L
  }
  return best
}

/**
 * Offsets desde el borde: cover + i·spacing, i = 0..piezas-1.
 * 1,50 / 0,05 / c/0,20 / 8 → 0,05 … 1,45.
 */
export function distributeOffsetsM(coverM, spacingM, pieces) {
  const cover = Number(coverM)
  const sp = Number(spacingM)
  const n = Math.max(0, Math.floor(Number(pieces) || 0))
  if (!Number.isFinite(cover) || cover < 0 || !Number.isFinite(sp) || sp <= 0 || n < 1) return []
  const out = []
  for (let i = 0; i < n; i += 1) out.push(round2(cover + i * sp))
  return out
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
    minX,
    minY,
    maxX,
    maxY,
    widthM: round2(maxX - minX),
    heightM: round2(maxY - minY),
  }
}

export function worldPointToLocalM(ptWorld, bounds) {
  return {
    x: worldToMeters(ptWorld.x) - bounds.minX,
    y: worldToMeters(ptWorld.y) - bounds.minY,
  }
}

export function localMToWorld(ptM, bounds) {
  return {
    x: metersToWorld(bounds.minX + ptM.x),
    y: metersToWorld(bounds.minY + ptM.y),
  }
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

function barLabelText(pos, pieces, barLen, diamShort) {
  return `${pos.name || 'Pos'} · ${pieces} ${diamShort} ${formatEspaciamiento(pos.spacingM)} L=${fmt2(barLen)}`
}

/**
 * Barras de una posición en metros locales del contorno.
 * @param {{x?:number,y?:number}|null} anchorLocalM — inicio de la primera varilla (opcional)
 */
export function buildBarsForPosition(pos, bounds, coverM, { anchorLocalM = null, colorIndex = 0 } = {}) {
  const p = normalizeDespiecePosition(pos) || pos
  const spacing = parseSpacingM(p?.spacingM)
  if (spacing == null) {
    return { drawable: false, reason: 'sin distribución', positionId: p?.id, name: p?.name || '' }
  }
  const metrics = computePositionMetrics(p)
  const pieces = metrics.ok ? metrics.pieces : Math.floor(parseNum(p?.pieces) || 0)
  if (!pieces || pieces < 1) {
    return { drawable: false, reason: 'sin distribución', positionId: p?.id, name: p?.name || '' }
  }
  const barLen = mainStraightLengthM(p)
  if (!Number.isFinite(barLen) || barLen <= 0) {
    return { drawable: false, reason: 'sin distribución', positionId: p?.id, name: p?.name || '' }
  }

  const ubic = String(p?.ubicacion || '').trim()
  const cover = Number(coverM) || 0
  const color = PARRILLA_POS_COLORS[colorIndex % PARRILLA_POS_COLORS.length]
  const diamShort = diameterShortLabel(p.diameter)
  const w = bounds.widthM
  const h = bounds.heightM
  const segments = []
  const hooks = []

  if (ubic === 'Longitudinal') {
    // Horizontales, arriba → abajo. Longitud desde borde + recubrimiento.
    const yFirst = Number.isFinite(anchorLocalM?.y) ? round2(anchorLocalM.y) : cover
    const xStart = Number.isFinite(anchorLocalM?.x) ? round2(anchorLocalM.x) : cover
    for (let i = 0; i < pieces; i += 1) {
      const y = round2(yFirst + i * spacing)
      const x1 = xStart
      const x2 = round2(xStart + barLen)
      segments.push({ x1, y1: y, x2, y2: y })
      hooks.push(...hookStubs(x1, y, x2, y))
    }
  } else if (ubic === 'Transversal') {
    // Verticales, izquierda → derecha.
    const xFirst = Number.isFinite(anchorLocalM?.x) ? round2(anchorLocalM.x) : cover
    const yStart = Number.isFinite(anchorLocalM?.y) ? round2(anchorLocalM.y) : cover
    for (let i = 0; i < pieces; i += 1) {
      const x = round2(xFirst + i * spacing)
      const y1 = yStart
      const y2 = round2(yStart + barLen)
      segments.push({ x1: x, y1, x2: x, y2 })
      hooks.push(...hookStubs(x, y1, x, y2))
    }
  } else if (ubic === 'Diagonal') {
    const angDeg = parseNum(p?.anguloDeg)
    const ang = Number.isFinite(angDeg) ? (angDeg * Math.PI) / 180 : Math.PI / 4
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    // Normal (rotado 90°) para repartir desde esquina superior izquierda
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    // Si hay ancla, la primera varilla pasa por ese punto; si no, offset = cover desde SI
    for (let i = 0; i < pieces; i += 1) {
      let x1
      let y1
      if (anchorLocalM && Number.isFinite(anchorLocalM.x) && Number.isFinite(anchorLocalM.y)) {
        x1 = round2(anchorLocalM.x + i * spacing * nx)
        y1 = round2(anchorLocalM.y + i * spacing * ny)
      } else {
        const d = cover + i * spacing
        // Punto sobre la normal desde SI; inicio del tramo a lo largo de u desde ese punto
        const ox = d * nx
        const oy = d * ny
        x1 = round2(ox)
        y1 = round2(oy)
        // Avanzar el inicio para que el tramo quede dentro: proyectar desde borde
        // Concepto: arranca a recubrimiento desde el borde a lo largo de la varilla
        x1 = round2(ox + cover * ux)
        y1 = round2(oy + cover * uy)
      }
      const x2 = round2(x1 + barLen * ux)
      const y2 = round2(y1 + barLen * uy)
      segments.push({ x1, y1, x2, y2 })
      hooks.push(...hookStubs(x1, y1, x2, y2))
    }
  } else {
    return { drawable: false, reason: 'sin distribución', positionId: p?.id, name: p?.name || '' }
  }

  const mid = segments[Math.floor(segments.length / 2)] || segments[0]
  let labelX
  let labelY
  let guideX
  let guideY
  if (ubic === 'Longitudinal') {
    guideX = mid.x2
    guideY = mid.y1
    labelX = round2(Math.max(w, mid.x2) + 0.18)
    labelY = mid.y1
  } else if (ubic === 'Transversal') {
    guideX = mid.x1
    guideY = mid.y2
    labelX = mid.x1
    labelY = round2(Math.max(h, mid.y2) + 0.18)
  } else {
    guideX = mid.x2
    guideY = mid.y2
    labelX = round2(mid.x2 + 0.2)
    labelY = round2(mid.y2 + 0.2)
  }

  const text = barLabelText(p, pieces, barLen, diamShort)
  return {
    drawable: true,
    positionId: p.id,
    name: p.name || '',
    color,
    ubicacion: ubic,
    pieces,
    barLenM: barLen,
    spacingM: spacing,
    diameterLabel: diamShort,
    labelText: text,
    segments,
    hooks,
    label: { text, x: labelX, y: labelY, guideX, guideY },
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

/**
 * @param {object} schedule
 * @param {object} boundsM
 * @param {number} coverM
 * @param {Record<string,{x:number,y:number}>} [anchorsLocalM]
 */
export function buildParrillaViews(schedule, boundsM, coverM, anchorsLocalM = {}) {
  const positions = (schedule?.positions || []).map((p) => normalizeDespiecePosition(p) || p)
  const hasDoble = positions.some((p) => String(p?.parrilla || '').trim() === 'Doble')

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

  let colorIdx = 0
  for (const pos of positions) {
    const key = hasDoble ? viewKeyForPosition(pos) : 'sencilla'
    const target = ensure(key)
    const bar = buildBarsForPosition(pos, boundsM, coverM, {
      anchorLocalM: anchorsLocalM?.[pos.id] || null,
      colorIndex: colorIdx,
    })
    colorIdx += 1
    if (!bar.drawable) {
      target.skipped.push({
        positionId: pos.id,
        name: pos.name || '',
        reason: bar.reason || 'sin distribución',
      })
    } else {
      target.bars.push(bar)
    }
  }

  const order = hasDoble ? ['doble-sup', 'doble-inf', 'sencilla'] : ['sencilla']
  const views = []
  for (const k of order) {
    const v = buckets.get(k)
    if (!v) continue
    if (!v.bars.length && !v.skipped.length) continue
    views.push(v)
  }

  return {
    coverM: Number(coverM),
    boundsM: { ...boundsM },
    views,
  }
}

export function verifyGridCaseA(views) {
  const v = views?.[0]
  if (!v) return false
  const long = v.bars.find((b) => b.ubicacion === 'Longitudinal')
  const trans = v.bars.find((b) => b.ubicacion === 'Transversal')
  if (!long || !trans) return false
  const ys = long.segments.map((s) => s.y1)
  const xs = trans.segments.map((s) => s.x1)
  const expect = [0.05, 0.25, 0.45, 0.65, 0.85, 1.05, 1.25, 1.45]
  if (ys.length !== 8 || xs.length !== 8) return false
  const near = (a, b) => Math.abs(a - b) < 1e-6
  return expect.every((e, i) => near(ys[i], e) && near(xs[i], e))
}

/**
 * Dibuja vistas en canvas (PNG o miniatura).
 * @returns {{ height: number }}
 */
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
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.strokeRect(px, py, plotW, plotH)

    const toX = (m) => px + m * s
    const toY = (m) => py + m * s

    // Separar rótulos verticalmente para no solaparse
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
        // Empujar si solapa otro rótulo
        for (const prev of labelSlots) {
          if (Math.abs(ly - prev.y) < 16 && Math.abs(lx - prev.x) < 200) {
            ly = prev.y + 18
          }
        }
        labelSlots.push({ x: lx, y: ly })
        const gx = toX(lb.guideX)
        const gy = toY(lb.guideY)
        ctx.strokeStyle = bar.color
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(gx, gy)
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
      const skipLine = view.skipped.map((sk) => `${sk.name || 'Pos'}: ${sk.reason}`).join(' · ')
      ctx.fillText(skipLine, px, py + plotH + 40)
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

/** Serializa drawData para borrador / regeneración PNG. */
export function serializeParrillaDraw(drawData) {
  if (!drawData) return null
  return JSON.parse(JSON.stringify(drawData))
}

/**
 * Dibuja el objeto de lienzo `despieceParrilla` en coordenadas world.
 */
export function drawDespieceParrillaObject(ctx, obj, selected = false) {
  if (!ctx || !obj?.drawData?.views?.length || !obj.boundsM) return
  const bounds = obj.boundsM
  const toW = (pt) => localMToWorld(pt, bounds)
  const labelSlots = []

  // Contorno guía
  const c0 = toW({ x: 0, y: 0 })
  const c1 = toW({ x: bounds.widthM, y: bounds.heightM })
  ctx.save()
  ctx.strokeStyle = selected ? '#ea580c' : '#94a3b8'
  ctx.lineWidth = selected ? 1.6 : 1
  ctx.setLineDash(selected ? [] : [5, 4])
  ctx.strokeRect(c0.x, c0.y, c1.x - c0.x, c1.y - c0.y)
  ctx.setLineDash([])

  for (const view of obj.drawData.views) {
    // Título de vista (arriba a la izquierda del bloque)
    ctx.fillStyle = '#0f766e'
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif'
    const titlePt = toW({ x: 0, y: -0.12 - (obj.drawData.views.indexOf(view) * 0.01) })
    // Offset por vista: apilar títulos ligeramente si hay varias — mejor encima del contorno
    void titlePt

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
          if (Math.hypot(lp.x - prev.x, lp.y - prev.y) < 14) {
            lp = { x: lp.x, y: prev.y + 14 }
          }
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
  }

  // Títulos de vista a la izquierda del contorno
  let titleY = c0.y - 8
  for (const view of obj.drawData.views) {
    ctx.fillStyle = '#0f766e'
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(view.title, c0.x, titleY)
    titleY -= 14
    if (view.skipped?.length) {
      ctx.fillStyle = '#64748b'
      ctx.font = '10px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(
        view.skipped.map((s) => `${s.name}: ${s.reason}`).join(' · '),
        c0.x,
        c1.y + 16 + (obj.drawData.views.indexOf(view) * 12),
      )
    }
  }
  ctx.restore()
}

export function despieceParrillaBoundsWorld(obj) {
  if (!obj?.boundsM) return null
  const b = obj.boundsM
  const padM = 0.5
  const a = localMToWorld({ x: -padM, y: -padM }, b)
  const c = localMToWorld({ x: b.widthM + padM + 0.8, y: b.heightM + padM + 0.4 }, b)
  return {
    x: Math.min(a.x, c.x),
    y: Math.min(a.y, c.y),
    w: Math.abs(c.x - a.x),
    h: Math.abs(c.y - a.y),
  }
}
