import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import ExcelJS from 'exceljs'
import {
  buildPreciosExportFilename,
  buildPreciosExportLineas,
  desgloseAiuIvaParaExport,
  roundCop,
  sumarTotalesExport,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'
import { buildPreciosSubcontratistaWorkbook } from './preciosSubcontratistaExportExcel.js'
import { computeValorDespuesAiuIva } from '../../admin/catalogoInsumosTributos.js'

const impuestoEjemplo = {
  administracion: '0.05',
  imprevistos: '0.02',
  utilidad: '0.05',
  iva: '0.19',
}

describe('preciosSubcontratistaExport', () => {
  it('roundCop redondea a pesos enteros', () => {
    assert.equal(roundCop(1000.4), 1000)
    assert.equal(roundCop(1000.5), 1001)
    assert.equal(roundCop('2500.2'), 2500)
  })

  it('buildPreciosExportLineas incluye presupuesto y manual sin origen en el output', () => {
    const rows = [
      {
        listado_precio_id: 1,
        origen: 'presupuesto',
        item_numero: '1.01',
        descripcion: 'Excavación',
        unidad: 'm3',
        cantidad: 10,
        vu_costo_mo: 1000,
        vu_cobro: 9999,
      },
      {
        listado_precio_id: 2,
        origen: 'manual',
        item_numero: '2.05',
        descripcion: 'Ítem manual',
        unidad: 'und',
        cantidad: 3,
        vu_costo_mo: 2000,
      },
    ]
    const lineas = buildPreciosExportLineas(rows, {}, impuestoEjemplo)
    assert.equal(lineas.length, 2)
    assert.equal(lineas[0].item, '1.01')
    assert.equal(lineas[1].item, '2.05')
    assert.ok(!('origen' in lineas[0]))
    assert.ok(!('vu_cobro' in lineas[0]))

    const vuCon0 = computeValorDespuesAiuIva(1000, impuestoEjemplo, { valoresEnDecimal: true })
    assert.equal(lineas[0].vu_con_aiu, vuCon0)
    assert.equal(lineas[0].total_antes_aiu, 10000)
    assert.equal(lineas[0].total_con_aiu, roundCop(10 * vuCon0))
  })

  it('respeta drafts de pantalla (VU/cantidad editados)', () => {
    const rows = [{
      listado_precio_id: 1,
      precio_id: 9,
      item_numero: '1.01',
      descripcion: 'A',
      unidad: 'm',
      cantidad: 1,
      vu_costo_mo: 100,
    }]
    const drafts = { 'p-9': { vu_costo: '500', cantidad: '4' } }
    const lineas = buildPreciosExportLineas(rows, drafts, impuestoEjemplo)
    assert.equal(lineas.length, 1)
    assert.equal(lineas[0].cantidad, 4)
    assert.equal(lineas[0].vu_costo_mo, 500)
    assert.equal(lineas[0].total_antes_aiu, 2000)
  })

  it('omite filas sin VU o cantidad', () => {
    const rows = [
      { listado_precio_id: 1, item_numero: '1', descripcion: 'x', unidad: 'u', cantidad: 2, vu_costo_mo: null },
      { listado_precio_id: 2, item_numero: '2', descripcion: 'y', unidad: 'u', cantidad: null, vu_costo_mo: 10 },
    ]
    assert.equal(buildPreciosExportLineas(rows, {}, impuestoEjemplo).length, 0)
  })

  it('sumarTotalesExport coincide con sumatoria de filas', () => {
    const lineas = [
      { total_antes_aiu: 1000, total_con_aiu: 1129 },
      { total_antes_aiu: 2000, total_con_aiu: 2259 },
    ]
    const t = sumarTotalesExport(lineas)
    assert.equal(t.sumatoria_antes_aiu, 3000)
    assert.equal(t.total_general_con_aiu, 3388)
    assert.equal(t.valor_aiu_iva, 388)
  })

  it('validatePreciosExport bloquea sin ítems pactados', () => {
    const r = validatePreciosExport({ rows: [], drafts: {}, impuesto: impuestoEjemplo })
    assert.equal(r.ok, false)
    assert.match(r.message, /precio pactado/i)
  })

  it('validatePreciosExport bloquea sin AIU/IVA', () => {
    const rows = [{
      listado_precio_id: 1,
      item_numero: '1',
      descripcion: 'x',
      unidad: 'u',
      cantidad: 1,
      vu_costo_mo: 100,
    }]
    const r = validatePreciosExport({
      rows,
      drafts: {},
      impuesto: { administracion: '', imprevistos: '', utilidad: '', iva: '' },
    })
    assert.equal(r.ok, false)
    assert.match(r.message, /AIU\/IVA/i)
  })

  it('validatePreciosExport ok con ítems + AIU', () => {
    const rows = [{
      listado_precio_id: 1,
      item_numero: '1',
      descripcion: 'x',
      unidad: 'u',
      cantidad: 2,
      vu_costo_mo: 1000,
    }]
    const r = validatePreciosExport({ rows, drafts: {}, impuesto: impuestoEjemplo })
    assert.equal(r.ok, true)
    assert.equal(r.lineas.length, 1)
    assert.equal(r.totales.sumatoria_antes_aiu, 2000)
    assert.ok(r.totales.total_general_con_aiu >= r.totales.sumatoria_antes_aiu)
    assert.equal(r.aiu.administracion, 5)
    assert.equal(r.aiu.imprevistos, 2)
    assert.equal(r.aiu.utilidad, 5)
    assert.equal(r.aiu.iva_sobre_utilidad, 19)
  })

  it('desgloseAiuIvaParaExport y filename', () => {
    const d = desgloseAiuIvaParaExport(impuestoEjemplo)
    assert.equal(d.administracion, 5)
    const name = buildPreciosExportFilename(
      { razon_social: 'Constructora ABC S.A.S.' },
      new Date('2026-10-07T15:00:00Z'),
    )
    assert.match(name, /^precios_pactados_Constructora_ABC_S_A_S_2026-10-07\.xlsx$/)
  })

  it('workbook Excel coincide con totales de pantalla (presupuesto + manual)', async () => {
    const rows = [
      {
        listado_precio_id: 1,
        origen: 'presupuesto',
        item_numero: '1.01',
        descripcion: 'Excavación',
        unidad: 'm3',
        cantidad: 10,
        vu_costo_mo: 1000,
        vu_cobro: 9999,
      },
      {
        listado_precio_id: 2,
        origen: 'manual',
        item_numero: 'M-01',
        descripcion: 'Ítem manual',
        unidad: 'und',
        cantidad: 3,
        vu_costo_mo: 2000,
      },
    ]
    const check = validatePreciosExport({ rows, drafts: {}, impuesto: impuestoEjemplo })
    assert.equal(check.ok, true)

    const wb = buildPreciosSubcontratistaWorkbook({
      subcontratista: {
        razon_social: 'Constructora Demo S.A.S.',
        nit: '900123456-1',
        objeto_contrato: 'Obras fase 1',
      },
      rows,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
    })
    const buf = await wb.xlsx.writeBuffer()
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buf)
    const ws = loaded.getWorksheet('Precios pactados')
    assert.ok(ws)
    assert.equal(ws.getCell(2, 2).value, 'Constructora Demo S.A.S.')
    assert.equal(ws.getCell(3, 2).value, '900123456-1')
    assert.equal(ws.getRow(8).getCell(6).value, check.lineas[0].total_antes_aiu)
    assert.equal(ws.getRow(8).getCell(7).value, check.lineas[0].total_con_aiu)
    assert.equal(ws.getRow(9).getCell(1).value, 'M-01')
    assert.equal(ws.getRow(9).getCell(6).value, check.lineas[1].total_antes_aiu)
    assert.equal(ws.getRow(9).getCell(7).value, check.lineas[1].total_con_aiu)

    let foundGrand = false
    ws.eachRow((row) => {
      const lab = String(row.getCell(1).value || '')
      if (lab.includes('Sumatoria antes')) {
        assert.equal(row.getCell(6).value, check.totales.sumatoria_antes_aiu)
      }
      if (lab.includes('Valor correspondiente')) {
        assert.equal(row.getCell(6).value, check.totales.valor_aiu_iva)
      }
      if (lab.includes('Total general')) {
        assert.equal(row.getCell(6).value, check.totales.total_general_con_aiu)
        foundGrand = true
      }
    })
    assert.equal(foundGrand, true)
  })
})
