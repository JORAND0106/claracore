import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseColWidthAttr } from './temaTableWidth.js'

describe('temaTableWidth', () => {
  it('parseColWidthAttr acepta array, csv y vacío', () => {
    assert.equal(parseColWidthAttr([120]), 120)
    assert.equal(parseColWidthAttr('90,40'), 90)
    assert.equal(parseColWidthAttr(null), null)
    assert.equal(parseColWidthAttr(''), null)
    assert.equal(parseColWidthAttr('abc'), null)
  })
})
