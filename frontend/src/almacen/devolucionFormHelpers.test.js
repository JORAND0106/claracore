/**
 * Helpers de devolución — pruebas.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cantidadExcedePendiente,
  mensajeExcesoDevolucion,
  pendienteDevolver,
} from './devolucionFormHelpers.js'

describe('devolucion form helpers', () => {
  it('pendiente = despachado − ya devuelto', () => {
    assert.equal(pendienteDevolver(100, 0), 100)
    assert.equal(pendienteDevolver(100, 20), 80)
    assert.equal(pendienteDevolver(100, 100), 0)
    assert.equal(pendienteDevolver(50, 60), 0)
  })

  it('bloquea devolver más del pendiente (100→20 ok, 21 no)', () => {
    const pendiente = pendienteDevolver(100, 0)
    assert.equal(cantidadExcedePendiente('20', pendiente), false)
    assert.equal(cantidadExcedePendiente('100', pendiente), false)
    assert.equal(cantidadExcedePendiente('101', pendiente), true)
    assert.equal(cantidadExcedePendiente('', pendiente), true)
  })

  it('mensaje de exceso indica máximo', () => {
    const msg = mensajeExcesoDevolucion(30, 20, 'KG')
    assert.match(msg, /30/)
    assert.match(msg, /20/)
    assert.match(msg, /Máximo permitido/)
  })

  it('escenario 100 KG salida → devolución 20 → pendiente 80', () => {
    const pendienteTras = pendienteDevolver(100, 20)
    assert.equal(pendienteTras, 80)
    assert.equal(cantidadExcedePendiente('81', pendienteTras), true)
    assert.equal(cantidadExcedePendiente('80', pendienteTras), false)
  })
})
