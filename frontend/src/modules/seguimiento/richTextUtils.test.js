import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  htmlToPlainText,
  isRichTextEmpty,
  looksLikeHtml,
  plainTextToHtml,
} from './richTextUtils.js'

describe('richTextUtils', () => {
  it('detecta HTML', () => {
    assert.equal(looksLikeHtml('<p>x</p>'), true)
    assert.equal(looksLikeHtml('texto plano'), false)
  })

  it('convierte plano a HTML', () => {
    const html = plainTextToHtml('Hola\n\nMundo')
    assert.match(html, /<p>/)
    assert.match(html, /Hola/)
    assert.match(html, /Mundo/)
  })

  it('plano vacío', () => {
    assert.equal(isRichTextEmpty('<p></p>'), true)
    assert.equal(isRichTextEmpty('<p><br></p>'), true)
    assert.equal(isRichTextEmpty('<p>Hola</p>'), false)
  })

  it('html a plano (sin DOM)', () => {
    const t = htmlToPlainText('<p><strong>Hola</strong> mundo</p>')
    assert.match(t, /Hola/)
    assert.match(t, /mundo/)
    assert.doesNotMatch(t, /</)
  })
})
