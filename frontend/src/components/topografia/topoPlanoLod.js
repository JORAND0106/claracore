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

/**
 * Convierte coordenada del mundo SVG a píxeles CSS del contenedor
 * (viewBox + preserveAspectRatio xMidYMid meet).
 */
export function svgPointToCss(x, y, viewBoxStr, cssW, cssH) {
  const parts = String(viewBoxStr || '0 0 1 1').trim().split(/[\s,]+/).map(Number)
  const vbX = parts[0] || 0
  const vbY = parts[1] || 0
  const vbW = Math.max(parts[2] || 1, 1e-6)
  const vbH = Math.max(parts[3] || 1, 1e-6)
  const cw = Math.max(Number(cssW) || 1, 1e-6)
  const ch = Math.max(Number(cssH) || 1, 1e-6)
  const s = Math.min(cw / vbW, ch / vbH)
  const ox = (cw - vbW * s) / 2
  const oy = (ch - vbH * s) / 2
  return {
    left: ox + (x - vbX) * s,
    top: oy + (y - vbY) * s,
  }
}

/**
 * Distancias al vértice anterior y siguiente en la poligonal (metros).
 * @param {Array<{ p: { norte?: number, este?: number, nombre_punto?: string, nombre?: string } }>} coords
 * @param {number} index
 * @param {boolean} esCerrada
 */
export function distanciasVecinas(coords, index, esCerrada = false) {
  const n = coords?.length || 0
  if (n < 2 || index < 0 || index >= n) {
    return { prev: null, next: null, prevNombre: null, nextNombre: null }
  }
  const pt = (i) => coords[i]?.p
  const nombreDe = (p) => p?.nombre_punto || p?.nombre || null
  const dist = (a, b) => {
    if (a?.norte == null || a?.este == null || b?.norte == null || b?.este == null) return null
    return Math.hypot(b.norte - a.norte, b.este - a.este)
  }

  let prevIdx = index - 1
  let nextIdx = index + 1
  if (esCerrada) {
    if (prevIdx < 0) prevIdx = n - 1
    if (nextIdx >= n) nextIdx = 0
  }

  const cur = pt(index)
  const prevP = prevIdx >= 0 && prevIdx < n ? pt(prevIdx) : null
  const nextP = nextIdx >= 0 && nextIdx < n ? pt(nextIdx) : null

  return {
    prev: prevP ? dist(prevP, cur) : null,
    next: nextP ? dist(cur, nextP) : null,
    prevNombre: prevP ? nombreDe(prevP) : null,
    nextNombre: nextP ? nombreDe(nextP) : null,
  }
}

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
