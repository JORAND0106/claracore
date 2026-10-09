import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeEsObjetoPagoSub,
  sicoeFiltrarRegistrosParaSub,
  sicoeIdsSubIguales,
  sicoeRegistroVisibleParaSub,
} from './sicoeSubcontratistaRegistros.js'

describe('sicoeSubcontratistaRegistros', () => {
  it('compara ids str/int', () => {
    assert.equal(sicoeIdsSubIguales(12, '12'), true)
    assert.equal(sicoeIdsSubIguales('12', 12), true)
    assert.equal(sicoeIdsSubIguales(12, 13), false)
  })

  it('objeto pago truthy', () => {
    assert.equal(sicoeEsObjetoPagoSub({ nivel2_objeto_pago_sub: true }), true)
    assert.equal(sicoeEsObjetoPagoSub({ nivel2_objeto_pago_sub: false }), false)
    assert.equal(sicoeEsObjetoPagoSub({ nivel2_objeto_pago_sub: null }), false)
  })

  it('visible: pertenece + objeto pago; fallback cabecera', () => {
    assert.equal(
      sicoeRegistroVisibleParaSub(
        { subcontratista_id: '5', nivel2_objeto_pago_sub: true },
        5,
      ),
      true,
    )
    assert.equal(
      sicoeRegistroVisibleParaSub(
        { subcontratista_id: null, nivel2_objeto_pago_sub: true },
        5,
        { subcontratista_id: 5 },
      ),
      true,
    )
    assert.equal(
      sicoeRegistroVisibleParaSub(
        { subcontratista_id: 5, nivel2_objeto_pago_sub: false },
        5,
      ),
      false,
    )
  })

  it('filtra mezcla', () => {
    const out = sicoeFiltrarRegistrosParaSub(
      [
        { id: 1, subcontratista_id: 5, nivel2_objeto_pago_sub: true },
        { id: 2, subcontratista_id: 5, nivel2_objeto_pago_sub: false },
        { id: 3, subcontratista_id: 9, nivel2_objeto_pago_sub: true },
      ],
      5,
    )
    assert.deepEqual(out.map((r) => r.id), [1])
  })
})
