/**
 * Regresión: Plano de poligonal usa LOD de etiquetas.
 * Ejecutar: node --test frontend/src/components/topografia/poligonalGraficoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')

describe('PoligonalGrafico LOD', () => {
  it('integra resolvePlanoLod, counter-scale y declutter', () => {
    assert.match(src, /resolvePlanoLod/)
    assert.match(src, /pickVisibleLabelIndices/)
    assert.match(src, /textCounterScale|ScreenText/)
    assert.match(src, /showCoords/)
    assert.match(src, /Detalle:/)
  })

  it('sigue usando el viewport táctil (scale del hook)', () => {
    assert.match(src, /useTopoViewportGestures/)
    assert.match(src, /\bscale\b/)
  })
})
