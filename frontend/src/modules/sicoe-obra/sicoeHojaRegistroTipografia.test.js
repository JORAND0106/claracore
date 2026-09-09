/**
 * Guardrail: HojaRegistro no debe fijar fontSize en px/número en modo excel.
 * La tipografía debe venir de var(--cc-*).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CLARA_FONT_KEYS } from '../../typographyScale.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const appJsx = readFileSync(join(root, 'App.jsx'), 'utf8')

function hojaRegistroSource() {
  const start = appJsx.indexOf('function HojaRegistro')
  assert.ok(start >= 0, 'HojaRegistro no encontrado')
  const end = appJsx.indexOf('\nfunction ', start + 10)
  assert.ok(end > start, 'fin de HojaRegistro no encontrado')
  return appJsx.slice(start, end)
}

describe('HojaRegistro tipografía global', () => {
  it('expone los 3 tamaños de plataforma', () => {
    assert.deepEqual(CLARA_FONT_KEYS, ['pequena', 'normal', 'grande'])
  })

  it('labSt / inpSt / secTitleSt usan --cc-* sin ternario excel', () => {
    const src = hojaRegistroSource()
    assert.match(src, /const labSt = \{[\s\S]*?fontSize:\s*'var\(--cc-caption\)'/)
    assert.match(src, /const inpSt = \{[\s\S]*?fontSize:\s*'var\(--cc-input\)'/)
    assert.match(src, /const roBoxSt = \{[\s\S]*?fontSize:\s*'var\(--cc-sm\)'/)
    assert.match(src, /const secTitleSt[\s\S]*?fontSize:\s*'var\(--cc-label\)'/)
    assert.equal(src.includes('fontSize: excel ?'), false)
  })

  it('no deja fontSize numérico fijo en el formulario', () => {
    const src = hojaRegistroSource()
    const bare = src.match(/fontSize:\s*\d+/g) || []
    assert.equal(bare.length, 0, `fontSize numéricos: ${bare}`)
  })
})
