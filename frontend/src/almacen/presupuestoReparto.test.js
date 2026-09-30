/**
 * Reparto proporcional entre registros de presupuesto.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePresupuestoIds,
  repartirCantidadProporcional,
  roundCant,
  totalSaldoRegistros,
} from './presupuestoReparto.js'

describe('presupuestoReparto', () => {
  const regs = [
    { presupuesto_id: 1, saldo_disponible: 12.51 },
    { presupuesto_id: 2, saldo_disponible: 18.71 },
    { presupuesto_id: 3, saldo_disponible: 13.4 },
  ]

  it('suma saldos seleccionados (ejemplo 44,62)', () => {
    assert.equal(totalSaldoRegistros(regs), 44.62)
  })

  it('reparte 30 M3 proporcionalmente y suma exacta', () => {
    const shares = repartirCantidadProporcional(30, regs)
    assert.equal(shares.length, 3)
    const total = roundCant(shares.reduce((a, s) => a + s.cantidad, 0))
    assert.equal(total, 30)
    // Pesos ≈ 28% / 42% / 30%
    assert.ok(Math.abs(shares[0].peso - 12.51 / 44.62) < 1e-9)
    assert.ok(Math.abs(shares[1].peso - 18.71 / 44.62) < 1e-9)
    assert.ok(Math.abs(shares[2].peso - 13.4 / 44.62) < 1e-9)
    // Orden de magnitud: el de mayor saldo recibe más
    assert.ok(shares[1].cantidad > shares[0].cantidad)
    assert.ok(shares[1].cantidad > shares[2].cantidad)
  })

  it('normalizePresupuestoIds deduplica y usa fallback', () => {
    assert.deepEqual(normalizePresupuestoIds([2, 2, 1, 0, 'x']), [2, 1])
    assert.deepEqual(normalizePresupuestoIds([], 9), [9])
  })
})
