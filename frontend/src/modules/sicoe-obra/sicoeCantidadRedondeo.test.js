import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCantidadConRedondeo,
  decimalesCantidadTotal,
  formatearCantidadTotal,
  formatearDimension,
  redondearCantidadTotalDinamico,
  redondearDimension,
} from './sicoeCantidadRedondeo.js'

describe('redondearCantidadTotalDinamico — regla única', () => {
  it('entero → sin decimales (valor entero)', () => {
    assert.equal(redondearCantidadTotalDinamico(24), 24)
    assert.equal(calcularCantidadConRedondeo(2, 3, 4, 1), 24)
    assert.equal(redondearCantidadTotalDinamico(5.004), 5)
  })

  it('no entero → 2 decimales', () => {
    assert.equal(calcularCantidadConRedondeo(5, 0.3, null, null), 1.5)
    assert.equal(redondearCantidadTotalDinamico(1.567), 1.57)
  })

  it('menor a 0,01: conserva decimales si 2 dp lo haría cero', () => {
    // 0.25 × 0.015 = 0.00375 → 0.004
    assert.equal(calcularCantidadConRedondeo(0.25, 0.015, null, null), 0.004)
    assert.equal(redondearCantidadTotalDinamico(0.00375), 0.004)
    assert.equal(redondearCantidadTotalDinamico(0.009), 0.01) // 2 dp no es cero
  })

  it('varilla: peso 3 dp de entrada; Cant Total sigue la regla', () => {
    // 6 × 0.994 × 4 = 23.856 → 23.86
    assert.equal(redondearCantidadTotalDinamico(6 * 0.994 * 4), 23.86)
  })

  it('todos vacíos → 0; multiplica cantidad (× N)', () => {
    assert.equal(calcularCantidadConRedondeo(null, null, null, null), 0)
    assert.equal(calcularCantidadConRedondeo(1, 1, 1, 2), 2)
  })
})

describe('redondearDimension', () => {
  it('acepta hasta 3 decimales (no corta a 2)', () => {
    assert.equal(redondearDimension(0.015), 0.015)
    assert.equal(redondearDimension(0.00375), 0.004)
    assert.equal(redondearDimension('1.2345'), 1.235)
    assert.equal(redondearDimension(''), null)
  })

  it('formatearDimension muestra hasta 3 decimales', () => {
    assert.equal(formatearDimension(0.015, { locale: false }), '0.015')
    assert.equal(formatearDimension(1.5, { locale: false }), '1.5')
  })
})

describe('formatearCantidadTotal', () => {
  it('entero sin decimales; 2 dp; chicos con los necesarios', () => {
    assert.equal(decimalesCantidadTotal(24), 0)
    assert.equal(decimalesCantidadTotal(1.5), 2)
    assert.equal(decimalesCantidadTotal(0.004), 3)
    assert.equal(formatearCantidadTotal(24, { locale: false }), '24')
    assert.equal(formatearCantidadTotal(1.5, { locale: false }), '1.50')
    assert.equal(formatearCantidadTotal(0.004, { locale: false }), '0.004')
  })
})
