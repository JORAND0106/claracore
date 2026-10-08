import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyVuCostoPastePlan,
  buildVuCostoPastePlan,
  esPasteColumnaVu,
  parseClipboardColumnValues,
  parseExcelMoneyCell,
} from './preciosSubcontratistaPaste.js'

describe('preciosSubcontratistaPaste', () => {
  it('parseExcelMoneyCell: moneda, miles y decimales', () => {
    assert.deepEqual(parseExcelMoneyCell('$1.234.567'), { ok: true, value: 1234567, empty: false })
    assert.deepEqual(parseExcelMoneyCell('COP 12.500'), { ok: true, value: 12500, empty: false })
    assert.deepEqual(parseExcelMoneyCell('1.250,50'), { ok: true, value: 1251, empty: false }) // roundCop
    assert.deepEqual(parseExcelMoneyCell('1,250.50'), { ok: true, value: 1251, empty: false })
    assert.deepEqual(parseExcelMoneyCell('1500'), { ok: true, value: 1500, empty: false })
    assert.deepEqual(parseExcelMoneyCell(''), { ok: true, value: null, empty: true })
    assert.deepEqual(parseExcelMoneyCell('   '), { ok: true, value: null, empty: true })
    assert.equal(parseExcelMoneyCell('abc').ok, false)
    assert.equal(parseExcelMoneyCell('-100').ok, false)
  })

  it('parseClipboardColumnValues toma primera columna TSV', () => {
    const vals = parseClipboardColumnValues('1000\tdesc\n2000\tx\n3000')
    assert.deepEqual(vals, ['1000', '2000', '3000'])
  })

  it('esPasteColumnaVu detecta columna multi-fila', () => {
    assert.equal(esPasteColumnaVu('1000'), false)
    assert.equal(esPasteColumnaVu('1000\n2000'), true)
  })

  it('buildVuCostoPastePlan: posición, inválidos y sobrantes', () => {
    const rows = [
      { listado_precio_id: 1, item_numero: '1.1', descripcion: 'A', vu_costo_mo: 100 },
      { listado_precio_id: 2, item_numero: '1.2', descripcion: 'B', vu_costo_mo: 200 },
      { listado_precio_id: 3, item_numero: '1.3', descripcion: 'C', vu_costo_mo: null },
    ]
    const drafts = {
      'lp-1': { vu_costo: '100' },
      'lp-2': { vu_costo: '200' },
      'lp-3': { vu_costo: '' },
    }
    // Pegar desde fila intermedia (index 1)
    const plan = buildVuCostoPastePlan({
      rows,
      drafts,
      startIndex: 1,
      pastedTexts: ['$1.500', 'texto', '999', '8888'],
    })
    assert.equal(plan.aplicaran.length, 1) // solo 1.2 recibe 1500; 1.3 es inválido; 999/8888 sobran
    assert.equal(plan.aplicaran[0].item, '1.2')
    assert.equal(plan.aplicaran[0].nuevo, 1500)
    assert.equal(plan.aplicaran[0].actual, 200)
    assert.equal(plan.invalidos.length, 1)
    assert.equal(plan.invalidos[0].raw, 'texto')
    assert.equal(plan.sobrantesCount, 2)
    assert.deepEqual(plan.sobrantesVals, ['999', '8888'])

    const next = applyVuCostoPastePlan(drafts, plan)
    assert.equal(next['lp-2'].vu_costo, '1500')
    assert.equal(next['lp-1'].vu_costo, '100') // intacto
  })

  it('celda vacía limpia el VU en el plan', () => {
    const rows = [
      { listado_precio_id: 1, item_numero: '1.1', descripcion: 'A', vu_costo_mo: 500 },
    ]
    const plan = buildVuCostoPastePlan({
      rows,
      drafts: { 'lp-1': { vu_costo: '500' } },
      startIndex: 0,
      pastedTexts: [''],
    })
    assert.equal(plan.aplicaran.length, 1)
    assert.equal(plan.aplicaran[0].vacio, true)
    assert.equal(plan.aplicaran[0].nuevoDraft, '')
  })
})
