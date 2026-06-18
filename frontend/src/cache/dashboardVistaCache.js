import {
  buildVistaCacheKey,
  getVistaCache,
  invalidateVistaModulo,
  setVistaCache,
} from './vistaCache.js'

const MODULO = 'dashboard'

export function dashResumenCacheKey(contratoId, vistaParam) {
  return buildVistaCacheKey(MODULO, contratoId, 'resumen', vistaParam)
}

export function dashCapFinCacheKey(contratoId, vistaParam) {
  return buildVistaCacheKey(MODULO, contratoId, 'cap_fin', vistaParam)
}

export function dashDrillItemsCacheKey(contratoId, vistaParam, cap, item = '') {
  return buildVistaCacheKey(MODULO, contratoId, vistaParam, 'drill', cap, item)
}

export function dashTablaCacheKey(contratoId, vistaParam, cap, item = '') {
  return buildVistaCacheKey(MODULO, contratoId, vistaParam, 'tabla', cap, item)
}

export function dashPkidColoresCacheKey(contratoId, filterKey) {
  return buildVistaCacheKey(MODULO, contratoId, 'pkid_colores', filterKey)
}

export function getDashVistaCacheEntry(key) {
  return getVistaCache(key, { modulo: MODULO })
}

export function getDashVistaCache(key) {
  return getDashVistaCacheEntry(key)?.data ?? null
}

/** Formato { data, ts } compatible con caché drill/tabla previa. */
export function getDashCachedPayload(key) {
  const entry = getDashVistaCacheEntry(key)
  if (!entry?.data) return null
  return { data: entry.data, ts: entry.ts ?? 0 }
}

export function setDashVistaCache(key, data) {
  setVistaCache(key, data, { modulo: MODULO })
}

export function setDashCachedPayload(key, data) {
  setDashVistaCache(key, data)
}

export function invalidateDashboardVistaCache(contratoId) {
  invalidateVistaModulo(MODULO, contratoId)
}
