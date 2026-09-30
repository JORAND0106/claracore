import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sicoeBundleToReasignarPayload } from './sicoeMoverReasignarPayload.js'

describe('sicoeBundleToReasignarPayload', () => {
  it('mapea filtros básicos sin costos', () => {
    const body = sicoeBundleToReasignarPayload({
      fSicoe: {
        numero_registro: '42',
        subcontratista_id: '7',
        capitulo: '01',
        item: '',
        items: [],
      },
      itemsChips: [],
      capasValidacion: [],
    })
    assert.equal(body.numero_registro, 42)
    assert.equal(body.subcontratista_id, 7)
    assert.equal(body.capitulo, '01')
    assert.equal(body.pendiente_item, false)
    assert.equal('costo_directo' in body, false)
  })

  it('serializa capas de validación', () => {
    const body = sicoeBundleToReasignarPayload({
      fSicoe: { semana: '3' },
      capasValidacion: [{ nivel: 2, estado: 'Pendiente' }],
      capasValidacionOp: 'and',
    })
    assert.equal(body.semana, 3)
    assert.ok(body.validacion_capas)
    const capas = JSON.parse(body.validacion_capas)
    assert.equal(capas[0].nivel, 2)
    assert.equal(capas[0].estado, 'Pendiente')
  })
})
