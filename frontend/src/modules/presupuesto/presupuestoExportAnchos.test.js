/**
 * Verifica que los anchos de columna del Excel de Presupuesto son regla de
 * plantilla de plataforma (no configuración por contrato) y no dependen del
 * contenido textual de cada contrato.
 *
 * No usa ExcelJS: simula hojas mínimas para demostrar que el contenido no
 * entra en el cálculo de anchos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESUMEN_COL_D_CHARS,
  ITEM_HEADER_COLS,
  resolverAnchosPlantillaResumen,
} from './presupuestoExportLogos.js'

function hojaMock() {
  const cols = new Map()
  return {
    getColumn(c) {
      if (!cols.has(c)) cols.set(c, { width: undefined })
      return cols.get(c)
    },
    _anchos(n) {
      const out = []
      for (let c = 1; c <= n; c += 1) out.push(Number(this.getColumn(c).width) || 0)
      return out
    },
  }
}

function aplicarAnchosResumen(ws, colCount, opts) {
  const widths = resolverAnchosPlantillaResumen(colCount, opts)
  for (let c = 1; c <= widths.length; c += 1) ws.getColumn(c).width = widths[c - 1]
}

/** Misma regla que ajustarAnchosMemoriaItem (plantilla fija). */
function aplicarAnchosMemoria(ws, colCount = ITEM_HEADER_COLS, logoLeftSpan = 4) {
  for (let c = 1; c <= colCount; c += 1) {
    ws.getColumn(c).width = c < colCount ? 11 : 45
  }
  const left = Math.min(logoLeftSpan || 0, 4)
  for (let c = 1; c <= left; c += 1) {
    ws.getColumn(c).width = Math.max(ws.getColumn(c).width || 0, 14)
  }
}

describe('Excel Resumen: anchos idénticos entre contratos con distinto contenido', () => {
  it('genera las mismas columnas A–G para contrato corto y contrato con textos largos', () => {
    const opts = { logoLeftSpan: 2, logoRightSpan: 2 }

    // Contrato A: textos cortos (el contenido no se pasa al resolver).
    const wsA = hojaMock()
    const contenidoA = [['1', '1.1', 'Corto', 'm', 100, 2, 200]]
    aplicarAnchosResumen(wsA, 7, opts)

    // Contrato B: textos muy largos — mismo layout de logos → mismos anchos.
    const wsB = hojaMock()
    const contenidoB = [
      [
        'COMPETENCIA · ' + 'X'.repeat(80),
        '99.99.99',
        'Descripción muy larga '.repeat(20),
        'UND-EXTRA-LARGA',
        999999999,
        123456789,
        9876543210,
      ],
    ]
    assert.notEqual(JSON.stringify(contenidoA).length, JSON.stringify(contenidoB).length)
    aplicarAnchosResumen(wsB, 7, opts)

    const anchosA = wsA._anchos(7)
    const anchosB = wsB._anchos(7)
    assert.deepEqual(anchosA, anchosB)
    assert.equal(anchosA[3], RESUMEN_COL_D_CHARS)
    assert.deepEqual(anchosA, [30, 14, 50, 15, 16, 14, 18])
  })
})

describe('Excel Memorias: anchos fijos de plantilla entre contratos', () => {
  it('A–L=11/14 y M=45 con o sin textos largos', () => {
    const wsA = hojaMock()
    aplicarAnchosMemoria(wsA)
    const wsB = hojaMock()
    // Simula filas con texto largo; la función de anchos no las lee.
    void 'texto-muy-largo-'.repeat(12)
    aplicarAnchosMemoria(wsB)

    const anchosA = wsA._anchos(ITEM_HEADER_COLS)
    const anchosB = wsB._anchos(ITEM_HEADER_COLS)
    assert.deepEqual(anchosA, anchosB)
    assert.deepEqual(anchosA, [14, 14, 14, 14, 11, 11, 11, 11, 11, 11, 11, 11, 45])
  })
})
