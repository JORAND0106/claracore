import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  imagenDesdePasteEvent,
  urlPareceImagen,
} from './validacionAdjuntoHelpers.js'

describe('validacionAdjuntoHelpers', () => {
  it('imagenDesdePasteEvent extrae File de image/*', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'cap.png', { type: 'image/png' })
    const e = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    }
    const out = imagenDesdePasteEvent(e)
    assert.ok(out)
    assert.equal(out.type, 'image/png')
    assert.match(out.name, /\.png$/i)
  })

  it('imagenDesdePasteEvent ignora texto', () => {
    const e = {
      clipboardData: {
        items: [{ type: 'text/plain', getAsFile: () => null }],
      },
    }
    assert.equal(imagenDesdePasteEvent(e), null)
  })

  it('urlPareceImagen reconoce extensiones y mime', () => {
    assert.equal(urlPareceImagen('https://x/a.PNG?v=1'), true)
    assert.equal(urlPareceImagen('https://x/a.pdf'), false)
    assert.equal(urlPareceImagen('https://x/sin', 'image/jpeg'), true)
  })
})
