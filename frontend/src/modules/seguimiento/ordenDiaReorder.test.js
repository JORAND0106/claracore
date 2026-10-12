import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { moveOrdenItem, moverPuntoOrdenYTemas, realinearIdeasConOrden } from './ordenDiaReorder.js'

describe('ordenDiaReorder', () => {
  it('moveOrdenItem intercambia posiciones', () => {
    const list = [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }]
    assert.deepEqual(
      moveOrdenItem(list, 0, 2).map((x) => x.texto),
      ['B', 'C', 'A'],
    )
  })

  it('realinearIdeasConOrden conserva contenido al reordenar por título', () => {
    const orden = [
      { key: 'k2', texto: 'B' },
      { key: 'k1', texto: 'A' },
    ]
    const ideas = [
      { _claveGrabacion: 'od-1', _ordenItemKey: 'k1', titulo: 'A', texto: '<p>contenido A</p>', _temaAbierto: false },
      { _claveGrabacion: 'od-2', _ordenItemKey: 'k2', titulo: 'B', texto: '<p>contenido B</p>', _temaAbierto: false },
      { _claveGrabacion: 'manual-x', titulo: 'Extra', texto: 'x', _temaAbierto: false },
    ]
    const next = realinearIdeasConOrden(orden, ideas)
    assert.equal(next[0].titulo, 'B')
    assert.equal(next[0]._claveGrabacion, 'od-1')
    assert.match(next[0].texto, /contenido B/)
    assert.equal(next[1].titulo, 'A')
    assert.equal(next[1]._claveGrabacion, 'od-2')
    assert.match(next[1].texto, /contenido A/)
    assert.equal(next[2]._claveGrabacion, 'manual-x')
  })

  it('moverPuntoOrdenYTemas sube un punto', () => {
    const orden = [
      { key: 'k1', texto: 'Uno' },
      { key: 'k2', texto: 'Dos' },
    ]
    const ideas = [
      { _claveGrabacion: 'od-1', _ordenItemKey: 'k1', titulo: 'Uno', texto: 't1' },
      { _claveGrabacion: 'od-2', _ordenItemKey: 'k2', titulo: 'Dos', texto: 't2' },
    ]
    const { orden_items, ideas: nextIdeas } = moverPuntoOrdenYTemas(orden, ideas, 1, 0)
    assert.deepEqual(orden_items.map((x) => x.texto), ['Dos', 'Uno'])
    assert.equal(nextIdeas[0].titulo, 'Dos')
    assert.equal(nextIdeas[0].texto, 't2')
    assert.equal(nextIdeas[1].titulo, 'Uno')
  })
})
