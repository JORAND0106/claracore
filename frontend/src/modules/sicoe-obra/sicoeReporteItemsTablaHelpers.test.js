import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortItemKeysSicoe,
  agruparRegistrosPorItem,
  estadoNivelUsuarioRegistro,
  pastelDeEstadoValidacion,
} from './sicoeReporteItemsTablaHelpers.js'

describe('sortItemKeysSicoe', () => {
  it('ordena ítems con orden natural numérico', () => {
    assert.deepEqual(sortItemKeysSicoe(['10.1', '2.1', '2.10', '2.2']), ['2.1', '2.2', '2.10', '10.1'])
  })
})

describe('agruparRegistrosPorItem', () => {
  it('agrupa, suma cantidad/costo e ignora sin ítem', () => {
    const regs = [
      { id: 1, item_numero: '2.1', item_descripcion: 'Excavación', unidad: 'm3', numero_registro: 2, cantidad_total: 10, costo_directo: 100 },
      { id: 2, item_numero: '2.1', item_descripcion: 'Excavación', unidad: 'm3', numero_registro: 1, cantidad_total: 5, costo_directo: 50 },
      { id: 3, item_numero: '', cantidad_total: 99, costo_directo: 999 },
      { id: 4, item_numero: '10.1', item_descripcion: 'Relleno', unidad: 'm3', numero_registro: 1, cantidad_total: 1, costo_directo: 20 },
    ]
    const filas = agruparRegistrosPorItem(regs)
    assert.deepEqual(filas.map((f) => f.itemNum), ['2.1', '10.1'])
    assert.equal(filas[0].sumCant, 15)
    assert.equal(filas[0].sumCd, 150)
    assert.deepEqual(filas[0].regs.map((r) => r.numero_registro), [1, 2])
    assert.equal(filas[0].descripcion, 'Excavación')
    assert.equal(filas[0].unidad, 'm3')
  })
})

describe('estadoNivelUsuarioRegistro', () => {
  it('usa solo el campo del nivel del usuario', () => {
    const reg = {
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Pendiente',
      nivel3_estado: 'Rechazado',
      sub_estado: 'No Revisado',
    }
    assert.equal(estadoNivelUsuarioRegistro(reg, 2), 'Pendiente')
    assert.equal(estadoNivelUsuarioRegistro(reg, 1), 'Aprobado')
    assert.equal(estadoNivelUsuarioRegistro(reg, 0), 'No Revisado')
  })
})

describe('pastelDeEstadoValidacion', () => {
  it('devuelve verdes/amarillos/rojos pastel', () => {
    assert.equal(pastelDeEstadoValidacion('Aprobado').bg, '#dcfce7')
    assert.equal(pastelDeEstadoValidacion('Pendiente').bg, '#fef3c7')
    assert.equal(pastelDeEstadoValidacion('Rechazado').bg, '#fee2e2')
  })
})
