import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DECISION_MANTENER,
  DECISION_SALDAR,
  cantidadTrasRedistribucion,
  cantidadesTrasDecisiones,
  liberacionesAlSaldar,
  participantesDesdeDecisiones,
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

  it('saldar A → A=ejecutado, B recibe todo el saldo', () => {
    const { participantes, saldados } = participantesDesdeDecisiones(
      [1], 2, { 1: DECISION_SALDAR },
    )
    assert.deepEqual(participantes, [2])
    assert.deepEqual(saldados, [1])
    const fila = {
      saldo: 60,
      subs_existentes: [1],
      ejecutados: {
        1: { ejecutado: 40, cantidad_antes: 100, cantidad_no_reconocida: 60 },
        2: { ejecutado: 0, cantidad_antes: 0, cantidad_no_reconocida: 0 },
      },
    }
    const { cantidades } = cantidadesTrasDecisiones(
      fila, { 2: 1 }, { 1: DECISION_SALDAR }, 2,
    )
    assert.equal(cantidades[1], 40)
    assert.equal(cantidades[2], 60)
  })

  it('mantener 50/50', () => {
    const fila = {
      saldo: 60,
      subs_existentes: [1],
      ejecutados: {
        1: { ejecutado: 40 },
        2: { ejecutado: 0 },
      },
    }
    const { cantidades } = cantidadesTrasDecisiones(
      fila, { 1: 0.5, 2: 0.5 }, { 1: DECISION_MANTENER }, 2,
    )
    assert.equal(cantidades[1], 70)
    assert.equal(cantidades[2], 30)
  })

  it('liberaciones al saldar lista no reconocidas', () => {
    const libs = liberacionesAlSaldar(
      [{
        presupuesto_id: 9,
        item: '1.01',
        tramo: 'T1',
        subs_existentes: [1],
        ejecutados: {
          1: { label: 'A', cantidad_no_reconocida: 15, ejecutado: 5 },
        },
      }],
      { 1: DECISION_SALDAR },
    )
    assert.equal(libs.length, 1)
    assert.equal(libs[0].cantidad_no_reconocida, 15)
  })
})
