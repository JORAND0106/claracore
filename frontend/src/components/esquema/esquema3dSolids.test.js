import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, PX_PER_METER } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  solidVolumeM3,
  subtractSolids,
  uniteSolids,
  sliceSolidByLine,
  validateCotas,
  formatVolumeM3,
} from './esquema3dSolids.js'

function rectMeters(wM, hM, rotation = 0) {
  return {
    type: 'rect',
    x1: 0,
    y1: 0,
    x2: metersToWorld(wM),
    y2: metersToWorld(hM),
    rotation,
  }
}

function circleMeters(rM) {
  const r = metersToWorld(rM)
  return {
    type: 'elipse',
    x1: -r,
    y1: -r,
    x2: r,
    y2: r,
    rotation: 0,
  }
}

describe('esquema3dSolids — volumen y booleanos', () => {
  it('valida cotas: superior > inferior', () => {
    assert.equal(validateCotas(100, 98).ok, true)
    assert.equal(validateCotas(98, 100).ok, false)
    assert.equal(validateCotas(100, 100).ok, false)
  })

  it('caso verificación: 3,50×3,50 m entre cota 100 y 98 → 24,50 m³', () => {
    const r = extrudeClosedEntity(rectMeters(3.5, 3.5), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    })
    assert.equal(r.ok, true)
    assert.ok(Math.abs(r.solid.volumeM3 - 24.5) < 1e-9)
    assert.equal(formatVolumeM3(r.solid.volumeM3), '24.50 m³')
  })

  it('misma caja rotada 29.9° sigue dando 24,50 m³', () => {
    const r = extrudeClosedEntity(rectMeters(3.5, 3.5, (29.9 * Math.PI) / 180), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    })
    assert.equal(r.ok, true)
    assert.ok(Math.abs(r.solid.volumeM3 - 24.5) < 1e-9)
  })

  it('sustrae cilindro (cota 100→99) de la caja → 24,50 − π r²', () => {
    const box = extrudeClosedEntity(rectMeters(3.5, 3.5), {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    }).solid
    // Círculo r=0.5 m centrado en la caja
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
    const sub = subtractSolids(box, [cyl])
    assert.equal(sub.ok, true)
    const expected = 24.5 - (Math.PI * 0.5 * 0.5 * 1)
    // Tras booleano el anillo se muestreá; tolerancia por tessellation del círculo
    assert.ok(
      Math.abs(sub.solid.volumeM3 - expected) < 0.05,
      `got ${sub.solid.volumeM3}, expected ~${expected}`,
    )
  })

  it('cilindro solo: volumen π r² h analítico', () => {
    const cyl = extrudeClosedEntity(circleMeters(1), {
      viewId: 'top',
      cotaSuperior: 10,
      cotaInferior: 7,
    })
    assert.equal(cyl.ok, true)
    assert.ok(Math.abs(cyl.solid.volumeM3 - Math.PI * 1 * 1 * 3) < 1e-9)
  })

  it('unir dos cajas adyacentes suma volúmenes', () => {
    const a = extrudeClosedEntity(rectMeters(2, 2), {
      viewId: 'top', cotaSuperior: 5, cotaInferior: 3,
    }).solid
    const bEnt = {
      type: 'rect',
      x1: metersToWorld(2),
      y1: 0,
      x2: metersToWorld(4),
      y2: metersToWorld(2),
    }
    const b = extrudeClosedEntity(bEnt, {
      viewId: 'top', cotaSuperior: 5, cotaInferior: 3,
    }).solid
    const u = uniteSolids([a, b])
    assert.equal(u.ok, true)
    assert.ok(Math.abs(u.solid.volumeM3 - 16) < 1e-6, `got ${u.solid.volumeM3}`)
  })

  it('cortar una caja por la mitad produce dos sólidos', () => {
    const box = extrudeClosedEntity(rectMeters(4, 2), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    const cut = sliceSolidByLine(
      box,
      { x: metersToWorld(2), y: -10 },
      { x: metersToWorld(2), y: metersToWorld(10) },
    )
    assert.equal(cut.ok, true)
    assert.equal(cut.solids.length, 2)
    const sum = cut.solids[0].volumeM3 + cut.solids[1].volumeM3
    assert.ok(Math.abs(sum - solidVolumeM3(box)) < 1e-4)
  })

  it('extrusión en vista frontal por longitud', () => {
    // Contorno 2 m × 1 m en plano del perfil → volumen 2*1*3 = 6 m³
    const profile = rectMeters(2, 1)
    const r = extrudeClosedEntity(profile, {
      viewId: 'front',
      lengthM: 3,
    })
    assert.equal(r.ok, true)
    assert.ok(Math.abs(r.solid.volumeM3 - 6) < 1e-9)
  })

  it('PX_PER_METER estable', () => {
    assert.equal(PX_PER_METER, 50)
  })
})
