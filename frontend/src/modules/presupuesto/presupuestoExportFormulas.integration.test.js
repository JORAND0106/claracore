/**
 * Integración: genera el xlsx real y comprueba fórmulas en celdas.
 * Requiere exceljs instalado (dep del frontend).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel.js'

function payloadMinimal() {
  return {
    modo: 'presupuesto_obra',
    modo_label: 'Presupuesto de obra',
    total_registros: 2,
    resumen: [
      {
        capitulo: '1. PRELIMINARES',
        item: '1.1',
        descripcion: 'Excavación',
        und: 'M3',
        vlr_unitario: 1000.4,
        cantidad: 2.5,
        costo_directo: 2501,
      },
    ],
    resumen_competencias: [],
    items: [
      {
        capitulo: '1. PRELIMINARES',
        item: '1.1',
        descripcion: 'Excavación',
        und: 'M3',
        vlr_unitario: 1000.4,
        registros: [
          {
            id: 1,
            id_pol: 'P1',
            pk_id: 'PK1',
            tramo: '1',
            infraestructura: '',
            abs_inicio: 0,
            abs_final: 10,
            no_inicio: '',
            no_final: '',
            area_long_nod: 2,
            ancho: 1,
            espesor: 1,
            cant_total: 1.5,
            tipo_entidad: 'Area',
            competencia: '',
            observacion: '',
          },
          {
            id: 2,
            id_pol: 'P2',
            pk_id: 'PK1',
            tramo: '1',
            infraestructura: '',
            abs_inicio: 10,
            abs_final: 20,
            no_inicio: '',
            no_final: '',
            area_long_nod: 1,
            ancho: 1,
            espesor: 1,
            cant_total: 1,
            tipo_entidad: 'Area',
            competencia: '',
            observacion: '',
          },
        ],
      },
    ],
  }
}

function stubDomDownload() {
  globalThis.document = {
    body: { appendChild() {}, removeChild() {} },
    createElement(tag) {
      if (tag === 'a') return { href: '', download: '', click() {}, remove() {} }
      return {}
    },
  }
  globalThis.URL = {
    createObjectURL: () => 'blob:test',
    revokeObjectURL() {},
  }
}

describe('informe Excel integración fórmulas', () => {
  it('escribe fórmulas visibles en Resumen y memorias', async () => {
    stubDomDownload()
    let buffer
    globalThis.Blob = class {
      constructor(parts) {
        buffer = parts[0]
      }
    }

    await downloadPresupuestoInformeExcel(
      payloadMinimal(),
      { numero: 'CTO-1', contratista: 'C', nit: '1', interventoria: 'I' },
      1,
      'test.xlsx',
    )

    assert.ok(buffer)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    assert.ok(wsMem)

    let subOk = false
    let totOk = false
    let rowCd = 0
    wsMem.eachRow((row) => {
      const a = row.getCell(1).value
      const cant = row.getCell(12).value
      const cd = row.getCell(13).value
      if (a === 'SUBTOTAL') {
        assert.ok(cant?.formula)
        assert.ok(cd?.formula)
        subOk = true
      }
      if (a === 'TOTAL CANT.') {
        assert.ok(cant?.formula)
        assert.ok(cd?.formula)
        totOk = true
      }
      if (cd?.formula && String(cd.formula).includes('ROUND')) rowCd += 1
    })
    assert.ok(subOk)
    assert.ok(totOk)
    assert.ok(rowCd >= 2)

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.1') itemRow = rn
    })
    assert.ok(itemRow)
    const cantCell = wsRes.getCell(itemRow, 6).value
    const cdCell = wsRes.getCell(itemRow, 7).value
    assert.ok(cantCell?.formula)
    assert.match(String(cantCell.formula), /!L\d+/)
    assert.equal(cdCell?.formula, `ROUND(E${itemRow}*F${itemRow},0)`)

    const totCd = wsRes.getCell(5, 7).value
    assert.ok(totCd?.formula)
  })
})
