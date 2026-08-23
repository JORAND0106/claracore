/**
 * Regresión: bordes de grilla Excel con contraste medio.
 * node --test src/components/topografia/topoSheetBorders.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TOPO_SHEET_CELL_BORDER, topoSheetStyles } from './topoSheetStyles.js'
import { bitacoraSheetStyles } from '../../modules/seguimiento/bitacoraSheetStyles.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('topoSheetStyles — bordes visibles', () => {
  it('usa borde de celda #94a3b8 (no el #e2e8f0 tenue del tema)', () => {
    assert.equal(TOPO_SHEET_CELL_BORDER, '#94a3b8')
    const s = topoSheetStyles({ border: '#e2e8f0' })
    assert.equal(s.border, '#94a3b8')
    assert.match(s.th.border, /#94a3b8/)
    assert.match(s.td.border, /#94a3b8/)
    assert.match(s.sheetWrap.border, /#94a3b8/)
  })

  it('permite override vía sheetGridBorder del tema', () => {
    const s = topoSheetStyles({ sheetGridBorder: '#64748b' })
    assert.equal(s.border, '#64748b')
  })

  it('Bitácora/Tarea heredan el mismo contraste de divisores', () => {
    const b = bitacoraSheetStyles({ border: '#e2e8f0' })
    assert.equal(b.border, '#94a3b8')
    assert.match(b.th.border, /#94a3b8/)
  })

  it('Cartera de nivelación usa sheet.th/td y sheetWrap', () => {
    const niv = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')
    assert.match(niv, /const thBase = \{ \.\.\.sheet\.th/)
    assert.match(niv, /const tdBase = \{ \.\.\.sheet\.td/)
    assert.match(niv, /sheet\.sheetWrap/)
    assert.doesNotMatch(
      niv.slice(niv.indexOf('Cartera de lecturas'), niv.indexOf('Cartera de lecturas') + 3500),
      /borderLeft: `1px solid \$\{ui\.t\?\.border \|\| '#e2e8f0'\}`/,
    )
  })
})
