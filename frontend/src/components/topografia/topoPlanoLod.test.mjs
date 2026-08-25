/**
 * Regresión LOD del Plano de poligonal.
 * Ejecutar: node --test frontend/src/components/topografia/topoPlanoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  pickVisibleLabelIndices,
  resolvePlanoLod,
  textCounterScale,
} from './topoPlanoLod.js'

describe('resolvePlanoLod', () => {
  it('zoom bajo: solo nombres', () => {
    const lod = resolvePlanoLod(1)
    assert.equal(lod.level, 0)
    assert.equal(lod.showDistancias, false)
    assert.equal(lod.showAngulos, false)
    assert.equal(lod.showCoords, false)
  })

  it('zoom medio: nombres + distancias', () => {
    const lod = resolvePlanoLod(1.8)
    assert.equal(lod.level, 1)
    assert.equal(lod.showDistancias, true)
    assert.equal(lod.showAngulos, false)
  })

  it('zoom alto: nombres + distancias + ángulos + coords', () => {
    const lod = resolvePlanoLod(3)
    assert.equal(lod.level, 2)
    assert.equal(lod.showDistancias, true)
    assert.equal(lod.showAngulos, true)
    assert.equal(lod.showCoords, true)
  })
})

describe('pickVisibleLabelIndices', () => {
  it('oculta etiquetas de puntos muy cercanos en zoom bajo', () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 105, y: 100 }, // ~5 unidades SVG; a scale=1 quedan ~5px → ocultar
      { x: 200, y: 100 },
    ]
    const vis = pickVisibleLabelIndices(pts, 1, 0)
    assert.deepEqual(vis, [true, false, true])
  })

  it('con 25 puntos amontonados en zoom bajo no muestra todas las etiquetas', () => {
    const pts = []
    for (let i = 0; i < 25; i += 1) {
      pts.push({ x: 100 + (i % 5) * 4, y: 100 + Math.floor(i / 5) * 4 })
    }
    const vis = pickVisibleLabelIndices(pts, 1, 0)
    const shown = vis.filter(Boolean).length
    assert.ok(shown < 25, `esperaba declutter, mostró ${shown}/25`)
    assert.ok(shown >= 1)
    const visZoom = pickVisibleLabelIndices(pts, 10, 2)
    assert.ok(visZoom.filter(Boolean).length > shown)
  })
})

describe('textCounterScale', () => {
  it('es inverso al zoom y está acotado', () => {
    assert.ok(Math.abs(textCounterScale(2) - 0.5) < 1e-9)
    assert.equal(textCounterScale(100), 0.35)
    assert.equal(textCounterScale(0.1), 2.2)
  })
})
