/**
 * Cuadro de despiece de acero — cálculos y modelo.
 *
 * Diámetros: misma lista NTC 2289 de SicoeObra (`sicoeVarilla.js`).
 * Peso kg/m en despiece: precisión de cálculo a 3 decimales (p. ej. #4 = 0,994),
 * alineada con la tabla de plataforma.
 *
 * Captura de segmentos: metros (unidad visible «m»). Columna Forma / PNG: cotas en cm.
 */
import {
  SICOE_VARILLA_DIAMETROS,
  SICOE_VARILLA_PESOS_KG_M,
  sicoeNormalizarDiametroVarilla,
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

/**
 * Precisión real de cálculo para despiece (mismas claves que la tabla de plataforma).
 * No modifica `SICOE_VARILLA_PESOS_KG_M`. Valores ASTM A615 / NTC 2289 a 3 decimales.
 */
export const DESPIECE_PESOS_KG_M_PRECISION = Object.freeze({
  '1/4': 0.25,
  '3/8': 0.56,
  '1/2': 0.994,
  '5/8': 1.552,
  '3/4': 2.235,
  '7/8': 3.042,
  '1': 3.973,
  '1 1/8': 5.06,
  '1 1/4': 6.404,
  '1 3/8': 7.907,
  '1 3/4': 11.387,
  '2 1/4': 20.239,
})

/** Lista de diámetros para el popup: etiqueta #n + Ø fracción (peso automático preciso). */
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
      pesoKgM: despiecePesoKgM(frac),
    })
  }
  for (const frac of SICOE_VARILLA_DIAMETROS) {
    if (used.has(frac)) continue
    opts.push({
      id: frac,
      bar: null,
      label: `Ø ${frac}`,
      pesoKgM: despiecePesoKgM(frac),
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

/** Peso kg/m con precisión de cálculo del despiece (no altera la tabla SicoeObra). */
export function despiecePesoKgM(diametro) {
  const canon = despieceResolverDiametro(diametro)
  if (!canon) return null
  if (Object.prototype.hasOwnProperty.call(DESPIECE_PESOS_KG_M_PRECISION, canon)) {
    return DESPIECE_PESOS_KG_M_PRECISION[canon]
  }
  // Fallback: valor de la tabla de plataforma (mismas claves).
  return SICOE_VARILLA_PESOS_KG_M[canon] ?? null
}

export function despieceFmtPesoKgM(peso) {
  if (peso == null || !Number.isFinite(Number(peso))) return '—'
  const n = Number(peso)
  // Misma precisión con que se calcula (p. ej. 0,994), sin forzar 2 decimales.
  const s = String(n)
  if (s.includes('e') || s.includes('E')) return n.toFixed(3)
  return s.replace('.', ',')
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export function fmt2(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return round2(n).toFixed(2).replace('.', ',')
}

export function parseNum(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  return Number(String(v).replace(',', '.'))
}

function fmtMField(n) {
  if (!Number.isFinite(n)) return ''
  // Evita ruido binario: 0.2 → "0.2", 0.76 → "0.76"
  const r = Math.round(n * 1e6) / 1e6
  return String(r)
}

/**
 * Longitud efectiva de un segmento en metros.
 * Única: valor. Variable: promedio (mín+máx)/2.
 * Acepta campos nuevos (lengthM/minM/maxM) o legado cm (lengthCm/…).
 */
export function segmentLengthM(seg) {
  if (!seg) return 0
  const hasM = seg.lengthM != null || seg.minM != null || seg.maxM != null
    || seg.units === 'm'
  if (seg.mode === 'variable' || seg.mode === 'var') {
    if (hasM || (seg.minM != null && seg.minM !== '') || (seg.maxM != null && seg.maxM !== '')) {
      const a = parseNum(seg.minM)
      const b = parseNum(seg.maxM)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
      return (a + b) / 2
    }
    const a = parseNum(seg.minCm)
    const b = parseNum(seg.maxCm)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
    return ((a + b) / 2) / 100
  }
  if (hasM || (seg.lengthM != null && seg.lengthM !== '')) {
    const v = parseNum(seg.lengthM ?? seg.valueM)
    return Number.isFinite(v) ? v : NaN
  }
  const vCm = parseNum(seg.lengthCm ?? seg.valueCm ?? seg.cm)
  return Number.isFinite(vCm) ? vCm / 100 : NaN
}

/** @deprecated usar segmentLengthM; se mantiene por compat de imports. */
export function segmentLengthCm(seg) {
  const m = segmentLengthM(seg)
  return Number.isFinite(m) ? m * 100 : NaN
}

/**
 * Etiqueta de cota para columna Forma / PNG: siempre en centímetros.
 * 0,20 m → 20; variable 0,40–1,18 → «Var. 40 a 118» / «Prom. 79».
 */
export function segmentDisplayLabel(seg) {
  if (!seg) return '—'
  if (seg.mode === 'variable' || seg.mode === 'var') {
    let a
    let b
    if (seg.minM != null && seg.minM !== '' && seg.maxM != null && seg.maxM !== '') {
      a = parseNum(seg.minM) * 100
      b = parseNum(seg.maxM) * 100
    } else {
      a = parseNum(seg.minCm)
      b = parseNum(seg.maxCm)
    }
    const promM = segmentLengthM(seg)
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(promM)) return 'Var. —'
    return {
      varLine: `Var. ${Math.round(a)} a ${Math.round(b)}`,
      promLine: `Prom. ${Math.round(promM * 100)}`,
    }
  }
  const m = segmentLengthM(seg)
  if (!Number.isFinite(m)) return '—'
  return { varLine: null, promLine: null, value: Math.round(m * 100) }
}

/**
 * Longitud desarrollada de espiral (m): n × √((π·Ø)² + paso²)
 * Ø y paso en metros.
 */
export function spiralDevelopedLengthM(diametroM, pasoM, vueltas) {
  const d = parseNum(diametroM)
  const p = parseNum(pasoM)
  const n = parseNum(vueltas)
  if (![d, p, n].every(Number.isFinite) || n < 0) return NaN
  return n * Math.sqrt((Math.PI * d) ** 2 + p ** 2)
}

/** @deprecated compat: interpreta args como cm y devuelve cm. */
export function spiralDevelopedLengthCm(diametroCm, pasoCm, vueltas) {
  const Lm = spiralDevelopedLengthM(
    Number.isFinite(parseNum(diametroCm)) ? parseNum(diametroCm) / 100 : diametroCm,
    Number.isFinite(parseNum(pasoCm)) ? parseNum(pasoCm) / 100 : pasoCm,
    vueltas,
  )
  return Number.isFinite(Lm) ? Lm * 100 : NaN
}

/** Convierte un segmento legado (cm) a captura en metros, conservando longitud real. */
export function migrateSegmentToMeters(seg) {
  if (!seg || typeof seg !== 'object') return seg
  if (seg.units === 'm' || (seg.lengthM != null && seg.lengthM !== '')
    || (seg.minM != null && seg.minM !== '') || (seg.maxM != null && seg.maxM !== '')) {
    return {
      ...seg,
      units: 'm',
      lengthM: seg.lengthM != null ? String(seg.lengthM) : '',
      minM: seg.minM != null ? String(seg.minM) : '',
      maxM: seg.maxM != null ? String(seg.maxM) : '',
      contrib: Number(seg.contrib) > 0 ? Number(seg.contrib) : 1,
    }
  }
  const mode = seg.mode === 'variable' || seg.mode === 'var' ? 'variable' : 'unica'
  if (mode === 'variable') {
    const a = parseNum(seg.minCm)
    const b = parseNum(seg.maxCm)
    return {
      ...seg,
      units: 'm',
      mode: 'variable',
      minM: Number.isFinite(a) ? fmtMField(a / 100) : '',
      maxM: Number.isFinite(b) ? fmtMField(b / 100) : '',
      lengthM: '',
      lengthCm: undefined,
      minCm: undefined,
      maxCm: undefined,
      contrib: Number(seg.contrib) > 0 ? Number(seg.contrib) : 1,
    }
  }
  const v = parseNum(seg.lengthCm ?? seg.valueCm ?? seg.cm)
  return {
    ...seg,
    units: 'm',
    mode: 'unica',
    lengthM: Number.isFinite(v) ? fmtMField(v / 100) : '',
    minM: '',
    maxM: '',
    lengthCm: undefined,
    minCm: undefined,
    maxCm: undefined,
    contrib: Number(seg.contrib) > 0 ? Number(seg.contrib) : 1,
  }
}

function migrateSpiralToMeters(sp) {
  if (!sp || typeof sp !== 'object') return sp
  if (sp.units === 'm' || sp.diametroM != null || sp.pasoM != null) {
    return {
      diametroM: sp.diametroM != null ? String(sp.diametroM) : '',
      pasoM: sp.pasoM != null ? String(sp.pasoM) : '',
      vueltas: sp.vueltas != null ? String(sp.vueltas) : '',
      units: 'm',
    }
  }
  const d = parseNum(sp.diametroCm)
  const p = parseNum(sp.pasoCm)
  return {
    diametroM: Number.isFinite(d) ? fmtMField(d / 100) : '',
    pasoM: Number.isFinite(p) ? fmtMField(p / 100) : '',
    vueltas: sp.vueltas != null ? String(sp.vueltas) : '',
    units: 'm',
  }
}

const FLEJE_NEW_IDS = new Set(['ladoA', 'ladoB', 'gancho'])
const FLEJE_LEGACY_IDS = new Set(['h1', 'h2', 'top', 'bot', 'left', 'right'])

function cloneFlejeSeg(from, id, name) {
  const base = migrateSegmentToMeters({
    ...(from || {}),
    id,
    name,
    mode: from?.mode === 'variable' || from?.mode === 'var' ? 'variable' : 'unica',
    contrib: 2,
  })
  return { ...base, id, name, contrib: 2 }
}

/**
 * Normaliza fleje legado → comercial y migra segmentos a metros.
 * Conserva longitudes reales (cm÷100 → m).
 */
export function normalizeDespiecePosition(pos) {
  if (!pos || typeof pos !== 'object') return pos
  let next = { ...pos }

  if (pos.shapeId === 'fleje_135') {
    const segs = Array.isArray(pos.segments) ? pos.segments : []
    const hasNew = segs.some((s) => FLEJE_NEW_IDS.has(s?.id))
    const hasLegacy = segs.some((s) => FLEJE_LEGACY_IDS.has(s?.id))
    if (hasNew) {
      const byId = Object.fromEntries(segs.filter((s) => FLEJE_NEW_IDS.has(s.id)).map((s) => [s.id, s]))
      next = {
        ...next,
        segments: [
          cloneFlejeSeg(byId.ladoA, 'ladoA', 'Lado A'),
          cloneFlejeSeg(byId.ladoB, 'ladoB', 'Lado B'),
          cloneFlejeSeg(byId.gancho, 'gancho', 'Longitud de cada gancho'),
        ],
      }
    } else if (hasLegacy) {
      const byId = Object.fromEntries(segs.map((s) => [s.id, s]))
      next = {
        ...next,
        segments: [
          cloneFlejeSeg(byId.top || byId.bot, 'ladoA', 'Lado A'),
          cloneFlejeSeg(byId.left || byId.right, 'ladoB', 'Lado B'),
          cloneFlejeSeg(byId.h1 || byId.h2, 'gancho', 'Longitud de cada gancho'),
        ],
      }
    }
  }

  if (Array.isArray(next.segments)) {
    next.segments = next.segments.map(migrateSegmentToMeters)
  }
  if (next.spiral) {
    next.spiral = migrateSpiralToMeters(next.spiral)
  }
  next.units = 'm'
  return next
}

/**
 * Calcula longitud parcial (m), total (m) y peso (kg) de una posición.
 * Fleje comercial: L = 2×A + 2×B + 2×gancho (vía `contrib`).
 */
export function computePositionMetrics(rawPos) {
  const pos = normalizeDespiecePosition(rawPos) || rawPos
  const pieces = parseNum(pos?.pieces ?? pos?.nPiezas)
  const diam = despieceResolverDiametro(pos?.diameter ?? pos?.diametro)
  const pesoKgM = diam ? despiecePesoKgM(diam) : null
  if (!diam || pesoKgM == null) {
    return { ok: false, error: 'Indique un diámetro de la tabla NTC 2289.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM: null, pieces: 0 }
  }
  if (!Number.isFinite(pieces) || pieces <= 0) {
    return { ok: false, error: 'Indique el N° de piezas.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces: 0 }
  }

  let sumM = 0
  const segs = pos?.segments || []
  if (pos?.shapeId === 'espiral' || pos?.spiral) {
    const sp = pos.spiral || {}
    let Lm = spiralDevelopedLengthM(sp.diametroM, sp.pasoM, sp.vueltas)
    if (!Number.isFinite(Lm) && (sp.diametroCm != null || sp.pasoCm != null)) {
      Lm = spiralDevelopedLengthCm(sp.diametroCm, sp.pasoCm, sp.vueltas)
      if (Number.isFinite(Lm)) Lm /= 100
    }
    if (!Number.isFinite(Lm)) {
      return { ok: false, error: 'Espiral: indique diámetro, paso y vueltas.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
    }
    sumM = Lm
  } else {
    if (!segs.length) {
      return { ok: false, error: 'Indique las longitudes de cada segmento.', partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
    }
    for (const seg of segs) {
      const L = segmentLengthM(seg)
      if (!Number.isFinite(L) || L < 0) {
        return { ok: false, error: `Revise el segmento «${seg?.name || seg?.id || ''}».`, partialM: 0, totalM: 0, pesoKg: 0, pesoKgM, pieces }
      }
      const contrib = Number(seg.contrib) > 0 ? Number(seg.contrib) : 1
      sumM += L * contrib
    }
  }

  const partialM = round2(sumM)
  const totalM = round2(partialM * pieces)
  // Peso = longitud total mostrada × kg/m mostrado → coincide exactamente a 2 decimales.
  const pesoExact = totalM * pesoKgM
  return {
    ok: true,
    partialM,
    totalM,
    pesoKg: round2(pesoExact),
    pesoKgM,
    pesoKgMLabel: despieceFmtPesoKgM(pesoKgM),
    pieces,
    sumM,
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
    units: 'm',
    spacingM: '',
    ubicacion: '',
    anguloDeg: '',
    parrilla: '',
    parrillaCara: '',
  }
}

/** Espaciamiento → «c/ 0,20» o «—». */
export function formatEspaciamiento(spacingM) {
  if (spacingM == null || String(spacingM).trim() === '') return '—'
  const n = parseNum(spacingM)
  if (!Number.isFinite(n)) return '—'
  return `c/ ${fmt2(n)}`
}

/** Longitudinal | Transversal | Diagonal 45°. */
export function formatUbicacion(pos) {
  const u = String(pos?.ubicacion || '').trim()
  if (!u) return '—'
  if (u === 'Diagonal') {
    const a = parseNum(pos?.anguloDeg)
    if (Number.isFinite(a)) return `Diagonal ${Math.round(a)}°`
    return 'Diagonal'
  }
  return u
}

/** Sencilla | Doble · Superior / Externa | Doble · Inferior / Interna */
export function formatParrilla(pos) {
  const p = String(pos?.parrilla || '').trim()
  if (!p) return '—'
  if (p === 'Doble') {
    const cara = String(pos?.parrillaCara || '').trim()
    return cara ? `Doble · ${cara}` : 'Doble'
  }
  return p
}

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
