/**
 * Node tests — etiqueta de mes para tarjeta de cumpleaños RRHH.
 * Run: node --test src/modules/rrhh/rrhhCumpleanos.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nombreMesEs } from './rrhhCumpleanos.js'

describe('rrhhCumpleanos', () => {
  it('nombra el mes en español', () => {
    assert.equal(nombreMesEs(1), 'enero')
    assert.equal(nombreMesEs(9), 'septiembre')
    assert.equal(nombreMesEs(12), 'diciembre')
    assert.equal(nombreMesEs(0), '')
  })
})
