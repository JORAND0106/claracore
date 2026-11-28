/**
 * Regla única Cant. Total: entero / 2 dp / <0.01 sin cero.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  calcularCantidadConRedondeo,
  formatearCantidadTotal,
  redondearCantidadTotalDinamico,
} from './sicoeCantidadRedondeo.js'
import { calcularCantidadVarilla } from './sicoeVarilla.js'

const here = dirname(fileURLToPath(import.meta.url))
const py = readFileSync(join(here, '../../../../backend/sicoe_cantidad_redondeo.py'), 'utf8')
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')

describe('Sicoe — regla única Cant. Total', () => {
  it('ejemplos: entero, decimales, varilla, <0.01', () => {
    assert.equal(calcularCantidadConRedondeo(2, 3, 4, 1), 24)
    assert.equal(formatearCantidadTotal(24, { locale: false }), '24')
    assert.equal(redondearCantidadTotalDinamico(1.567), 1.57)
    assert.equal(calcularCantidadVarilla(6, 0.994, 4), 23.86)
    assert.equal(redondearCantidadTotalDinamico(0.00375), 0.004)
  })

  it('backend documenta la misma regla y endpoint de corrección', () => {
    assert.match(py, /regla única/)
    assert.match(main, /corregir-cantidad-total-redondeo/)
  })
})
