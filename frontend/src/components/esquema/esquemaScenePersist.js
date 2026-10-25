/**
 * Persistencia del dibujo editable del esquema (mismo formato que el borrador).
 * Se guarda junto al PNG al confirmar Guardar; reabre con «Editar esquema».
 */
import { buildEsquemaDraftSnapshot, esquemaDraftIsDirty } from './esquemaDraft.js'

export const ESQUEMA_SCENE_VERSION = 1
export const ESQUEMA_SCENE_KIND = 'esquema-scene'
export const ESQUEMA_SCENE_MIME = 'application/json'

/**
 * Normaliza un snapshot editable para guardar en nube / meta del registro.
 * @param {object|null|undefined} snap
 * @returns {object|null}
 */
export function normalizeEsquemaScene(snap) {
  if (!snap || typeof snap !== 'object') return null
  const built = buildEsquemaDraftSnapshot({
    objects: snap.objects,
    coordRows: snap.coordRows,
    dibujoTipo: snap.dibujoTipo,
    mode3d: snap.mode3d,
    view3d: snap.view3d,
    solids3d: snap.solids3d,
    volumeCalcs: snap.volumeCalcs,
    activeCalcId: snap.activeCalcId,
    despieceSchedules: snap.despieceSchedules,
    activeDespieceId: snap.activeDespieceId,
    pan: snap.pan,
    zoom: snap.zoom,
    mapActive: snap.mapActive,
    mapOpacity: snap.mapOpacity,
    mapBasemap: snap.mapBasemap,
    mapGeoOrigin: snap.mapGeoOrigin,
    title: snap.title,
    originLngLat: snap.originLngLat,
  })
  built.version = ESQUEMA_SCENE_VERSION
  if (!esquemaDraftIsDirty(built) && !String(built.title || '').trim()) return null
  return built
}

/** ¿El adjunto/meta tiene dibujo editable reabrible? */
export function hasEditableEsquemaScene(meta) {
  if (!meta || typeof meta !== 'object') return false
  if (meta.scene && typeof meta.scene === 'object') {
    return !!normalizeEsquemaScene(meta.scene)
  }
  if (meta.esquema_scene && typeof meta.esquema_scene === 'object') {
    return !!normalizeEsquemaScene(meta.esquema_scene)
  }
  if (meta.scene_blob_path || meta.esquema_scene_path) return true
  if (String(meta.kind || '') === ESQUEMA_SCENE_KIND) return true
  return false
}

/**
 * Extrae snapshot desde extras.onSave o meta de adjunto.
 * @returns {object|null}
 */
export function sceneFromSaveExtras(extras) {
  if (!extras || typeof extras !== 'object') return null
  return normalizeEsquemaScene(extras.scene || extras.esquema_scene || extras.snapshot)
}

/**
 * Serializa a JSON UTF-8 (para blob / data URI).
 * @param {object} scene
 * @returns {string}
 */
export function serializeEsquemaScene(scene) {
  const n = normalizeEsquemaScene(scene)
  if (!n) return ''
  return JSON.stringify(n)
}

/**
 * Data URI application/json del dibujo editable.
 * @param {object} scene
 * @returns {string|null}
 */
export function esquemaSceneToDataUri(scene) {
  const json = serializeEsquemaScene(scene)
  if (!json) return null
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf8').toString('base64')
  return `data:${ESQUEMA_SCENE_MIME};base64,${b64}`
}

/**
 * Parsea JSON o data URI a snapshot.
 * @param {string|object|null|undefined} raw
 * @returns {object|null}
 */
export function parseEsquemaScene(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return normalizeEsquemaScene(raw)
  const s = String(raw).trim()
  if (!s) return null
  try {
    if (s.startsWith('data:')) {
      const comma = s.indexOf(',')
      if (comma < 0) return null
      const b64 = s.slice(comma + 1)
      const json = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, 'base64').toString('utf8')
      return normalizeEsquemaScene(JSON.parse(json))
    }
    return normalizeEsquemaScene(JSON.parse(s))
  } catch {
    return null
  }
}

/**
 * ¿Mostrar «Editar esquema»?
 * - Hay escena editable (o borrador local marcado).
 * - Usuario puede editar el registro.
 * - No está sellado/aprobado (salvo override explícito).
 */
export function canShowEditarEsquema({
  hasScene = false,
  hasDraft = false,
  canEdit = false,
  sealed = false,
} = {}) {
  if (sealed) return false
  if (!canEdit) return false
  return !!(hasScene || hasDraft)
}
