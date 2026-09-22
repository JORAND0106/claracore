/**
 * Reproduce el abanico de líneas: simula el ciclo redraw(extraDraft)
 * exactamente como EsquemaEditorModal lo hace al arrastrar una línea.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { partitionBackgroundFirst } from './esquemaZOrder.js'

function simulateDrawMoves(objectsRef, moveCount) {
  // Igual que redraw(): lista de dibujo + push del draft de preview.
  for (let i = 0; i < moveCount; i += 1) {
    const draft = {
      id: 'draft-line',
      type: 'linea',
      x1: 100,
      y1: 100,
      x2: 100 + i * 3,
      y2: 100 + i * 2,
    }
    const list = [...partitionBackgroundFirst(objectsRef.current)]
    list.push(draft)
    // Solo se dibuja `list`; objectsRef no debe crecer.
    void list
  }
  return objectsRef.current
}

describe('aislamiento draft de preview (anti-abanico)', () => {
  it('N movimientos de cursor no acumulan líneas en la escena', () => {
    const objectsRef = { current: [] }
    const after = simulateDrawMoves(objectsRef, 40)
    assert.equal(after.length, 0)
  })

  it('con geometría previa, los drafts de preview tampoco se acumulan', () => {
    const objectsRef = {
      current: [
        { id: 'l1', type: 'linea', x1: 0, y1: 0, x2: 50, y2: 0 },
      ],
    }
    const after = simulateDrawMoves(objectsRef, 25)
    assert.equal(after.length, 1)
    assert.equal(after[0].id, 'l1')
  })

  it('el bug histórico (misma referencia + push) sí ensuciaba la escena', () => {
    // Documenta la causa raíz: devolver `list` sin copiar + push(draft).
    const scene = []
    const buggyPartition = (objects) => {
      const list = Array.isArray(objects) ? objects : []
      const bg = list.filter((o) => o?.type === 'image')
      const rest = list.filter((o) => o?.type !== 'image')
      return bg.length ? [...bg, ...rest] : list // ← bug
    }
    for (let i = 0; i < 12; i += 1) {
      const draft = { id: `d${i}`, type: 'linea', x1: 0, y1: 0, x2: i, y2: i }
      const drawList = buggyPartition(scene)
      drawList.push(draft)
    }
    assert.equal(scene.length, 12, 'sin la copia, cada preview quedaba permanente')
  })
})
