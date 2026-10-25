/**
 * Exportación DXF (AutoCAD / Civil 3D) del dibujo editable del esquema.
 * Unidades: metros. Capas por tipo. Coords MAGNA-SIRGAS si hay tabla/mapa;
 * si no, coordenadas locales del lienzo convertidas a metros.
 */
import { worldToMeters } from './esquemaGeometry.js'

const LAYER = {
  dibujo2d: 'ESQUEMA_2D',
  solidos: 'ESQUEMA_SOLIDOS',
  cotas: 'ESQUEMA_COTAS',
  textos: 'ESQUEMA_TEXTOS',
  coordenadas: 'ESQUEMA_COORDS',
  acero: 'ESQUEMA_ACERO',
  hatch: 'ESQUEMA_HATCH',
}

function esc(s) {
  return String(s ?? '').replace(/[\r\n]/g, ' ').slice(0, 250)
}

function pair(code, value) {
  return `${code}\n${value}\n`
}

function layerTable(extraLayers = []) {
  const names = [
    ...Object.values(LAYER),
    ...extraLayers.filter(Boolean),
  ]
  const uniq = [...new Set(names)]
  let out = pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, uniq.length)
  for (const name of uniq) {
    out += pair(0, 'LAYER')
      + pair(2, name)
      + pair(70, 0)
      + pair(62, 7)
      + pair(6, 'CONTINUOUS')
  }
  out += pair(0, 'ENDTAB')
  return out
}

function entityHeader(type, layer) {
  return pair(0, type) + pair(8, layer || LAYER.dibujo2d)
}

/** Punto en espacio DXF (Norte=Y, Este=X) en metros. */
function toDxfXY(pt, opts) {
  const { originGk = null, useLocalMeters = false } = opts || {}
  if (originGk && Number.isFinite(Number(pt?.este)) && Number.isFinite(Number(pt?.norte))) {
    return { x: Number(pt.este), y: Number(pt.norte), z: Number(pt.cota) || 0 }
  }
  if (originGk && Number.isFinite(Number(pt?.x)) && Number.isFinite(Number(pt?.y))) {
    // World → metros relativos + origen Gauss (Este=X, Norte=Y)
    return {
      x: Number(originGk.este0) + worldToMeters(pt.x),
      y: Number(originGk.norte0) + worldToMeters(pt.y),
      z: Number(pt.zCota ?? pt.cota) || 0,
    }
  }
  if (useLocalMeters || true) {
    return {
      x: worldToMeters(Number(pt?.x) || 0),
      y: worldToMeters(Number(pt?.y) || 0),
      z: Number(pt?.zCota ?? pt?.cota) || 0,
    }
  }
  return { x: 0, y: 0, z: 0 }
}

function writePoint(layer, x, y, z = 0) {
  return entityHeader('POINT', layer)
    + pair(10, x) + pair(20, y) + pair(30, z)
}

function writeLine(layer, a, b) {
  return entityHeader('LINE', layer)
    + pair(10, a.x) + pair(20, a.y) + pair(30, a.z || 0)
    + pair(11, b.x) + pair(21, b.y) + pair(31, b.z || 0)
}

function writeLwPolyline(layer, pts, closed = false) {
  if (!pts?.length) return ''
  let out = entityHeader('LWPOLYLINE', layer)
    + pair(90, pts.length)
    + pair(70, closed ? 1 : 0)
  for (const p of pts) {
    out += pair(10, p.x) + pair(20, p.y)
  }
  return out
}

function writeCircle(layer, c, r) {
  if (!(r > 0)) return ''
  return entityHeader('CIRCLE', layer)
    + pair(10, c.x) + pair(20, c.y) + pair(30, c.z || 0)
    + pair(40, r)
}

function writeText(layer, p, height, text) {
  const h = Math.max(0.05, Number(height) || 0.25)
  return entityHeader('TEXT', layer)
    + pair(10, p.x) + pair(20, p.y) + pair(30, p.z || 0)
    + pair(40, h)
    + pair(1, esc(text))
}

function objectToEntities(obj, opts) {
  const t = String(obj?.type || '')
  const layerItem = opts.itemLayer || null
  if (t === 'nodo') {
    const p = toDxfXY({
      x: obj.x, y: obj.y,
      este: obj.este, norte: obj.norte, cota: obj.cota,
    }, opts)
    const layer = LAYER.coordenadas
    let out = writePoint(layer, p.x, p.y, p.z)
    const label = obj.nodeNum || obj.desc || ''
    if (label) out += writeText(layer, { ...p, y: p.y + 0.3 }, 0.25, label)
    return out
  }
  if (t === 'linea' || t === 'flecha') {
    const a = toDxfXY({ x: obj.x1 ?? obj.x, y: obj.y1 ?? obj.y }, opts)
    const b = toDxfXY({ x: obj.x2 ?? obj.x, y: obj.y2 ?? obj.y }, opts)
    return writeLine(layerItem || LAYER.dibujo2d, a, b)
  }
  if (t === 'polilinea' || t === 'stroke') {
    const pts = (obj.points || obj.pts || []).map((p) => toDxfXY(p, opts))
    return writeLwPolyline(layerItem || LAYER.dibujo2d, pts, !!obj.closed)
  }
  if (t === 'rect') {
    const x = Number(obj.x) || 0
    const y = Number(obj.y) || 0
    const w = Number(obj.w) || 0
    const h = Number(obj.h) || 0
    const pts = [
      toDxfXY({ x, y }, opts),
      toDxfXY({ x: x + w, y }, opts),
      toDxfXY({ x: x + w, y: y + h }, opts),
      toDxfXY({ x, y: y + h }, opts),
    ]
    return writeLwPolyline(layerItem || LAYER.dibujo2d, pts, true)
  }
  if (t === 'elipse' || t === 'circulo') {
    const cx = Number(obj.cx ?? obj.x) || 0
    const cy = Number(obj.cy ?? obj.y) || 0
    const rx = Math.abs(Number(obj.rx ?? obj.r ?? obj.w / 2) || 0)
    const c = toDxfXY({ x: cx, y: cy }, opts)
    const rM = Math.abs(worldToMeters(rx))
    return writeCircle(layerItem || LAYER.dibujo2d, c, rM)
  }
  if (t === 'texto' || t === 'text') {
    const p = toDxfXY({ x: obj.x, y: obj.y }, opts)
    const hPx = Number(obj.fontSize || obj.h || 14)
    const hM = Math.max(0.05, hPx * 0.01)
    return writeText(LAYER.textos, p, hM, obj.text || obj.contenido || '')
  }
  if (t === 'cota') {
    const a = toDxfXY({ x: obj.x1, y: obj.y1 }, opts)
    const b = toDxfXY({ x: obj.x2, y: obj.y2 }, opts)
    let out = writeLine(LAYER.cotas, a, b)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 }
    const label = obj.label || obj.text || ''
    if (label) out += writeText(LAYER.cotas, mid, 0.2, label)
    return out
  }
  if (t === 'hatch' || t === 'achurado') {
    const pts = (obj.points || obj.pts || []).map((p) => toDxfXY(p, opts))
    return writeLwPolyline(LAYER.hatch, pts, true)
  }
  if (t === 'despieceParrilla') {
    return '' // vistas de parrilla: no CAD
  }
  return ''
}

/**
 * Sólidos 3D → polilíneas de caras (proyección planta / footprint) en capa sólidos.
 */
function solidToEntities(solid, opts) {
  const faces = Array.isArray(solid?.faces) ? solid.faces : []
  let out = ''
  const layer = opts.itemLayer || LAYER.solidos
  if (faces.length) {
    for (const face of faces) {
      const pts = (face.points || face.pts || face.vertices || [])
        .map((p) => toDxfXY({
          x: p.x, y: p.y,
          zCota: p.zCota ?? p.z,
        }, opts))
      if (pts.length >= 2) out += writeLwPolyline(layer, pts, true)
    }
    return out
  }
  // Fallback: bbox footprint
  const bb = solid?.bbox || solid?.bounds
  if (bb && Number.isFinite(bb.minX)) {
    const pts = [
      toDxfXY({ x: bb.minX, y: bb.minY }, opts),
      toDxfXY({ x: bb.maxX, y: bb.minY }, opts),
      toDxfXY({ x: bb.maxX, y: bb.maxY }, opts),
      toDxfXY({ x: bb.minX, y: bb.maxY }, opts),
    ]
    out += writeLwPolyline(layer, pts, true)
  }
  return out
}

/**
 * Origen Gauss desde filas de coordenadas (primera con N/E).
 */
export function originGkFromCoordRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  for (const r of list) {
    const n = Number(r?.norte)
    const e = Number(r?.este)
    if (Number.isFinite(n) && Number.isFinite(e)) {
      return { norte0: n, este0: e }
    }
  }
  return null
}

/**
 * @param {{
 *   objects?: object[],
 *   solids3d?: object[],
 *   coordRows?: object[],
 *   mapGeoOrigin?: object|null,
 *   itemCodigo?: string|null,
 *   title?: string,
 * }} scene
 * @returns {{ dxf: string, georeferenced: boolean, layers: string[] }}
 */
export function composeEsquemaDxf(scene = {}) {
  const objects = Array.isArray(scene.objects) ? scene.objects : []
  const solids = Array.isArray(scene.solids3d) ? scene.solids3d : []
  const coordRows = Array.isArray(scene.coordRows) ? scene.coordRows : []
  const originGk = originGkFromCoordRows(coordRows)
    || (scene.mapGeoOrigin && Number.isFinite(Number(scene.mapGeoOrigin.este0))
      ? { norte0: Number(scene.mapGeoOrigin.norte0), este0: Number(scene.mapGeoOrigin.este0) }
      : null)
  const itemLayer = scene.itemCodigo
    ? `ITEM_${slugLayer(scene.itemCodigo)}`
    : null
  const opts = { originGk, useLocalMeters: !originGk, itemLayer }

  let entities = ''
  for (const obj of objects) {
    entities += objectToEntities(obj, opts)
  }
  for (const solid of solids) {
    entities += solidToEntities(solid, opts)
  }
  // Tabla de coordenadas como puntos explícitos
  for (const r of coordRows) {
    const n = Number(r?.norte)
    const e = Number(r?.este)
    if (!Number.isFinite(n) || !Number.isFinite(e)) continue
    const p = { x: e, y: n, z: Number(r?.cota) || 0 }
    entities += writePoint(LAYER.coordenadas, p.x, p.y, p.z)
    const lab = r.num || r.desc || ''
    if (lab) entities += writeText(LAYER.coordenadas, { ...p, y: p.y + 0.35 }, 0.25, lab)
  }

  const extraLayers = itemLayer ? [itemLayer] : []
  const layers = [...Object.values(LAYER), ...extraLayers]

  const dxf = ''
    + pair(0, 'SECTION') + pair(2, 'HEADER')
    + pair(9, '$INSUNITS') + pair(70, 6) // metros
    + pair(9, '$MEASUREMENT') + pair(70, 1)
    + pair(0, 'ENDSEC')
    + pair(0, 'SECTION') + pair(2, 'TABLES')
    + layerTable(extraLayers)
    + pair(0, 'ENDSEC')
    + pair(0, 'SECTION') + pair(2, 'ENTITIES')
    + entities
    + pair(0, 'ENDSEC')
    + pair(0, 'EOF')

  return {
    dxf,
    georeferenced: !!originGk,
    layers,
    title: String(scene.title || 'esquema'),
  }
}

function slugLayer(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 30)
    .toUpperCase() || 'ITEM'
}

/** Data URI text/plain del DXF. */
export function esquemaDxfToDataUri(dxfText) {
  const s = String(dxfText || '')
  if (!s) return null
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64')
  return `data:application/dxf;base64,${b64}`
}
