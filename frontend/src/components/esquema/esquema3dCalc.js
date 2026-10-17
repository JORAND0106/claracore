/**
 * Cálculos de volumen 3D del esquema: líneas suma/descuento sobre sólidos.
 * Dinámicos mientras el editor está abierto; se fijan al exportar/cerrar.
 */
import { solidVolumeM3, formatVolumeM3 } from './esquema3dSolids.js'
import { worldToMeters, polygonAreaM2 } from './esquemaGeometry.js'

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
 * Resuelve una línea contra el catálogo actual de sólidos (dinámico).
 * @returns {{ ok: true, volumeM3: number, signedM3: number, solid: object } | { ok: false, error: string }}
 */
export function resolveCalcLine(line, solids) {
  if (!line?.solidId) return { ok: false, error: 'Seleccione un sólido.' }
  const solid = (solids || []).find((s) => s.id === line.solidId)
  if (!isValidCalcSolid(solid)) {
    return { ok: false, error: 'Seleccione un sólido cerrado y bien construido.' }
  }
  const volumeM3 = solidVolumeM3(solid)
  const signedM3 = line.op === 'subtract' ? -volumeM3 : volumeM3
  return { ok: true, volumeM3, signedM3, solid }
}

/** Total de un cálculo (m³) con los sólidos actuales. */
export function calcTotalM3(calc, solids) {
  let total = 0
  for (const line of calc?.lines || []) {
    const r = resolveCalcLine(line, solids)
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
    const r = resolveCalcLine(line, solids)
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
    lines.push({
      id: line.id,
      nombre: line.nombre,
      op: line.op,
      solidId: line.solidId,
      ok: true,
      volumeM3: r.volumeM3,
      signedM3: r.signedM3,
      detail: describeSolidForMemoria(r.solid),
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

function fmt(n, d = 2) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(d)
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
        formaCalculo: `Área × altura = ${fmt(w)} × ${fmt(ht)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
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
        formaCalculo: circ
          ? `π r² h = π × ${fmt(rx)}² × ${fmt(h)} = ${fmt(volumeM3)} m³`
          : `π rx ry h = π × ${fmt(rx)} × ${fmt(ry)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
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
        formaCalculo: `(base × altura / 2) × h = (${fmt(b)} × ${fmt(th)} / 2) × ${fmt(h)} = ${fmt(volumeM3)} m³`,
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
      formaCalculo: `Área × altura = ${fmt(area)} × ${fmt(h)} = ${fmt(volumeM3)} m³`,
      volumeM3,
    }
  }

  // Varias celdas (unión / sustracción / corte)
  return {
    forma: 'Sólido compuesto',
    dimensiones: `${cells.length} cuerpo(s)`,
    cotaSuperior: z1,
    cotaInferior: z0,
    formaCalculo: `Suma de volúmenes de celdas = ${fmt(volumeM3)} m³ (altura envolvente ${fmt(heightM)} m)`,
    volumeM3,
  }
}

export { formatVolumeM3, solidVolumeM3 }
