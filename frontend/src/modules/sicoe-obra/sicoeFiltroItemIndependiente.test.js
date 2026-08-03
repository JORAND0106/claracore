import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeItemPickerPuedeBuscar,
  sicoeItemsSugerenciasParams,
} from './sicoeFiltroItemHelpers.js'
import { sicoeAppendFSicoeToSearchParams, sicoeFSicoeVacios } from './sicoeFiltroCatalogo.js'

describe('filtro de ítem independiente del capítulo', () => {
  it('permite buscar solo con texto (sin capítulo ni acta)', () => {
    assert.equal(sicoeItemPickerPuedeBuscar({ q: '2.1.3' }), true)
    assert.equal(sicoeItemPickerPuedeBuscar({ q: '  ' }), false)
    assert.equal(sicoeItemPickerPuedeBuscar({}), false)
  })

  it('capítulo/acta/semana siguen siendo acotadores opcionales', () => {
    assert.equal(sicoeItemPickerPuedeBuscar({ capitulo: 'Cap 1' }), true)
    assert.equal(sicoeItemPickerPuedeBuscar({ acta_rpo: '12' }), true)
    assert.equal(sicoeItemPickerPuedeBuscar({ semana: '3' }), true)
  })

  it('arma query de sugerencias con q sola (sin capitulo)', () => {
    const p = sicoeItemsSugerenciasParams({ q: 'excavacion' })
    assert.equal(p.get('q'), 'excavacion')
    assert.equal(p.has('capitulo'), false)
    assert.equal(p.has('acta_rpo'), false)
  })

  it('arma query combinando ítem y capítulo cuando ambos existen', () => {
    const p = sicoeItemsSugerenciasParams({ q: '2.1', capitulo: 'Obras de concreto' })
    assert.equal(p.get('q'), '2.1')
    assert.equal(p.get('capitulo'), 'Obras de concreto')
  })

  it('envía filtro de ítem a la grilla sin exigir capitulo', () => {
    const f = {
      ...sicoeFSicoeVacios(),
      item: '2.1.3',
    }
    const params = new URLSearchParams()
    sicoeAppendFSicoeToSearchParams(params, f)
    assert.equal(params.has('capitulo'), false)
    assert.equal(params.has('capitulos_filtro'), false)
    assert.equal(params.get('item'), '2.1.3')
  })

  it('permite combinar capítulo e ítem en los params de búsqueda', () => {
    const f = {
      ...sicoeFSicoeVacios(),
      capitulo: 'Capítulo A',
      items: ['2.1.3', '2.1.4'],
      itemsOp: 'or',
    }
    const params = new URLSearchParams()
    sicoeAppendFSicoeToSearchParams(params, f)
    assert.equal(params.get('capitulo'), 'Capítulo A')
    assert.deepEqual(JSON.parse(params.get('items_filtro')), ['2.1.3', '2.1.4'])
    assert.equal(params.get('items_filtro_op'), 'or')
  })
})
