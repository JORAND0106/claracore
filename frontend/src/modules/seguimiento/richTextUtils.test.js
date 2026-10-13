import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendSintesisTemaHtml,
  htmlToPlainText,
  isRichTextEmpty,
  looksLikeHtml,
  parseSintesisEstructura,
  plainTextToHtml,
  sintesisPlainToHtml,
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

  it('sintesisPlainToHtml genera intro + ol', () => {
    const html = sintesisPlainToHtml(
      'Se trató el drenaje.\n\n1. Refuerzo antes del viernes.\n2. Seguimiento diario.',
    )
    assert.match(html, /<p>Se trató el drenaje\.<\/p>/)
    assert.match(html, /<ol>/)
    assert.match(html, /<li><p>Refuerzo antes del viernes\.<\/p><\/li>/)
    assert.match(html, /Seguimiento diario/)
  })

  it('appendSintesisTemaHtml agrega numerales sin pisar lo previo', () => {
    const prev = sintesisPlainToHtml('Tema drenaje.\n\n1. Primer punto.')
    const next = appendSintesisTemaHtml(prev, 'Continuación.\n\n1. Segundo punto nuevo.')
    const { intro, items } = parseSintesisEstructura(next)
    assert.match(intro, /drenaje/i)
    assert.equal(items.length, 2)
    assert.match(items[0], /Primer punto/)
    assert.match(items[1], /Segundo punto/)
    // Idempotente si el ítem ya está.
    const again = appendSintesisTemaHtml(next, '1. Primer punto.')
    assert.equal(parseSintesisEstructura(again).items.length, 2)
  })
})
