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

/** Vistas donde se puede dibujar sobre caras: 6 caras + isométricas (estilo SketchUp). */
export function isEsquema3dSketchView(viewId) {
  const id = normalizeViewId(viewId)
  return isEsquema3dDrawView(id) || isEsquema3dIsoView(id)
}

/**
 * Punto de un rayo ortográfico de órbita/iso a una profundidad `t` (eje de cámara).
 * Inversa de projectOrbit.
 */
export function unprojectOrbitAtDepth(canvasPt, {
  yaw = 0,
  pitch = Math.PI / 2,
  cotaRefM = 0,
  center = null,
  depth = 0,
} = {}) {
  const cx = Number(center?.x) || 0
  const cy = Number(center?.y) || 0
  const cz = Number(center?.zCota) || cotaRefM || 0
  const sx = (Number(canvasPt?.x) || 0) - cx
  const sy = (Number(canvasPt?.y) || 0) - cy
  const t = Number(depth) || 0
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const x1 = sx
  const y1 = sy * sinP + t * cosP
  const z1 = -sy * cosP + t * sinP
  const x0 = x1 * cosY + y1 * sinY
  const y0 = -x1 * sinY + y1 * cosY
  return {
    x: x0 + cx,
    y: y0 + cy,
    zCota: cz + z1 / PX_PER_METER,
  }
}

/**
 * Intersecta el rayo órbita/iso del punto de lienzo con un plano de cara AABB.
 * plane: { faceId|axis, depthWorld?, zCota? }
 */
export function intersectOrbitRayWithFacePlane(canvasPt, orbit, plane, cotaRefM = 0) {
  if (!orbit || !Number.isFinite(orbit.yaw) || !Number.isFinite(orbit.pitch)) return null
  const faceId = plane?.faceId || plane?.axis || 'top'
  // Dos muestras de profundidad → recta; resolver t en el plano.
  const p0 = unprojectOrbitAtDepth(canvasPt, { ...orbit, cotaRefM, depth: 0 })
  const p1 = unprojectOrbitAtDepth(canvasPt, { ...orbit, cotaRefM, depth: PX_PER_METER })
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const dz = p1.zCota - p0.zCota
  let t
  if (faceId === 'front' || faceId === 'back') {
    if (Math.abs(dy) < 1e-12) return null
    t = ((Number(plane.depthWorld) || 0) - p0.y) / dy
  } else if (faceId === 'left' || faceId === 'right' || faceId === 'side') {
    if (Math.abs(dx) < 1e-12) return null
    t = ((Number(plane.depthWorld) || 0) - p0.x) / dx
  } else {
    // top / bottom / suelo
    if (Math.abs(dz) < 1e-12) return null
    const zTarget = Number.isFinite(Number(plane.zCota)) ? Number(plane.zCota) : (cotaRefM || 0)
    t = (zTarget - p0.zCota) / dz
  }
  return {
    x: p0.x + t * dx,
    y: p0.y + t * dy,
    zCota: p0.zCota + t * dz,
  }
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

/**
 * Profundidad world (eje de la vista) a usar al dibujar/extruir en un plano de cara.
 * front/back → Y; left/right → X; top/bottom → 0 (cota va en Z).
 */
export function depthAxisValueFromWorld(pt, viewId) {
  const id = normalizeViewId(viewId)
  const x = Number(pt?.x) || 0
  const y = Number(pt?.y) || 0
  switch (id) {
    case 'front':
    case 'back':
      return y
    case 'left':
    case 'side':
    case 'right':
      return x
    default:
      return 0
  }
}

/**
 * Punto de lienzo (vista de cara) → world 3D anclado a una profundidad de cara.
 * top/bottom: (x,y) planta; zCota = cotaRef o la indicada.
 * perfiles: pantalla X/Y → along + cota; profundidad = faceDepthWorld.
 */
export function canvasToWorldOnViewPlane(canvasPt, viewId, {
  faceDepthWorld = 0,
  cotaRefM = 0,
  zCota = null,
} = {}) {
  const id = normalizeViewId(viewId)
  const cx = Number(canvasPt?.x) || 0
  const cy = Number(canvasPt?.y) || 0
  const depth = Number(faceDepthWorld) || 0
  const meta = viewProfileMeta(id)
  switch (id) {
    case 'front':
      return { x: cx, y: depth, zCota: worldZToCota(cy, cotaRefM) }
    case 'back':
      return { x: -cx, y: depth, zCota: worldZToCota(cy, cotaRefM) }
    case 'left':
    case 'side':
      return { x: depth, y: cx, zCota: worldZToCota(cy, cotaRefM) }
    case 'right':
      return { x: depth, y: -cx, zCota: worldZToCota(cy, cotaRefM) }
    case 'bottom':
      return {
        x: cx,
        y: -cy,
        zCota: zCota != null && Number.isFinite(Number(zCota)) ? Number(zCota) : cotaRefM,
      }
    case 'top':
    default:
      return {
        x: cx,
        y: cy,
        zCota: zCota != null && Number.isFinite(Number(zCota)) ? Number(zCota) : cotaRefM,
      }
  }
  void meta
}

/**
 * Delta de arrastre en lienzo → traslación world (dx, dy, dzCota).
 * Vistas de cara: se mueve en el plano de la vista (sin cambiar profundidad).
 * Iso / órbita: movimiento en planta (cotas fijas), como hoy.
 */
export function canvasDeltaToWorldMove(dxCanvas, dyCanvas, viewId) {
  const id = normalizeViewId(viewId)
  const dx = Number(dxCanvas) || 0
  const dy = Number(dyCanvas) || 0
  switch (id) {
    case 'front':
      return { dx, dy: 0, dzCota: worldZToCota(dy, 0) - worldZToCota(0, 0) }
    case 'back':
      return { dx: -dx, dy: 0, dzCota: worldZToCota(dy, 0) - worldZToCota(0, 0) }
    case 'left':
    case 'side':
      return { dx: 0, dy: dx, dzCota: worldZToCota(dy, 0) - worldZToCota(0, 0) }
    case 'right':
      return { dx: 0, dy: -dx, dzCota: worldZToCota(dy, 0) - worldZToCota(0, 0) }
    case 'bottom':
      return { dx, dy: -dy, dzCota: 0 }
    case 'top':
    default:
      // Incluye isométricas: movimiento en planta.
      return { dx, dy, dzCota: 0 }
  }
}

/**
 * ¿La entidad 2D está anclada a un plano de perfil 3D (necesita remapeo entre vistas)?
 */
export function entityNeedsViewRemap(entity, targetViewId, { orbit = null } = {}) {
  if (!entity) return false
  const src = normalizeViewId(entity.viewPlane || 'top')
  const dst = normalizeViewId(targetViewId)
  // Giro libre / órbita: todo el 2D se proyecta al espacio 3D (no queda plano en pantalla).
  if (orbit && Number.isFinite(orbit.yaw)) return true
  // Isométricas: planta y perfiles se proyectan con cota/profundidad.
  if (isEsquema3dIsoView(dst)) return true
  if (src === dst) return false
  // Contornos de perfil siempre se remapean al cambiar de cara.
  if (extrudeModeForView(src) === 'length') return true
  // Planta ↔ inferior: invertir Y
  if ((src === 'top' && dst === 'bottom') || (src === 'bottom' && dst === 'top')) return true
  return false
}

/** Extrae puntos de control de una entidad 2D (rect/elipse/polilínea/…). */
export function entityControlPoints(entity) {
  if (!entity) return []
  if (Array.isArray(entity.points) && entity.points.length) {
    return entity.points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }))
  }
  if (
    Number.isFinite(entity.x1) && Number.isFinite(entity.y1)
    && Number.isFinite(entity.x2) && Number.isFinite(entity.y2)
  ) {
    return [
      { x: entity.x1, y: entity.y1 },
      { x: entity.x2, y: entity.y1 },
      { x: entity.x2, y: entity.y2 },
      { x: entity.x1, y: entity.y2 },
    ]
  }
  return []
}

/**
 * Remapea una entidad dibujada en `viewPlane` al lienzo de `targetViewId`
 * (mismo espacio 3D: world XY + cota). Conserva id/tipo; solo adapta coords.
 */
export function projectEntityToView(entity, targetViewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  if (!entity) return entity
  const src = normalizeViewId(entity.viewPlane || 'top')
  const dst = normalizeViewId(targetViewId)
  if (!entityNeedsViewRemap(entity, dst, { orbit })) return entity

  const depth = Number.isFinite(Number(entity.viewDepthWorld))
    ? Number(entity.viewDepthWorld)
    : 0
  const zHint = Number.isFinite(Number(entity.viewZCota))
    ? Number(entity.viewZCota)
    : null

  const mapPt = (pt) => {
    const world = canvasToWorldOnViewPlane(pt, src, {
      faceDepthWorld: depth,
      cotaRefM,
      zCota: zHint,
    })
    return projectWorld3dToCanvas(world, dst, cotaRefM, orbit)
  }

  const next = { ...entity, _projectedFrom: src }
  if (Array.isArray(entity.points) && entity.points.length) {
    next.points = entity.points.map((p) => {
      const q = mapPt(p)
      return { ...p, x: q.x, y: q.y }
    })
  }
  if (
    Number.isFinite(entity.x1) && Number.isFinite(entity.y1)
    && Number.isFinite(entity.x2) && Number.isFinite(entity.y2)
  ) {
    const a = mapPt({ x: entity.x1, y: entity.y1 })
    const b = mapPt({ x: entity.x2, y: entity.y2 })
    // Para rect/elipse el AABB proyectado puede rotar en iso: usar extremos.
    next.x1 = Math.min(a.x, b.x)
    next.y1 = Math.min(a.y, b.y)
    next.x2 = Math.max(a.x, b.x)
    next.y2 = Math.max(a.y, b.y)
    if (isEsquema3dIsoView(dst) || orbit) {
      // En iso el AABB no basta para el contorno real: preferir polilínea.
      const corners = [
        { x: entity.x1, y: entity.y1 },
        { x: entity.x2, y: entity.y1 },
        { x: entity.x2, y: entity.y2 },
        { x: entity.x1, y: entity.y2 },
      ].map(mapPt)
      next.points = corners
      if (entity.type === 'rect' || entity.type === 'elipse') {
        // Mantener tipo; drawObject usa x1/y1/x2/y2. Ajustar bbox.
        next.x1 = Math.min(...corners.map((p) => p.x))
        next.y1 = Math.min(...corners.map((p) => p.y))
        next.x2 = Math.max(...corners.map((p) => p.x))
        next.y2 = Math.max(...corners.map((p) => p.y))
      }
    }
  }
  return next
}

/**
 * Aplica un delta world (dx, dy, dzCota) a una entidad 2D en su viewPlane nativo.
 * Usado al mover el sólido ligado en otra vista (p. ej. iso).
 */
export function applyWorldDeltaToEntity(entity, { dx = 0, dy = 0, dzCota = 0 } = {}) {
  if (!entity) return entity
  const plane = normalizeViewId(entity.viewPlane || 'top')
  const ddx = Number(dx) || 0
  const ddy = Number(dy) || 0
  const ddz = Number(dzCota) || 0
  if (!ddx && !ddy && !ddz) return entity

  const next = { ...entity }
  if (extrudeModeForView(plane) === 'cotas') {
    const sx = ddx
    const sy = plane === 'bottom' ? -ddy : ddy
    if (Array.isArray(next.points)) {
      next.points = next.points.map((p) => ({ ...p, x: p.x + sx, y: p.y + sy }))
    }
    if (Number.isFinite(next.x1)) {
      next.x1 += sx
      next.x2 += sx
      next.y1 += sy
      next.y2 += sy
    }
    return next
  }

  // Perfil: canvas X = along (con signo), canvas Y = cotaToWorldZ.
  const meta = viewProfileMeta(plane)
  let dCanvasX = 0
  if (meta.alongAxis === 'x') {
    // front: canvasX = x → +dx; back: canvasX = -x → -dx
    dCanvasX = meta.alongSign * ddx
  } else {
    // left: canvasX = y → +dy; right: canvasX = -y → -dy
    dCanvasX = meta.alongSign * ddy
  }
  const dCanvasY = cotaToWorldZ(ddz, 0) - cotaToWorldZ(0, 0) // = -PPM*ddz
  if (Array.isArray(next.points)) {
    next.points = next.points.map((p) => ({
      ...p,
      x: p.x + dCanvasX,
      y: p.y + dCanvasY,
    }))
  }
  if (Number.isFinite(next.x1)) {
    next.x1 += dCanvasX
    next.x2 += dCanvasX
    next.y1 += dCanvasY
    next.y2 += dCanvasY
  }
  // Profundidad de cara sigue al movimiento perpendicular al plano.
  const prevDepth = Number.isFinite(Number(next.viewDepthWorld)) ? Number(next.viewDepthWorld) : 0
  if (meta.depthAxis === 'y') next.viewDepthWorld = prevDepth + ddy
  else if (meta.depthAxis === 'x') next.viewDepthWorld = prevDepth + ddx
  return next
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
