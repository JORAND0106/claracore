import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** Agrupa filas de un tramo por Nodo inicio | Nodo fin | Tramo (misma lógica del modal). */
function agruparPorNodosTramo(filas) {
  const map = new Map()
  for (const r of filas) {
    const ni = String(r.no_inicio || '').trim() || '—'
    const nf = String(r.no_final || '').trim() || '—'
    const tr = String(r.tramo || '').trim() || '—'
    const key = `${ni}\u0000${nf}\u0000${tr}`
    if (!map.has(key)) map.set(key, { key, noInicio: ni, noFinal: nf, tramo: tr, filas: [] })
    map.get(key).filas.push(r)
  }
  return [...map.values()]
}

describe('agruparPorNodosTramo', () => {
  it('agrupa por nodos y tramo', () => {
    const filas = [
      { id: 1, no_inicio: 'A', no_final: 'B', tramo: 'T1', competencia: 'X' },
      { id: 2, no_inicio: 'A', no_final: 'B', tramo: 'T1', competencia: 'Y' },
      { id: 3, no_inicio: 'C', no_final: 'D', tramo: 'T1', competencia: 'X' },
    ]
    const g = agruparPorNodosTramo(filas)
    assert.equal(g.length, 2)
    const ab = g.find((x) => x.noInicio === 'A' && x.noFinal === 'B')
    assert.equal(ab.filas.length, 2)
  })
})
