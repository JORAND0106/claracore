/** Caché en memoria de listado de salidas (Ctrl+Tab / remount). */

const SALIDAS_CACHE_TTL_MS = 5 * 60 * 1000
const salidasListCache = new Map()

function cacheKey(contratoId) {
  return String(contratoId || 'x')
}

export function readSalidasCache(contratoId) {
  const entry = salidasListCache.get(cacheKey(contratoId))
  if (!entry) return null
  if (Date.now() - entry.at > SALIDAS_CACHE_TTL_MS) return null
  return entry.rows
}

export function writeSalidasCache(contratoId, rows) {
  salidasListCache.set(cacheKey(contratoId), {
    at: Date.now(),
    rows: Array.isArray(rows) ? rows : [],
  })
}

export function invalidateSalidasCache(contratoId) {
  salidasListCache.delete(cacheKey(contratoId))
}
