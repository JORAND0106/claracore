import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, solidVolumeM3 } from './esquema3dSolids.js'
import {
  alturaFromCotasText,
  createCalcLine,
  createVolumeCalc,
  describeSolidForMemoria,
  freezeCalcSnapshot,
  fmtMemoria,
} from './esquema3dCalc.js'
import { solidsIsoBounds } from './esquema3dCalcExport.js'

function rectAt(xM, yM, wM, hM, id) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(xM),
    y1: metersToWorld(yM),
    x2: metersToWorld(xM + wM),
    y2: metersToWorld(yM + hM),
  }
}

function circleAt(cxM, cyM, rM, id) {
  const cx = metersToWorld(cxM)
  const cy = metersToWorld(cyM)
  const r = metersToWorld(rM)
  return {
    id,
    type: 'elipse',
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
  }
}

describe('altura calculada en Extruir', () => {
  it('cota 100 − 98 → 2,00 m', () => {
    assert.equal(alturaFromCotasText('100', '98'), 2)
    assert.equal(alturaFromCotasText('100,5', '98,25'), 2.25)
    assert.equal(alturaFromCotasText('98', '100'), null)
    assert.equal(alturaFromCotasText('', '98'), null)
  })
})

describe('memoria Pozo 25S — formas y totales', () => {
  it('Excavación Mecánica 24,50 + Pozo descuenta π×0,85²×2,00 ≈ 4,54 → total ≈ 19,96', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'exc'), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    }).solid
    // Ø 1,70 m → r = 0,85
    const pozo = extrudeClosedEntity(circleAt(1.75, 1.75, 0.85, 'pozo'), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    }).solid

    assert.ok(Math.abs(solidVolumeM3(box) - 24.5) < 1e-9)
    const cylExpected = Math.PI * 0.85 * 0.85 * 2
    assert.ok(Math.abs(solidVolumeM3(pozo) - cylExpected) < 1e-9)
    assert.ok(Math.abs(cylExpected - 4.54) < 0.01)

    const dBox = describeSolidForMemoria(box)
    const dPozo = describeSolidForMemoria(pozo)
    assert.equal(dBox.forma, 'Prisma rectangular')
    assert.equal(dBox.altura, 2)
    assert.match(dBox.formaCalculo, /3,50/)
    assert.match(dBox.formaCalculo, /24,50/)

    assert.equal(dPozo.forma, 'Cilindro')
    assert.equal(dPozo.altura, 2)
    assert.match(dPozo.dimensiones, /Ø/)
    assert.match(dPozo.formaCalculo, /π/)
    assert.match(dPozo.formaCalculo, /0,85²/)
    assert.match(dPozo.formaCalculo, /2,00/)
    assert.match(dPozo.formaCalculo, /4,54/)

    const calc = createVolumeCalc('Pozo 25S')
    calc.lines = [
      createCalcLine({ solidId: box.id, nombre: 'Excavación Mecánica', op: 'sum' }),
      createCalcLine({ solidId: pozo.id, nombre: 'Pozo', op: 'subtract' }),
    ]
    // Asignar ids estables a sólidos para freeze
    box.id = 'exc'
    pozo.id = 'pozo'
    calc.lines[0].solidId = 'exc'
    calc.lines[1].solidId = 'pozo'

    const snap = freezeCalcSnapshot(calc, [box, pozo])
    assert.equal(snap.nombre, 'Pozo 25S')
    // Total = suma de redondeos a 2 decimales (24,50 − 4,54 = 19,96).
    assert.equal(snap.totalM3, 19.96)
    assert.ok(Math.abs(snap.totalM3 - (24.5 - cylExpected)) < 0.01)
    assert.equal(snap.lines[0].op, 'sum')
    assert.equal(snap.lines[1].op, 'subtract')
    assert.match(snap.lines[1].detail.formaCalculo, /π × 0,85² × 2,00/)
  })

  it('fmtMemoria usa coma decimal', () => {
    assert.equal(fmtMemoria(19.96), '19,96')
    assert.equal(fmtMemoria(0.85), '0,85')
  })

  it('solidsIsoBounds produce caja finita (misma cámara que el dibujo)', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'b'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const bb = solidsIsoBounds([box])
    assert.ok(Number.isFinite(bb.w) && bb.w > 0)
    assert.ok(Number.isFinite(bb.h) && bb.h > 0)
    assert.equal(bb.viewId, 'iso-ne')
    assert.ok(bb.orbit && Number.isFinite(bb.orbit.yaw))
  })
})
