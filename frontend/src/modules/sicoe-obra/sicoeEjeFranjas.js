/**
 * Eje desde abscisado + franjas lineales (SicoeObra).
 * Misma semántica que backend/sicoe_eje_franjas.py.
 *
 * - Reconstruye el eje uniendo nodos de abscisa del plano.
 * - Proyecta coordenadas sobre el eje → abscisa real, distancia, lado.
 * - Genera huella Polygon (franja) precisa o aproximada.
 */
import { sicoeAbscisaAMetros, sicoeIndiceAbscisasDesdePlano } from './sicoeLocalizacionHelpers.js'

export const SICOE_TOLERANCIA_UBICACION_DEFAULT_M = 1.0
export const SICOE_TOLERANCIA_UBICACION_MIN_M = 0.1
/** Más allá de esto, la coordenada no se considera sobre el eje. */
export const SICOE_EJE_MAX_DIST_PROYECCION_M = 30
/** Ancho mínimo visual de franja (m) si el registro no trae ancho. */
export const SICOE_FRANJA_ANCHO_DEFAULT_M = 0.6
/** Offset por defecto al dibujar aproximado según costado (m). */
export const SICOE_FRANJA_OFFSET_COSTADO_M = 2.0

export const SICOE_AUDITORIA_JUSTIFICACIONES_UBICACION = [
  'Coordenada de referencia del PK, no del elemento',
  'Abscisado del plano desactualizado',
  'Elemento en curva compleja',
  'Error de digitación corregido en campo',
]

export const SICOE_AUDITORIA_JUSTIFICACIONES_COSTADO = [
  'Costado reportado según calzada de cobro',
  'Eje del plano no coincide con el eje de obra',
  'Elemento central / sobre el eje',
  'Error de digitación corregido en campo',
]

const EARTH_R = 6371000

function txt(v) {
  return String(v || '').trim()
}

export function normalizarToleranciaUbicacionM(raw) {
  if (raw == null || raw === '') return SICOE_TOLERANCIA_UBICACION_DEFAULT_M
  const v = Number(raw)
  if (!Number.isFinite(v)) return SICOE_TOLERANCIA_UBICACION_DEFAULT_M
  return Math.max(SICOE_TOLERANCIA_UBICACION_MIN_M, v)
}

export function haversineM(a, b) {
  const lat1 = (Number(a.lat) * Math.PI) / 180
  const lat2 = (Number(b.lat) * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLng = ((Number(b.lng) - Number(a.lng)) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Bearing inicial en grados (0 = norte). */
export function bearingDeg(a, b) {
  const lat1 = (Number(a.lat) * Math.PI) / 180
  const lat2 = (Number(b.lat) * Math.PI) / 180
  const dLng = ((Number(b.lng) - Number(a.lng)) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Destino a `distM` metros con rumbo `bearing` grados. */
export function destinationPoint(lng, lat, bearing, distM) {
  const br = (Number(bearing) * Math.PI) / 180
  const ang = Number(distM) / EARTH_R
  const lat1 = (Number(lat) * Math.PI) / 180
  const lng1 = (Number(lng) * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lng: (lng2 * 180) / Math.PI, lat: (lat2 * 180) / Math.PI }
}

/**
 * Lado relativo del punto respecto al segmento a→b.
 * Positivo cross = izquierda (sentido de avance), negativo = derecha.
 */
export function ladoRelativo(a, b, p) {
  const ax = Number(b.lng) - Number(a.lng)
  const ay = Number(b.lat) - Number(a.lat)
  const bx = Number(p.lng) - Number(a.lng)
  const by = Number(p.lat) - Number(a.lat)
  // Aprox local en grados; suficiente para signo
  const cross = ax * by - ay * bx
  if (Math.abs(cross) < 1e-14) return 'central'
  return cross > 0 ? 'izquierda' : 'derecha'
}

export function normalizarCostadoDigitado(raw) {
  const s = txt(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (!s) return ''
  if (s.startsWith('izq') || s === 'i' || s.includes('left')) return 'izquierda'
  if (s.startsWith('der') || s === 'd' || s.includes('right')) return 'derecha'
  if (s.startsWith('cent') || s.startsWith('unic') || s === 'c' || s.includes('eje')) return 'central'
  return s
}

export function costadosCoinciden(digitado, real) {
  const a = normalizarCostadoDigitado(digitado)
  const b = normalizarCostadoDigitado(real)
  if (!a || !b) return true
  if (a === 'central' || b === 'central') return true
  return a === b
}

/**
 * Reconstruye uno o más ejes a partir del índice de abscisas.
 * Parte el listado cuando el salto geográfico es desproporcionado respecto a Δm.
 */
export function reconstruirEjesDesdeIndice(indice, { maxFactor = 4, minGapM = 35 } = {}) {
  const pts = Array.isArray(indice) ? indice : []
  if (pts.length < 2) return []
  const ejes = []
  let cur = [pts[0]]
  for (let i = 1; i < pts.length; i += 1) {
    const prev = cur[cur.length - 1]
    const p = pts[i]
    const dm = Math.abs(Number(p.m) - Number(prev.m))
    const dist = haversineM(prev, p)
    const limite = Math.max(minGapM, dm * maxFactor)
    if (dm > 15 && dist > limite) {
      if (cur.length >= 2) ejes.push({ id: ejes.length, puntos: cur })
      cur = [p]
    } else {
      cur.push(p)
    }
  }
  if (cur.length >= 2) ejes.push({ id: ejes.length, puntos: cur })
  return ejes
}

export function reconstruirEjesDesdePlano(planoFc, opts) {
  return reconstruirEjesDesdeIndice(sicoeIndiceAbscisasDesdePlano(planoFc), opts)
}

function closestOnSegment(a, b, p) {
  const ax = Number(a.lng)
  const ay = Number(a.lat)
  const bx = Number(b.lng)
  const by = Number(b.lat)
  const px = Number(p.lng)
  const py = Number(p.lat)
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0
  t = Math.max(0, Math.min(1, t))
  const lng = ax + t * abx
  const lat = ay + t * aby
  const proj = { lng, lat }
  const dist = haversineM(p, proj)
  const m = Number(a.m) + t * (Number(b.m) - Number(a.m))
  const lado = ladoRelativo(a, b, p)
  return { lng, lat, m, dist_m: dist, lado, t }
}

/**
 * Proyecta un punto WGS84 sobre el eje más cercano.
 * @returns {null|{ abs_m, dist_m, lado, lng, lat, eje_id, sobre_eje }}
 */
export function proyectarSobreEje(ejes, lng, lat, { maxDistM = SICOE_EJE_MAX_DIST_PROYECCION_M } = {}) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const p = { lng, lat }
  let best = null
  for (const eje of ejes || []) {
    const pts = eje.puntos || []
    for (let i = 0; i < pts.length - 1; i += 1) {
      const cand = closestOnSegment(pts[i], pts[i + 1], p)
      if (!best || cand.dist_m < best.dist_m) {
        best = { ...cand, eje_id: eje.id }
      }
    }
  }
  if (!best) return null
  return {
    abs_m: best.m,
    dist_m: best.dist_m,
    lado: best.lado,
    lng: best.lng,
    lat: best.lat,
    eje_id: best.eje_id,
    sobre_eje: best.dist_m <= maxDistM,
  }
}

function interpAbsEnEje(eje, metros) {
  const pts = eje?.puntos || []
  if (pts.length < 2 || metros == null || !Number.isFinite(metros)) return null
  if (metros <= pts[0].m) return { lng: pts[0].lng, lat: pts[0].lat, bearing: bearingDeg(pts[0], pts[1]) }
  const last = pts[pts.length - 1]
  if (metros >= last.m) {
    return {
      lng: last.lng,
      lat: last.lat,
      bearing: bearingDeg(pts[pts.length - 2], last),
    }
  }
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].m <= metros) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const t = a.m === b.m ? 0 : (metros - a.m) / (b.m - a.m)
  return {
    lng: a.lng + t * (b.lng - a.lng),
    lat: a.lat + t * (b.lat - a.lat),
    bearing: bearingDeg(a, b),
  }
}

function sampleAbsRange(eje, abs0, abs1, stepM = 5) {
  const lo = Math.min(abs0, abs1)
  const hi = Math.max(abs0, abs1)
  const out = []
  const step = Math.max(1, Number(stepM) || 5)
  for (let m = lo; m <= hi + 1e-9; m += step) {
    const p = interpAbsEnEje(eje, Math.min(m, hi))
    if (p) out.push({ m: Math.min(m, hi), ...p })
  }
  const end = interpAbsEnEje(eje, hi)
  if (end && (!out.length || Math.abs(out[out.length - 1].m - hi) > 1e-6)) {
    out.push({ m: hi, ...end })
  }
  return out
}

function offsetBearingForLado(bearing, lado) {
  const l = normalizarCostadoDigitado(lado) || 'central'
  if (l === 'central') return bearing
  // izquierda = bearing - 90; derecha = bearing + 90 (sentido de avance)
  if (l === 'izquierda') return (bearing + 270) % 360
  return (bearing + 90) % 360
}

/**
 * Distancia con signo al eje: + izquierda, − derecha (sentido de avance).
 */
export function distConSignoSobreEje(proy) {
  if (!proy || !Number.isFinite(proy.dist_m)) return 0
  const lado = normalizarCostadoDigitado(proy.lado) || 'central'
  if (lado === 'izquierda') return Number(proy.dist_m)
  if (lado === 'derecha') return -Number(proy.dist_m)
  return 0
}

function ejeAbsRange(eje) {
  const pts = eje?.puntos || []
  if (pts.length < 2) return null
  return { min: Number(pts[0].m), max: Number(pts[pts.length - 1].m) }
}

/**
 * True si el pie de proyección cae en un extremo del eje y el punto queda
 * más allá del abscisado (continuación del tangente), no solo al costado.
 */
export function proyeccionMasAllaDelEje(eje, proy, lng, lat, { epsAbsM = 0.75, minAlongM = 1.0 } = {}) {
  const pts = eje?.puntos || []
  if (pts.length < 2 || !proy || !Number.isFinite(lng) || !Number.isFinite(lat)) return false
  const range = ejeAbsRange(eje)
  if (!range) return false
  const abs = Number(proy.abs_m)
  const atStart = Math.abs(abs - range.min) <= epsAbsM
  const atEnd = Math.abs(abs - range.max) <= epsAbsM
  if (!atStart && !atEnd) return false
  const endPt = atStart ? pts[0] : pts[pts.length - 1]
  // Rumbo hacia afuera del eje (pasado el extremo).
  const brOut = atStart
    ? (bearingDeg(pts[0], pts[1]) + 180) % 360
    : bearingDeg(pts[pts.length - 2], pts[pts.length - 1])
  const p = { lng, lat }
  const dist = haversineM(endPt, p)
  if (!(dist > minAlongM)) return false
  const brTo = bearingDeg(endPt, p)
  let dBr = Math.abs(brTo - brOut)
  if (dBr > 180) dBr = 360 - dBr
  const along = dist * Math.cos((dBr * Math.PI) / 180)
  return along > minAlongM
}

function segmentsIntersectProper(a, b, c, d) {
  const cross = (p, q, r) => {
    const x1 = Number(q.lng) - Number(p.lng)
    const y1 = Number(q.lat) - Number(p.lat)
    const x2 = Number(r.lng) - Number(p.lng)
    const y2 = Number(r.lat) - Number(p.lat)
    return x1 * y2 - y1 * x2
  }
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

/** Autocruces de una polilínea abierta (no cuenta vértices compartidos). */
export function polylineSelfIntersects(points) {
  const pts = Array.isArray(points) ? points : []
  if (pts.length < 4) return false
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let j = i + 2; j < pts.length - 1; j += 1) {
      if (i === 0 && j === pts.length - 2) continue
      if (segmentsIntersectProper(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true
    }
  }
  return false
}

function pathLengthM(points) {
  let s = 0
  for (let i = 1; i < (points || []).length; i += 1) {
    s += haversineM(points[i - 1], points[i])
  }
  return s
}

/**
 * Valida que la densificación no genere picos, ganchos ni bucles.
 * Si falla, el caller debe caer a segmento recto.
 */
export function pathSentidoEjeEsValido(points, {
  chordM = 0,
  absSpan = 0,
  distIni = 0,
  distFin = 0,
} = {}) {
  const pts = Array.isArray(points) ? points : []
  if (pts.length < 2) return false
  if (pts.length === 2) return true

  const pathM = pathLengthM(pts)
  const lateral = Math.abs(Number(distIni) - Number(distFin))
  const maxOff = Math.max(Math.abs(Number(distIni)), Math.abs(Number(distFin)))
  const budget = Math.max(Number(absSpan) || 0, Number(chordM) || 0)
    + lateral
    + maxOff * 0.25
    + 8
  if (pathM > budget * 1.4) return false
  // Extremos cercanos con trayectoria larga ⇒ pico (p. ej. nodos al final del abscisado).
  if ((Number(chordM) || 0) < 25 && pathM > (Number(chordM) || 0) * 2.4 + 4) return false

  let maxJump = 0
  for (let i = 1; i < pts.length; i += 1) {
    maxJump = Math.max(maxJump, haversineM(pts[i - 1], pts[i]))
  }
  const maxJumpOk = Math.max(12, (Number(absSpan) || 0) * 0.4, (Number(chordM) || 0) * 0.5)
  if (maxJump > maxJumpOk) return false

  if (polylineSelfIntersects(pts)) return false

  // Picos / ganchos: vértice interior muy lejos de la cuerda respecto al offset esperado,
  // con giro casi de vuelta (no confundir con esquinas reales del eje).
  const a = pts[0]
  const b = pts[pts.length - 1]
  const maxOffExpected = Math.max(Math.abs(Number(distIni)), Math.abs(Number(distFin))) + 4
  const chordBudget = Math.max(Number(chordM) || 0, Number(absSpan) || 0)
  for (let i = 1; i < pts.length - 1; i += 1) {
    const leg0 = haversineM(pts[i - 1], pts[i])
    const leg1 = haversineM(pts[i], pts[i + 1])
    if (leg0 < 2 || leg1 < 2) continue
    const b0 = bearingDeg(pts[i - 1], pts[i])
    const b1 = bearingDeg(pts[i], pts[i + 1])
    let turn = Math.abs(b1 - b0)
    if (turn > 180) turn = 360 - turn
    // Distancia a la cuerda inicio-fin
    const abx = Number(b.lng) - Number(a.lng)
    const aby = Number(b.lat) - Number(a.lat)
    const ab2 = abx * abx + aby * aby
    let dChord = 0
    if (ab2 > 1e-24) {
      let t = ((Number(pts[i].lng) - Number(a.lng)) * abx
        + (Number(pts[i].lat) - Number(a.lat)) * aby) / ab2
      t = Math.max(0, Math.min(1, t))
      const q = { lng: Number(a.lng) + t * abx, lat: Number(a.lat) + t * aby }
      dChord = haversineM(pts[i], q)
    }
    if (turn > 155 && dChord > maxOffExpected + chordBudget * 0.25 + 8) return false
  }

  // Bucles: varios retrocesos fuertes a lo largo de la cuerda.
  const abx = Number(b.lng) - Number(a.lng)
  const aby = Number(b.lat) - Number(a.lat)
  const ab2 = abx * abx + aby * aby
  if (ab2 > 1e-24 && pts.length >= 5) {
    let prevT = -Infinity
    let reversals = 0
    for (let i = 0; i < pts.length; i += 1) {
      const t = ((Number(pts[i].lng) - Number(a.lng)) * abx
        + (Number(pts[i].lat) - Number(a.lat)) * aby) / ab2
      if (Number.isFinite(prevT) && t < prevT - 0.12) reversals += 1
      prevT = t
    }
    if (reversals >= 3) return false
  }

  return true
}

function rectaSentidoEje(lng0, lat0, lng1, lat1, meta, degraded = false) {
  return {
    points: [
      { lng: lng0, lat: lat0 },
      { lng: lng1, lat: lat1 },
    ],
    absIni: meta.absIni,
    absFin: meta.absFin,
    distIni: meta.distIni,
    distFin: meta.distFin,
    eje_id: meta.eje_id,
    along: false,
    degraded: !!degraded,
  }
}

/**
 * Línea paralela al eje entre dos puntos (inicio→fin), con transición gradual
 * de distancia si el offset al eje difiere en los extremos.
 * El primer y último vértice coinciden exactamente con inicio y fin.
 * Si el tramo no es confiable (extremo del abscisado, transversal, caústica),
 * devuelve la cuerda recta con `along: false` y opcionalmente `degraded: true`.
 *
 * @returns {null|{ points: Array<{lng:number,lat:number}>, absIni:number, absFin:number, distIni:number, distFin:number, eje_id:any, along?: boolean, degraded?: boolean }}
 */
export function construirLineaSentidoEje({
  ejes,
  inicio,
  fin,
  stepM = 2,
  maxDistM = SICOE_EJE_MAX_DIST_PROYECCION_M * 2,
} = {}) {
  if (!inicio || !fin) return null
  const lng0 = Number(inicio.lng)
  const lat0 = Number(inicio.lat)
  const lng1 = Number(fin.lng)
  const lat1 = Number(fin.lat)
  if (![lng0, lat0, lng1, lat1].every(Number.isFinite)) return null

  const proyIni = proyectarSobreEje(ejes, lng0, lat0, { maxDistM })
  const proyFin = proyectarSobreEje(ejes, lng1, lat1, { maxDistM })
  if (!proyIni?.sobre_eje || !proyFin?.sobre_eje) return null

  const ejeId = proyIni.eje_id
  const eje = (ejes || []).find((e) => e.id === ejeId)
    || (ejes || []).find((e) => e.id === proyFin.eje_id)
    || null
  if (!eje) return null

  // Si caen en ejes distintos, intentar el de menor suma de distancias
  let ejeUsar = eje
  if (proyIni.eje_id !== proyFin.eje_id) {
    const eA = (ejes || []).find((e) => e.id === proyIni.eje_id)
    const eB = (ejes || []).find((e) => e.id === proyFin.eje_id)
    const dA = proyIni.dist_m + (proyectarSobreEje([eA].filter(Boolean), lng1, lat1, { maxDistM })?.dist_m ?? 1e9)
    const dB = proyFin.dist_m + (proyectarSobreEje([eB].filter(Boolean), lng0, lat0, { maxDistM })?.dist_m ?? 1e9)
    ejeUsar = dA <= dB ? eA : eB
  }
  if (!ejeUsar) return null

  const p0 = proyectarSobreEje([ejeUsar], lng0, lat0, { maxDistM })
  const p1 = proyectarSobreEje([ejeUsar], lng1, lat1, { maxDistM })
  if (!p0?.sobre_eje || !p1?.sobre_eje) return null

  const d0 = distConSignoSobreEje(p0)
  const d1 = distConSignoSobreEje(p1)
  const absSpan = Math.abs(Number(p1.abs_m) - Number(p0.abs_m))
  const chordM = haversineM({ lng: lng0, lat: lat0 }, { lng: lng1, lat: lat1 })
  const lateral = Math.abs(d0 - d1)
  const meta = {
    absIni: p0.abs_m,
    absFin: p1.abs_m,
    distIni: d0,
    distFin: d1,
    eje_id: ejeUsar.id,
  }

  // Transversal o tramo casi puntual: recta (no densificar a lo largo del eje).
  const esTransversal = !(absSpan > 2.0)
    || absSpan < chordM * 0.35
    || (lateral > absSpan * 1.15 && absSpan < 10)
  if (esTransversal) {
    return rectaSentidoEje(lng0, lat0, lng1, lat1, meta, false)
  }

  // Extremo / más allá del abscisado: no extrapolar → recta confiable.
  const beyond0 = proyeccionMasAllaDelEje(ejeUsar, p0, lng0, lat0)
  const beyond1 = proyeccionMasAllaDelEje(ejeUsar, p1, lng1, lat1)
  if (beyond0 || beyond1) {
    return rectaSentidoEje(lng0, lat0, lng1, lat1, meta, true)
  }

  // Limitar el muestreo al rango real del eje (sin colapsar en el extremo).
  const range = ejeAbsRange(ejeUsar)
  let absA = Number(p0.abs_m)
  let absB = Number(p1.abs_m)
  if (range) {
    absA = Math.max(range.min, Math.min(range.max, absA))
    absB = Math.max(range.min, Math.min(range.max, absB))
  }
  if (!(Math.abs(absB - absA) > 2.0)) {
    return rectaSentidoEje(lng0, lat0, lng1, lat1, meta, true)
  }

  let samples = sampleAbsRange(ejeUsar, absA, absB, stepM)
  if (samples.length < 2) return null
  if (absB < absA) samples = [...samples].reverse()

  // Evitar muestras duplicadas en el mismo pie (colapso en extremos).
  const dedup = []
  for (const s of samples) {
    const prev = dedup[dedup.length - 1]
    if (prev && haversineM(prev, s) < 0.35) continue
    dedup.push(s)
  }
  samples = dedup
  if (samples.length < 2) {
    return rectaSentidoEje(lng0, lat0, lng1, lat1, meta, true)
  }

  const points = []
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const t = samples.length === 1 ? 0 : i / (samples.length - 1)
    const dist = d0 + t * (d1 - d0)
    if (Math.abs(dist) < 1e-9) {
      points.push({ lng: s.lng, lat: s.lat })
      continue
    }
    const brOff = dist >= 0
      ? (s.bearing + 270) % 360 // izquierda
      : (s.bearing + 90) % 360 // derecha
    points.push(destinationPoint(s.lng, s.lat, brOff, Math.abs(dist)))
  }

  if (points.length < 2) return null
  // Exactitud: pasar por inicio y fin
  points[0] = { lng: lng0, lat: lat0 }
  points[points.length - 1] = { lng: lng1, lat: lat1 }

  if (!pathSentidoEjeEsValido(points, {
    chordM,
    absSpan: Math.abs(absB - absA),
    distIni: d0,
    distFin: d1,
  })) {
    return rectaSentidoEje(lng0, lat0, lng1, lat1, meta, true)
  }

  return {
    points,
    absIni: p0.abs_m,
    absFin: p1.abs_m,
    distIni: d0,
    distFin: d1,
    eje_id: ejeUsar.id,
    along: true,
    degraded: false,
  }
}

/**
 * Construye polígono de franja paralelo al eje.
 * distIni/distFin = distancia del centro de la franja al eje (m).
 * ancho = ancho total de la franja (m).
 */
export function construirFranjaPolygon({
  eje,
  absInicio,
  absFinal,
  distIni = 0,
  distFin = 0,
  ancho = SICOE_FRANJA_ANCHO_DEFAULT_M,
  lado = 'central',
  stepM = 5,
}) {
  if (!eje || absInicio == null || absFinal == null) return null
  const a0 = Number(absInicio)
  const a1 = Number(absFinal)
  if (!Number.isFinite(a0) || !Number.isFinite(a1) || Math.abs(a1 - a0) < 1e-6) return null
  const samples = sampleAbsRange(eje, a0, a1, stepM)
  if (samples.length < 2) return null
  const half = Math.max(0.15, Number(ancho) / 2 || SICOE_FRANJA_ANCHO_DEFAULT_M / 2)
  const left = []
  const right = []
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const t = samples.length === 1 ? 0 : i / (samples.length - 1)
    const distCentro = Number(distIni) + t * (Number(distFin) - Number(distIni))
    const brLado = offsetBearingForLado(s.bearing, lado)
    const centro =
      Math.abs(distCentro) < 1e-9 || normalizarCostadoDigitado(lado) === 'central'
        ? { lng: s.lng, lat: s.lat }
        : destinationPoint(s.lng, s.lat, brLado, Math.abs(distCentro))
    const brPerpL = (s.bearing + 270) % 360
    const brPerpR = (s.bearing + 90) % 360
    left.push(destinationPoint(centro.lng, centro.lat, brPerpL, half))
    right.push(destinationPoint(centro.lng, centro.lat, brPerpR, half))
  }
  const ring = [
    ...left.map((p) => [p.lng, p.lat]),
    ...right.reverse().map((p) => [p.lng, p.lat]),
  ]
  if (ring.length) ring.push(ring[0])
  if (ring.length < 4) return null
  return {
    type: 'Polygon',
    coordinates: [ring],
  }
}

function parseCoordPair(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  if (la === 0 && ln === 0) return null
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null
  return { lat: la, lng: ln }
}

/**
 * Analiza un registro lineal: proyección, alertas y huella.
 */
export function analizarRegistroFranja({
  registro,
  ejes,
  toleranciaUbicacionM = SICOE_TOLERANCIA_UBICACION_DEFAULT_M,
  maxDistProyeccionM = SICOE_EJE_MAX_DIST_PROYECCION_M,
} = {}) {
  const tol = normalizarToleranciaUbicacionM(toleranciaUbicacionM)
  const reg = registro || {}
  const absIni = sicoeAbscisaAMetros(reg.abs_inicio ?? reg.absInicio)
  const absFin = sicoeAbscisaAMetros(reg.abs_final ?? reg.absFinal)
  const ancho = Number(reg.ancho) > 0 ? Number(reg.ancho) : SICOE_FRANJA_ANCHO_DEFAULT_M
  const costadoDig = reg.margen || reg.calzada || ''
  const hallazgos = []

  const pIni = parseCoordPair(reg.coord_lat ?? reg.coordLat, reg.coord_lng ?? reg.coordLng)
  const pFin = parseCoordPair(
    reg.coord_lat_fin ?? reg.coordLatFin,
    reg.coord_lng_fin ?? reg.coordLngFin,
  )

  if (!ejes?.length || absIni == null || absFin == null) {
    return {
      ok: false,
      precision: null,
      huella: null,
      hallazgos: [],
      proyecciones: {},
      semaforo: 'verde',
    }
  }

  // Elegir eje: el de la proyección del punto, o el que cubra el rango de abs
  let eje = null
  let proyIni = null
  let proyFin = null

  if (pIni) {
    proyIni = proyectarSobreEje(ejes, pIni.lng, pIni.lat, { maxDistM: maxDistProyeccionM })
    if (proyIni) eje = ejes.find((e) => e.id === proyIni.eje_id) || null
  }
  if (pFin) {
    proyFin = proyectarSobreEje(ejes, pFin.lng, pFin.lat, { maxDistM: maxDistProyeccionM })
    if (!eje && proyFin) eje = ejes.find((e) => e.id === proyFin.eje_id) || null
  }
  if (!eje) {
    // Eje que cubra el rango de abscisas digitadas
    eje =
      ejes.find((e) => {
        const ms = (e.puntos || []).map((p) => p.m)
        const lo = Math.min(...ms)
        const hi = Math.max(...ms)
        return Math.min(absIni, absFin) >= lo - 1 && Math.max(absIni, absFin) <= hi + 1
      }) || ejes[0]
  }

  const mkHallazgo = (tipo, texto, extra = {}) => ({
    tipo,
    texto,
    medida_m: extra.medida_m ?? null,
    abs_desde: absIni,
    abs_hasta: absFin,
    valor_en_juego: 0,
    item_numero: txt(reg.item_numero),
    tramo: txt(reg.tramo),
    infraestructura: txt(reg.infraestructura),
    costado: txt(costadoDig),
    pk_id_id: reg.pk_id_id ?? null,
    ubicacion: `${absIni} – ${absFin}`,
    registros_involucrados: [
      {
        id: reg.id,
        numero_registro: reg.numero_registro,
        reporte_id: reg.reporte_id,
        item_numero: reg.item_numero,
        pk_id_id: reg.pk_id_id,
        abs_inicio: absIni,
        abs_final: absFin,
      },
    ],
    ...extra,
  })

  let precision = 'aproximada'
  let distIni = SICOE_FRANJA_OFFSET_COSTADO_M
  let distFin = SICOE_FRANJA_OFFSET_COSTADO_M
  let ladoFranja = normalizarCostadoDigitado(costadoDig) || 'central'

  if (ladoFranja === 'central') {
    distIni = 0
    distFin = 0
  }

  const tieneCoords = !!(pIni || pFin)
  let coordsSobreEje = true

  if (pIni && proyIni) {
    if (!proyIni.sobre_eje) {
      coordsSobreEje = false
      hallazgos.push(
        mkHallazgo(
          'ubicacion_inconsistente',
          `Ubicación inconsistente · coord. inicio a ${proyIni.dist_m.toFixed(1)} m del eje`,
          { medida_m: Math.round(proyIni.dist_m * 100) / 100 },
        ),
      )
    } else {
      // Verificar abscisa: con un solo punto, contra el extremo más cercano
      const refAbs = pFin
        ? absIni
        : Math.abs(proyIni.abs_m - absIni) <= Math.abs(proyIni.abs_m - absFin)
          ? absIni
          : absFin
      const delta = Math.abs(proyIni.abs_m - refAbs)
      if (delta > tol) {
        hallazgos.push(
          mkHallazgo(
            'ubicacion_inconsistente',
            `Ubicación inconsistente · abscisa real ${proyIni.abs_m.toFixed(1)} vs digitada ${refAbs} (Δ ${delta.toFixed(1)} m)`,
            { medida_m: Math.round(delta * 100) / 100 },
          ),
        )
      }
      if (!costadosCoinciden(costadoDig, proyIni.lado)) {
        hallazgos.push(
          mkHallazgo(
            'costado_inconsistente',
            `Costado inconsistente · real ${proyIni.lado} vs digitado ${costadoDig || '—'}`,
          ),
        )
      }
      distIni = proyIni.dist_m
      ladoFranja = proyIni.lado === 'central' ? ladoFranja : proyIni.lado
    }
  }

  if (pFin && proyFin) {
    if (!proyFin.sobre_eje) {
      coordsSobreEje = false
      hallazgos.push(
        mkHallazgo(
          'ubicacion_inconsistente',
          `Ubicación inconsistente · coord. fin a ${proyFin.dist_m.toFixed(1)} m del eje`,
          { medida_m: Math.round(proyFin.dist_m * 100) / 100 },
        ),
      )
    } else {
      const delta = Math.abs(proyFin.abs_m - absFin)
      if (delta > tol) {
        hallazgos.push(
          mkHallazgo(
            'ubicacion_inconsistente',
            `Ubicación inconsistente · abscisa fin real ${proyFin.abs_m.toFixed(1)} vs digitada ${absFin} (Δ ${delta.toFixed(1)} m)`,
            { medida_m: Math.round(delta * 100) / 100 },
          ),
        )
      }
      if (!costadosCoinciden(costadoDig, proyFin.lado)) {
        hallazgos.push(
          mkHallazgo(
            'costado_inconsistente',
            `Costado inconsistente · fin real ${proyFin.lado} vs digitado ${costadoDig || '—'}`,
          ),
        )
      }
      distFin = proyFin.dist_m
      if (!pIni) ladoFranja = proyFin.lado === 'central' ? ladoFranja : proyFin.lado
    }
  }

  if (tieneCoords && coordsSobreEje && (proyIni?.sobre_eje || proyFin?.sobre_eje)) {
    precision = 'precisa'
    if (pIni && proyIni?.sobre_eje && !(pFin && proyFin?.sobre_eje)) {
      distFin = distIni
    }
    if (pFin && proyFin?.sobre_eje && !(pIni && proyIni?.sobre_eje)) {
      distIni = distFin
    }
  } else {
    precision = 'aproximada'
    // Offset por costado digitado
    if (ladoFranja === 'central') {
      distIni = 0
      distFin = 0
    } else {
      distIni = SICOE_FRANJA_OFFSET_COSTADO_M
      distFin = SICOE_FRANJA_OFFSET_COSTADO_M
    }
  }

  const geom = construirFranjaPolygon({
    eje,
    absInicio: absIni,
    absFinal: absFin,
    distIni,
    distFin,
    ancho,
    lado: ladoFranja,
  })

  const huella = geom
    ? {
        type: 'Feature',
        geometry: geom,
        properties: {
          registro_id: reg.id,
          numero_registro: reg.numero_registro,
          reporte_id: reg.reporte_id,
          item_numero: reg.item_numero || null,
          precision,
          abs_inicio: absIni,
          abs_final: absFin,
          costado: costadoDig || null,
          lado: ladoFranja,
          ancho,
        },
      }
    : null

  const tieneRojo = hallazgos.some((h) => h.tipo === 'ubicacion_inconsistente' || h.tipo === 'costado_inconsistente')
  return {
    ok: true,
    precision,
    huella,
    hallazgos,
    proyecciones: { inicio: proyIni, fin: proyFin },
    semaforo: tieneRojo ? 'amarillo' : 'verde',
    tolerancia_m: tol,
  }
}

/** FeatureCollection del eje (LineString por vía) para dibujar en el plano. */
export function ejesToGeojson(ejes) {
  return {
    type: 'FeatureCollection',
    features: (ejes || []).map((eje) => ({
      type: 'Feature',
      properties: { eje_id: eje.id, tipo: 'eje_abscisado' },
      geometry: {
        type: 'LineString',
        coordinates: (eje.puntos || []).map((p) => [p.lng, p.lat]),
      },
    })),
  }
}
