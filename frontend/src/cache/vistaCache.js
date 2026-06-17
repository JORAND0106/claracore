/**
 * Cache en memoria de vistas por módulo/contrato.
 * Clave: partes unidas con '|' (módulo, contratoId, vistaId, hashFiltros, …).
 * Valor: { data, ts, total?, meta? }.
 *
 * Ver frontend/src/cache/README.md para TTLs e invalidación.
 */

/** @type {Record<string, number>} TTL navegación por módulo (ms) */
export const VISTA_CACHE_TTL = {
  sicoe: 10 * 60 * 1000,
  presupuesto_nav: 8 * 60 * 1000,
  presupuesto_live: 2 * 1000,
  dashboard: 5 * 60 * 1000,
  prog_obra: 10 * 60 * 1000,
}

const memory = new Map()
const MAX_ENTRIES = 200
const SESSION_PREFIX = 'cc_vista_cache_'
const SESSION_MAX_BYTES = 4_000_000

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

/** Construye clave estable a partir de segmentos (omite vacíos). */
export function buildVistaCacheKey(...parts) {
  return parts
    .flat()
    .filter((p) => p != null && String(p) !== '')
    .map((p) => String(p))
    .join('|')
}

function entryVigente(entry, ttl) {
  if (!entry || typeof entry !== 'object') return false
  const effectiveTtl = ttl ?? entry.ttl
  if (!effectiveTtl || effectiveTtl <= 0) return true
  return Date.now() - (entry.ts || 0) < effectiveTtl
}

function trimMemory() {
  while (memory.size > MAX_ENTRIES) {
    const first = memory.keys().next().value
    if (first == null) break
    memory.delete(first)
  }
}

function sessionKeyFor(memoryKey) {
  return `${SESSION_PREFIX}${memoryKey}`
}

function readSessionEntry(memoryKey) {
  try {
    const raw = sessionStorage.getItem(sessionKeyFor(memoryKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeSessionEntry(memoryKey, entry) {
  try {
    const payload = JSON.stringify(entry)
    if (payload.length > SESSION_MAX_BYTES) return
    sessionStorage.setItem(sessionKeyFor(memoryKey), payload)
  } catch {
    /* quota o serialización */
  }
}

function deleteSessionEntry(memoryKey) {
  try {
    sessionStorage.removeItem(sessionKeyFor(memoryKey))
  } catch { /* ignore */ }
}

/**
 * @param {string} key
 * @param {{ ttl?: number, modulo?: string }} [opts]
 * @returns {{ data: *, ts: number, total?: number, meta?: * }|null}
 */
export function getVistaCache(key, opts = {}) {
  if (!key) return null
  let entry = memory.get(key)
  if (!entry) entry = readSessionEntry(key)
  const ttl =
    opts.ttl ??
    entry?.ttl ??
    (opts.modulo ? VISTA_CACHE_TTL[opts.modulo] : undefined)
  if (!entryVigente(entry, ttl)) {
    memory.delete(key)
    deleteSessionEntry(key)
    return null
  }
  return entry
}

/**
 * @param {string} key
 * @param {*} data
 * @param {{ ttl?: number, modulo?: string, total?: number, meta?: *, persistSession?: boolean }} [opts]
 */
export function setVistaCache(key, data, opts = {}) {
  if (!key) return
  const ttl = opts.ttl ?? (opts.modulo ? VISTA_CACHE_TTL[opts.modulo] : undefined)
  const entry = {
    data,
    ts: Date.now(),
    ttl,
    ...(opts.total != null ? { total: opts.total } : {}),
    ...(opts.meta != null ? { meta: opts.meta } : {}),
  }
  memory.set(key, entry)
  trimMemory()
  if (opts.persistSession) writeSessionEntry(key, entry)
}

/** Invalida entradas cuya clave empieza por `prefix`. */
export function invalidateVistaCache(prefix) {
  if (!prefix) return
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) {
      memory.delete(k)
      deleteSessionEntry(k)
    }
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const sk = sessionStorage.key(i)
      if (sk && sk.startsWith(SESSION_PREFIX) && sk.slice(SESSION_PREFIX.length).startsWith(prefix)) {
        sessionStorage.removeItem(sk)
      }
    }
  } catch { /* ignore */ }
}

/** Invalida todas las vistas de un módulo para un contrato. */
export function invalidateVistaModulo(modulo, contratoId) {
  if (!modulo || contratoId == null) return
  invalidateVistaCache(buildVistaCacheKey(modulo, contratoId))
}

/** Invalida todas las vistas de un contrato (cualquier módulo). */
export function invalidateVistaContrato(contratoId) {
  if (contratoId == null) return
  const needle = `|${contratoId}|`
  for (const k of [...memory.keys()]) {
    if (k.includes(needle) || k.endsWith(`|${contratoId}`) || k.startsWith(`${contratoId}|`)) {
      memory.delete(k)
      deleteSessionEntry(k)
    }
  }
}

export function clearVistaCache() {
  memory.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const sk = sessionStorage.key(i)
      if (sk && sk.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(sk)
    }
  } catch { /* ignore */ }
}

/** Hash estable de un objeto (filtros, bundle, etc.). */
export function hashVistaPayload(payload) {
  return stableStringify(payload)
}

/** Expuesto para tests. */
export function _vistaCacheMemorySize() {
  return memory.size
}
