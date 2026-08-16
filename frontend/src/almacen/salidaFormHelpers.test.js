/**
 * Helpers de formulario de salida (persistencia / saldo).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

function disponibleEntradaItem(recibida, despachada) {
  return Math.max(0, Math.round((Number(recibida) - Number(despachada)) * 10000) / 10000)
}

function cantidadExcedeSaldo(cantidad, disponible) {
  const n = Number(String(cantidad).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return true
  return n > Number(disponible) + 1e-9
}

function saldoTrasDespacho(disponible, cantidad) {
  const n = Number(String(cantidad).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return Number(disponible) || 0
  return Math.max(0, Number(disponible) - n)
}

describe('salida form saldo y validación', () => {
  it('disponible = recibido − despachado', () => {
    assert.equal(disponibleEntradaItem(100, 40), 60)
    assert.equal(disponibleEntradaItem(10, 10), 0)
    assert.equal(disponibleEntradaItem(5, 8), 0)
  })

  it('bloquea cantidad mayor al saldo', () => {
    assert.equal(cantidadExcedeSaldo('50', 40), true)
    assert.equal(cantidadExcedeSaldo('40', 40), false)
    assert.equal(cantidadExcedeSaldo('10,5', 10.5), false)
    assert.equal(cantidadExcedeSaldo('', 10), true)
  })

  it('saldo tras despacho parcial se actualiza', () => {
    assert.equal(saldoTrasDespacho(100, '30'), 70)
    assert.equal(saldoTrasDespacho(100, '100'), 0)
  })
})
