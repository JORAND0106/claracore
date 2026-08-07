import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { imagenDesdePasteEvent } from './pptoPasteImage.js'

describe('imagenDesdePasteEvent', () => {
  it('devuelve File cuando hay image/* en clipboard', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'cap.png', { type: 'image/png' })
    const e = {
      clipboardData: {
        items: [
          { type: 'text/plain', getAsFile: () => null },
          { type: 'image/png', getAsFile: () => file },
        ],
      },
    }
    const out = imagenDesdePasteEvent(e)
    assert.ok(out instanceof File)
    assert.equal(out.type, 'image/png')
  })

  it('devuelve null si no hay imagen', () => {
    assert.equal(imagenDesdePasteEvent({ clipboardData: { items: [] } }), null)
    assert.equal(imagenDesdePasteEvent(null), null)
  })
})
