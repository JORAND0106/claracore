/**
 * Grilla de registros: selección múltiple (checkbox) + total seleccionado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('PresupuestoRegistroGrid multi-select', () => {
  const src = readFileSync(join(__dirname, 'PresupuestoRegistroGrid.jsx'), 'utf8')

  it('usa checkboxes en lugar de radio', () => {
    assert.match(src, /type=["']checkbox["']/)
    assert.doesNotMatch(src, /type=["']radio["']/)
  })

  it('muestra saldo disponible de seleccionados', () => {
    assert.match(src, /saldo disponible/)
    assert.match(src, /totalSaldoRegistros/)
    assert.match(src, /onToggle/)
    assert.match(src, /presupuestoIds/)
  })
})
