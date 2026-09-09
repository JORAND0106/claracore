import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCantidadConRedondeo,
  decimalesCantidadTotal,
  formatearCantidadTotal,
  redondearCantidadTotalDinamico,
} from './sicoeCantidadRedondeo.js'

describe('calcularCantidadConRedondeo', () => {
  it('usa 3 decimales cuando ROUND(exacto,2) < 0.10', () => {
    // 0.25 × 0.015 = 0.00375 → 0.004
    assert.equal(calcularCantidadConRedondeo(0.25, 0.015, null, null), 0.004)
    assert.equal(redondearCantidadTotalDinamico(0.00375), 0.004)
  })

  it('usa 2 decimales cuando ROUND(exacto,2) >= 0.10', () => {
    assert.equal(calcularCantidadConRedondeo(5, 0.3, null, null), 1.5)
    assert.equal(calcularCantidadConRedondeo(2, 3, 4, 1), 24)
  })

  it('todos vacíos → 0; multiplica cantidad (× N)', () => {
    assert.equal(calcularCantidadConRedondeo(null, null, null, null), 0)
    assert.equal(calcularCantidadConRedondeo(1, 1, 1, 2), 2)
  })
})

describe('formatearCantidadTotal', () => {
  it('muestra 3 decimales en valores chicos y 2 en el resto', () => {
    assert.equal(decimalesCantidadTotal(0.004), 3)
    assert.equal(decimalesCantidadTotal(1.5), 2)
    assert.equal(formatearCantidadTotal(0.004, { locale: false }), '0.004')
    assert.equal(formatearCantidadTotal(1.5, { locale: false }), '1.50')
  })
})
