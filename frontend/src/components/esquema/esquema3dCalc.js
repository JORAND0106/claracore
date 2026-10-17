/**
 * Cálculos de volumen 3D del esquema: líneas suma/descuento sobre sólidos.
 * Dinámicos mientras el editor está abierto; se fijan al exportar/cerrar.
 * Descuento: volumen común con el sólido indicado en "Descuenta de"
 * (aporte neto si ese sólido tiene a su vez descuentos).
 */
import {
  formatVolumeM3,
  intersectionVolumeM3,
  lengthMatchingVolumeM3,
  mergeSolidsUnion,
  round2,
  solidFootprintDimsM,
  solidVolumeM3,
} from './esquema3dSolids.js'
import { polygonAreaM2 } from './esquemaGeometry.js'

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
 * @param {string|null} [discountFromSolidId] sólido del que se descuenta (op subtract)
 */
export function createCalcLine({ solidId, nombre, op = 'sum', discountFromSolidId = null } = {}) {
  return {
    id: uid('vl'),
    solidId: solidId || null,
    // Nombre vacío por defecto: el usuario debe nombrarlo (memoria legible).
    nombre: nombre == null ? '' : String(nombre).trim(),
    op: op === 'subtract' ? 'subtract' : 'sum',
    discountFromSolidId: op === 'subtract' ? (discountFromSolidId || null) : null,
  }
}

/** ¿La línea de cálculo tiene nombre usable? */
export function calcLineHasNombre(line) {
  return !!(line && String(line.nombre || '').trim())
}

/** Última línea del cálculo activo sin nombre (bloquea agregar otra). */
export function lastCalcLineNeedsNombre(calc) {
  const lines = calc?.lines || []
  if (!lines.length) return null
  const last = lines[lines.length - 1]
  return calcLineHasNombre(last) ? null : last
}

/** Algún cálculo tiene elementos sin nombre (bloquea guardar). */
export function volumeCalcsHaveUnnamed(calcs) {
  for (const c of calcs || []) {
    for (const line of c.lines || []) {
      if (!calcLineHasNombre(line)) return true
    }
  }
  return false
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

/** ¿El solidId participa como línea Suma en el cálculo? */
export function isSumSolidId(calc, solidId) {
  if (!solidId) return false
  return (calc?.lines || []).some((l) => l.op === 'sum' && l.solidId === solidId)
}

/**
 * Volumen común entre un sólido a descontar y la unión de los que suman (compat).
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
  if (fullM3 > SHARED_VOL_EPS && sharedM3 >= fullM3 * 0.98) {
    sharedM3 = fullM3
  } else {
    sharedM3 = Math.min(sharedM3, fullM3)
  }
  return { sharedM3, fullM3 }
}

/**
 * Volumen neto de un sólido tras descuentos que apuntan a él
 * (aritmética con valores a 2 decimales).
 */
export function netVolumeOfSolidId(solidId, calc, solids, stack = null) {
  const solid = (solids || []).find((s) => s.id === solidId)
  if (!isValidCalcSolid(solid)) return 0
  const visiting = stack || new Set()
  if (visiting.has(solidId)) return round2(solidVolumeM3(solid))
  visiting.add(solidId)
  let net = round2(solidVolumeM3(solid))
  for (const line of calc?.lines || []) {
    if (line.op !== 'subtract' || line.discountFromSolidId !== solidId) continue
    if (!line.solidId || line.solidId === solidId) continue
    const amt = discountAmountM3(line, solids, calc, visiting)
    if (amt.ok) net = round2(net - round2(amt.amountM3))
  }
  visiting.delete(solidId)
  return Math.max(0, net)
}

/**
 * Cantidad a descontar de la línea respecto a su sólido indicado (o suma legacy).
 * @returns {{ ok: true, amountM3: number, targetSolid?: object, shared?: boolean } | { ok: false, error: string }}
 */
export function discountAmountM3(line, solids, calc, stack = null) {
  const discount = (solids || []).find((s) => s.id === line?.solidId)
  if (!isValidCalcSolid(discount)) {
    return { ok: false, error: 'Seleccione un sólido cerrado y bien construido.' }
  }
  const fullM3 = solidVolumeM3(discount)
  const targetId = line.discountFromSolidId || null

  if (targetId) {
    if (targetId === line.solidId) {
      return { ok: false, error: 'No se puede descontar un sólido de sí mismo.' }
    }
    const target = (solids || []).find((s) => s.id === targetId)
    if (!isValidCalcSolid(target)) {
      return { ok: false, error: 'Seleccione de qué sólido se descuenta.' }
    }
    let sharedM3 = intersectionVolumeM3(discount, target)
    if (fullM3 > SHARED_VOL_EPS && sharedM3 >= fullM3 * 0.98) {
      sharedM3 = fullM3
    }
    if (!(sharedM3 > SHARED_VOL_EPS)) {
      return {
        ok: false,
        error: 'El sólido no comparte volumen con el indicado; no se descuenta.',
      }
    }
    // Aporte neto del elemento que descuenta si tiene descuentos propios.
    const visiting = stack || new Set()
    const netD = netVolumeOfSolidId(discount.id, calc, solids, visiting)
    if (sharedM3 >= fullM3 * 0.98) {
      sharedM3 = netD
    } else {
      sharedM3 = Math.min(round2(sharedM3), netD)
    }
    if (!(sharedM3 > SHARED_VOL_EPS)) {
      return { ok: false, error: 'Sin volumen neto para descontar.' }
    }
    return { ok: true, amountM3: round2(sharedM3), targetSolid: target, shared: true }
  }

  // Compat: sin "Descuenta de" → volumen común con la unión de sumas.
  const { sharedM3, error } = sharedDiscountVolumeM3(discount, calc || { lines: [] }, solids)
  if (error || !(sharedM3 > SHARED_VOL_EPS)) {
    return { ok: false, error: error || 'Sin volumen común para descontar.' }
  }
  return { ok: true, amountM3: round2(sharedM3), shared: true }
}

/**
 * Resuelve una línea contra el catálogo actual de sólidos (dinámico).
 * @returns {{ ok: true, volumeM3: number, signedM3: number, solid: object, shared?: boolean, targetSolid?: object, countsInTotal?: boolean } | { ok: false, error: string }}
 */
export function resolveCalcLine(line, solids, calc = null) {
  if (!line?.solidId) return { ok: false, error: 'Seleccione un sólido.' }
  const solid = (solids || []).find((s) => s.id === line.solidId)
  if (!isValidCalcSolid(solid)) {
    return { ok: false, error: 'Seleccione un sólido cerrado y bien construido.' }
  }
  if (line.op === 'subtract') {
    const ctx = calc || { lines: [] }
    const amt = discountAmountM3(line, solids, ctx)
    if (!amt.ok) return { ok: false, error: amt.error }
    // Anidado: descuenta de otro Descuenta → no suma otra vez al total global.
    const countsInTotal = !line.discountFromSolidId || isSumSolidId(ctx, line.discountFromSolidId)
    return {
      ok: true,
      volumeM3: amt.amountM3,
      signedM3: -amt.amountM3,
      solid,
      shared: true,
      targetSolid: amt.targetSolid || null,
      countsInTotal,
    }
  }
  const volumeM3 = round2(solidVolumeM3(solid))
  return { ok: true, volumeM3, signedM3: volumeM3, solid, countsInTotal: true }
}

/** Total de un cálculo (m³): suma exacta de los valores redondeados a 2 decimales. */
export function calcTotalM3(calc, solids) {
  let total = 0
  for (const line of calc?.lines || []) {
    const r = resolveCalcLine(line, solids, calc)
    if (!r.ok) continue
    if (r.countsInTotal === false) continue
    total = round2(total + round2(r.signedM3))
  }
  return total
}

/** Dimensiones legibles + fórmula natural a partir de operandSnapshot / formMeta. */
export function naturalFormulaFromOperand(op) {
  if (!op) return { dimensiones: null, formula: null, forma: 'Sólido' }
  const v = op.volumeM3
  const fm = op.formMeta
  if (fm?.kind === 'cylinder' && fm.rxM > 0) {
    const area = Math.PI * fm.rxM * fm.rxM
    const L = lengthMatchingVolumeM3(area, v, fm.effectiveLengthM ?? fm.lengthM)
      ?? (fm.effectiveLengthM ?? fm.lengthM)
    const d = fm.diameterM ?? (fm.rxM * 2)
    return {
      forma: 'Cilindro',
      dimensiones: `Ø ${fmt(d)} m · L ${fmt(L)} m`,
      formula: `π × ${fmt(fm.rxM)}² × ${fmt(L)}`,
      formaCalculo: `π × ${fmt(fm.rxM)}² × ${fmt(L)} = ${fmt(v)} m³`,
    }
  }
  if (fm?.kind === 'elliptic_prism' && fm.rxM > 0) {
    const area = Math.PI * fm.rxM * fm.ryM
    const L = lengthMatchingVolumeM3(area, v, fm.effectiveLengthM ?? fm.lengthM)
      ?? (fm.effectiveLengthM ?? fm.lengthM)
    return {
      forma: 'Prisma elíptico',
      dimensiones: `rx ${fmt(fm.rxM)} · ry ${fmt(fm.ryM)} · L ${fmt(L)} m`,
      formula: `π × ${fmt(fm.rxM)} × ${fmt(fm.ryM)} × ${fmt(L)}`,
      formaCalculo: `π × ${fmt(fm.rxM)} × ${fmt(fm.ryM)} × ${fmt(L)} = ${fmt(v)} m³`,
    }
  }
  if (fm?.kind === 'rect_prism' && fm.wM > 0) {
    const L = fm.lengthM
    return {
      forma: 'Prisma rectangular',
      dimensiones: `${fmt(fm.wM)} × ${fmt(fm.hM)} × ${fmt(L)} m`,
      formula: `${fmt(fm.wM)} × ${fmt(fm.hM)} × ${fmt(L)}`,
      formaCalculo: `${fmt(fm.wM)} × ${fmt(fm.hM)} × ${fmt(L)} = ${fmt(v)} m³`,
    }
  }
  const a = op.analytic
  const h = op.espesorM
  if (a?.type === 'rect' && Number.isFinite(a.wM) && Number.isFinite(a.hM) && Number.isFinite(h)) {
    const w = Math.abs(a.wM)
    const ht = Math.abs(a.hM)
    return {
      forma: 'Prisma rectangular',
      dimensiones: `${fmt(w)} × ${fmt(ht)} × ${fmt(h)} m`,
      formula: `${fmt(w)} × ${fmt(ht)} × ${fmt(h)}`,
      formaCalculo: `${fmt(w)} × ${fmt(ht)} × ${fmt(h)} = ${fmt(v)} m³`,
    }
  }
  if (a?.type === 'ellipse' && Number.isFinite(a.rxM) && Number.isFinite(h)) {
    const rx = Math.abs(a.rxM)
    const ry = Math.abs(a.ryM)
    const area = Math.PI * rx * ry
    const L = lengthMatchingVolumeM3(area, v, h) ?? h
    if (Math.abs(rx - ry) < 1e-9) {
      return {
        forma: 'Cilindro',
        dimensiones: `Ø ${fmt(rx * 2)} m · L ${fmt(L)} m`,
        formula: `π × ${fmt(rx)}² × ${fmt(L)}`,
        formaCalculo: `π × ${fmt(rx)}² × ${fmt(L)} = ${fmt(v)} m³`,
      }
    }
    return {
      forma: 'Prisma elíptico',
      dimensiones: `rx ${fmt(rx)} · ry ${fmt(ry)} · L ${fmt(L)} m`,
      formula: `π × ${fmt(rx)} × ${fmt(ry)} × ${fmt(L)}`,
      formaCalculo: `π × ${fmt(rx)} × ${fmt(ry)} × ${fmt(L)} = ${fmt(v)} m³`,
    }
  }
  if (Number.isFinite(op.longM) && Number.isFinite(op.anchM) && Number.isFinite(h)) {
    return {
      forma: 'Prisma rectangular',
      dimensiones: `${fmt(op.longM)} × ${fmt(op.anchM)} × ${fmt(h)} m`,
      formula: `${fmt(op.longM)} × ${fmt(op.anchM)} × ${fmt(h)}`,
      formaCalculo: `${fmt(op.longM)} × ${fmt(op.anchM)} × ${fmt(h)} = ${fmt(v)} m³`,
    }
  }
  return {
    forma: 'Sólido',
    dimensiones: null,
    formula: `Volumen = ${fmt(v)}`,
    formaCalculo: `Volumen = ${fmt(v)} m³`,
  }
}

function formaCalculoFromOperand(op) {
  return naturalFormulaFromOperand(op).formaCalculo
}

function detailFromOperand(op, overrides = {}) {
  if (!op) return null
  const nat = naturalFormulaFromOperand(op)
  return {
    color: op.color || '#0f766e',
    longM: op.longM,
    anchM: op.anchM,
    espesorM: op.espesorM,
    cotaSuperior: op.cotaSuperior,
    cotaInferior: op.cotaInferior,
    altura: op.espesorM,
    volumeM3: op.volumeM3,
    forma: overrides.forma || nat.forma,
    dimensiones: overrides.dimensiones || nat.dimensiones,
    formula: overrides.formula || nat.formula,
    formaCalculo: overrides.formaCalculo || nat.formaCalculo,
    ...overrides,
  }
}

/**
 * Filas de memoria para un sólido con booleanMeta (sustracción).
 * Numeración N, N.1, N.2… mismo color.
 */
export function breakdownRowsForBooleanSolid(solid, {
  num,
  nombre,
  op,
  signedM3,
  discountFromNombre = null,
} = {}) {
  const meta = solid?.booleanMeta
  if (!meta || meta.op !== 'subtract' || !meta.base) return null
  const color = solid.color || meta.base.color || '#0f766e'
  const rows = []
  const baseVol = round2(meta.base.volumeM3)
  const natExt = naturalFormulaFromOperand(meta.base)
  rows.push({
    numLabel: String(num),
    num,
    subIndex: 0,
    solidId: solid.id,
    nombre: `${nombre || 'Sólido'} (exterior)`,
    op: 'sum',
    volumeM3: baseVol,
    signedM3: baseVol,
    countsInTotal: false,
    color,
    discountFromNombre: null,
    detail: detailFromOperand(meta.base, {
      color,
      forma: natExt.forma || 'Volumen exterior',
      dimensiones: natExt.dimensiones,
      formula: natExt.formula,
      formaCalculo: natExt.formaCalculo,
    }),
  })
  let subI = 1
  for (const sub of meta.subtracted || []) {
    const v = round2(sub.volumeM3)
    const nat = naturalFormulaFromOperand(sub)
    const subName = sub.nombre || (nat.forma === 'Cilindro' ? 'Pase' : 'Vacío interior')
    rows.push({
      numLabel: `${num}.${subI}`,
      num,
      subIndex: subI,
      solidId: solid.id,
      nombre: subName,
      op: 'subtract',
      volumeM3: v,
      signedM3: -v,
      countsInTotal: false,
      color,
      discountFromNombre: nombre || 'Sólido base',
      detail: detailFromOperand(sub, {
        color,
        forma: nat.forma,
        dimensiones: nat.dimensiones,
        formula: nat.formula,
        formaCalculo: nat.formaCalculo,
      }),
    })
    subI += 1
  }
  const net = round2(meta.netVolumeM3 ?? solidVolumeM3(solid))
  const netSigned = op === 'subtract' ? -net : net
  // Fórmula por números de fila: "3 − 3.1" (sin medidas engañosas).
  const netParts = [String(num), ...Array.from({ length: subI - 1 }, (_, i) => `${num}.${i + 1}`)]
  const netOpLabel = netParts.join(' − ')
  rows.push({
    numLabel: `${num}.${subI}`,
    num,
    subIndex: subI,
    solidId: solid.id,
    nombre: `${nombre || 'Sólido'} (neto)`,
    op,
    volumeM3: net,
    signedM3: netSigned,
    countsInTotal: true,
    isNetRow: true,
    netOpLabel,
    color,
    discountFromNombre: op === 'subtract' ? discountFromNombre : null,
    detail: {
      color,
      longM: null,
      anchM: null,
      espesorM: null,
      volumeM3: net,
      forma: 'Volumen neto',
      formaCalculo: `${netOpLabel} = ${fmt(net)} m³`,
    },
  })
  return rows
}

/**
 * Desglose cuando un sólido tiene líneas hijas que descuentan de él (sin Sustraer).
 */
export function breakdownRowsForNestedDiscount(parentLine, parentResolved, calc, solids, num) {
  const children = (calc?.lines || []).filter(
    (l) => l.op === 'subtract' && l.discountFromSolidId === parentLine.solidId,
  )
  if (!children.length || !parentResolved?.ok) return null
  const color = parentResolved.solid?.color || parentResolved.detail?.color || '#0f766e'
  const full = round2(solidVolumeM3(parentResolved.solid))
  const rows = []
  rows.push({
    numLabel: String(num),
    num,
    subIndex: 0,
    solidId: parentLine.solidId,
    nombre: `${parentLine.nombre} (exterior)`,
    op: 'sum',
    volumeM3: full,
    signedM3: full,
    countsInTotal: false,
    color,
    discountFromNombre: null,
    detail: {
      ...(parentResolved.detail || {}),
      color,
      volumeM3: full,
      forma: 'Volumen exterior',
      formaCalculo: parentResolved.detail?.formaCalculo || `Volumen = ${fmt(full)} m³`,
    },
  })
  let subI = 1
  let deducted = 0
  for (const ch of children) {
    const r = resolveCalcLine(ch, solids, calc)
    if (!r.ok) continue
    const v = round2(r.volumeM3)
    deducted = round2(deducted + v)
    rows.push({
      numLabel: `${num}.${subI}`,
      num,
      subIndex: subI,
      solidId: ch.solidId,
      lineId: ch.id,
      nombre: ch.nombre || 'Descuento',
      op: 'subtract',
      volumeM3: v,
      signedM3: -v,
      countsInTotal: false,
      color,
      discountFromNombre: parentLine.nombre,
      detail: {
        ...(describeSolidForMemoria(r.solid) || {}),
        color,
        volumeM3: v,
        formaCalculo: describeSolidForMemoria(r.solid)?.formaCalculo || `Volumen = ${fmt(v)} m³`,
      },
    })
    subI += 1
  }
  const net = round2(full - deducted)
  const netSigned = parentLine.op === 'subtract' ? -net : net
  const targetName = parentLine.discountFromSolidId
    ? ((calc?.lines || []).find((l) => l.solidId === parentLine.discountFromSolidId)?.nombre || null)
    : null
  const netParts = [String(num), ...Array.from({ length: subI - 1 }, (_, i) => `${num}.${i + 1}`)]
  const netOpLabel = netParts.join(' − ')
  rows.push({
    numLabel: `${num}.${subI}`,
    num,
    subIndex: subI,
    solidId: parentLine.solidId,
    nombre: `${parentLine.nombre} (neto)`,
    op: parentLine.op,
    volumeM3: net,
    signedM3: netSigned,
    countsInTotal: true,
    isNetRow: true,
    netOpLabel,
    color,
    discountFromNombre: parentLine.op === 'subtract' ? targetName : null,
    detail: {
      color,
      longM: null,
      anchM: null,
      espesorM: null,
      volumeM3: net,
      forma: 'Volumen neto',
      formaCalculo: `${netOpLabel} = ${fmt(net)} m³`,
    },
  })
  return rows
}

/**
 * Snapshot fijo de un cálculo (al guardar/cerrar).
 * Congela volúmenes, desglose por sólido y total = suma de valores mostrados.
 */
export function freezeCalcSnapshot(calc, solids) {
  const lines = []
  const memoriaRows = []
  let displayNum = 0
  const childLineIds = new Set()

  // Líneas que solo sirven de desglose anidado (descuentan de un no-suma) se
  // expanden bajo el padre; no generan fila top-level propia.
  for (const line of calc?.lines || []) {
    if (line.op === 'subtract' && line.discountFromSolidId && !isSumSolidId(calc, line.discountFromSolidId)) {
      childLineIds.add(line.id)
    }
  }

  for (const line of calc?.lines || []) {
    if (childLineIds.has(line.id)) continue
    const r = resolveCalcLine(line, solids, calc)
    if (!r.ok) {
      lines.push({
        id: line.id,
        nombre: line.nombre,
        op: line.op,
        solidId: line.solidId,
        discountFromSolidId: line.discountFromSolidId || null,
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
      if (full > SHARED_VOL_EPS && r.volumeM3 < full * 0.98) {
        detail.formaCalculo = `Volumen común = ${fmt(r.volumeM3)} m³`
      }
    }
    const targetNombre = line.discountFromSolidId
      ? ((calc?.lines || []).find((l) => l.solidId === line.discountFromSolidId)?.nombre || null)
      : null
    lines.push({
      id: line.id,
      nombre: line.nombre,
      op: line.op,
      solidId: line.solidId,
      discountFromSolidId: line.discountFromSolidId || null,
      discountFromNombre: targetNombre,
      ok: true,
      volumeM3: r.volumeM3,
      signedM3: r.signedM3,
      detail,
    })

    displayNum += 1
    const boolRows = breakdownRowsForBooleanSolid(r.solid, {
      num: displayNum,
      nombre: line.nombre,
      op: line.op,
      signedM3: r.signedM3,
      discountFromNombre: targetNombre,
    })
    if (boolRows?.length) {
      memoriaRows.push(...boolRows)
      continue
    }
    // Desglose anidado solo si esta línea Descuenta y otras descuentan de ella
    // (p. ej. Box→Exc con Vacío→Box). No aplicar a Suma: sus descuentos ya
    // son filas top-level y no deben contarse dos veces.
    const nestedRows = line.op === 'subtract'
      ? breakdownRowsForNestedDiscount(line, { ...r, detail }, calc, solids, displayNum)
      : null
    if (nestedRows?.length) {
      memoriaRows.push(...nestedRows)
      continue
    }
    memoriaRows.push({
      numLabel: String(displayNum),
      num: displayNum,
      subIndex: 0,
      solidId: line.solidId,
      lineId: line.id,
      nombre: line.nombre,
      op: line.op,
      volumeM3: round2(r.volumeM3),
      signedM3: round2(r.signedM3),
      countsInTotal: r.countsInTotal !== false,
      color: detail?.color || r.solid?.color || '#0f766e',
      discountFromNombre: targetNombre,
      detail,
    })
  }

  // Total = suma de los valores que aparecen en la tabla (filas countsInTotal).
  let totalM3 = 0
  for (const row of memoriaRows) {
    if (!row.countsInTotal) continue
    const shown = row.op === 'subtract' ? -round2(row.volumeM3) : round2(row.volumeM3)
    totalM3 = round2(totalM3 + shown)
  }
  if (!memoriaRows.length) {
    totalM3 = calcTotalM3(calc, solids)
  }

  return {
    id: calc.id,
    nombre: calc.nombre,
    createdAt: calc.createdAt,
    frozenAt: new Date().toISOString(),
    lines,
    memoriaRows,
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

/** Descripción textual para la memoria (Dimensiones + Fórmula naturales). */
export function describeSolidForMemoria(solid) {
  if (!isValidCalcSolid(solid)) return null
  const cells = solid.cells || []
  const z0 = Math.min(...cells.map((c) => Number(c.z0) || 0))
  const z1 = Math.max(...cells.map((c) => Number(c.z1) || 0))
  const heightM = Math.abs(z1 - z0)
  const volumeM3 = solidVolumeM3(solid)
  const dims = solidFootprintDimsM(solid)
  const color = solid.color || '#0f766e'
  const base = {
    color,
    longM: dims.longM,
    anchM: dims.anchM,
    espesorM: dims.heightM || heightM,
    cotaSuperior: z1,
    cotaInferior: z0,
    altura: heightM,
    volumeM3,
  }

  if (solid.booleanMeta?.op === 'subtract' && solid.booleanMeta.base) {
    const meta = solid.booleanMeta
    const baseVol = round2(meta.base.volumeM3)
    const subs = (meta.subtracted || []).map((s) => fmt(round2(s.volumeM3)))
    const net = round2(meta.netVolumeM3 ?? volumeM3)
    const natBase = naturalFormulaFromOperand(meta.base)
    return {
      ...base,
      longM: meta.base.longM ?? base.longM,
      anchM: meta.base.anchM ?? base.anchM,
      espesorM: meta.base.espesorM ?? base.espesorM,
      forma: 'Sólido con huecos',
      dimensiones: natBase.dimensiones || (
        Number.isFinite(meta.base.longM)
          ? `${fmt(meta.base.longM)} × ${fmt(meta.base.anchM)} × ${fmt(meta.base.espesorM)} m`
          : null
      ),
      formula: `${fmt(baseVol)}${subs.length ? ` − ${subs.join(' − ')}` : ''}`,
      formaCalculo: `${fmt(baseVol)}${subs.length ? ` − ${subs.join(' − ')}` : ''} = ${fmt(net)} m³`,
    }
  }

  // formMeta (cilindro / prisma) aunque esté teselado en varias celdas.
  if (solid.formMeta) {
    const nat = naturalFormulaFromOperand({
      volumeM3,
      formMeta: solid.formMeta,
      espesorM: heightM,
      longM: dims.longM,
      anchM: dims.anchM,
      analytic: cells.length === 1 ? cells[0].analytic : null,
    })
    return {
      ...base,
      forma: nat.forma,
      dimensiones: nat.dimensiones,
      formula: nat.formula,
      formaCalculo: nat.formaCalculo,
      espesorM: solid.formMeta.lengthM ?? heightM,
      altura: solid.formMeta.lengthM ?? heightM,
    }
  }

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
      const formula = `${fmt(w)} × ${fmt(ht)} × ${fmt(h)}`
      return {
        ...base,
        forma: 'Prisma rectangular',
        dimensiones: `${fmt(w)} × ${fmt(ht)} × ${fmt(h)} m`,
        formula,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        espesorM: h,
        longM: w,
        anchM: ht,
        formaCalculo: `${formula} = ${fmt(volumeM3)} m³`,
      }
    }
    if (c.analytic?.type === 'ellipse') {
      const rx = Math.abs(c.analytic.rxM)
      const ry = Math.abs(c.analytic.ryM)
      const circ = Math.abs(rx - ry) < 1e-9
      const formula = circ
        ? `π × ${fmt(rx)}² × ${fmt(h)}`
        : `π × ${fmt(rx)} × ${fmt(ry)} × ${fmt(h)}`
      return {
        ...base,
        forma: circ ? 'Cilindro' : 'Prisma elíptico',
        dimensiones: circ
          ? `Ø ${fmt(rx * 2)} m · L ${fmt(h)} m`
          : `rx ${fmt(rx)} · ry ${fmt(ry)} · L ${fmt(h)} m`,
        formula,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        espesorM: h,
        longM: circ ? rx * 2 : rx * 2,
        anchM: circ ? rx * 2 : ry * 2,
        formaCalculo: `${formula} = ${fmt(volumeM3)} m³`,
      }
    }
    if (c.analytic?.type === 'triangle') {
      const b = Math.abs(c.analytic.baseM)
      const th = Math.abs(c.analytic.heightM)
      const formula = `(${fmt(b)} × ${fmt(th)} / 2) × ${fmt(h)}`
      return {
        ...base,
        forma: 'Prisma triangular',
        dimensiones: `base ${fmt(b)} × altura ${fmt(th)} · L ${fmt(h)} m`,
        formula,
        cotaSuperior: cotaSup,
        cotaInferior: cotaInf,
        altura: h,
        espesorM: h,
        longM: b,
        anchM: th,
        formaCalculo: `${formula} = ${fmt(volumeM3)} m³`,
      }
    }
    // Polígono / booleano parcial: área de la base × altura
    const formula = `${fmt(area)} × ${fmt(h)}`
    return {
      ...base,
      forma: (c.holes || []).length ? 'Sólido con huecos' : 'Prisma de base irregular',
      dimensiones: `Área base ${fmt(area)} m² · altura ${fmt(h)} m`,
      formula,
      cotaSuperior: cotaSup,
      cotaInferior: cotaInf,
      altura: h,
      espesorM: h,
      formaCalculo: `${formula} = ${fmt(volumeM3)} m³`,
    }
  }

  // Varias celdas (unión / sustracción / corte): envolvente máxima en planta.
  return {
    ...base,
    forma: 'Sólido unido',
    dimensiones: `${fmt(dims.longM)} × ${fmt(dims.anchM)} × ${fmt(heightM)} m`,
    formula: `Volumen = ${fmt(volumeM3)}`,
    formaCalculo: `Volumen exacto = ${fmt(volumeM3)} m³`,
  }
}

export { formatVolumeM3, solidVolumeM3, round2 }
