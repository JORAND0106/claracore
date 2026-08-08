import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { imagenDesdePasteEvent, imagenDesdeClipboard } from './pptoPasteImage.js'

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

describe('imagenDesdeClipboard', () => {
  let prevDesc

  beforeEach(() => {
    prevDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  })

  afterEach(() => {
    if (prevDesc) {
      Object.defineProperty(globalThis.navigator, 'clipboard', prevDesc)
    } else {
      try {
        delete globalThis.navigator.clipboard
      } catch {
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          configurable: true,
          value: undefined,
        })
      }
    }
  })

  it('lanza si clipboard.read no está disponible', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    await assert.rejects(() => imagenDesdeClipboard(), (err) => err?.code === 'clipboard-read-unsupported')
  })

  it('devuelve File cuando clipboard.read tiene image/*', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => ([
          {
            types: ['image/png'],
            getType: async () => blob,
          },
        ]),
      },
    })
    const out = await imagenDesdeClipboard()
    assert.ok(out instanceof File)
    assert.equal(out.type, 'image/png')
  })

  it('devuelve null si no hay imagen en el portapapeles', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => ([{ types: ['text/plain'], getType: async () => new Blob(['a']) }]),
      },
    })
    assert.equal(await imagenDesdeClipboard(), null)
  })
})
