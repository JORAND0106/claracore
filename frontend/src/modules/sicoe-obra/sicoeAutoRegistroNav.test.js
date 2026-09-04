import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeMatchRegistroAuto,
  sicoeAutoRegistroNavState,
} from './sicoeAutoRegistroNav.js'

describe('sicoeAutoRegistroNav', () => {
  const regs = [
    { id: 100, numero_registro: 7, item_numero: ' 1.01 ' },
    { id: 101, numero_registro: 8, item_numero: '' },
  ]

  it('resuelve por id o por numero_registro', () => {
    assert.equal(sicoeMatchRegistroAuto(regs, 100)?.id, 100)
    assert.equal(sicoeMatchRegistroAuto(regs, '7')?.id, 100)
    assert.equal(sicoeMatchRegistroAuto(regs, 999), null)
  })

  it('no manda a sin_asignar mientras registros aún no cargan (race Interventoría/panel)', () => {
    const pending = sicoeAutoRegistroNavState([], 100)
    assert.equal(pending.ready, false)
    assert.equal(pending.tab, null)
  })

  it('abre Ítems con clave normalizada cuando el registro tiene ítem', () => {
    const nav = sicoeAutoRegistroNavState(regs, 100)
    assert.equal(nav.ready, true)
    assert.equal(nav.tab, 'items')
    assert.equal(nav.itemKey, '1.01')
    assert.equal(nav.registroId, 100)
  })

  it('sin ítem → sin_asignar; deep-link por numero_registro OK', () => {
    assert.equal(sicoeAutoRegistroNavState(regs, 8).tab, 'sin_asignar')
    const byNum = sicoeAutoRegistroNavState(regs, 7)
    assert.equal(byNum.tab, 'items')
    assert.equal(byNum.registroId, 100)
  })
})
