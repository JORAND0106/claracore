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

/** Filas SUBTOTAL / SUBTOTAL · … en una hoja de memoria. */
function filasSubtotal(wsMem) {
  const rows = []
  wsMem.eachRow((r, rn) => {
    const v = String(r.getCell(1).value || '')
    if (v === 'SUBTOTAL' || v.startsWith('SUBTOTAL ·')) rows.push(rn)
  })
  return rows
}

function subtotalPorLabel(wsMem) {
  /** @type {Map<string, number>} */
  const map = new Map()
  wsMem.eachRow((r, rn) => {
    const v = String(r.getCell(1).value || '')
    if (v === 'SUBTOTAL') map.set('', rn)
    else if (v.startsWith('SUBTOTAL · ')) map.set(v.slice('SUBTOTAL · '.length), rn)
  })
  return map
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
    const subs = filasSubtotal(wsMem)
    assert.equal(subs.length, 1)
    const subRow = subs[0]
    assert.match(String(wsMem.getCell(subRow, 12).value?.formula), /^SUM\(L\d+:L\d+\)$/)

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
      `'${wsMem.name}'!L${subRow}`,
      'cantidad Resumen → SUBTOTAL de la memoria (no TOTAL CANT.)',
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

  it('Resumen por competencia enlaza al SUBTOTAL de esa competencia, no al TOTAL', async () => {
    const wb = await generarLibro({
      modo: 'presupuesto_obra',
      modo_label: 'Presupuesto de obra',
      total_registros: 3,
      resumen: [
        {
          capitulo: '8.CODENSA REDES SECAS',
          item: '8.01',
          competencia: 'Alumbrado P.',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 23261,
          cantidad: 2,
          costo_directo: 46522,
        },
        {
          capitulo: '8.CODENSA REDES SECAS',
          item: '8.01',
          competencia: 'CODENSA',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 23261,
          cantidad: 1,
          costo_directo: 23261,
        },
      ],
      resumen_competencias: [
        { capitulo: '8.CODENSA REDES SECAS', competencia: 'Alumbrado P.', cantidad: 2, costo_directo: 46522 },
        { capitulo: '8.CODENSA REDES SECAS', competencia: 'CODENSA', cantidad: 1, costo_directo: 23261 },
      ],
      items: [
        {
          capitulo: '8.CODENSA REDES SECAS',
          item: '8.01',
          descripcion: 'Excavación',
          und: 'M3',
          vlr_unitario: 23261,
          registros: [
            ...makeRegs(2, { competencia: 'Alumbrado P.', cant: 1 }),
            ...makeRegs(1, { competencia: 'CODENSA', cant: 1 }).map((r) => ({
              ...r,
              id: 90,
              id_pol: 'C1',
            })),
          ],
        },
      ],
    })

    const wsMem = wb.worksheets.find((w) => w.name !== 'Resumen')
    assert.ok(wsMem)
    assert.match(wsMem.name, /8\.01/)
    const byComp = subtotalPorLabel(wsMem)
    assert.ok(byComp.has('Alumbrado P.'), `subs=${[...byComp.keys()]}`)
    assert.ok(byComp.has('CODENSA'))
    const subAlum = byComp.get('Alumbrado P.')
    const subCod = byComp.get('CODENSA')
    assert.match(String(wsMem.getCell(subAlum, 12).value?.formula), /^SUM\(L\d+:L\d+\)$/)
    assert.match(String(wsMem.getCell(subCod, 12).value?.formula), /^SUM\(L\d+:L\d+\)$/)

    const totRow = totalCantRow(wsMem)
    assert.equal(wsMem.getCell(totRow, 12).value?.formula, `L${subAlum}+L${subCod}`)

    const wsRes = wb.getWorksheet('Resumen')
    /** @type {Array<{ rn: number, cap: string }>} */
    const itemRows = []
    /** @type {number[]} */
    const compHeaders = []
    wsRes.eachRow((row, rn) => {
      const a = String(row.getCell(1).value || '')
      if (row.getCell(2).value === '8.01') itemRows.push({ rn, cap: a })
      if (a.startsWith('COMPETENCIA ·')) compHeaders.push(rn)
    })
    assert.equal(itemRows.length, 2)
    assert.ok(compHeaders.length >= 2)

    const formulas = itemRows.map(({ rn }) => wsRes.getCell(rn, 6).value?.formula)
    assert.ok(formulas.includes(`'${wsMem.name}'!L${subAlum}`), String(formulas))
    assert.ok(formulas.includes(`'${wsMem.name}'!L${subCod}`), String(formulas))
    assert.equal(formulas.includes(`'${wsMem.name}'!L${totRow}`), false, 'no debe citar TOTAL CANT.')

    for (const { rn } of itemRows) {
      assert.equal(wsRes.getCell(rn, 7).value?.formula, `ROUND(E${rn}*F${rn},0)`)
      assert.match(String(wsRes.getCell(rn, 6).value?.formula), /^'/)
    }

    // Encabezado COMPETENCIA suma sus ítems; TOTALES DEL INFORME suman encabezados
    for (const rn of compHeaders) {
      const f = wsRes.getCell(rn, 6).value?.formula
      assert.ok(f, `header F${rn}`)
      assert.match(String(f), /^(SUM\(|F\d)/)
    }
    const totInforme = String(wsRes.getCell(5, 5).value?.formula || '')
    for (const rn of compHeaders) {
      assert.ok(totInforme.includes(String(rn)), `totales deben incluir encabezado fila ${rn}: ${totInforme}`)
    }
    for (const { rn } of itemRows) {
      assert.equal(totInforme.includes(`F${rn}`), false, `totales no deben sumar ítem F${rn}`)
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
      assert.equal(String(fCant).includes('+'), false)
    }

    const totRow = totalCantRow(wsMem)
    assert.ok(totRow)
    const totCant = wsMem.getCell(totRow, 12).value?.formula
    const expectedTot = subs.length === 1
      ? `L${subs[0]}`
      : subs.map((r) => `L${r}`).join('+')
    assert.equal(totCant, expectedTot, `TOTAL CANT. debe sumar subtotales: ${totCant}`)
    assert.ok(String(totCant).length < 200, 'fórmula TOTAL no debe ser enorme')

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.1') itemRow = rn
    })
    assert.ok(itemRow)
    // Sin desglose: apunta al único SUBTOTAL de competencia (vacía), no al TOTAL
    assert.equal(
      wsRes.getCell(itemRow, 6).value?.formula,
      `'${wsMem.name}'!L${subs[0]}`,
    )
  })

  it('memoria con varios tipos de entidad: un SUBTOTAL de competencia con SUM+SUM', async () => {
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
    // Un solo bloque de competencia (vacía) → un SUBTOTAL, aunque haya 2 tipos de entidad
    assert.equal(subs.length, 1, `esperaba 1 subtotal de competencia, got ${subs.length}`)
    const fCant = String(wsMem.getCell(subs[0], 12).value?.formula || '')
    // Dos corridas contiguas unidas con +
    assert.match(fCant, /^SUM\(L\d+:L\d+\)\+SUM\(L\d+:L\d+\)$/, fCant)

    const totRow = totalCantRow(wsMem)
    assert.equal(wsMem.getCell(totRow, 12).value?.formula, `L${subs[0]}`)

    const wsRes = wb.getWorksheet('Resumen')
    let itemRow = null
    wsRes.eachRow((row, rn) => {
      if (row.getCell(2).value === '1.02') itemRow = rn
    })
    assert.equal(wsRes.getCell(itemRow, 6).value?.formula, `'${wsMem.name}'!L${subs[0]}`)
  })
})
