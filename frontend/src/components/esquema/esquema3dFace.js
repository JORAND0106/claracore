/**
 * Caras de sólidos para dibujo estilo SketchUp:
 * - pick de la cara más cercana a la cámara (nunca la de atrás)
 * - OSNAP solo de esa cara
 * - resaltado y plano de dibujo (viewPlane + faceDepthWorld / zCota)
 */
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import {
  canvasToWorldOnViewPlane,
  intersectOrbitRayWithFacePlane,
  isEsquema3dDrawView,
  isEsquema3dIsoView,
  normalizeViewId,
  orbitAnglesForView,
  projectWorld3dToCanvas,
  viewProfileMeta,
} from './esquema3dViews.js'

/** Bounds AABB world de un sólido (XY px + cotas m). */
export function solidAabb3d(solid) {
  if (!solid?.cells?.length) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const cell of solid.cells) {
    minZ = Math.min(minZ, Number(cell.z0) || 0, Number(cell.z1) || 0)
    maxZ = Math.max(maxZ, Number(cell.z0) || 0, Number(cell.z1) || 0)
    for (const p of cell.ring || []) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/**
 * Seis caras AABB del sólido.
 * faceId: front|back|left|right|top|bottom
 * depthWorld: valor del eje de profundidad (Y/X) o zCota para top/bottom
 * viewPlane: vista ortográfica alineada con la cara (para extruir)
 */
export function solidFaceDescriptors(solid) {
  const bb = solidAabb3d(solid)
  if (!bb) return []
  const { minX, maxX, minY, maxY, minZ, maxZ } = bb
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  return [
    {
      faceId: 'front',
      solidId: solid.id,
      viewPlane: 'front',
      depthWorld: minY,
      normal: { x: 0, y: -1, z: 0 },
      center: { x: cx, y: minY, zCota: cz },
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: maxZ },
        { x: minX, y: minY, zCota: maxZ },
      ],
      area: Math.abs(maxX - minX) * metersToWorld(Math.abs(maxZ - minZ)),
    },
    {
      faceId: 'back',
      solidId: solid.id,
      viewPlane: 'back',
      depthWorld: maxY,
      normal: { x: 0, y: 1, z: 0 },
      center: { x: cx, y: maxY, zCota: cz },
      corners: [
        { x: minX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: minX, y: maxY, zCota: maxZ },
      ],
      area: Math.abs(maxX - minX) * metersToWorld(Math.abs(maxZ - minZ)),
    },
    {
      faceId: 'left',
      solidId: solid.id,
      viewPlane: 'left',
      depthWorld: minX,
      normal: { x: -1, y: 0, z: 0 },
      center: { x: minX, y: cy, zCota: cz },
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: minX, y: maxY, zCota: minZ },
        { x: minX, y: maxY, zCota: maxZ },
        { x: minX, y: minY, zCota: maxZ },
      ],
      area: Math.abs(maxY - minY) * metersToWorld(Math.abs(maxZ - minZ)),
    },
    {
      faceId: 'right',
      solidId: solid.id,
      viewPlane: 'right',
      depthWorld: maxX,
      normal: { x: 1, y: 0, z: 0 },
      center: { x: maxX, y: cy, zCota: cz },
      corners: [
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: maxX, y: minY, zCota: maxZ },
      ],
      area: Math.abs(maxY - minY) * metersToWorld(Math.abs(maxZ - minZ)),
    },
    {
      faceId: 'top',
      solidId: solid.id,
      viewPlane: 'top',
      depthWorld: 0,
      zCota: maxZ,
      normal: { x: 0, y: 0, z: 1 },
      center: { x: cx, y: cy, zCota: maxZ },
      corners: [
        { x: minX, y: minY, zCota: maxZ },
        { x: maxX, y: minY, zCota: maxZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: minX, y: maxY, zCota: maxZ },
      ],
      area: Math.abs(maxX - minX) * Math.abs(maxY - minY),
    },
    {
      faceId: 'bottom',
      solidId: solid.id,
      viewPlane: 'bottom',
      depthWorld: 0,
      zCota: minZ,
      normal: { x: 0, y: 0, z: -1 },
      center: { x: cx, y: cy, zCota: minZ },
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: minX, y: maxY, zCota: minZ },
      ],
      area: Math.abs(maxX - minX) * Math.abs(maxY - minY),
    },
  ]
}

/** Cara canónica que mira a la cámara en una vista ortográfica de dibujo. */
export function cameraFacingFaceId(viewId) {
  const id = normalizeViewId(viewId)
  switch (id) {
    case 'front': return 'front'
    case 'back': return 'back'
    case 'left':
    case 'side': return 'left'
    case 'right': return 'right'
    case 'bottom': return 'bottom'
    case 'top':
    default: return 'top'
  }
}

/** ¿La cara mira hacia la cámara en esta vista ortográfica? */
export function faceFacesCamera(faceId, viewId) {
  return faceId === cameraFacingFaceId(viewId)
}

function pointInProjectedQuad(pt, corners2d, pad = 2) {
  if (!corners2d?.length) return false
  const xs = corners2d.map((p) => p.x)
  const ys = corners2d.map((p) => p.y)
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad
  return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY
}

function avgDepth(corners2d) {
  if (!corners2d?.length) return 0
  return corners2d.reduce((s, p) => s + (Number(p.depth) || 0), 0) / corners2d.length
}

/**
 * Elige la cara bajo el cursor: la más cercana a la cámara (mayor depth hacia el viewer).
 * En vistas ortográficas solo considera la cara que mira a quien mira (nunca la de atrás).
 * En iso/órbita considera las 6 caras y elige la de mayor depth de proyección.
 *
 * @returns {object|null} face descriptor + canvasCorners + solid
 */
export function pickNearestFaceUnderCursor(solids, canvasPt, viewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  const vid = normalizeViewId(viewId)
  const ortho = !orbit && !isEsquema3dIsoView(vid)
  const facing = ortho ? cameraFacingFaceId(vid) : null
  let best = null
  let bestScore = -Infinity

  for (const solid of solids || []) {
    if (solid?.type !== 'solid3d') continue
    const faces = solidFaceDescriptors(solid)
    for (const face of faces) {
      if (facing && face.faceId !== facing) continue
      const canvasCorners = face.corners.map((p) => (
        projectWorld3dToCanvas(p, vid, cotaRefM, orbit)
      ))
      if (!pointInProjectedQuad(canvasPt, canvasCorners)) continue
      let score
      if (orbit || isEsquema3dIsoView(vid)) {
        // Mayor depth de projectOrbit = más cerca del viewer.
        score = avgDepth(canvasCorners)
      } else {
        // Ortho: solo caras que miran; más cercano = frente del conjunto.
        score = orthoNearScore(face, vid) * 1e6 - face.area
      }
      if (score > bestScore) {
        bestScore = score
        best = {
          ...face,
          solid,
          canvasCorners,
          pickDepth: score,
        }
      }
    }
  }
  return best
}

/** Score de cercanía en vista ortográfica (mayor = más cerca de quien mira). */
function orthoNearScore(face, viewId) {
  switch (cameraFacingFaceId(viewId)) {
    case 'front': return -face.depthWorld
    case 'back': return face.depthWorld
    case 'left': return -face.depthWorld
    case 'right': return face.depthWorld
    case 'top': return Number(face.zCota) || 0
    case 'bottom': return -(Number(face.zCota) || 0)
    default: return 0
  }
}

/**
 * OSNAP solo de una cara (esquinas, medios, centro).
 * Evita enganchar vértices de la cara opuesta (misma proyección en vistas planas).
 */
export function faceOsnapPoints(face, viewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  if (!face?.corners?.length) return []
  const vid = normalizeViewId(viewId || face.viewPlane || 'top')
  const pts3d = [...face.corners]
  for (let i = 0; i < face.corners.length; i += 1) {
    const a = face.corners[i]
    const b = face.corners[(i + 1) % face.corners.length]
    pts3d.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      zCota: (a.zCota + b.zCota) / 2,
    })
  }
  pts3d.push(face.center)
  const kinds = [
    ...face.corners.map(() => 'corner'),
    ...face.corners.map(() => 'mid'),
    'center',
  ]
  return pts3d.map((p, i) => {
    const c = projectWorld3dToCanvas(p, vid, cotaRefM, orbit)
    return {
      x: c.x,
      y: c.y,
      kind: kinds[i] || 'end',
      solidId: face.solidId,
      faceId: face.faceId,
      world: { x: p.x, y: p.y, zCota: p.zCota },
      faceDepthWorld: face.depthWorld,
      viewPlane: face.viewPlane,
      zCota: face.zCota,
    }
  })
}

/**
 * Metadatos de dibujo/extrusión a partir de la cara elegida.
 * top/bottom → cotas (z); laterales → length + faceDepthWorld.
 */
export function faceDrawMeta(face) {
  if (!face) {
    return {
      viewPlane: 'top',
      faceDepthWorld: 0,
      extrudeMode: 'cotas',
      zCota: null,
    }
  }
  if (face.faceId === 'top' || face.faceId === 'bottom') {
    return {
      viewPlane: face.viewPlane,
      faceDepthWorld: 0,
      extrudeMode: 'cotas',
      zCota: face.zCota,
      faceId: face.faceId,
      solidId: face.solidId,
      normal: face.normal,
    }
  }
  return {
    viewPlane: face.viewPlane,
    faceDepthWorld: face.depthWorld,
    extrudeMode: 'length',
    zCota: null,
    faceId: face.faceId,
    solidId: face.solidId,
    normal: face.normal,
  }
}

/**
 * Cota de referencia más baja del esquema (plano de suelo si no hay cara).
 */
export function solidsMinCota(solids) {
  let z = Infinity
  for (const s of solids || []) {
    for (const c of s?.cells || []) {
      z = Math.min(z, Number(c.z0) || 0, Number(c.z1) || 0)
    }
  }
  return Number.isFinite(z) ? z : 0
}

/**
 * Dibuja el resaltado de la cara (relleno semitransparente + borde).
 */
export function drawFaceHighlight(ctx, face, {
  viewId = 'top',
  orbit = null,
  cotaRefM = 0,
  fill = 'rgba(37, 99, 235, 0.28)',
  stroke = '#2563eb',
} = {}) {
  if (!ctx || !face?.corners?.length) return
  const vid = normalizeViewId(viewId)
  const pts = face.corners.map((p) => projectWorld3dToCanvas(p, vid, cotaRefM, orbit))
  if (pts.length < 3) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.6
  ctx.setLineDash([])
  ctx.stroke()
  ctx.restore()
}

/**
 * Dirección de extrusión (signo) desde la cara: hacia afuera = +1 en depthSign de la vista.
 * Para top: hacia arriba = cota superior mayor.
 */
export function extrudeDirectionFromFace(face, outward = true) {
  if (!face) return { axis: 'z', sign: outward ? 1 : -1 }
  if (face.faceId === 'top') return { axis: 'z', sign: outward ? 1 : -1 }
  if (face.faceId === 'bottom') return { axis: 'z', sign: outward ? -1 : 1 }
  const meta = viewProfileMeta(face.viewPlane)
  // depthSign entra a la escena; hacia afuera = opuesto a depthSign de la vista de la cara?
  // Cara front (minY): afuera = −Y = no entra; depthSign front = +1 (entra +Y).
  // Hacia adentro del sólido desde la cara front = +Y = depthSign.
  // Hacia afuera = − depthSign relativo al anclaje.
  // Convención del producto: arrastrar hacia adentro = length positivo desde faceDepth.
  // faceDepth = cara; length crece en depthSign → entra al sólido si la cara es la frontal.
  return {
    axis: meta.depthAxis,
    sign: outward ? -meta.depthSign : meta.depthSign,
    viewPlane: face.viewPlane,
    faceDepthWorld: face.depthWorld,
  }
}

export function faceThicknessM(face, solid) {
  const bb = solidAabb3d(solid || face?.solid)
  if (!bb || !face) return 0
  if (face.faceId === 'front' || face.faceId === 'back') {
    return worldToMeters(bb.maxY - bb.minY)
  }
  if (face.faceId === 'left' || face.faceId === 'right') {
    return worldToMeters(bb.maxX - bb.minX)
  }
  return Math.abs(bb.maxZ - bb.minZ)
}

/**
 * Plano de suelo (cota más baja) cuando el cursor no toca ningún sólido.
 */
export function referenceFloorFace(zCota = 0) {
  const z = Number.isFinite(Number(zCota)) ? Number(zCota) : 0
  return {
    faceId: 'top',
    solidId: null,
    viewPlane: 'top',
    depthWorld: 0,
    zCota: z,
    normal: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, zCota: z },
    corners: [],
    area: Infinity,
    isFloor: true,
  }
}

/**
 * Convierte un punto de lienzo (vista actual / órbita) a coords del plano de la cara
 * (las mismas que usa extrudeClosedEntity / projectEntityToView).
 */
export function canvasToFacePlaneCoords(canvasPt, face, viewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  if (!canvasPt || !face) return canvasPt
  const vid = normalizeViewId(viewId)
  const plane = normalizeViewId(face.viewPlane || 'top')
  const useOrbit = orbit && Number.isFinite(orbit.yaw) && Number.isFinite(orbit.pitch)
  // Vista ortográfica alineada con la cara: el lienzo ya es el plano.
  if (!useOrbit && isEsquema3dDrawView(vid) && vid === plane) {
    return { x: canvasPt.x, y: canvasPt.y }
  }
  let world = null
  if (useOrbit || isEsquema3dIsoView(vid)) {
    const orb = useOrbit
      ? orbit
      : { ...orbitAnglesForView(vid), center: orbit?.center || null }
    world = intersectOrbitRayWithFacePlane(canvasPt, orb, face, cotaRefM)
  } else {
    // Otra cara ortográfica: anclar a profundidad de la cara tocada.
    world = canvasToWorldOnViewPlane(canvasPt, vid, {
      faceDepthWorld: face.depthWorld,
      cotaRefM,
      zCota: face.zCota,
    })
    // Forzar el plano de la cara elegida (no el de la vista).
    if (face.faceId === 'front' || face.faceId === 'back') {
      world = { ...world, y: face.depthWorld }
    } else if (face.faceId === 'left' || face.faceId === 'right') {
      world = { ...world, x: face.depthWorld }
    } else if (face.faceId === 'top' || face.faceId === 'bottom') {
      world = { ...world, zCota: face.zCota }
    }
  }
  if (!world) return { x: canvasPt.x, y: canvasPt.y }
  const onPlane = projectWorld3dToCanvas(world, plane, cotaRefM, null)
  return { x: onPlane.x, y: onPlane.y }
}

/**
 * OSNAP de cara + centros de círculos/elipses del sólido que yacen en esa cara.
 */
export function faceOsnapPointsWithCircles(face, solid, viewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  const base = faceOsnapPoints(face, viewId, { orbit, cotaRefM })
  if (!solid?.cells?.length || !face) return base
  const out = [...base]
  const eps = metersToWorld(0.02)
  const onFace = (pt) => {
    if (face.faceId === 'front' || face.faceId === 'back') {
      return Math.abs(pt.y - face.depthWorld) <= eps
    }
    if (face.faceId === 'left' || face.faceId === 'right') {
      return Math.abs(pt.x - face.depthWorld) <= eps
    }
    return Math.abs(pt.zCota - (Number(face.zCota) || 0)) <= 0.02
  }
  for (const cell of solid.cells) {
    if (cell.analytic?.type !== 'ellipse') continue
    const ring = cell.ring || []
    if (!ring.length) continue
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length
    const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length
    const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
    for (const zCota of [z0, z1, (z0 + z1) / 2]) {
      const pt = { x: cx, y: cy, zCota }
      if (!onFace(pt)) continue
      const c = projectWorld3dToCanvas(pt, normalizeViewId(viewId), cotaRefM, orbit)
      out.push({
        x: c.x,
        y: c.y,
        kind: 'center',
        solidId: face.solidId,
        faceId: face.faceId,
        world: pt,
        faceDepthWorld: face.depthWorld,
        viewPlane: face.viewPlane,
        zCota: face.zCota,
      })
    }
  }
  return out
}

/**
 * Resuelve la cara de dibujo bajo el cursor (o el suelo de referencia).
 */
export function resolveDrawFace(solids, canvasPt, viewId, {
  orbit = null,
  cotaRefM = 0,
} = {}) {
  const hit = pickNearestFaceUnderCursor(solids, canvasPt, viewId, { orbit, cotaRefM })
  if (hit) return hit
  return referenceFloorFace(solidsMinCota(solids))
}

/** World 3D del punto de lienzo anclado a la cara. */
export function canvasHitWorldOnFace(canvasPt, face, viewId, opts = {}) {
  const plane = canvasToFacePlaneCoords(canvasPt, face, viewId, opts)
  return canvasToWorldOnViewPlane(plane, face.viewPlane || 'top', {
    faceDepthWorld: face.depthWorld,
    cotaRefM: opts.cotaRefM || 0,
    zCota: face.zCota,
  })
}
