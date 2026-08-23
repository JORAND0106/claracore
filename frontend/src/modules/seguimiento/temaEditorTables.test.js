import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEnsureEditableAfterTablesTransaction,
  needsEditableAfterTable,
} from './temaEditorTables.js'

function node(name, opts = {}) {
  return {
    type: { name },
    nodeSize: opts.nodeSize ?? 10,
    isTextblock: !!opts.isTextblock,
  }
}

function docOf(...children) {
  return {
    childCount: children.length,
    child: (i) => children[i],
  }
}

describe('needsEditableAfterTable', () => {
  it('false si no hay tablas', () => {
    assert.equal(needsEditableAfterTable(docOf(node('paragraph', { isTextblock: true }))), false)
  })

  it('true si la tabla es el último nodo', () => {
    assert.equal(
      needsEditableAfterTable(docOf(
        node('paragraph', { isTextblock: true }),
        node('table'),
      )),
      true,
    )
  })

  it('true si hay dos tablas seguidas', () => {
    assert.equal(
      needsEditableAfterTable(docOf(node('table'), node('table'))),
      true,
    )
  })

  it('false si ya hay párrafo después', () => {
    assert.equal(
      needsEditableAfterTable(docOf(
        node('table'),
        node('paragraph', { isTextblock: true }),
      )),
      false,
    )
  })
})

describe('buildEnsureEditableAfterTablesTransaction', () => {
  it('null sin schema/paragraph', () => {
    assert.equal(buildEnsureEditableAfterTablesTransaction(null), null)
    assert.equal(buildEnsureEditableAfterTablesTransaction({ doc: docOf(), schema: {} }), null)
  })

  it('inserta párrafos tras tablas sin textblock siguiente', () => {
    const inserted = []
    const paragraph = {
      create: () => ({ type: { name: 'paragraph' }, __fake: true }),
    }
    const children = [node('table', { nodeSize: 20 }), node('table', { nodeSize: 20 })]
    const doc = {
      childCount: 2,
      child: (i) => children[i],
      content: { size: 40 },
    }
    const state = {
      doc,
      schema: { nodes: { paragraph } },
      tr: {
        insert(pos, n) {
          inserted.push({ pos, name: n.type.name })
          return this
        },
      },
    }
    const tr = buildEnsureEditableAfterTablesTransaction(state)
    assert.ok(tr)
    // De atrás hacia adelante: tras 2ª tabla (pos 40) y tras 1ª (pos 20)
    assert.deepEqual(inserted, [
      { pos: 40, name: 'paragraph' },
      { pos: 20, name: 'paragraph' },
    ])
  })

  it('no inserta si ya hay textblock', () => {
    const paragraph = { create: () => ({ type: { name: 'paragraph' } }) }
    const doc = docOf(node('table'), node('paragraph', { isTextblock: true, nodeSize: 5 }))
    // Ajustar nodeSize del table
    doc.child = (i) => (i === 0
      ? node('table', { nodeSize: 20 })
      : node('paragraph', { isTextblock: true, nodeSize: 5 }))
    const state = {
      doc,
      schema: { nodes: { paragraph } },
      tr: {
        insert() {
          throw new Error('no debería insertar')
        },
      },
    }
    assert.equal(buildEnsureEditableAfterTablesTransaction(state), null)
  })
})
