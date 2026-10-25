/**
 * Caso · tamaño mínimo medible de letra (C-OUT-08): celdas ≥ ancho/55.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_DOC_MIN_FONT_FRAC,
  esquemaDocFontHierarchy,
  esquemaMinCellFontPx,
  enforceEsquemaMinFontPx,
} from './esquemaDocLegibility.js'
import { exportCoordTableMetrics } from './esquemaExport.js'

describe('caso · letra mínima 1/55 del ancho de imagen', () => {
  it('constante y helpers respetan 1/55', () => {
    assert.equal(ESQUEMA_DOC_MIN_FONT_FRAC, 1 / 55)
    const w = 2200
    const floor = esquemaMinCellFontPx(w)
    assert.ok(Math.abs(floor - w / 55) < 1e-9)
    assert.ok(enforceEsquemaMinFontPx(10, w) >= floor)
    const h = esquemaDocFontHierarchy(w)
    assert.ok(h.cellPx >= floor)
    assert.ok(h.headerPx > h.cellPx)
    assert.ok(h.titlePx > h.headerPx)
  })

  it('tabla de coordenadas: bodyFontPx ≥ ancho/55', () => {
    for (const w of [1100, 1600, 2200, 4400]) {
      const m = exportCoordTableMetrics(w)
      const floor = w / 55
      assert.ok(
        m.bodyFontPx + 1e-6 >= floor,
        `coords w=${w}: body=${m.bodyFontPx} < floor=${floor}`,
      )
      assert.ok(m.headerFontPx >= m.bodyFontPx)
      assert.ok(m.titleFontPx >= m.headerFontPx)
    }
  })

  it('jerarquía despiece/memoria con anchos típicos', () => {
    // Despiece export usa width ≈ 2200 * DOC_TYPE_SCALE (=4400)
    const despieceW = 4400
    const d = esquemaDocFontHierarchy(despieceW, { cellPx: 44 })
    assert.ok(d.cellPx >= despieceW / 55)
    // Memoria base ~1280–1520
    const memW = 1280
    const m = esquemaDocFontHierarchy(memW, { cellPx: 20 })
    assert.ok(m.cellPx >= memW / 55)
  })
})
