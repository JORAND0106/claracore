/**
 * Vistas del modo 3D del esquema (proyección ortográfica / isométrica / órbita libre).
 * El lienzo 2D sigue en píxeles world; Z (cota) se expresa en metros reales.
 */
import { PX_PER_METER, metersToWorld } from './esquemaGeometry.js'

export const ESQUEMA_3D_VIEWS = Object.freeze([
  { id: 'top', label: 'Vista superior', draw: true },
  { id: 'front', label: 'Vista frontal', draw: true },
  { id: 'side', label: 'Vista lateral', draw: true },
  { id: 'iso-ne', label: 'Isométrica NE', draw: false },
  { id: 'iso-nw', label: 'Isométrica NO', draw: false },
  { id: 'iso-se', label: 'Isométrica SE', draw: false },
  { id: 'iso-sw', label: 'Isométrica SO', draw: false },
])

export function isEsquema3dDrawView(viewId) {
  const v = ESQUEMA_3D_VIEWS.find((x) => x.id === viewId)
  return !!(v && v.draw)
}

export function isEsquema3dIsoView(viewId) {
  return String(viewId || '').startsWith('iso-')
}

/** Cota (m) → desplazamiento world en el eje de pantalla vertical de perfil. */
export function cotaToWorldZ(cotaM, cotaRefM = 0) {
  const c = Number(cotaM)
  const r = Number(cotaRefM) || 0
  if (!Number.isFinite(c)) return 0
  // En perfil, cota mayor se dibuja más arriba → y de pantalla menor si Y crece hacia abajo.
  return -metersToWorld(c - r)
}

export function worldZToCota(worldZ, cotaRefM = 0) {
  const z = Number(worldZ)
  const r = Number(cotaRefM) || 0
  if (!Number.isFinite(z)) return r
  return r - (z / PX_PER_METER)
}

/**
 * Ángulos de cámara (radianes) que reproducen cada vista predefinida.
 * yaw: rotación horizontal; pitch: elevación (-π/2..π/2).
 * Convención: pitch=π/2 mira desde arriba; pitch=0 mira horizontal.
 */
export function orbitAnglesForView(viewId) {
  const isoPitch = Math.atan(1 / Math.SQRT2) // ~35.26°
  switch (viewId) {
    case 'front':
      return { yaw: 0, pitch: 0 }
    case 'side':
      return { yaw: Math.PI / 2, pitch: 0 }
    case 'iso-ne':
      return { yaw: Math.PI / 4, pitch: isoPitch }
    case 'iso-nw':
      return { yaw: (3 * Math.PI) / 4, pitch: isoPitch }
    case 'iso-se':
      return { yaw: -Math.PI / 4, pitch: isoPitch }
    case 'iso-sw':
      return { yaw: (-3 * Math.PI) / 4, pitch: isoPitch }
    case 'top':
    default:
      return { yaw: 0, pitch: Math.PI / 2 }
  }
}

/**
 * Proyecta punto world (x,y en px lienzo; zCota en m) con cámara órbita.
 * Centro opcional para orbitar alrededor de los elementos.
 */
export function projectOrbit(pt, {
  yaw = 0,
  pitch = Math.PI / 2,
  cotaRefM = 0,
  center = null,
} = {}) {
  const cx = Number(center?.x) || 0
  const cy = Number(center?.y) || 0
  const cz = Number(center?.zCota) || cotaRefM || 0
  const x0 = (Number(pt?.x) || 0) - cx
  const y0 = (Number(pt?.y) || 0) - cy
  // Eje vertical hacia arriba en world-px: cota * PPM
  const z0 = ((Number(pt?.zCota) || 0) - cz) * PX_PER_METER

  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  // Rotación yaw alrededor de Z (vertical / cota)
  const x1 = x0 * cosY - y0 * sinY
  const y1 = x0 * sinY + y0 * cosY
  const z1 = z0

  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  // pitch=π/2 → vista superior (screen ≈ x1,y1); pitch=0 → frontal (screen ≈ x1,-z1)
  return {
    x: x1 + cx,
    y: (y1 * sinP - z1 * cosP) + cy,
    depth: y1 * cosP + z1 * sinP,
  }
}

/**
 * Proyecta un punto 3D al plano del lienzo 2D según vista o órbita libre.
 * @returns {{ x: number, y: number, depth?: number }}
 */
export function projectWorld3dToCanvas(pt, viewId, cotaRefM = 0, orbit = null) {
  if (orbit && Number.isFinite(orbit.yaw) && Number.isFinite(orbit.pitch)) {
    return projectOrbit(pt, {
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      cotaRefM,
      center: orbit.center || null,
    })
  }
  const x = Number(pt?.x) || 0
  const y = Number(pt?.y) || 0
  const z = cotaToWorldZ(pt?.zCota ?? cotaRefM, cotaRefM)
  switch (viewId) {
    case 'front':
      return { x, y: z }
    case 'side':
      return { x: y, y: z }
    case 'iso-ne':
      return isoProject(x, y, z, 1, 1)
    case 'iso-nw':
      return isoProject(x, y, z, -1, 1)
    case 'iso-se':
      return isoProject(x, y, z, 1, -1)
    case 'iso-sw':
      return isoProject(x, y, z, -1, -1)
    case 'top':
    default:
      return { x, y }
  }
}

function isoProject(x, y, z, sx, sy) {
  const cos = Math.SQRT1_2
  const sin = Math.SQRT1_2
  const X = x * sx
  const Y = y * sy
  return {
    x: (X - Y) * cos,
    y: (X + Y) * sin * 0.5 + z,
  }
}

/** Eje de extrusión según la vista donde se dibujó el contorno. */
export function extrudeAxisForView(viewId) {
  if (viewId === 'front') return 'y'
  if (viewId === 'side') return 'x'
  return 'z' // superior → cotas
}

/** Centro aproximado de un conjunto de sólidos (para órbita). */
export function solidsOrbitCenter(solids, cotaRefM = 0) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const solid of solids || []) {
    for (const cell of solid?.cells || []) {
      const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
      const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
      minZ = Math.min(minZ, z0)
      maxZ = Math.max(maxZ, z1)
      for (const p of cell.ring || []) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, zCota: cotaRefM || 0 }
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zCota: (minZ + maxZ) / 2,
  }
}
