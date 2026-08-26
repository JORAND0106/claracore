/**
 * Regresión LOD / marcadores / anti-colisión del Plano de poligonal.
 * Ejecutar: node --test frontend/src/components/topografia/topoPlanoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  estimateLabelBoxPx,
  labelBoxToSvgAabb,
  markerRadiusSvg,
  markerStrokeSvg,
  pickVisibleLabelIndices,
  placePointLabels,
  resolvePlanoLod,
  textCounterScale,
  MARKER_PX,
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

describe('markerRadiusSvg', () => {
  it('mantiene tamaño de pantalla acotado al hacer zoom', () => {
    const r1 = markerRadiusSvg(1)
    const r4 = markerRadiusSvg(4)
    const r10 = markerRadiusSvg(10)
    // Radio SVG decrece con el zoom
    assert.ok(r4 < r1)
    assert.ok(r10 < r4)
    // Tamaño en pantalla ≈ r * scale, dentro de [MIN, MAX]
    const screen = (r, s) => r * s
    assert.ok(screen(r1, 1) >= MARKER_PX.MIN && screen(r1, 1) <= MARKER_PX.MAX)
    assert.ok(screen(r4, 4) >= MARKER_PX.MIN && screen(r4, 4) <= MARKER_PX.MAX)
    assert.ok(screen(r10, 10) >= MARKER_PX.MIN && screen(r10, 10) <= MARKER_PX.MAX)
  })

  it('stroke también se contrae con el zoom', () => {
    assert.ok(markerStrokeSvg(4) < markerStrokeSvg(1))
  })
})

describe('placePointLabels', () => {
  it('desplaza anclas cuando puntos están muy cerca (cluster D1/D31/D30)', () => {
    const scale = 4
    const items = [
      { x: 200, y: 200, lines: ['D1', "314°56'55\"", 'N 1234.56', 'E 5678.90'] },
      { x: 206, y: 203, lines: ['D31', "45°10'00\"", 'N 1235.01', 'E 5679.20'] },
      { x: 212, y: 198, lines: ['D30', "90°00'00\"", 'N 1236.00', 'E 5680.00'] },
    ]
    const placed = placePointLabels(items, { scale, lodLevel: 2 })
    const ok = placed.filter(Boolean)
    assert.ok(ok.length >= 2, `esperaba al menos 2 etiquetas colocadas, got ${ok.length}`)

    // Anclas no todas idénticas (hubo desplazamiento)
    const keys = ok.map((p) => `${p.dx},${p.dy},${p.textAnchor}`)
    assert.ok(new Set(keys).size >= 2, `esperaba anclas distintas: ${keys.join(' | ')}`)

    // Cajas no se solapan
    for (let i = 0; i < ok.length; i += 1) {
      for (let j = i + 1; j < ok.length; j += 1) {
        const a = ok[i].box
        const b = ok[j].box
        const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
        assert.equal(overlap, false, `solape entre ${ok[i].lines[0]} y ${ok[j].lines[0]}`)
      }
    }
  })

  it('en conflicto extremo puede degradar a solo nombre', () => {
    const scale = 5
    const items = [
      { x: 100, y: 100, lines: ['A', 'ang', 'N 1', 'E 2', 'Z 3'] },
      { x: 101, y: 100, lines: ['B', 'ang', 'N 1', 'E 2', 'Z 3'] },
      { x: 100, y: 101, lines: ['C', 'ang', 'N 1', 'E 2', 'Z 3'] },
      { x: 101, y: 101, lines: ['D', 'ang', 'N 1', 'E 2', 'Z 3'] },
    ]
    const placed = placePointLabels(items, { scale, lodLevel: 2 })
    const withBody = placed.filter((p) => p && p.lines.length > 1).length
    const nameOnly = placed.filter((p) => p && p.lines.length === 1).length
    assert.ok(withBody + nameOnly >= 1)
    // Al menos alguna degradación o menos de 4 bloques completos
    assert.ok(withBody < 4 || nameOnly >= 1)
  })
})

describe('estimateLabelBoxPx / labelBoxToSvgAabb', () => {
  it('estima caja y la proyecta a SVG', () => {
    const box = estimateLabelBoxPx(['D31', "314°56'55\"", 'N 1.00'])
    assert.ok(box.w > 40)
    assert.ok(box.h > 20)
    const aabb = labelBoxToSvgAabb(100, 100, { dx: 8, dy: -4, anchor: 'start' }, box, 2)
    assert.ok(aabb.right > aabb.left)
    assert.ok(aabb.bottom > aabb.top)
  })
})
