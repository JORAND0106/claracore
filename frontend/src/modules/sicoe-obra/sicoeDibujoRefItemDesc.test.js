import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { descByItemFromRef } from './sicoeDibujoRefItemDesc.js'

describe('descByItemFromRef', () => {
  it('prioriza items_detalle y completa con registros', () => {
    const map = descByItemFromRef({
      items_detalle: [
        { item_numero: '1.1', item_descripcion: 'Excavación' },
        { item_numero: '2.2', item_descripcion: '' },
      ],
      registros: [
        { item_numero: '2.2', item_descripcion: 'Relleno' },
        { item_numero: '1.1', item_descripcion: 'Otra' },
      ],
    })
    assert.equal(map['1.1'], 'Excavación')
    assert.equal(map['2.2'], 'Relleno')
  })
})
