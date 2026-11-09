/**
 * node --test src/utils/disenoGeometricoParse.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  listDisenoExcelSheetNames,
  parseDisenoExcelBuffer,
} from './disenoGeometricoParse.js'

function workbookBuffer(sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

const HEADER = ['TRAMO', 'ABSCISA', 'IZQUIERDA', 'EJE', 'DERECHA', 'ANCHO']
const ROW_A = ['T1', 0, 100.1, 100.2, 100.15, 7]
const ROW_B = ['T2', 20, 101.1, 101.2, 101.15, 7]

describe('disenoGeometricoParse — hojas Excel', () => {
  it('lista nombres de hojas', () => {
    const buf = workbookBuffer({
      Rasante: [HEADER, ROW_A],
      Auxiliar: [['x'], [1]],
    })
    assert.deepEqual(listDisenoExcelSheetNames(buf), ['Rasante', 'Auxiliar'])
  })

  it('por defecto usa la primera hoja', () => {
    const buf = workbookBuffer({
      Primera: [HEADER, ROW_A],
      Segunda: [HEADER, ROW_B],
    })
    const filas = parseDisenoExcelBuffer(buf)
    assert.equal(filas.length, 1)
    assert.equal(filas[0].abscisa, 0)
    assert.equal(filas[0].tramo, 'T1')
  })

  it('importa solo la hoja seleccionada', () => {
    const buf = workbookBuffer({
      Primera: [HEADER, ROW_A],
      Segunda: [HEADER, ROW_B],
    })
    const filas = parseDisenoExcelBuffer(buf, { sheetName: 'Segunda' })
    assert.equal(filas.length, 1)
    assert.equal(filas[0].abscisa, 20)
    assert.equal(filas[0].tramo, 'T2')
  })

  it('falla si la hoja no existe', () => {
    const buf = workbookBuffer({ Rasante: [HEADER, ROW_A] })
    assert.throws(
      () => parseDisenoExcelBuffer(buf, { sheetName: 'NoExiste' }),
      /No se encontró la hoja/,
    )
  })
})
