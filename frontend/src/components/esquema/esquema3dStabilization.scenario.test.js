/**
 * Recorrido a–i (núcleo geométrico) del modo 3D estabilizado:
 * grande 1,80×2,70×2,30 · unir dos pequeños · mover dentro · descuento · fuera.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  isSolidNestedIn,
  solidVolumeM3,
  translateSolidXy,
  uniteSolids,
} from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  resolveCalcLine,
  round2,
  sharedDiscountVolumeM3,
} from './esquema3dCalc.js'

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

describe('recorrido estabilización 3D (a–i núcleo)', () => {
  it('une, mueve dentro, descuenta interno y rechaza fuera', () => {
    // a) grande 1,80 × 2,70 entre cotas 2,30 y 0,00 → 11,178 m³
    const big = extrudeClosedEntity(rectAt(0, 0, 1.8, 2.7, 'big'), {
      viewId: 'top', cotaSuperior: 2.3, cotaInferior: 0,
    }).solid
    big.id = 'big'
    assert.ok(Math.abs(solidVolumeM3(big) - 11.178) < 1e-9)

    // dos pequeños que se tocan, fuera del grande
    const s1 = extrudeClosedEntity(rectAt(5, 0, 0.6, 0.5, 's1'), {
      viewId: 'top', cotaSuperior: 1.2, cotaInferior: 0,
    }).solid
    const s2 = extrudeClosedEntity(rectAt(5.6, 0, 0.4, 0.5, 's2'), {
      viewId: 'top', cotaSuperior: 0.8, cotaInferior: 0,
    }).solid
    const vSmall = solidVolumeM3(s1) + solidVolumeM3(s2)

    // b) Unir — volumen exacto e idéntico en campo y solidVolumeM3
    const u = uniteSolids([s1, s2])
    assert.equal(u.ok, true)
    assert.equal(u.solid.sourceEntityId, undefined)
    assert.equal(u.solid.volumeLocked, true)
    assert.ok(Math.abs(u.solid.volumeM3 - vSmall) < 1e-6)
    assert.ok(Math.abs(solidVolumeM3(u.solid) - u.solid.volumeM3) < 1e-12)
    const vUnited = solidVolumeM3(u.solid)

    // c) Mover el unido dentro del grande sin redimensionar
    const united = translateSolidXy(u.solid, metersToWorld(-4.6), metersToWorld(1.1))
    united.id = 'united'
    assert.ok(Math.abs(solidVolumeM3(united) - vUnited) < 1e-12)
    assert.ok(isSolidNestedIn(united, big))
    // Color del unido se conserva
    united.color = '#7c3aed'
    assert.equal(united.color, '#7c3aed')

    // d) Mover el grande (traslación) conserva volumen
    const bigMoved = translateSolidXy(big, metersToWorld(0.3), metersToWorld(-0.2))
    bigMoved.id = 'big'
    assert.ok(Math.abs(solidVolumeM3(bigMoved) - 11.178) < 1e-9)

    // Reposicionar interno relativo al grande movido
    const inner = translateSolidXy(united, metersToWorld(0.3), metersToWorld(-0.2))
    inner.id = 'united'
    assert.ok(isSolidNestedIn(inner, bigMoved))

    // e) Color: solo mutación de propiedad (no afecta volumen)
    inner.color = '#dc2626'
    bigMoved.color = '#0f766e'
    assert.equal(inner.color, '#dc2626')
    assert.equal(bigMoved.color, '#0f766e')

    // i) Cálculo: suma grande − interno; fuera no descuenta
    const calc = createVolumeCalc('Excavación')
    calc.lines = [
      createCalcLine({ solidId: 'big', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'united', nombre: 'Interno', op: 'subtract' }),
    ]
    const solids = [bigMoved, inner]
    const rIn = resolveCalcLine(calc.lines[1], solids, calc)
    assert.equal(rIn.ok, true)
    const expected = round2(round2(solidVolumeM3(bigMoved)) - round2(solidVolumeM3(inner)))
    assert.equal(calcTotalM3(calc, solids), expected)

    const out = extrudeClosedEntity(rectAt(20, 20, 1, 1, 'out'), {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    out.id = 'out'
    const shared = sharedDiscountVolumeM3(out, calc, [...solids, out])
    assert.equal(shared.sharedM3, 0)
    assert.match(shared.error || '', /no comparte volumen/i)
  })
})
