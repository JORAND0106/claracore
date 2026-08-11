import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pptoFormatoNodos } from './pptoFormatoNodos.js'

describe('pptoFormatoNodos', () => {
  it('concatena ambos nodos con flecha', () => {
    assert.equal(pptoFormatoNodos({ no_inicio: 'N1', no_final: 'N2' }), 'N1 → N2')
  })

  it('usa — cuando falta un lado', () => {
    assert.equal(pptoFormatoNodos({ no_inicio: 'N1', no_final: '' }), 'N1 → —')
    assert.equal(pptoFormatoNodos({ no_inicio: null, no_final: 'N2' }), '— → N2')
  })

  it('devuelve — si ambos están vacíos', () => {
    assert.equal(pptoFormatoNodos({}), '—')
    assert.equal(pptoFormatoNodos({ no_inicio: '  ', no_final: null }), '—')
    assert.equal(pptoFormatoNodos(null), '—')
  })
})
