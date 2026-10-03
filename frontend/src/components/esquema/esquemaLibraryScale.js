/**
 * Escala real (metros) de entidades de la biblioteca de esquema.
 * El lienzo usa world = metros * PX_PER_METER; las cotas ya leen worldToMeters.
 */
import {
  metersToWorld,
  objectCenterOf,
  scaleObjectUniform,
  worldToMeters,
} from './esquemaGeometry.js'
import {
  instantiateLibraryItem,
  loadLibrary,
  objectsBounds,
  packLibraryBlock,
} from './esquemaLibrary.js'

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch { /* ignore */ }
  return null
}

function libraryStorageKey(contratoId) {
  return `cc_esquema_biblioteca_${contratoId}`
}

function persistLibrary(contratoId, items) {
  const cid = contratoId != null ? String(contratoId) : null
  const store = storage()
  if (!cid || !store) return
  store.setItem(libraryStorageKey(cid), JSON.stringify(items))
}

function parsePositiveMeters(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** ¿La entidad ya tiene medidas reales en metros? */
export function libraryItemHasRealMeasures(item) {
  if (!item) return false
  if (item.medidas_reales === false) return false
  if (item.medidas_reales === true) {
    const w = Number(item.ancho_m)
    const h = Number(item.alto_m)
    return (Number.isFinite(w) && w > 0) || (Number.isFinite(h) && h > 0)
  }
  // Legacy sin flag: pendiente de calibración
  return false
}

/** Dimensiones en metros del bbox de los objetos (coords mundo actuales). */
export function measuresFromObjects(objects) {
  const packed = packLibraryBlock(objects)
  return {
    packed,
    ancho_m: worldToMeters(packed.w),
    alto_m: worldToMeters(packed.h),
  }
}

/**
 * Escala objetos empaquetados para que el ancho o alto del bbox sea `metros`.
 * @param {'ancho'|'alto'} axis
 * @returns {{ children: object[], w: number, h: number, ancho_m: number, alto_m: number, factor: number }|null}
 */
export function calibrateObjectsToMeters(objects, axis, metros) {
  const m = parsePositiveMeters(metros)
  if (!m) return null
  const packed = packLibraryBlock(objects)
  const refWorld = axis === 'alto' ? packed.h : packed.w
  if (!(refWorld > 1e-9)) return null
  const targetWorld = metersToWorld(m)
  const factor = targetWorld / refWorld
  if (!(factor > 0) || !Number.isFinite(factor)) return null
  const center = { x: packed.w / 2, y: packed.h / 2 }
  const scaled = (packed.children || []).map((ch) => scaleObjectUniform(ch, factor, center))
  const repacked = packLibraryBlock(scaled)
  return {
    children: repacked.children,
    w: repacked.w,
    h: repacked.h,
    ancho_m: worldToMeters(repacked.w),
    alto_m: worldToMeters(repacked.h),
    factor,
  }
}

/**
 * Normaliza un ítem de biblioteca: si tiene medidas reales, asegura que el
 * bbox mundo coincida con ancho_m × alto_m (corrige drift).
 */
export function normalizeLibraryItemToMeters(item) {
  if (!libraryItemHasRealMeasures(item)) return item
  const objs = item.objects || item.children || []
  const packed = packLibraryBlock(objs)
  const targetW = Number(item.ancho_m) > 0 ? metersToWorld(item.ancho_m) : packed.w
  const targetH = Number(item.alto_m) > 0 ? metersToWorld(item.alto_m) : packed.h
  // Usar el factor del eje con medida conocida; si ambos, promedio de factores
  const fx = packed.w > 1e-9 ? targetW / packed.w : 1
  const fy = packed.h > 1e-9 ? targetH / packed.h : 1
  const factor = Number.isFinite(item.ancho_m) && Number.isFinite(item.alto_m) && item.ancho_m > 0 && item.alto_m > 0
    ? (fx + fy) / 2
    : (Number(item.ancho_m) > 0 ? fx : fy)
  if (Math.abs(factor - 1) < 1e-6) {
    return {
      ...item,
      objects: packed.children,
      w: packed.w,
      h: packed.h,
      medidas_reales: true,
      ancho_m: worldToMeters(packed.w),
      alto_m: worldToMeters(packed.h),
    }
  }
  const center = { x: packed.w / 2, y: packed.h / 2 }
  const scaled = packed.children.map((ch) => scaleObjectUniform(ch, factor, center))
  const repacked = packLibraryBlock(scaled)
  return {
    ...item,
    objects: repacked.children,
    w: repacked.w,
    h: repacked.h,
    medidas_reales: true,
    ancho_m: worldToMeters(repacked.w),
    alto_m: worldToMeters(repacked.h),
  }
}

/**
 * Calibra un ítem de la biblioteca (una sola vez) y lo persiste.
 * @returns {{ items: object[], item: object }|null}
 */
export function calibrateLibraryItem(contratoId, itemId, { axis = 'ancho', metros } = {}) {
  const cid = contratoId != null ? String(contratoId) : null
  if (!cid || !itemId) return null
  const items = loadLibrary(cid)
  const idx = items.findIndex((it) => String(it.id) === String(itemId))
  if (idx < 0) return null
  const prev = items[idx]
  const calibrated = calibrateObjectsToMeters(prev.objects || prev.children || [], axis, metros)
  if (!calibrated) return null
  const nextItem = {
    ...prev,
    objects: calibrated.children,
    w: calibrated.w,
    h: calibrated.h,
    medidas_reales: true,
    ancho_m: calibrated.ancho_m,
    alto_m: calibrated.alto_m,
    calibrado_en: new Date().toISOString(),
    calibrado_eje: axis,
    calibrado_metros: parsePositiveMeters(metros),
  }
  const next = items.slice()
  next[idx] = nextItem
  persistLibrary(cid, next)
  return { items: next, item: nextItem }
}

/** ¿Se puede insertar en el plano (mapa / huella)? */
export function canInsertLibraryItemOnPlane(item) {
  return libraryItemHasRealMeasures(item)
}

/**
 * Instancia bloque a escala real, centrado en `at`, con escala bloqueada.
 */
export function instantiateLibraryItemAtRealScale(item, at, extras = {}) {
  if (!item) return []
  const normalized = libraryItemHasRealMeasures(item)
    ? normalizeLibraryItemToMeters(item)
    : item
  const placed = instantiateLibraryItem(normalized, at)
  return placed.map((b) => ({
    ...b,
    libraryId: item.id,
    libraryNombre: item.nombre,
    scaleLocked: true,
    medidas_reales: libraryItemHasRealMeasures(normalized),
    ancho_m: normalized.ancho_m ?? worldToMeters(b.w),
    alto_m: normalized.alto_m ?? worldToMeters(b.h),
    ...extras,
  }))
}

/**
 * Reemplaza un bloque insertado por la geometría calibrada de la biblioteca,
 * conservando centro y rotación.
 */
export function rescaleBloqueToLibraryItem(bloque, item) {
  if (!bloque || bloque.type !== 'bloque' || !libraryItemHasRealMeasures(item)) return bloque
  const center = objectCenterOf(bloque)
  const placed = instantiateLibraryItemAtRealScale(item, center, {
    fromLibraryOnNode: !!bloque.fromLibraryOnNode,
    rotation: bloque.rotation || 0,
    id: bloque.id,
    color: bloque.color,
  })
  return placed[0] || bloque
}

/** Corrige todos los bloques de escena cuyo libraryId ya tiene medidas reales. */
export function syncSceneBloquesToLibrary(objects, libraryItems) {
  const byId = new Map((libraryItems || []).map((it) => [String(it.id), it]))
  let changed = false
  const next = (objects || []).map((o) => {
    if (!o || o.type !== 'bloque' || !o.libraryId) return o
    const item = byId.get(String(o.libraryId))
    if (!libraryItemHasRealMeasures(item)) return o
    const targetW = metersToWorld(item.ancho_m)
    const targetH = metersToWorld(item.alto_m)
    const tol = 0.5 // ~1 cm en world (PX_PER_METER=50)
    if (Math.abs((o.w || 0) - targetW) < tol && Math.abs((o.h || 0) - targetH) < tol && o.medidas_reales) {
      return { ...o, scaleLocked: true, medidas_reales: true, ancho_m: item.ancho_m, alto_m: item.alto_m }
    }
    changed = true
    return rescaleBloqueToLibraryItem(o, item)
  })
  return { objects: next, changed }
}

export function formatLibraryMeasuresLabel(item) {
  if (!libraryItemHasRealMeasures(item)) return 'Pendiente de medidas'
  const w = Number(item.ancho_m)
  const h = Number(item.alto_m)
  const fw = Number.isFinite(w) ? w.toFixed(2) : '—'
  const fh = Number.isFinite(h) ? h.toFixed(2) : '—'
  return `${fw} × ${fh} m`
}

export function isScaleLockedBloque(obj) {
  return !!(obj && obj.type === 'bloque' && (obj.scaleLocked || obj.fromLibraryOnNode))
}

export { objectsBounds, parsePositiveMeters, worldToMeters, metersToWorld }
