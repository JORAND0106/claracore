import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortItemKeysSicoe,
  agruparRegistrosPorItem,
  estadoNivelUsuarioRegistro,
  pastelDeEstadoValidacion,
  etiquetaCortaRolNivel,
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
  it('devuelve verdes/amarillos/rojos pastel con color de texto legible', () => {
    assert.equal(pastelDeEstadoValidacion('Aprobado').bg, '#dcfce7')
    assert.equal(pastelDeEstadoValidacion('Aprobado').color, '#166534')
    assert.equal(pastelDeEstadoValidacion('Pendiente').bg, '#fef3c7')
    assert.equal(pastelDeEstadoValidacion('Pendiente').color, '#92400e')
    assert.equal(pastelDeEstadoValidacion('Rechazado').bg, '#fee2e2')
    assert.equal(pastelDeEstadoValidacion('Rechazado').color, '#991b1b')
  })
})

describe('etiquetaCortaRolNivel', () => {
  it('extrae el rol del encabezado', () => {
    assert.equal(etiquetaCortaRolNivel('Nivel 2 · Contratista', 2), 'Contratista')
    assert.equal(etiquetaCortaRolNivel('Director de obra (N3)', 3), 'Director de obra')
    assert.equal(etiquetaCortaRolNivel('', 1), 'N1')
  })
})
