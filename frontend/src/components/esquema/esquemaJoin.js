import { objectWorldSegments } from './esquemaGeometry.js'
import { densifyPolygonRingSentidoEje } from './esquemaApplyCoordRows.js'

/**
 * Une líneas / polilíneas que se cruzan o se tocan en una polilínea continua.
 * Usa la geometría vigente (post-rotación). Las que no intersectan se dejan.
 */

const JOINABLE = new Set(['linea', 'polilinea'])
const EPS = 0.75

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y }
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x
}

function keyOf(p) {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`
}

export function segmentIntersection(a1, a2, b1, b2) {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const den = cross(r, s)
  const qp = sub(b1, a1)
  if (Math.abs(den) < 1e-9) {
    const onSeg = (p, u, v) => {
      const d = Math.hypot(v.x - u.x, v.y - u.y)
      if (d < 1e-9) return Math.hypot(p.x - u.x, p.y - u.y) <= EPS
      const t = ((p.x - u.x) * (v.x - u.x) + (p.y - u.y) * (v.y - u.y)) / (d * d)
      if (t < -0.01 || t > 1.01) return false
      const foot = { x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t }
      return Math.hypot(p.x - foot.x, p.y - foot.y) <= EPS
    }
    if (onSeg(a1, b1, b2)) return { ...a1 }
    if (onSeg(a2, b1, b2)) return { ...a2 }
    if (onSeg(b1, a1, a2)) return { ...b1 }
    if (onSeg(b2, a1, a2)) return { ...b2 }
    return null
  }
  const t = cross(qp, s) / den
  const u = cross(qp, r) / den
  if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) return null
  return { x: a1.x + r.x * t, y: a1.y + r.y * t }
}

function endsOf(line) {
  const segs = objectWorldSegments(line)
  if (segs.length === 1) return segs[0]
  if (line.type === 'polilinea' && (line.points || []).length) {
    const segsW = objectWorldSegments(line)
    if (!segsW.length) return { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }
    return { a: segsW[0].a, b: segsW[segsW.length - 1].b }
  }
  return segs[0] || {
    a: { x: line.x1 || 0, y: line.y1 || 0 },
    b: { x: line.x2 || 0, y: line.y2 || 0 },
  }
}

function walkChains(pieces) {
  const adj = new Map()
  const unused = new Set()
  pieces.forEach((edge, i) => {
    unused.add(i)
    const ka = keyOf(edge.a)
    const kb = keyOf(edge.b)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka).push({ i, to: kb, pt: edge.b })
    adj.get(kb).push({ i, to: ka, pt: edge.a })
  })

  const angle = (from, via, to) => {
    const a = Math.atan2(via.y - from.y, via.x - from.x)
    const b = Math.atan2(to.y - via.y, to.x - via.x)
    let d = Math.abs(a - b) % (Math.PI * 2)
    if (d > Math.PI) d = (Math.PI * 2) - d
    return d
  }

  const pickNext = (fromKey, fromPt, viaKey, viaPt) => {
    const opts = (adj.get(viaKey) || []).filter((e) => unused.has(e.i))
    if (!opts.length) return null
    if (fromKey == null) return opts[0]
    let best = opts[0]
    let bestA = Infinity
    for (const e of opts) {
      const a = angle(fromPt, viaPt, e.pt)
      if (a < bestA) {
        bestA = a
        best = e
      }
    }
    return best
  }

  const chains = []
  const startKeys = [...adj.entries()]
    .filter(([, list]) => list.length === 1)
    .map(([k]) => k)
  const seeds = startKeys.length ? startKeys : [...adj.keys()]

  for (const seed of seeds) {
    while (true) {
      const first = (adj.get(seed) || []).find((e) => unused.has(e.i))
      if (!first) break
      unused.delete(first.i)
      const pts = [pieces[first.i].a, pieces[first.i].b]
      if (keyOf(pts[0]) !== seed) pts.reverse()
      let fromKey = seed
      let fromPt = pts[0]
      let viaKey = keyOf(pts[1])
      let viaPt = pts[1]
      while (true) {
        const nxt = pickNext(fromKey, fromPt, viaKey, viaPt)
        if (!nxt) break
        unused.delete(nxt.i)
        pts.push(nxt.pt)
        fromKey = viaKey
        fromPt = viaPt
        viaKey = nxt.to
        viaPt = nxt.pt
      }
      if (pts.length >= 2) chains.push(pts)
    }
  }

  if (unused.size) {
    for (const i of unused) {
      chains.push([pieces[i].a, pieces[i].b])
    }
  }
  return chains
}

function splitLine(line, cuts) {
  const { a, b } = endsOf(line)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const ts = [0, 1]
  for (const p of cuts) {
    if (len2 < 1e-9) continue
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    if (t > 0.02 && t < 0.98) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const uniq = []
  for (const t of ts) {
    if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-4) uniq.push(t)
  }
  const pieces = []
  for (let i = 0; i < uniq.length - 1; i += 1) {
    const t0 = uniq[i]
    const t1 = uniq[i + 1]
    pieces.push({
      a: { x: a.x + dx * t0, y: a.y + dy * t0 },
      b: { x: a.x + dx * t1, y: a.y + dy * t1 },
    })
  }
  return pieces
}

/**
 * @returns {{ objects: array, joined: number, left: number }}
 */
export function joinIntersectingLines(objects, selectedIds = null) {
  const list = objects || []
  const pick = new Set(selectedIds || [])
  const useSel = pick.size > 0
  const lines = list.filter((o) => o && JOINABLE.has(o.type) && (!useSel || pick.has(o.id)))
  if (lines.length < 2) {
    return { objects: list, joined: 0, left: lines.length }
  }

  const parent = lines.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const unite = (i, j) => {
    const a = find(i)
    const b = find(j)
    if (a !== b) parent[a] = b
  }
  const hits = new Map()
  const bump = (i, p) => {
    if (!hits.has(i)) hits.set(i, [])
    hits.get(i).push(p)
  }
  const worldSegs = lines.map((o) => objectWorldSegments(o))

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      for (const A of worldSegs[i]) {
        for (const B of worldSegs[j]) {
          const p = segmentIntersection(A.a, A.b, B.a, B.b)
          if (!p) continue
          unite(i, j)
          bump(i, p)
          bump(j, p)
        }
      }
    }
  }

  const groups = new Map()
  lines.forEach((_, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  })

  const consume = new Set()
  const created = []
  let joined = 0
  for (const idxs of groups.values()) {
    if (idxs.length < 2 || !idxs.some((i) => (hits.get(i) || []).length)) {
      continue
    }
    const pieces = []
    for (const i of idxs) {
      consume.add(lines[i].id)
      const cuts = hits.get(i) || []
      for (const seg of worldSegs[i]) {
        pieces.push(...splitLine({
          x1: seg.a.x,
          y1: seg.a.y,
          x2: seg.b.x,
          y2: seg.b.y,
        }, cuts))
      }
    }
    const chains = walkChains(pieces)
    const proto = lines[idxs[0]]
    for (const pts of chains) {
      if (pts.length < 2) continue
      joined += 1
      const nid = `jn${Date.now().toString(36)}${created.length}${Math.random().toString(36).slice(2, 6)}`
      if (pts.length === 2) {
        created.push({
          ...proto,
          id: nid,
          type: 'linea',
          rotation: 0,
          x1: pts[0].x,
          y1: pts[0].y,
          x2: pts[1].x,
          y2: pts[1].y,
          points: undefined,
        })
      } else {
        created.push({
          ...proto,
          id: nid,
          type: 'polilinea',
          rotation: 0,
          points: pts,
          x1: undefined,
          y1: undefined,
          x2: undefined,
          y2: undefined,
        })
      }
    }
  }

  if (!consume.size) {
    return { objects: list, joined: 0, left: lines.length }
  }
  const next = list.filter((o) => !consume.has(o.id)).concat(created)
  return { objects: next, joined, left: lines.length - consume.size }
}

/** Fija los tramos de unión por número. No agrega el cierre último→primero. */
export function finalizeJoinSequence(objects) {
  return (objects || []).map((o) => (o?.joinSeq ? { ...o, joinSeq: false } : o))
}

/**
 * Convierte la secuencia de nodos en una polilínea cerrada (polígono).
 * Elimina los tramos temporales `joinSeq` y cierra contra el primer nodo
 * sin exigir que el usuario lo repita al final.
 *
 * Con `opts.sentidoEje === true`, densifica las caras a lo largo del eje
 * (misma lógica que la línea en sentido del eje); las transversales quedan rectas.
 *
 * @param {object[]} objects
 * @param {Array<string|number>} nodeNums secuencia (orden de unión)
 * @param {{
 *   color?: string,
 *   width?: number,
 *   lineStyle?: string,
 *   uid?: () => string,
 *   sentidoEje?: boolean,
 *   planoFc?: object|null,
 *   ejes?: object[],
 *   origin?: {este0:number,norte0:number},
 *   stepM?: number,
 * }} [opts]
 * @returns {object[]|{ objects: object[], usedEje: boolean, failedEdges: number }}
 */
export function materializeJoinAsClosedPolygon(objects, nodeNums, opts = {}) {
  const list = Array.isArray(objects) ? [...objects] : []
  const nums = (nodeNums || []).map((n) => String(n))
  const nodes = []
  for (const key of nums) {
    const node = list.find((o) => o?.type === 'nodo' && String(o.nodeNum) === key)
    if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      // Evitar repetir el mismo nodo consecutivo
      const prev = nodes[nodes.length - 1]
      if (prev && String(prev.nodeNum) === key) continue
      nodes.push(node)
    }
  }
  // Si el usuario cerró repitiendo el primero al final, quitar el duplicado final
  if (
    nodes.length >= 2
    && String(nodes[0].nodeNum) === String(nodes[nodes.length - 1].nodeNum)
  ) {
    nodes.pop()
  }
  const withoutJoin = list.filter((o) => !o?.joinSeq)
  if (nodes.length < 3) {
    return finalizeJoinSequence(list)
  }
  const uid = typeof opts.uid === 'function'
    ? opts.uid
    : () => `jp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  let points = nodes.map((n) => ({ x: Number(n.x), y: Number(n.y) }))
  let usedEje = false
  let failedEdges = 0
  let sentidoEje = false
  if (opts.sentidoEje === true) {
    const densified = densifyPolygonRingSentidoEje(nodes, opts.planoFc ?? null, {
      origin: opts.origin,
      ejes: opts.ejes,
      stepM: opts.stepM,
      lngLatToWorld: opts.lngLatToWorld,
    })
    if (Array.isArray(densified.points) && densified.points.length >= 3) {
      points = densified.points
      usedEje = !!densified.usedEje
      failedEdges = Number(densified.failedEdges) || 0
      sentidoEje = usedEje
    }
  }

  const poly = {
    id: uid(),
    type: 'polilinea',
    closed: true,
    joinSeq: false,
    fromJoinSequence: true,
    sentidoEje,
    points,
    color: opts.color || nodes[0].color || '#0f172a',
    width: opts.width || 3,
    lineStyle: opts.lineStyle || 'continua',
    rotation: 0,
  }
  const next = [...withoutJoin, poly]
  if (opts.returnMeta) {
    return { objects: next, usedEje, failedEdges, sentidoEje }
  }
  return next
}

/**
 * Vista previa / trazo en curso de la secuencia como polilínea (cerrada si ≥ 3).
 * @returns {object|null}
 */
export function buildJoinPolygonDraft(nodes, opts = {}) {
  const list = (nodes || []).filter((n) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
  if (list.length < 2) return null
  const uid = typeof opts.uid === 'function'
    ? opts.uid
    : () => `jd${Date.now().toString(36)}`
  return {
    id: uid(),
    type: 'polilinea',
    joinSeq: true,
    closed: list.length >= 3,
    points: list.map((n) => ({ x: Number(n.x), y: Number(n.y) })),
    color: opts.color || '#0f172a',
    width: opts.width || 3,
    lineStyle: opts.lineStyle || 'continua',
    rotation: 0,
  }
}

