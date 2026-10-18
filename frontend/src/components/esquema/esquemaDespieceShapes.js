/**
 * Biblioteca de formas de varilla (catálogo de plataforma + formas de usuario).
 * Cada forma declara segmentos nombrados y un dibujo SVG (viewBox) con paths por segmento.
 */
import { newDespieceId, spiralDevelopedLengthCm } from './esquemaDespiece.js'
import { worldToMeters } from './esquemaGeometry.js'

/** @typedef {{ id: string, name: string, path: string }} SegDef */

/**
 * @typedef {{
 *   id: string,
 *   nombre: string,
 *   builtin: boolean,
 *   kind: 'linear'|'spiral'|'circle'|'custom',
 *   segments: SegDef[],
 *   viewBox: string,
 *   thumbPath?: string,
 * }} ShapeDef
 */

/** Catálogo inicial de la plataforma. */
export const DESPIECE_BUILTIN_SHAPES = Object.freeze([
  {
    id: 'recta',
    nombre: 'Recta',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 120 40',
    segments: [
      { id: 'a', name: 'Tramo', path: 'M 10 20 L 110 20' },
    ],
  },
  {
    id: 'gancho_l',
    nombre: 'L (un gancho)',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 120 80',
    segments: [
      { id: 'hook', name: 'Gancho', path: 'M 20 15 L 20 55' },
      { id: 'leg', name: 'Tramo', path: 'M 20 55 L 100 55' },
    ],
  },
  {
    id: 'doble_gancho',
    nombre: 'Doble gancho (U)',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 160 70',
    segments: [
      { id: 'left', name: 'Gancho izquierdo', path: 'M 20 15 L 20 50' },
      { id: 'center', name: 'Tramo central', path: 'M 20 50 L 140 50' },
      { id: 'right', name: 'Gancho derecho', path: 'M 140 50 L 140 15' },
    ],
  },
  {
    id: 'gancho_180',
    nombre: 'Gancho a 180°',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 140 70',
    segments: [
      { id: 'hook', name: 'Gancho 180°', path: 'M 35 45 A 15 15 0 1 1 35 15' },
      { id: 'leg', name: 'Tramo', path: 'M 35 45 L 120 45' },
    ],
  },
  {
    id: 'doble_gancho_180',
    nombre: 'Doble gancho a 180°',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 180 70',
    segments: [
      // Semicírculo izquierdo (180°) + tramo + semicírculo derecho
      { id: 'left', name: 'Gancho izquierdo', path: 'M 45 48 A 14 14 0 1 1 45 20' },
      { id: 'center', name: 'Tramo central', path: 'M 45 48 L 135 48' },
      { id: 'right', name: 'Gancho derecho', path: 'M 135 48 A 14 14 0 1 0 135 20' },
    ],
  },
  {
    // Fleje comercial: cerrado, ganchos 135° en la misma esquina hacia el interior.
    // Popup: Lado A, Lado B, longitud de cada gancho. L = 2A + 2B + 2×gancho (contrib: 2).
    id: 'fleje_135',
    nombre: 'Fleje comercial 135°',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 140 110',
    segments: [
      {
        id: 'ladoA',
        name: 'Lado A',
        contrib: 2,
        // Ambos lados horizontales (resalte conjunto)
        path: 'M 32 24 L 112 24 M 32 84 L 112 84',
      },
      {
        id: 'ladoB',
        name: 'Lado B',
        contrib: 2,
        // Ambos lados verticales
        path: 'M 112 24 L 112 84 M 32 24 L 32 84',
      },
      {
        id: 'gancho',
        name: 'Longitud de cada gancho',
        contrib: 2,
        // Dos ganchos 135° en la esquina inferior izquierda, hacia el interior
        path: 'M 32 84 L 52 68 M 32 84 L 48 56',
      },
    ],
  },
  {
    id: 'aro',
    nombre: 'Aro circular',
    builtin: true,
    kind: 'circle',
    viewBox: '0 0 100 100',
    segments: [
      { id: 'circ', name: 'Circunferencia (Ø m)', path: 'M 50 15 A 35 35 0 1 1 49.9 15' },
    ],
  },
  {
    id: 'espiral',
    nombre: 'Espiral',
    builtin: true,
    kind: 'spiral',
    viewBox: '0 0 120 100',
    segments: [], // diametro, paso, vueltas — ver campos especiales
    spiralFields: [
      { id: 'diametroM', name: 'Diámetro (m)' },
      { id: 'pasoM', name: 'Paso (m)' },
      { id: 'vueltas', name: 'N° de vueltas' },
    ],
    thumbPath: 'M 20 50 Q 40 20 60 50 T 100 50',
  },
  {
    id: 'escalonada_z',
    nombre: 'Varilla escalonada (Z)',
    builtin: true,
    kind: 'linear',
    viewBox: '0 0 160 80',
    segments: [
      { id: 'a', name: 'Tramo A', path: 'M 15 20 L 70 20' },
      { id: 'b', name: 'Tramo diagonal', path: 'M 70 20 L 90 60' },
      { id: 'c', name: 'Tramo C', path: 'M 90 60 L 145 60' },
    ],
  },
])

export function getBuiltinShape(id) {
  return DESPIECE_BUILTIN_SHAPES.find((s) => s.id === id) || null
}

export function listBuiltinShapes() {
  return DESPIECE_BUILTIN_SHAPES.map((s) => ({ ...s }))
}

/** Inicializa segmentos vacíos según la forma. */
export function blankSegmentsForShape(shape) {
  if (!shape) return []
  if (shape.kind === 'spiral') return []
  return (shape.segments || []).map((s) => ({
    id: s.id,
    name: s.name,
    mode: 'unica',
    units: 'm',
    lengthM: '',
    minM: '',
    maxM: '',
    contrib: Number(s.contrib) > 0 ? Number(s.contrib) : 1,
  }))
}

export { normalizeDespiecePosition } from './esquemaDespiece.js'

export function blankSpiral() {
  return { diametroM: '', pasoM: '', vueltas: '', units: 'm' }
}

/**
 * A partir de una polilínea del esquema, identifica segmentos (cada lado).
 * Longitudes en metros.
 */
export function segmentsFromPolyline(obj) {
  const pts = obj?.points
  if (!Array.isArray(pts) || pts.length < 2) return null
  const segs = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = (b.x || 0) - (a.x || 0)
    const dy = (b.y || 0) - (a.y || 0)
    const lenM = Math.hypot(worldToMeters(dx), worldToMeters(dy))
    const m = Math.round(lenM * 1e6) / 1e6
    segs.push({
      id: `s${i + 1}`,
      name: `Segmento ${i + 1}`,
      mode: 'unica',
      units: 'm',
      lengthM: String(m),
      minM: '',
      maxM: '',
      pathHint: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
    })
  }
  // Cerrada: último → primero
  if (obj.closed && pts.length >= 3) {
    const a = pts[pts.length - 1]
    const b = pts[0]
    const dx = (b.x || 0) - (a.x || 0)
    const dy = (b.y || 0) - (a.y || 0)
    const lenM = Math.hypot(worldToMeters(dx), worldToMeters(dy))
    const m = Math.round(lenM * 1e6) / 1e6
    segs.push({
      id: `s${segs.length + 1}`,
      name: `Segmento ${segs.length + 1}`,
      mode: 'unica',
      units: 'm',
      lengthM: String(m),
      minM: '',
      maxM: '',
      pathHint: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
    })
  }
  return segs
}

/** Construye definición de forma personalizada a partir de polilínea + nombres. */
export function buildCustomShapeFromPolyline(obj, { nombre, segmentNames = [] } = {}) {
  const segs = segmentsFromPolyline(obj)
  if (!segs?.length) return null
  const named = segs.map((s, i) => ({
    ...s,
    name: String(segmentNames[i] || s.name).trim() || s.name,
  }))
  // viewBox a partir de pathHints
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of named) {
    const h = s.pathHint
    if (!h) continue
    minX = Math.min(minX, h.x1, h.x2)
    minY = Math.min(minY, h.y1, h.y2)
    maxX = Math.max(maxX, h.x1, h.x2)
    maxY = Math.max(maxY, h.y1, h.y2)
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 40
  }
  const pad = 10
  const w = Math.max(40, maxX - minX)
  const h = Math.max(20, maxY - minY)
  const scale = 100 / Math.max(w, h)
  const toSvg = (x, y) => ({
    x: (x - minX) * scale + pad,
    y: (y - minY) * scale + pad,
  })
  const segments = named.map((s) => {
    const a = toSvg(s.pathHint.x1, s.pathHint.y1)
    const b = toSvg(s.pathHint.x2, s.pathHint.y2)
    return {
      id: s.id,
      name: s.name,
      path: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    }
  })
  return {
    id: newDespieceId('forma'),
    nombre: String(nombre || 'Forma personalizada').trim() || 'Forma personalizada',
    builtin: false,
    kind: 'custom',
    viewBox: `0 0 ${(w * scale + pad * 2).toFixed(0)} ${(h * scale + pad * 2).toFixed(0)}`,
    segments,
    createdAt: new Date().toISOString(),
  }
}

export { spiralDevelopedLengthCm }
