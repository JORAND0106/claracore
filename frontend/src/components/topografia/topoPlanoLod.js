/** Umbrales de zoom del Plano de poligonal (LOD de etiquetas). */
export const PLANO_LOD = {
  /** Por debajo: solo nombres (si caben). */
  MID: 1.35,
  /** Por encima: ángulos + coordenadas. */
  HIGH: 2.6,
}

/** Tamaño de marcador en píxeles de pantalla (independiente del zoom). */
export const MARKER_PX = {
  DESIRED: 3.75,
  MIN: 2.5,
  MAX: 5.25,
  STROKE: 1.25,
  AMARRE: 4.25,
}

/**
 * Nivel de detalle según scale del viewport (1 = vista inicial).
 * @returns {{ level: 0|1|2, showNombres: true, showDistancias: boolean, showAngulos: boolean, showCoords: boolean }}
 */
export function resolvePlanoLod(scale) {
  const s = Number(scale) || 1
  if (s < PLANO_LOD.MID) {
    return {
      level: 0,
      showNombres: true,
      showDistancias: false,
      showAngulos: false,
      showCoords: false,
    }
  }
  if (s < PLANO_LOD.HIGH) {
    return {
      level: 1,
      showNombres: true,
      showDistancias: true,
      showAngulos: false,
      showCoords: false,
    }
  }
  return {
    level: 2,
    showNombres: true,
    showDistancias: true,
    showAngulos: true,
    showCoords: true,
  }
}

/**
 * Separación mínima en píxeles de pantalla para no amontonar etiquetas.
 * A mayor nivel LOD, se tolera un poco menos (hay más espacio visual por punto).
 */
export function minLabelGapPx(lodLevel) {
  if (lodLevel >= 2) return 18
  if (lodLevel >= 1) return 24
  return 28
}

/**
 * Elige qué puntos muestran etiqueta de nombre sin superponerse en pantalla.
 * Distancia en SVG × scale ≈ separación en pantalla.
 *
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} scale
 * @param {number} [lodLevel=0]
 * @returns {boolean[]} visible[i] alineado con points
 */
export function pickVisibleLabelIndices(points, scale, lodLevel = 0) {
  const s = Math.max(Number(scale) || 1, 0.01)
  const minPx = minLabelGapPx(lodLevel)
  const minSvg = minPx / s
  const minSvg2 = minSvg * minSvg
  const shown = []
  const visible = new Array(points.length).fill(false)

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    if (p?.x == null || p?.y == null) continue
    let ok = true
    for (let j = 0; j < shown.length; j += 1) {
      const q = shown[j]
      const dx = p.x - q.x
      const dy = p.y - q.y
      if (dx * dx + dy * dy < minSvg2) {
        ok = false
        break
      }
    }
    if (ok) {
      visible[i] = true
      shown.push(p)
    }
  }
  return visible
}

/**
 * Factor de counter-scale para texto dentro de un SVG ya escalado por `scale`.
 * Mantiene tamaño aproximado en pantalla.
 */
export function textCounterScale(scale) {
  const s = Math.max(Number(scale) || 1, 0.01)
  // Limitar para que no se vuelva enorme al alejar ni microscópico al acercar
  return Math.min(2.2, Math.max(0.35, 1 / s))
}

/**
 * Radio del marcador en unidades SVG para un tamaño de pantalla acotado.
 * Evita que los círculos crezcan descontrolados al hacer zoom (viewBox).
 */
export function markerRadiusSvg(scale, {
  desiredPx = MARKER_PX.DESIRED,
  minPx = MARKER_PX.MIN,
  maxPx = MARKER_PX.MAX,
} = {}) {
  const s = Math.max(Number(scale) || 1, 0.01)
  const screen = Math.min(maxPx, Math.max(minPx, desiredPx))
  return screen / s
}

/** Grosor de trazo del marcador en unidades SVG (pantalla ≈ strokePx). */
export function markerStrokeSvg(scale, strokePx = MARKER_PX.STROKE) {
  const s = Math.max(Number(scale) || 1, 0.01)
  const px = Math.min(2, Math.max(0.75, strokePx))
  return px / s
}

/** Anclas candidatas (offset en píxeles de pantalla, antes de counter-scale). */
export const LABEL_ANCHORS = [
  { dx: 7, dy: -4, anchor: 'start' },
  { dx: -7, dy: -4, anchor: 'end' },
  { dx: 7, dy: 12, anchor: 'start' },
  { dx: -7, dy: 12, anchor: 'end' },
  { dx: 0, dy: -14, anchor: 'middle' },
  { dx: 0, dy: 18, anchor: 'middle' },
  { dx: 12, dy: 4, anchor: 'start' },
  { dx: -12, dy: 4, anchor: 'end' },
  { dx: 10, dy: -16, anchor: 'start' },
  { dx: -10, dy: -16, anchor: 'end' },
  { dx: 10, dy: 22, anchor: 'start' },
  { dx: -10, dy: 22, anchor: 'end' },
]

const CHAR_W = 0.58 // ancho aprox. por em

/**
 * Estima caja de etiqueta en píxeles de pantalla (origen en ancla del texto).
 * @param {string[]} lines
 * @param {{ nameSize?: number, bodySize?: number, padX?: number, padY?: number, lineGap?: number }} [opts]
 */
export function estimateLabelBoxPx(lines, {
  nameSize = 11,
  bodySize = 8,
  padX = 5,
  padY = 3,
  lineGap = 2,
} = {}) {
  const rows = (lines || []).filter((l) => l != null && String(l).length > 0)
  if (!rows.length) return { w: 0, h: 0, padX, padY }
  let maxW = 0
  let h = padY * 2
  rows.forEach((line, i) => {
    const fs = i === 0 ? nameSize : bodySize
    const w = String(line).length * fs * CHAR_W
    if (w > maxW) maxW = w
    h += fs + (i > 0 ? lineGap : 0)
  })
  return { w: maxW + padX * 2, h, padX, padY }
}

/**
 * Convierte ancla + caja (px pantalla) a AABB en coordenadas SVG.
 * El bloque vive en `translate(x,y) scale(inv)` con inv≈1/scale.
 */
export function labelBoxToSvgAabb(pointX, pointY, anchor, boxPx, scale) {
  const inv = textCounterScale(scale)
  const s = Math.max(Number(scale) || 1, 0.01)
  // En SVG: offsets de ancla también van en espacio counter-scaled (como ScreenText dx/dy)
  const ax = (Number(anchor.dx) || 0) * inv
  const ay = (Number(anchor.dy) || 0) * inv
  const w = boxPx.w * inv
  const h = boxPx.h * inv
  let left
  if (anchor.anchor === 'end') left = pointX + ax - w
  else if (anchor.anchor === 'middle') left = pointX + ax - w / 2
  else left = pointX + ax
  // text baseline ≈ padY + nameSize; caja empieza un poco arriba del dy
  const top = pointY + ay - boxPx.padY * inv
  return {
    left,
    top,
    right: left + w,
    bottom: top + h,
    w,
    h,
  }
}

function aabbOverlap(a, b, pad = 0) {
  return !(
    a.right + pad < b.left
    || a.left - pad > b.right
    || a.bottom + pad < b.top
    || a.top - pad > b.bottom
  )
}

function pointInAabb(x, y, box, pad = 0) {
  return (
    x >= box.left - pad
    && x <= box.right + pad
    && y >= box.top - pad
    && y <= box.bottom + pad
  )
}

/**
 * Coloca etiquetas de puntos evitando solapes entre sí y con marcadores vecinos.
 *
 * @param {Array<{ x: number, y: number, lines: string[] }>} items
 * @param {{ scale: number, lodLevel?: number, candidates?: typeof LABEL_ANCHORS }} [opts]
 * @returns {Array<null|{ index: number, dx: number, dy: number, textAnchor: string, lines: string[], box: object }>}
 */
export function placePointLabels(items, {
  scale = 1,
  lodLevel = 0,
  candidates = LABEL_ANCHORS,
} = {}) {
  const s = Math.max(Number(scale) || 1, 0.01)
  const inv = textCounterScale(s)
  const markerR = markerRadiusSvg(s)
  const padSvg = 3 / s
  const placed = []
  const out = new Array(items.length).fill(null)

  // Priorizar puntos más aislados primero (mejor chance de ancla “natural”)
  const order = items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it && it.x != null && it.y != null && (it.lines || []).length)
    .sort((a, b) => {
      const densOf = (idx, pt) => {
        let n = 0
        const lim2 = (40 / s) ** 2
        for (let j = 0; j < items.length; j += 1) {
          if (j === idx) continue
          const q = items[j]
          if (!q || q.x == null) continue
          const dx = pt.x - q.x
          const dy = pt.y - q.y
          if (dx * dx + dy * dy < lim2) n += 1
        }
        return n
      }
      return densOf(a.index, a.it) - densOf(b.index, b.it)
    })

  for (const { it, index } of order) {
    const fullLines = it.lines
    const nameOnly = [fullLines[0]]
    const variants = lodLevel >= 2 && fullLines.length > 1
      ? [fullLines, nameOnly]
      : [fullLines]

    let best = null
    for (const lines of variants) {
      const boxPx = estimateLabelBoxPx(lines)
      for (const cand of candidates) {
        const box = labelBoxToSvgAabb(it.x, it.y, cand, boxPx, s)
        let clash = false
        // No tapar el propio marcador ni vecinos cercanos
        for (let j = 0; j < items.length; j += 1) {
          const q = items[j]
          if (!q || q.x == null) continue
          const rPad = markerR + padSvg + (j === index ? markerR * 0.2 : markerR)
          if (pointInAabb(q.x, q.y, box, rPad)) {
            clash = true
            break
          }
        }
        if (clash) continue
        for (const prev of placed) {
          if (aabbOverlap(box, prev.box, padSvg)) {
            clash = true
            break
          }
        }
        if (clash) continue
        best = {
          index,
          dx: cand.dx,
          dy: cand.dy,
          textAnchor: cand.anchor,
          lines,
          box,
          inv,
        }
        break
      }
      if (best) break
    }

    if (best) {
      placed.push(best)
      out[index] = best
    }
  }

  return out
}
