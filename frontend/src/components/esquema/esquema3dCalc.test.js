import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, subtractSolids } from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
  isValidCalcSolid,
  resolveCalcLine,
  round2,
} from './esquema3dCalc.js'

function rectMeters(wM, hM) {
  return {
    type: 'rect',
    x1: 0,
    y1: 0,
    x2: metersToWorld(wM),
    y2: metersToWorld(hM),
  }
}

describe('esquema3dCalc — panel de volúmenes', () => {
  it('caso verificación: 24,50 m³ menos cilindro (cota 100→99)', () => {
    const box = extrudeClosedEntity(rectMeters(3.5, 3.5), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    }).solid
    const circ = {
      type: 'elipse',
      x1: metersToWorld(1.25),
      y1: metersToWorld(1.25),
      x2: metersToWorld(2.25),
      y2: metersToWorld(2.25),
    }
    const cyl = extrudeClosedEntity(circ, {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 99,
    }).solid

    // Opción A: dos líneas (suma caja, descuenta cilindro) — volúmenes independientes
    const calc = createVolumeCalc('Excavación')
    calc.lines = [
      createCalcLine({ solidId: box.id, nombre: 'Caja 3,50×3,50', op: 'sum' }),
      createCalcLine({ solidId: cyl.id, nombre: 'Cilindro Ø1,00', op: 'subtract' }),
    ]
    const solids = [box, cyl]
    const total = calcTotalM3(calc, solids)
    // Total = suma de valores mostrados (2 decimales), no float crudo.
    const expected = round2(24.5 - round2(Math.PI * 0.5 * 0.5 * 1))
    assert.equal(total, expected, `got ${total}, expected ${expected}`)

    const snap = freezeCalcSnapshot(calc, solids)
    assert.equal(snap.lines.length, 2)
    assert.equal(snap.lines[0].op, 'sum')
    assert.equal(snap.lines[1].op, 'subtract')
    assert.equal(snap.totalM3, expected)
    assert.ok(snap.lines[0].detail?.formaCalculo)
    assert.ok(snap.lines[1].detail?.formaCalculo)
  })

  it('también admite sólido ya sustraído (volumen boolean)', () => {
    const box = extrudeClosedEntity(rectMeters(3.5, 3.5), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const circ = {
      type: 'elipse',
      x1: metersToWorld(1.25),
      y1: metersToWorld(1.25),
      x2: metersToWorld(2.25),
      y2: metersToWorld(2.25),
    }
    const cyl = extrudeClosedEntity(circ, {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 99,
    }).solid
    const sub = subtractSolids(box, [cyl])
    assert.equal(sub.ok, true)
    const calc = createVolumeCalc('Excavación neta')
    calc.lines = [createCalcLine({ solidId: sub.solid.id, nombre: 'Resultado', op: 'sum' })]
    const total = calcTotalM3(calc, [sub.solid])
    const expected = 24.5 - (Math.PI * 0.5 * 0.5 * 1)
    assert.ok(Math.abs(total - expected) < 0.05, `got ${total}`)
  })

  it('rechaza entidad que no es sólido válido', () => {
    assert.equal(isValidCalcSolid(null), false)
    assert.equal(isValidCalcSolid({ type: 'rect' }), false)
    const r = resolveCalcLine(
      createCalcLine({ solidId: 'x', nombre: 'X', op: 'sum' }),
      [],
    )
    assert.equal(r.ok, false)
  })

  it('dinámico: si cambia el sólido, el total se actualiza', () => {
    const a = extrudeClosedEntity(rectMeters(2, 2), {
      viewId: 'top', cotaSuperior: 5, cotaInferior: 3,
    }).solid
    const calc = createVolumeCalc('Concreto')
    calc.lines = [createCalcLine({ solidId: a.id, nombre: 'Bloque', op: 'sum' })]
    assert.ok(Math.abs(calcTotalM3(calc, [a]) - 8) < 1e-9)

    const bigger = extrudeClosedEntity(rectMeters(3, 3), {
      viewId: 'top', cotaSuperior: 5, cotaInferior: 3,
    }).solid
    bigger.id = a.id
    assert.ok(Math.abs(calcTotalM3(calc, [bigger]) - 18) < 1e-9)
  })
})
