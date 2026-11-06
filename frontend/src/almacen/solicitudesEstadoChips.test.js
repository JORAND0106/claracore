/**
 * Chips de estado de la grilla de solicitudes.
 * node --test frontend/src/almacen/solicitudesEstadoChips.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chipsToListQuery,
  SOLICITUD_ESTADO_CHIPS,
  toggleEstadoChip,
} from './solicitudesEstadoChips.js'

describe('solicitudesEstadoChips', () => {
  it('incluye Todas, estados BD, OC parcial y Con OC', () => {
    const ids = SOLICITUD_ESTADO_CHIPS.map((c) => c.id)
    assert.deepEqual(
      ids,
      ['todas', 'borrador', 'enviada', 'aprobada', 'rechazada', 'oc_parcial', 'con_oc'],
    )
  })

  it('toggle combina estados y Todas limpia', () => {
    let s = []
    s = toggleEstadoChip(s, 'enviada')
    assert.deepEqual(s, ['enviada'])
    s = toggleEstadoChip(s, 'aprobada')
    assert.deepEqual(s, ['enviada', 'aprobada'])
    s = toggleEstadoChip(s, 'enviada')
    assert.deepEqual(s, ['aprobada'])
    s = toggleEstadoChip(s, 'todas')
    assert.deepEqual(s, [])
  })

  it('chipsToListQuery separa estados BD de flags OC', () => {
    assert.deepEqual(
      chipsToListQuery(['enviada', 'oc_parcial', 'con_oc']),
      { estados: ['enviada'], con_oc: true, oc_parcial: true },
    )
    assert.deepEqual(chipsToListQuery([]), { estados: [], con_oc: undefined, oc_parcial: undefined })
  })
})
