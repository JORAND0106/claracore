import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canReorderZOrder,
  isAnchoredLayer,
  isBackgroundImage,
  partitionBackgroundFirst,
  reorderZOrder,
  zOrderEquals,
  zOrderIds,
} from './esquemaZOrder.js'

const bg = { id: 'bg', type: 'image', fit: true }
const pic = { id: 'pic', type: 'image', fit: false }
const a = { id: 'a', type: 'rect' }
const b = { id: 'b', type: 'hatchRegion' }
const c = { id: 'c', type: 'texto' }
const d = { id: 'd', type: 'nodo' }

describe('esquemaZOrder', () => {
  it('ancla toda imagen (fit o pegada) como fondo', () => {
    assert.equal(isBackgroundImage(bg), true)
    assert.equal(isBackgroundImage(pic), true)
    assert.equal(isAnchoredLayer(bg), true)
    assert.equal(isAnchoredLayer(pic), true)
    assert.equal(isAnchoredLayer(a), false)
  })

  it('partitionBackgroundFirst deja imágenes debajo sin mutar', () => {
    const scene = [a, pic, b, bg]
    const next = partitionBackgroundFirst(scene)
    assert.deepEqual(zOrderIds(next), ['pic', 'bg', 'a', 'b'])
    assert.deepEqual(zOrderIds(scene), ['a', 'pic', 'b', 'bg'])
  })

  it('traer al frente mueve la selección al final y conserva su orden relativo', () => {
    const next = reorderZOrder([a, b, c, d], ['b', 'd'], 'front')
    assert.deepEqual(zOrderIds(next), ['a', 'c', 'b', 'd'])
  })

  it('enviar al fondo mueve la selección al inicio (tras el raster) y conserva su orden relativo', () => {
    const next = reorderZOrder([bg, a, b, c], ['c'], 'back')
    assert.deepEqual(zOrderIds(next), ['bg', 'c', 'a', 'b'])
  })

  it('no coloca geometría detrás de imágenes de fondo', () => {
    const next = reorderZOrder([bg, pic, a, b], ['b'], 'back')
    assert.equal(next[0].type, 'image')
    assert.equal(next[1].type, 'image')
    assert.deepEqual(zOrderIds(next), ['bg', 'pic', 'b', 'a'])
  })

  it('ignora imágenes de fondo si están en la selección', () => {
    const next = reorderZOrder([bg, a, b], ['bg', 'a'], 'front')
    assert.deepEqual(zOrderIds(next), ['bg', 'b', 'a'])
    const nextPic = reorderZOrder([pic, a, b], ['pic', 'a'], 'front')
    assert.deepEqual(zOrderIds(nextPic), ['pic', 'b', 'a'])
  })

  it('no muta si no hay cambio o la selección no es reordenable', () => {
    const scene = [a, b]
    assert.equal(reorderZOrder(scene, ['b'], 'front'), scene)
    assert.equal(reorderZOrder(scene, [], 'back'), scene)
    assert.equal(reorderZOrder(scene, ['bg'], 'back'), scene)
    assert.equal(canReorderZOrder([bg, a], ['bg']), false)
    assert.equal(canReorderZOrder([pic, a], ['pic']), false)
    assert.equal(canReorderZOrder([bg, a], ['a']), true)
    assert.equal(zOrderEquals([a, b], [{ id: 'a' }, { id: 'b' }]), true)
  })
})
