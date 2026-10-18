/**
 * Cuadro de despiece de acero — cálculos y modelo.
 * Pesos kg/m: misma tabla NTC 2289 de SicoeObra (`sicoeVarilla.js`), sin pedir peso al usuario.
 */
import {
  SICOE_VARILLA_DIAMETROS,
  SICOE_VARILLA_PESOS_KG_M,
  sicoeNormalizarDiametroVarilla,
  sicoePesoKgMPorDiametro,
} from '../../modules/sicoe-obra/sicoeVarilla.js'

/** ASTM # → clave de la tabla NTC de la plataforma. */
export const DESPIECE_BARRA_A_DIAMETRO = Object.freeze({
  '#2': '1/4',
  '#3': '3/8',
  '#4': '1/2',
  '#5': '5/8',
  '#6': '3/4',
  '#7': '7/8',
  '#8': '1',
  '#9': '1 1/8',
  '#10': '1 1/4',
  '#11': '1 3/8',
  '#14': '1 3/4',
  '#18': '2 1/4',
})

/** Lista de diámetros para el popup: etiqueta #n + Ø fracción (peso automático). */
export function despieceDiametroOpciones() {
  const used = new Set()
  const opts = []
  for (const [bar, frac] of Object.entries(DESPIECE_BARRA_A_DIAMETRO)) {
    if (!Object.prototype.hasOwnProperty.call(SICOE_VARILLA_PESOS_KG_M, frac)) continue
    used.add(frac)
    opts.push({
      id: frac,
      bar,
      label: `${bar} (Ø ${frac})`,
      pesoKgM: SICOE_VARILLA_PESOS_KG_M[frac],
    })
  }
  for (const frac of SICOE_VARILLA_DIAMETROS) {
    if (used.has(frac)) continue
    opts.push({
      id: frac,
      bar: null,
      label: `Ø ${frac}`,
      pesoKgM: SICOE_VARILLA_PESOS_KG_M[frac],
    })
  }
  return opts
}

export function despieceResolverDiametro(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const barKey = s.startsWith('#') ? s.toUpperCase() : (s.match(/^\d+$/) ? `#${s}` : null)
  if (barKey && DESPIECE_BARRA_A_DIAMETRO[barKey]) {
    return DESPIECE_BARRA_A_DIAMETRO[barKey]
  }
  return sicoeNormalizarDiametroVarilla(s)
}

export function despiecePesoKgM(diametro) {
  const canon = despieceResolverDiametro(diametro)
  if (!canon) return null
  return sicoePesoKgMPorDiametro(canon)
}

export function despieceFmtPesoKgM(peso) {
  if (peso == null || !Number.isFinite(Number(peso))) return '—'
  const n = Number(peso)
  // Misma precisión que la tabla (sin rellenar ceros artificiales).
  const s = String(n)
  if (s.includes('e') || s.includes('E')) return n.toFixed(3)
  return s
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export function fmt2(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return round2(n).toFixed(2).replace('.', ',')
}

function parseNum(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  return Number(String(v).replace(',', '.'))
}

/**
 * Longitud efectiva de un segmento en cm.
 * Única: valor. Variable: promedio (mín+máx)/2.
 */
export function segmentLengthCm(seg) {
  if (!seg) return 0
  if (seg.mode === 'variable' || seg.mode === 'var') {
    const a = parseNum(seg.minCm)
    const b = parseNum(seg.maxCm)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
    return (a + b) / 2
  }
  const v = parseNum(seg.lengthCm ?? seg.valueCm ?? seg.cm)
  return Number.isFinite(v) ? v : NaN
}

export function segmentDisplayLabel(seg) {
  if (!seg) return '—'
  if (seg.mode === 'variable' || seg.mode === 'var') {
    const a = parseNum(seg.minCm)
    const b = parseNum(seg.maxCm)
    const prom = segmentLengthCm(seg)
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(prom)) return 'Var. —'
    return {
      varLine: `Var. ${Math.round(a)} a ${Math.round(b)}`,
      promLine: `Prom. ${Math.round(prom)}`,
    }
  }
  const v = segmentLengthCm(seg)
  if (!Number.isFinite(v)) return '—'
  return { varLine: null, promLine: null, value: Math.round(v) }
}

/**
 * Longitud desarrollada de espiral (cm): n × √((π·Ø)² + paso²)
 * diámetroCm, pasoCm, vueltas.
 */
export function spiralDevelopedLengthCm(diametroCm, pasoCm, vueltas) {
  const d = parseNum(diametroCm)
  const p = parseNum(pasoCm)
  const n = parseNum(vueltas)
  if (![d, p, n].every(Number.isFinite) || n < 0) return NaN
  return n * Math.sqrt((Math.PI * d) ** 2 + p ** 2)
}

/**
 * Calcula longitud parcial (m), total (m) y peso (kg) de una posición.
 * @returns {{ ok, error?, partialM, totalM, pesoKg, pesoKgM, pieces }}
 */
export function computePositionMetrics(pos) {
  const pieces = parseNum(pos?.pieces ?? pos?.nPiezas)
  const diam = despieceResolverDiametro(pos?.diameter ?? pos?.diametro)
  const pesoKgM = diam ? sicoePesoKgMPorDiametro(diam) : null
  if (!diam || pesoKgM == null) {
    return { ok: false, error: 'Indique un diámetro de la tabla NTC 2289.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM: null, pieces: 0 }
  }
  if (!Number.isFinite(pieces) || pieces <= 0) {
    return { ok: false, error: 'Indique el N° de piezas.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces: 0 }
  }

  let sumCm = 0
  const segs = pos?.segments || []
  if (pos?.shapeId === 'espiral' || pos?.spiral) {
    const sp = pos.spiral || {}
    const L = spiralDevelopedLengthCm(sp.diametroCm, sp.pasoCm, sp.vueltas)
    if (!Number.isFinite(L)) {
      return { ok: false, error: 'Espiral: indique diámetro, paso y vueltas.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
    }
    sumCm = L
  } else {
    if (!segs.length) {
      return { ok: false, error: 'Indique las longitudes de cada segmento.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
    }
    for (const seg of segs) {
      const L = segmentLengthCm(seg)
      if (!Number.isFinite(L) || L < 0) {
        return { ok: false, error: `Revise el segmento «${seg?.name || seg?.id || ''}».`, partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
      }
      sumCm += L
    }
  }

  const partialM = sumCm / 100
  const totalM = partialM * pieces
  // Peso = longitud total × peso kg/m (valores exactos antes de redondear display).
  const pesoExact = totalM * pesoKgM
  return {
    ok: true,
    partialM: round2(partialM),
    totalM: round2(totalM),
    pesoKg: round2(pesoExact),
    pesoKgM,
    pesoKgMLabel: despieceFmtPesoKgM(pesoKgM),
    pieces,
    sumCm,
  }
}

/** Total del cuadro = suma de los pesos mostrados (2 decimales). */
export function computeScheduleTotalKg(positions) {
  let sum = 0
  for (const p of positions || []) {
    const m = computePositionMetrics(p)
    if (m.ok) sum = round2(sum + m.pesoKg)
  }
  return sum
}

export function newDespieceId(prefix = 'dp') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function createEmptySchedule(nombre = '') {
  return {
    id: newDespieceId('cuadro'),
    nombre: String(nombre || ''),
    positions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createEmptyPosition({ shapeId = 'doble_gancho', diameter = '1/2' } = {}) {
  return {
    id: newDespieceId('pos'),
    name: '',
    diameter,
    pieces: '',
    shapeId,
    segments: [],
    spiral: null,
  }
}

/** ¿Hay cuadros con nombre vacío o posiciones incompletas que bloqueen guardar? */
export function despieceSchedulesIncomplete(schedules) {
  for (const s of schedules || []) {
    if (!String(s?.nombre || '').trim()) return true
    for (const p of s.positions || []) {
      if (!String(p?.name || '').trim()) return true
      const m = computePositionMetrics(p)
      if (!m.ok) return true
    }
  }
  return false
}

export {
  SICOE_VARILLA_PESOS_KG_M,
  SICOE_VARILLA_DIAMETROS,
}
