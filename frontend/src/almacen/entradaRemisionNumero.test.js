import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  formatRemisionNumeroInput,
  normalizeRemisionNumero,
  remisionNumeroOk,
} from './entradaRemisionNumero.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('entradaRemisionNumero', () => {
  it('normaliza mayúsculas y quita espacios', () => {
    assert.equal(normalizeRemisionNumero(' rem-100 '), 'REM-100')
    assert.equal(normalizeRemisionNumero('AB 12'), 'AB12')
    assert.equal(normalizeRemisionNumero(''), '')
  })

  it('formatea input permitiendo letras, números y guiones', () => {
    assert.equal(formatRemisionNumeroInput('rem-12a!'), 'REM-12A')
    assert.equal(remisionNumeroOk('  '), false)
    assert.equal(remisionNumeroOk('R-1'), true)
  })

  it('UI tablet cablea campo visible, FormData y aviso duplicado', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(wiz, /entrada-tablet-numero-remision/)
    assert.match(wiz, /N\.º de remisión/)
    assert.match(wiz, /numeroRemisionListo/)
    assert.match(wiz, /numero_documento/)
    assert.match(wiz, /checkEntradaNumeroRemision/)
    assert.match(wiz, /entrada-tablet-resumen-numero-remision/)
    assert.match(wiz, /focusNumeroRemision/)
    assert.match(api, /check-numero-remision/)
    assert.match(api, /checkEntradaNumeroRemision/)
  })
})
