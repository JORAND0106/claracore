import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scrollCoordsIntoScrollParents } from './temaEditorScroll.js'

describe('scrollCoordsIntoScrollParents', () => {
  it('no lanza sin coords/fromEl', () => {
    assert.doesNotThrow(() => scrollCoordsIntoScrollParents(null, null))
    assert.doesNotThrow(() => scrollCoordsIntoScrollParents({ top: 0, bottom: 10 }, null))
  })

  it('desplaza un ancestro overflow cuando el caret queda debajo', { skip: typeof window === 'undefined' }, () => {
    const parent = {
      parentElement: null,
      scrollHeight: 500,
      clientHeight: 100,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 200 }),
    }
    const child = { parentElement: parent }
    const orig = window.getComputedStyle
    window.getComputedStyle = () => ({ overflowY: 'auto' })
    try {
      scrollCoordsIntoScrollParents({ top: 90, bottom: 120 }, child, { padding: 20 })
      assert.ok(parent.scrollTop > 0)
    } finally {
      window.getComputedStyle = orig
    }
  })
})
