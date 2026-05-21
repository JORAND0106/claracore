/**
 * Descarga de tiles MapTiler a Cache API para mapa Leaflet offline (SICOE).
 */
import { db } from './db'

export const TILES_CACHE_NAME = 'claracore-tiles-v1'

const BATCH_SIZE = 10
const MARGIN_DEG = 0.02

/** Bbox Colombia (zoom 1-10). */
const BBOX_COLOMBIA = {
  minLat: -4,
  maxLat: 13,
  minLng: -79,
  maxLng: -66,
}

function lng2tileX(lngDeg, zoom) {
  const n = 2 ** zoom
  return Math.floor(((lngDeg + 180) / 360) * n)
}

function lat2tileY(latDeg, zoom) {
  const n = 2 ** zoom
  const latRad = (latDeg * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
}

function forEachLngLatInCoords(node, fn) {
  if (!Array.isArray(node)) return
  if (typeof node[0] === 'number' && typeof node[1] === 'number') {
    fn(node[0], node[1])
    return
  }
  node.forEach((c) => forEachLngLatInCoords(c, fn))
}

function bboxFromFeatures(features) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let has = false

  for (const f of features || []) {
    const g = f?.geometry
    if (!g) continue
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      forEachLngLatInCoords(g.coordinates, (lng, lat) => {
        has = true
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      })
    }
  }

  if (!has) return null
  return { minLat, maxLat, minLng, maxLng }
}

function applyMargin(bbox, margin) {
  return {
    minLat: bbox.minLat - margin,
    maxLat: bbox.maxLat + margin,
    minLng: bbox.minLng - margin,
    maxLng: bbox.maxLng + margin,
  }
}

function clampBbox(b) {
  return {
    minLat: Math.max(-85, b.minLat),
    maxLat: Math.min(85, b.maxLat),
    minLng: Math.max(-180, b.minLng),
    maxLng: Math.min(180, b.maxLng),
  }
}

/** Bbox del contrato desde geojson_cache (+ margen) o Colombia si no hay geometría. */
export async function bboxContratoFromGeojson(contratoId) {
  const cid = Number(contratoId)
  const row = await db.geojson_cache.get(cid)
  let features = row?.plano_geojson?.features
  if (!features && row?.plano_geojson?.type === 'Feature') {
    features = [row.plano_geojson]
  }
  const raw = bboxFromFeatures(features || [])
  if (!raw) return { ...BBOX_COLOMBIA, fromFallback: true }
  return { ...clampBbox(applyMargin(raw, MARGIN_DEG)), fromFallback: false }
}

function tileUrlsForBbox(bbox, zoom, apiKey) {
  const x0 = lng2tileX(bbox.minLng, zoom)
  const x1 = lng2tileX(bbox.maxLng, zoom)
  const yN = lat2tileY(bbox.maxLat, zoom)
  const yS = lat2tileY(bbox.minLat, zoom)
  const xmin = Math.min(x0, x1)
  const xmax = Math.max(x0, x1)
  const ymin = Math.min(yN, yS)
  const ymax = Math.max(yN, yS)
  const urls = []
  for (let x = xmin; x <= xmax; x += 1) {
    for (let y = ymin; y <= ymax; y += 1) {
      urls.push(
        `https://api.maptiler.com/maps/streets/${zoom}/${x}/${y}.png?key=${apiKey}`,
      )
    }
  }
  return urls
}

function collectTileUrls(contratoBbox, apiKey) {
  const urls = []
  for (let z = 1; z <= 10; z += 1) {
    urls.push(...tileUrlsForBbox(BBOX_COLOMBIA, z, apiKey))
  }
  for (let z = 11; z <= 14; z += 1) {
    urls.push(...tileUrlsForBbox(contratoBbox, z, apiKey))
  }
  return urls
}

/**
 * @param {number|string} contratoId
 * @param {(actual: number, total: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
export async function downloadTilesContrato(contratoId, onProgress, signal) {
  const apiKey = import.meta.env.VITE_MAPTILER_KEY
  if (!apiKey) {
    console.warn('[offline-tiles] Sin VITE_MAPTILER_KEY — omitiendo descarga de tiles')
    onProgress?.(0, 0)
    return { downloaded: 0, failed: 0, total: 0, skipped: true }
  }

  const contratoBbox = await bboxContratoFromGeojson(contratoId)
  const urls = collectTileUrls(contratoBbox, apiKey)
  const total = urls.length
  let downloaded = 0
  let failed = 0

  onProgress?.(0, total)

  if (total === 0 || signal?.aborted) {
    return { downloaded, failed, total, skipped: false }
  }

  const cache = await caches.open(TILES_CACHE_NAME)

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new DOMException('Descarga de tiles cancelada', 'AbortError')
    }

    const batch = urls.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (url) => {
        if (signal?.aborted) return
        try {
          const req = new Request(url)
          const cached = await cache.match(req)
          if (cached) {
            downloaded += 1
            return
          }
          const res = await fetch(req, { signal })
          if (res.ok) {
            await cache.put(req, res.clone())
            downloaded += 1
          } else {
            failed += 1
          }
        } catch (e) {
          if (e?.name === 'AbortError') throw e
          failed += 1
        }
      }),
    )

    onProgress?.(downloaded, total)
  }

  return { downloaded, failed, total, skipped: false, bboxFallback: contratoBbox.fromFallback }
}
