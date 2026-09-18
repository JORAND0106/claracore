/**
 * Estilos de trazo del editor de esquema (Canvas 2D).
 * Persistidos en cada entidad como `lineStyle` (string).
 */

export const LINE_STYLE_CONTINUA = 'continua'
export const LINE_STYLE_PUNTEADA = 'punteada'
export const LINE_STYLE_PUNTO_LINEA = 'punto_linea'
export const LINE_STYLE_PUNTO_PUNTO_LINEA = 'punto_punto_linea'
export const LINE_STYLE_DOBLE = 'doble'
export const LINE_STYLE_DOBLE_SEG = 'doble_seg'
export const LINE_STYLE_X = 'x'
export const LINE_STYLE_XX = 'xx'

/** Opciones del selector (orden de UI). */
export const LINE_STYLE_OPTIONS = [
  { id: LINE_STYLE_CONTINUA, label: 'Continua' },
  { id: LINE_STYLE_PUNTEADA, label: 'Punteada' },
  { id: LINE_STYLE_PUNTO_LINEA, label: 'Punto-línea' },
  { id: LINE_STYLE_PUNTO_PUNTO_LINEA, label: 'Punto-punto-línea' },
  { id: LINE_STYLE_DOBLE, label: 'Doble' },
  { id: LINE_STYLE_DOBLE_SEG, label: 'Doble segmentada' },
  { id: LINE_STYLE_X, label: 'Línea-X' },
  { id: LINE_STYLE_XX, label: 'Línea-X-X' },
]

const VALID = new Set(LINE_STYLE_OPTIONS.map((o) => o.id))

export function normalizeLineStyle(raw) {
  const s = String(raw || '').trim()
  return VALID.has(s) ? s : LINE_STYLE_CONTINUA
}

/** Dash pattern escalado al grosor (Canvas setLineDash). */
export function lineDashForStyle(style, width = 3) {
  const w = Math.max(1, Number(width) || 3)
  const st = normalizeLineStyle(style)
  if (st === LINE_STYLE_PUNTEADA) return [Math.max(1.5, w * 0.6), Math.max(2.5, w * 1.1)]
  if (st === LINE_STYLE_PUNTO_LINEA) {
    return [Math.max(8, w * 3), Math.max(3, w * 1.2), Math.max(1.5, w * 0.5), Math.max(3, w * 1.2)]
  }
  if (st === LINE_STYLE_PUNTO_PUNTO_LINEA) {
    return [
      Math.max(8, w * 3), Math.max(3, w * 1.1),
      Math.max(1.5, w * 0.5), Math.max(3, w * 1.1),
      Math.max(1.5, w * 0.5), Math.max(3, w * 1.1),
    ]
  }
  if (st === LINE_STYLE_DOBLE_SEG) return [Math.max(7, w * 2.5), Math.max(4, w * 1.5)]
  return []
}

function perpUnit(dx, dy) {
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

function samplePolyline(pts, spacing) {
  const out = []
  if (!pts?.length) return out
  const sp = Math.max(4, spacing)
  let carry = 0
  out.push({ x: pts[0].x, y: pts[0].y, tx: 1, ty: 0 })
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]
    const b = pts[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const seg = Math.hypot(dx, dy)
    if (seg < 1e-6) continue
    const ux = dx / seg
    const uy = dy / seg
    let t = sp - carry
    while (t < seg) {
      out.push({ x: a.x + ux * t, y: a.y + uy * t, tx: ux, ty: uy })
      t += sp
    }
    carry = (seg + carry) % sp
  }
  return out
}

function drawXMarks(ctx, pts, style, width) {
  const st = normalizeLineStyle(style)
  const w = Math.max(1, Number(width) || 3)
  const spacing = st === LINE_STYLE_XX ? Math.max(10, w * 5) : Math.max(14, w * 7)
  const arm = Math.max(3, w * 1.8)
  const samples = samplePolyline(pts, spacing)
  ctx.save()
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, w * 0.85)
  for (const s of samples) {
    const px = -s.ty
    const py = s.tx
    if (st === LINE_STYLE_XX) {
      // dos X cercanas perpendiculares al trazo
      for (const side of [-1, 1]) {
        const cx = s.x + px * arm * 0.35 * side
        const cy = s.y + py * arm * 0.35 * side
        ctx.beginPath()
        ctx.moveTo(cx - arm * 0.55, cy - arm * 0.55)
        ctx.lineTo(cx + arm * 0.55, cy + arm * 0.55)
        ctx.moveTo(cx + arm * 0.55, cy - arm * 0.55)
        ctx.lineTo(cx - arm * 0.55, cy + arm * 0.55)
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(s.x - arm * 0.7, s.y - arm * 0.7)
      ctx.lineTo(s.x + arm * 0.7, s.y + arm * 0.7)
      ctx.moveTo(s.x + arm * 0.7, s.y - arm * 0.7)
      ctx.lineTo(s.x - arm * 0.7, s.y + arm * 0.7)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function strokePolylineOnce(ctx, pts) {
  if (!pts?.length) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

function offsetPolyline(pts, dist) {
  if (!pts?.length) return []
  if (pts.length === 1) return [{ ...pts[0] }]
  const out = []
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const n = perpUnit(dx, dy)
    out.push({ x: pts[i].x + n.x * dist, y: pts[i].y + n.y * dist })
  }
  return out
}

/**
 * Traza una polilínea (o segmento de 2 puntos) con el estilo indicado.
 * El caller debe haber configurado strokeStyle / lineWidth / composite.
 */
export function strokeStyledPolyline(ctx, pts, style, width = 3) {
  const list = (pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (list.length < 2) return
  const st = normalizeLineStyle(style)
  const w = Math.max(1, Number(width) || 3)

  if (st === LINE_STYLE_DOBLE || st === LINE_STYLE_DOBLE_SEG) {
    const off = Math.max(1.5, w * 0.9)
    const dash = st === LINE_STYLE_DOBLE_SEG ? lineDashForStyle(st, w) : []
    ctx.save()
    ctx.setLineDash(dash)
    strokePolylineOnce(ctx, offsetPolyline(list, off))
    strokePolylineOnce(ctx, offsetPolyline(list, -off))
    ctx.setLineDash([])
    ctx.restore()
    return
  }

  if (st === LINE_STYLE_X || st === LINE_STYLE_XX) {
    ctx.save()
    ctx.setLineDash([])
    strokePolylineOnce(ctx, list)
    ctx.restore()
    drawXMarks(ctx, list, st, w)
    return
  }

  const dash = lineDashForStyle(st, w)
  ctx.save()
  ctx.setLineDash(dash)
  strokePolylineOnce(ctx, list)
  ctx.setLineDash([])
  ctx.restore()
}

export function strokeStyledSegment(ctx, a, b, style, width = 3) {
  if (!a || !b) return
  strokeStyledPolyline(ctx, [a, b], style, width)
}

/** Para contornos cerrados (rect/elipse/triángulo): dash o doble; X no aplica (usa continua). */
export function applyClosedStrokeStyle(ctx, style, width = 3) {
  const st = normalizeLineStyle(style)
  if (st === LINE_STYLE_X || st === LINE_STYLE_XX) {
    ctx.setLineDash([])
    return { double: false, dashSeg: false }
  }
  if (st === LINE_STYLE_DOBLE || st === LINE_STYLE_DOBLE_SEG) {
    ctx.setLineDash(st === LINE_STYLE_DOBLE_SEG ? lineDashForStyle(st, width) : [])
    return { double: true, dashSeg: st === LINE_STYLE_DOBLE_SEG }
  }
  ctx.setLineDash(lineDashForStyle(st, width))
  return { double: false, dashSeg: false }
}
