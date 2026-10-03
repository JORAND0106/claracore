/**
 * Escala 1:1 de entidades de biblioteca sobre el plano.
 * El lienzo ya usa world = metros * PX_PER_METER; las dimensiones con las que
 * se dibujó la entidad son las que ocupa al insertarla (sin calibración).
 */
import { objectCenterOf, worldToMeters } from './esquemaGeometry.js'
import { instantiateLibraryItem, packLibraryBlock } from './esquemaLibrary.js'

/** Dimensiones en metros del bbox (coords mundo actuales). */
export function measuresFromObjects(objects) {
  const packed = packLibraryBlock(objects)
  return {
    packed,
    ancho_m: worldToMeters(packed.w),
    alto_m: worldToMeters(packed.h),
  }
}

/** Etiqueta informativa ancho × alto a partir de la geometría guardada. */
export function formatLibraryMeasuresLabel(item) {
  if (!item) return ''
  const objs = item.objects || item.children || []
  const fromGeom = measuresFromObjects(objs)
  const w = Number(item.ancho_m)
  const h = Number(item.alto_m)
  const fw = Number.isFinite(w) && w > 0 ? w : fromGeom.ancho_m
  const fh = Number.isFinite(h) && h > 0 ? h : fromGeom.alto_m
  if (!(fw > 0) && !(fh > 0)) return ''
  return `${(fw || 0).toFixed(2)} × ${(fh || 0).toFixed(2)} m`
}

/**
 * Instancia el bloque centrado en `at` con las dimensiones ya guardadas (1:1)
 * y escala bloqueada (solo mover/girar en el plano).
 */
export function instantiateLibraryItemAtRealScale(item, at, extras = {}) {
  if (!item) return []
  const placed = instantiateLibraryItem(item, at)
  const measures = measuresFromObjects(item.objects || item.children || [])
  return placed.map((b) => ({
    ...b,
    libraryId: item.id,
    libraryNombre: item.nombre,
    scaleLocked: true,
    ancho_m: Number(item.ancho_m) > 0 ? Number(item.ancho_m) : measures.ancho_m,
    alto_m: Number(item.alto_m) > 0 ? Number(item.alto_m) : measures.alto_m,
    ...extras,
  }))
}

/**
 * Re-instancia un bloque desde la biblioteca conservando centro y rotación
 * (p. ej. al reabrir un dibujo). No cambia proporciones: usa la geometría del ítem.
 */
export function rescaleBloqueToLibraryItem(bloque, item) {
  if (!bloque || bloque.type !== 'bloque' || !item) return bloque
  const center = objectCenterOf(bloque)
  const placed = instantiateLibraryItemAtRealScale(item, center, {
    fromLibraryOnNode: !!bloque.fromLibraryOnNode,
    rotation: bloque.rotation || 0,
    id: bloque.id,
    color: bloque.color,
  })
  return placed[0] || bloque
}

/**
 * Asegura scaleLocked en bloques de biblioteca ya insertados.
 * No reescala: las dimensiones dibujadas son la verdad.
 */
export function syncSceneBloquesToLibrary(objects, libraryItems) {
  const byId = new Map((libraryItems || []).map((it) => [String(it.id), it]))
  let changed = false
  const next = (objects || []).map((o) => {
    if (!o || o.type !== 'bloque' || !o.libraryId) return o
    const item = byId.get(String(o.libraryId))
    if (!item) {
      if (o.scaleLocked || o.fromLibraryOnNode) return o
      changed = true
      return { ...o, scaleLocked: true }
    }
    if (o.scaleLocked) return o
    changed = true
    return { ...o, scaleLocked: true, libraryNombre: item.nombre || o.libraryNombre }
  })
  return { objects: next, changed }
}

export function isScaleLockedBloque(obj) {
  return !!(obj && obj.type === 'bloque' && (obj.scaleLocked || obj.fromLibraryOnNode))
}

export { worldToMeters }
