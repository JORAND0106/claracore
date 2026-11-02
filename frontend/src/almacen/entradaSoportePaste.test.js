import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
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
  })

  it('UI cablea Ctrl+V y hint de pegado', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const picker = readFileSync(join(dir, 'EntradaSoportePicker.jsx'), 'utf8')
    assert.match(wiz, /onPasteSoporte/)
    assert.match(wiz, /fileFromClipboardEvent/)
    assert.match(wiz, /resolvePasteTarget/)
    assert.match(wiz, /entrada-tablet-paste-hint/)
    assert.match(picker, /Ctrl\+V/)
    assert.match(picker, /entrada-soporte-\$\{kind\}-pegar-hint/)
  })
})
