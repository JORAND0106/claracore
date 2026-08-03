import {
  sicoeAbscisaAMetros,
  sicoeIndiceAbscisasDesdePlano,
  sicoeLngLatInterpAbscisa,
} from './sicoeLocalizacionHelpers.js'

function featurePkId(f) {
  const p = f?.properties
  if (!p) return ''
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

function normalizeContratoPlanoGeojson(plano) {
  if (plano == null || plano === '') return { type: 'FeatureCollection', features: [] }
  let p = plano
  if (typeof p === 'string') {
    try { p = JSON.parse(p) } catch { return { type: 'FeatureCollection', features: [] } }
  }
  if (!p || typeof p !== 'object') return { type: 'FeatureCollection', features: [] }
  if (p.type === 'FeatureCollection' && Array.isArray(p.features)) {
    return { type: 'FeatureCollection', features: p.features }
  }
  if (p.type === 'Feature' && p.geometry) {
    return { type: 'FeatureCollection', features: [p] }
  }
  if (Array.isArray(p.features)) {
    return { type: 'FeatureCollection', features: p.features }
  }
  return { type: 'FeatureCollection', features: [] }
}

function forEachLngLatInGeojsonCoords(node, fn) {
  if (!Array.isArray(node)) return
  if (typeof node[0] === 'number' && typeof node[1] === 'number') {
    fn(node[0], node[1])
    return
  }
  for (let i = 0; i < node.length; i++) forEachLngLatInGeojsonCoords(node[i], fn)
}

function boundsFromGeometry(geom) {
  if (!geom || !geom.type) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let n = 0
  const consider = (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    n += 1
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const walk = (g) => {
    if (!g || !g.type) return
    if (g.type === 'GeometryCollection') {
      for (const sub of g.geometries || []) walk(sub)
      return
    }
    if (g.coordinates) forEachLngLatInGeojsonCoords(g.coordinates, consider)
  }
  walk(geom)
  if (!n) return null
  return { minLng, maxLng, minLat, maxLat }
}

function boundsFromFeatureCollection(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || feats.length === 0) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let any = false
  for (const f of feats) {
    const b = f?.type === 'Feature' ? boundsFromGeometry(f.geometry) : boundsFromGeometry(f)
    if (!b) continue
    any = true
    if (b.minLng < minLng) minLng = b.minLng
    if (b.maxLng > maxLng) maxLng = b.maxLng
    if (b.minLat < minLat) minLat = b.minLat
    if (b.maxLat > maxLat) maxLat = b.maxLat
  }
  if (!any) return null
  return { minLng, maxLng, minLat, maxLat }
}

function featureCoincidePkPlano(f, wantNorm) {
  const gt = f?.geometry?.type
  if (gt !== 'Polygon' && gt !== 'MultiPolygon') return false
  const id = featurePkId(f).toLowerCase().replace(/\s+/g, '')
  if (!id || !wantNorm) return false
  return id === wantNorm
}

function pointInBounds(lng, lat, b, padFrac = 0.1) {
  if (!b || !Number.isFinite(lng) || !Number.isFinite(lat)) return false
  const padLng = Math.max((b.maxLng - b.minLng) * padFrac, 1e-5)
  const padLat = Math.max((b.maxLat - b.minLat) * padFrac, 1e-5)
  return (
    lng >= b.minLng - padLng && lng <= b.maxLng + padLng
    && lat >= b.minLat - padLat && lat <= b.maxLat + padLat
  )
}

/**
 * GeoJSON para mapa de portada (localización única): polígono(s) del PK,
 * puntos de abscisa cercanos al tramo, y extremos Abs. Inicio / Abs. Final.
 *
 * @param {*} planoRaw plano_geojson del contrato
 * @param {string} pkStr texto PK_ID (ej. "525254")
 * @param {string|number|null} absInicio
 * @param {string|number|null} absFinal
 */
export function sicoeDatosMapaPortadaPk(planoRaw, pkStr, absInicio, absFinal) {
  const empty = {
    planoFc: { type: 'FeatureCollection', features: [] },
    extremos: [],
    bounds: null,
  }
  const want = String(pkStr || '').trim().toLowerCase().replace(/\s+/g, '')
  const fc = normalizeContratoPlanoGeojson(planoRaw)
  if (!fc?.features?.length || !want) return empty

  const polys = []
  for (const f of fc.features) {
    if (!featureCoincidePkPlano(f, want)) continue
    const pkid = featurePkId(f)
    polys.push({
      ...f,
      properties: {
        ...f.properties,
        pk_id: pkid || f.properties?.pk_id || String(pkStr).trim(),
      },
    })
  }
  const bounds = polys.length
    ? boundsFromFeatureCollection({ type: 'FeatureCollection', features: polys })
    : null

  const absPts = []
  if (bounds) {
    for (const f of fc.features) {
      const gt = f?.geometry?.type
      if (gt !== 'Point' && gt !== 'MultiPoint') continue
      const et = String(f?.properties?.etiqueta ?? f?.properties?.Etiqueta ?? '').trim()
      if (!et) continue
      const coords = f.geometry.coordinates
      const lng = gt === 'Point' ? coords?.[0] : coords?.[0]?.[0]
      const lat = gt === 'Point' ? coords?.[1] : coords?.[0]?.[1]
      if (!pointInBounds(lng, lat, bounds, 0.12)) continue
      absPts.push(f)
    }
  }

  const indice = sicoeIndiceAbscisasDesdePlano(fc)
  const extremos = []
  const addExtremo = (raw, rol, prefijo) => {
    const m = sicoeAbscisaAMetros(raw)
    if (m == null) return
    const ll = sicoeLngLatInterpAbscisa(indice, m)
    if (!ll) return
    extremos.push({
      lng: ll.lng,
      lat: ll.lat,
      rol,
      label: `${prefijo} ${raw}`,
    })
  }
  addExtremo(absInicio, 'inicio', 'Abs. Ini.')
  addExtremo(absFinal, 'final', 'Abs. Fin.')

  const planoFc = { type: 'FeatureCollection', features: [...polys, ...absPts] }
  return {
    planoFc,
    extremos,
    bounds: bounds || boundsFromFeatureCollection(planoFc),
  }
}
