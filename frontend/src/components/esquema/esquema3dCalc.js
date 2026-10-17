/**
 * Cálculos de volumen 3D del esquema: líneas suma/descuento sobre sólidos.
 * Dinámicos mientras el editor está abierto; se fijan al exportar/cerrar.
 * Descuento: solo el volumen común con los sólidos que suman.
 */
import {
  formatVolumeM3,
  intersectionVolumeM3,
  mergeSolidsUnion,
  solidVolumeM3,
} from './esquema3dSolids.js'
import { worldToMeters, polygonAreaM2 } from './esquemaGeometry.js'

const SHARED_VOL_EPS = 1e-6

function uid(prefix = 'calc') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Sólido válido para participar en un cálculo. */
export function isValidCalcSolid(solid) {
  if (!solid || solid.type !== 'solid3d') return false
  if (!Array.isArray(solid.cells) || !solid.cells.length) return false
  const v = solidVolumeM3(solid)
  return Number.isFinite(v) && v >= 0
}

export function createVolumeCalc(nombre = 'Cálculo') {
  return {
    id: uid('vc'),
    nombre: String(nombre || 'Cálculo').trim() || 'Cálculo',
    lines: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * @param {'sum'|'subtract'} op
 */
export function createCalcLine({ solidId, nombre, op = 'sum' } = {}) {
  return {
    id: uid('vl'),
    solidId: solidId || null,
    nombre: String(nombre || '').trim() || 'Elemento',
    op: op === 'subtract' ? 'subtract' : 'sum',
  }
}

/**
 * Sólidos del cálculo con operación Suma (válidos), excluyendo opcionalmente un id.
 */
export function sumSolidsOfCalc(calc, solids, exceptSolidId = null) {
  const out = []
  for (const line of calc?.lines || []) {
    if (line.op !== 'sum') continue
    if (!line.solidId || line.solidId === exceptSolidId) continue
    const solid = (solids || []).find((s) => s.id === line.solidId)
    if (isValidCalcSolid(solid)) out.push(solid)
  }
  return out
}

/**
 * Volumen común entre un sólido a descontar y la unión de los que suman.
 * @returns {{ sharedM3: number, fullM3: number, error?: string }}
 */
export function sharedDiscountVolumeM3(discountSolid, calc, solids) {
  const fullM3 = solidVolumeM3(discountSolid)
  const sums = sumSolidsOfCalc(calc, solids, discountSolid?.id)
  if (!sums.length) {
    return {
      sharedM3: 0,
      fullM3,
      error: 'No hay un sólido que sume para descontar volumen común.',
    }
  }
  const united = mergeSolidsUnion(sums)
  if (!united) {
    return { sharedM3: 0, fullM3, error: 'No se pudo evaluar el volumen que suma.' }
  }
  let sharedM3 = intersectionVolumeM3(discountSolid, united)
  if (!(sharedM3 > SHARED_VOL_EPS)) {
    return {
      sharedM3: 0,
      fullM3,
      error: 'El sólido no comparte volumen con los que suman; no se puede descontar.',
    }
  }
  // Contención casi total (p. ej. cilindro tessellado dentro de prisma): usar volumen exacto del sólido.
  if (fullM3 > SHARED_VOL_EPS && sharedM3 >= fullM3 * 0.98) {
    sharedM3 = fullM3
  } else {
    sharedM3 = Math.min(sharedM3, fullM3)
  }
  return { sharedM3, fullM3 }
}

/**
 * Resuelve una línea contra el catálogo actual de sólidos (dinámico).
 * Descuenta solo el volumen común con los sólidos que suman del mismo cálculo.
 * @returns {{ ok: true, volumeM3: number, signedM3: number, solid: object, shared?: boolean } | { ok: false, error: string }}
 */
export function resolveCalcLine(line, solids, calc = null) {
  if (!line?.solidId) return { ok: false, error: 'Seleccione un sólido.' }
  const solid = (solids || []).find((s) => s.id === line.solidId)
  if (!isValidCalcSolid(solid)) {
    return { ok: false, error: 'Seleccione un sólido cerrado y bien construido.' }
  }
  if (line.op === 'subtract') {
    const ctx = calc || { lines: [] }
    const { sharedM3, error } = sharedDiscountVolumeM3(solid, ctx, solids)
    if (error || !(sharedM3 > SHARED_VOL_EPS)) {
      return { ok: false, error: error || 'Sin volumen común para descontar.' }
    }
    return {
      ok: true,
      volumeM3: sharedM3,
      signedM3: -sharedM3,
      solid,
      shared: true,
    }
  }
  const volumeM3 = solidVolumeM3(solid)
  return { ok: true, volumeM3, signedM3: volumeM3, solid }
}

/** Total de un cálculo (m³) con los sólidos actuales. */
export function calcTotalM3(calc, solids) {
  let total = 0
  for (const line of calc?.lines || []) {
    const r = resolveCalcLine(line, solids, calc)
    if (r.ok) total += r.signedM3
  }
  return total
}

/**
 * Snapshot fijo de un cálculo (al guardar/cerrar).
 * Congela volúmenes y metadatos de cada elemento.
 */
export function freezeCalcSnapshot(calc, solids) {
  const lines = []
  for (const line of calc?.lines || []) {
    const r = resolveCalcLine(line, solids, calc)
    if (!r.ok) {
      lines.push({
        id: line.id,
        nombre: line.nombre,
        op: line.op,
        solidId: line.solidId,
        ok: false,
        error: r.error,
        volumeM3: 0,
        signedM3: 0,
        detail: null,
      })
      continue
    }
    const detail = describeSolidForMemoria(r.solid)
    if (detail && line.op === 'subtract' && r.shared) {
      detail.volumeM3 = r.volumeM3
      const full = solidVolumeM3(r.solid)
      // Solo reemplazar la fórmula si el descuento es parcial (no cabe entero).
      if (full > SHARED_VOL_EPS && r.volumeM3 < full * 0.98) {
        detail.formaCalculo = `Volumen común = ${fmt(r.volumeM3)} m³`
      }
    }
    lines.push({
      id: line.id,
      nombre: line.nombre,
      op: line.op,
      solidId: line.solidId,
      ok: true,
      volumeM3: r.volumeM3,
      signedM3: r.signedM3,
      detail,
    })
  }
  const totalM3 = lines.reduce((s, l) => s + (l.ok ? l.signedM3 : 0), 0)
  return {
    id: calc.id,
    nombre: calc.nombre,
    createdAt: calc.createdAt,
    frozenAt: new Date().toISOString(),
    lines,
    totalM3,
  }
}

function cellAreaM2Local(cell) {
  if (!cell) return 0
  if (cell.analytic?.type === 'rect') {
    return Math.abs(cell.analytic.wM) * Math.abs(cell.analytic.hM)
  }
  if (cell.analytic?.type === 'ellipse') {
    return Math.PI * Math.abs(cell.analytic.rxM) * Math.abs(cell.analytic.ryM)
  }
  if (cell.analytic?.type === 'triangle') {
    return 0.5 * Math.abs(cell.analytic.baseM) * Math.abs(cell.analytic.heightM)
  }
  let a = polygonAreaM2(cell.ring || [])
  for (const hole of cell.holes || []) a -= polygonAreaM2(hole)
  return Math.max(0, a)
}

/** Altura resultante (m) a partir de cotas textuales; null si no es válida. */
export function alturaFromCotasText(cotaSuperior, cotaInferior) {
  const a = Number(String(cotaSuperior ?? '').trim().replace(',', '.'))
  const b = Number(String(cotaInferior ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a <= b) return null
  return a - b
}

/** Formato decimal es-CO (coma) para memoria de cálculo legible. */
export function fmtMemoria(n, d = 2) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(d).replace('.', ',')
}

function fmt(n, d = 2) {
  return fmtMemoria(n, d)
}

/** Descripción textual para la memoria de cálculo. */
export function describeSolidForMemoria(solid) {
  if (!isValidCalcSolid(solid)) return null
  const cells = solid.cells || []
  const z0 = Math.min(...cells.map((c) => Number(c.z0) || 0))
  const z1 = Math.max(...cells.map((c) => Number(c.z1) || 0))
  const heightM = Math.abs(z1 - z0)
  const volumeM3 = solidVolumeM3(solid)

  // Una sola celda analítica → forma exacta
  if (cells.length === 1) {
    const c = cells[0]
    const area = cellAreaM2Local(c)
    const h = Math.abs((Number(c.z1) || 0) - (Number(c.z0) || 0))
    const cotaInf = Math.min(Number(c.z0) || 0, Number(c.z1) || 0)
    const cotaSup = Math.max(Number(c.z0) || 0, Number(c.z1) || 0)
    if (c.analytic?.type === 'rect') {
      const w = Math.abs(c.analytic.wM)
      const ht = Math.abs(c.analytic.hM)
      return {
        forma: 'Prisma rectangular',
        dimensiones: `${fmt(w)} × ${fmt(ht)} m`,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        formaCalculo: `${fmt(w)} × ${fmt(ht)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
        volumeM3,
      }
    }
    if (c.analytic?.type === 'ellipse') {
      const rx = Math.abs(c.analytic.rxM)
      const ry = Math.abs(c.analytic.ryM)
      const circ = Math.abs(rx - ry) < 1e-9
      return {
        forma: circ ? 'Cilindro' : 'Prisma elíptico',
        dimensiones: circ ? `Ø ${fmt(rx * 2)} m` : `rx ${fmt(rx)} × ry ${fmt(ry)} m`,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        // Formato pedido: π × 0,85² × 2,00 = 4,54 m³
        formaCalculo: circ
          ? `π × ${fmt(rx)}² × ${fmt(h)} = ${fmt(volumeM3)} m³`
          : `π × ${fmt(rx)} × ${fmt(ry)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
        volumeM3,
      }
    }
    if (c.analytic?.type === 'triangle') {
      const b = Math.abs(c.analytic.baseM)
      const th = Math.abs(c.analytic.heightM)
      return {
        forma: 'Prisma triangular',
        dimensiones: `base ${fmt(b)} × altura ${fmt(th)} m`,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        formaCalculo: `(${fmt(b)} × ${fmt(th)} / 2) × ${fmt(h)} = ${fmt(volumeM3)} m³`,
        volumeM3,
      }
    }
    // Polígono / booleano parcial
    const ring = c.ring || []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of ring) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const wM = worldToMeters(Math.max(0, maxX - minX))
    const hM = worldToMeters(Math.max(0, maxY - minY))
    return {
      forma: (c.holes || []).length ? 'Sólido con huecos' : 'Prisma poligonal',
      dimensiones: `envolvente ${fmt(wM)} × ${fmt(hM)} m · área ${fmt(area)} m²`,
      cotaSuperior: cotaSup,
      cotaInferior: cotaInf,
      altura: h,
      formaCalculo: `${fmt(area)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
      volumeM3,
    }
  }

  // Varias celdas (unión / sustracción / corte)
  return {
    forma: 'Sólido compuesto',
    dimensiones: `${cells.length} cuerpo(s)`,
    cotaSuperior: z1,
    cotaInferior: z0,
    altura: heightM,
    formaCalculo: `Suma de volúmenes de celdas = ${fmt(volumeM3)} m³`,
    volumeM3,
  }
}

export { formatVolumeM3, solidVolumeM3 }
