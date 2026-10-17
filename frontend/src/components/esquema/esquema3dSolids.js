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
import {
  canvasDeltaToWorldMove,
  depthAxisValueFromWorld,
  extrudeModeForView,
  normalizeViewId,
  projectWorld3dToCanvas,
  viewProfileMeta,
  worldZToCota,
} from './esquema3dViews.js'

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

/** Volumen geométrico crudo (suma de celdas), ignora volumeLocked. */
export function solidGeomVolumeM3(solid) {
  if (!solid?.cells?.length) return 0
  return solid.cells.reduce((s, c) => s + solidCellVolumeM3(c), 0)
}

/**
 * Volumen total de un sólido (m³).
 * Si el sólido tiene volumeLocked (p. ej. unión por contacto con expand),
 * se usa solid.volumeM3 para que panel, barra, cálculo y memoria coincidan.
 */
export function solidVolumeM3(solid) {
  if (!solid?.cells?.length) return 0
  if (solid.volumeLocked && Number.isFinite(Number(solid.volumeM3))) {
    return Number(solid.volumeM3)
  }
  return solidGeomVolumeM3(solid)
}

/** Fija el volumen exacto y lo bloquea frente a recalculos por celdas infladas. */
export function lockSolidVolume(solid, volumeM3) {
  if (!solid) return solid
  const v = Number(volumeM3)
  solid.volumeM3 = Number.isFinite(v) ? v : solidGeomVolumeM3(solid)
  solid.volumeLocked = true
  return solid
}

export function formatVolumeM3(m3, digits = 2) {
  const n = Number(m3)
  if (!Number.isFinite(n)) return ''
  return `${n.toFixed(digits)} m³`
}

/**
 * Redondeo a 2 decimales (valores mostrados en memoria / panel).
 * Limpia antes a 6 decimales para absorber ruido de PX_PER_METER
 * (p. ej. 3,374999… → 3,375 → 3,38).
 */
export function round2(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  const cleaned = Math.round(x * 1e6) / 1e6
  return Math.round(cleaned * 100) / 100
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
 * Extruir contorno cerrado → sólido canónico (anillo XY + cotas Z).
 * - Superior / inferior: entre cotaSuperior y cotaInferior.
 * - Frontal / posterior / laterales: longitud = profundidad perpendicular a la cara
 *   (la figura conserva posición, tamaño y cotas reales; no se “aplasta” a planta).
 * @param {number} [faceDepthWorld] coordenada world (px) del plano de apoyo a lo largo
 *   del eje de profundidad; si no hay sólido debajo, 0.
 */
export function extrudeClosedEntity(obj, {
  viewId = 'top',
  cotaSuperior,
  cotaInferior,
  lengthM,
  color,
  id,
  faceDepthWorld = null,
} = {}) {
  const contour = closedEntityToContour(obj)
  if (!contour?.ring?.length) return { ok: false, error: 'Seleccione un contorno cerrado.' }

  const vid = normalizeViewId(viewId)
  const mode = extrudeModeForView(vid)

  if (mode === 'cotas') {
    const v = validateCotas(cotaSuperior, cotaInferior)
    if (!v.ok) return v
    let ring = contour.ring
    if (vid === 'bottom') {
      // Vista inferior: el lienzo Y está invertido respecto a world Y.
      ring = ring.map((p) => ({ x: p.x, y: -p.y }))
    }
    const solid = {
      type: 'solid3d',
      id: id || uid(),
      color: color || undefined,
      extrudeAxis: 'z',
      viewPlane: vid,
      sourceEntityId: obj.id || null,
      extrudeParams: {
        viewId: vid,
        cotaSuperior: v.z1,
        cotaInferior: v.z0,
      },
      cells: [{
        ring: closeRing(ring)?.slice(0, -1) || ring,
        holes: [],
        z0: v.z0,
        z1: v.z1,
        analytic: contour.analytic,
      }],
    }
    lockSolidVolume(solid, solidGeomVolumeM3(solid))
    return { ok: true, solid }
  }

  const vLen = validateExtrudeLengthM(lengthM)
  if (!vLen.ok) return vLen
  const built = buildCanonicalFromProfile({
    ringCanvas: contour.ring,
    analytic: contour.analytic,
    viewId: vid,
    lengthM: vLen.lengthM,
    faceDepthWorld: faceDepthWorld == null ? 0 : Number(faceDepthWorld),
  })
  if (!built.ok) return built

  const solid = {
    type: 'solid3d',
    id: id || uid(),
    color: color || undefined,
    extrudeAxis: 'z',
    viewPlane: vid,
    sourceEntityId: obj.id || null,
    extrudeParams: {
      viewId: vid,
      lengthM: vLen.lengthM,
      faceDepthWorld: faceDepthWorld == null ? 0 : Number(faceDepthWorld),
    },
    cells: built.cells,
  }
  // Volumen exacto: área del perfil × longitud (no la suma de losas de teselación).
  const profileArea = profileAreaM2(contour.ring, contour.analytic)
  lockSolidVolume(solid, profileArea * vLen.lengthM)
  return { ok: true, solid }
}

function profileAreaM2(ring, analytic) {
  if (analytic?.type === 'rect') {
    return Math.abs(analytic.wM) * Math.abs(analytic.hM)
  }
  if (analytic?.type === 'ellipse') {
    return Math.PI * Math.abs(analytic.rxM) * Math.abs(analytic.ryM)
  }
  if (analytic?.type === 'triangle') {
    return 0.5 * Math.abs(analytic.baseM) * Math.abs(analytic.heightM)
  }
  return Math.max(0, polygonAreaM2(ring || []))
}

/**
 * Contorno en vista de perfil (coords de lienzo) → celdas canónicas XY + cotas.
 * Rectángulo alineado → una celda. Círculo/elipse/polígono → losas Z.
 */
function buildCanonicalFromProfile({
  ringCanvas,
  analytic,
  viewId,
  lengthM,
  faceDepthWorld = 0,
}) {
  const meta = viewProfileMeta(viewId)
  const lengthPx = metersToWorld(lengthM)
  const d0 = Number(faceDepthWorld) || 0
  const d1 = d0 + meta.depthSign * lengthPx
  const depthMin = Math.min(d0, d1)
  const depthMax = Math.max(d0, d1)

  const profile = (ringCanvas || []).map((p) => {
    const along = meta.alongSign * (Number(p.x) || 0)
    const cota = worldZToCota(Number(p.y) || 0, 0)
    return { along, cota }
  })
  if (profile.length < 3) {
    return { ok: false, error: 'Contorno de perfil inválido.' }
  }

  const alongs = profile.map((p) => p.along)
  const cotas = profile.map((p) => p.cota)
  const alongMin = Math.min(...alongs)
  const alongMax = Math.max(...alongs)
  const z0 = Math.min(...cotas)
  const z1 = Math.max(...cotas)
  if (!(z1 > z0) || !(alongMax > alongMin)) {
    return { ok: false, error: 'El contorno debe tener área en la vista.' }
  }

  const xyRect = (a0, a1, dep0, dep1) => {
    // alongAxis × depthAxis → ring XY
    if (meta.alongAxis === 'x' && meta.depthAxis === 'y') {
      return [
        { x: a0, y: dep0 },
        { x: a1, y: dep0 },
        { x: a1, y: dep1 },
        { x: a0, y: dep1 },
      ]
    }
    // along = y, depth = x
    return [
      { x: dep0, y: a0 },
      { x: dep1, y: a0 },
      { x: dep1, y: a1 },
      { x: dep0, y: a1 },
    ]
  }

  // Rectángulo alineado a los ejes de la vista → un prisma vertical exacto.
  const isRect = analytic?.type === 'rect' || profileLooksAxisAlignedRect(profile)
  if (isRect) {
    const wAlongM = worldToMeters(alongMax - alongMin)
    const hCotaM = z1 - z0
    const cells = [{
      ring: xyRect(alongMin, alongMax, depthMin, depthMax),
      holes: [],
      z0,
      z1,
      analytic: {
        type: 'rect',
        wM: meta.depthAxis === 'x' ? lengthM : wAlongM,
        hM: meta.depthAxis === 'x' ? wAlongM : lengthM,
      },
    }]
    // analytic del footprint XY: long = eje X del ring, anch = eje Y
    if (meta.depthAxis === 'x') {
      cells[0].analytic = { type: 'rect', wM: lengthM, hM: wAlongM }
    } else {
      cells[0].analytic = { type: 'rect', wM: wAlongM, hM: lengthM }
    }
    void hCotaM
    return { ok: true, cells }
  }

  // Círculo / elipse / polígono: losas Z (compatible con booleanos).
  const cells = tessellateProfileAlongZ(profile, meta, depthMin, depthMax, analytic)
  if (!cells.length) return { ok: false, error: 'No se pudo extruir el perfil.' }
  return { ok: true, cells }
}

function profileLooksAxisAlignedRect(profile) {
  if (!profile || profile.length < 4) return false
  const eps = metersToWorld(1e-4)
  const alongs = [...new Set(profile.map((p) => Math.round(p.along / eps) * eps))]
  const cotas = [...new Set(profile.map((p) => Math.round(p.cota * 1e6) / 1e6))]
  return alongs.length === 2 && cotas.length === 2
}

/**
 * Tesela un perfil (along, cota) extruido en profundidad como losas Z.
 * Para círculo/elipse usa cuerdas analíticas; para polígono, barrido por bands.
 */
function tessellateProfileAlongZ(profile, meta, depthMin, depthMax, analytic) {
  const zMin = Math.min(...profile.map((p) => p.cota))
  const zMax = Math.max(...profile.map((p) => p.cota))
  const alongMin = Math.min(...profile.map((p) => p.along))
  const alongMax = Math.max(...profile.map((p) => p.along))
  const nBands = analytic?.type === 'ellipse' ? 48 : 24
  const cells = []
  const xyRect = (a0, a1) => {
    if (meta.alongAxis === 'x' && meta.depthAxis === 'y') {
      return [
        { x: a0, y: depthMin },
        { x: a1, y: depthMin },
        { x: a1, y: depthMax },
        { x: a0, y: depthMax },
      ]
    }
    return [
      { x: depthMin, y: a0 },
      { x: depthMax, y: a0 },
      { x: depthMax, y: a1 },
      { x: depthMin, y: a1 },
    ]
  }

  if (analytic?.type === 'ellipse') {
    const cx = (alongMin + alongMax) / 2
    const cz = (zMin + zMax) / 2
    const rx = Math.abs(alongMax - alongMin) / 2
    const rz = Math.abs(zMax - zMin) / 2
    if (!(rx > 0) || !(rz > 0)) return []
    for (let i = 0; i < nBands; i += 1) {
      const t0 = -1 + (2 * i) / nBands
      const t1 = -1 + (2 * (i + 1)) / nBands
      const zA = cz + t0 * rz
      const zB = cz + t1 * rz
      const mid = (t0 + t1) / 2
      // Semiancho en along a la cota media de la banda
      const half = rx * Math.sqrt(Math.max(0, 1 - mid * mid))
      if (half < metersToWorld(1e-5)) continue
      cells.push({
        ring: xyRect(cx - half, cx + half),
        holes: [],
        z0: Math.min(zA, zB),
        z1: Math.max(zA, zB),
        analytic: null,
      })
    }
    return cells
  }

  // Polígono genérico: bandas uniformes + intersección 1D del perfil con cada cota.
  for (let i = 0; i < nBands; i += 1) {
    const zA = zMin + ((zMax - zMin) * i) / nBands
    const zB = zMin + ((zMax - zMin) * (i + 1)) / nBands
    const zMid = (zA + zB) / 2
    const xs = horizontalSpanAtCota(profile, zMid)
    if (!xs || !(xs.max > xs.min)) continue
    cells.push({
      ring: xyRect(xs.min, xs.max),
      holes: [],
      z0: zA,
      z1: zB,
      analytic: null,
    })
  }
  return cells
}

function horizontalSpanAtCota(profile, cota) {
  const pts = profile || []
  const hits = []
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const dz = b.cota - a.cota
    if (Math.abs(dz) < 1e-12) continue
    const t = (cota - a.cota) / dz
    if (t < -1e-9 || t > 1 + 1e-9) continue
    hits.push(a.along + t * (b.along - a.along))
  }
  if (hits.length < 2) return null
  hits.sort((u, v) => u - v)
  return { min: hits[0], max: hits[hits.length - 1] }
}

/**
 * Reconstruye un sólido ligado a una entidad 2D (p. ej. tras mover / redimensionar).
 * Conserva id y parámetros de extrusión; actualiza geometría y volumen de inmediato.
 * Contorno + sólido = una sola entidad: el ring del sólido siempre refleja la entidad fuente.
 */
export function refreshSolidFromSourceEntity(solid, entity) {
  if (!solid || solid.type !== 'solid3d' || !entity) {
    return { ok: false, error: 'Sólido o entidad no válidos.' }
  }
  const params = solid.extrudeParams || {}
  const r = extrudeClosedEntity(entity, {
    viewId: params.viewId || solid.viewPlane || 'top',
    cotaSuperior: params.cotaSuperior,
    cotaInferior: params.cotaInferior,
    lengthM: params.lengthM,
    color: solid.color,
    id: solid.id,
    faceDepthWorld: params.faceDepthWorld,
  })
  if (!r.ok) return r
  r.solid.sourceEntityId = entity.id
  r.solid.extrudeParams = { ...params }
  // extrudeClosedEntity ya bloquea el volumen exacto (cotas o área×profundidad).
  return r
}

/** Ids de entidades 2D que ya son base de un sólido (no deben dibujarse aparte en 3D). */
export function linkedSourceEntityIds(solids) {
  const ids = new Set()
  for (const s of solids || []) {
    if (s?.sourceEntityId) ids.add(s.sourceEntityId)
  }
  return ids
}

/** Sólido ligado a una entidad 2D (si existe). */
export function solidForSourceEntity(solids, entityId) {
  if (!entityId) return null
  return (solids || []).find((s) => s?.sourceEntityId === entityId) || null
}

/** Traslada un sólido en planta (XY). No altera cotas (z0/z1) ni el volumen bloqueado. */
export function translateSolidXy(solid, dx, dy) {
  return translateSolid3d(solid, { dx, dy, dzCota: 0 })
}

/**
 * Traslada un sólido en world 3D (XY + cotas). Conserva volumen bloqueado y dimensiones.
 * `dzCota` se suma a z0/z1 de cada celda.
 */
export function translateSolid3d(solid, { dx = 0, dy = 0, dzCota = 0 } = {}) {
  if (!solid || solid.type !== 'solid3d') return solid
  const ddx = Number(dx) || 0
  const ddy = Number(dy) || 0
  const ddz = Number(dzCota) || 0
  if (!ddx && !ddy && !ddz) return solid
  return {
    ...solid,
    volumeM3: solid.volumeM3,
    volumeLocked: !!solid.volumeLocked,
    cells: (solid.cells || []).map((cell) => ({
      ...cell,
      z0: (Number(cell.z0) || 0) + ddz,
      z1: (Number(cell.z1) || 0) + ddz,
      ring: (cell.ring || []).map((p) => ({ x: p.x + ddx, y: p.y + ddy })),
      holes: (cell.holes || []).map((hole) => hole.map((p) => ({ x: p.x + ddx, y: p.y + ddy }))),
    })),
  }
}

/**
 * Traslada un sólido según un arrastre en el plano de la vista actual.
 * En caras frontales/laterales mueve along + cota; en superior/iso, en planta.
 */
export function translateSolidInView(solid, dxCanvas, dyCanvas, viewId) {
  const delta = canvasDeltaToWorldMove(dxCanvas, dyCanvas, viewId)
  return translateSolid3d(solid, delta)
}

/**
 * Sincroniza todos los sólidos ligados a entidades 2D.
 * @returns {{ solids: object[], changed: boolean }}
 */
export function syncSolidsWithEntities(solids, entities) {
  const objs = entities || []
  let changed = false
  const next = (solids || []).map((solid) => {
    if (!solid?.sourceEntityId || !solid.extrudeParams) return solid
    const ent = objs.find((o) => o.id === solid.sourceEntityId)
    if (!ent) return solid
    const r = refreshSolidFromSourceEntity(solid, ent)
    if (!r.ok) return solid
    changed = true
    return r.solid
  })
  return { solids: next, changed }
}

/** Elimina sólidos cuya entidad fuente está en entityIds. */
export function dropSolidsForEntities(solids, entityIds) {
  const drop = entityIds instanceof Set ? entityIds : new Set(entityIds || [])
  if (!drop.size) return solids || []
  return (solids || []).filter((s) => !s?.sourceEntityId || !drop.has(s.sourceEntityId))
}

/** Ids de entidades fuente de una lista de sólidos. */
export function sourceEntityIdsOfSolids(solids) {
  return (solids || []).map((s) => s?.sourceEntityId).filter(Boolean)
}

/** Recalcula volumeM3 en una copia del sólido. */
export function withUpdatedVolume(solid) {
  if (!solid || solid.type !== 'solid3d') return solid
  return { ...solid, volumeM3: solidVolumeM3(solid) }
}

/**
 * Profundidad (world px) de la cara del sólido que mira al usuario en la vista.
 * Usado para apoyar el dibujo / extrusión sobre esa cara.
 */
export function solidFaceDepthWorld(solid, viewId) {
  const id = normalizeViewId(viewId)
  if (!solid?.cells?.length) return 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const cell of solid.cells) {
    for (const p of cell.ring || []) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return 0
  switch (id) {
    case 'front': return minY // cara hacia −Y
    case 'back': return maxY
    case 'left':
    case 'side': return minX // cara hacia −X
    case 'right': return maxX
    case 'top':
    case 'bottom':
    default: return 0
  }
}

/** Espesor del sólido a lo largo del eje de profundidad de la vista (m). */
export function solidThicknessAlongViewM(solid, viewId) {
  const id = normalizeViewId(viewId)
  if (!solid?.cells?.length) return 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const cell of solid.cells) {
    for (const p of cell.ring || []) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return 0
  const meta = viewProfileMeta(id)
  if (meta.depthAxis === 'x') return worldToMeters(maxX - minX)
  if (meta.depthAxis === 'y') return worldToMeters(maxY - minY)
  return 0
}

/**
 * Empaqueta un punto world 3D como OSNAP de lienzo (con profundidad de cara).
 */
function osnapFromWorld(pt3d, viewId, cotaRefM, kind, solidId = null, orbit = null) {
  const canvas = projectWorld3dToCanvas(pt3d, viewId, cotaRefM, orbit)
  return {
    x: canvas.x,
    y: canvas.y,
    kind,
    solidId,
    world: { x: pt3d.x, y: pt3d.y, zCota: pt3d.zCota },
    faceDepthWorld: depthAxisValueFromWorld(pt3d, viewId),
  }
}

/**
 * Puntos de referencia de la cara visible (esquinas, medios de arista, centro)
 * en coordenadas de lienzo de la vista. Incluye `world` y `faceDepthWorld`.
 * @returns {Array<{ x: number, y: number, kind: string, world?: object, faceDepthWorld?: number }>}
 */
/** AABB world del sólido (XY px + cotas m). */
function solidAabbWorld(solid) {
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
 * Centros + esquinas + medios de las 6 caras AABB (siempre, no solo la vista actual).
 * Garantiza enganche al centro de cada cara también en resultados de booleanos.
 */
export function solidAllFacesSnapPoints(solid, viewId, cotaRefM = 0, orbit = null) {
  const id = normalizeViewId(viewId)
  const bb = solidAabbWorld(solid)
  if (!bb) return []
  const { minX, maxX, minY, maxY, minZ, maxZ } = bb
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const faces = [
    { // front
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: maxZ },
        { x: minX, y: minY, zCota: maxZ },
      ],
      center: { x: cx, y: minY, zCota: cz },
    },
    { // back
      corners: [
        { x: minX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: minX, y: maxY, zCota: maxZ },
      ],
      center: { x: cx, y: maxY, zCota: cz },
    },
    { // left
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: minX, y: maxY, zCota: minZ },
        { x: minX, y: maxY, zCota: maxZ },
        { x: minX, y: minY, zCota: maxZ },
      ],
      center: { x: minX, y: cy, zCota: cz },
    },
    { // right
      corners: [
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: maxX, y: minY, zCota: maxZ },
      ],
      center: { x: maxX, y: cy, zCota: cz },
    },
    { // top
      corners: [
        { x: minX, y: minY, zCota: maxZ },
        { x: maxX, y: minY, zCota: maxZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: minX, y: maxY, zCota: maxZ },
      ],
      center: { x: cx, y: cy, zCota: maxZ },
    },
    { // bottom
      corners: [
        { x: minX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: minX, y: maxY, zCota: minZ },
      ],
      center: { x: cx, y: cy, zCota: minZ },
    },
  ]
  const out = []
  for (const face of faces) {
    for (const p of face.corners) {
      out.push(osnapFromWorld(p, id, cotaRefM, 'corner', solid.id, orbit))
    }
    for (let i = 0; i < face.corners.length; i += 1) {
      const a = face.corners[i]
      const b = face.corners[(i + 1) % face.corners.length]
      out.push(osnapFromWorld({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        zCota: (a.zCota + b.zCota) / 2,
      }, id, cotaRefM, 'mid', solid.id, orbit))
    }
    out.push(osnapFromWorld(face.center, id, cotaRefM, 'center', solid.id, orbit))
  }
  return out
}

export function solidFaceSnapPoints(solid, viewId, cotaRefM = 0, orbit = null) {
  const id = normalizeViewId(viewId)
  if (!solid?.cells?.length) return []
  const bb = solidAabbWorld(solid)
  if (!bb) return []
  const { minX, maxX, minY, maxY, minZ, maxZ } = bb

  const depth = solidFaceDepthWorld(solid, id)
  let corners3d = []
  switch (id) {
    case 'front':
    case 'back':
      corners3d = [
        { x: minX, y: depth, zCota: minZ },
        { x: maxX, y: depth, zCota: minZ },
        { x: maxX, y: depth, zCota: maxZ },
        { x: minX, y: depth, zCota: maxZ },
      ]
      break
    case 'left':
    case 'side':
    case 'right':
      corners3d = [
        { x: depth, y: minY, zCota: minZ },
        { x: depth, y: maxY, zCota: minZ },
        { x: depth, y: maxY, zCota: maxZ },
        { x: depth, y: minY, zCota: maxZ },
      ]
      break
    case 'bottom':
      corners3d = [
        { x: minX, y: minY, zCota: minZ },
        { x: maxX, y: minY, zCota: minZ },
        { x: maxX, y: maxY, zCota: minZ },
        { x: minX, y: maxY, zCota: minZ },
      ]
      break
    case 'top':
    default:
      corners3d = [
        { x: minX, y: minY, zCota: maxZ },
        { x: maxX, y: minY, zCota: maxZ },
        { x: maxX, y: maxY, zCota: maxZ },
        { x: minX, y: maxY, zCota: maxZ },
      ]
      break
  }

  const corners = corners3d.map((p) => osnapFromWorld(p, id, cotaRefM, 'corner', solid.id, orbit))
  const mids = []
  for (let i = 0; i < corners3d.length; i += 1) {
    const a = corners3d[i]
    const b = corners3d[(i + 1) % corners3d.length]
    const mid = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      zCota: (a.zCota + b.zCota) / 2,
    }
    mids.push(osnapFromWorld(mid, id, cotaRefM, 'mid', solid.id, orbit))
  }
  const center3d = {
    x: corners3d.reduce((s, p) => s + p.x, 0) / corners3d.length,
    y: corners3d.reduce((s, p) => s + p.y, 0) / corners3d.length,
    zCota: corners3d.reduce((s, p) => s + p.zCota, 0) / corners3d.length,
  }
  return [...corners, ...mids, osnapFromWorld(center3d, id, cotaRefM, 'center', solid.id, orbit)]
}

/** ¿El anillo es casi circular? (centro de cilindro/círculo tras booleanos sin analytic). */
function ringCircleCenter(ring) {
  if (!ring || ring.length < 8) return null
  let sx = 0
  let sy = 0
  const n = ring.length
  for (const p of ring) {
    sx += p.x
    sy += p.y
  }
  const cx = sx / n
  const cy = sy / n
  let rMin = Infinity
  let rMax = 0
  for (const p of ring) {
    const r = Math.hypot(p.x - cx, p.y - cy)
    rMin = Math.min(rMin, r)
    rMax = Math.max(rMax, r)
  }
  if (!(rMax > 1e-6)) return null
  if ((rMax - rMin) / rMax > 0.12) return null
  return { x: cx, y: cy, r: (rMin + rMax) / 2 }
}

/**
 * OSNAP 3D completo: 6 caras + vértices reales + centros de círculo/cilindro.
 * Incluye sólidos resultantes de Unir/Sustraer/Cortar.
 * `orbit` alinea la proyección con la cámara (iso / giro libre).
 */
export function solidOsnapPoints(solid, viewId, cotaRefM = 0, orbit = null) {
  const id = normalizeViewId(viewId)
  if (!solid?.cells?.length) return []
  const out = [
    ...solidAllFacesSnapPoints(solid, id, cotaRefM, orbit),
  ]
  const seen = new Set(out.map((s) => `${s.kind}:${s.x.toFixed(1)},${s.y.toFixed(1)}`))
  const push = (pt3d, kind) => {
    const sp = osnapFromWorld(pt3d, id, cotaRefM, kind, solid.id, orbit)
    const key = `${kind}:${sp.x.toFixed(1)},${sp.y.toFixed(1)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(sp)
  }

  for (const cell of solid.cells) {
    const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const rings = [cell.ring || [], ...(cell.holes || [])]
    for (const ring of rings) {
      const n = ring.length
      for (let i = 0; i < n; i += 1) {
        const a = ring[i]
        const b = ring[(i + 1) % n]
        if (!a) continue
        push({ x: a.x, y: a.y, zCota: z0 }, 'end')
        push({ x: a.x, y: a.y, zCota: z1 }, 'end')
        if (b) {
          push({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            zCota: z0,
          }, 'mid')
          push({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            zCota: z1,
          }, 'mid')
          push({ x: a.x, y: a.y, zCota: (z0 + z1) / 2 }, 'mid')
        }
      }
      const circ = ringCircleCenter(ring)
      if (circ) {
        push({ x: circ.x, y: circ.y, zCota: (z0 + z1) / 2 }, 'center')
        push({ x: circ.x, y: circ.y, zCota: z0 }, 'center')
        push({ x: circ.x, y: circ.y, zCota: z1 }, 'center')
      }
    }
    // Centro de círculo / elipse analítica (huella en planta).
    if (cell.analytic?.type === 'ellipse' || cell.analytic?.type === 'rect') {
      let sx = 0
      let sy = 0
      const ring = cell.ring || []
      if (ring.length) {
        for (const p of ring) {
          sx += p.x
          sy += p.y
        }
        const cx = sx / ring.length
        const cy = sy / ring.length
        push({ x: cx, y: cy, zCota: (z0 + z1) / 2 }, 'center')
        if (cell.analytic?.type === 'ellipse') {
          push({ x: cx, y: cy, zCota: z0 }, 'center')
          push({ x: cx, y: cy, zCota: z1 }, 'center')
        }
      }
    }
  }
  return out
}

/** Todos los OSNAP 3D de una lista de sólidos (opcionalmente excluye uno). */
export function collectSolidsOsnap(solids, viewId, cotaRefM = 0, excludeSolidId = null, orbit = null) {
  const list = []
  for (const s of solids || []) {
    if (!s || s.id === excludeSolidId) continue
    list.push(...solidOsnapPoints(s, viewId, cotaRefM, orbit))
  }
  return list
}

/**
 * Profundidad de cara para extruir un contorno:
 * 1) sólido bajo el centro del contorno
 * 2) `entity.viewDepthWorld` si se dibujó con OSNAP/apoyo
 * 3) OSNAP 3D más cercano a los puntos del contorno
 * 4) 0 (plano de referencia de la vista)
 */
export function inferFaceDepthForExtrude(entity, solids, viewId, cotaRefM = 0) {
  const id = normalizeViewId(viewId)
  if (entity && Number.isFinite(Number(entity.viewDepthWorld))) {
    // Preferir hit de cara si el centro cae sobre un sólido (más fiable).
  }
  const pts = []
  if (Number.isFinite(entity?.x1) && Number.isFinite(entity?.y1)) {
    pts.push({ x: entity.x1, y: entity.y1 })
    if (Number.isFinite(entity.x2) && Number.isFinite(entity.y2)) {
      pts.push({ x: entity.x2, y: entity.y2 })
      pts.push({ x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2 })
    }
  }
  for (const p of entity?.points || []) {
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) pts.push({ x: p.x, y: p.y })
  }
  const center = pts.length
    ? {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    }
    : null
  if (center) {
    const support = hitSolidFaceAtView(solids, center, id, cotaRefM)
    if (support) {
      return {
        faceDepthWorld: solidFaceDepthWorld(support, id),
        support,
        source: 'face',
      }
    }
  }
  if (Number.isFinite(Number(entity?.viewDepthWorld))) {
    return {
      faceDepthWorld: Number(entity.viewDepthWorld),
      support: null,
      source: 'entity',
    }
  }
  const thr = metersToWorld(0.35)
  let best = null
  let bestDist = thr
  const osnaps = collectSolidsOsnap(solids, id, cotaRefM)
  for (const pt of pts) {
    for (const sp of osnaps) {
      const d = Math.hypot(pt.x - sp.x, pt.y - sp.y)
      if (d < bestDist) {
        bestDist = d
        best = sp
      }
    }
  }
  if (best && Number.isFinite(best.faceDepthWorld)) {
    return {
      faceDepthWorld: best.faceDepthWorld,
      support: (solids || []).find((s) => s.id === best.solidId) || null,
      source: 'osnap',
    }
  }
  return { faceDepthWorld: 0, support: null, source: 'plane' }
}

/**
 * Al mover un sólido: engancha un vértice/OSNAP propio al OSNAP de otros.
 * `grabCanvas` = punto de agarre en lienzo (origen del drag).
 * Devuelve dx/dy de lienzo ya corregidos (listos para translateSolidInView).
 */
export function snapSolidMoveDelta({
  originSolid,
  solids,
  viewId,
  grabCanvas,
  cursorCanvas,
  threshold = 14,
  cotaRefM = 0,
  orbit = null,
} = {}) {
  const id = normalizeViewId(viewId)
  if (!originSolid || !grabCanvas || !cursorCanvas) {
    return {
      dx: (cursorCanvas?.x || 0) - (grabCanvas?.x || 0),
      dy: (cursorCanvas?.y || 0) - (grabCanvas?.y || 0),
      snap: null,
    }
  }
  const rawDx = cursorCanvas.x - grabCanvas.x
  const rawDy = cursorCanvas.y - grabCanvas.y
  const movedPreview = translateSolidInView(originSolid, rawDx, rawDy, id)
  const selfSnaps = solidOsnapPoints(movedPreview, id, cotaRefM, orbit)
  const others = collectSolidsOsnap(solids, id, cotaRefM, originSolid.id, orbit)
  let best = null
  let bestDist = threshold
  for (const a of selfSnaps) {
    for (const b of others) {
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < bestDist) {
        bestDist = d
        best = { self: a, target: b, dist: d }
      }
    }
  }
  if (!best) {
    return { dx: rawDx, dy: rawDy, snap: null }
  }
  // Ajuste: desplazar el preview para que self coincida con target.
  const adjDx = rawDx + (best.target.x - best.self.x)
  const adjDy = rawDy + (best.target.y - best.self.y)
  return {
    dx: adjDx,
    dy: adjDy,
    snap: {
      x: best.target.x,
      y: best.target.y,
      kind: best.target.kind || 'end',
      faceDepthWorld: best.target.faceDepthWorld,
      solidId: best.target.solidId,
    },
  }
}

/**
 * Sólido bajo un punto de lienzo en la vista actual (cara visible).
 * Prefiere el de menor área de cara (elementos apoyados sobre muros).
 */
export function hitSolidFaceAtView(solids, canvasPt, viewId, cotaRefM = 0) {
  const list = solids || []
  let best = null
  let bestArea = Infinity
  for (const solid of list) {
    const snaps = solidFaceSnapPoints(solid, viewId, cotaRefM)
    if (snaps.length < 4) continue
    const xs = snaps.filter((s) => s.kind === 'corner').map((s) => s.x)
    const ys = snaps.filter((s) => s.kind === 'corner').map((s) => s.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    if (
      canvasPt.x < minX - 1
      || canvasPt.x > maxX + 1
      || canvasPt.y < minY - 1
      || canvasPt.y > maxY + 1
    ) continue
    const area = Math.abs((maxX - minX) * (maxY - minY))
    if (area < bestArea) {
      bestArea = area
      best = solid
    }
  }
  return best
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

/** Tolerancia de volumen (m³) para solape / vacío. */
const VOL_EPS = 1e-6
/** Holgura XY (~2 mm) para considerar que dos sólidos se tocan. */
const TOUCH_XY_EPS = metersToWorld(0.002)

/**
 * Descompone sólidos en losas Z y aplica boolean 2D por losa.
 * @param {'union'|'difference'|'intersection'} op
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
        // Incluir celda si la losa se solapa con el intervalo Z (incluye tocar bordes).
        if (mid >= a - 1e-12 && mid <= b + 1e-12 && b > a + 1e-12) {
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
      } else if (op === 'difference' || op === 'intersection') {
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
    } else if (op === 'intersection') {
      if (slices.some((s) => !s)) continue
      let acc = slices[0]
      for (let k = 1; k < slices.length; k += 1) {
        acc = polygonClipping.intersection(acc, slices[k])
      }
      outCells.push(...cellsFromClippingPolys(acc, z0, z1))
    }
  }

  if (!outCells.length) return null
  // Color: primer operando con color definido (unión/sustracción/corte).
  const color = list.map((s) => s.color).find((c) => !!c) || list[0].color
  return {
    type: 'solid3d',
    id: uid(),
    color,
    extrudeAxis: list[0].extrudeAxis || 'z',
    viewPlane: list[0].viewPlane || 'top',
    cells: outCells,
    volumeM3: 0,
  }
}

/** Unión geométrica sin exigir contacto (p. ej. grupo de sumas en un cálculo). */
export function mergeSolidsUnion(solids) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  if (!list.length) return null
  if (list.length === 1) {
    return {
      ...list[0],
      cells: list[0].cells,
      volumeM3: solidVolumeM3(list[0]),
    }
  }
  const solid = booleanSolids(list, 'union')
  if (!solid) return null
  solid.volumeM3 = solidVolumeM3(solid)
  return solid
}

/** Intersección de dos o más sólidos. */
export function intersectSolids(solids) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  if (list.length < 2) return { ok: false, error: 'Se necesitan al menos dos sólidos.', solid: null }
  const solid = booleanSolids(list, 'intersection')
  if (!solid) return { ok: false, error: 'Sin volumen común.', solid: null }
  solid.volumeM3 = solidVolumeM3(solid)
  return { ok: true, solid }
}

/** Volumen de intersección (m³); 0 si no se solapan. */
export function intersectionVolumeM3(a, b) {
  if (!a || !b) return 0
  const r = intersectSolids([a, b])
  return r.ok ? r.solid.volumeM3 : 0
}

function solidZRange(solid) {
  let z0 = Infinity
  let z1 = -Infinity
  for (const c of solid?.cells || []) {
    z0 = Math.min(z0, Number(c.z0) || 0, Number(c.z1) || 0)
    z1 = Math.max(z1, Number(c.z0) || 0, Number(c.z1) || 0)
  }
  if (!Number.isFinite(z0)) return null
  return { z0, z1 }
}

function expandBounds(bb, eps) {
  if (!bb) return null
  return {
    x: bb.x - eps,
    y: bb.y - eps,
    w: bb.w + eps * 2,
    h: bb.h + eps * 2,
  }
}

function boundsOverlap(a, b) {
  if (!a || !b) return false
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

/** ¿Dos sólidos se tocan o se superponen (volumen común o contacto XY con Z solapado)? */
export function solidsTouchOrOverlap(solids, { xyEps = TOUCH_XY_EPS, volEps = VOL_EPS } = {}) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  if (list.length < 2) return false
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]
      const b = list[j]
      const za = solidZRange(a)
      const zb = solidZRange(b)
      if (!za || !zb) continue
      if (za.z1 < zb.z0 - 1e-9 || zb.z1 < za.z0 - 1e-9) continue
      if (intersectionVolumeM3(a, b) > volEps) return true
      const ba = expandBounds(solidXyBounds(a), xyEps)
      const bb = expandBounds(solidXyBounds(b), xyEps)
      if (boundsOverlap(ba, bb)) {
        // Contacto / casi contacto en planta con Z solapado → se pueden unir.
        // Confirmar con unión: si el volumen unido ≈ suma, están disjuntos sin solape
        // pero "pegados"; si es menor, se solapan. Ambos casos permiten unir.
        return true
      }
    }
  }
  return false
}

/**
 * Expande ligeramente cada ring desde su centroide para fusionar bordes que se tocan
 * (tolerancia de dibujo / iPad).
 */
function expandSolidForUnite(solid, delta = TOUCH_XY_EPS) {
  if (!solid?.cells?.length || !(delta > 0)) return solid
  const expandRing = (ring) => {
    const pts = ring || []
    if (pts.length < 3) return pts
    let cx = 0
    let cy = 0
    for (const p of pts) {
      cx += p.x
      cy += p.y
    }
    cx /= pts.length
    cy /= pts.length
    return pts.map((p) => {
      const dx = p.x - cx
      const dy = p.y - cy
      const len = Math.hypot(dx, dy) || 1
      return { x: p.x + (dx / len) * delta, y: p.y + (dy / len) * delta }
    })
  }
  return {
    ...solid,
    cells: solid.cells.map((cell) => ({
      ...cell,
      analytic: null,
      ring: expandRing(cell.ring),
      holes: (cell.holes || []).map(expandRing),
    })),
  }
}

export function uniteSolids(solids) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d')
  if (list.length < 2) return { ok: false, error: 'Seleccione dos o más sólidos para unir.' }
  if (!solidsTouchOrOverlap(list)) {
    return { ok: false, error: 'Los sólidos no se tocan ni se superponen.' }
  }
  let overlap = 0
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      overlap += intersectionVolumeM3(list[i], list[j])
    }
  }
  // Intentar unión exacta; si solo hay contacto/casi contacto, expandir para fusionar aristas.
  let solid = booleanSolids(list, 'union')
  if (!solid || (overlap <= VOL_EPS && (solid.cells || []).length >= list.length)) {
    solid = booleanSolids(list.map((s) => expandSolidForUnite(s, TOUCH_XY_EPS)), 'union')
  }
  if (!solid) return { ok: false, error: 'No se pudo unir los sólidos.' }
  const sumVol = list.reduce((s, x) => s + solidVolumeM3(x), 0)
  // Sin solape real: suma exacta de operandos (el expand solo fusiona topología).
  // Con solape: volumen del boolean (sin doble conteo).
  const exact = overlap > VOL_EPS ? solidGeomVolumeM3(solid) : sumVol
  lockSolidVolume(solid, exact)
  if (!solid.color) solid.color = list.map((s) => s.color).find((c) => !!c) || '#0f766e'
  return { ok: true, solid }
}

/**
 * Elige el sólido base para sustraer: el primero de la selección que deje
 * volumen residual al quitar los demás; si ninguno, el de mayor volumen.
 */
export function pickSubtractBase(solids, orderedIds = null) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  if (!list.length) return null
  if (list.length === 1) return list[0]
  const byId = new Map(list.map((s) => [s.id, s]))
  const ordered = []
  for (const id of orderedIds || []) {
    const s = byId.get(id)
    if (s && !ordered.includes(s)) ordered.push(s)
  }
  for (const s of list) {
    if (!ordered.includes(s)) ordered.push(s)
  }
  const canBeBase = (base) => {
    const others = list.filter((s) => s.id !== base.id)
    if (!others.length) return false
    const united = others.length === 1 ? others[0] : mergeSolidsUnion(others)
    if (!united) return false
    const shared = intersectionVolumeM3(base, united)
    const baseVol = solidVolumeM3(base)
    return shared > VOL_EPS && shared < baseVol - VOL_EPS
  }
  for (const cand of ordered) {
    if (canBeBase(cand)) return cand
  }
  return [...list].sort((a, b) => solidVolumeM3(b) - solidVolumeM3(a))[0]
}

function operandSnapshot(solid, volumeM3) {
  const dims = solidFootprintDimsM(solid)
  const zr = solidZRange(solid)
  const cells = solid?.cells || []
  const analytic = cells.length === 1 ? (cells[0].analytic || null) : null
  return {
    solidId: solid?.id || null,
    color: solid?.color || null,
    nombre: solid?.nombre || null,
    volumeM3: Number(volumeM3),
    longM: dims?.longM ?? null,
    anchM: dims?.anchM ?? null,
    espesorM: dims?.heightM ?? (zr ? Math.abs(zr.z1 - zr.z0) : null),
    cotaSuperior: zr ? zr.z1 : null,
    cotaInferior: zr ? zr.z0 : null,
    analytic,
  }
}

/**
 * Sustrae uno o varios sólidos del base.
 * Funciona en cadena sobre resultados previos de Unir/Sustraer/Cortar.
 * Varios operandos a la vez: se restan todos los que compartan volumen.
 */
export function subtractSolids(baseSolid, subtractList) {
  if (!baseSolid || baseSolid.type !== 'solid3d') {
    return { ok: false, error: 'Indique el sólido base.' }
  }
  const others = (subtractList || []).filter((s) => s && s.id !== baseSolid.id)
  if (!others.length) return { ok: false, error: 'Indique al menos un sólido a descontar.' }

  let sharedTotal = 0
  const subSnapshots = []
  const withShare = []
  for (const o of others) {
    let sh = intersectionVolumeM3(baseSolid, o)
    const full = solidVolumeM3(o)
    if (full > VOL_EPS && sh >= full * 0.98) sh = full
    if (sh > VOL_EPS) {
      sharedTotal += sh
      subSnapshots.push(operandSnapshot(o, sh))
      withShare.push(o)
    }
  }
  if (!(sharedTotal > VOL_EPS) || !withShare.length) {
    return { ok: false, error: 'Los sólidos no comparten volumen; no se sustrae.' }
  }

  // Intento único (varios a la vez); si falla (geometría compleja tras booleanos),
  // sustraer en cadena uno a uno.
  let solid = booleanSolids([baseSolid, ...withShare], 'difference')
  if (!solid) {
    let acc = {
      ...baseSolid,
      cells: (baseSolid.cells || []).map((c) => ({
        ...c,
        ring: (c.ring || []).map((p) => ({ ...p })),
        holes: (c.holes || []).map((h) => h.map((p) => ({ ...p }))),
      })),
      volumeLocked: false,
      volumeM3: undefined,
    }
    for (const o of withShare) {
      const next = booleanSolids([acc, o], 'difference')
      if (!next) {
        return { ok: false, error: 'No se pudo sustraer (resultado vacío).' }
      }
      acc = next
    }
    solid = acc
  }
  if (!solid) return { ok: false, error: 'No se pudo sustraer (resultado vacío).' }
  solid.color = baseSolid.color || solid.color
  if (baseSolid.nombre) solid.nombre = baseSolid.nombre

  // Volumen mostrado = suma de valores redondeados (p. ej. 3,38 − 1,57 = 1,81).
  const baseVol = solidVolumeM3(baseSolid)
  const baseR = round2(baseVol)
  let subR = 0
  for (const snap of subSnapshots) {
    snap.volumeM3 = round2(snap.volumeM3)
    subR += snap.volumeM3
  }
  const netR = round2(baseR - subR)
  lockSolidVolume(solid, Math.max(0, netR))

  solid.booleanMeta = {
    op: 'subtract',
    base: operandSnapshot(baseSolid, baseR),
    subtracted: subSnapshots,
    netVolumeM3: solid.volumeM3,
  }
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
  lockSolidVolume(s1, solidGeomVolumeM3(s1))
  lockSolidVolume(s2, solidGeomVolumeM3(s2))
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

/** Hex #rgb/#rrggbb → rgba() con alpha. */
export function solidColorToRgba(color, alpha = 0.18, fallback = '#0f766e') {
  const raw = String(color || fallback).trim()
  const m3 = raw.match(/^#([0-9a-fA-F]{3})$/)
  const m6 = raw.match(/^#([0-9a-fA-F]{6})$/)
  let r = 15
  let g = 118
  let b = 110
  if (m6) {
    r = parseInt(m6[1].slice(0, 2), 16)
    g = parseInt(m6[1].slice(2, 4), 16)
    b = parseInt(m6[1].slice(4, 6), 16)
  } else if (m3) {
    r = parseInt(m3[1][0] + m3[1][0], 16)
    g = parseInt(m3[1][1] + m3[1][1], 16)
    b = parseInt(m3[1][2] + m3[1][2], 16)
  } else {
    const rgba = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (rgba) {
      r = Number(rgba[1])
      g = Number(rgba[2])
      b = Number(rgba[3])
    }
  }
  const a = Math.min(1, Math.max(0, Number(alpha) || 0))
  return `rgba(${r},${g},${b},${a})`
}

/** Centroide XY aproximado (bounds) de un sólido. */
export function solidCentroidXy(solid) {
  const bb = solidXyBounds(solid)
  if (!bb) return null
  return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }
}

/**
 * True si `inner` queda contenido en planta (y con solape de cotas) dentro de `outer`.
 * Usado para dibujar el interno con líneas ocultas.
 */
export function isSolidNestedIn(inner, outer) {
  if (!inner || !outer || inner.id === outer.id) return false
  const c = solidCentroidXy(inner)
  if (!c || !pointInSolidXy(outer, c.x, c.y)) return false
  const bbIn = solidXyBounds(inner)
  const bbOut = solidXyBounds(outer)
  if (!bbIn || !bbOut) return false
  if ((bbOut.w * bbOut.h) <= (bbIn.w * bbIn.h) * 1.001) return false
  let z0i = Infinity
  let z1i = -Infinity
  let z0o = Infinity
  let z1o = -Infinity
  for (const cell of inner.cells || []) {
    z0i = Math.min(z0i, Number(cell.z0) || 0, Number(cell.z1) || 0)
    z1i = Math.max(z1i, Number(cell.z0) || 0, Number(cell.z1) || 0)
  }
  for (const cell of outer.cells || []) {
    z0o = Math.min(z0o, Number(cell.z0) || 0, Number(cell.z1) || 0)
    z1o = Math.max(z1o, Number(cell.z0) || 0, Number(cell.z1) || 0)
  }
  return z1i > z0o - 1e-9 && z0i < z1o + 1e-9
}

/** True si el sólido está dentro de algún otro de la lista. */
export function solidIsInternal(solid, solids) {
  return (solids || []).some((o) => isSolidNestedIn(solid, o))
}

function signedProjectedArea(pts) {
  let a = 0
  const n = pts?.length || 0
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return a
}

function edgeKey(a, b) {
  const ax = a.x.toFixed(2)
  const ay = a.y.toFixed(2)
  const bx = b.x.toFixed(2)
  const by = b.y.toFixed(2)
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`
}

/**
 * Estilo de dibujo técnico 3D (píxeles de pantalla fijos).
 * Independiente del zoom / escala de exportación.
 */
export const SOLID3D_STYLE = Object.freeze({
  visiblePx: 1.45,
  /** Punteado occulto: un poco más grueso y contraste para que se lea sobre el fill. */
  hiddenPx: 1.35,
  selectedPx: 2.2,
  dashOnPx: 5.0,
  dashOffPx: 3.2,
  fillAlpha: 0.30,
  fillAlphaNested: 0.24,
  labelRPx: 10,
  labelFontPx: 12,
})

function parseRgb(color, fallback = '#0f766e') {
  const raw = String(color || fallback).trim()
  const m6 = raw.match(/^#([0-9a-fA-F]{6})$/)
  const m3 = raw.match(/^#([0-9a-fA-F]{3})$/)
  let r = 15
  let g = 118
  let b = 110
  if (m6) {
    r = parseInt(m6[1].slice(0, 2), 16)
    g = parseInt(m6[1].slice(2, 4), 16)
    b = parseInt(m6[1].slice(4, 6), 16)
  } else if (m3) {
    r = parseInt(m3[1][0] + m3[1][0], 16)
    g = parseInt(m3[1][1] + m3[1][1], 16)
    b = parseInt(m3[1][2] + m3[1][2], 16)
  } else {
    const rgba = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (rgba) {
      r = Number(rgba[1])
      g = Number(rgba[2])
      b = Number(rgba[3])
    }
  }
  return { r, g, b }
}

function mixRgb({ r, g, b }, factor) {
  const f = Math.min(1, Math.max(0, factor))
  return {
    r: Math.round(r * f),
    g: Math.round(g * f),
    b: Math.round(b * f),
  }
}

function rgbCss({ r, g, b }) {
  return `rgb(${r},${g},${b})`
}

/**
 * Factores de tono por cara (misma asignación en todos los sólidos).
 * >1 aclara hacia blanco; <1 oscurece. Superior la más clara, inferior la más oscura.
 */
export const FACE_TONE_FACTOR = Object.freeze({
  top: 1.38,
  bottom: 0.48,
  front: 1.0,
  back: 0.72,
  left: 0.86,
  right: 1.14,
})

/**
 * Tono gradual según normal world (nx, ny, nz).
 * Caras curvas (cilindros): interpolación suave entre las 4 laterales + top/bottom.
 */
export function faceToneFactorFromNormal(nx, ny, nz) {
  const len = Math.hypot(nx, ny, nz) || 1
  const x = nx / len
  const y = ny / len
  const z = nz / len
  if (z > 0.85) return FACE_TONE_FACTOR.top
  if (z < -0.85) return FACE_TONE_FACTOR.bottom
  // Laterales: pesos por proyección sobre ejes de cara.
  const wFront = Math.max(0, -y)
  const wBack = Math.max(0, y)
  const wLeft = Math.max(0, -x)
  const wRight = Math.max(0, x)
  const sum = wFront + wBack + wLeft + wRight || 1
  let f = (
    FACE_TONE_FACTOR.front * wFront
    + FACE_TONE_FACTOR.back * wBack
    + FACE_TONE_FACTOR.left * wLeft
    + FACE_TONE_FACTOR.right * wRight
  ) / sum
  // Ligera influencia de la inclinación hacia top/bottom.
  if (z > 0) f = f + (FACE_TONE_FACTOR.top - f) * (z * z * 0.35)
  else if (z < 0) f = f + (FACE_TONE_FACTOR.bottom - f) * (z * z * 0.35)
  return f
}

/** Aclara (factor>1) u oscurece (factor<1) el color base del sólido. */
export function shadeSolidColorRgb(color, factor = 1) {
  const base = parseRgb(color)
  const f = Number(factor)
  if (!Number.isFinite(f) || Math.abs(f - 1) < 1e-6) return base
  if (f >= 1) {
    const lift = Math.min(1, Math.max(0, (f - 1) * 1.2))
    return {
      r: Math.round(base.r + (255 - base.r) * lift),
      g: Math.round(base.g + (255 - base.g) * lift),
      b: Math.round(base.b + (255 - base.b) * lift),
    }
  }
  return mixRgb(base, Math.max(0.15, f))
}

export function solidFaceFillRgba(color, faceTone, alpha) {
  const rgb = shadeSolidColorRgb(color, faceTone)
  const a = Math.min(1, Math.max(0, Number(alpha) || 0))
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`
}

/** Arista visible: tono oscuro del color del sólido. */
export function solidEdgeStrokeColor(color, selected = false) {
  if (selected) return '#1d4ed8'
  return rgbCss(mixRgb(parseRgb(color), 0.42))
}

/** Arista oculta: tono oscuro-medio del color del sólido (legible sobre fill translúcido). */
export function solidHiddenStrokeColor(color) {
  return rgbCss(mixRgb(parseRgb(color), 0.48))
}

/**
 * Grosor en unidades del ctx para obtener `px` píxeles de pantalla.
 * `pixelScale` = escala actual del transform (zoom del editor o scale del export).
 */
export function solidLineWidthWorld(px, pixelScale = 1) {
  const s = Math.max(Number(pixelScale) || 1, 0.05)
  return Math.max(0.35, (Number(px) || 1) / s)
}

/**
 * Medidas máximas en planta (m) y altura por cotas.
 * Cilindros (elipse circular analítica): long=anch=diámetro.
 */
export function solidFootprintDimsM(solid) {
  const cells = solid?.cells || []
  if (!cells.length) return { longM: 0, anchM: 0, heightM: 0, isCylinder: false }
  let z0 = Infinity
  let z1 = -Infinity
  for (const c of cells) {
    z0 = Math.min(z0, Number(c.z0) || 0, Number(c.z1) || 0)
    z1 = Math.max(z1, Number(c.z0) || 0, Number(c.z1) || 0)
  }
  const heightM = Math.max(0, z1 - z0)
  if (cells.length === 1 && cells[0].analytic?.type === 'ellipse') {
    const rx = Math.abs(cells[0].analytic.rxM)
    const ry = Math.abs(cells[0].analytic.ryM)
    const circ = Math.abs(rx - ry) < 1e-9
    if (circ) return { longM: rx * 2, anchM: rx * 2, heightM, isCylinder: true }
    return { longM: rx * 2, anchM: ry * 2, heightM, isCylinder: false }
  }
  if (cells.length === 1 && cells[0].analytic?.type === 'rect') {
    return {
      longM: Math.abs(cells[0].analytic.wM),
      anchM: Math.abs(cells[0].analytic.hM),
      heightM,
      isCylinder: false,
    }
  }
  const bb = solidXyBounds(solid)
  if (!bb) return { longM: 0, anchM: 0, heightM, isCylinder: false }
  return {
    longM: worldToMeters(Math.abs(bb.w)),
    anchM: worldToMeters(Math.abs(bb.h)),
    heightM,
    isCylinder: false,
  }
}

/**
 * Dibuja un sólido con reglas de dibujo técnico:
 * - Caras con color + transparencia ligera (internos también, se leen a través).
 * - Aristas visibles: continua fina, tono oscuro del color.
 * - Aristas ocultas: punteada fina de trazos cortos, tono medio del color.
 * Grosores en píxeles de pantalla vía `pixelScale` (no dependen del zoom aparente).
 */
export function drawSolid3d(ctx, solid, {
  viewId = 'top',
  cotaRefM = 0,
  selected = false,
  zoom = 1,
  pixelScale = null,
  orbit = null,
  solids = null,
  nested = null,
  pass = 'all', // 'fills' | 'edges' | 'edges-visible' | 'edges-hidden' | 'all'
} = {}) {
  if (!ctx || !solid?.cells?.length) return
  const base = solid.color || '#0f766e'
  const strokeVis = solidEdgeStrokeColor(base, selected)
  const strokeHid = solidHiddenStrokeColor(base)
  const isNested = nested != null ? !!nested : solidIsInternal(solid, solids)
  const fillAlpha = isNested ? SOLID3D_STYLE.fillAlphaNested : SOLID3D_STYLE.fillAlpha
  const useOrbit = !!(orbit && Number.isFinite(orbit.yaw) && Number.isFinite(orbit.pitch))
  const flatTop = !useOrbit && viewId === 'top'
  const flatBottom = !useOrbit && viewId === 'bottom'
  // pixelScale = escala del transform del ctx; si no viene, usar zoom del editor.
  const pScale = Math.max(Number(pixelScale != null ? pixelScale : zoom) || 1, 0.05)
  const lwVis = solidLineWidthWorld(
    selected ? SOLID3D_STYLE.selectedPx : SOLID3D_STYLE.visiblePx,
    pScale,
  )
  const lwHid = solidLineWidthWorld(SOLID3D_STYLE.hiddenPx, pScale)
  const dash = [
    solidLineWidthWorld(SOLID3D_STYLE.dashOnPx, pScale),
    solidLineWidthWorld(SOLID3D_STYLE.dashOffPx, pScale),
  ]
  const doFills = pass === 'all' || pass === 'fills'
  const doEdgesVis = pass === 'all' || pass === 'edges' || pass === 'edges-visible'
  const doEdgesHid = pass === 'all' || pass === 'edges' || pass === 'edges-hidden'
  const doEdges = doEdgesVis || doEdgesHid

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Vista superior/inferior ortográfica: un solo plano → tono de esa cara.
  if (flatTop || flatBottom) {
    const planeTone = flatTop ? FACE_TONE_FACTOR.top : FACE_TONE_FACTOR.bottom
    const fill = solidFaceFillRgba(base, planeTone, fillAlpha)
    for (const cell of solid.cells) {
      const zPlane = flatTop
        ? Math.max(cell.z0, cell.z1)
        : Math.min(cell.z0, cell.z1)
      const ring = (cell.ring || []).map((p) => projectPt(p, zPlane, viewId, cotaRefM, orbit))
      const holes = (cell.holes || []).map((hole) => (
        hole.map((p) => projectPt(p, zPlane, viewId, cotaRefM, orbit))
      ))
      if (doFills) {
        pathRingWithHoles(ctx, ring, holes)
        ctx.fillStyle = fill
        ctx.fill('evenodd')
      }
      if (doEdgesVis) {
        pathRing(ctx, ring)
        ctx.strokeStyle = strokeVis
        ctx.lineWidth = lwVis
        ctx.setLineDash([])
        ctx.stroke()
      }
      if (doEdgesHid) {
        for (const hole of holes) {
          pathRing(ctx, hole)
          ctx.strokeStyle = strokeHid
          ctx.lineWidth = lwHid
          ctx.setLineDash(dash)
          ctx.stroke()
        }
      }
    }
    ctx.setLineDash([])
    ctx.restore()
    return
  }

  // Alzados ortográficos (front/back/left/right): rellenar la cara cercana con su
  // tono fijo y luego dibujar aristas del prisma (profundidad de proyección).
  const flatElevId = !useOrbit ? normalizeViewId(viewId) : null
  const flatElev = flatElevId === 'front' || flatElevId === 'back'
    || flatElevId === 'left' || flatElevId === 'side' || flatElevId === 'right'
  if (flatElev && doFills) {
    let elevTone = FACE_TONE_FACTOR.front
    if (flatElevId === 'back') elevTone = FACE_TONE_FACTOR.back
    else if (flatElevId === 'left' || flatElevId === 'side') elevTone = FACE_TONE_FACTOR.left
    else if (flatElevId === 'right') elevTone = FACE_TONE_FACTOR.right
    const bb = solidAabbWorld(solid)
    if (bb) {
      const { minX, maxX, minY, maxY, minZ, maxZ } = bb
      let face3d
      if (flatElevId === 'front') {
        face3d = [
          { x: minX, y: minY, zCota: minZ },
          { x: maxX, y: minY, zCota: minZ },
          { x: maxX, y: minY, zCota: maxZ },
          { x: minX, y: minY, zCota: maxZ },
        ]
      } else if (flatElevId === 'back') {
        face3d = [
          { x: minX, y: maxY, zCota: minZ },
          { x: maxX, y: maxY, zCota: minZ },
          { x: maxX, y: maxY, zCota: maxZ },
          { x: minX, y: maxY, zCota: maxZ },
        ]
      } else if (flatElevId === 'left' || flatElevId === 'side') {
        face3d = [
          { x: minX, y: minY, zCota: minZ },
          { x: minX, y: maxY, zCota: minZ },
          { x: minX, y: maxY, zCota: maxZ },
          { x: minX, y: minY, zCota: maxZ },
        ]
      } else {
        face3d = [
          { x: maxX, y: minY, zCota: minZ },
          { x: maxX, y: maxY, zCota: minZ },
          { x: maxX, y: maxY, zCota: maxZ },
          { x: maxX, y: minY, zCota: maxZ },
        ]
      }
      const face2d = face3d.map((p) => projectPt(p, p.zCota, viewId, cotaRefM, orbit))
      pathRing(ctx, face2d)
      ctx.fillStyle = solidFaceFillRgba(base, elevTone, fillAlpha)
      ctx.fill()
    }
    // Continuar para aristas (y fills internos en iso no aplica aquí).
    // En alzado ortográfico el fill de caras laterales del painter se omite
    // para no tapar el tono de la cara vista; solo aristas abajo.
  }

  const facePolys = []
  const faceWithHoles = []
  const edgeMap = new Map()

  const addEdge = (pa, pb, front) => {
    const k = edgeKey(pa, pb)
    let e = edgeMap.get(k)
    if (!e) {
      e = { a: pa, b: pb, frontVotes: 0, backVotes: 0 }
      edgeMap.set(k, e)
    }
    if (front) e.frontVotes += 1
    else e.backVotes += 1
  }

  const emitPrismFaces = (ringBot, ringTop, holesBot = [], holesTop = [], worldRing = null, zBottom = 0, zTop = 0) => {
    const n = ringBot.length
    const lastDup = n > 1
      && Math.hypot(ringBot[0].x - ringBot[n - 1].x, ringBot[0].y - ringBot[n - 1].y) < 1e-6
    const edgeCount = lastDup ? n - 1 : n
    const wr = worldRing || []

    for (let i = 0; i < edgeCount; i += 1) {
      const j = (i + 1) % edgeCount
      const pts = [ringBot[i], ringBot[j], ringTop[j], ringTop[i]]
      const depth = pts.reduce((s, q) => s + (q.depth || 0), 0) / 4
      const front = signedProjectedArea(pts) < 0
      let tone = FACE_TONE_FACTOR.front
      if (wr[i] && wr[j]) {
        const ax = wr[j].x - wr[i].x
        const ay = wr[j].y - wr[i].y
        // Normal outward aproximada en planta (perpendicular a la arista, Z=0 para pared).
        const nx = ay
        const ny = -ax
        tone = faceToneFactorFromNormal(nx, ny, 0)
      }
      facePolys.push({ pts, depth, front, tone })
      addEdge(ringBot[i], ringBot[j], front)
      addEdge(ringTop[j], ringTop[i], front)
      addEdge(ringBot[i], ringTop[i], front)
      addEdge(ringBot[j], ringTop[j], front)
    }
    const topPts = ringTop.slice(0, edgeCount)
    const botPts = ringBot.slice(0, edgeCount)
    const holeTops = holesTop.map((h) => {
      const hn = h.length
      const dup = hn > 1 && Math.hypot(h[0].x - h[hn - 1].x, h[0].y - h[hn - 1].y) < 1e-6
      return h.slice(0, dup ? hn - 1 : hn)
    }).filter((h) => h.length >= 3)
    const holeBots = holesBot.map((h) => {
      const hn = h.length
      const dup = hn > 1 && Math.hypot(h[0].x - h[hn - 1].x, h[0].y - h[hn - 1].y) < 1e-6
      return h.slice(0, dup ? hn - 1 : hn)
    }).filter((h) => h.length >= 3)

    if (topPts.length >= 3) {
      const depth = topPts.reduce((s, q) => s + (q.depth || 0), 0) / topPts.length
      const front = signedProjectedArea(topPts) < 0
      const tone = FACE_TONE_FACTOR.top
      if (holeTops.length) {
        faceWithHoles.push({ outer: topPts, holes: holeTops, depth, front, tone })
      } else {
        facePolys.push({ pts: topPts, depth, front, tone })
      }
      for (let i = 0; i < edgeCount; i += 1) {
        addEdge(topPts[i], topPts[(i + 1) % edgeCount], front)
      }
      for (const hole of holeTops) {
        for (let i = 0; i < hole.length; i += 1) {
          addEdge(hole[i], hole[(i + 1) % hole.length], front)
        }
      }
    }
    if (botPts.length >= 3) {
      const depth = botPts.reduce((s, q) => s + (q.depth || 0), 0) / botPts.length
      const front = signedProjectedArea(botPts) < 0
      const tone = FACE_TONE_FACTOR.bottom
      if (holeBots.length) {
        faceWithHoles.push({ outer: botPts, holes: holeBots, depth, front, tone })
      } else {
        facePolys.push({ pts: botPts, depth, front, tone })
      }
      for (let i = 0; i < edgeCount; i += 1) {
        addEdge(botPts[i], botPts[(i + 1) % edgeCount], front)
      }
      for (const hole of holeBots) {
        for (let i = 0; i < hole.length; i += 1) {
          addEdge(hole[i], hole[(i + 1) % hole.length], front)
        }
      }
    }
    void zBottom
    void zTop
  }

  for (const cell of solid.cells) {
    const zBottom = Math.min(cell.z0, cell.z1)
    const zTop = Math.max(cell.z0, cell.z1)
    const worldRing = cell.ring || []
    const ringBot = worldRing.map((p) => projectPt(p, zBottom, viewId, cotaRefM, orbit))
    const ringTop = worldRing.map((p) => projectPt(p, zTop, viewId, cotaRefM, orbit))
    const holesBot = (cell.holes || []).map((hole) => (
      hole.map((p) => projectPt(p, zBottom, viewId, cotaRefM, orbit))
    ))
    const holesTop = (cell.holes || []).map((hole) => (
      hole.map((p) => projectPt(p, zTop, viewId, cotaRefM, orbit))
    ))
    emitPrismFaces(ringBot, ringTop, holesBot, holesTop, worldRing, zBottom, zTop)

    // Paredes interiores del vacío (orientación invertida respecto al contorno exterior).
    for (let hi = 0; hi < holesBot.length; hi += 1) {
      const hb = holesBot[hi]
      const ht = holesTop[hi]
      const wh = (cell.holes || [])[hi] || []
      if (!hb?.length || !ht?.length) continue
      const hn = hb.length
      const lastDup = hn > 1
        && Math.hypot(hb[0].x - hb[hn - 1].x, hb[0].y - hb[hn - 1].y) < 1e-6
      const edgeCount = lastDup ? hn - 1 : hn
      for (let i = 0; i < edgeCount; i += 1) {
        const j = (i + 1) % edgeCount
        const pts = [hb[i], ht[i], ht[j], hb[j]]
        const depth = pts.reduce((s, q) => s + (q.depth || 0), 0) / 4
        const front = signedProjectedArea(pts) < 0
        let tone = FACE_TONE_FACTOR.back
        if (wh[i] && wh[j]) {
          const ax = wh[j].x - wh[i].x
          const ay = wh[j].y - wh[i].y
          // Interior: normal hacia adentro del vacío (= hacia el sólido).
          tone = faceToneFactorFromNormal(-ay, ax, 0)
        }
        facePolys.push({ pts, depth, front, tone })
        addEdge(hb[i], hb[j], front)
        addEdge(ht[j], ht[i], front)
        addEdge(hb[i], ht[i], front)
        addEdge(hb[j], ht[j], front)
      }
    }
  }

  // En alzados ortográficos el fill principal ya se pintó con el tono de la cara
  // vista; el painter multi-cara taparía frontal/posterior con el mismo rectángulo.
  if (doFills && !flatElev) {
    const allFaces = [
      ...facePolys.map((f) => ({ ...f, kind: 'solid' })),
      ...faceWithHoles.map((f) => ({ ...f, kind: 'holes' })),
    ].sort((a, b) => a.depth - b.depth)
    for (const f of allFaces) {
      ctx.fillStyle = solidFaceFillRgba(base, f.tone ?? 1, fillAlpha)
      if (f.kind === 'holes') {
        pathRingWithHoles(ctx, f.outer, f.holes)
        ctx.fill('evenodd')
      } else {
        pathRing(ctx, f.pts)
        ctx.fill()
      }
    }
  }

  if (doEdgesVis) {
    for (const e of edgeMap.values()) {
      const hidden = e.frontVotes === 0 && e.backVotes > 0
      if (hidden) continue
      ctx.strokeStyle = strokeVis
      ctx.lineWidth = lwVis
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(e.a.x, e.a.y)
      ctx.lineTo(e.b.x, e.b.y)
      ctx.stroke()
    }
  }
  if (doEdgesHid) {
    // Ocultas al final (sobre el fill) para que el punteado se lea con claridad.
    for (const e of edgeMap.values()) {
      const hidden = e.frontVotes === 0 && e.backVotes > 0
      if (!hidden) continue
      ctx.strokeStyle = strokeHid
      ctx.lineWidth = lwHid
      ctx.setLineDash(dash)
      ctx.beginPath()
      ctx.moveTo(e.a.x, e.a.y)
      ctx.lineTo(e.b.x, e.b.y)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  ctx.restore()
}

/** Centroide proyectado aproximado de un sólido (para etiquetas #). */
export function solidProjectedCentroid(solid, viewId = 'top', cotaRefM = 0, orbit = null) {
  const pts = []
  for (const cell of solid?.cells || []) {
    const z0 = Math.min(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const z1 = Math.max(Number(cell.z0) || 0, Number(cell.z1) || 0)
    const zMid = (z0 + z1) / 2
    for (const p of cell.ring || []) {
      pts.push(projectPt(p, zMid, viewId, cotaRefM, orbit))
    }
  }
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  let sd = 0
  for (const q of pts) {
    sx += q.x
    sy += q.y
    sd += q.depth || 0
  }
  return { x: sx / pts.length, y: sy / pts.length, depth: sd / pts.length }
}

/**
 * Dibuja etiquetas numeradas (círculo + #) sin solaparse.
 * `labels`: [{ solidId, num }]
 */
export function drawSolidNumberLabels(ctx, solids, {
  labels = [],
  viewId = 'top',
  cotaRefM = 0,
  orbit = null,
  pixelScale = 1,
  labelScale = 1,
} = {}) {
  if (!ctx || !labels?.length) return
  const list = solids || []
  const pScale = Math.max(Number(pixelScale) || 1, 0.05)
  const ls = Math.max(0.75, Math.min(2.5, Number(labelScale) || 1))
  const r = solidLineWidthWorld(SOLID3D_STYLE.labelRPx * ls, pScale)
  const fontPx = SOLID3D_STYLE.labelFontPx * ls
  const fontWorld = solidLineWidthWorld(fontPx, pScale)
  const placed = []
  const minDist = r * 2.4

  const anchors = labels.map((lb) => {
    const solid = list.find((s) => s.id === lb.solidId)
    const c = solid ? solidProjectedCentroid(solid, viewId, cotaRefM, orbit) : null
    return { ...lb, solid, c }
  }).filter((a) => a.c && a.solid)

  // Empuje simple para evitar solapes
  for (let iter = 0; iter < 8; iter += 1) {
    for (let i = 0; i < anchors.length; i += 1) {
      for (let j = i + 1; j < anchors.length; j += 1) {
        const a = anchors[i].c
        const b = anchors[j].c
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 0.01
        if (d < minDist) {
          const push = (minDist - d) / 2
          const ux = dx / d
          const uy = dy / d
          a.x -= ux * push
          a.y -= uy * push
          b.x += ux * push
          b.y += uy * push
        }
      }
    }
  }

  ctx.save()
  for (const a of anchors) {
    const { x, y } = a.c
    const color = a.solid.color || '#0f766e'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = solidEdgeStrokeColor(color)
    ctx.lineWidth = solidLineWidthWorld(1.2, pScale)
    ctx.setLineDash([])
    ctx.stroke()
    ctx.fillStyle = solidEdgeStrokeColor(color)
    ctx.font = `bold ${fontWorld}px "Segoe UI", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(a.num), x, y + fontWorld * 0.05)
    placed.push(a)
  }
  ctx.restore()
  return placed
}

/**
 * Orden de pintado legible:
 * 1) externos (mayor área) fills → 2) internos fills → 3) todos edges → 4) etiquetas.
 * Cada sólido conserva su color en caras y aristas.
 */
export function drawSolids3dLayered(ctx, solids, opts = {}) {
  const list = (solids || []).filter((s) => s?.type === 'solid3d' && s.cells?.length)
  const areaOf = (s) => {
    const bb = solidXyBounds(s)
    return bb ? Math.abs(bb.w * bb.h) : 0
  }
  const outers = []
  const inners = []
  for (const s of list) {
    if (solidIsInternal(s, list)) inners.push(s)
    else outers.push(s)
  }
  outers.sort((a, b) => areaOf(b) - areaOf(a))
  inners.sort((a, b) => areaOf(b) - areaOf(a))

  const base = { ...opts, solids: list }
  // Capas: fills → aristas visibles → aristas ocultas (punteado legible sobre el fill).
  for (const s of outers) {
    drawSolid3d(ctx, s, { ...base, nested: false, pass: 'fills' })
  }
  for (const s of inners) {
    drawSolid3d(ctx, s, { ...base, nested: true, pass: 'fills' })
  }
  for (const s of outers) {
    drawSolid3d(ctx, s, { ...base, nested: false, pass: 'edges-visible' })
  }
  for (const s of inners) {
    drawSolid3d(ctx, s, { ...base, nested: true, pass: 'edges-visible' })
  }
  for (const s of outers) {
    drawSolid3d(ctx, s, { ...base, nested: false, pass: 'edges-hidden' })
  }
  for (const s of inners) {
    drawSolid3d(ctx, s, { ...base, nested: true, pass: 'edges-hidden' })
  }
  if (opts.labels?.length) {
    drawSolidNumberLabels(ctx, list, {
      labels: opts.labels,
      viewId: opts.viewId || 'top',
      cotaRefM: opts.cotaRefM || 0,
      orbit: opts.orbit || null,
      pixelScale: opts.pixelScale != null ? opts.pixelScale : opts.zoom,
      labelScale: opts.labelScale != null ? opts.labelScale : 1,
    })
  }
}

/**
 * Hit-test de sólido en coordenadas de lienzo según la vista / cámara activa.
 * @param {object|null} orbit misma cámara que drawSolid3d (ángulos + centro).
 */
export function hitSolidAtView(solid, canvasPt, viewId = 'top', cotaRefM = 0, orbit = null) {
  if (!solid?.cells?.length || !canvasPt) return false
  // Planta sin órbita: hit en XY world (coincide con el contorno fuente).
  if (!orbit && viewId === 'top') return pointInSolidXy(solid, canvasPt.x, canvasPt.y)
  for (const cell of solid.cells) {
    const z0 = Math.min(cell.z0, cell.z1)
    const z1 = Math.max(cell.z0, cell.z1)
    const pts = []
    for (const p of cell.ring || []) {
      pts.push(projectPt(p, z0, viewId, cotaRefM, orbit))
      pts.push(projectPt(p, z1, viewId, cotaRefM, orbit))
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

function projectPt(p, zCota, viewId, cotaRefM, orbit = null) {
  return projectWorld3dToCanvas(
    { x: p.x, y: p.y, zCota },
    viewId,
    cotaRefM,
    orbit,
  )
}

function pathRing(ctx, ring) {
  if (!ring?.length) return
  ctx.beginPath()
  ctx.moveTo(ring[0].x, ring[0].y)
  for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y)
  ctx.closePath()
}

/** Contorno + huecos en un solo path (relleno evenodd = cavidad visible). */
function pathRingWithHoles(ctx, outer, holes = []) {
  if (!outer?.length) return
  ctx.beginPath()
  ctx.moveTo(outer[0].x, outer[0].y)
  for (let i = 1; i < outer.length; i += 1) ctx.lineTo(outer[i].x, outer[i].y)
  ctx.closePath()
  for (const hole of holes || []) {
    if (!hole?.length) continue
    ctx.moveTo(hole[0].x, hole[0].y)
    for (let i = 1; i < hole.length; i += 1) ctx.lineTo(hole[i].x, hole[i].y)
    ctx.closePath()
  }
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
