/**
 * Regresión: ángulo derivado para cierre angular (método coordenadas).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function read(name) {
  return readFileSync(join(dir, name), 'utf8')
}

describe('Ángulo derivado — UI', () => {
  it('Cierre angular muestra etiqueta derivado', () => {
    const src = read('PoligonalCierrePanel.jsx')
    assert.match(src, /angulos_derivados/)
    assert.match(src, /derivado/)
  })

  it('Cartera muestra ángulo de cierre derivado', () => {
    const src = read('PoligonalCalculoTable.jsx')
    assert.match(src, /angulo_derivado_para_cierre/)
    assert.match(src, /angulo_derivado_texto/)
    assert.match(src, /derivado/)
  })

  it('Terminar exige cierre angular cuando está calculado', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /admisible_angular !== false/)
    assert.match(src, /cierre angular está fuera de tolerancia/)
  })
})
