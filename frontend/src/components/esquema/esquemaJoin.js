/**
 * Une líneas que se cruzan o se tocan en una polilínea continua.
 * Las que no intersectan ninguna otra se dejan intactas.
 */
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
  return {
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
  const lines = list.filter((o) => o && o.type === 'linea' && (!useSel || pick.has(o.id)))
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

  for (let i = 0; i < lines.length; i += 1) {
    const A = endsOf(lines[i])
    for (let j = i + 1; j < lines.length; j += 1) {
      const B = endsOf(lines[j])
      const p = segmentIntersection(A.a, A.b, B.a, B.b)
      if (!p) continue
      unite(i, j)
      bump(i, p)
      bump(j, p)
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
      pieces.push(...splitLine(lines[i], hits.get(i) || []))
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
          x1: pts[0].x,
          y1: pts[0].y,
          x2: pts[1].x,
          y2: pts[1].y,
        })
      } else {
        created.push({
          ...proto,
          id: nid,
          type: 'polilinea',
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
