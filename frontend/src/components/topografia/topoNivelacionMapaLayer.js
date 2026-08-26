/**
 * Capa opcional «Puntos de nivelación» sobre Mapbox (Semáforo / Sicoe / Presupuesto).
 * Solo puntos con coordenadas (ubicacion_lat/lng) vinculadas a un PK real.
 */
import { API_BASE } from '../../apiBase'

export const TOPO_NIV_LAYER_SOURCE = 'topo-nivelacion-puntos'
export const TOPO_NIV_LAYER_CIRCLE = 'topo-nivelacion-puntos-circle'
export const TOPO_NIV_LAYER_LABEL = 'topo-nivelacion-puntos-label'

/**
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchNivelacionPuntosMapa(contratoId, token) {
  const t = token
    || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token'))
    || ''
  const r = await fetch(`${API_BASE}/topografia/${contratoId}/nivelaciones/puntos-mapa`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  })
  if (!r.ok) {
    const msg = await r.text().catch(() => '')
    throw new Error(msg || `No se pudieron cargar puntos de nivelación (${r.status})`)
  }
  const data = await r.json()
  const pts = Array.isArray(data?.puntos) ? data.puntos : (Array.isArray(data) ? data : [])
  return {
    type: 'FeatureCollection',
    features: pts
      .filter((p) => p && p.lng != null && p.lat != null && Number.isFinite(Number(p.lng)) && Number.isFinite(Number(p.lat)))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(p.lng), Number(p.lat)] },
        properties: {
          id: p.id,
          label: p.label || p.nombre_punto || p.ubicacion_pk || 'Nivelación',
          nombre_punto: p.nombre_punto || '',
          ubicacion_pk: p.ubicacion_pk || '',
          nivelacion_id: p.nivelacion_id || '',
        },
      })),
  }
}

export function removeTopoNivelacionLayers(map) {
  if (!map) return
  try {
    if (map.getLayer(TOPO_NIV_LAYER_LABEL)) map.removeLayer(TOPO_NIV_LAYER_LABEL)
    if (map.getLayer(TOPO_NIV_LAYER_CIRCLE)) map.removeLayer(TOPO_NIV_LAYER_CIRCLE)
    if (map.getSource(TOPO_NIV_LAYER_SOURCE)) map.removeSource(TOPO_NIV_LAYER_SOURCE)
  } catch { /* ignore */ }
}

/**
 * Añade o actualiza la capa. Si visible=false, elimina capas.
 * @param {mapboxgl.Map} map
 * @param {GeoJSON.FeatureCollection} fc
 * @param {boolean} visible
 */
export function syncTopoNivelacionLayer(map, fc, visible) {
  if (!map) return
  if (!visible) {
    removeTopoNivelacionLayers(map)
    return
  }
  const data = fc && fc.type === 'FeatureCollection'
    ? fc
    : { type: 'FeatureCollection', features: [] }
  try {
    const src = map.getSource(TOPO_NIV_LAYER_SOURCE)
    if (src) {
      src.setData(data)
    } else {
      map.addSource(TOPO_NIV_LAYER_SOURCE, { type: 'geojson', data })
    }
    if (!map.getLayer(TOPO_NIV_LAYER_CIRCLE)) {
      map.addLayer({
        id: TOPO_NIV_LAYER_CIRCLE,
        type: 'circle',
        source: TOPO_NIV_LAYER_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#0E7C86',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
    if (!map.getLayer(TOPO_NIV_LAYER_LABEL)) {
      map.addLayer({
        id: TOPO_NIV_LAYER_LABEL,
        type: 'symbol',
        source: TOPO_NIV_LAYER_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#0f766e',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      })
    }
  } catch { /* estilo aún no listo */ }
}
