/**
 * Curvas 3D lisas: cilindros / elipses extruidos en perfil y huecos redondos.
 * La geometría boolean sigue en celdas; el dibujo usa profileDraw / curveHoles.
 */
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import { projectWorld3dToCanvas, viewProfileMeta } from './esquema3dViews.js'

/** Segmentos / bandas: contorno liso a cualquier zoom habitual. */
export const CIRCLE_SEGMENTS = 96

export function isCircularAnalytic(analytic) {
  if (analytic?.type !== 'ellipse') return false
  return Math.abs(Math.abs(analytic.rxM) - Math.abs(analytic.ryM)) < 1e-9
}

/**
 * Metadatos de dibujo para un tubo elíptico (eje = profundidad de la vista).
 * along/cota en world (along en px, cota en m); depthMin/Max en world px.
 */
export function buildEllipseProfileDraw({
  analytic,
  alongMin,
  alongMax,
  zMin,
  zMax,
  depthMin,
  depthMax,
  meta,
  viewId,
}) {
  if (analytic?.type !== 'ellipse') return null
  const rx = Math.abs(alongMax - alongMin) / 2
  const rzM = Math.abs(zMax - zMin) / 2
  if (!(rx > 0) || !(rzM > 0)) return null
  const rxM = worldToMeters(rx)
  const circ = Math.abs(rxM - rzM) < 1e-9
  return {
    kind: 'ellipse_tube',
    viewId: viewId || null,
    alongAxis: meta?.alongAxis || 'x',
    depthAxis: meta?.depthAxis || 'y',
    cxAlong: (alongMin + alongMax) / 2,
    cz: (zMin + zMax) / 2,
    rx,
    rzM,
    depth0: Math.min(depthMin, depthMax),
    depth1: Math.max(depthMin, depthMax),
    circular: circ,
    segments: CIRCLE_SEGMENTS,
  }
}

/** Traslada profileDraw / curveHole con el sólido. */
export function translateProfileDraw(pd, { dx = 0, dy = 0, dzCota = 0 } = {}) {
  if (!pd) return pd
  const ddx = Number(dx) || 0
  const ddy = Number(dy) || 0
  const ddz = Number(dzCota) || 0
  if (pd.kind === 'ellipse_xy') {
    return {
      ...pd,
      cx: (Number(pd.cx) || 0) + ddx,
      cy: (Number(pd.cy) || 0) + ddy,
      z0: (Number(pd.z0) || 0) + ddz,
      z1: (Number(pd.z1) || 0) + ddz,
    }
  }
  if (pd.kind !== 'ellipse_tube') return pd
  const next = { ...pd, cz: (Number(pd.cz) || 0) + ddz }
  if (pd.alongAxis === 'x') {
    next.cxAlong = (Number(pd.cxAlong) || 0) + ddx
    next.depth0 = (Number(pd.depth0) || 0) + ddy
    next.depth1 = (Number(pd.depth1) || 0) + ddy
  } else {
    next.cxAlong = (Number(pd.cxAlong) || 0) + ddy
    next.depth0 = (Number(pd.depth0) || 0) + ddx
    next.depth1 = (Number(pd.depth1) || 0) + ddx
  }
  return next
}

/**
 * Anillos 3D (world x,y + zCota) en los extremos del tubo.
 * @returns {{ ringA: object[], ringB: object[] }}
 */
export function ellipseTubeWorldRings(pd, segments = CIRCLE_SEGMENTS) {
  const n = Math.max(24, Math.floor(segments || CIRCLE_SEGMENTS))
  const cx = Number(pd.cxAlong) || 0
  const cz = Number(pd.cz) || 0
  const rx = Math.abs(Number(pd.rx) || 0)
  const rzM = Math.abs(Number(pd.rzM) || 0)
  const d0 = Number(pd.depth0) || 0
  const d1 = Number(pd.depth1) || 0
  const ringA = []
  const ringB = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2
    const along = cx + Math.cos(t) * rx
    const zCota = cz + Math.sin(t) * rzM
    if (pd.alongAxis === 'x') {
      ringA.push({ x: along, y: d0, zCota })
      ringB.push({ x: along, y: d1, zCota })
    } else {
      ringA.push({ x: d0, y: along, zCota })
      ringB.push({ x: d1, y: along, zCota })
    }
  }
  return { ringA, ringB }
}

function projectWorldRing(ring, viewId, cotaRefM, orbit) {
  return (ring || []).map((p) => projectWorld3dToCanvas(
    { x: p.x, y: p.y, zCota: p.zCota },
    viewId,
    cotaRefM,
    orbit,
  ))
}

function signedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/**
 * Emite caras/aristas de un tubo elíptico liso (sin losas Z).
 * @returns {{ faces: object[], edges: object[] }}
 */
export function ellipseTubeMesh(pd, {
  viewId = 'top',
  cotaRefM = 0,
  orbit = null,
} = {}) {
  const { ringA, ringB } = ellipseTubeWorldRings(pd, pd.segments)
  const a = projectWorldRing(ringA, viewId, cotaRefM, orbit)
  const b = projectWorldRing(ringB, viewId, cotaRefM, orbit)
  const n = a.length
  const faces = []
  const edges = []
  const addEdge = (pa, pb, front) => {
    edges.push({ a: pa, b: pb, front })
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const pts = [a[i], a[j], b[j], b[i]]
    const depth = pts.reduce((s, q) => s + (q.depth || 0), 0) / 4
    const front = signedArea(pts) < 0
    // Normal aproximada en el plano del perfil (along, cota).
    const t = (i / n) * Math.PI * 2
    const nx = Math.cos(t)
    const nz = Math.sin(t)
    faces.push({
      pts, depth, front, toneCurved: true, nx, nz, kind: 'side',
    })
    addEdge(a[i], a[j], front)
    addEdge(b[j], b[i], front)
    // Sin generatrices densas: solo caps (aristas de los anillos).
  }
  if (a.length >= 3) {
    const depth = a.reduce((s, q) => s + (q.depth || 0), 0) / a.length
    const front = signedArea(a) < 0
    faces.push({ pts: a, depth, front, tone: 'capA', kind: 'cap' })
  }
  if (b.length >= 3) {
    const depth = b.reduce((s, q) => s + (q.depth || 0), 0) / b.length
    const front = signedArea(b) < 0
    faces.push({ pts: b, depth, front, tone: 'capB', kind: 'cap' })
  }
  return { faces, edges }
}

/**
 * Contorno elíptico proyectado en el plano de una vista (para huecos lisos).
 * Usa el anillo a mitad de profundidad.
 */
export function ellipseTubeHoleOutline(pd, {
  viewId = 'top',
  cotaRefM = 0,
  orbit = null,
} = {}) {
  const mid = {
    ...pd,
    depth0: ((Number(pd.depth0) || 0) + (Number(pd.depth1) || 0)) / 2,
    depth1: ((Number(pd.depth0) || 0) + (Number(pd.depth1) || 0)) / 2,
  }
  const { ringA } = ellipseTubeWorldRings(mid, pd.segments || CIRCLE_SEGMENTS)
  return projectWorldRing(ringA, viewId, cotaRefM, orbit)
}

/** ¿El profileDraw / curveHole es un círculo real (para DXF CIRCLE)? */
export function profileDrawAsDxfCircle(pd) {
  if (!pd || pd.kind !== 'ellipse_tube' || !pd.circular) return null
  const rM = Math.abs(Number(pd.rzM) || worldToMeters(Number(pd.rx) || 0))
  if (!(rM > 0)) return null
  const cxAlong = Number(pd.cxAlong) || 0
  const cz = Number(pd.cz) || 0
  const dMid = ((Number(pd.depth0) || 0) + (Number(pd.depth1) || 0)) / 2
  let x = 0
  let y = 0
  if (pd.alongAxis === 'x') {
    x = cxAlong
    y = dMid
  } else {
    x = dMid
    y = cxAlong
  }
  return {
    x, y, zCota: cz, rM,
    // También extremos para exportar en ambos planos.
    depth0: Number(pd.depth0) || 0,
    depth1: Number(pd.depth1) || 0,
    alongAxis: pd.alongAxis,
  }
}

/** Anillo XY de elipse vertical (extrusión por cotas) a N segmentos. */
export function ellipseXyRing(cx, cy, rx, ry, segments = CIRCLE_SEGMENTS) {
  const n = Math.max(24, Math.floor(segments))
  const pts = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry })
  }
  return pts
}

export function viewMetaOrDefault(viewId) {
  return viewProfileMeta(viewId) || { alongAxis: 'x', depthAxis: 'y' }
}

export { metersToWorld, worldToMeters }
