/**
 * Convierte escena del editor de esquema (coords mundo) a GeoJSON WGS84
 * usando el origen geográfico fijado al activar el mapa.
 *
 * Convención: mundo (0,0) = originLngLat; +X = este; +Y = sur (lienzo Y↓).
 * Soporta tipos de dibujo: nodo | linea | poligono.
 * Nodo + entidad de biblioteca: Point (marcador LOD) + Polygon del bloque insertado.
 */
import { worldToMeters, PX_PER_METER } from '../../components/esquema/esquemaGeometry.js'
import { packLibraryBlock } from '../../components/esquema/esquemaLibrary.js'
import { normalizarTipoDibujo, contarPuntosEscena } from './sicoeDibujoTipos.js'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'

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
  if (type === 'bloque') {
    const ring = bloqueWorldCorners(obj)
    return ring ? [ring] : []
  }
  return []
}

/** Esquinas del bloque de entidad (bbox) en coords mundo, con rotación. */
export function bloqueWorldCorners(obj) {
  if (!obj || obj.type !== 'bloque') return null
  const x = Number(obj.x) || 0
  const y = Number(obj.y) || 0
  const w = Math.max(1, Number(obj.w) || 1)
  const h = Math.max(1, Number(obj.h) || 1)
  const rot = Number(obj.rotation) || 0
  const cx = x + w / 2
  const cy = y + h / 2
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  return corners.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
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

function allBloquesWorld(objects) {
  return (objects || []).filter((o) => o?.type === 'bloque')
}

/**
 * Snapshot de la primera entidad (bloque) de la escena para persistir con el dibujo.
 */
export function snapshotEntidadDesdeEscena(objects, metaEntidad = null) {
  const bloques = allBloquesWorld(objects)
  if (!bloques.length) {
    if (metaEntidad && (metaEntidad.objects || metaEntidad.children)) {
      return {
        id: metaEntidad.id ?? null,
        nombre: metaEntidad.nombre || 'Entidad',
        w: metaEntidad.w,
        h: metaEntidad.h,
        objects: metaEntidad.objects || metaEntidad.children || [],
      }
    }
    return null
  }
  const b = bloques[0]
  const packed = packLibraryBlock(b.children?.length ? b.children : [b])
  return {
    id: b.libraryId || metaEntidad?.id || b.id || null,
    nombre: b.libraryNombre || metaEntidad?.nombre || 'Entidad',
    w: packed.w,
    h: packed.h,
    objects: packed.children,
    rotation: Number(b.rotation) || 0,
    scene_x: Number(b.x) || 0,
    scene_y: Number(b.y) || 0,
  }
}

/**
 * @param {object[]} objects
 * @param {{ lng: number, lat: number }} origin
 * @param {{
 *   reporteId?: number|string,
 *   dibujoTipo?: string,
 *   entidad?: object|null,
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

    const entidad = snapshotEntidadDesdeEscena(list, meta.entidad)
    const features = [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: {
        ...baseProps,
        huella_tipo: 'nodo',
        escena_id: nodo?.id ?? null,
        node_num: nodo?.num ?? null,
        entidad_biblioteca: entidad,
        entidad_id: entidad?.id ?? null,
        entidad_nombre: entidad?.nombre ?? null,
        lod_marker: true,
      },
    }]

    const bloques = allBloquesWorld(list)
    for (const bloque of bloques) {
      const corners = bloqueWorldCorners(bloque)
      if (!corners) continue
      const lnglat = ptsToLngLat(corners, origin)
      const ring = closeRing(lnglat)
      if (!ring) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          ...baseProps,
          huella_tipo: 'nodo',
          escena_id: bloque?.id ?? null,
          entidad_biblioteca: entidad,
          entidad_id: entidad?.id ?? null,
          entidad_nombre: entidad?.nombre ?? null,
          es_entidad: true,
        },
      })
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

  // Preferir polígono de entidad si es nodo
  if (tipoMeta === 'nodo' || feats.some((f) => f?.properties?.dibujo_tipo === 'nodo' || f?.properties?.huella_tipo === 'nodo')) {
    const entidadPoly = feats.find((f) => (
      f?.geometry?.type === 'Polygon'
      && (f?.properties?.es_entidad || f?.properties?.es_bloque)
    ))
    const point = feats.find((f) => f?.geometry?.type === 'Point')
    const geom = entidadPoly?.geometry || point?.geometry
    if (geom) {
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          ...(point?.properties || {}),
          ...(entidadPoly?.properties || {}),
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

/**
 * Origen geográfico guardado en dibujo_escena (origin_lnglat | origen_lnglat).
 * @param {object|null} escena
 * @returns {{ lng: number, lat: number }|null}
 */
export function originFromDibujoEscena(escena) {
  if (!escena || typeof escena !== 'object') return null
  const raw = escena.origin_lnglat || escena.origen_lnglat || escena.originLngLat || null
  if (!raw || typeof raw !== 'object') return null
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude)
  const lat = Number(raw.lat ?? raw.latitude)
  if (![lng, lat].every(Number.isFinite)) return null
  return { lng, lat }
}

/**
 * Origen WGS84 preferido para una escena: Gauss de nodos (corrige origin_lnglat
 * desplazado) o, en su defecto, origin_lnglat guardado.
 */
export function originLngLatPreferGauss(escena, objects = null) {
  const list = Array.isArray(objects) ? objects
    : (Array.isArray(escena?.objects) ? escena.objects : [])
  const nodos = list.filter((o) => (
    o
    && o.type === 'nodo'
    && Number.isFinite(Number(o.norte))
    && Number.isFinite(Number(o.este))
  ))
  if (nodos.length) {
    let best = nodos[0]
    let bestD = Infinity
    for (const n of nodos) {
      const d = Math.hypot(Number(n.x) || 0, Number(n.y) || 0)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    const x = Number(best.x) || 0
    const y = Number(best.y) || 0
    const este0 = Number(best.este) - x / PX_PER_METER
    const norte0 = Number(best.norte) + y / PX_PER_METER
    const ll = gkBogotaToWgs84(este0, norte0)
    if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) {
      return { lng: ll.lng, lat: ll.lat }
    }
  }
  return originFromDibujoEscena(escena)
}

function rotateAround(p, cx, cy, rot) {
  if (!rot) return { x: p.x, y: p.y }
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const dx = p.x - cx
  const dy = p.y - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

/** Punto local de hijo de bloque → mundo (posición + rotación del bloque). */
export function bloqueChildToWorld(bloque, localPt) {
  const bx = Number(bloque?.x) || 0
  const by = Number(bloque?.y) || 0
  const w = Number(bloque?.w) || 0
  const h = Number(bloque?.h) || 0
  const rot = Number(bloque?.rotation) || 0
  const p = {
    x: bx + Number(localPt?.x || 0),
    y: by + Number(localPt?.y || 0),
  }
  return rotateAround(p, bx + w / 2, by + h / 2, rot)
}

function mapPtsThroughBloque(bloque, pts) {
  return (pts || []).map((p) => bloqueChildToWorld(bloque, p))
}

function ellipseRingLocal(obj, steps = 24) {
  const x1 = Number(obj?.x1)
  const y1 = Number(obj?.y1)
  const x2 = Number(obj?.x2)
  const y2 = Number(obj?.y2)
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const rx = Math.abs(x2 - x1) / 2
  const ry = Math.abs(y2 - y1) / 2
  if (rx < 1e-6 && ry < 1e-6) return null
  const ring = []
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    ring.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  }
  return ring
}

/**
 * Geometría detallada de un objeto de escena (mundo), sin convertir a lng/lat.
 * Incluye hijos de bloque (forma real de la entidad).
 * @returns {Array<{kind:'point'|'line'|'polygon', points: Array<{x:number,y:number}>, meta?: object}>}
 */
export function objectDetalleWorldParts(obj, { parentBloque = null } = {}) {
  if (!obj || typeof obj !== 'object') return []
  const type = String(obj.type || '')
  const xf = (pts) => (parentBloque ? mapPtsThroughBloque(parentBloque, pts) : pts)

  if (type === 'bloque') {
    const children = Array.isArray(obj.children) ? obj.children : []
    const parts = []
    for (const ch of children) {
      parts.push(...objectDetalleWorldParts(ch, { parentBloque: obj }))
    }
    return parts
  }

  if (type === 'nodo') {
    if (!Number.isFinite(obj.x) || !Number.isFinite(obj.y)) return []
    return [{
      kind: 'point',
      points: xf([{ x: Number(obj.x), y: Number(obj.y) }]),
      meta: { escena_tipo: 'nodo', node_num: obj.nodeNum ?? null },
    }]
  }

  if (type === 'linea' || type === 'flecha') {
    if (![obj.x1, obj.y1, obj.x2, obj.y2].every(Number.isFinite)) return []
    return [{
      kind: 'line',
      points: xf([
        { x: Number(obj.x1), y: Number(obj.y1) },
        { x: Number(obj.x2), y: Number(obj.y2) },
      ]),
      meta: { escena_tipo: type },
    }]
  }

  if (type === 'polilinea' || type === 'stroke') {
    const pts = (Array.isArray(obj.points) ? obj.points : [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    if (pts.length < 2) return []
    const closed = isClosedPolyline(obj)
    if (closed && pts.length >= 3) {
      return [{ kind: 'polygon', points: xf(pts), meta: { escena_tipo: type } }]
    }
    return [{ kind: 'line', points: xf(pts), meta: { escena_tipo: type } }]
  }

  if (type === 'rect') {
    const x1 = Number(obj.x1)
    const y1 = Number(obj.y1)
    const x2 = Number(obj.x2)
    const y2 = Number(obj.y2)
    if (![x1, y1, x2, y2].every(Number.isFinite)) return []
    return [{
      kind: 'polygon',
      points: xf([
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ]),
      meta: { escena_tipo: 'rect' },
    }]
  }

  if (type === 'triangulo') {
    const pts = (Array.isArray(obj.points) ? obj.points : [])
      .slice(0, 3)
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    if (pts.length < 3) return []
    return [{ kind: 'polygon', points: xf(pts), meta: { escena_tipo: 'triangulo' } }]
  }

  if (type === 'elipse') {
    const ring = ellipseRingLocal(obj)
    if (!ring) return []
    return [{ kind: 'polygon', points: xf(ring), meta: { escena_tipo: 'elipse' } }]
  }

  if (type === 'hatch' && Array.isArray(obj.outer) && obj.outer.length >= 3) {
    const pts = obj.outer
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    if (pts.length < 3) return []
    return [{ kind: 'polygon', points: xf(pts), meta: { escena_tipo: 'hatch' } }]
  }

  return []
}

function partsToFeatures(parts, origin, baseProps) {
  const features = []
  for (const part of parts || []) {
    if (!part?.points?.length) continue
    const lnglat = ptsToLngLat(part.points, origin)
    if (!lnglat) continue
    if (part.kind === 'point') {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: lnglat[0] },
        properties: { ...baseProps, ...(part.meta || {}), detalle: true },
      })
      continue
    }
    if (part.kind === 'line') {
      if (lnglat.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lnglat },
        properties: { ...baseProps, ...(part.meta || {}), detalle: true },
      })
      continue
    }
    if (part.kind === 'polygon') {
      const ring = closeRing(lnglat)
      if (!ring) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          ...baseProps,
          ...(part.meta || {}),
          detalle: true,
          es_entidad: part.meta?.escena_tipo ? true : undefined,
        },
      })
    }
  }
  return features
}

/**
 * Convierte dibujo_escena completo a GeoJSON detallado (forma real de entidades,
 * nodos, líneas y polígonos) para capas de referencia en el plano.
 * @param {object} escena
 * @param {{ reporteId?: number|string }} [meta]
 */
export function esquemaEscenaToDetalleGeojson(escena, meta = {}) {
  let objects = Array.isArray(escena?.objects) ? escena.objects : []
  const origin = originLngLatPreferGauss(escena, objects)
  if (!origin) return { type: 'FeatureCollection', features: [] }

  // Recuperar entidad solo-snapshot si no hay bloque en objects
  if (!objects.some((o) => o?.type === 'bloque') && escena?.entidad_biblioteca) {
    const ent = escena.entidad_biblioteca
    const kids = Array.isArray(ent.objects) ? ent.objects
      : (Array.isArray(ent.children) ? ent.children : [])
    if (kids.length) {
      const w = Math.max(1, Number(ent.w) || 1)
      const h = Math.max(1, Number(ent.h) || 1)
      const sx = Number.isFinite(ent.scene_x) ? Number(ent.scene_x) : (-w / 2)
      const sy = Number.isFinite(ent.scene_y) ? Number(ent.scene_y) : (-h / 2)
      objects = [
        ...objects,
        {
          type: 'bloque',
          x: sx,
          y: sy,
          w,
          h,
          rotation: Number(ent.rotation) || 0,
          children: kids,
          libraryId: ent.id,
          libraryNombre: ent.nombre,
        },
      ]
    }
  }

  const tipo = normalizarTipoDibujo(
    escena?.dibujo_tipo || meta.dibujoTipo || 'poligono',
  )
  const baseProps = {
    origen: 'reporte_dibujo_ref',
    reporte_id: meta.reporteId ?? null,
    dibujo_tipo: tipo,
  }

  const parts = []
  for (const obj of objects) {
    parts.push(...objectDetalleWorldParts(obj))
  }
  const features = partsToFeatures(parts, origin, baseProps)
  return { type: 'FeatureCollection', features }
}

export { contarPuntosEscena }
