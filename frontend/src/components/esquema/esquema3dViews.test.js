import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_3D_VIEWS,
  extrudeAxisForView,
  extrudeModeForView,
  isEsquema3dDrawView,
  isEsquema3dIsoView,
  normalizeViewId,
  projectWorld3dToCanvas,
  solidsViewCamera,
} from './esquema3dViews.js'

describe('esquema3dViews', () => {
  it('seis vistas de cara dibujables + isométricas', () => {
    assert.equal(isEsquema3dDrawView('top'), true)
    assert.equal(isEsquema3dDrawView('bottom'), true)
    assert.equal(isEsquema3dDrawView('front'), true)
    assert.equal(isEsquema3dDrawView('back'), true)
    assert.equal(isEsquema3dDrawView('left'), true)
    assert.equal(isEsquema3dDrawView('right'), true)
    assert.equal(isEsquema3dDrawView('side'), true)
    assert.equal(normalizeViewId('side'), 'left')
    assert.equal(isEsquema3dDrawView('iso-ne'), false)
    assert.equal(isEsquema3dIsoView('iso-sw'), true)
    assert.equal(ESQUEMA_3D_VIEWS.filter((v) => v.draw).length, 6)
  })

  it('eje / modo de extrusión según vista', () => {
    assert.equal(extrudeAxisForView('top'), 'z')
    assert.equal(extrudeModeForView('top'), 'cotas')
    assert.equal(extrudeModeForView('bottom'), 'cotas')
    assert.equal(extrudeAxisForView('front'), 'y')
    assert.equal(extrudeModeForView('front'), 'length')
    assert.equal(extrudeAxisForView('side'), 'x')
    assert.equal(extrudeAxisForView('right'), 'x')
    assert.equal(solidsViewCamera('front', []), null)
    assert.equal(solidsViewCamera('left', []), null)
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

  it('proyección lateral derecha invierte Y', () => {
    const p = projectWorld3dToCanvas({ x: 0, y: 40, zCota: 1 }, 'right', 0)
    assert.equal(p.x, -40)
  })
})
