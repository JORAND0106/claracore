/**
 * Exportación DXF ASCII AutoCAD 2013 (AC1027) del dibujo editable del esquema.
 * Unidades: metros. Capas por tipo. Coords MAGNA-SIRGAS si hay tabla/mapa;
 * si no, coordenadas locales del lienzo convertidas a metros.
 * Sólidos 3D → 3DFACE (superficies de caras). Textos con \U+XXXX.
 */
import { worldToMeters } from './esquemaGeometry.js'
import { validateEsquemaDxf } from './esquemaDxfValidate.js'

const LAYER = {
  dibujo2d: 'ESQUEMA_2D',
  solidos: 'ESQUEMA_SOLIDOS',
  cotas: 'ESQUEMA_COTAS',
  textos: 'ESQUEMA_TEXTOS',
  coordenadas: 'ESQUEMA_COORDS',
  acero: 'ESQUEMA_ACERO',
  hatch: 'ESQUEMA_HATCH',
}

/** Número finito seguro para AutoCAD (evita NaN/Infinity → crash). */
export function dxfNum(v, fallback = 0) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  // Evitar notación científica extrema
  const r = Math.round(n * 1e8) / 1e8
  return Object.is(r, -0) ? 0 : r
}

/**
 * Texto DXF con escapes Unicode AutoCAD (\U+XXXX) para tildes, ñ, Ø, ², ³, π, etc.
 */
export function dxfEncodeText(s) {
  const raw = String(s ?? '').replace(/[\r\n]+/g, ' ')
  let out = ''
  for (const ch of raw) {
    const c = ch.codePointAt(0)
    if (c == null) continue
    if (c >= 32 && c < 127 && ch !== '\\') {
      out += ch
      continue
    }
    if (c <= 0xFFFF) {
      out += `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      const u = c - 0x10000
      const hi = 0xD800 + (u >> 10)
      const lo = 0xDC00 + (u & 0x3FF)
      out += `\\U+${hi.toString(16).toUpperCase().padStart(4, '0')}`
      out += `\\U+${lo.toString(16).toUpperCase().padStart(4, '0')}`
    }
    if (out.length > 240) break
  }
  return out.slice(0, 250)
}

function pair(code, value) {
  return `${code}\n${value}\n`
}

function ltypeTable() {
  return pair(0, 'TABLE')
    + pair(2, 'LTYPE')
    + pair(70, 1)
    + pair(0, 'LTYPE')
    + pair(2, 'CONTINUOUS')
    + pair(70, 0)
    + pair(3, 'Solid line')
    + pair(72, 65)
    + pair(73, 0)
    + pair(40, 0.0)
    + pair(0, 'ENDTAB')
}

function styleTable() {
  return pair(0, 'TABLE')
    + pair(2, 'STYLE')
    + pair(70, 1)
    + pair(0, 'STYLE')
    + pair(2, 'STANDARD')
    + pair(70, 0)
    + pair(40, 0.0)
    + pair(41, 1.0)
    + pair(50, 0.0)
    + pair(71, 0)
    + pair(42, 2.5)
    + pair(3, 'txt')
    + pair(4, '')
    + pair(0, 'ENDTAB')
}

function appidTable() {
  return pair(0, 'TABLE')
    + pair(2, 'APPID')
    + pair(70, 1)
    + pair(0, 'APPID')
    + pair(2, 'ACAD')
    + pair(70, 0)
    + pair(0, 'ENDTAB')
}

function blockRecordTable() {
  return pair(0, 'TABLE')
    + pair(2, 'BLOCK_RECORD')
    + pair(70, 2)
    + pair(0, 'BLOCK_RECORD')
    + pair(2, '*MODEL_SPACE')
    + pair(0, 'BLOCK_RECORD')
    + pair(2, '*PAPER_SPACE')
    + pair(0, 'ENDTAB')
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

function blocksSection() {
  let out = pair(0, 'SECTION') + pair(2, 'BLOCKS')
  for (const name of ['*MODEL_SPACE', '*PAPER_SPACE']) {
    out += pair(0, 'BLOCK')
      + pair(8, '0')
      + pair(2, name)
      + pair(70, 0)
      + pair(10, 0) + pair(20, 0) + pair(30, 0)
      + pair(3, name)
      + pair(1, '')
      + pair(0, 'ENDBLK')
  }
  out += pair(0, 'ENDSEC')
  return out
}

function entityHeader(type, layer) {
  return pair(0, type) + pair(8, layer || LAYER.dibujo2d)
}

/** Punto en espacio DXF (Norte=Y, Este=X) en metros. */
function toDxfXY(pt, opts) {
  const { originGk = null } = opts || {}
  if (originGk && Number.isFinite(Number(pt?.este)) && Number.isFinite(Number(pt?.norte))) {
    return {
      x: dxfNum(pt.este),
      y: dxfNum(pt.norte),
      z: dxfNum(pt.cota ?? pt.zCota ?? pt.z),
    }
  }
  if (originGk && Number.isFinite(Number(pt?.x)) && Number.isFinite(Number(pt?.y))) {
    return {
      x: dxfNum(Number(originGk.este0) + worldToMeters(pt.x)),
      y: dxfNum(Number(originGk.norte0) + worldToMeters(pt.y)),
      z: dxfNum(pt.zCota ?? pt.cota ?? pt.z),
    }
  }
  return {
    x: dxfNum(worldToMeters(Number(pt?.x) || 0)),
    y: dxfNum(worldToMeters(Number(pt?.y) || 0)),
    z: dxfNum(pt?.zCota ?? pt?.cota ?? pt?.z),
  }
}

function writePoint(layer, x, y, z = 0) {
  return entityHeader('POINT', layer)
    + pair(10, dxfNum(x)) + pair(20, dxfNum(y)) + pair(30, dxfNum(z))
}

function writeLine(layer, a, b) {
  return entityHeader('LINE', layer)
    + pair(10, dxfNum(a.x)) + pair(20, dxfNum(a.y)) + pair(30, dxfNum(a.z))
    + pair(11, dxfNum(b.x)) + pair(21, dxfNum(b.y)) + pair(31, dxfNum(b.z))
}

function writeLwPolyline(layer, pts, closed = false) {
  const clean = (pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (clean.length < 2) return ''
  let out = entityHeader('LWPOLYLINE', layer)
    + pair(90, clean.length)
    + pair(70, closed ? 1 : 0)
  for (const p of clean) {
    out += pair(10, dxfNum(p.x)) + pair(20, dxfNum(p.y))
  }
  return out
}

function writeCircle(layer, c, r) {
  const rad = dxfNum(r)
  if (!(rad > 0)) return ''
  return entityHeader('CIRCLE', layer)
    + pair(10, dxfNum(c.x)) + pair(20, dxfNum(c.y)) + pair(30, dxfNum(c.z))
    + pair(40, rad)
}

function writeText(layer, p, height, text) {
  const h = Math.max(0.05, dxfNum(height, 0.25))
  return entityHeader('TEXT', layer)
    + pair(10, dxfNum(p.x)) + pair(20, dxfNum(p.y)) + pair(30, dxfNum(p.z))
    + pair(40, h)
    + pair(1, dxfEncodeText(text))
    + pair(7, 'STANDARD')
}

/** 3DFACE con 3 o 4 vértices (triángulo duplica el 3.º). */
function write3dFace(layer, a, b, c, d = null) {
  const p4 = d || c
  return entityHeader('3DFACE', layer)
    + pair(10, dxfNum(a.x)) + pair(20, dxfNum(a.y)) + pair(30, dxfNum(a.z))
    + pair(11, dxfNum(b.x)) + pair(21, dxfNum(b.y)) + pair(31, dxfNum(b.z))
    + pair(12, dxfNum(c.x)) + pair(22, dxfNum(c.y)) + pair(32, dxfNum(c.z))
    + pair(13, dxfNum(p4.x)) + pair(23, dxfNum(p4.y)) + pair(33, dxfNum(p4.z))
}

function fanFacesFromRing(ringPts, layer) {
  if (!ringPts || ringPts.length < 3) return ''
  let out = ''
  const a = ringPts[0]
  for (let i = 1; i < ringPts.length - 1; i += 1) {
    out += write3dFace(layer, a, ringPts[i], ringPts[i + 1])
  }
  return out
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
    return ''
  }
  return ''
}

/**
 * Sólidos 3D → 3DFACE (superficies). Prefer faces; si no, cells (anillo × z0/z1);
 * fallback bbox.
 */
function solidToEntities(solid, opts) {
  const layer = opts.itemLayer || LAYER.solidos
  let out = ''
  const faces = Array.isArray(solid?.faces) ? solid.faces : []
  if (faces.length) {
    for (const face of faces) {
      const pts = (face.points || face.pts || face.vertices || [])
        .map((p) => toDxfXY({
          x: p.x, y: p.y,
          zCota: p.zCota ?? p.z,
        }, opts))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      if (pts.length >= 3) out += fanFacesFromRing(pts, layer)
    }
    if (out) return out
  }

  const cells = Array.isArray(solid?.cells) ? solid.cells : []
  for (const cell of cells) {
    const ring = Array.isArray(cell?.ring) ? cell.ring : []
    if (ring.length < 3) continue
    const z0 = dxfNum(cell.z0)
    const z1 = dxfNum(cell.z1, z0)
    const bottom = ring.map((p) => {
      const q = toDxfXY(p, opts)
      return { x: q.x, y: q.y, z: z0 }
    })
    const top = ring.map((p) => {
      const q = toDxfXY(p, opts)
      return { x: q.x, y: q.y, z: z1 }
    })
    out += fanFacesFromRing(bottom, layer)
    out += fanFacesFromRing(top, layer)
    for (let i = 0; i < ring.length; i += 1) {
      const j = (i + 1) % ring.length
      out += write3dFace(layer, bottom[i], bottom[j], top[j], top[i])
    }
  }
  if (out) return out

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
 * @returns {{ dxf: string, georeferenced: boolean, layers: string[], validation: object }}
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

  let dxf = ''
    + pair(0, 'SECTION') + pair(2, 'HEADER')
    + pair(9, '$ACADVER') + pair(1, 'AC1027')
    + pair(9, '$DWGCODEPAGE') + pair(3, 'ANSI_1252')
    + pair(9, '$INSUNITS') + pair(70, 6) // metros
    + pair(9, '$MEASUREMENT') + pair(70, 1)
    + pair(0, 'ENDSEC')
    + pair(0, 'SECTION') + pair(2, 'TABLES')
    + ltypeTable()
    + layerTable(extraLayers)
    + styleTable()
    + appidTable()
    + blockRecordTable()
    + pair(0, 'ENDSEC')
    + blocksSection()
    + pair(0, 'SECTION') + pair(2, 'ENTITIES')
    + entities
    + pair(0, 'ENDSEC')
    + pair(0, 'EOF')

  let validation = validateEsquemaDxf(dxf)
  if (!validation.ok) {
    // Reintento: eliminar entidades problemáticas no aplica; asegurar pares y EOF.
    if (!/\n0\nEOF\s*$/i.test(dxf.trimEnd())) {
      dxf = `${dxf.trimEnd()}\n0\nEOF\n`
    }
    dxf = dxf.replace(/\bNaN\b/gi, '0').replace(/\bInfinity\b/gi, '0')
    validation = validateEsquemaDxf(dxf)
  }

  return {
    dxf,
    georeferenced: !!originGk,
    layers,
    title: String(scene.title || 'esquema'),
    validation,
    acadver: 'AC1027',
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
