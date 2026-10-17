/**
 * Vistas del modo 3D del esquema (proyección ortográfica / isométrica / órbita libre).
 * Seis caras de dibujo + isométricas NE/NO/SE/SO.
 * El lienzo 2D sigue en píxeles world; Z (cota) se expresa en metros reales.
 */
import { PX_PER_METER, metersToWorld } from './esquemaGeometry.js'

/**
 * Vistas de dibujo (6 caras) e inspección isométrica.
 * extrude: 'cotas' | 'length'
 */
export const ESQUEMA_3D_VIEWS = Object.freeze([
  { id: 'top', label: 'Superior', draw: true, extrude: 'cotas', face: 'top' },
  { id: 'bottom', label: 'Inferior', draw: true, extrude: 'cotas', face: 'bottom' },
  { id: 'front', label: 'Frontal', draw: true, extrude: 'length', face: 'front' },
  { id: 'back', label: 'Posterior', draw: true, extrude: 'length', face: 'back' },
  { id: 'left', label: 'Lateral izquierda', draw: true, extrude: 'length', face: 'left' },
  { id: 'right', label: 'Lateral derecha', draw: true, extrude: 'length', face: 'right' },
  { id: 'iso-ne', label: 'Isométrica NE', draw: false },
  { id: 'iso-nw', label: 'Isométrica NO', draw: false },
  { id: 'iso-se', label: 'Isométrica SE', draw: false },
  { id: 'iso-sw', label: 'Isométrica SO', draw: false },
])

/** Alias legacy: 'side' = lateral izquierda. */
export function normalizeViewId(viewId) {
  if (viewId === 'side') return 'left'
  return viewId || 'top'
}

export function isEsquema3dDrawView(viewId) {
  const id = normalizeViewId(viewId)
  const v = ESQUEMA_3D_VIEWS.find((x) => x.id === id)
  return !!(v && v.draw)
}

export function isEsquema3dIsoView(viewId) {
  return String(viewId || '').startsWith('iso-')
}

/** ¿La extrusión en esta vista pide cotas (Z) o longitud (profundidad)? */
export function extrudeModeForView(viewId) {
  const id = normalizeViewId(viewId)
  const v = ESQUEMA_3D_VIEWS.find((x) => x.id === id)
  return v?.extrude === 'length' ? 'length' : 'cotas'
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
  const id = normalizeViewId(viewId)
  const isoPitch = Math.atan(1 / Math.SQRT2) // ~35.26°
  switch (id) {
    case 'front':
      return { yaw: 0, pitch: 0 }
    case 'back':
      return { yaw: Math.PI, pitch: 0 }
    case 'left':
    case 'side':
      return { yaw: -Math.PI / 2, pitch: 0 }
    case 'right':
      return { yaw: Math.PI / 2, pitch: 0 }
    case 'bottom':
      return { yaw: 0, pitch: -Math.PI / 2 }
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
 * Proyecta un punto 3D al plano del lienzo 2D según vista o cámara órbita.
 * Las cotas son elevaciones absolutas en el eje Z (plano de comparación común).
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
  if (isEsquema3dIsoView(viewId)) {
    const angles = orbitAnglesForView(viewId)
    return projectOrbit(pt, {
      yaw: angles.yaw,
      pitch: angles.pitch,
      cotaRefM,
      center: null,
    })
  }
  const id = normalizeViewId(viewId)
  const x = Number(pt?.x) || 0
  const y = Number(pt?.y) || 0
  const zDisp = cotaToWorldZ(pt?.zCota ?? cotaRefM, cotaRefM)
  switch (id) {
    case 'front':
      // Mirando desde −Y: pantalla X = world X, pantalla Y = −Z
      return { x, y: zDisp }
    case 'back':
      // Mirando desde +Y: pantalla X = −world X, pantalla Y = −Z
      return { x: -x, y: zDisp }
    case 'left':
    case 'side':
      // Mirando desde −X: pantalla X = world Y, pantalla Y = −Z
      return { x: y, y: zDisp }
    case 'right':
      // Mirando desde +X: pantalla X = −world Y, pantalla Y = −Z
      return { x: -y, y: zDisp }
    case 'bottom':
      // Mirando desde abajo: pantalla X = world X, pantalla Y = −world Y
      return { x, y: -y }
    case 'top':
    default:
      return { x, y }
  }
}

/**
 * Cámara de proyección para sólidos.
 * Vistas de dibujo (6 caras): ortográficas puras (null) para coincidir 1:1 con el trazo 2D.
 * Isométricas / giro libre: ángulos centrados en los sólidos.
 */
export function solidsViewCamera(viewId, solids, {
  orbitFree = false,
  orbitAngles = null,
  cotaRefM = 0,
} = {}) {
  const id = normalizeViewId(viewId)
  if (!orbitFree && isEsquema3dDrawView(id)) {
    return null
  }
  const angles = (orbitAngles && Number.isFinite(orbitAngles.yaw) && Number.isFinite(orbitAngles.pitch))
    ? orbitAngles
    : orbitAnglesForView(id || 'top')
  const center = solidsOrbitCenter(solids || [], cotaRefM)
  return { ...angles, center }
}

/**
 * Metadatos del eje de profundidad / eje horizontal de una vista de perfil.
 * depthAxis: 'x' | 'y' — eje world de extrusión por longitud
 * depthSign: dirección hacia el fondo de la vista (+ entra a la escena)
 * alongAxis: eje world del “ancho” en pantalla
 */
export function viewProfileMeta(viewId) {
  const id = normalizeViewId(viewId)
  switch (id) {
    case 'front':
      return { depthAxis: 'y', depthSign: 1, alongAxis: 'x', alongSign: 1 }
    case 'back':
      return { depthAxis: 'y', depthSign: -1, alongAxis: 'x', alongSign: -1 }
    case 'left':
    case 'side':
      return { depthAxis: 'x', depthSign: 1, alongAxis: 'y', alongSign: 1 }
    case 'right':
      return { depthAxis: 'x', depthSign: -1, alongAxis: 'y', alongSign: -1 }
    default:
      return { depthAxis: 'z', depthSign: 1, alongAxis: 'x', alongSign: 1 }
  }
}

/** Eje de extrusión según la vista donde se dibujó el contorno. */
export function extrudeAxisForView(viewId) {
  const mode = extrudeModeForView(viewId)
  if (mode === 'cotas') return 'z'
  const meta = viewProfileMeta(viewId)
  return meta.depthAxis
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
