/**
 * Contrato visual: resumen por cargo en chips compactos a ancho completo,
 * organizados en cuadrícula uniforme (grid).
 * Run: node --test src/modules/seguimiento/personalAsistenciaPanelCompacto.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'PersonalAsistenciaPanel.jsx'), 'utf8')

const chipsFn = (() => {
  const start = src.indexOf('const renderCargoChips')
  assert.ok(start >= 0, 'renderCargoChips no encontrado')
  const end = src.indexOf('\n  const btnGhost', start)
  assert.ok(end > start, 'fin de renderCargoChips no encontrado')
  return src.slice(start, end)
})()

describe('PersonalAsistenciaPanel — resumen compacto', () => {
  it('usa chips densos a ancho completo (sin columna vacía / sin tope 25%)', () => {
    assert.match(src, /renderCargoChips/)
    assert.doesNotMatch(src, /renderCargoCards/)
    assert.doesNotMatch(src, /:\s*'25%'/)
    assert.match(src, /bitacora-resumen-cargos-compacto/)
    assert.match(src, /width:\s*'100%'/)
  })

  it('organiza chips en cuadrícula uniforme (grid auto-fill)', () => {
    assert.match(chipsFn, /bitacora-resumen-cargos-grid/)
    assert.match(chipsFn, /display:\s*'grid'/)
    assert.match(chipsFn, /gridTemplateColumns:\s*'repeat\(auto-fill,\s*minmax\(148px,\s*1fr\)\)'/)
    assert.match(chipsFn, /gap:\s*5/)
    assert.match(chipsFn, /alignItems:\s*'stretch'/)
    assert.doesNotMatch(chipsFn, /flexWrap/)
    assert.doesNotMatch(chipsFn, /display:\s*'flex'/)
  })

  it('conserva abrir detalle por clic (consolidado y por empresa)', () => {
    assert.match(src, /onClick=\{\(\)\s*=>\s*onOpen\(row\)\}/)
    assert.match(src, /onOpen:\s*openCargoConsolidado/)
    assert.match(src, /onOpen:\s*\(row\)\s*=>\s*openCargoDetalle\(grupo,\s*row\)/)
    assert.match(src, /PersonalCargoDetalleModal/)
  })
})
