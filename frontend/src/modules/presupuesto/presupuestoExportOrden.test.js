import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pptoOrdenarFilasPorCapituloItem } from './pptoFiltroCatalogo.js'

describe('pptoOrdenarFilasPorCapituloItem', () => {
  it('ordena ítems con orden natural dentro del capítulo', () => {
    const rows = [
      { capitulo: '3. CAP', item: '3.10' },
      { capitulo: '3. CAP', item: '3.2' },
      { capitulo: '3. CAP', item: '3.1' },
      { capitulo: '1. CAP', item: '1.10' },
      { capitulo: '1. CAP', item: '1.2' },
    ]
    const out = pptoOrdenarFilasPorCapituloItem(rows)
    assert.deepEqual(
      out.map((r) => `${r.capitulo}|${r.item}`),
      [
        '1. CAP|1.2',
        '1. CAP|1.10',
        '3. CAP|3.1',
        '3. CAP|3.2',
        '3. CAP|3.10',
      ],
    )
  })
})
