/**
 * Helpers de formulario de salida (persistencia / saldo / presentación).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cantidadExcedeSaldo,
  disponibleEntradaItem,
  labelSaldoDespues,
  mensajeExcesoCantidadDespachar,
  saldoTrasDespacho,
  splitInsumoCodigoDescripcion,
} from './salidaFormHelpers.js'

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
    assert.equal(cantidadExcedeSaldo('2000', 1500), true)
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
    const trasRegistro = disponibleEntradaItem(1500, 100)
    assert.equal(trasRegistro, 1400)
    assert.equal(cantidadExcedeSaldo('1401', trasRegistro), true)
    assert.equal(cantidadExcedeSaldo('1400', trasRegistro), false)
  })

  it('mensaje de exceso indica máximo permitido (2000 vs 1500)', () => {
    const msg = mensajeExcesoCantidadDespachar(2000, 1500, 'KG')
    assert.match(msg, /2\.000/)
    assert.match(msg, /1\.500/)
    assert.match(msg, /Máximo permitido/)
    assert.equal(cantidadExcedeSaldo('2000', 1500), true)
  })
})

describe('splitInsumoCodigoDescripcion sin duplicar código', () => {
  it('quita el código ya presente en material_descripcion', () => {
    const r = splitInsumoCodigoDescripcion(
      'CC-1614-003',
      'CC-1614-003 — Acero de refuerzo',
    )
    assert.equal(r.codigo, 'CC-1614-003')
    assert.equal(r.descripcion, 'Acero de refuerzo')
  })

  it('soporta separador · usado en UI anterior', () => {
    const r = splitInsumoCodigoDescripcion('CC-1614-003', 'CC-1614-003 · Acero de refuerzo')
    assert.equal(r.descripcion, 'Acero de refuerzo')
  })

  it('no altera descripción sin prefijo de código', () => {
    const r = splitInsumoCodigoDescripcion('CC-1', 'Acero corrugado')
    assert.equal(r.codigo, 'CC-1')
    assert.equal(r.descripcion, 'Acero corrugado')
  })

  it('maneja ausencia de código', () => {
    const r = splitInsumoCodigoDescripcion(null, 'Material libre')
    assert.equal(r.codigo, null)
    assert.equal(r.descripcion, 'Material libre')
  })
})
