/**
 * Sólidos 3D del esquema: extrusiones verticales/horizontales por cotas o longitud,
 * booleanos (unir / sustraer) y corte. Volumen en m³ exacto para prismas y cilindros.
 */
import polygonClipping from 'polygon-clipping'
import {
  PX_PER_METER,
  closedEntityAreaM2,
  ellipseCenterRadii,
  metersToWorld,
  objectLocalPoint,
  objectWorldPoint,
  polygonAreaM2,
  triangleLocalVertices,
  worldToMeters,
} from './esquemaGeometry.js'
import { extrudeAxisForView } from './esquema3dViews.js'

const CIRCLE_SEGMENTS = 96

function uid() {
  return `s3d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function ringAreaM2(ring) {
  return polygonAreaM2(ring || [])
}

function cellAreaM2(cell) {
  if (!cell) return 0
  if (cell.analytic?.type === 'rect') {
    const w = Math.abs(cell.analytic.wM)
    const h = Math.abs(cell.analytic.hM)
    return w * h
  }
  if (cell.analytic?.type === 'ellipse') {
    return Math.PI * Math.abs(cell.analytic.rxM) * Math.abs(cell.analytic.ryM)
  }
  if (cell.analytic?.type === 'triangle') {
    return 0.5 * Math.abs(cell.analytic.baseM) * Math.abs(cell.analytic.heightM)
  }
  let a = ringAreaM2(cell.ring)
  for (const hole of cell.holes || []) a -= ringAreaM2(hole)
  return Math.max(0, a)
}

function cellHeightM(cell) {
  return Math.abs((Number(cell?.z1) || 0) - (Number(cell?.z0) || 0))
}

/** Volumen de una celda prisma (m³). */
export function solidCellVolumeM3(cell) {
  return cellAreaM2(cell) * cellHeightM(cell)
}

/** Volumen total de un sólido (m³). */
export function solidVolumeM3(solid) {
  if (!solid?.cells?.length) return 0
  return solid.cells.reduce((s, c) => s + solidCellVolumeM3(c), 0)
}

export function formatVolumeM3(m3, digits = 2) {
  const n = Number(m3)
  if (!Number.isFinite(n)) return ''
  return `${n.toFixed(digits)} m³`
}

function closeRing(pts) {
  const ring = (pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (ring.length < 3) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) {
    return [...ring, { x: first.x, y: first.y }]
  }
  return ring
}

function ringToClipping(ring) {
  const closed = closeRing(ring)
  if (!closed) return null
  // polygon-clipping: [ [ [x,y], ... ] ]  (outer); holes as extra rings
  return closed.map((p) => [p.x, p.y])
}

function clippingToRing(coords) {
  if (!Array.isArray(coords) || !coords.length) return []
  const out = []
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    const x = Number(pt[0])
    const y = Number(pt[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({ x, y })
  }
  return out
}

/** Sample elipse/círculo a polígono world (incluye rotación de la entidad). */
export function ellipseEntityToRing(obj, segments = CIRCLE_SEGMENTS) {
  const { cx, cy, rx, ry } = ellipseCenterRadii(obj)
  const n = Math.max(12, Math.floor(segments))
  const pts = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2
    const local = { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry }
    pts.push(objectWorldPoint(obj, local))
  }
  return pts
}

export function rectEntityToRing(obj) {
  const corners = [
    { x: obj.x1, y: obj.y1 },
    { x: obj.x2, y: obj.y1 },
    { x: obj.x2, y: obj.y2 },
    { x: obj.x1, y: obj.y2 },
  ]
  return corners.map((c) => objectWorldPoint(obj, c))
}

export function triangleEntityToRing(obj) {
  return triangleLocalVertices(obj).map((c) => objectWorldPoint(obj, c))
}

export function polylineEntityToRing(obj) {
  const pts = (obj.points || []).map((p) => objectWorldPoint(obj, p))
  if (pts.length < 3) return null
  return pts
}

/**
 * Contorno cerrado world XY desde una entidad 2D del lienzo.
 * @returns {{ ring: Array<{x,y}>, analytic: object|null } | null}
 */
export function closedEntityToContour(obj) {
  if (!obj) return null
  if (obj.type === 'rect') {
    const wM = worldToMeters(Math.abs(obj.x2 - obj.x1))
    const hM = worldToMeters(Math.abs(obj.y2 - obj.y1))
    return {
      ring: rectEntityToRing(obj),
      analytic: { type: 'rect', wM, hM },
    }
  }
  if (obj.type === 'elipse') {
    const { rx, ry } = ellipseCenterRadii(obj)
    return {
      ring: ellipseEntityToRing(obj),
      analytic: {
        type: 'ellipse',
        rxM: worldToMeters(rx),
        ryM: worldToMeters(ry),
      },
    }
  }
  if (obj.type === 'triangulo') {
    const baseM = worldToMeters(Math.abs(obj.x2 - obj.x1))
    const heightM = worldToMeters(Math.abs(obj.y2 - obj.y1))
    return {
      ring: triangleEntityToRing(obj),
      analytic: { type: 'triangle', baseM, heightM },
    }
  }
  if (obj.type === 'polilinea' || obj.type === 'stroke') {
    const ring = polylineEntityToRing(obj)
    if (!ring || ring.length < 3) return null
    return { ring, analytic: null }
  }
  return null
}

/**
 * Valida cotas: superior > inferior.
 * @returns {{ ok: true, z0: number, z1: number } | { ok: false, error: string }}
 */
export function validateCotas(cotaSuperior, cotaInferior) {
  const z1 = Number(cotaSuperior)
  const z0 = Number(cotaInferior)
  if (!Number.isFinite(z1) || !Number.isFinite(z0)) {
    return { ok: false, error: 'Indique cota superior e inferior numéricas.' }
  }
  if (!(z1 > z0)) {
    return { ok: false, error: 'La cota superior debe ser mayor que la inferior.' }
  }
  return { ok: true, z0, z1 }
}

export function validateExtrudeLengthM(lengthM) {
  const L = Number(lengthM)
  if (!Number.isFinite(L) || !(L > 0)) {
    return { ok: false, error: 'Indique una longitud de extrusión mayor que cero.' }
  }
  return { ok: true, lengthM: L }
}

/**
 * Extruir contorno cerrado.
 * - Vista superior: entre cotaSuperior y cotaInferior (metros).
 * - Frontal/lateral: longitud en metros a lo largo del eje de extrusión.
 */
export function extrudeClosedEntity(obj, {
  viewId = 'top',
  cotaSuperior,
  cotaInferior,
  lengthM,
  color,
  id,
} = {}) {
  const contour = closedEntityToContour(obj)
  if (!contour?.ring?.length) return { ok: false, error: 'Seleccione un contorno cerrado.' }

  const axis = extrudeAxisForView(viewId)
  let z0
  let z1
  let ring = contour.ring
  let analytic = contour.analytic

  if (axis === 'z') {
    const v = validateCotas(cotaSuperior, cotaInferior)
    if (!v.ok) return v
    z0 = v.z0
    z1 = v.z1
  } else {
    const v = validateExtrudeLengthM(lengthM)
    if (!v.ok) return v
    // Contorno dibujado en plano de perfil: puntos del lienzo son (x,z) o (y,z).
    // Interpretamos obj coords como ya en world del plano activo; extrusión ortogonal.
    // Convención: z0/z1 almacenan el intervalo a lo largo del eje de extrusión en METROS
    // relativos (0 .. length), y el ring permanece en el plano del contorno proyectado a XY
    // de trabajo del sólido usando ejes canónicos:
    //  - front (eje Y): ring (x, z_world) → XY solid (x, 0) con extrusión Y
    // Para unificar render, convertimos a sólido "vertical" en Z solo cuando axis=z.
    // Para front/side guardamos axis + length y un ring 2D en el plano del contorno.
    z0 = 0
    z1 = v.lengthM
    analytic = null // tras remap, usar área del ring
  }

  const solid = {
    type: 'solid3d',
    id: id || uid(),
    color: color || undefined,
    extrudeAxis: axis,
    viewPlane: viewId === 'front' || viewId === 'side' ? viewId : 'top',
    cells: [{
      ring: closeRing(ring)?.slice(0, -1) || ring,
      holes: [],
      z0,
      z1,
      analytic: axis === 'z' ? analytic : null,
    }],
  }

  // Remap frontal/lateral: el contorno en canvas está en ejes de perfil.
  if (axis === 'y' || axis === 'x') {
    solid.cells = [{
      ring: remapProfileRingToXy(ring, viewId),
      holes: [],
      z0,
      z1,
      analytic: null,
      profileView: viewId,
    }]
    // Para volumen, el "z" interval es la longitud de extrusión (metros) y el ring
    // está en el plano perpendicular → área * length.
  }

  solid.volumeM3 = solidVolumeM3(solid)
  return { ok: true, solid }
}

/**
 * Contorno en vista frontal: canvas (x, zDisplay) donde zDisplay = cotaToWorldZ.
 * Lo convertimos a ring XY con y=0 (línea en X), extrusión en Y.
 * Vista lateral: canvas (y, z) → ring con x=0.
 *
 * Para volumen solo importa el área 2D del contorno en su plano × longitud.
 * Guardamos el ring en coordenadas del plano de perfil mapeadas a XY artificial:
 * front: (canvasX, canvasY_as_Zworld) stored as (x, y) where y represents Z world units
 * and extrudeAxis length is in meters along Y — volume = area(ring in m² of x-z) * length.
 *
 * Simplificación robusta: ring en metros del plano del contorno (convertido desde world px),
 * z0/z1 = 0..lengthM, volume = polygonAreaM2(ring) * length — pero ring debe estar en world XY units.
 * Mantener ring en world units del lienzo (px): polygonAreaM2 ya divide por PPM².
 */
function remapProfileRingToXy(ring, viewId) {
  // Conservamos las coordenadas de canvas del perfil como ring XY "de trabajo".
  // El área en ese plano × longitud de extrusión da el volumen.
  return (ring || []).map((p) => ({ x: p.x, y: p.y }))
}

function polygonsFromCell(cell) {
  const outer = ringToClipping(cell.ring)
  if (!outer) return null
  const poly = [outer]
  for (const hole of cell.holes || []) {
    const h = ringToClipping(hole)
    if (h) poly.push(h)
  }
  return poly
}

function cellsFromClippingPolys(polys, z0, z1) {
  const cells = []
  // polygon-clipping devuelve MultiPolygon: [ Polygon, ... ] ; Polygon = [ Ring, ... ]
  const list = Array.isArray(polys) ? polys : []
  for (const poly of list) {
    if (!Array.isArray(poly) || !poly.length) continue
    // Si accidentalmente llega un Ring suelto ([ [x,y], ... ]), normalizar.
    const rings = Array.isArray(poly[0]?.[0]) ? poly : [poly]
    const outer = clippingToRing(rings[0])
    if (outer.length < 3) continue
    const holes = []
    for (let i = 1; i < rings.length; i += 1) {
      const h = clippingToRing(rings[i])
      if (h.length >= 3) holes.push(h)
    }
    const trim = (ring) => {
      if (ring.length >= 2) {
        const a = ring[0]
        const b = ring[ring.length - 1]
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) return ring.slice(0, -1)
      }
      return ring
    }
    cells.push({
      ring: trim(outer),
      holes: holes.map(trim),
      z0,
      z1,
      analytic: null,
    })
  }
  return cells
}

/**
 * Descompone sólidos en losas Z y aplica boolean 2D por losa.
 * @param {'union'|'difference'} op
 */
function booleanSolids(solids, op) {
  const list = (solids || []).filter((s) => s?.cells?.length)
  if (!list.length) return null

  const zs = new Set()
  for (const s of list) {
    for (const c of s.cells) {
      zs.add(Number(c.z0))
      zs.add(Number(c.z1))
    }
  }
  const levels = [...zs].filter(Number.isFinite).sort((a, b) => a - b)
  if (levels.length < 2) return null

  const outCells = []
  for (let i = 0; i < levels.length - 1; i += 1) {
    const z0 = levels[i]
    const z1 = levels[i + 1]
    if (!(z1 > z0)) continue
    const mid = (z0 + z1) / 2
    const slices = []
    for (const s of list) {
      const parts = []
      for (const c of s.cells) {
        const a = Math.min(c.z0, c.z1)
        const b = Math.max(c.z0, c.z1)
        if (mid > a && mid < b) {
          const poly = polygonsFromCell(c)
          if (poly) parts.push(poly)
        }
      }
      if (parts.length) {
        // union within solid at this slab
        let acc = parts[0]
        for (let k = 1; k < parts.length; k += 1) {
          acc = polygonClipping.union(acc, parts[k])
        }
        slices.push(acc)
      } else if (op === 'difference') {
        slices.push(null)
      }
    }

    if (op === 'union') {
      const present = slices.filter(Boolean)
      if (!present.length) continue
      let acc = present[0]
      for (let k = 1; k < present.length; k += 1) {
        acc = polygonClipping.union(acc, present[k])
      }
      outCells.push(...cellsFromClippingPolys(acc, z0, z1))
    } else if (op === 'difference') {
      // base = first solid, subtract the rest
      if (!slices[0]) continue
      let acc = slices[0]
      for (let k = 1; k < list.length; k += 1) {
        if (!slices[k]) continue
        acc = polygonClipping.difference(acc, slices[k])
      }
      outCells.push(...cellsFromClippingPolys(acc, z0, z1))
    }
  }

  if (!outCells.length) return null
  // Fusionar losas adyacentes con el mismo footprint sería opcional; volumen ya es exacto.
  return {
    type: 'solid3d',
    id: uid(),
    color: list[0].color,
    extrudeAxis: list[0].extrudeAxis || 'z',
    viewPlane: list[0].viewPlane || 'top',
    cells: outCells,
    volumeM3: 0,
  }
}

export function uniteSolids(solids) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d')
  if (list.length < 2) return { ok: false, error: 'Seleccione dos o más sólidos para unir.' }
  const solid = booleanSolids(list, 'union')
  if (!solid) return { ok: false, error: 'No se pudo unir los sólidos.' }
  solid.volumeM3 = solidVolumeM3(solid)
  return { ok: true, solid }
}

export function subtractSolids(baseSolid, subtractList) {
  if (!baseSolid || baseSolid.type !== 'solid3d') {
    return { ok: false, error: 'Indique el sólido base.' }
  }
  const others = (subtractList || []).filter((s) => s && s.id !== baseSolid.id)
  if (!others.length) return { ok: false, error: 'Indique al menos un sólido a descontar.' }
  const solid = booleanSolids([baseSolid, ...others], 'difference')
  if (!solid) return { ok: false, error: 'No se pudo sustraer (resultado vacío).' }
  solid.color = baseSolid.color
  solid.volumeM3 = solidVolumeM3(solid)
  return { ok: true, solid }
}

/**
 * Corta un sólido con una línea infinita en el plano XY (vista superior).
 * Devuelve dos sólidos.
 */
export function sliceSolidByLine(solid, a, b) {
  if (!solid?.cells?.length) return { ok: false, error: 'Seleccione un sólido.' }
  if (!a || !b) return { ok: false, error: 'Trace la línea de corte.' }
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.hypot(dx, dy) < 1e-6) return { ok: false, error: 'La línea de corte es demasiado corta.' }

  // Semiplanos: usar un rectángulo enorme a cada lado de la línea y intersectar.
  const nx = -dy
  const ny = dx
  const len = Math.hypot(nx, ny) || 1
  const ux = nx / len
  const uy = ny / len
  const BIG = 1e7

  function halfPlanePoly(sign) {
    const px = a.x + ux * sign * BIG
    const py = a.y + uy * sign * BIG
    const qx = b.x + ux * sign * BIG
    const qy = b.y + uy * sign * BIG
    return [[[
      [a.x - dx * BIG, a.y - dy * BIG],
      [b.x + dx * BIG, b.y + dy * BIG],
      [qx, qy],
      [px, py],
      [a.x - dx * BIG, a.y - dy * BIG],
    ]]]
  }

  const leftCells = []
  const rightCells = []
  const hpL = halfPlanePoly(1)
  const hpR = halfPlanePoly(-1)

  for (const cell of solid.cells) {
    const poly = polygonsFromCell(cell)
    if (!poly) continue
    const left = polygonClipping.intersection(poly, hpL)
    const right = polygonClipping.intersection(poly, hpR)
    leftCells.push(...cellsFromClippingPolys(left, cell.z0, cell.z1))
    rightCells.push(...cellsFromClippingPolys(right, cell.z0, cell.z1))
  }

  if (!leftCells.length || !rightCells.length) {
    return { ok: false, error: 'El corte no divide el sólido en dos partes.' }
  }

  const s1 = {
    type: 'solid3d',
    id: uid(),
    color: solid.color,
    extrudeAxis: solid.extrudeAxis || 'z',
    viewPlane: solid.viewPlane || 'top',
    cells: leftCells,
  }
  const s2 = {
    type: 'solid3d',
    id: uid(),
    color: solid.color,
    extrudeAxis: solid.extrudeAxis || 'z',
    viewPlane: solid.viewPlane || 'top',
    cells: rightCells,
  }
  s1.volumeM3 = solidVolumeM3(s1)
  s2.volumeM3 = solidVolumeM3(s2)
  return { ok: true, solids: [s1, s2] }
}

/** AABB 2D de un sólido en XY (para hit-test simple en vista superior). */
export function solidXyBounds(solid) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const cell of solid?.cells || []) {
    for (const p of cell.ring || []) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function pointInSolidXy(solid, x, y) {
  const bb = solidXyBounds(solid)
  if (!bb) return false
  if (x < bb.x || y < bb.y || x > bb.x + bb.w || y > bb.y + bb.h) return false
  // Ray cast against first cell rings (approx for selection)
  for (const cell of solid.cells || []) {
    if (pointInRing(x, y, cell.ring)) {
      let inHole = false
      for (const hole of cell.holes || []) {
        if (pointInRing(x, y, hole)) inHole = true
      }
      if (!inHole) return true
    }
  }
  return false
}

function pointInRing(x, y, ring) {
  const pts = ring || []
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Dibuja un sólido proyectado en el ctx 2D según la vista.
 */
export function drawSolid3d(ctx, solid, {
  viewId = 'top',
  cotaRefM = 0,
  selected = false,
  zoom = 1,
} = {}) {
  if (!ctx || !solid?.cells?.length) return
  const stroke = selected ? '#2563eb' : (solid.color || '#0f766e')
  const fill = selected ? 'rgba(37,99,235,0.18)' : 'rgba(15,118,110,0.14)'
  ctx.save()
  ctx.lineWidth = Math.max(1.2, 2 / Math.max(zoom, 0.25))
  ctx.strokeStyle = stroke
  ctx.fillStyle = fill

  for (const cell of solid.cells) {
    const zBottom = Math.min(cell.z0, cell.z1)
    const zTop = Math.max(cell.z0, cell.z1)
    const ringBot = (cell.ring || []).map((p) => projectPt(p, zBottom, viewId, cotaRefM))
    const ringTop = (cell.ring || []).map((p) => projectPt(p, zTop, viewId, cotaRefM))

    if (viewId === 'top') {
      pathRing(ctx, ringBot)
      ctx.fill()
      ctx.stroke()
      for (const hole of cell.holes || []) {
        pathRing(ctx, hole.map((p) => projectPt(p, zBottom, viewId, cotaRefM)))
        ctx.stroke()
      }
    } else {
      // Frontal / lateral / isométrica: caras laterales + tapa
      const n = ringBot.length
      const lastDup = n > 1
        && Math.hypot(ringBot[0].x - ringBot[n - 1].x, ringBot[0].y - ringBot[n - 1].y) < 1e-6
      const edgeCount = lastDup ? n - 1 : n
      for (let i = 0; i < edgeCount; i += 1) {
        const j = (i + 1) % edgeCount
        ctx.beginPath()
        ctx.moveTo(ringBot[i].x, ringBot[i].y)
        ctx.lineTo(ringBot[j].x, ringBot[j].y)
        ctx.lineTo(ringTop[j].x, ringTop[j].y)
        ctx.lineTo(ringTop[i].x, ringTop[i].y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      pathRing(ctx, ringTop)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Hit-test de sólido en coordenadas de lienzo según la vista activa. */
export function hitSolidAtView(solid, canvasPt, viewId = 'top', cotaRefM = 0) {
  if (!solid?.cells?.length || !canvasPt) return false
  if (viewId === 'top') return pointInSolidXy(solid, canvasPt.x, canvasPt.y)
  for (const cell of solid.cells) {
    const z0 = Math.min(cell.z0, cell.z1)
    const z1 = Math.max(cell.z0, cell.z1)
    const pts = []
    for (const p of cell.ring || []) {
      pts.push(projectPt(p, z0, viewId, cotaRefM))
      pts.push(projectPt(p, z1, viewId, cotaRefM))
    }
    if (pts.length < 3) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const q of pts) {
      minX = Math.min(minX, q.x)
      minY = Math.min(minY, q.y)
      maxX = Math.max(maxX, q.x)
      maxY = Math.max(maxY, q.y)
    }
    if (canvasPt.x >= minX && canvasPt.x <= maxX && canvasPt.y >= minY && canvasPt.y <= maxY) {
      return true
    }
  }
  return false
}

function projectPt(p, zCota, viewId, cotaRefM) {
  // Import lazy to avoid cycle — inline top/front/side/iso
  const x = p.x
  const y = p.y
  const z = -((zCota - (cotaRefM || 0)) * PX_PER_METER)
  if (viewId === 'front') return { x, y: z }
  if (viewId === 'side') return { x: y, y: z }
  if (String(viewId).startsWith('iso')) {
    const sx = viewId.includes('w') ? -1 : 1
    const sy = viewId.includes('s') ? -1 : 1
    const X = x * sx
    const Y = y * sy
    const cos = Math.SQRT1_2
    const sin = Math.SQRT1_2
    return { x: (X - Y) * cos, y: (X + Y) * sin * 0.5 + z }
  }
  return { x, y }
}

function pathRing(ctx, ring) {
  if (!ring?.length) return
  ctx.beginPath()
  ctx.moveTo(ring[0].x, ring[0].y)
  for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y)
  ctx.closePath()
}

export function isClosedDrawableEntity(obj) {
  if (!obj) return false
  return obj.type === 'rect'
    || obj.type === 'elipse'
    || obj.type === 'triangulo'
    || obj.type === 'polilinea'
    || obj.type === 'stroke'
}

// re-export helpers used by tests
export { closedEntityAreaM2, metersToWorld }
