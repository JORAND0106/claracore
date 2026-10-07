import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cantidadTrasRedistribucion,
  proporcionesIguales,
  sumProporciones,
  validarProporciones,
} from './pptoSubRedistribucion.js'

describe('pptoSubRedistribucion', () => {
  it('proporciones iguales suman 1', () => {
    const p = proporcionesIguales([10, 20])
    assert.equal(sumProporciones(p), 1)
    assert.equal(p[10], 0.5)
    assert.equal(p[20], 0.5)
  })

  it('ejemplo A=40 + 50/50 del saldo 60 → 70 y 30', () => {
    assert.equal(cantidadTrasRedistribucion(40, 0.5, 60), 70)
    assert.equal(cantidadTrasRedistribucion(0, 0.5, 60), 30)
  })

  it('valida suma 1.00', () => {
    assert.equal(validarProporciones({ 1: 0.5, 2: 0.5 }, [1, 2]), null)
    assert.match(validarProporciones({ 1: 0.4, 2: 0.5 }, [1, 2]), /1\.00/)
  })
})
