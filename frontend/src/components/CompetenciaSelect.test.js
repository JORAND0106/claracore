/**
 * Catálogo fallback de CompetenciaSelect (alineado a COMPETENCIAS_BASE del backend).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function parseFallbackList() {
  const src = readFileSync(join(here, 'CompetenciaSelect.jsx'), 'utf8')
  const m = src.match(/FALLBACK_COMPETENCIAS = \[([\s\S]*?)\]/)
  assert.ok(m, 'FALLBACK_COMPETENCIAS no encontrado')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('CompetenciaSelect FALLBACK_COMPETENCIAS', () => {
  it('incluye Red Matriz IDU con el nombre exacto', () => {
    const list = parseFallbackList()
    assert.ok(list.includes('Red Matriz IDU'))
    assert.equal(list.filter((x) => x === 'Red Matriz IDU').length, 1)
    assert.equal(list.includes('Red matriz IDU'), false)
  })

  it('conserva el catálogo base previo', () => {
    const set = new Set(parseFallbackList())
    for (const n of [
      'Alumbrado P.',
      'EAB',
      'ENEL-CODENSA',
      'ETB',
      'Gas Natural',
      'ICCU',
      'IDU',
      'MOVISTAR',
    ]) {
      assert.ok(set.has(n), n)
    }
  })
})
