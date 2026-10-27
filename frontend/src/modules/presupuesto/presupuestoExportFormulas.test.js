/**
 * Contrato de fórmulas del Excel de informe (Resumen + memorias).
 * No genera el xlsx completo (ExcelJS no está en el runner Node puro);
 * valida los builders que escribe presupuestoExportExcel.js.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCostoDirectoCantVu,
  formulaCostoDirectoResumen,
  formulaSumaFilas,
  formulaSumaRango,
} from './pptoResumenExport.js'

describe('informe Excel — builders de fórmulas', () => {
  it('Resumen: costo directo ROUND(E×F,0) por fila', () => {
    assert.equal(formulaCostoDirectoResumen(8), 'ROUND(E8*F8,0)')
    assert.equal(formulaCostoDirectoResumen(15), 'ROUND(E15*F15,0)')
  })

  it('Memoria: costo directo ROUND(cant×VU,0) con VU absoluto', () => {
    assert.equal(
      formulaCostoDirectoCantVu('L12', '$K$7'),
      'ROUND(L12*$K$7,0)',
    )
  })

  it('Subtotales de memoria = SUMA sobre rango continuo (incluso 1 fila)', () => {
    assert.equal(formulaSumaRango('L', 10, 12), 'SUM(L10:L12)')
    assert.equal(formulaSumaRango('M', 10, 12), 'SUM(M10:M12)')
    assert.equal(formulaSumaRango('L', 12, 12), 'SUM(L12:L12)')
    assert.equal(formulaSumaRango('L', 500, 12), 'SUM(L12:L500)')
  })

  it('TOTAL CANT. / totales = suma de subtotales (pocas celdas)', () => {
    // Un solo subtotal → referencia directa
    assert.equal(formulaSumaFilas('L', [20]), 'L20')
    // Varios subtotales no contiguos → celda+celda (no cada registro)
    assert.equal(formulaSumaFilas('L', [20, 45, 80]), 'L20+L45+L80')
    assert.equal(formulaSumaFilas('M', [20, 45]), 'M20+M45')
  })

  it('Totales del informe Resumen suman subtotales de capítulo', () => {
    assert.equal(formulaSumaFilas('G', [10, 15]), 'G10+G15')
  })
})
