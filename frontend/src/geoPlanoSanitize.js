/**
 * Limpieza de GeoJSON de plano para Mapbox GL:
 * - Elimina vértices consecutivos duplicados (común en export CAD).
 * - Cierra anillos de polígono si el último punto ≠ primero (GeoJSON RFC 7946).
 * - Parte polígonos auto-intersectados (“kinks”) con @turf/unkink-polygon para que el
 *   relleno no genere picos/triángulos (típico de arcos/splines mal discretizados al exportar).
 *
 * Si tras unkink siguen artefactos, conviene mejorar la exportación (plugin/CAD → más vértices
 * en curvas, “polygon repair” en QGIS, etc.).
 */
import unkinkPolygon from '@turf/unkink-polygon'
import { feature } from '@turf/helpers'

function dedupeConsecutiveRing(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return ring
  const out = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]
    if (!Array.isArray(p) || p.length < 2) continue
    const q = out[out.length - 1]
    if (p[0] !== q[0] || p[1] !== q[1]) out.push(p)
  }
  return out
}

function closeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return ring
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return ring
  if (a[0] === b[0] && a[1] === b[1]) return ring
  return [...ring, [a[0], a[1]]]
}

function sanitizePolygonCoords(coords) {
  if (!Array.isArray(coords)) return coords
  return coords.map((ring) => closeRing(dedupeConsecutiveRing(ring)))
}

/**
 * Convierte la salida de unkinkPolygon (FeatureCollection de Polygon) en una sola geometría.
 */
function _geometryFromUnkinkedFeatureCollection(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || feats.length === 0) return null
  const polys = feats.filter((f) => f?.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates))
  if (polys.length === 0) return null
  if (polys.length === 1) return polys[0].geometry
  return { type: 'MultiPolygon', coordinates: polys.map((p) => p.geometry.coordinates) }
}

/**
 * Tras dedupe + cierre, intenta eliminar auto-intersecciones que rompen el triángulo del relleno en Mapbox.
 */
function unkinkPolygonGeometry(geom) {
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return geom
  try {
    const fc = unkinkPolygon(feature(geom))
    const next = _geometryFromUnkinkedFeatureCollection(fc)
    return next || geom
  } catch {
    return geom
  }
}

function dedupeLineCoords(line) {
  if (!Array.isArray(line) || line.length === 0) return line
  if (typeof line[0] === 'number') return line
  const out = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const p = line[i]
    if (!Array.isArray(p) || p.length < 2) continue
    const q = out[out.length - 1]
    if (p[0] !== q[0] || p[1] !== q[1]) out.push(p)
  }
  return out
}

function sanitizeGeometry(geom) {
  if (!geom || !geom.type) return geom
  if (geom.type === 'Polygon') {
    const coords = sanitizePolygonCoords(geom.coordinates)
    return unkinkPolygonGeometry({ ...geom, coordinates: coords })
  }
  if (geom.type === 'MultiPolygon') {
    const coords = geom.coordinates.map(sanitizePolygonCoords)
    return unkinkPolygonGeometry({ ...geom, coordinates: coords })
  }
  if (geom.type === 'LineString') {
    return { ...geom, coordinates: dedupeLineCoords(geom.coordinates) }
  }
  if (geom.type === 'MultiLineString') {
    return { ...geom, coordinates: geom.coordinates.map(dedupeLineCoords) }
  }
  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    return { ...geom, geometries: geom.geometries.map(sanitizeGeometry) }
  }
  return geom
}

/**
 * Devuelve una copia del FeatureCollection con geometrías saneadas.
 */
export function sanitizePlanoFeatureCollection(fc) {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return fc
  return {
    ...fc,
    features: fc.features.map((f) => {
      if (!f || f.type !== 'Feature' || !f.geometry) return f
      return { ...f, geometry: sanitizeGeometry(f.geometry) }
    }),
  }
}
