/**
 * Integración: genera el xlsx real y comprueba fórmulas en celdas.
 * Requiere exceljs instalado (dep del frontend).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel.js'

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

async function generarLibro(payload) {
  stubDomDownload()
  let buffer
  globalThis.Blob = class {
    constructor(parts) {
      buffer = parts[0]
    }
  }
  await downloadPresupuestoInformeExcel(
    payload,
    { numero: 'CTO-1', contratista: 'C', nit: '1', interventoria: 'I' },
    1,
    'test.xlsx',
  )
  assert.ok(buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

function totalCantRow(wsMem) {
  let row = null
  wsMem.eachRow((r, rn) => {
    if (r.getCell(1).value === 'TOTAL CANT.') row = rn
  })
  return row
}

/** Filas etiquetadas SUBTOTAL en una hoja de memoria. */
function filasSubtotal(wsMem) {
  const rows = []
  wsMem.eachRow((r, rn) => {
    if (r.getCell(1).value === 'SUBTOTAL') rows.push(rn)
  })
  return rows
}

function makeRegs(n, { competencia = '', tipo_entidad = 'Area', cant = 1 } = {}) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: i + 1,
      id_pol: `P${i + 1}`,
      pk_id: 'PK1',
      tramo: '1',
      infraestructura: '',
      abs_inicio: i * 10,
      abs_final: (i + 1) * 10,
      no_inicio: '',
      no_final: '',
      area_long_nod: cant,
      ancho: 1,
      espesor: 1,
      cant_total: cant,
      tipo_entidad,
      competencia,
      observacion: '',
    })
  }
  return out
}

describe('informe Excel integración fórmulas', () => {
  it('escribe fórmulas visibles en Resumen y memorias', async () => {
    const wb = await generarLibro({
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
              id: 1, id_pol: 'P1', pk_id: 'PK1', tramo: '1', infraestructura: '',
              abs_inicio: 0, abs_final: 10, no_inicio: '', no_final: '',
              area_long_nod: 2, ancho: 1, espesor: 1, cant_total: 1.5,
              tipo_entidad: 'Area', competencia: '', observacion: '',
            },
            {
              id: 2, id_pol: 'P2', pk_id: 'PK1', tramo: '1', infraestructura: '',
              abs_inicio: 10, abs_final: 20, no_inicio: '', no_final: '',
              area_long_nod: 1, ancho: 1, espesor: 1, cant_total: 1,
              tipo_entidad: 'Area', competencia: '', observacion: '',
            },
          ],
        },
      ],
    })

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    assert.ok(wsMem)
    const totRow = totalCantRow(wsMem)
    assert.ok(totRow)

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.1') itemRow = rn
    })
    assert.ok(itemRow)
    const cantCell = wsRes.getCell(itemRow, 6).value
    const cdCell = wsRes.getCell(itemRow, 7).value
    assert.ok(cantCell?.formula)
    assert.equal(
      cantCell.formula,
      `'${wsMem.name}'!L${totRow}`,
      'cantidad Resumen → TOTAL CANT. de la memoria',
    )
    assert.equal(cdCell?.formula, `ROUND(E${itemRow}*F${itemRow},0)`)

    const totCant = wsRes.getCell(5, 5).value
    const totCd = wsRes.getCell(5, 7).value
    assert.ok(totCant?.formula)
    assert.ok(totCd?.formula)
    const merges = [...(wsRes.model?.merges || [])]
    for (const bad of ['D5:E5', 'F5:G5', 'F5:N5']) {
      assert.equal(merges.includes(bad), false, `merge prohibido ${bad}`)
    }
  })

  it('con desglose por competencia y ítem 1.02, cantidad sigue enlazando a memoria', async () => {
    const wb = await generarLibro({
      modo: 'presupuesto_obra',
      modo_label: 'Presupuesto de obra',
      total_registros: 3,
      resumen: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.02',
          competencia: 'IDU',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          cantidad: 2,
          costo_directo: 2000,
        },
        {
          capitulo: '1. PRELIMINARES',
          item: '1.02',
          competencia: 'ESP',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          cantidad: 1,
          costo_directo: 1000,
        },
      ],
      resumen_competencias: [
        { capitulo: '1. PRELIMINARES', competencia: 'IDU', cantidad: 2, costo_directo: 2000 },
        { capitulo: '1. PRELIMINARES', competencia: 'ESP', cantidad: 1, costo_directo: 1000 },
      ],
      items: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.02',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          registros: [
            {
              id: 1, id_pol: 'P1', pk_id: 'PK1', tramo: '1', infraestructura: '',
              abs_inicio: 0, abs_final: 10, no_inicio: '', no_final: '',
              area_long_nod: 2, ancho: 1, espesor: 1, cant_total: 2,
              tipo_entidad: 'Area', competencia: 'IDU', observacion: '',
            },
            {
              id: 2, id_pol: 'P2', pk_id: 'PK1', tramo: '1', infraestructura: '',
              abs_inicio: 10, abs_final: 20, no_inicio: '', no_final: '',
              area_long_nod: 1, ancho: 1, espesor: 1, cant_total: 1,
              tipo_entidad: 'Area', competencia: 'ESP', observacion: '',
            },
          ],
        },
      ],
    })

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    assert.ok(wsMem)
    assert.match(wsMem.name, /1\.02/)
    const totRow = totalCantRow(wsMem)
    assert.ok(totRow)
    const expected = `'${wsMem.name}'!L${totRow}`

    const wsRes = wb.getWorksheet('Resumen')
    const itemRows = []
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.02') itemRows.push(rn)
    })
    assert.equal(itemRows.length, 2, 'dos filas Resumen (IDU y ESP)')
    for (const rn of itemRows) {
      const cant = wsRes.getCell(rn, 6).value
      const cd = wsRes.getCell(rn, 7).value
      assert.equal(typeof cant, 'object')
      assert.equal(cant.formula, expected, `F${rn} debe citar TOTAL CANT. de ${wsMem.name}`)
      assert.equal(cd.formula, `ROUND(E${rn}*F${rn},0)`)
      // Nombre con punto → comillas simples obligatorias
      assert.match(String(cant.formula), /^'/)
    }
  })

  it('memoria con muchos registros: SUBTOTAL=SUM(rango) y TOTAL CANT.=suma de subtotales', async () => {
    const nRegs = 400
    const wb = await generarLibro({
      modo: 'presupuesto_obra',
      modo_label: 'Presupuesto de obra',
      total_registros: nRegs,
      resumen: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.1',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          cantidad: nRegs,
          costo_directo: nRegs * 1000,
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
          registros: makeRegs(nRegs),
        },
      ],
    })

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    assert.ok(wsMem)
    const subs = filasSubtotal(wsMem)
    assert.ok(subs.length >= 1, 'debe existir al menos un SUBTOTAL')
    for (const rn of subs) {
      const fCant = wsMem.getCell(rn, 12).value?.formula
      const fCd = wsMem.getCell(rn, 13).value?.formula
      assert.match(String(fCant), /^SUM\(L\d+:L\d+\)$/, `SUBTOTAL L${rn}: ${fCant}`)
      assert.match(String(fCd), /^SUM\(M\d+:M\d+\)$/, `SUBTOTAL M${rn}: ${fCd}`)
      // No debe ser suma celda por celda de cientos de registros
      assert.equal(String(fCant).includes('+'), false)
    }

    const totRow = totalCantRow(wsMem)
    assert.ok(totRow)
    const totCant = wsMem.getCell(totRow, 12).value?.formula
    const totCd = wsMem.getCell(totRow, 13).value?.formula
    // TOTAL = suma de subtotales (referencia o Lsuba+Lsubb…), no de cada registro
    const expectedTot = subs.length === 1
      ? `L${subs[0]}`
      : subs.map((r) => `L${r}`).join('+')
    assert.equal(totCant, expectedTot, `TOTAL CANT. debe sumar subtotales: ${totCant}`)
    assert.equal(
      totCd,
      expectedTot.replaceAll('L', 'M'),
      `TOTAL costo debe sumar subtotales: ${totCd}`,
    )
    assert.ok(String(totCant).length < 200, 'fórmula TOTAL no debe ser enorme')

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.1') itemRow = rn
    })
    assert.ok(itemRow)
    assert.equal(
      wsRes.getCell(itemRow, 6).value?.formula,
      `'${wsMem.name}'!L${totRow}`,
    )
  })

  it('memoria con varios grupos: TOTAL = subtotal1+subtotal2…', async () => {
    const wb = await generarLibro({
      modo: 'presupuesto_obra',
      modo_label: 'Presupuesto de obra',
      total_registros: 5,
      resumen: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.02',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          cantidad: 5,
          costo_directo: 5000,
        },
      ],
      resumen_competencias: [],
      items: [
        {
          capitulo: '1. PRELIMINARES',
          item: '1.02',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 1000,
          registros: [
            ...makeRegs(3, { tipo_entidad: 'Area', cant: 1 }),
            ...makeRegs(2, { tipo_entidad: 'Linea', cant: 1 }).map((r, i) => ({
              ...r,
              id: 100 + i,
              id_pol: `L${i + 1}`,
            })),
          ],
        },
      ],
    })

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    const subs = filasSubtotal(wsMem)
    assert.ok(subs.length >= 2, `esperaba ≥2 subtotales, got ${subs.length}`)
    for (const rn of subs) {
      assert.match(String(wsMem.getCell(rn, 12).value?.formula), /^SUM\(L\d+:L\d+\)$/)
    }
    const totRow = totalCantRow(wsMem)
    const totCant = wsMem.getCell(totRow, 12).value?.formula
    assert.equal(totCant, subs.map((r) => `L${r}`).join('+'))

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.02') itemRow = rn
    })
    assert.equal(wsRes.getCell(itemRow, 6).value?.formula, `'${wsMem.name}'!L${totRow}`)
  })
})
