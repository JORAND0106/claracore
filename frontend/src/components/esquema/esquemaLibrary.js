/**
 * Biblioteca de entidades reutilizables por contrato (localStorage).
 * Independiente del esquema: se comparte entre Seguimiento, SicoeObra y Presupuesto.
 */

const PREFIX = 'cc_esquema_biblioteca_'

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch { /* ignore */ }
  return null
}

export function resolveContratoId(explicit) {
  if (explicit != null && String(explicit).trim() !== '') return String(explicit)
  try {
    const raw = (
      (typeof localStorage !== 'undefined' && localStorage.getItem('cc_usuario'))
      || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cc_usuario'))
      || ''
    )
    if (!raw) return null
    const u = JSON.parse(raw)
    const id = u?.contrato_id ?? u?.contratoId
    return id != null && String(id).trim() !== '' ? String(id) : null
  } catch {
    return null
  }
}

export function libraryStorageKey(contratoId) {
  return `${PREFIX}${contratoId}`
}

export function cloneForLibrary(objects) {
  return JSON.parse(JSON.stringify((objects || []).filter((o) => (
    o && !(o.type === 'image' && o.fit)
  ))))
}

export function objectsBounds(objects) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const consider = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const obj of objects || []) {
    if (!obj) continue
    if (obj.type === 'nodo') {
      consider(obj.x, obj.y)
      continue
    }
    if (obj.type === 'hatchRegion' || obj.type === 'tabla' || obj.type === 'texto' || obj.type === 'image') {
      consider(obj.x, obj.y)
      consider((obj.x || 0) + (obj.w || 0), (obj.y || 0) + (obj.h || 0))
      if (obj.type === 'tabla') {
        const cols = Math.max(1, obj.cols || (obj.cells?.[0]?.length) || 1)
        const rows = Math.max(1, obj.rows || (obj.cells?.length) || 1)
        consider((obj.x || 0) + cols * (obj.cellW || 78), (obj.y || 0) + rows * (obj.cellH || 30))
      }
      continue
    }
    if (obj.type === 'bloque') {
      consider(obj.x, obj.y)
      consider((obj.x || 0) + (obj.w || 0), (obj.y || 0) + (obj.h || 0))
      continue
    }
    if (obj.points) {
      for (const p of obj.points) consider(p.x, p.y)
      continue
    }
    consider(obj.x1, obj.y1)
    consider(obj.x2, obj.y2)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

function newObjectId() {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function offsetObject(obj, dx, dy, { renewId = false } = {}) {
  if (!obj) return obj
  const id = renewId ? newObjectId() : obj.id
  if (obj.type === 'bloque') {
    return {
      ...obj,
      id,
      x: (obj.x || 0) + dx,
      y: (obj.y || 0) + dy,
      children: renewId
        ? (obj.children || []).map((ch) => offsetObject(ch, 0, 0, { renewId: true }))
        : obj.children,
    }
  }
  if (obj.points) {
    return {
      ...obj,
      id,
      points: obj.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    }
  }
  if (obj.type === 'nodo' || obj.type === 'hatchRegion' || obj.type === 'tabla' || obj.type === 'texto' || obj.type === 'image') {
    return { ...obj, id, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
  }
  return {
    ...obj,
    id,
    x1: (obj.x1 || 0) + dx,
    y1: (obj.y1 || 0) + dy,
    x2: (obj.x2 || 0) + dx,
    y2: (obj.y2 || 0) + dy,
  }
}

export function translateObject(obj, dx, dy) {
  return offsetObject(obj, dx, dy, { renewId: true })
}

/** Empaca entidades sueltas como un bloque (coords locales desde el origen del bbox). */
export function packLibraryBlock(objects) {
  const cloned = cloneForLibrary(objects)
  if (cloned.length === 1 && cloned[0]?.type === 'bloque') {
    return {
      w: Math.max(1, cloned[0].w || 1),
      h: Math.max(1, cloned[0].h || 1),
      children: cloneForLibrary(cloned[0].children || []),
    }
  }
  const bb = objectsBounds(cloned)
  const w = Math.max(1, bb.maxX - bb.minX)
  const h = Math.max(1, bb.maxY - bb.minY)
  return {
    w,
    h,
    children: cloned.map((o) => offsetObject(o, -bb.minX, -bb.minY, { renewId: false })),
  }
}

/** Instancia el ítem como un único bloque centrado en `at`. */
export function instantiateLibraryItem(item, at) {
  const packed = packLibraryBlock(item?.objects)
  const children = packed.children.map((o) => offsetObject(o, 0, 0, { renewId: true }))
  return [{
    type: 'bloque',
    id: newObjectId(),
    x: (at?.x || 0) - packed.w / 2,
    y: (at?.y || 0) - packed.h / 2,
    w: packed.w,
    h: packed.h,
    rotation: 0,
    children,
  }]
}

export function loadLibrary(contratoId) {
  const cid = resolveContratoId(contratoId)
  if (!cid) return []
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(libraryStorageKey(cid))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function persistLibrary(contratoId, items) {
  const cid = resolveContratoId(contratoId)
  const store = storage()
  if (!cid || !store) return
  store.setItem(libraryStorageKey(cid), JSON.stringify(items))
}

export function saveLibraryItem(contratoId, { nombre, objects }) {
  const cid = resolveContratoId(contratoId)
  if (!cid) return null
  const cloned = cloneForLibrary(objects)
  if (!cloned.length) return null
  const items = loadLibrary(cid)
  const packed = packLibraryBlock(cloned)
  const item = {
    id: `lib${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre: String(nombre || 'Bloque').trim() || 'Bloque',
    kind: 'bloque',
    objects: packed.children,
    w: packed.w,
    h: packed.h,
    createdAt: new Date().toISOString(),
  }
  items.unshift(item)
  persistLibrary(cid, items)
  return item
}

export function deleteLibraryItem(contratoId, id) {
  const cid = resolveContratoId(contratoId)
  if (!cid || !id) return []
  const next = loadLibrary(cid).filter((it) => it.id !== id)
  persistLibrary(cid, next)
  return next
}
