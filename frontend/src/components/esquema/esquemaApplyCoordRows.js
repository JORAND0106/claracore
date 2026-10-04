/**
 * Lógica de «Dibujar nodos» según tipo de dibujo del reporte (nodo | linea | poligono)
 * y resolución de nodos para «Unir por número» contra lienzo + tabla de coordenadas.
 */
import { PX_PER_METER } from './esquemaGeometry.js'
import { gkBogotaToWgs84, wgs84ToGkBogota } from '../../utils/epsg3116.js'
import {
  construirAnilloCorredorSentidoEje,
  construirLineaSentidoEje,
  reconstruirEjesDesdePlano,
} from '../../modules/sicoe-obra/sicoeEjeFranjas.js'

/**
 * Convierte una cara densificada (lng/lat) a mundo, fijando extremos en los
 * nodos levantados. El remate geométrico ya ocurrió en WGS84 (haversine);
 * aquí NO se vuelve a rematar en coords de mapa (escala distinta a PX_PER_METER
 * y deformaba curvas / creaba picos).
 */
function curvedEdgeToWorldPts(curved, a, b, opts = {}) {
  if (!curved?.points?.length) return null
  const origin = opts.origin
  const worldPts = curved.points.map((p, idx) => {
    if (idx === 0) {
      return {
        x: Number(a.x),
        y: Number(a.y),
        lng: p?.lng,
        lat: p?.lat,
        este: a.este,
        norte: a.norte,
      }
    }
    if (idx === curved.points.length - 1) {
      return {
        x: Number(b.x),
        y: Number(b.y),
        lng: p?.lng,
        lat: p?.lat,
        este: b.este,
        norte: b.norte,
      }
    }
    if (typeof opts.lngLatToWorld === 'function') {
      const w = opts.lngLatToWorld(p.lng, p.lat)
      if (w) return { x: w.x, y: w.y, lng: p.lng, lat: p.lat }
    }
    const gk = wgs84ToGkBogota(p.lng, p.lat)
    if (!gk) return null
    const tw = topoToWorld(gk.este, gk.norte, origin)
    return { ...tw, lng: p.lng, lat: p.lat, este: gk.este, norte: gk.norte }
  }).filter(Boolean)

  if (worldPts.length < 2) return null

  // Solo fijar extremos exactos (sin remate en mundo / mapa).
  worldPts[0] = {
    ...worldPts[0],
    x: Number(a.x),
    y: Number(a.y),
    este: a.este,
    norte: a.norte,
  }
  worldPts[worldPts.length - 1] = {
    ...worldPts[worldPts.length - 1],
    x: Number(b.x),
    y: Number(b.y),
    este: b.este,
    norte: b.norte,
  }
  return worldPts
}


function nearestNodeToPoint(pt, nodes, epsPx) {
  if (!pt || !nodes?.length) return null
  let best = null
  let bestD = Infinity
  for (const n of nodes) {
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
    const d = Math.hypot(Number(pt.x) - Number(n.x), Number(pt.y) - Number(n.y))
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return bestD <= epsPx ? best : null
}

/** Esquinas del anillo densificado que coinciden con nodos (orden del anillo). */
function extractCornerNodesFromRing(points, nodes, epsPx) {
  const pts = Array.isArray(points) ? points : []
  const corners = []
  const seen = new Set()
  for (const p of pts) {
    const n = nearestNodeToPoint(p, nodes, epsPx)
    if (!n) continue
    const key = String(n.id || n.nodeNum)
    if (seen.has(key)) continue
    seen.add(key)
    corners.push(n)
  }
  return corners
}

function coordOriginFromRows(rows) {
  const first = (rows || []).find((r) => Number.isFinite(r?.norte) && Number.isFinite(r?.este))
  if (!first) return { este0: 0, norte0: 0 }
  return { este0: Number(first.este) || 0, norte0: Number(first.norte) || 0 }
}

/** Este → X; Norte → Y hacia arriba (se invierte el eje Y del lienzo). */
function topoToWorld(este, norte, origin, pxPerMeter = PX_PER_METER) {
  const o = origin || { este0: 0, norte0: 0 }
  return {
    x: ((este ?? 0) - (o.este0 || 0)) * pxPerMeter,
    y: -((norte ?? 0) - (o.norte0 || 0)) * pxPerMeter,
  }
}

/**
 * @param {Array<{norte?:any,este?:any,cota?:any,desc?:any,num?:any}>} rows
 * @returns {{ num: string, norte: number, este: number, cota: number|null, desc: string }[]}
 */
export function parseCoordRowsForCanvas(rows) {
  const list = (rows || []).filter((r) => r && (r.norte !== '' || r.este !== ''))
  return list.map((r, i) => ({
    num: String(i + 1),
    norte: Number(r.norte),
    este: Number(r.este),
    cota: r.cota === '' || r.cota == null ? null : Number(r.cota),
    desc: String(r.desc || ''),
  })).filter((r) => Number.isFinite(r.norte) && Number.isFinite(r.este))
}

/**
 * @param {ReturnType<typeof parseCoordRowsForCanvas>} parsed
 * @param {{ color?: string, uid?: () => string }} opts
 */
export function buildNodosFromParsedCoords(parsed, opts = {}) {
  const origin = coordOriginFromRows(parsed)
  const uid = typeof opts.uid === 'function' ? opts.uid : (() => `n${Math.random().toString(36).slice(2, 9)}`)
  const color = opts.color || '#0f172a'
  const nodes = (parsed || []).map((r) => {
    const pt = topoToWorld(r.este, r.norte, origin)
    return {
      id: uid(),
      type: 'nodo',
      x: pt.x,
      y: pt.y,
      nodeNum: r.num,
      norte: r.norte,
      este: r.este,
      cota: r.cota,
      desc: r.desc,
      color,
    }
  })
  return { origin, nodes }
}

/**
 * Líneas que unen nodos en orden (1→2→…→n).
 * @param {object[]} nodes
 * @param {{ color?: string, width?: number, lineStyle?: string, uid?: () => string }} [opts]
 */
export function buildLineasUniendoNodos(nodes, opts = {}) {
  const list = Array.isArray(nodes) ? nodes.filter((n) => n && n.type === 'nodo') : []
  if (list.length < 2) return []
  const uid = typeof opts.uid === 'function' ? opts.uid : (() => `l${Math.random().toString(36).slice(2, 9)}`)
  const lines = []
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1]
    const b = list[i]
    lines.push({
      id: uid(),
      type: 'linea',
      joinSeq: true,
      fromCoordTable: true,
      sentidoEje: false,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: opts.color || a.color || '#0f172a',
      width: opts.width || 3,
      lineStyle: opts.lineStyle || 'continua',
      rotation: 0,
    })
  }
  return lines
}

function nodoToLngLat(node, opts = {}) {
  if (!node) return null
  // Preferir Gauss del levantado (estable vs eje). world→lnglat solo si no hay GK.
  if (Number.isFinite(node.este) && Number.isFinite(node.norte)) {
    const ll = gkBogotaToWgs84(node.este, node.norte)
    if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) return ll
  }
  if (typeof opts.worldToLngLat === 'function' && Number.isFinite(node.x) && Number.isFinite(node.y)) {
    const ll = opts.worldToLngLat(node.x, node.y)
    if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) return ll
  }
  return null
}

/**
 * Polilíneas que siguen el eje entre nodos consecutivos (paralelas con transición de offset).
 * Si no hay eje usable para un tramo, cae a segmento recto.
 *
 * @param {object[]} nodes
 * @param {object|null} planoFc FeatureCollection del abscisado (plano)
 * @param {{ color?: string, width?: number, lineStyle?: string, uid?: () => string, origin?: {este0:number,norte0:number}, ejes?: object[], stepM?: number }} [opts]
 * @returns {{ objects: object[], usedEje: boolean, failedSegments: number }}
 */
export function buildLineasSentidoEje(nodes, planoFc, opts = {}) {
  const list = Array.isArray(nodes) ? nodes.filter((n) => n && n.type === 'nodo') : []
  const uid = typeof opts.uid === 'function' ? opts.uid : (() => `le${Math.random().toString(36).slice(2, 9)}`)
  const origin = opts.origin || coordOriginFromRows(list.map((n) => ({ norte: n.norte, este: n.este })))
  const ejes = Array.isArray(opts.ejes) && opts.ejes.length
    ? opts.ejes
    : reconstruirEjesDesdePlano(planoFc)
  const out = []
  let usedEje = false
  let failedSegments = 0

  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1]
    const b = list[i]
    const llA = nodoToLngLat(a, opts)
    const llB = nodoToLngLat(b, opts)
    let curved = null
    if (llA && llB && ejes.length) {
      curved = construirLineaSentidoEje({
        ejes,
        inicio: llA,
        fin: llB,
        stepM: opts.stepM || 2,
      })
    }
    const along = !!(curved?.points && curved.points.length > 2)
    if (along) {
      const worldPts = curvedEdgeToWorldPts(curved, a, b, {
        origin,
        lngLatToWorld: opts.lngLatToWorld,
        stepM: opts.stepM || 2,
        capM: opts.capM,
        maxJumpM: opts.maxJumpM,
      })
      if (worldPts && worldPts.length >= 3) {
        usedEje = true
        out.push({
          id: uid(),
          type: 'polilinea',
          closed: false,
          joinSeq: false,
          fromCoordTable: true,
          sentidoEje: true,
          points: worldPts,
          color: opts.color || a.color || '#0f172a',
          width: opts.width || 3,
          lineStyle: opts.lineStyle || 'continua',
          rotation: 0,
          absIni: curved.absIni,
          absFin: curved.absFin,
          cornerNodeNums: [a.nodeNum, b.nodeNum].filter((n) => n != null),
        })
        continue
      }
    }
    if (!(curved?.points && curved.points.length >= 2)) failedSegments += 1
    out.push({
      id: uid(),
      type: 'linea',
      joinSeq: true,
      fromCoordTable: true,
      sentidoEje: false,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: opts.color || a.color || '#0f172a',
      width: opts.width || 3,
      lineStyle: opts.lineStyle || 'continua',
      rotation: 0,
    })
  }
  return { objects: out, usedEje, failedSegments }
}

/**
 * Busca un nodo en el lienzo por número; si no está, en la tabla de coordenadas.
 * @returns {{ kind: 'canvas', node: object } | { kind: 'table', row: object } | { kind: 'missing', num: string }}
 */
export function resolveNodoPorNumero(num, objects, coordRows) {
  const key = String(num ?? '').trim()
  if (!key) return { kind: 'missing', num: '' }
  const onCanvas = (objects || []).find(
    (o) => o && o.type === 'nodo' && String(o.nodeNum) === key,
  )
  if (onCanvas) return { kind: 'canvas', node: onCanvas }

  const rows = Array.isArray(coordRows) ? coordRows : []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    if (!r) continue
    const displayNum = String(i + 1)
    const own = String(r.num ?? '').trim()
    if (displayNum === key || own === key) {
      return { kind: 'table', row: { ...r, num: displayNum } }
    }
  }
  return { kind: 'missing', num: key }
}

export function mensajeNodoInexistente(num) {
  const n = String(num ?? '').trim()
  if (!n) return 'Indique un número de nodo.'
  return `No existe el nodo «${n}» en la tabla de coordenadas ni en el dibujo.`
}

/**
 * Qué debe hacer el botón «Dibujar nodos» según el tipo de dibujo del reporte.
 * @param {'nodo'|'linea'|'poligono'|string} tipo
 */
export function accionDibujarNodosPorTipo(tipo) {
  const t = String(tipo || 'nodo').toLowerCase()
  if (t === 'linea') return { unirEnOrden: true, abrirUnirPorNumero: false, preguntarSentidoEje: true }
  if (t === 'poligono') return { unirEnOrden: false, abrirUnirPorNumero: true, preguntarSentidoEje: true }
  return { unirEnOrden: false, abrirUnirPorNumero: false, preguntarSentidoEje: false }
}

/**
 * Densifica un anillo de nodos en sentido del eje.
 *
 * Regla fija (orden de unión):
 * - Caras longitudinales → siguen el eje
 * - Tapas transversales → unión recta entre levantados (sin densificar)
 *
 * @param {object[]} nodes nodos en orden de unión (sin repetir el cierre)
 * @param {object|null} planoFc
 * @param {{ origin?: {este0:number,norte0:number}, ejes?: object[], stepM?: number }} [opts]
 * @returns {{ points: Array<{x:number,y:number}>, usedEje: boolean, failedEdges: number, edgeKinds: string[] }}
 */
export function densifyPolygonRingSentidoEje(nodes, planoFc, opts = {}) {
  const list = Array.isArray(nodes)
    ? nodes.filter((n) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
    : []
  if (list.length < 3) {
    return {
      points: list.map((n) => ({ x: Number(n.x), y: Number(n.y) })),
      usedEje: false,
      failedEdges: 0,
      edgeKinds: [],
    }
  }
  const origin = opts.origin || coordOriginFromRows(list.map((n) => ({ norte: n.norte, este: n.este })))
  const ejes = Array.isArray(opts.ejes) && opts.ejes.length
    ? opts.ejes
    : reconstruirEjesDesdePlano(planoFc)

  if (!ejes.length) {
    return {
      points: list.map((n) => ({ x: Number(n.x), y: Number(n.y) })),
      usedEje: false,
      failedEdges: list.length,
      edgeKinds: list.map(() => 'crossing'),
    }
  }

  const corners = []
  const byKey = new Map()
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i]
    const key = n.nodeNum != null ? String(n.nodeNum) : `i${i}`
    const ll = nodoToLngLat(n, opts)
    if (!ll) {
      return {
        points: list.map((node) => ({ x: Number(node.x), y: Number(node.y) })),
        usedEje: false,
        failedEdges: 1,
        edgeKinds: list.map(() => 'crossing'),
      }
    }
    corners.push({ lng: ll.lng, lat: ll.lat, key })
    byKey.set(key, n)
  }

  const corridor = construirAnilloCorredorSentidoEje({
    ejes,
    corners,
    stepM: opts.stepM || 2,
  })

  if (!corridor?.points?.length) {
    // Sin caras longitudinales detectables: anillo recto (no inventar densify).
    return {
      points: list.map((n) => ({ x: Number(n.x), y: Number(n.y) })),
      usedEje: false,
      failedEdges: 0,
      edgeKinds: list.map(() => 'crossing'),
    }
  }

  const ring = []
  for (const p of corridor.points) {
    if (p.corner && p.key != null && byKey.has(String(p.key))) {
      const n = byKey.get(String(p.key))
      ring.push({
        x: Number(n.x),
        y: Number(n.y),
        lng: p.lng,
        lat: p.lat,
        este: n.este,
        norte: n.norte,
      })
      continue
    }
    if (typeof opts.lngLatToWorld === 'function') {
      const w = opts.lngLatToWorld(p.lng, p.lat)
      if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) {
        ring.push({ x: w.x, y: w.y, lng: p.lng, lat: p.lat })
        continue
      }
    }
    const gk = wgs84ToGkBogota(p.lng, p.lat)
    if (!gk) {
      return {
        points: list.map((n) => ({ x: Number(n.x), y: Number(n.y) })),
        usedEje: false,
        failedEdges: 1,
        edgeKinds: list.map(() => 'crossing'),
      }
    }
    const tw = topoToWorld(gk.este, gk.norte, origin)
    ring.push({ ...tw, lng: p.lng, lat: p.lat, este: gk.este, norte: gk.norte })
  }

  const usedEje = (corridor.edgeKinds || []).includes('along')
  return {
    points: ring,
    usedEje,
    failedEdges: 0,
    edgeKinds: Array.isArray(corridor.edgeKinds) ? corridor.edgeKinds : ['along', 'crossing'],
  }
}

/**
 * Reconstruye polilíneas `sentidoEje` ya guardadas a partir de los nodos de la escena,
 * aplicando la densificación saneada (elimina picos/cruces de dibujos antiguos).
 *
 * @param {object[]} objects
 * @param {object|null} planoFc
 * @param {{ origin?: object, ejes?: object[], stepM?: number, lngLatToWorld?: Function, snapPx?: number }} [opts]
 * @returns {{ objects: object[], changed: boolean, failedEdges: number }}
 */
export function redensifySentidoEjeObjects(objects, planoFc, opts = {}) {
  const list = Array.isArray(objects) ? objects : []
  const nodes = list.filter((o) => o && o.type === 'nodo')
  if (!nodes.length) return { objects: list, changed: false, failedEdges: 0 }
  const snapPx = Math.max(6, Number(opts.snapPx) || 14)
  let changed = false
  let failedEdges = 0

  const next = list.map((obj) => {
    if (!obj || obj.sentidoEje !== true || obj.type !== 'polilinea') return obj
    const pts = Array.isArray(obj.points) ? obj.points : []
    if (pts.length < 2) return obj

    if (obj.closed) {
      let corners = []
      if (Array.isArray(obj.cornerNodeNums) && obj.cornerNodeNums.length >= 3) {
        for (const num of obj.cornerNodeNums) {
          const n = nodes.find((o) => String(o.nodeNum) === String(num))
          if (n) corners.push(n)
        }
      }
      if (corners.length < 3) {
        corners = extractCornerNodesFromRing(pts, nodes, snapPx)
      }
      if (corners.length < 3) return obj
      const densified = densifyPolygonRingSentidoEje(corners, planoFc, opts)
      failedEdges += Number(densified.failedEdges) || 0
      changed = true
      return {
        ...obj,
        points: densified.points,
        sentidoEje: !!densified.usedEje,
        cornerNodeNums: corners.map((n) => n.nodeNum).filter((n) => n != null),
      }
    }

    // Tramo abierto: extremos = nodos consecutivos
    const a = nearestNodeToPoint(pts[0], nodes, snapPx)
    const b = nearestNodeToPoint(pts[pts.length - 1], nodes, snapPx)
    if (!a || !b) return obj
    const built = buildLineasSentidoEje([a, b], planoFc, {
      ...opts,
      color: obj.color,
      width: obj.width,
      lineStyle: obj.lineStyle,
      uid: () => obj.id,
    })
    const repl = built.objects?.[0]
    if (!repl) return obj
    failedEdges += Number(built.failedSegments) || 0
    changed = true
    if (repl.type === 'polilinea') {
      return {
        ...obj,
        ...repl,
        id: obj.id,
        sentidoEje: true,
      }
    }
    // Cayó a recta
    return {
      ...obj,
      type: 'polilinea',
      closed: false,
      sentidoEje: false,
      points: [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ],
    }
  })

  return { objects: next, changed, failedEdges }
}
