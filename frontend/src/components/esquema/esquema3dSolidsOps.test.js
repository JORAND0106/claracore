import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  intersectionVolumeM3,
  solidColorToRgba,
  solidVolumeM3,
  solidsTouchOrOverlap,
  translateSolidXy,
  uniteSolids,
} from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  resolveCalcLine,
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

describe('unir sólidos distintos que se tocan', () => {
  it('prisma delgado pegado a cubo → un solo sólido con suma de volúmenes', () => {
    const cube = extrudeClosedEntity(rectAt(0, 0, 2, 2, 'cube'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    const prism = extrudeClosedEntity(rectAt(2, 0, 0.3, 2, 'prism'), {
      viewId: 'top', cotaSuperior: 5, cotaInferior: 0,
    }).solid
    const vCube = solidVolumeM3(cube)
    const vPrism = solidVolumeM3(prism)
    assert.ok(solidsTouchOrOverlap([cube, prism]))
    const u = uniteSolids([cube, prism])
    assert.equal(u.ok, true)
    assert.ok(Math.abs(u.solid.volumeM3 - (vCube + vPrism)) < 1e-6, `got ${u.solid.volumeM3}`)
  })

  it('sólidos separados: aviso y no une', () => {
    const a = extrudeClosedEntity(rectAt(0, 0, 1, 1, 'a'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    const b = extrudeClosedEntity(rectAt(5, 5, 1, 1, 'b'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    assert.equal(solidsTouchOrOverlap([a, b]), false)
    const u = uniteSolids([a, b])
    assert.equal(u.ok, false)
    assert.match(u.error || '', /no se tocan|superponen/i)
  })
})

describe('color del sólido', () => {
  it('solidColorToRgba usa el matiz del hex con alpha', () => {
    assert.equal(solidColorToRgba('#ff0000', 0.22), 'rgba(255,0,0,0.22)')
    assert.equal(solidColorToRgba('#0f766e', 0.18), 'rgba(15,118,110,0.18)')
  })
})

describe('mover sin redimensionar', () => {
  it('translateSolidXy conserva volumen (1,80×2,70×2,30 = 11,178)', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 1.8, 2.7, 'b'), {
      viewId: 'top', cotaSuperior: 2.3, cotaInferior: 0,
    }).solid
    const v0 = solidVolumeM3(box)
    assert.ok(Math.abs(v0 - 11.178) < 1e-9, `got ${v0}`)
    const moved = translateSolidXy(box, metersToWorld(3), metersToWorld(-1.5))
    assert.ok(Math.abs(solidVolumeM3(moved) - v0) < 1e-12)
    assert.ok(Math.abs(moved.cells[0].z0 - box.cells[0].z0) < 1e-12)
    assert.ok(Math.abs(moved.cells[0].z1 - box.cells[0].z1) < 1e-12)
  })
})

describe('descuento por volumen común', () => {
  it('no descuenta sólido fuera del que suma', () => {
    const big = extrudeClosedEntity(rectAt(0, 0, 1.8, 2.7, 'big'), {
      viewId: 'top', cotaSuperior: 2.3, cotaInferior: 0,
    }).solid
    big.id = 'big'
    const out = extrudeClosedEntity(rectAt(10, 10, 1, 1, 'out'), {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    out.id = 'out'
    const calc = createVolumeCalc('Excavación Poceta')
    calc.lines = [
      createCalcLine({ solidId: 'big', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'out', nombre: 'Fuera', op: 'subtract' }),
    ]
    const solids = [big, out]
    const shared = sharedDiscountVolumeM3(out, calc, solids)
    assert.equal(shared.sharedM3, 0)
    assert.match(shared.error || '', /no comparte volumen/i)
    const r = resolveCalcLine(calc.lines[1], solids, calc)
    assert.equal(r.ok, false)
    assert.ok(Math.abs(calcTotalM3(calc, solids) - solidVolumeM3(big)) < 1e-9)
  })

  it('descuenta volumen exacto de sólido interior', () => {
    const big = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'big'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    big.id = 'big'
    const inner = extrudeClosedEntity(rectAt(1, 1, 1, 1, 'in'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    inner.id = 'in'
    const calc = createVolumeCalc('Excavación')
    calc.lines = [
      createCalcLine({ solidId: 'big', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'in', nombre: 'Interior', op: 'subtract' }),
    ]
    const solids = [big, inner]
    const r = resolveCalcLine(calc.lines[1], solids, calc)
    assert.equal(r.ok, true)
    assert.ok(Math.abs(r.volumeM3 - 2) < 1e-9, `got ${r.volumeM3}`)
    const total = calcTotalM3(calc, solids)
    assert.ok(Math.abs(total - (3.5 * 3.5 * 2 - 2)) < 1e-9)
  })

  it('tras mover el descontado fuera, el total deja de descontar', () => {
    const big = extrudeClosedEntity(rectAt(0, 0, 3, 3, 'big'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    big.id = 'big'
    let inner = extrudeClosedEntity(rectAt(1, 1, 1, 1, 'in'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    inner.id = 'in'
    const calc = createVolumeCalc('Excavación')
    calc.lines = [
      createCalcLine({ solidId: 'big', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'in', nombre: 'Interior', op: 'subtract' }),
    ]
    assert.ok(Math.abs(calcTotalM3(calc, [big, inner]) - (18 - 2)) < 1e-9)
    inner = translateSolidXy(inner, metersToWorld(20), 0)
    assert.ok(intersectionVolumeM3(big, inner) < 1e-9)
    assert.ok(Math.abs(calcTotalM3(calc, [big, inner]) - 18) < 1e-9)
  })
})
