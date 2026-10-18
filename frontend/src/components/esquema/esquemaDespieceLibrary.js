/**
 * Biblioteca de formas de despiece compartida por contrato (todos los usuarios
 * del contrato en la plataforma). Clave sin userId — igual patrón que
 * `esquemaLibrary.js`, pero dedicada a formas de varilla.
 *
 * Las formas builtin viven en código; aquí solo las creadas por usuarios.
 */
import { resolveContratoId } from './esquemaLibrary.js'
import { listBuiltinShapes, getBuiltinShape } from './esquemaDespieceShapes.js'

const PREFIX = 'cc_esquema_despiece_formas_v1_'

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch { /* ignore */ }
  return null
}

export function despieceFormasStorageKey(contratoId) {
  return `${PREFIX}${contratoId}`
}

export function loadCustomDespieceShapes(contratoId) {
  const cid = resolveContratoId(contratoId)
  if (!cid) return []
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(despieceFormasStorageKey(cid))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function persist(contratoId, items) {
  const cid = resolveContratoId(contratoId)
  const store = storage()
  if (!cid || !store) return false
  store.setItem(despieceFormasStorageKey(cid), JSON.stringify(items))
  return true
}

/** Catálogo completo: builtin + custom del contrato (visible a todo usuario del contrato). */
export function listAllDespieceShapes(contratoId) {
  const custom = loadCustomDespieceShapes(contratoId)
  return [...listBuiltinShapes(), ...custom]
}

export function findDespieceShape(contratoId, shapeId) {
  if (!shapeId) return null
  const builtin = getBuiltinShape(shapeId)
  if (builtin) return builtin
  return loadCustomDespieceShapes(contratoId).find((s) => s.id === shapeId) || null
}

/**
 * Guarda una forma nueva. Queda disponible para todos los usuarios del contrato
 * (misma clave de almacenamiento compartida, sin userId).
 */
export function saveCustomDespieceShape(contratoId, shape) {
  const cid = resolveContratoId(contratoId)
  if (!cid || !shape?.id || !shape?.nombre) return null
  const items = loadCustomDespieceShapes(cid)
  if (items.some((s) => s.id === shape.id)) {
    const next = items.map((s) => (s.id === shape.id ? { ...shape, builtin: false } : s))
    persist(cid, next)
    return shape
  }
  const item = { ...shape, builtin: false, createdAt: shape.createdAt || new Date().toISOString() }
  items.unshift(item)
  persist(cid, items)
  return item
}

export function deleteCustomDespieceShape(contratoId, shapeId) {
  const cid = resolveContratoId(contratoId)
  if (!cid || !shapeId) return []
  const next = loadCustomDespieceShapes(cid).filter((s) => s.id !== shapeId)
  persist(cid, next)
  return next
}
