import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  fileFromClipboardApi,
  fileFromClipboardEvent,
  MSG_PEGADO_VACIO,
  resolvePasteTarget,
  validateSoportePaste,
} from './entradaSoportePaste.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('entradaSoportePaste', () => {
  it('resuelve destino: foco, luego primera que falta', () => {
    assert.equal(
      resolvePasteTarget({ focusedKind: 'material', hasRemision: false, hasMaterial: false }).which,
      'material',
    )
    assert.equal(
      resolvePasteTarget({ focusedKind: null, hasRemision: false, hasMaterial: false }).which,
      'remision',
    )
    assert.equal(
      resolvePasteTarget({ focusedKind: null, hasRemision: true, hasMaterial: false }).label,
      'Foto del descargue',
    )
    assert.equal(
      resolvePasteTarget({ focusedKind: null, hasRemision: true, hasMaterial: true }).replaced,
      true,
    )
  })

  it('valida formatos por soporte', () => {
    const img = { type: 'image/png', name: 'a.png', size: 10 }
    const pdf = { type: 'application/pdf', name: 'r.pdf', size: 10 }
    assert.equal(validateSoportePaste(img, 'remision').ok, true)
    assert.equal(validateSoportePaste(pdf, 'remision').ok, true)
    assert.equal(validateSoportePaste(pdf, 'material').ok, false)
    assert.equal(validateSoportePaste(img, 'material').ok, true)
    assert.match(validateSoportePaste({ type: 'text/plain', name: 'x.txt', size: 1 }, 'remision').message, /imagen o PDF/i)
    assert.match(validateSoportePaste(null, 'remision').message, /Archivos|Galería/i)
    assert.equal(validateSoportePaste(null, 'remision').ok, false)
    assert.match(MSG_PEGADO_VACIO, /Archivos/)
  })

  it('fileFromClipboardEvent lee files e items', () => {
    const blob = new File([new Uint8Array([1, 2, 3])], 'cap.png', { type: 'image/png' })
    assert.equal(
      fileFromClipboardEvent({ clipboardData: { files: [blob], items: [] } })?.name,
      'cap.png',
    )
    assert.equal(
      fileFromClipboardEvent({
        clipboardData: {
          files: [],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => blob }],
        },
      })?.size,
      3,
    )
    assert.equal(fileFromClipboardEvent({ clipboardData: null }), null)
    assert.equal(fileFromClipboardEvent({ clipboardData: { files: [], items: [] } }), null)
  })

  it('fileFromClipboardApi: sin API, permiso denegado e imagen ok', async () => {
    const prev = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
      writable: true,
    })
    let r = await fileFromClipboardApi()
    assert.equal(r.ok, false)
    assert.match(r.message, /no permite leer|Galería|Archivo/i)

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: {} },
      writable: true,
    })
    r = await fileFromClipboardApi()
    assert.equal(r.ok, false)
    assert.match(r.message, /Pegar aquí|Galería|Archivo/i)

    const pngBlob = new Blob([new Uint8Array([9, 9])], { type: 'image/png' })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          read: async () => [{
            types: ['image/png'],
            getType: async () => pngBlob,
          }],
        },
      },
      writable: true,
    })
    r = await fileFromClipboardApi()
    assert.equal(r.ok, true)
    assert.equal(r.file.type, 'image/png')
    assert.match(r.file.name, /pegado\.png/)

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          read: async () => {
            const err = new Error('denied')
            err.name = 'NotAllowedError'
            throw err
          },
        },
      },
      writable: true,
    })
    r = await fileFromClipboardApi()
    assert.equal(r.ok, false)
    assert.match(r.message, /permiso|Pegar aquí|Galería/i)

    if (prev === undefined) {
      delete globalThis.navigator
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: prev,
        writable: true,
      })
    }
  })

  it('UI cablea botón Pegar + zona Pegar aquí + Ctrl/Cmd+V en dialog', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const picker = readFileSync(join(dir, 'EntradaSoportePicker.jsx'), 'utf8')
    assert.match(wiz, /onPasteSoporte/)
    assert.match(wiz, /onPasteEnSoporte/)
    assert.match(wiz, /fileFromClipboardEvent/)
    assert.match(wiz, /resolvePasteTarget/)
    assert.match(wiz, /onPasteFile/)
    // Anti-regresión 06204a05: no fusionar botón Pegar con la zona del sistema.
    assert.match(picker, /Pegar aquí/)
    assert.match(picker, /entrada-soporte-\$\{kind\}-pegar-zona/)
    assert.match(picker, /entrada-soporte-\$\{kind\}-pegar/)
    assert.match(picker, /contentEditable/)
    assert.match(picker, /fileFromClipboardApi/)
    assert.match(picker, /onPasteFile/)
    assert.match(picker, /handleZonePaste/)
    assert.match(picker, /handlePegarClick/)
    // La zona NO debe llamar clipboard.read al hacer click (solo enfocar).
    const zonaStart = picker.indexOf('entrada-soporte-${kind}-pegar-zona')
    const zonaBlock = picker.slice(zonaStart, zonaStart + 900)
    assert.match(zonaBlock, /pasteZoneRef\.current\?\.focus/)
    assert.doesNotMatch(zonaBlock, /handlePegarClick/)
    // El botón Pegar sí usa la Clipboard API.
    assert.match(picker, /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)\s*void handlePegarClick\(\)/)
    // Dialog ignora solo la zona (no el botón), para que Ctrl+V siga vivo.
    assert.match(wiz, /data-testid\$="-pegar-zona"/)
    assert.doesNotMatch(wiz, /data-testid\$="-pegar"\]/)
  })

  it('anti-regresión: Remisión acepta imagen y PDF; Descargue solo imagen', () => {
    const img = { type: 'image/jpeg', name: 'cap.jpg', size: 20 }
    const pdf = { type: 'application/pdf', name: 'rem.pdf', size: 20 }
    assert.equal(validateSoportePaste(img, 'remision').ok, true)
    assert.equal(validateSoportePaste(pdf, 'remision').ok, true)
    assert.equal(validateSoportePaste(pdf, 'material').ok, false)
    assert.equal(validateSoportePaste(img, 'material').ok, true)
  })

  it('anti-regresión: pegado vacío y mismo destino resuelto muestran aviso usable', () => {
    assert.match(MSG_PEGADO_VACIO, /Archivo|Galería/i)
    const t = resolvePasteTarget({ focusedKind: 'remision', hasRemision: true, hasMaterial: false })
    assert.equal(t.which, 'remision')
    assert.equal(t.replaced, true)
  })
})
