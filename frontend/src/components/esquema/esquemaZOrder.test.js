import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canReorderZOrder,
  isAnchoredLayer,
  reorderZOrder,
  zOrderEquals,
  zOrderIds,
} from './esquemaZOrder.js'

const bg = { id: 'bg', type: 'image', fit: true }
const a = { id: 'a', type: 'rect' }
const b = { id: 'b', type: 'hatchRegion' }
const c = { id: 'c', type: 'texto' }
const d = { id: 'd', type: 'nodo' }

describe('esquemaZOrder', () => {
  it('ancla solo el fondo raster fit', () => {
    assert.equal(isAnchoredLayer(bg), true)
    assert.equal(isAnchoredLayer({ id: 'pic', type: 'image', fit: false }), false)
    assert.equal(isAnchoredLayer(a), false)
  })

  it('traer al frente mueve la selección al final y conserva su orden relativo', () => {
    const next = reorderZOrder([a, b, c, d], ['b', 'd'], 'front')
    assert.deepEqual(zOrderIds(next), ['a', 'c', 'b', 'd'])
  })

  it('enviar al fondo mueve la selección al inicio (tras el raster) y conserva su orden relativo', () => {
    const next = reorderZOrder([bg, a, b, c], ['c'], 'back')
    assert.deepEqual(zOrderIds(next), ['bg', 'c', 'a', 'b'])
  })

  it('no coloca geometría detrás del fondo raster', () => {
    const next = reorderZOrder([bg, a, b], ['b'], 'back')
    assert.equal(next[0].id, 'bg')
    assert.deepEqual(zOrderIds(next), ['bg', 'b', 'a'])
  })

  it('ignora el fondo raster si está en la selección', () => {
    const next = reorderZOrder([bg, a, b], ['bg', 'a'], 'front')
    assert.deepEqual(zOrderIds(next), ['bg', 'b', 'a'])
  })

  it('no muta si no hay cambio o la selección no es reordenable', () => {
    const scene = [a, b]
    assert.equal(reorderZOrder(scene, ['b'], 'front'), scene)
    assert.equal(reorderZOrder(scene, [], 'back'), scene)
    assert.equal(reorderZOrder(scene, ['bg'], 'back'), scene)
    assert.equal(canReorderZOrder([bg, a], ['bg']), false)
    assert.equal(canReorderZOrder([bg, a], ['a']), true)
    assert.equal(zOrderEquals([a, b], [{ id: 'a' }, { id: 'b' }]), true)
  })
})
