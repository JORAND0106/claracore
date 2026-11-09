/**
 * node --test src/utils/disenoGeometricoParse.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  assertFilasConCotas,
  listDisenoExcelSheetNames,
  mapDisenoHeaders,
  ordenadasReferenciaSeccion,
  parseDisenoExcelBuffer,
  sintetizarPerfilDesdeRasante,
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
    assert.equal(filas[0].cota_eje, 100.2)
  })

  it('importa solo la hoja seleccionada', () => {
    const buf = workbookBuffer({
      Primera: [HEADER, ROW_A],
      Segunda: [HEADER, ROW_B],
    })
    const filas = parseDisenoExcelBuffer(buf, { sheetName: 'Segunda' })
    assert.equal(filas.length, 1)
    assert.equal(filas[0].abscisa, 20)
    assert.equal(filas[0].cota_izquierda, 101.1)
  })

  it('reconoce encabezados con unidad y Cota Izq', () => {
    const buf = workbookBuffer({
      Datos: [
        ['Diseño Tramo 7'],
        ['TRAMO', 'ABSCISA', 'Izquierda (m)', 'Cota Eje', 'Cota Der', 'ANCHO'],
        ['T7', 11170, 900.1, 900.2, 900.15, 9],
      ],
    })
    const filas = parseDisenoExcelBuffer(buf)
    assert.equal(filas.length, 1)
    assert.equal(filas[0].cota_izquierda, 900.1)
    assert.equal(filas[0].cota_eje, 900.2)
    assert.equal(filas[0].cota_derecha, 900.15)
  })

  it('rechaza Excel sin columnas de cotas', () => {
    const buf = workbookBuffer({
      SoloPk: [['TRAMO', 'ABSCISA'], ['T7', 11170]],
    })
    assert.throws(() => parseDisenoExcelBuffer(buf), /cotas/i)
  })

  it('falla si la hoja no existe', () => {
    const buf = workbookBuffer({ Rasante: [HEADER, ROW_A] })
    assert.throws(
      () => parseDisenoExcelBuffer(buf, { sheetName: 'NoExiste' }),
      /No se encontró la hoja/,
    )
  })
})

describe('disenoGeometricoParse — helpers vista previa', () => {
  it('mapea headers con sufijo (m)', () => {
    const mapped = mapDisenoHeaders(['Abscisa', 'Izquierda (m)', 'Eje (m)', 'Derecha (m)'])
    assert.deepEqual(Object.values(mapped).sort(), [
      'abscisa', 'cota_derecha', 'cota_eje', 'cota_izquierda',
    ].sort())
  })

  it('sintetiza perfil sin inventar cotas faltantes', () => {
    const pts = sintetizarPerfilDesdeRasante([
      { abscisa: 10, cota_izquierda: 1, cota_eje: 2, cota_derecha: null },
    ], { tipo_seccion: 'A', ancho_via_m: 8 })
    assert.equal(pts.length, 2)
    assert.deepEqual(ordenadasReferenciaSeccion('A', 8), [-4, 0, 4])
    assert.ok(pts.every((p) => p.cota != null))
  })

  it('assertFilasConCotas exige valores', () => {
    assert.throws(
      () => assertFilasConCotas([{ abscisa: 1 }], new Set(['abscisa', 'cota_eje', 'cota_izquierda', 'cota_derecha'])),
      /ninguna fila tiene cotas/i,
    )
  })
})
