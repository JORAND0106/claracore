/**
 * Pegado masivo (Excel) en cartera de campo — cableado UI.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaPasteCartera.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Cartera de campo — pegado masivo desde Excel', () => {
  it('importa helpers de parseo y distribución de columna', () => {
    assert.match(formSrc, /parseClipboardColumn/)
    assert.match(formSrc, /aplicarPasteColumna/)
    assert.match(formSrc, /esPasteMasivo/)
  })

  it('captura onPaste en celdas editables de la cartera', () => {
    assert.match(formSrc, /onPasteCartera/)
    assert.match(formSrc, /onPaste=\{\(e\) => onPasteCartera\(idx, k, e\)\}/)
  })

  it('cubre Abscisa, Terreno Natural, nivel y Cota Fondo Excavación', () => {
    assert.match(formSrc, /\['abscisa', 'terreno_natural'/)
    assert.match(formSrc, /cota_fondo_excavacion/)
    assert.match(formSrc, /onPaste=\{\(e\) => onPasteCartera\(idx, k, e\)\}/)
  })
})
