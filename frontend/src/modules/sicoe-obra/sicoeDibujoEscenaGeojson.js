/**
 * Convierte escena del editor de esquema (coords mundo) a GeoJSON WGS84
 * usando el origen geográfico fijado al activar el mapa.
 *
 * Convención: mundo (0,0) = originLngLat; +X = este; +Y = sur (lienzo Y↓).
 * Soporta tipos de dibujo: nodo | linea | poligono.
 */
import { worldToMeters } from '../../components/esquema/esquemaGeometry.js'
import { bloqueAPoligonoGeojson, snapshotBloque } from './sicoeBloquesNodo.js'
import { normalizarTipoDibujo, contarPuntosEscena } from './sicoeDibujoTipos.js'

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

function isClosedPolyline(obj) {
  const pts = Array.isArray(obj?.points) ? obj.points : []
  if (pts.length < 3) return false
  if (obj.closed === true) return true
  const a = pts[0]
  const b = pts[pts.length - 1]
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)) < 1e-6
}

/** Extrae anillo(s) en coords mundo desde un objeto de escena (solo cerrados). */
export function objectWorldRings(obj) {
  if (!obj || typeof obj !== 'object') return []
  const type = String(obj.type || '')
  if (type === 'polilinea' || type === 'stroke') {
    const pts = Array.isArray(obj.points) ? obj.points : []
    if (pts.length < 3) return []
    if (!isClosedPolyline(obj) && type === 'stroke') return []
    if (!isClosedPolyline(obj) && type === 'polilinea') return []
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

function objectWorldLine(obj) {
  if (!obj || typeof obj !== 'object') return null
  const type = String(obj.type || '')
  if (type === 'polilinea' || type === 'stroke') {
    const pts = (Array.isArray(obj.points) ? obj.points : [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    if (pts.length < 2) return null
    return pts
  }
  if (type === 'linea' || type === 'flecha') {
    if (![obj.x1, obj.y1, obj.x2, obj.y2].every(Number.isFinite)) return null
    return [
      { x: Number(obj.x1), y: Number(obj.y1) },
      { x: Number(obj.x2), y: Number(obj.y2) },
    ]
  }
  return null
}

function firstNodoWorld(objects) {
  for (const o of objects || []) {
    if (o?.type === 'nodo' && Number.isFinite(o.x) && Number.isFinite(o.y)) {
      return { x: Number(o.x), y: Number(o.y), num: o.nodeNum, id: o.id }
    }
  }
  return null
}

function allNodosWorld(objects) {
  return (objects || [])
    .filter((o) => o?.type === 'nodo' && Number.isFinite(o.x) && Number.isFinite(o.y))
    .map((o) => ({ x: Number(o.x), y: Number(o.y), num: o.nodeNum, id: o.id }))
}

/**
 * @param {object[]} objects
 * @param {{ lng: number, lat: number }} origin
 * @param {{
 *   reporteId?: number|string,
 *   dibujoTipo?: string,
 *   bloque?: object|null,
 *   rotacionDeg?: number,
 * }} [meta]
 */
export function esquemaSceneToGeojson(objects, origin, meta = {}) {
  const tipo = normalizarTipoDibujo(meta.dibujoTipo || meta.tipo || 'poligono')
  const list = Array.isArray(objects) ? objects : []
  const baseProps = {
    origen: 'reporte_dibujo',
    reporte_id: meta.reporteId ?? null,
    dibujo_tipo: tipo,
  }

  if (tipo === 'nodo') {
    const nodo = firstNodoWorld(list)
    let wx = nodo?.x
    let wy = nodo?.y
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
      // fallback: primer punto de cualquier objeto
      for (const o of list) {
        const rings = objectWorldRings(o)
        if (rings[0]?.[0]) {
          wx = rings[0][0].x
          wy = rings[0][0].y
          break
        }
        const line = objectWorldLine(o)
        if (line?.[0]) {
          wx = line[0].x
          wy = line[0].y
          break
        }
      }
    }
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
      return { type: 'FeatureCollection', features: [] }
    }
    const ll = worldPointToLngLat(wx, wy, origin)
    if (!ll) return { type: 'FeatureCollection', features: [] }
    const bloque = snapshotBloque(meta.bloque)
    const rot = Number(meta.rotacionDeg) || 0
    const features = [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: {
        ...baseProps,
        huella_tipo: 'nodo',
        escena_id: nodo?.id ?? null,
        node_num: nodo?.num ?? null,
        bloque_nodo: bloque,
        bloque_rotacion_deg: rot,
        lod_marker: true,
      },
    }]
    if (bloque) {
      const poly = bloqueAPoligonoGeojson(ll[0], ll[1], bloque, rot)
      if (poly) {
        features.push({
          type: 'Feature',
          geometry: poly,
          properties: {
            ...baseProps,
            huella_tipo: 'nodo',
            escena_id: nodo?.id ?? null,
            bloque_nodo: bloque,
            bloque_rotacion_deg: rot,
            es_bloque: true,
          },
        })
      }
    }
    return { type: 'FeatureCollection', features }
  }

  if (tipo === 'linea') {
    const features = []
    for (const obj of list) {
      const line = objectWorldLine(obj)
      if (!line) continue
      const coords = ptsToLngLat(line, origin)
      if (!coords || coords.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {
          ...baseProps,
          huella_tipo: 'linea',
          escena_id: obj?.id ?? null,
          escena_tipo: obj?.type ?? null,
          line_style: obj?.lineStyle || null,
          index: features.length,
        },
      })
    }
    if (!features.length) {
      const nodos = allNodosWorld(list)
      if (nodos.length >= 2) {
        const coords = ptsToLngLat(nodos, origin)
        if (coords && coords.length >= 2) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { ...baseProps, huella_tipo: 'linea', desde_nodos: true },
          })
        }
      }
    }
    return { type: 'FeatureCollection', features }
  }

  // poligono (default / legacy)
  const features = []
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
          ...baseProps,
          huella_tipo: 'poligono',
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

/** Primera geometría útil como huella individual (Feature) según tipo. */
export function featureHuellaDesdeDibujo(dibujoFc, extraProps = {}) {
  const feats = dibujoFc?.features || []
  const tipoMeta = normalizarTipoDibujo(
    extraProps.dibujo_tipo || dibujoFc?.dibujo_tipo || feats[0]?.properties?.dibujo_tipo,
    { fallback: '' },
  )

  // Preferir polígono de bloque si es nodo
  if (tipoMeta === 'nodo' || feats.some((f) => f?.properties?.dibujo_tipo === 'nodo' || f?.properties?.huella_tipo === 'nodo')) {
    const bloquePoly = feats.find((f) => f?.geometry?.type === 'Polygon' && f?.properties?.es_bloque)
    const point = feats.find((f) => f?.geometry?.type === 'Point')
    const geom = bloquePoly?.geometry || point?.geometry
    if (geom) {
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          ...(point?.properties || {}),
          ...(bloquePoly?.properties || {}),
          ...extraProps,
          origen: 'reporte_dibujo',
          precision: 'precisa',
          huella_tipo: 'nodo',
          dibujo_tipo: 'nodo',
        },
      }
    }
  }

  if (tipoMeta === 'linea' || feats.some((f) => f?.geometry?.type === 'LineString')) {
    const line = feats.find((f) => f?.geometry?.type === 'LineString')
    if (line?.geometry) {
      return {
        type: 'Feature',
        geometry: line.geometry,
        properties: {
          ...(line.properties || {}),
          ...extraProps,
          origen: 'reporte_dibujo',
          precision: 'precisa',
          huella_tipo: 'linea',
          dibujo_tipo: 'linea',
        },
      }
    }
  }

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
          dibujo_tipo: 'poligono',
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
            dibujo_tipo: 'poligono',
          },
        }
      }
    }
  }
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
        dibujo_tipo: 'poligono',
        partes: polys.length,
      },
    }
  }
  return null
}

export { contarPuntosEscena }
