/**
 * Cache en memoria del plano GeoJSON por contrato.
 * Evita N descargas del mismo JSON de ~60 MB cuando varios módulos (semáforo, dashboard, SICOE, etc.)
 * montan fetch en paralelo o al navegar.
 */
const resolved = new Map()
const inflight = new Map()

function normBase(apiBase) {
  return String(apiBase || '').replace(/\/$/, '')
}

/**
 * @param {string} apiBase URL del API (p. ej. import.meta.env.VITE_API_URL)
 * @param {number|string} contratoId
 * @param {string|null} token Bearer JWT o null
 * @returns {Promise<{ plano_geojson: *, centro_lat: *, centro_lng: * }|null>}
 */
export function getContratoPlanoGeojson(apiBase, contratoId, token) {
  const k = String(contratoId)
  if (resolved.has(k)) return Promise.resolve(resolved.get(k))
  if (inflight.has(k)) return inflight.get(k)
  const url = `${normBase(apiBase)}/contratos/${encodeURIComponent(k)}/plano-geojson`
  const p = fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (r) => {
      if (!r.ok) return null
      const data = await r.json()
      const normalized = data && typeof data === 'object' ? data : null
      resolved.set(k, normalized)
      return normalized
    })
    .catch((e) =>
      Promise.reject(e instanceof Error ? e : new Error('No se pudo cargar el plano del contrato')),
    )
    .finally(() => {
      inflight.delete(k)
    })
  inflight.set(k, p)
  return p
}

/** Tras guardar un GeoJSON nuevo en Admin → Contratos, invalidar para la próxima carga. */
export function clearContratoPlanoGeojsonCache(contratoId) {
  if (contratoId == null || contratoId === '') {
    resolved.clear()
    inflight.clear()
    return
  }
  const k = String(contratoId)
  resolved.delete(k)
  inflight.delete(k)
}
