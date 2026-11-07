import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createNoteHistory, matchUndoRedoKeys } from './blocNotasHistory.js'

describe('bloc · deshacer / rehacer', () => {
  it('deshace y rehace título y cuerpo', () => {
    const h = createNoteHistory({ coalesceMs: 0 })
    const n1 = { id: 'a', title: 'Uno', body: { richHtml: '<p>1</p>', strokes: [] } }
    const n2 = { id: 'a', title: 'Dos', body: { richHtml: '<p>2</p>', strokes: [] } }
    const n3 = { id: 'a', title: 'Tres', body: { richHtml: '<p>3</p>', strokes: [{ id: 's1' }] } }
    h.pushBeforeChange(n1)
    h.pushBeforeChange(n2)
    assert.equal(h.canUndo(), true)
    const u1 = h.undo(n3)
    assert.equal(u1.title, 'Dos')
    assert.equal(u1.body.richHtml, '<p>2</p>')
    const u2 = h.undo(u1)
    assert.equal(u2.title, 'Uno')
    const r1 = h.redo(u2)
    assert.equal(r1.title, 'Dos')
  })

  it('atajos Ctrl/Cmd Z Y y Shift+Z', () => {
    assert.equal(matchUndoRedoKeys({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false }), 'undo')
    assert.equal(matchUndoRedoKeys({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false }), 'undo')
    assert.equal(matchUndoRedoKeys({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false }), 'redo')
    assert.equal(matchUndoRedoKeys({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: true }), 'redo')
    assert.equal(matchUndoRedoKeys({ key: 'a', ctrlKey: true }), null)
  })
})
