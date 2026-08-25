/**
 * Regresión: Plano de poligonal con zoom táctil (pinch).
 * Ejecutar: node --test frontend/src/components/topografia/poligonalGraficoPinch.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const grafico = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')
const hook = readFileSync(join(dir, 'useTopoViewportGestures.js'), 'utf8')

describe('PoligonalGrafico pinch-to-zoom', () => {
  it('usa el hook de gestos de viewport', () => {
    assert.match(grafico, /useTopoViewportGestures/)
    assert.match(grafico, /pellizcar/)
    assert.match(grafico, /resetVista/)
    assert.match(grafico, /touchAction:\s*'none'|containerStyle/)
  })

  it('el hook detecta pinch (2 dedos) y pan (1 dedo)', () => {
    assert.match(hook, /mode:\s*'pinch'/)
    assert.match(hook, /mode:\s*'pan'/)
    assert.match(hook, /touchmove/)
    assert.match(hook, /passive:\s*false/)
    assert.match(hook, /touchAction:\s*'none'/)
    assert.match(hook, /applyZoomAtClient/)
  })

  it('el zoom usa viewBox vectorial, no CSS scale', () => {
    assert.match(hook, /viewBoxFromPanScale/)
    assert.doesNotMatch(hook, /transform:\s*`translate\(\$\{pan\.x\}px/)
    assert.match(grafico, /\bviewBox=\{viewBox\}/)
    assert.doesNotMatch(grafico, /transform:\s*`translate\(\$\{pan/)
  })
})
