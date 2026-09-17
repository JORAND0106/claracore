/**
 * Node tests — paleta pastel de tarjetas RRHH.
 * Run: node --test src/modules/rrhh/rrhhTarjetaStyles.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pastelForEmpresa, pastelIndexFromKey, RRHH_TARJETA_PASTEL } from './rrhhTarjetaStyles.js'

describe('rrhhTarjetaStyles', () => {
  it('asigna pastel estable y dentro de la paleta sincronizada', () => {
    assert.equal(RRHH_TARJETA_PASTEL.length, 8)
    assert.equal(pastelIndexFromKey('consorcio'), pastelIndexFromKey('consorcio'))
    const idx = pastelIndexFromKey('sub:12')
    assert.ok(idx >= 0 && idx < RRHH_TARJETA_PASTEL.length)
    const color = pastelForEmpresa('sub:12')
    assert.match(color.bg, /^#/)
    assert.match(color.border, /^#/)
    assert.match(color.accent, /^#/)
    assert.match(color.text, /^#/)
    assert.deepEqual(pastelForEmpresa('sub:12'), RRHH_TARJETA_PASTEL[idx])
  })
})
