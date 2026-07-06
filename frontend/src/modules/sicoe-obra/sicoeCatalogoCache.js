/**
 * Caché en memoria + deduplicación in-flight para catálogos SICOE (nodos, pk-ids, ítems).
 * Evita tormentas cuando muchos HojaRegistro o re-renders repiten la misma URL.
 */

const TTL_MS = 10 * 60 * 1000
const cache = new Map()
const inflight = new Map()

function cacheKey(parts) {
  return parts.map((p) => String(p ?? '')).join('\x1e')
}

function authHeaders(token) {
  const t = token || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token')) || ''
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function cachedFetch(key, fetcher) {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.exp > now) return hit.data

  if (inflight.has(key)) return inflight.get(key)

  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      cache.set(key, { data, exp: Date.now() + TTL_MS })
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })
  inflight.set(key, p)
  return p
}

export function invalidateSicoeCatalogoCache(contratoId) {
  if (contratoId == null) {
    cache.clear()
    inflight.clear()
    return
  }
  const prefix = `${contratoId}\x1e`
  for (const k of [...cache.keys()]) {
    if (k.includes(`\x1e${contratoId}\x1e`) || k.startsWith(prefix)) cache.delete(k)
  }
  for (const k of [...inflight.keys()]) {
    if (k.includes(`\x1e${contratoId}\x1e`) || k.startsWith(prefix)) inflight.delete(k)
  }
}

export function fetchSicoeNodosCached(apiBase, contratoId, capitulo, token) {
  const cap = String(capitulo || '').trim()
  if (!apiBase || !contratoId || !cap) return Promise.resolve([])
  const key = cacheKey(['nodos', contratoId, cap])
  return cachedFetch(key, async () => {
    const r = await fetch(
      `${apiBase}/sicoe-obra/${contratoId}/nodos?capitulo=${encodeURIComponent(cap)}`,
      { headers: authHeaders(token) },
    )
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  })
}

export function fetchSicoePkIdsCached(apiBase, contratoId, token) {
  if (!apiBase || !contratoId) return Promise.resolve([])
  const key = cacheKey(['pk-ids', contratoId])
  return cachedFetch(key, async () => {
    const r = await fetch(`${apiBase}/sicoe-obra/${contratoId}/pk-ids`, { headers: authHeaders(token) })
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  })
}

export function fetchSicoeCapitulosCached(apiBase, contratoId, token) {
  if (!apiBase || !contratoId) return Promise.resolve([])
  const key = cacheKey(['capitulos', contratoId])
  return cachedFetch(key, async () => {
    const r = await fetch(`${apiBase}/sicoe-obra/${contratoId}/capitulos`, { headers: authHeaders(token) })
    if (!r.ok) return []
    const d = await r.json()
    if (!Array.isArray(d)) return []
    return d
      .map((c) => (typeof c === 'string' ? c : c?.capitulo))
      .filter(Boolean)
  })
}

export function fetchSicoeListadoPreciosCached(apiBase, contratoId, capitulo, q, token) {
  const cap = String(capitulo || '').trim()
  if (!apiBase || !contratoId || !cap) return Promise.resolve([])
  const query = String(q ?? '')
  const key = cacheKey(['listado-precios', contratoId, cap, query])
  return cachedFetch(key, async () => {
    const p = new URLSearchParams({ capitulo: cap })
    if (query) p.set('q', query)
    const r = await fetch(
      `${apiBase}/sicoe-obra/${contratoId}/listado-precios-busqueda?${p.toString()}`,
      { headers: authHeaders(token) },
    )
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  })
}

export function fetchSicoePlantillasCached(apiBase, contratoId, capitulo, token) {
  const cap = String(capitulo || '').trim()
  if (!apiBase || !contratoId || !cap) return Promise.resolve([])
  const key = cacheKey(['plantillas', contratoId, cap])
  return cachedFetch(key, async () => {
    const r = await fetch(
      `${apiBase}/sicoe-obra/${contratoId}/plantillas?capitulo=${encodeURIComponent(cap)}`,
      { headers: authHeaders(token) },
    )
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  })
}
