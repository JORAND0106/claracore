import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {
  SICOE_EXCEL_MAX_CELL_CHARS,
  buildSicoeRegistrosWorkbook,
  sicoeExcelBufferToUint8Array,
  sicoeExcelCellValue,
  workbookToXlsxBlob,
} from './sicoeExportExcel.js'

describe('sicoeExcelCellValue', () => {
  it('sanitiza NaN/Infinity (causa de reparación en Excel y pérdida de estilos)', () => {
    assert.equal(sicoeExcelCellValue(NaN), '')
    assert.equal(sicoeExcelCellValue(Infinity), '')
    assert.equal(sicoeExcelCellValue(-Infinity), '')
    assert.equal(sicoeExcelCellValue(12.5), 12.5)
    assert.equal(sicoeExcelCellValue(0), 0)
  })

  it('normaliza nullish, booleanos, objetos y controles XML', () => {
    assert.equal(sicoeExcelCellValue(null), '')
    assert.equal(sicoeExcelCellValue(undefined), '')
    assert.equal(sicoeExcelCellValue(true), 'Sí')
    assert.equal(sicoeExcelCellValue(false), 'No')
    assert.equal(sicoeExcelCellValue({ a: 1 }), '{"a":1}')
    assert.equal(sicoeExcelCellValue([1, 2]), '[1,2]')
    assert.equal(sicoeExcelCellValue('hola\u0000mundo\u0008'), 'holamundo')
  })

  it('trunca textos por encima del límite de Excel', () => {
    const long = 'x'.repeat(SICOE_EXCEL_MAX_CELL_CHARS + 50)
    assert.equal(sicoeExcelCellValue(long).length, SICOE_EXCEL_MAX_CELL_CHARS)
  })
})

describe('buildSicoeRegistrosWorkbook OOXML', () => {
  it('no escribe NaN/Infinity y conserva estilos tras volumen realista', async () => {
    const headers = [
      'Reporte', 'Acta RPO', 'Semana', 'Item', 'Descripcion',
      'Cantidad total', 'Costo', 'Observacion', 'Bloqueado', 'Extra',
    ]
    const bodyRows = []
    for (let i = 0; i < 2500; i += 1) {
      bodyRows.push([
        i,
        1,
        2,
        `${i}.`,
        `Desc ${i} con ñ y á`,
        i % 7 === 0 ? NaN : i * 0.01, // habría corrompido el xlsx sin sanitizar
        i % 11 === 0 ? Infinity : i * 100,
        i % 5 === 0 ? `obs\u0000-${i}` : `obs-${i}`,
        i % 2 === 0,
        i % 13 === 0 ? { hist: [] } : '',
      ])
    }

    const wb = buildSicoeRegistrosWorkbook({
      meta: {
        numero: 'ICCU-CTO-1614-2025',
        contratista: 'Contratista SA',
        interventoria: 'Interventoría SA',
        objeto: 'Objeto de prueba',
      },
      headers,
      bodyRows,
      generadoEn: new Date('2026-09-16T12:00:00Z'),
    })

    const buffer = await wb.xlsx.writeBuffer()
    const bytes = sicoeExcelBufferToUint8Array(buffer)
    assert.ok(bytes.byteLength > 1000)

    const zip = await JSZip.loadAsync(bytes)
    assert.ok(zip.file('[Content_Types].xml'))
    assert.ok(zip.file('xl/styles.xml'))
    assert.ok(zip.file('xl/worksheets/sheet1.xml'))

    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string')
    assert.equal(sheet.includes('>NaN<'), false)
    assert.equal(sheet.includes('>Infinity<'), false)
    assert.equal(sheet.includes('>-Infinity<'), false)

    const styles = await zip.file('xl/styles.xml').async('string')
    assert.ok(styles.includes('cellXfs') || styles.includes('<xf '))
    assert.ok(styles.toLowerCase().includes('ddeff8'))

    const blob = await workbookToXlsxBlob(wb)
    assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const blobBytes = new Uint8Array(await blob.arrayBuffer())
    assert.ok(blobBytes.byteLength > 1000)
    assert.equal(blobBytes[0], 0x50) // 'P' de PK zip
    assert.equal(blobBytes[1], 0x4b)

    // Contraste: sin sanitizar, ExcelJS escribe NaN y Excel entra en reparación
    const ExcelJS = (await import('exceljs')).default
    const dirty = new ExcelJS.Workbook()
    const dws = dirty.addWorksheet('x')
    dws.addRow([NaN, Infinity])
    const dirtyBuf = sicoeExcelBufferToUint8Array(await dirty.xlsx.writeBuffer())
    const dirtyZip = await JSZip.loadAsync(dirtyBuf)
    const dirtySheet = await dirtyZip.file('xl/worksheets/sheet1.xml').async('string')
    assert.ok(dirtySheet.includes('>NaN<') || dirtySheet.includes('>Infinity<'))
  })
})
