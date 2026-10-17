/**
 * Vistas del modo 3D del esquema (proyección ortográfica / isométrica).
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
 * Proyecta un punto 3D (x,y world lienzo; zCota metros) al plano del lienzo 2D.
 * @returns {{ x: number, y: number }}
 */
export function projectWorld3dToCanvas(pt, viewId, cotaRefM = 0) {
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
  // Isométrica clásica (≈30°): u = (x - y)*cos30, v = (x + y)*sin30 - z
  const cos = Math.SQRT1_2 // ≈ cos 45 for a clean screen isometric
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
