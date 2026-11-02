/**
 * Grilla Excel OC + teclado — Llegó material.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyCantidadToOcRow,
  excelCantidadKeyNav,
  parseCantidadCelda,
  splitInsumoCodigoDesc,
} from './entradaOcExcelHelpers.js'

describe('entradaOcExcelHelpers', () => {
  it('parte código y descripción', () => {
    assert.deepEqual(
      splitInsumoCodigoDesc('CC-1614-068 — ROLLO DE CINTA'),
      { codigo: 'CC-1614-068', descripcion: 'ROLLO DE CINTA' },
    )
    assert.deepEqual(
      splitInsumoCodigoDesc('Sin código'),
      { codigo: '', descripcion: 'Sin código' },
    )
  })

  it('parsea cantidad y vacíos', () => {
    assert.deepEqual(parseCantidadCelda(''), { empty: true, value: 0 })
    assert.deepEqual(parseCantidadCelda('0'), { empty: true, value: 0 })
    assert.deepEqual(parseCantidadCelda('2,5'), { empty: false, value: 2.5 })
  })

  it('cantidad > 0 marca fila; vacío/cero desmarca', () => {
    const base = { key: 'i:1', marked: false, cantidad: '', insumo: {} }
    assert.equal(applyCantidadToOcRow(base, '3').marked, true)
    assert.equal(applyCantidadToOcRow(base, '3').cantidad, '3')
    assert.equal(applyCantidadToOcRow({ ...base, marked: true, cantidad: '2' }, '').marked, false)
    assert.equal(applyCantidadToOcRow({ ...base, marked: true }, '0').marked, false)
  })

  it('Enter/Tab navegan; Enter en última continúa', () => {
    assert.equal(excelCantidadKeyNav('Enter', { isLast: false }).action, 'next')
    assert.equal(excelCantidadKeyNav('Enter', { isLast: true }).action, 'continue')
    assert.equal(excelCantidadKeyNav('Tab', { isLast: false }).action, 'next')
    assert.equal(excelCantidadKeyNav('Tab', { shiftKey: true, isFirst: false }).action, 'prev')
    assert.equal(excelCantidadKeyNav('Tab', { isLast: true }).action, 'continue')
    assert.equal(excelCantidadKeyNav('ArrowDown', { isLast: false }).action, 'down')
    assert.equal(excelCantidadKeyNav('ArrowUp', { isFirst: false }).action, 'up')
  })
})
