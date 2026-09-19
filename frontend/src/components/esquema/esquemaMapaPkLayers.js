/**
 * Capas de polígonos PK_ID + abscisas para el mapa del editor de esquema.
 * Reutiliza el mismo criterio visual del selector de PK (PptoFiltroMapaPk),
 * sin modificar ese componente.
 */
import { sanitizePlanoFeatureCollection } from '../../geoPlanoSanitize.js'
import {
  addMapboxAbscisaLabelLayers,
  mapboxPlanoSymbolLayout,
  MAPBOX_ABSCISA_TEXT_FIELD,
  MAPBOX_PLANO_PAINT_LABELS,
} from '../../mapboxPlanoLabels.js'
import { normalizarPkToken } from '../../modules/sicoe-obra/sicoePkResolver.js'
import { sicoeDatosMapaPortadaPk } from '../../modules/sicoe-obra/sicoeMapaPortadaPk.js'

export const ESQUEMA_MAPA_PK_SOURCE = 'esquema-plano'
export const ESQUEMA_MAPA_PK_FILL = 'esquema-plano-fill'
export const ESQUEMA_MAPA_PK_LINE = 'esquema-plano-line'
export const ESQUEMA_MAPA_PK_LABELS = 'esquema-labels-abscisa'
export const ESQUEMA_MAPA_NORTH_BEARING = 270

export const ESQUEMA_MAPA_PK_COLOR = '#0077B6'
export const ESQUEMA_MAPA_PK_SELECTED = '#F59E0B'
export const ESQUEMA_MAPA_PK_LINE_COLOR = '#00A896'

/**
 * @param {unknown} f
 * @returns {string}
 */
export function featurePkId(f) {
  const p = f?.properties
  if (!p) return ''
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

/**
 * Normaliza contexto de apertura del mapa del esquema.
 * @param {unknown} raw mapLocation o mapContext
 * @returns {{
 *   lat: number|null,
 *   lng: number|null,
 *   pkId: string,
 *   absInicio: string|number|null,
 *   absFinal: string|number|null,
 *   hasPk: boolean,
 *   hasPoint: boolean,
 * }}
 */
export function normalizeMapContext(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      lat: null,
      lng: null,
      pkId: '',
      absInicio: null,
      absFinal: null,
      hasPk: false,
      hasPoint: false,
    }
  }
  const lat = Number(
    raw.lat ?? raw.latitude ?? raw.coord_lat ?? raw.coordLat ?? raw.ubicacion_lat,
  )
  const lng = Number(
    raw.lng ?? raw.lon ?? raw.longitude ?? raw.coord_lng ?? raw.coordLng ?? raw.ubicacion_lng,
  )
  const pkId = String(
    raw.pkId ?? raw.pk_id ?? raw.pkLabel ?? raw.ubicacion_pk ?? raw.PK_ID ?? '',
  ).trim()
  const absInicio = raw.absInicio ?? raw.abs_inicio ?? null
  const absFinal = raw.absFinal ?? raw.abs_final ?? null
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  return {
    lat: hasPoint ? lat : null,
    lng: hasPoint ? lng : null,
    pkId,
    absInicio,
    absFinal,
    hasPk: !!pkId,
    hasPoint,
  }
}

/**
 * Prepara FeatureCollection con polígonos PK + puntos de abscisa.
 * @param {unknown} planoRaw
 */
export function buildEsquemaPlanoFc(planoRaw) {
  const planoFc = sanitizePlanoFeatureCollection(
    planoRaw && planoRaw.type === 'FeatureCollection'
      ? planoRaw
      : { type: 'FeatureCollection', features: [] },
  ) || { type: 'FeatureCollection', features: [] }

  const soloPoligonos = (planoFc.features || []).filter(
    (f) => f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon',
  ).map((f) => {
    const pkid = featurePkId(f)
    return pkid
      ? { ...f, properties: { ...f.properties, pk_id: f.properties?.pk_id || pkid } }
      : f
  })
  const puntosAbscisa = (planoFc.features || []).filter((f) => {
    const gt = f?.geometry?.type
    if (gt !== 'Point' && gt !== 'MultiPoint') return false
    return String(f?.properties?.etiqueta ?? f?.properties?.Etiqueta ?? '').trim().length > 0
  })
  return {
    type: 'FeatureCollection',
    features: [...soloPoligonos, ...puntosAbscisa],
  }
}

function forEachLngLat(node, fn) {
  if (!Array.isArray(node)) return
  if (typeof node[0] === 'number' && typeof node[1] === 'number') {
    fn(node[0], node[1])
    return
  }
  for (let i = 0; i < node.length; i += 1) forEachLngLat(node[i], fn)
}

/**
 * @param {{ type: string, features?: object[] }} fc
 * @returns {[number, number, number, number]|null} [minLng, minLat, maxLng, maxLat]
 */
export function boundsFromFeatureCollection(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || !feats.length) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let n = 0
  for (const f of feats) {
    const coords = f?.geometry?.coordinates
    if (!coords) continue
    forEachLngLat(coords, (lng, lat) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      n += 1
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    })
  }
  if (!n) return null
  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Bounds del polígono PK seleccionado (o null).
 * @param {{ type: string, features?: object[] }} fc
 * @param {string} pkId
 */
export function boundsForSelectedPk(fc, pkId) {
  const want = normalizarPkToken(pkId)
  if (!want) return null
  const matched = {
    type: 'FeatureCollection',
    features: (fc?.features || []).filter((f) => {
      const gt = f?.geometry?.type
      if (gt !== 'Polygon' && gt !== 'MultiPolygon') return false
      return normalizarPkToken(featurePkId(f)) === want
    }),
  }
  return boundsFromFeatureCollection(matched)
}

/**
 * Añade/actualiza capas de plano en el mapa del esquema.
 * @param {import('mapbox-gl').Map} map
 * @param {{ type: string, features?: object[] }} planoFc
 * @param {string} [selectedPk]
 */
export function ensureEsquemaPkLayers(map, planoFc, selectedPk = '') {
  if (!map || !planoFc) return
  try {
    if (map.getSource(ESQUEMA_MAPA_PK_SOURCE)) {
      map.getSource(ESQUEMA_MAPA_PK_SOURCE).setData(planoFc)
    } else {
      map.addSource(ESQUEMA_MAPA_PK_SOURCE, { type: 'geojson', data: planoFc })
    }
    if (!map.getLayer(ESQUEMA_MAPA_PK_FILL)) {
      map.addLayer({
        id: ESQUEMA_MAPA_PK_FILL,
        type: 'fill',
        source: ESQUEMA_MAPA_PK_SOURCE,
        filter: [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        paint: {
          'fill-color': ESQUEMA_MAPA_PK_COLOR,
          'fill-opacity': 0.3,
        },
      })
    }
    if (!map.getLayer(ESQUEMA_MAPA_PK_LINE)) {
      map.addLayer({
        id: ESQUEMA_MAPA_PK_LINE,
        type: 'line',
        source: ESQUEMA_MAPA_PK_SOURCE,
        filter: [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        paint: {
          'line-color': ESQUEMA_MAPA_PK_LINE_COLOR,
          'line-width': 1,
        },
      })
    }
    if (!map.getLayer(`${ESQUEMA_MAPA_PK_LABELS}-1km`)) {
      addMapboxAbscisaLabelLayers(map, {
        idPrefix: ESQUEMA_MAPA_PK_LABELS,
        source: ESQUEMA_MAPA_PK_SOURCE,
        layout: mapboxPlanoSymbolLayout(MAPBOX_ABSCISA_TEXT_FIELD),
        paint: MAPBOX_PLANO_PAINT_LABELS,
      })
    }
    applyEsquemaPkSelectionStyle(map, selectedPk)
  } catch {
    /* estilo aún cargando */
  }
}

/**
 * Resalte ámbar del PK seleccionado (mismo criterio que PptoFiltroMapaPk).
 * @param {import('mapbox-gl').Map} map
 * @param {string} selectedPk
 */
export function applyEsquemaPkSelectionStyle(map, selectedPk) {
  if (!map?.getLayer?.(ESQUEMA_MAPA_PK_FILL)) return
  const sel = String(selectedPk || '').trim()
  try {
    if (!sel) {
      map.setPaintProperty(ESQUEMA_MAPA_PK_FILL, 'fill-color', ESQUEMA_MAPA_PK_COLOR)
      map.setPaintProperty(ESQUEMA_MAPA_PK_FILL, 'fill-opacity', 0.3)
      return
    }
    map.setPaintProperty(ESQUEMA_MAPA_PK_FILL, 'fill-color', [
      'case',
      ['==', ['downcase', ['coalesce', ['get', 'PK_ID'], ['get', 'pk_id'], ['get', 'Layer'], '']], sel.toLowerCase()],
      ESQUEMA_MAPA_PK_SELECTED,
      ESQUEMA_MAPA_PK_COLOR,
    ])
    map.setPaintProperty(ESQUEMA_MAPA_PK_FILL, 'fill-opacity', [
      'case',
      ['==', ['downcase', ['coalesce', ['get', 'PK_ID'], ['get', 'pk_id'], ['get', 'Layer'], '']], sel.toLowerCase()],
      0.55,
      0.3,
    ])
  } catch {
    /* ignore */
  }
}

/**
 * Ajusta la cámara: PK seleccionado → zoom al polígono/punto; si no → vista del contrato.
 * @param {import('mapbox-gl').Map} map
 * @param {{ type: string, features?: object[] }} planoFc
 * @param {ReturnType<typeof normalizeMapContext>} ctx
 * @param {{ centroLng?: number, centroLat?: number }} [contrato]
 */
export function fitEsquemaMapCamera(map, planoFc, ctx, contrato = {}) {
  if (!map) return
  const bearing = ESQUEMA_MAPA_NORTH_BEARING
  try {
    if (ctx?.hasPk) {
      const bPk = boundsForSelectedPk(planoFc, ctx.pkId)
      if (bPk) {
        map.fitBounds(bPk, { padding: 48, maxZoom: 17, bearing, pitch: 0, duration: 0 })
        return
      }
      const portada = sicoeDatosMapaPortadaPk(
        planoFc,
        ctx.pkId,
        ctx.absInicio,
        ctx.absFinal,
      )
      if (portada?.bounds) {
        const b = portada.bounds
        map.fitBounds(
          [[b.minLng, b.minLat], [b.maxLng, b.maxLat]],
          { padding: 48, maxZoom: 17, bearing, pitch: 0, duration: 0 },
        )
        return
      }
    }
    if (ctx?.hasPoint) {
      map.flyTo({
        center: [ctx.lng, ctx.lat],
        zoom: 16,
        bearing,
        pitch: 0,
        duration: 0,
      })
      return
    }
    const bAll = boundsFromFeatureCollection(planoFc)
    if (bAll) {
      map.fitBounds(bAll, { padding: 32, maxZoom: 16, bearing, pitch: 0, duration: 0 })
      return
    }
    const clat = Number(contrato.centroLat ?? contrato.centro_lat)
    const clng = Number(contrato.centroLng ?? contrato.centro_lng)
    if (Number.isFinite(clat) && Number.isFinite(clng)) {
      map.flyTo({ center: [clng, clat], zoom: 12, bearing, pitch: 0, duration: 0 })
    }
  } catch {
    /* ignore */
  }
}

function haversineM(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Consulta PK + abscisa más cercana a un clic (lng/lat).
 * @param {{ type: string, features?: object[] }} planoFc
 * @param {number} lng
 * @param {number} lat
 * @param {string} [pkFromClick]
 * @returns {{ pkId: string, abscisa: string, distanceM: number|null }}
 */
export function queryPkYAbscisaEnPunto(planoFc, lng, lat, pkFromClick = '') {
  let pkId = String(pkFromClick || '').trim()
  if (!pkId && Array.isArray(planoFc?.features)) {
    // Si el clic no vino de un feature, buscar polígono que contenga el punto es costoso;
    // dejamos vacío y solo abscisa cercana.
    pkId = ''
  }
  let best = { etiqueta: '', dist: Infinity }
  for (const f of planoFc?.features || []) {
    const gt = f?.geometry?.type
    if (gt !== 'Point' && gt !== 'MultiPoint') continue
    const etiqueta = String(f?.properties?.etiqueta ?? f?.properties?.Etiqueta ?? '').trim()
    if (!etiqueta) continue
    const coords = gt === 'Point'
      ? [f.geometry.coordinates]
      : (f.geometry.coordinates || [])
    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) continue
      const d = haversineM(lng, lat, c[0], c[1])
      if (d < best.dist) best = { etiqueta, dist: d }
    }
  }
  // Límite razonable (~250 m) para no mostrar abscisa irrelevante en zoom lejano
  const abscisa = best.dist < 250 ? best.etiqueta : ''
  return {
    pkId,
    abscisa,
    distanceM: Number.isFinite(best.dist) && best.dist < Infinity ? best.dist : null,
  }
}
