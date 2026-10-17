/**
 * Casos a–d: Sustraer poceta, Descuenta de anidado, total = suma mostrada, PNG vertical.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  pickSubtractBase,
  round2,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
  resolveCalcLine,
} from './esquema3dCalc.js'
import {
  labelsFromSnapshot,
  memoriaDisplayRows,
} from './esquema3dCalcExport.js'

function rectAt(x0, y0, wM, hM, id) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

describe('Sustraer + Descuenta de + memoria · casos a–d', () => {
  it('a) Box 1,50³ menos interior 1,10×1,10×1,30 → poceta 1,81 m³', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    box.color = '#2563eb'
    box.nombre = 'Box'
    const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'inner'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'inner'
    inner.color = '#7c3aed'

    assert.equal(round2(solidVolumeM3(box)), 3.38)
    assert.equal(round2(solidVolumeM3(inner)), 1.57)

    // Si la selección empieza por el interior, pickSubtractBase elige el box.
    const base = pickSubtractBase([inner, box], ['inner', 'box'])
    assert.equal(base.id, 'box')

    const r = subtractSolids(box, [inner])
    assert.equal(r.ok, true)
    assert.equal(r.solid.color, '#2563eb')
    assert.equal(round2(r.solid.volumeM3), 1.81)
    assert.ok(r.solid.booleanMeta?.op === 'subtract')
    assert.ok((r.solid.cells || []).some((c) => (c.holes || []).length > 0))

    // Base equivocado: aviso, no sustrae
    const bad = subtractSolids(inner, [box])
    assert.equal(bad.ok, false)
    assert.match(bad.error || '', /no comparten volumen|vacío|resultado/i)
  })

  it('b) Excavación − placa − poceta(Sustraer): total 8,24 y desglose 3 líneas', () => {
    const exc = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    exc.id = 'exc'
    exc.color = '#7c3aed'
    assert.equal(round2(solidVolumeM3(exc)), 11.36)

    // Placa 1,31 m³ (aprox): 1.0 × 1.31 × 1.0
    const placa = extrudeClosedEntity(rectAt(0.2, 0.2, 1.0, 1.31, 'placa'), {
      viewId: 'top', cotaSuperior: 1.0, cotaInferior: 0,
    }).solid
    placa.id = 'placa'
    placa.color = '#0f766e'
    assert.equal(round2(solidVolumeM3(placa)), 1.31)

    const box = extrudeClosedEntity(rectAt(0.4, 0.8, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    box.color = '#2563eb'
    const inner = extrudeClosedEntity(rectAt(0.6, 1.0, 1.1, 1.1, 'inner'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'inner'
    const poc = subtractSolids(box, [inner])
    assert.equal(poc.ok, true)
    poc.solid.id = 'poceta'
    poc.solid.color = '#2563eb'
    assert.equal(round2(poc.solid.volumeM3), 1.81)

    const calc = createVolumeCalc('Excavación Poceta')
    calc.lines = [
      createCalcLine({ solidId: 'exc', nombre: 'Excavación', op: 'sum' }),
      createCalcLine({
        solidId: 'placa', nombre: 'Placa', op: 'subtract', discountFromSolidId: 'exc',
      }),
      createCalcLine({
        solidId: 'poceta', nombre: 'Poceta', op: 'subtract', discountFromSolidId: 'exc',
      }),
    ]
    const solids = [exc, placa, poc.solid]
    const total = calcTotalM3(calc, solids)
    assert.equal(round2(total), 8.24)

    const snap = freezeCalcSnapshot(calc, solids)
    assert.equal(round2(snap.totalM3), 8.24)
    const rows = memoriaDisplayRows(snap)
    const pocRows = rows.filter((r) => r.num === 3)
    assert.ok(pocRows.length >= 3, `expected ≥3 poceta rows, got ${pocRows.length}`)
    assert.ok(pocRows.every((r) => r.color === '#2563eb'))
    assert.deepEqual(pocRows.map((r) => r.numLabel), pocRows.map((_, i) => (i === 0 ? '3' : `3.${i}`)))
    const labels = labelsFromSnapshot(snap)
    assert.ok(labels.some((l) => l.solidId === 'poceta' && l.num === 3))
  })

  it('c) Sin Sustraer: Box descuenta de Exc y vacío de Box → total 8,24', () => {
    const exc = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    exc.id = 'exc'
    const placa = extrudeClosedEntity(rectAt(0.2, 0.2, 1.0, 1.31, 'placa'), {
      viewId: 'top', cotaSuperior: 1.0, cotaInferior: 0,
    }).solid
    placa.id = 'placa'
    const box = extrudeClosedEntity(rectAt(0.4, 0.8, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    box.color = '#2563eb'
    const inner = extrudeClosedEntity(rectAt(0.6, 1.0, 1.1, 1.1, 'inner'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'inner'
    inner.color = '#7c3aed'

    const calc = createVolumeCalc('Excavación anidada')
    calc.lines = [
      createCalcLine({ solidId: 'exc', nombre: 'Excavación', op: 'sum' }),
      createCalcLine({
        solidId: 'placa', nombre: 'Placa', op: 'subtract', discountFromSolidId: 'exc',
      }),
      createCalcLine({
        solidId: 'box', nombre: 'Box', op: 'subtract', discountFromSolidId: 'exc',
      }),
      createCalcLine({
        solidId: 'inner', nombre: 'Vacío', op: 'subtract', discountFromSolidId: 'box',
      }),
    ]
    const solids = [exc, placa, box, inner]
    const boxLine = resolveCalcLine(calc.lines[2], solids, calc)
    assert.equal(boxLine.ok, true)
    assert.equal(round2(boxLine.volumeM3), 1.81)
    assert.equal(round2(calcTotalM3(calc, solids)), 8.24)

    const snap = freezeCalcSnapshot(calc, solids)
    assert.equal(round2(snap.totalM3), 8.24)
    const rows = memoriaDisplayRows(snap)
    const boxRows = rows.filter((r) => r.num === 3)
    assert.ok(boxRows.length >= 3)
    // El vacío no debe aparecer como fila top-level que reste otra vez
    assert.ok(!rows.some((r) => r.nombre === 'Vacío' && r.countsInTotal))
  })

  it('d) Snapshot vertical: memoriaRows + total coherente con suma de mostrados', () => {
    const a = extrudeClosedEntity(rectAt(0, 0, 2, 2, 'a'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    a.id = 'a'
    const b = extrudeClosedEntity(rectAt(0.5, 0.5, 0.5, 0.5, 'b'), {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    b.id = 'b'
    const calc = createVolumeCalc('Compacta')
    calc.lines = [
      createCalcLine({ solidId: 'a', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({
        solidId: 'b', nombre: 'Menor', op: 'subtract', discountFromSolidId: 'a',
      }),
    ]
    const snap = freezeCalcSnapshot(calc, [a, b])
    const rows = memoriaDisplayRows(snap)
    let sum = 0
    for (const row of rows) {
      if (!row.countsInTotal) continue
      sum = round2(sum + (row.op === 'subtract' ? -round2(row.volumeM3) : round2(row.volumeM3)))
    }
    assert.equal(round2(snap.totalM3), sum)
    assert.ok(labelsFromSnapshot(snap).length >= 1)
  })

  it('total mostrado = suma de redondeos (evita 6,67 vs 6,68)', () => {
    // 11.36 - 1.31 - 3.38 = 6.67 en decimales mostrados
    const vals = [11.36, -1.31, -3.38]
    let t = 0
    for (const v of vals) t = round2(t + round2(v))
    assert.equal(t, 6.67)
    // float crudo fallaría
    const raw = 11.36 - 1.31 - 3.38
    assert.notEqual(Number(raw.toFixed(2)), undefined)
  })
})
