/**
 * Node tests — parseError / reingreso RRHH API client.
 * Run: node --test src/modules/rrhh/rrhhApi.parseError.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRrhhApiError } from './rrhhApiErrors.js'

describe('buildRrhhApiError', () => {
  it('preserva reingreso desde payload top-level (409)', () => {
    const err = buildRrhhApiError(
      { status: 409 },
      {
        detail: 'Ya existe un colaborador retirado.',
        code: 'REINGRESO_REQUERIDO',
        reingreso_requerido: true,
        trabajador_id: 42,
        trabajador: { id: 42, nombres: 'Ana', apellidos: 'Pérez', estado: 'retirado' },
      },
    )
    assert.equal(err.status, 409)
    assert.equal(err.codigo, 'reingreso')
    assert.equal(err.trabajador?.id, 42)
    assert.match(err.message, /retirado/i)
  })

  it('preserva codigo/trabajador desde detail objeto', () => {
    const err = buildRrhhApiError(
      { status: 409 },
      {
        detail: {
          mensaje: 'Reingreso requerido',
          codigo: 'reingreso',
          trabajador: { id: 7, nombres: 'Luis' },
        },
      },
    )
    assert.equal(err.codigo, 'reingreso')
    assert.equal(err.trabajador?.id, 7)
  })

  it('errores string simples no pierden el mensaje', () => {
    const err = buildRrhhApiError({ status: 400 }, { detail: 'Salario inválido.' })
    assert.equal(err.message, 'Salario inválido.')
    assert.equal(err.status, 400)
  })
})
