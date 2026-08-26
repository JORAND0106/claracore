/**
 * Tests de helpers del Plano de poligonal (marcadores, nombres, popup).
 * Ejecutar: node --test frontend/src/components/topografia/topoPlanoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  distanciasVecinas,
  estimateLabelBoxPx,
  markerRadiusSvg,
  markerStrokeSvg,
  pickVisibleLabelIndices,
  resolvePlanoLod,
  svgPointToCss,
  textCounterScale,
  MARKER_PX,
} from './topoPlanoLod.js'

describe('resolvePlanoLod (legado, sin uso en vista simplificada)', () => {
  it('sigue resolviendo niveles por si algún consumidor lo usa', () => {
    assert.equal(resolvePlanoLod(1).level, 0)
    assert.equal(resolvePlanoLod(1.8).level, 1)
    assert.equal(resolvePlanoLod(3).level, 2)
  })
})

describe('pickVisibleLabelIndices', () => {
  it('oculta nombres de puntos muy cercanos', () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 105, y: 100 },
      { x: 200, y: 100 },
    ]
    const vis = pickVisibleLabelIndices(pts, 1, 0)
    assert.deepEqual(vis, [true, false, true])
  })
})

describe('textCounterScale', () => {
  it('es inverso al zoom y está acotado', () => {
    assert.ok(Math.abs(textCounterScale(2) - 0.5) < 1e-9)
    assert.equal(textCounterScale(100), 0.35)
    assert.equal(textCounterScale(0.1), 2.2)
  })
})

describe('markerRadiusSvg', () => {
  it('mantiene tamaño de pantalla acotado al hacer zoom', () => {
    const r1 = markerRadiusSvg(1)
    const r4 = markerRadiusSvg(4)
    const r10 = markerRadiusSvg(10)
    assert.ok(r4 < r1)
    assert.ok(r10 < r4)
    const screen = (r, s) => r * s
    assert.ok(screen(r1, 1) >= MARKER_PX.MIN && screen(r1, 1) <= MARKER_PX.MAX)
    assert.ok(screen(r4, 4) >= MARKER_PX.MIN && screen(r4, 4) <= MARKER_PX.MAX)
    assert.ok(markerStrokeSvg(4) < markerStrokeSvg(1))
  })
})

describe('distanciasVecinas', () => {
  const coords = [
    { p: { nombre_punto: 'D1', norte: 0, este: 0 } },
    { p: { nombre_punto: 'D2', norte: 0, este: 100 } },
    { p: { nombre_punto: 'D3', norte: 50, este: 100 } },
  ]

  it('calcula prev/next en poligonal abierta', () => {
    const mid = distanciasVecinas(coords, 1, false)
    assert.equal(mid.prevNombre, 'D1')
    assert.equal(mid.nextNombre, 'D3')
    assert.ok(Math.abs(mid.prev - 100) < 1e-9)
    assert.ok(Math.abs(mid.next - 50) < 1e-9)

    const first = distanciasVecinas(coords, 0, false)
    assert.equal(first.prev, null)
    assert.equal(first.nextNombre, 'D2')
  })

  it('envuelve extremos en poligonal cerrada', () => {
    const first = distanciasVecinas(coords, 0, true)
    assert.equal(first.prevNombre, 'D3')
    assert.equal(first.nextNombre, 'D2')
  })
})

describe('svgPointToCss', () => {
  it('mapea punto del viewBox al contenedor (meet)', () => {
    const pos = svgPointToCss(100, 50, '0 0 200 100', 400, 200)
    assert.ok(Math.abs(pos.left - 200) < 1e-6)
    assert.ok(Math.abs(pos.top - 100) < 1e-6)
  })
})

describe('estimateLabelBoxPx', () => {
  it('estima caja para un nombre', () => {
    const box = estimateLabelBoxPx(['D31'])
    assert.ok(box.w > 10)
    assert.ok(box.h > 10)
  })
})
