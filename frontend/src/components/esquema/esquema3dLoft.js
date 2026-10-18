/**
 * Solevado 3D: tronco / pirámide / cono / sólido de transición entre contornos.
 * Volumen analítico (formMeta + volumeLocked); celdas Z para booleanos.
 * No es importado por esquema3dSolids (solo datos loftDraw en el sólido).
 */
import { closedEntityToContour } from './esquema3dSolids.js'
import { closedEntityAreaM2, metersToWorld, polygonAreaM2 } from './esquemaGeometry.js'

const LOFT_BANDS = 12
const APEX_EPS_M = 1e-4

function uid() {
  return `s3d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function round2(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  const cleaned = Math.round(x * 1e6) / 1e6
  return Math.round(cleaned * 100) / 100
}

function lockVol(solid, volumeM3) {
  const v = Number(volumeM3)
  solid.volumeM3 = Number.isFinite(v) ? v : 0
  solid.volumeLocked = true
  return solid
}

function parseCota(v) {
  const n = Number(String(v ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Altura |cotaTapa − cotaBase|; z0 = min, z1 = max. */
export function loftCotasRange(cotaBase, cotaTapa) {
  const zb = parseCota(cotaBase)
  const zt = parseCota(cotaTapa)
  if (zb == null || zt == null) {
    return { ok: false, error: 'Indique cotas numéricas para base y tapa (o vértice).' }
  }
  if (Math.abs(zt - zb) < 1e-9) {
    return { ok: false, error: 'Las cotas de base y tapa deben ser distintas.' }
  }
  const h = Math.abs(zt - zb)
  return {
    ok: true,
    cotaBase: zb,
    cotaTapa: zt,
    heightM: h,
    z0: Math.min(zb, zt),
    z1: Math.max(zb, zt),
    baseIsLower: zb < zt,
  }
}

export function frustumPyramidVolumeM3(area1, area2, heightM) {
  const A1 = Math.max(0, Number(area1) || 0)
  const A2 = Math.max(0, Number(area2) || 0)
  const h = Math.max(0, Number(heightM) || 0)
  return (h / 3) * (A1 + A2 + Math.sqrt(A1 * A2))
}

export function frustumConeVolumeM3(R, r, heightM) {
  const RR = Math.max(0, Number(R) || 0)
  const rr = Math.max(0, Number(r) || 0)
  const h = Math.max(0, Number(heightM) || 0)
  return Math.PI * (h / 3) * (RR * RR + RR * rr + rr * rr)
}

export function pyramidVolumeM3(area, heightM) {
  return (Math.max(0, Number(area) || 0) * Math.max(0, Number(heightM) || 0)) / 3
}

export function coneVolumeM3(r, heightM) {
  const rr = Math.max(0, Number(r) || 0)
  return (Math.PI * rr * rr * Math.max(0, Number(heightM) || 0)) / 3
}

/** Prismoidal / Simpson: V = h/6 × (A1 + 4·Am + A2). */
export function transitionVolumeM3(area1, areaMid, area2, heightM) {
  const A1 = Math.max(0, Number(area1) || 0)
  const Am = Math.max(0, Number(areaMid) || 0)
  const A2 = Math.max(0, Number(area2) || 0)
  const h = Math.max(0, Number(heightM) || 0)
  return (h / 6) * (A1 + 4 * Am + A2)
}

function ringCentroid(ring) {
  const pts = ring || []
  if (!pts.length) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

function ringPerimeter(ring) {
  const pts = ring || []
  if (pts.length < 2) return 0
  let len = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    len += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return len
}

/** Remuestrea un anillo a n vértices por longitud de arco (sentido CCW). */
export function resampleRing(ring, n = 32) {
  const src = (ring || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (src.length < 3 || n < 3) return src.map((p) => ({ x: p.x, y: p.y }))
  let pts = src
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6) {
    pts = pts.slice(0, -1)
  }
  let area2 = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area2 += a.x * b.y - b.x * a.y
  }
  if (area2 < 0) pts = [...pts].reverse()

  const segLens = []
  let total = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    segLens.push(L)
    total += L
  }
  if (!(total > 0)) return pts.map((p) => ({ x: p.x, y: p.y }))

  const out = []
  for (let k = 0; k < n; k += 1) {
    let d = (k / n) * total
    let i = 0
    while (i < segLens.length - 1 && d > segLens[i]) {
      d -= segLens[i]
      i += 1
    }
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const L = segLens[i] || 1
    const t = Math.min(1, Math.max(0, d / L))
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/** Alinea rotacionalmente ringB sobre ringA (mismo n). */
export function alignRings(ringA, ringB) {
  const a = ringA || []
  const b = ringB || []
  if (a.length !== b.length || a.length < 3) return b.map((p) => ({ ...p }))
  let best = 0
  let bestCost = Infinity
  for (let shift = 0; shift < b.length; shift += 1) {
    let cost = 0
    for (let i = 0; i < a.length; i += 1) {
      const p = b[(i + shift) % b.length]
      cost += (p.x - a[i].x) ** 2 + (p.y - a[i].y) ** 2
    }
    if (cost < bestCost) {
      bestCost = cost
      best = shift
    }
  }
  const out = []
  for (let i = 0; i < b.length; i += 1) {
    out.push({ ...b[(i + best) % b.length] })
  }
  return out
}

export function lerpRing(ringA, ringB, t) {
  const a = ringA || []
  const b = ringB || []
  const n = Math.min(a.length, b.length)
  const out = []
  for (let i = 0; i < n; i += 1) {
    out.push({
      x: a[i].x + (b[i].x - a[i].x) * t,
      y: a[i].y + (b[i].y - a[i].y) * t,
    })
  }
  return out
}

function contourAreaM2(contour) {
  if (!contour) return 0
  if (contour.analytic?.type === 'rect') {
    return Math.abs(contour.analytic.wM) * Math.abs(contour.analytic.hM)
  }
  if (contour.analytic?.type === 'ellipse') {
    return Math.PI * Math.abs(contour.analytic.rxM) * Math.abs(contour.analytic.ryM)
  }
  if (contour.analytic?.type === 'triangle') {
    return 0.5 * Math.abs(contour.analytic.baseM) * Math.abs(contour.analytic.heightM)
  }
  return Math.max(0, polygonAreaM2(contour.ring || []))
}

function isCircle(analytic) {
  if (analytic?.type !== 'ellipse') return false
  return Math.abs(Math.abs(analytic.rxM) - Math.abs(analytic.ryM)) < 1e-9
}

function isSimilarContours(c1, c2) {
  if (!c1 || !c2) return false
  if (c1.analytic?.type === 'rect' && c2.analytic?.type === 'rect') {
    const r1 = Math.abs(c1.analytic.wM) / Math.max(1e-12, Math.abs(c1.analytic.hM))
    const r2 = Math.abs(c2.analytic.wM) / Math.max(1e-12, Math.abs(c2.analytic.hM))
    return Math.abs(r1 - r2) / Math.max(r1, r2, 1e-9) < 0.02
  }
  if (isCircle(c1.analytic) && isCircle(c2.analytic)) return true
  if (c1.analytic?.type === 'ellipse' && c2.analytic?.type === 'ellipse') {
    const r1 = Math.abs(c1.analytic.rxM) / Math.max(1e-12, Math.abs(c1.analytic.ryM))
    const r2 = Math.abs(c2.analytic.rxM) / Math.max(1e-12, Math.abs(c2.analytic.ryM))
    return Math.abs(r1 - r2) / Math.max(r1, r2, 1e-9) < 0.02
  }
  const n1 = (c1.ring || []).length
  const n2 = (c2.ring || []).length
  if (n1 >= 3 && n1 === n2 && !c1.analytic && !c2.analytic) {
    const A1 = contourAreaM2(c1)
    const A2 = contourAreaM2(c2)
    if (!(A1 > 0) || !(A2 > 0)) return false
    const s = Math.sqrt(A2 / A1)
    const p1 = ringPerimeter(c1.ring)
    const p2 = ringPerimeter(c2.ring)
    return Math.abs(p2 - p1 * s) / Math.max(p2, 1e-9) < 0.05
  }
  return false
}

function classifyLoft(base, top, apex = false) {
  if (apex) {
    if (isCircle(base.analytic)) return 'cone'
    return 'pyramid'
  }
  if (isCircle(base.analytic) && isCircle(top.analytic)) return 'cone_frustum'
  if (isSimilarContours(base, top)) return 'pyramid_frustum'
  return 'transition'
}

function dimsLabelRect(analytic) {
  if (analytic?.type === 'rect') {
    return `${fmt(analytic.wM)} × ${fmt(analytic.hM)} m`
  }
  return null
}

function dimsLabelCircle(analytic) {
  if (isCircle(analytic)) {
    return `Ø ${fmt(Math.abs(analytic.rxM) * 2)} m`
  }
  if (analytic?.type === 'ellipse') {
    return `rx ${fmt(analytic.rxM)} · ry ${fmt(analytic.ryM)} m`
  }
  return null
}

function fmt(n, d = 2) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(d).replace('.', ',')
}

function buildLoftCells(ringBase, ringTop, z0, z1, bands = LOFT_BANDS) {
  const cells = []
  for (let i = 0; i < bands; i += 1) {
    const t0 = i / bands
    const t1 = (i + 1) / bands
    const zA = z0 + (z1 - z0) * t0
    const zB = z0 + (z1 - z0) * t1
    const mid = (t0 + t1) / 2
    const ring = lerpRing(ringBase, ringTop, mid)
    const area = Math.abs(polygonAreaM2(ring))
    if (area < APEX_EPS_M * APEX_EPS_M && mid > 0.92) {
      const c = ringCentroid(ringTop)
      const eps = metersToWorld(APEX_EPS_M)
      cells.push({
        ring: [
          { x: c.x - eps, y: c.y - eps },
          { x: c.x + eps, y: c.y - eps },
          { x: c.x + eps, y: c.y + eps },
          { x: c.x - eps, y: c.y + eps },
        ],
        holes: [],
        z0: Math.min(zA, zB),
        z1: Math.max(zA, zB),
        analytic: null,
      })
      continue
    }
    cells.push({
      ring,
      holes: [],
      z0: Math.min(zA, zB),
      z1: Math.max(zA, zB),
      analytic: null,
    })
  }
  return cells
}

function sampleCountFor(contour) {
  if (contour?.analytic?.type === 'ellipse') return 32
  if (contour?.analytic?.type === 'rect') return 4
  const n = (contour?.ring || []).length
  return Math.max(8, Math.min(48, n || 16))
}

function asContour(ent) {
  if (!ent) return null
  if (ent.ring) return ent
  return closedEntityToContour(ent)
}

/**
 * Soleva dos contornos cerrados (entidades o contornos ya resueltos).
 */
export function loftBetweenContours(baseEnt, topEnt, {
  cotaBase,
  cotaTapa,
  color,
  id,
  baseEntityId = null,
  topEntityId = null,
} = {}) {
  const base = asContour(baseEnt)
  const top = asContour(topEnt)
  if (!base?.ring?.length || !top?.ring?.length) {
    return { ok: false, error: 'Seleccione dos contornos cerrados.' }
  }
  const cotas = loftCotasRange(cotaBase, cotaTapa)
  if (!cotas.ok) return cotas

  const n = Math.max(sampleCountFor(base), sampleCountFor(top))
  const ringBase = resampleRing(base.ring, n)
  const ringTop = alignRings(ringBase, resampleRing(top.ring, n))

  const baseAtZ0 = cotas.baseIsLower
  const ringAtZ0 = baseAtZ0 ? ringBase : ringTop
  const ringAtZ1 = baseAtZ0 ? ringTop : ringBase

  const kind = classifyLoft(base, top, false)
  const A1 = contourAreaM2(base)
  const A2 = contourAreaM2(top)
  const h = cotas.heightM
  const midRing = lerpRing(ringBase, ringTop, 0.5)
  const Am = Math.max(0, polygonAreaM2(midRing))

  let volumeM3 = 0
  let formMeta = {
    kind,
    heightM: h,
    areaBaseM2: A1,
    areaTopM2: A2,
    cotaBase: cotas.cotaBase,
    cotaTapa: cotas.cotaTapa,
  }

  if (kind === 'cone_frustum') {
    const R = Math.abs(base.analytic.rxM)
    const r = Math.abs(top.analytic.rxM)
    volumeM3 = frustumConeVolumeM3(R, r, h)
    formMeta = {
      ...formMeta,
      kind: 'cone_frustum',
      RM: R,
      rM: r,
      diameterBaseM: R * 2,
      diameterTopM: r * 2,
    }
  } else if (kind === 'pyramid_frustum') {
    volumeM3 = frustumPyramidVolumeM3(A1, A2, h)
    formMeta = {
      ...formMeta,
      kind: 'pyramid_frustum',
      baseLabel: dimsLabelRect(base.analytic) || dimsLabelCircle(base.analytic) || `A ${fmt(A1)} m²`,
      topLabel: dimsLabelRect(top.analytic) || dimsLabelCircle(top.analytic) || `A ${fmt(A2)} m²`,
    }
  } else {
    volumeM3 = transitionVolumeM3(A1, Am, A2, h)
    formMeta = {
      ...formMeta,
      kind: 'transition',
      areaMidM2: Am,
      baseLabel: dimsLabelRect(base.analytic) || dimsLabelCircle(base.analytic) || `A₁ ${fmt(A1)} m²`,
      topLabel: dimsLabelRect(top.analytic) || dimsLabelCircle(top.analytic) || `A₂ ${fmt(A2)} m²`,
    }
  }

  const cells = buildLoftCells(ringAtZ0, ringAtZ1, cotas.z0, cotas.z1)
  const solid = {
    type: 'solid3d',
    id: id || uid(),
    color: color || undefined,
    extrudeAxis: 'z',
    viewPlane: 'top',
    sourceEntityId: baseEntityId || baseEnt?.id || null,
    sourceEntityIds: [baseEntityId, topEntityId].filter(Boolean),
    loftParams: {
      cotaBase: cotas.cotaBase,
      cotaTapa: cotas.cotaTapa,
      kind,
    },
    formMeta,
    loftDraw: {
      ringBase: ringAtZ0,
      ringTop: ringAtZ1,
      z0: cotas.z0,
      z1: cotas.z1,
      curved: kind === 'cone_frustum',
    },
    cells,
  }
  lockVol(solid, volumeM3)
  return { ok: true, solid, kind, volumeM3: round2(volumeM3) }
}

/**
 * Pirámide o cono: contorno base + punto vértice (world xy) + cotas.
 */
export function loftPyramidOrCone(baseEnt, apexWorld, {
  cotaBase,
  cotaVertice,
  color,
  id,
  baseEntityId = null,
} = {}) {
  const base = asContour(baseEnt)
  if (!base?.ring?.length) {
    return { ok: false, error: 'Seleccione un contorno cerrado para la base.' }
  }
  const ax = Number(apexWorld?.x)
  const ay = Number(apexWorld?.y)
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
    return { ok: false, error: 'Indique el punto del vértice.' }
  }
  const cotas = loftCotasRange(cotaBase, cotaVertice)
  if (!cotas.ok) return cotas

  const kind = classifyLoft(base, null, true)
  const A = contourAreaM2(base)
  const h = cotas.heightM
  let volumeM3 = 0
  let formMeta = {
    kind,
    heightM: h,
    areaBaseM2: A,
    cotaBase: cotas.cotaBase,
    cotaTapa: cotas.cotaTapa,
    apex: { x: ax, y: ay },
  }

  if (kind === 'cone') {
    const r = Math.abs(base.analytic.rxM)
    volumeM3 = coneVolumeM3(r, h)
    formMeta = { ...formMeta, kind: 'cone', rM: r, diameterM: r * 2 }
  } else {
    volumeM3 = pyramidVolumeM3(A, h)
    formMeta = {
      ...formMeta,
      kind: 'pyramid',
      baseLabel: dimsLabelRect(base.analytic) || dimsLabelCircle(base.analytic) || `A ${fmt(A)} m²`,
    }
  }

  const n = sampleCountFor(base)
  const ringBase = resampleRing(base.ring, n)
  const ringApex = ringBase.map(() => ({ x: ax, y: ay }))
  const baseAtZ0 = cotas.baseIsLower
  const ringAtZ0 = baseAtZ0 ? ringBase : ringApex
  const ringAtZ1 = baseAtZ0 ? ringApex : ringBase

  const cells = buildLoftCells(ringAtZ0, ringAtZ1, cotas.z0, cotas.z1)
  const solid = {
    type: 'solid3d',
    id: id || uid(),
    color: color || undefined,
    extrudeAxis: 'z',
    viewPlane: 'top',
    sourceEntityId: baseEntityId || baseEnt?.id || null,
    loftParams: {
      cotaBase: cotas.cotaBase,
      cotaTapa: cotas.cotaTapa,
      kind,
      apex: { x: ax, y: ay },
    },
    formMeta,
    loftDraw: {
      ringBase: ringAtZ0,
      ringTop: ringAtZ1,
      z0: cotas.z0,
      z1: cotas.z1,
      curved: kind === 'cone',
    },
    cells,
  }
  lockVol(solid, volumeM3)
  return { ok: true, solid, kind, volumeM3: round2(volumeM3) }
}

/** Punto world desde entidad nodo u otra con x/y. */
export function apexPointFromEntity(obj) {
  if (!obj) return null
  if (obj.type === 'nodo' && Number.isFinite(obj.x) && Number.isFinite(obj.y)) {
    return { x: obj.x, y: obj.y }
  }
  if (obj.type === 'elipse') {
    const c = closedEntityToContour(obj)
    if (!c) return null
    return ringCentroid(c.ring)
  }
  return null
}

export function isApexEntity(obj) {
  return !!apexPointFromEntity(obj)
}

/**
 * Fila del panel Solevar: forma, dimensiones y área del contorno (o vértice).
 */
export function describeContourForSolevar(obj) {
  if (!obj) {
    return { id: null, forma: '—', dimensiones: '—', areaM2: null, areaLabel: '—', isApex: false }
  }
  if (obj.type === 'nodo') {
    return {
      id: obj.id,
      forma: 'Vértice',
      dimensiones: obj.nodeNum != null ? `Nodo ${obj.nodeNum}` : 'Punto',
      areaM2: null,
      areaLabel: '—',
      isApex: true,
    }
  }
  const c = closedEntityToContour(obj)
  if (!c?.ring?.length) {
    return { id: obj.id, forma: '—', dimensiones: '—', areaM2: null, areaLabel: '—', isApex: false }
  }
  let forma = 'Polígono'
  let dimensiones = '—'
  if (c.analytic?.type === 'rect') {
    forma = 'Rectángulo'
    dimensiones = `${fmt(c.analytic.wM)} × ${fmt(c.analytic.hM)} m`
  } else if (c.analytic?.type === 'ellipse') {
    const circ = Math.abs(Math.abs(c.analytic.rxM) - Math.abs(c.analytic.ryM)) < 1e-9
    forma = circ ? 'Círculo' : 'Elipse'
    dimensiones = circ
      ? `Ø ${fmt(Math.abs(c.analytic.rxM) * 2)} m`
      : `rx ${fmt(c.analytic.rxM)} · ry ${fmt(c.analytic.ryM)} m`
  } else if (c.analytic?.type === 'triangle') {
    forma = 'Triángulo'
    dimensiones = `base ${fmt(c.analytic.baseM)} · h ${fmt(c.analytic.heightM)} m`
  }
  const area = closedEntityAreaM2(obj)
  const areaM2 = Number.isFinite(area) ? area : contourAreaM2(c)
  return {
    id: obj.id,
    forma,
    dimensiones,
    areaM2,
    areaLabel: Number.isFinite(areaM2) ? fmt(areaM2) : '—',
    isApex: false,
  }
}
