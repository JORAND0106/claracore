import {
  buildVistaCacheKey,
  getVistaCache,
  invalidateVistaModulo,
  setVistaCache,
} from './vistaCache.js'

const MODULO = 'prog_obra'

export function progObraMapaCacheKey(contratoId) {
  return buildVistaCacheKey(MODULO, contratoId, 'mapa')
}

export function progObraVersionesCacheKey(contratoId) {
  return buildVistaCacheKey(MODULO, contratoId, 'versiones')
}

export function progObraTramosCacheKey(contratoId) {
  return buildVistaCacheKey(MODULO, contratoId, 'tramos')
}

export function progObraEstructuraCacheKey(contratoId, pkId, versionPptoId = '') {
  return buildVistaCacheKey(MODULO, contratoId, 'estructura', pkId, versionPptoId || 'v0')
}

export function progObraActividadesCacheKey(contratoId, versionId, pkId, sessionId = '') {
  return buildVistaCacheKey(MODULO, contratoId, 'actividades', versionId, pkId, sessionId || 's0')
}

export function getProgObraVistaCache(key) {
  return getVistaCache(key, { modulo: MODULO })?.data ?? null
}

export function setProgObraVistaCache(key, data) {
  setVistaCache(key, data, { modulo: MODULO })
}

export function invalidateProgObraVistaCache(contratoId) {
  invalidateVistaModulo(MODULO, contratoId)
}
