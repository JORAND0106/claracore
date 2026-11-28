/**
 * Acotado 3D: medida real entre dos puntos del espacio, visible en todas las vistas.
 * kind: 'linear3d' — texto = distancia 3D (m); x1/y1/x2/y2 = proyección de la vista activa.
 */
import {
  DEFAULT_COTA_OFFSET,
  formatMeters,
  metersToWorld,
  worldToMeters,
} from './esquemaGeometry.js'
import { projectWorld3dToCanvas, normalizeViewId } from './esquema3dViews.js'
import { solidOsnapPoints } from './esquema3dSolids.js'

export function isCota3d(obj) {
  return !!(obj && obj.type === 'cota' && (obj.kind === 'linear3d' || obj.worldA || obj.worldB))
}

/** Distancia euclídea real en metros (XY en px mundo → m; Z ya en m). */
export function distance3dMeters(a, b) {
  const ax = Number(a?.x) || 0
  const ay = Number(a?.y) || 0
  const az = Number(a?.zCota) || 0
  const bx = Number(b?.x) || 0
  const by = Number(b?.y) || 0
  const bz = Number(b?.zCota) || 0
  const dx = worldToMeters(ax - bx)
  const dy = worldToMeters(ay - by)
  const dz = az - bz
  return Math.hypot(dx, dy, dz)
}

/** Formato de metros reales (no píxeles mundo). */
export function formatRealMeters(meters, digits) {
  const m = Number(meters)
  if (!Number.isFinite(m)) return ''
  // Reutiliza la misma regla de decimales que formatMeters vía px mundo.
  return formatMeters(metersToWorld(m), digits)
}

export function cota3dText(obj) {
  if (!obj) return ''
  const m = Number.isFinite(Number(obj.meters))
    ? Number(obj.meters)
    : distance3dMeters(obj.worldA, obj.worldB)
  return formatRealMeters(m)
}

function cloneWorld(w) {
  if (!w) return null
  return {
    x: Number(w.x) || 0,
    y: Number(w.y) || 0,
    zCota: Number(w.zCota) || 0,
  }
}

function makeBind(pt) {
  if (!pt?.world) return null
  const solidId = pt.solidId || pt.bind?.solidId || null
  if (!solidId) {
    return { solidId: null, kind: pt.snapKind || pt.kind || null, world: cloneWorld(pt.world) }
  }
  return {
    solidId,
    kind: pt.snapKind || pt.kind || null,
    world: cloneWorld(pt.world),
  }
}

/**
 * Crea cota lineal 3D a partir de dos anclas (world + canvas proyectado).
 * `a`/`b` pueden ser { x, y, world, solidId, kind } o world puro + canvasA/B.
 */
export function createCota3d(a, b, extras = {}) {
  const worldA = cloneWorld(a?.world || a)
  const worldB = cloneWorld(b?.world || b)
  const canvasA = extras.canvasA || (a?.x != null ? { x: a.x, y: a.y } : null)
  const canvasB = extras.canvasB || (b?.x != null ? { x: b.x, y: b.y } : null)
  const meters = distance3dMeters(worldA, worldB)
  const obj = {
    type: 'cota',
    kind: 'linear3d',
    x1: canvasA?.x ?? 0,
    y1: canvasA?.y ?? 0,
    x2: canvasB?.x ?? 0,
    y2: canvasB?.y ?? 0,
    worldA,
    worldB,
    meters,
    bindA: extras.bindA !== undefined ? extras.bindA : makeBind(a),
    bindB: extras.bindB !== undefined ? extras.bindB : makeBind(b),
    offset: Number.isFinite(extras.offset) ? extras.offset : DEFAULT_COTA_OFFSET,
    color: extras.color || extras.ink || undefined,
    width: extras.width != null ? extras.width : 1,
    rotation: 0,
    viewPlane: extras.viewPlane || null,
  }
  obj.text = extras.text || formatRealMeters(meters)
  return obj
}

/** Proyecta worldA/worldB a x1..y2 de la vista (conserva offset/texto). */
export function projectCota3dForView(obj, viewId, orbit = null, cotaRefM = 0) {
  if (!isCota3d(obj) || !obj.worldA || !obj.worldB) return obj
  const vid = normalizeViewId(viewId || 'top')
  const a = projectWorld3dToCanvas(obj.worldA, vid, cotaRefM, orbit)
  const b = projectWorld3dToCanvas(obj.worldB, vid, cotaRefM, orbit)
  const meters = distance3dMeters(obj.worldA, obj.worldB)
  return {
    ...obj,
    kind: 'linear3d',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    meters,
    text: obj.textLocked ? obj.text : formatRealMeters(meters),
  }
}

function worldDist3(a, b) {
  return distance3dMeters(a, b)
}

/**
 * Reesuelve un ancla amarrada al OSNAP del sólido más cercano (mismo kind preferido).
 * Si el sólido desapareció, conserva el world guardado.
 */
export function resolveCota3dBind(bind, solids, viewId = 'top', orbit = null) {
  if (!bind?.solidId) return bind?.world ? cloneWorld(bind.world) : null
  const solid = (solids || []).find((s) => s && s.id === bind.solidId)
  if (!solid) return bind.world ? cloneWorld(bind.world) : null
  const snaps = solidOsnapPoints(solid, viewId, 0, orbit)
  if (!snaps.length) return bind.world ? cloneWorld(bind.world) : null
  const pref = bind.kind
  const prev = bind.world
  let best = null
  let bestD = Infinity
  for (const sp of snaps) {
    if (!sp?.world) continue
    // Preferir mismo kind; si no hay, cualquier OSNAP cercano.
    const kindPenalty = pref && sp.kind !== pref ? 1e6 : 0
    const d = (prev ? worldDist3(sp.world, prev) : 0) + kindPenalty
    if (d < bestD) {
      bestD = d
      best = sp
    }
  }
  // Si el kind preferido quedó muy lejos tras redimensionar, aceptar el más cercano sin penalty.
  if (!best || (pref && bestD >= 1e6)) {
    best = null
    bestD = Infinity
    for (const sp of snaps) {
      if (!sp?.world) continue
      const d = prev ? worldDist3(sp.world, prev) : 0
      if (d < bestD) {
        bestD = d
        best = sp
      }
    }
  }
  return best?.world ? cloneWorld(best.world) : (prev ? cloneWorld(prev) : null)
}

/**
 * Sincroniza cotas 3D amarradas tras mover/editar sólidos.
 * Actualiza worldA/B, meters, text y proyección 2D de la vista indicada.
 */
export function syncBoundCotas3d(objects, solids, {
  viewId = 'top',
  orbit = null,
  cotaRefM = 0,
} = {}) {
  const list = objects || []
  let changed = false
  const next = list.map((obj) => {
    if (!isCota3d(obj)) return obj
    let worldA = cloneWorld(obj.worldA)
    let worldB = cloneWorld(obj.worldB)
    let bindA = obj.bindA || null
    let bindB = obj.bindB || null
    if (bindA?.solidId) {
      const w = resolveCota3dBind(bindA, solids, viewId, orbit)
      if (w) {
        worldA = w
        bindA = { ...bindA, world: w }
      }
    }
    if (bindB?.solidId) {
      const w = resolveCota3dBind(bindB, solids, viewId, orbit)
      if (w) {
        worldB = w
        bindB = { ...bindB, world: w }
      }
    }
    const meters = distance3dMeters(worldA, worldB)
    const projected = projectCota3dForView({
      ...obj,
      worldA,
      worldB,
      meters,
      bindA,
      bindB,
    }, viewId, orbit, cotaRefM)
    const same = (
      Math.abs((obj.worldA?.x || 0) - (worldA?.x || 0)) < 1e-9
      && Math.abs((obj.worldA?.y || 0) - (worldA?.y || 0)) < 1e-9
      && Math.abs((obj.worldA?.zCota || 0) - (worldA?.zCota || 0)) < 1e-9
      && Math.abs((obj.worldB?.x || 0) - (worldB?.x || 0)) < 1e-9
      && Math.abs((obj.worldB?.y || 0) - (worldB?.y || 0)) < 1e-9
      && Math.abs((obj.worldB?.zCota || 0) - (worldB?.zCota || 0)) < 1e-9
      && Math.abs((obj.meters || 0) - meters) < 1e-9
      && obj.x1 === projected.x1 && obj.y1 === projected.y1
      && obj.x2 === projected.x2 && obj.y2 === projected.y2
    )
    if (same) return obj
    changed = true
    return projected
  })
  return { objects: next, changed }
}

/** ¿El punto de snap (o world) sirve para crear cota 3D? */
export function snapHasWorld3d(pt) {
  return !!(pt && pt.world && Number.isFinite(Number(pt.world.x)) && Number.isFinite(Number(pt.world.y)))
}
