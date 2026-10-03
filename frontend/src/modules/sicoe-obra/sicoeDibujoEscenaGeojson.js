/**
 * Convierte escena del editor de esquema (coords mundo) a GeoJSON WGS84
 * usando el origen geográfico fijado al activar el mapa.
 *
 * Convención: mundo (0,0) = originLngLat; +X = este; +Y = sur (lienzo Y↓).
 */
import { PX_PER_METER, worldToMeters } from '../../components/esquema/esquemaGeometry.js'

const METERS_PER_DEG_LAT = 111320

function offsetMetersToLngLat(eastM, northM, origin) {
  const lat = Number(origin?.lat)
  const lng = Number(origin?.lng)
  if (![lat, lng, eastM, northM].every(Number.isFinite)) return null
  const dLat = northM / METERS_PER_DEG_LAT
  const cos = Math.cos((lat * Math.PI) / 180)
  const dLng = cos > 1e-6 ? eastM / (METERS_PER_DEG_LAT * cos) : 0
  return [lng + dLng, lat + dLat]
}

export function worldPointToLngLat(wx, wy, origin) {
  const eastM = worldToMeters(wx)
  const northM = -worldToMeters(wy)
  return offsetMetersToLngLat(eastM, northM, origin)
}

function closeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const out = ring.map((p) => [Number(p[0]), Number(p[1])])
  if (!out.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null
  const a = out[0]
  const b = out[out.length - 1]
  if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]])
  if (out.length < 4) return null
  return out
}

function ptsToLngLat(pts, origin) {
  const out = []
  for (const p of pts || []) {
    const ll = worldPointToLngLat(p.x, p.y, origin)
    if (!ll) return null
    out.push(ll)
  }
  return out
}

/** Extrae anillo(s) en coords mundo desde un objeto de escena. */
export function objectWorldRings(obj) {
  if (!obj || typeof obj !== 'object') return []
  const type = String(obj.type || '')
  if (type === 'polilinea' || type === 'stroke') {
    const pts = Array.isArray(obj.points) ? obj.points : []
    if (pts.length < 3) return []
    const closed = obj.closed === true
      || (pts.length >= 3
        && Math.hypot(
          Number(pts[0].x) - Number(pts[pts.length - 1].x),
          Number(pts[0].y) - Number(pts[pts.length - 1].y),
        ) < 1e-6)
    if (!closed && type === 'stroke') return []
    // Polilínea abierta no es huella poligonal
    if (!closed && type === 'polilinea') return []
    return [pts.map((p) => ({ x: Number(p.x), y: Number(p.y) }))]
  }
  if (type === 'rect') {
    const x1 = Number(obj.x1)
    const y1 = Number(obj.y1)
    const x2 = Number(obj.x2)
    const y2 = Number(obj.y2)
    if (![x1, y1, x2, y2].every(Number.isFinite)) return []
    return [[
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ]]
  }
  if (type === 'triangulo') {
    const pts = Array.isArray(obj.points) ? obj.points : []
    if (pts.length >= 3) {
      return [pts.slice(0, 3).map((p) => ({ x: Number(p.x), y: Number(p.y) }))]
    }
    return []
  }
  if (type === 'hatch' && Array.isArray(obj.outer)) {
    return [obj.outer.map((p) => ({ x: Number(p.x), y: Number(p.y) }))]
  }
  return []
}

/**
 * @param {object[]} objects escena esquema
 * @param {{ lng: number, lat: number }} origin
 * @param {{ reporteId?: number|string }} [meta]
 * @returns {{ type: 'FeatureCollection', features: object[] }}
 */
export function esquemaSceneToGeojson(objects, origin, meta = {}) {
  const features = []
  const list = Array.isArray(objects) ? objects : []
  for (let i = 0; i < list.length; i += 1) {
    const obj = list[i]
    const ringsW = objectWorldRings(obj)
    for (const ringW of ringsW) {
      const lnglat = ptsToLngLat(ringW, origin)
      const ring = closeRing(lnglat)
      if (!ring) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          origen: 'reporte_dibujo',
          reporte_id: meta.reporteId ?? null,
          escena_id: obj?.id ?? null,
          escena_tipo: obj?.type ?? null,
          line_style: obj?.lineStyle || null,
          index: features.length,
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

/** Primera geometría Polygon útil como huella individual (Feature). */
export function featureHuellaDesdeDibujo(dibujoFc, extraProps = {}) {
  const feats = dibujoFc?.features || []
  for (const f of feats) {
    const g = f?.geometry
    if (g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 4) {
      return {
        type: 'Feature',
        geometry: g,
        properties: {
          ...(f.properties || {}),
          ...extraProps,
          origen: 'reporte_dibujo',
          precision: 'precisa',
          huella_tipo: 'poligono',
        },
      }
    }
    if (g?.type === 'MultiPolygon') {
      const first = g.coordinates?.[0]
      if (Array.isArray(first?.[0]) && first[0].length >= 4) {
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: first },
          properties: {
            ...(f.properties || {}),
            ...extraProps,
            origen: 'reporte_dibujo',
            precision: 'precisa',
            huella_tipo: 'poligono',
          },
        }
      }
    }
  }
  // Si hay varios polígonos, unirlos en GeometryCollection / MultiPolygon
  const polys = feats
    .map((f) => f?.geometry)
    .filter((g) => g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0]))
  if (polys.length > 1) {
    return {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: polys.map((g) => g.coordinates),
      },
      properties: {
        ...extraProps,
        origen: 'reporte_dibujo',
        precision: 'precisa',
        huella_tipo: 'poligono',
        partes: polys.length,
      },
    }
  }
  return null
}

export { PX_PER_METER }
