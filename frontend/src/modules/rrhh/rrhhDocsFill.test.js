/**
 * Node tests — avance documental grilla RRHH.
 * Run: node --test src/modules/rrhh/rrhhDocsFill.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCS_FILL_GROUPS,
  docsFillLegend,
  emptyDocsFill,
  normalizeDocsFill,
} from './rrhhDocsFill.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('rrhhDocsFill', () => {
  it('ordena 4 grupos Contrato → Soporte → Ingreso → Afiliación', () => {
    assert.deepEqual(DOCS_FILL_GROUPS, ['contrato', 'soporte', 'ingreso', 'afiliacion'])
    assert.equal(docsFillLegend.length, 4)
    assert.equal(docsFillLegend[0].short, 'Contrato')
    assert.equal(docsFillLegend[3].short, 'Afiliación')
  })

  it('normaliza docs_fill incompleto', () => {
    const n = normalizeDocsFill({
      soporte: { filled: 2, total: 4 },
      ingreso: { filled: 99, total: 3 },
    })
    assert.equal(n.contrato.ratio, 0)
    assert.equal(n.soporte.ratio, 0.5)
    assert.equal(n.ingreso.filled, 3)
    assert.equal(n.ingreso.ratio, 1)
    assert.deepEqual(Object.keys(emptyDocsFill()), DOCS_FILL_GROUPS)
  })

  it('grilla monta barra + leyenda', () => {
    const src = readFileSync(join(dir, 'ModuloRrhh.jsx'), 'utf8')
    assert.match(src, /DocsFillBattery/)
    assert.match(src, /DocsFillLegend/)
    assert.match(src, /Documentación/)
    assert.match(src, /row\.docs_fill/)
  })
})
