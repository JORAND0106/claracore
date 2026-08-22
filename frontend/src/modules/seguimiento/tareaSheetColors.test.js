import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TAREA_ROW_HIGHLIGHT, contrasteTextoSobre } from './tareaSheetColors.js'

describe('tareaSheetColors', () => {
  it('define resaltes distintos para tarea y sub-ítem', () => {
    assert.notEqual(TAREA_ROW_HIGHLIGHT.tarea, TAREA_ROW_HIGHLIGHT.subitem)
    assert.notEqual(TAREA_ROW_HIGHLIGHT.tareaSolid, TAREA_ROW_HIGHLIGHT.subitemSolid)
    assert.match(TAREA_ROW_HIGHLIGHT.tarea, /2563eb/)
    assert.match(TAREA_ROW_HIGHLIGHT.subitem, /94a3b8/)
  })

  it('mantiene texto oscuro legible sobre ambos fondos (AA ≥ 4.5)', () => {
    assert.ok(contrasteTextoSobre(TAREA_ROW_HIGHLIGHT.tareaSolid) >= 4.5)
    assert.ok(contrasteTextoSobre(TAREA_ROW_HIGHLIGHT.subitemSolid) >= 4.5)
  })
})
