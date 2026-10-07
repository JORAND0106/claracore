/**
 * Planilla sellada: no recalcular en vivo; usar cálculo del backend (snapshot).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaSnapshotSello.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Planilla tubería — snapshot de sello en UI', () => {
  it('sellada incluye N2 Aprobado y no dispara calculoLocal', () => {
    assert.match(formSrc, /nivel2_estado.*Aprobado/)
    assert.match(formSrc, /if \(sellada \|\| modoSoloLectura\) return null/)
    assert.match(formSrc, /if \(sellada\) return calculo \|\| null/)
  })
})
