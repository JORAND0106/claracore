import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_3D_VIEWS,
  extrudeAxisForView,
  isEsquema3dDrawView,
  isEsquema3dIsoView,
  projectWorld3dToCanvas,
} from './esquema3dViews.js'

describe('esquema3dViews', () => {
  it('vistas dibujables: superior, frontal, lateral', () => {
    assert.equal(isEsquema3dDrawView('top'), true)
    assert.equal(isEsquema3dDrawView('front'), true)
    assert.equal(isEsquema3dDrawView('side'), true)
    assert.equal(isEsquema3dDrawView('iso-ne'), false)
    assert.equal(isEsquema3dIsoView('iso-sw'), true)
    assert.equal(ESQUEMA_3D_VIEWS.filter((v) => v.draw).length, 3)
  })

  it('eje de extrusión según vista', () => {
    assert.equal(extrudeAxisForView('top'), 'z')
    assert.equal(extrudeAxisForView('front'), 'y')
    assert.equal(extrudeAxisForView('side'), 'x')
  })

  it('proyección superior conserva XY', () => {
    const p = projectWorld3dToCanvas({ x: 10, y: 20, zCota: 100 }, 'top')
    assert.deepEqual(p, { x: 10, y: 20 })
  })

  it('proyección frontal usa X y cota', () => {
    const p = projectWorld3dToCanvas({ x: 50, y: 999, zCota: 2 }, 'front', 0)
    assert.equal(p.x, 50)
    assert.ok(Number.isFinite(p.y))
  })
})
