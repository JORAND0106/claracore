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
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > Number(disponible) + 1e-9) return null
  return Math.max(0, Number(disponible) - n)
}

/** Texto exacto bajo el campo "Cantidad a despachar". */
function labelSaldoDespues(disponible, cantidad, unidad = 'KG') {
  const saldo = saldoTrasDespacho(disponible, cantidad)
  const valor = saldo == null
    ? '—'
    : `${saldo.toLocaleString('es-CO', { maximumFractionDigits: 4 })} ${unidad}`
  return `Saldo después de esta salida: ${valor}`
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

  it('ejemplo crítico 1500 KG → despacho 100 → saldo 1400', () => {
    const disponible = disponibleEntradaItem(1500, 0)
    assert.equal(disponible, 1500)
    assert.equal(cantidadExcedeSaldo('', disponible), true)
    assert.equal(cantidadExcedeSaldo('100', disponible), false)
    assert.equal(saldoTrasDespacho(disponible, '100'), 1400)
    assert.equal(
      labelSaldoDespues(disponible, '100', 'KG'),
      'Saldo después de esta salida: 1.400 KG',
    )
    assert.equal(
      labelSaldoDespues(disponible, '', 'KG'),
      'Saldo después de esta salida: —',
    )
    // Tras registrar 100, la siguiente salida parte de 1400.
    const trasRegistro = disponibleEntradaItem(1500, 100)
    assert.equal(trasRegistro, 1400)
    assert.equal(cantidadExcedeSaldo('1401', trasRegistro), true)
    assert.equal(cantidadExcedeSaldo('1400', trasRegistro), false)
  })
})
