/**
 * Memorias del Excel de informes: columna CIV (no PK_ID).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel.js'

const here = dirname(fileURLToPath(import.meta.url))

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

async function generarMemoria(registros) {
  stubDomDownload()
  let buffer
  globalThis.Blob = class {
    constructor(parts) {
      buffer = parts[0]
    }
  }
  await downloadPresupuestoInformeExcel(
    {
      modo: 'presupuesto_obra',
      modo_label: 'Presupuesto de obra',
      total_registros: registros.length,
      resumen: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.1',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          cantidad: 2,
          costo_directo: 2000,
        },
      ],
      resumen_competencias: [],
      items: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.1',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          registros,
        },
      ],
    },
    { numero: 'CTO-1', contratista: 'C', nit: '1', interventoria: 'I' },
    1,
    'civ.xlsx',
  )
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb.worksheets.find((w) => w.name !== 'Resumen')
}

describe('Excel informe memorias — columna CIV', () => {
  it('el fuente define encabezado CIV (no PK_ID) en DET_HEADERS_BASE', () => {
    const src = readFileSync(join(here, 'presupuestoExportExcel.js'), 'utf8')
    const m = src.match(/const DET_HEADERS_BASE = \[([\s\S]*?)\]/)
    assert.ok(m)
    const headers = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    assert.equal(headers[1], 'CIV')
    assert.equal(headers.includes('PK_ID'), false)
  })

  it('escribe CIV en la columna 2 y deja vacío si no hay civ (sin fallback a pk_id)', async () => {
    const ws = await generarMemoria([
      {
        id: 1,
        id_pol: 'P1',
        pk_id: 'PK-SHOULD-NOT-APPEAR',
        civ: 'CIV-100',
        tramo: '1',
        infraestructura: '',
        abs_inicio: 0,
        abs_final: 10,
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
      {
        id: 2,
        id_pol: 'P2',
        pk_id: 'PK-ONLY',
        civ: '',
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
    ])
    assert.ok(ws)

    let headerRow = null
    const dataRows = []
    ws.eachRow((row, rn) => {
      if (row.getCell(1).value === 'ID_POL' && row.getCell(2).value === 'CIV') {
        headerRow = rn
      }
      if (headerRow != null && rn > headerRow && row.getCell(1).value && row.getCell(1).value !== 'SUBTOTAL' && row.getCell(1).value !== 'TOTAL CANT.') {
        const a = row.getCell(1).value
        if (a === 'P1' || a === 'P2') dataRows.push({ rn, idPol: a, civ: row.getCell(2).value })
      }
    })
    assert.ok(headerRow, 'debe existir encabezado CIV')
    assert.equal(dataRows.length, 2)
    const r1 = dataRows.find((d) => d.idPol === 'P1')
    const r2 = dataRows.find((d) => d.idPol === 'P2')
    assert.equal(r1.civ, 'CIV-100')
    assert.equal(r2.civ == null || r2.civ === '', true, `sin CIV no debe mostrar pk_id: ${JSON.stringify(r2.civ)}`)
    assert.notEqual(r2.civ, 'PK-ONLY')

    // Subtotal / TOTAL siguen presentes tras el cambio de columna
    let hasSub = false
    let hasTot = false
    ws.eachRow((row) => {
      const v = String(row.getCell(1).value || '')
      if (v === 'SUBTOTAL' || v.startsWith('SUBTOTAL ·')) hasSub = true
      if (v === 'TOTAL CANT.') hasTot = true
    })
    assert.equal(hasSub, true)
    assert.equal(hasTot, true)
  })
})
