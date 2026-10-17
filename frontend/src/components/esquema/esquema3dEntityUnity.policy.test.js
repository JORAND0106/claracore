/**
 * Reglas puras de entidad única (C-3D-04).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterObjectsFor3dDraw,
  shouldDrawLinkedContour2d,
} from './esquema3dEntityUnity.js'

describe('shouldDrawLinkedContour2d', () => {
  it('oculto en órbita, iso y perfiles', () => {
    assert.equal(shouldDrawLinkedContour2d({
      mode3d: true, orbitFree: true, viewId: 'top', selected: true,
    }), false)
    assert.equal(shouldDrawLinkedContour2d({
      mode3d: true, orbitFree: false, viewId: 'iso-ne', selected: true,
    }), false)
    assert.equal(shouldDrawLinkedContour2d({
      mode3d: true, orbitFree: false, viewId: 'front', selected: true,
    }), false)
  })

  it('visible solo en superior ortográfica seleccionado', () => {
    assert.equal(shouldDrawLinkedContour2d({
      mode3d: true, orbitFree: false, viewId: 'top', selected: true,
    }), true)
    assert.equal(shouldDrawLinkedContour2d({
      mode3d: true, orbitFree: false, viewId: 'top', selected: false,
    }), false)
  })

  it('filterObjectsFor3dDraw oculta linked en órbita', () => {
    const objects = [{ id: 'a' }, { id: 'b' }]
    const solids = [{ id: 's1', sourceEntityId: 'a' }]
    const vis = filterObjectsFor3dDraw(objects, solids, {
      mode3d: true, orbitFree: true, viewId: 'top', selectedIds: ['a', 'b'],
    })
    assert.deepEqual(vis.map((o) => o.id), ['b'])
  })
})
