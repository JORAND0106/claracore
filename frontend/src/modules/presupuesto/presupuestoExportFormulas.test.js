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

  it('Subtotales / TOTAL CANT. = SUM sobre filas de registro', () => {
    assert.equal(formulaSumaFilas('L', [10, 11, 12]), 'SUM(L10:L12)')
    assert.equal(formulaSumaFilas('M', [10, 11, 12]), 'SUM(M10:M12)')
    // Filas no contiguas (subtítulos / gráficos entre medias)
    assert.equal(formulaSumaFilas('L', [10, 11, 20, 21]), 'SUM(L10,L11,L20,L21)')
  })

  it('Totales del informe Resumen suman subtotales de capítulo', () => {
    assert.equal(formulaSumaFilas('G', [10, 15]), 'SUM(G10,G15)')
  })
})
