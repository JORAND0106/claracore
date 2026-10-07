/**
 * UI Resumen/Descuentos: cantidad = PRODUCT(dims a 2 dec).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaPresentacion2dec.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cantidadDesdeDims } from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Presentación 2 dec — Resumen y Descuentos', () => {
  it('90 × 0.009 (visto 0.01) = 0.90', () => {
    assert.equal(cantidadDesdeDims(90, null, 0.009), 0.9)
    assert.equal(cantidadDesdeDims(90, 1, 0.009), 0.9)
  })

  it('Form recalcula cantidad desde dims en Resumen y Descuentos (no solo editables)', () => {
    assert.match(formSrc, /Cantidad = PRODUCT\(dims a 2 dec\)/)
    assert.match(formSrc, /Descuentos Específicos: siempre PRODUCT/)
    assert.match(formSrc, /fmtResumenCantidades\(displayCantDesc\(d\)\)/)
    assert.doesNotMatch(formSrc, /esOtrosDesc \? displayCantDesc\(d\) : d\.cantidad/)
  })
})
