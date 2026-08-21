import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { debeRegistrarTipoMaterialNuevo } from './materialTipoCatalogo.js'

describe('debeRegistrarTipoMaterialNuevo', () => {
  it('limpia si vacío', () => {
    assert.deepEqual(debeRegistrarTipoMaterialNuevo('', 'x', []), { action: 'clear' })
    assert.deepEqual(debeRegistrarTipoMaterialNuevo('  ', 'x', []), { action: 'clear' })
  })

  it('elige match existente', () => {
    const row = { id: 1, nombre: 'Arena' }
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('arena', 'arena', [row]),
      { action: 'pick', row },
    )
  })

  it('registra valor nuevo aunque ya esté en el padre (propagación en vivo)', () => {
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('Grava 3/4', 'Grava 3/4', []),
      { action: 'register', nombre: 'Grava 3/4' },
    )
  })

  it('registra aunque el valor confirmado coincida (aún no está en catálogo)', () => {
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('Nuevo', 'Nuevo', [{ id: 2, nombre: 'Otro' }]),
      { action: 'register', nombre: 'Nuevo' },
    )
  })
})
