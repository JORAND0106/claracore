import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  digitosObjetivoCop,
  formatObjetivoCopDisplay,
  parseObjetivoCopNumber,
} from './pptoBuscarObjetivoFormat.js'

describe('formatObjetivoCopDisplay', () => {
  it('formatea en vivo con miles es-CO', () => {
    assert.equal(formatObjetivoCopDisplay('20000000000'), '$ 20.000.000.000')
    assert.equal(formatObjetivoCopDisplay('1250'), '$ 1.250')
    assert.equal(formatObjetivoCopDisplay(''), '')
  })

  it('acepta texto ya formateado o con basura', () => {
    assert.equal(formatObjetivoCopDisplay('$ 20.000.000'), '$ 20.000.000')
    assert.equal(parseObjetivoCopNumber('$ 20.000.000.000'), 20_000_000_000)
  })
})

describe('digitosObjetivoCop / parseObjetivoCopNumber', () => {
  it('normaliza ceros a la izquierda', () => {
    assert.equal(digitosObjetivoCop('00042'), '42')
    assert.equal(parseObjetivoCopNumber('00042'), 42)
  })

  it('vacío → NaN', () => {
    assert.ok(Number.isNaN(parseObjetivoCopNumber('')))
    assert.ok(Number.isNaN(parseObjetivoCopNumber('$')))
  })
})
