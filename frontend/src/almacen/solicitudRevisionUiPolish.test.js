/**
 * Encabezados abreviados de la grilla de revisión.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const COLS = [
  { abbr: 'CAP.', tip: 'Capítulo de presupuesto' },
  { abbr: 'S.NEG.', tip: 'Saldo negociado con el proveedor' },
  { abbr: 'S.PPTO.', tip: 'Saldo presupuestado disponible en el PK-ID' },
  { abbr: 'EST.', tip: 'Estado de validación del ítem' },
]

describe('encabezados grilla revisión', () => {
  it('cada columna abreviada tiene tip completo', () => {
    for (const c of COLS) {
      assert.ok(c.abbr.length <= 8, `${c.abbr} demasiado largo`)
      assert.ok(c.tip.length > c.abbr.length)
    }
  })
})
