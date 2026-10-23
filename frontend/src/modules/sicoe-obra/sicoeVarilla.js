/**
 * Esquema de medición varilla (Kg) — NTC 2289 pesos kg/m.
 * Tabla fija de plataforma; Cant Total = Longitud × Peso × Cantidad (redondeo SICOE).
 */
import {
  calcularCantidadConRedondeo,
  redondearCantidadTotalDinamico,
  redondearDimension,
} from './sicoeCantidadRedondeo.js'

/**
 * Pesos NTC 2289 / ASTM A615 a 3 decimales (p. ej. 1/2" = 0,994 kg/m).
 * @type {Record<string, number>}
 */
export const SICOE_VARILLA_PESOS_KG_M = Object.freeze({
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

export const SICOE_VARILLA_DIAMETROS = Object.freeze(Object.keys(SICOE_VARILLA_PESOS_KG_M))

const ALIASES = Object.freeze({
  '0.25': '1/4',
  '0,25': '1/4',
  '1-1/8': '1 1/8',
  '1-1/4': '1 1/4',
  '1-3/8': '1 3/8',
  '1-3/4': '1 3/4',
  '2-1/4': '2 1/4',
})

export function sicoeUnidadEsKg(unidad) {
  const u = String(unidad || '').trim().toLowerCase().replace(/\s+/g, '')
  return u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos'
}

export function sicoeNormalizarDiametroVarilla(raw) {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  s = s.replace(/[Øø⌀]/g, '').replace(/['"]/g, '').trim()
  s = s.replace(/\s+/g, ' ').replace(/[−–]/g, '-')
  const m = s.match(/^(\d+)\s*[-/]\s*(\d+)\s*\/\s*(\d+)$/)
  if (m) s = `${m[1]} ${m[2]}/${m[3]}`
  if (Object.prototype.hasOwnProperty.call(SICOE_VARILLA_PESOS_KG_M, s)) return s
  if (ALIASES[s]) return ALIASES[s]
  const compact = s.replace(/\s+/g, '')
  for (const canon of SICOE_VARILLA_DIAMETROS) {
    if (canon.replace(/\s+/g, '') === compact) return canon
  }
  return null
}

export function sicoePesoKgMPorDiametro(diametro) {
  const canon = sicoeNormalizarDiametroVarilla(diametro)
  if (!canon) return null
  return SICOE_VARILLA_PESOS_KG_M[canon]
}

/** Peso kg/m con 3 decimales (p. ej. 0.994). */
export function sicoeFmtPesoKgM(peso, { empty = '—' } = {}) {
  if (peso == null || peso === '' || !Number.isFinite(Number(peso))) return empty
  return Number(peso).toFixed(3)
}

export function sicoeDiametrosValidosMsg() {
  return SICOE_VARILLA_DIAMETROS.join(', ')
}

export function sicoeFmtDiametroDisplay(diametro, { empty = '—' } = {}) {
  const canon = sicoeNormalizarDiametroVarilla(diametro)
  if (canon) return `Ø ${canon}`
  const s = String(diametro || '').trim()
  return s ? `Ø ${s}` : empty
}

export function sicoeEsVarillaRegistro(reg) {
  return reg?.es_varilla === true
}

export function sicoeKgPendienteRecaptura(reg) {
  if (!reg) return false
  if (!sicoeUnidadEsKg(reg.unidad)) return false
  return reg.es_varilla == null
}

function _empty(v) {
  return v === '' || v === null || v === undefined
}

function _toFactor(v) {
  if (_empty(v)) return 1
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Longitud × Peso × Cantidad con redondeo dinámico SICOE. */
export function calcularCantidadVarilla(longitud, pesoKgM, cantidad) {
  if (_empty(longitud) && _empty(pesoKgM) && _empty(cantidad)) return 0
  const lv = _toFactor(longitud)
  const pv = _toFactor(pesoKgM)
  const cv = _toFactor(cantidad)
  if ([lv, pv, cv].some((n) => Number.isNaN(n))) return 0
  return redondearCantidadTotalDinamico(lv * pv * cv)
}

/**
 * Calcula Cant Total según esquema del registro.
 * @param {{ es_varilla?: boolean|null, longitud?: any, ancho?: any, espesor?: any, cantidad?: any, peso_kg_m?: any, diametro_varilla?: any }} opts
 */
export function calcularCantidadRegistro(opts = {}) {
  if (opts.es_varilla === true) {
    // Preferir tabla NTC (3 dp) por diámetro; fallback a peso guardado.
    let peso = sicoePesoKgMPorDiametro(opts.diametro_varilla)
    if (_empty(peso)) peso = opts.peso_kg_m
    return calcularCantidadVarilla(opts.longitud, peso, opts.cantidad)
  }
  return calcularCantidadConRedondeo(opts.longitud, opts.ancho, opts.espesor, opts.cantidad)
}

/** Encabezados de columnas de medición según los registros visibles. */
export function sicoeHeadersMedicion(regs) {
  const list = Array.isArray(regs) ? regs : []
  const tieneVarilla = list.some((r) => sicoeEsVarillaRegistro(r))
  if (!tieneVarilla) {
    return {
      long: 'Long',
      col2: 'Ancho',
      col3: 'Espesor',
      cant: 'Cantidad',
      cantTot: 'Cant. Total',
      modo: 'estandar',
    }
  }
  const soloVarilla = list.length > 0 && list.every((r) => sicoeEsVarillaRegistro(r))
  if (soloVarilla) {
    return {
      long: 'Long',
      col2: 'Ø',
      col3: 'kg/m',
      cant: 'Cantidad',
      cantTot: 'Cant. Total',
      modo: 'varilla',
    }
  }
  return {
    long: 'Long',
    col2: 'Ancho/Ø',
    col3: 'Esp./kg/m',
    cant: 'Cantidad',
    cantTot: 'Cant. Total',
    modo: 'mixto',
  }
}

/** Valores de celda col2/col3 según esquema del registro. */
export function sicoeMedicionCeldasDisplay(reg) {
  if (sicoeEsVarillaRegistro(reg)) {
    const pesoTabla = sicoePesoKgMPorDiametro(reg.diametro_varilla)
    const peso = pesoTabla != null
      ? pesoTabla
      : (reg.peso_kg_m != null && reg.peso_kg_m !== '' ? Number(reg.peso_kg_m) : null)
    return {
      col2: sicoeFmtDiametroDisplay(reg.diametro_varilla),
      col3: peso != null && Number.isFinite(peso) ? sicoeFmtPesoKgM(peso) : '—',
      esVarilla: true,
    }
  }
  return {
    col2: reg?.ancho,
    col3: reg?.espesor,
    esVarilla: false,
  }
}

export function sicoeValidarDiametroOError(diametro) {
  const canon = sicoeNormalizarDiametroVarilla(diametro)
  if (canon) return { ok: true, diametro: canon, peso: SICOE_VARILLA_PESOS_KG_M[canon] }
  return {
    ok: false,
    error: `Diámetro no válido. Diámetros aceptados (pulgadas): ${sicoeDiametrosValidosMsg()}.`,
  }
}

export { redondearDimension }
