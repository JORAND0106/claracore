/**
 * Borrador local de edición de portada (localización / cabecera).
 * Evita perder cambios si la sesión expira al guardar.
 */
const PREFIX = 'sicoe_portada_edit_draft_v1_'

/** Fallback en memoria (tests / entornos sin localStorage). */
const _mem = new Map()

function _storeGet(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem(key)
    }
  } catch { /* noop */ }
  return _mem.has(key) ? _mem.get(key) : null
}

function _storeSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, val)
      return
    }
  } catch { /* noop */ }
  _mem.set(key, val)
}

function _storeDel(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.removeItem(key)
      return
    }
  } catch { /* noop */ }
  _mem.delete(key)
}

export function sicoePortadaEditDraftKey(contratoId, reporteId) {
  return `${PREFIX}${contratoId}_${reporteId}`
}

export function sicoePortadaEditDraftSave(contratoId, reporteId, payload) {
  if (contratoId == null || reporteId == null) return
  try {
    const key = sicoePortadaEditDraftKey(contratoId, reporteId)
    const body = {
      ...payload,
      savedAt: Date.now(),
      contratoId,
      reporteId,
    }
    _storeSet(key, JSON.stringify(body))
  } catch { /* quota / private mode */ }
}

export function sicoePortadaEditDraftLoad(contratoId, reporteId) {
  if (contratoId == null || reporteId == null) return null
  try {
    const raw = _storeGet(sicoePortadaEditDraftKey(contratoId, reporteId))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function sicoePortadaEditDraftClear(contratoId, reporteId) {
  if (contratoId == null || reporteId == null) return
  try {
    _storeDel(sicoePortadaEditDraftKey(contratoId, reporteId))
  } catch { /* noop */ }
}
