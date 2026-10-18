/**
 * Borradores del editor de esquema (2D + 3D + cálculos + mapa).
 * Solo visibles/editables por el usuario que los creó (clave incluye userId).
 * IndexedDB (Dexie) para soportar imágenes de fondo y sólidos.
 */
import Dexie from 'dexie'

const DB_NAME = 'ClaraCore_esquema_drafts_v1'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const draftDb = new Dexie(DB_NAME)
draftDb.version(1).stores({
  drafts: 'key, userId, module, entityId, contratoId, updatedAt',
})

export function getEsquemaDraftUserId() {
  try {
    const raw = localStorage.getItem('cc_usuario') || sessionStorage.getItem('cc_usuario')
    if (!raw) return 'anon'
    const u = JSON.parse(raw)
    const id = u?.id ?? u?.sub ?? u?.user_id
    return id == null || id === '' ? 'anon' : String(id)
  } catch {
    return 'anon'
  }
}

/**
 * @param {{ module: string, entityId: string|number, userId?: string, contratoId?: string|number|null }} opts
 */
export function esquemaDraftKey({ module, entityId, userId, contratoId = null } = {}) {
  const uid = userId == null || userId === '' ? getEsquemaDraftUserId() : String(userId)
  const mod = String(module || 'esquema').trim() || 'esquema'
  const eid = entityId == null || entityId === '' ? 'draft' : String(entityId)
  const cid = contratoId == null || contratoId === '' ? 'x' : String(contratoId)
  return `cc_esquema_draft_v1:${uid}:${mod}:${cid}:${eid}`
}

export function buildEsquemaDraftSnapshot({
  objects = [],
  coordRows = [],
  mode3d = false,
  view3d = 'top',
  solids3d = [],
  volumeCalcs = [],
  activeCalcId = null,
  despieceSchedules = [],
  activeDespieceId = null,
  pan = { x: 0, y: 0 },
  zoom = 1,
  mapActive = false,
  mapOpacity = 0.72,
  mapBasemap = 'calle',
  mapGeoOrigin = null,
  title = '',
  originLngLat = null,
} = {}) {
  return {
    version: 1,
    title: String(title || ''),
    objects: Array.isArray(objects) ? objects : [],
    coordRows: Array.isArray(coordRows) ? coordRows : [],
    mode3d: !!mode3d,
    view3d: view3d || 'top',
    solids3d: Array.isArray(solids3d) ? solids3d : [],
    volumeCalcs: Array.isArray(volumeCalcs) ? volumeCalcs : [],
    activeCalcId: activeCalcId || null,
    despieceSchedules: Array.isArray(despieceSchedules) ? despieceSchedules : [],
    activeDespieceId: activeDespieceId || null,
    pan: pan && Number.isFinite(pan.x) ? { x: pan.x, y: pan.y } : { x: 0, y: 0 },
    zoom: Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1,
    mapActive: !!mapActive,
    mapOpacity: Number.isFinite(Number(mapOpacity)) ? Number(mapOpacity) : 0.72,
    mapBasemap: mapBasemap || 'calle',
    mapGeoOrigin: mapGeoOrigin || null,
    originLngLat: originLngLat || null,
  }
}

export function esquemaDraftIsDirty(snap) {
  if (!snap || typeof snap !== 'object') return false
  if (Array.isArray(snap.objects) && snap.objects.length > 0) return true
  if (Array.isArray(snap.solids3d) && snap.solids3d.length > 0) return true
  if (Array.isArray(snap.volumeCalcs) && snap.volumeCalcs.some((c) => (c?.lines || []).length > 0)) return true
  if (Array.isArray(snap.despieceSchedules) && snap.despieceSchedules.some((s) => (
    String(s?.nombre || '').trim() || (s?.positions || []).length > 0
  ))) return true
  if (Array.isArray(snap.coordRows) && snap.coordRows.some((r) => (
    String(r?.norte || '').trim() || String(r?.este || '').trim() || String(r?.punto || '').trim()
  ))) return true
  if (snap.mode3d) return true
  return false
}

/**
 * Guarda borrador. Solo el userId de la clave puede leerlo después.
 * @returns {Promise<{ ok: boolean, key?: string, error?: string }>}
 */
export async function esquemaDraftSave({
  key,
  module,
  entityId,
  contratoId = null,
  userId = null,
  snapshot,
} = {}) {
  try {
    const uid = userId == null || userId === '' ? getEsquemaDraftUserId() : String(userId)
    const draftKey = key || esquemaDraftKey({ module, entityId, userId: uid, contratoId })
    if (!esquemaDraftIsDirty(snapshot)) {
      await draftDb.drafts.delete(draftKey)
      return { ok: true, key: draftKey, empty: true }
    }
    const row = {
      key: draftKey,
      userId: uid,
      module: String(module || 'esquema'),
      entityId: String(entityId ?? 'draft'),
      contratoId: contratoId == null ? null : String(contratoId),
      updatedAt: Date.now(),
      snapshot: {
        ...snapshot,
        _savedAt: Date.now(),
        _userId: uid,
      },
    }
    await draftDb.drafts.put(row)
    return { ok: true, key: draftKey }
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo guardar el borrador' }
  }
}

export async function esquemaDraftLoad(key, { userId = null } = {}) {
  if (!key) return null
  try {
    const uid = userId == null || userId === '' ? getEsquemaDraftUserId() : String(userId)
    const row = await draftDb.drafts.get(key)
    if (!row?.snapshot) return null
    // Solo el creador
    if (String(row.userId) !== String(uid)) return null
    const age = Date.now() - Number(row.updatedAt || row.snapshot?._savedAt || 0)
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      await draftDb.drafts.delete(key)
      return null
    }
    if (!esquemaDraftIsDirty(row.snapshot)) return null
    return { ...row, snapshot: row.snapshot }
  } catch {
    return null
  }
}

export async function esquemaDraftExists(key, opts) {
  const row = await esquemaDraftLoad(key, opts)
  return !!row
}

export async function esquemaDraftClear(key) {
  if (!key) return false
  try {
    await draftDb.drafts.delete(key)
    return true
  } catch {
    return false
  }
}

/** Lista borradores del usuario actual (opcionalmente filtrados por módulo/contrato). */
export async function esquemaDraftList({ module = null, contratoId = null, userId = null } = {}) {
  const uid = userId == null || userId === '' ? getEsquemaDraftUserId() : String(userId)
  try {
    let rows = await draftDb.drafts.where('userId').equals(uid).toArray()
    if (module) rows = rows.filter((r) => r.module === module)
    if (contratoId != null && contratoId !== '') {
      rows = rows.filter((r) => String(r.contratoId) === String(contratoId))
    }
    const now = Date.now()
    const alive = []
    for (const r of rows) {
      const age = now - Number(r.updatedAt || 0)
      if (!Number.isFinite(age) || age > MAX_AGE_MS) {
        try { await draftDb.drafts.delete(r.key) } catch { /* ignore */ }
        continue
      }
      if (!esquemaDraftIsDirty(r.snapshot)) continue
      alive.push(r)
    }
    return alive.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch {
    return []
  }
}

export { draftDb }
